import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.api.deps import get_current_user, check_role
from app.models.user import User
from app.models.conversation import AIMessage
from app.models.report import DailyReport
from app.models.document import Document, DocumentChunk
from app.repositories.conversation import ConversationRepository
from app.repositories.document import DocumentRepository
from app.schemas.ai import AIQueryRequest, AIMessageResponse, AIConversationResponse, AIConversationDetailResponse

# New architecture imports
from app.services.intent_classifier import (
    IntentClassifier, IntentCategory, StaticIntent,
    intent_classifier
)
from app.services.business_query_executor import business_executor

router = APIRouter()


# ─────────────────────────────────────────────
# Static Response Handlers
# ─────────────────────────────────────────────

def _get_static_response(intent: str) -> str:
    """Return hardcoded responses for static intents."""
    from datetime import datetime

    if intent == StaticIntent.OUT_OF_DOMAIN:
        return (
            "I am the Pothys AGM AI Assistant. My responses are restricted to Pothys business operations. "
            "I can only assist with branch operations, reports, meetings, sales and business insights."
        )
    elif intent == StaticIntent.IDENTITY:
        return (
            "I am the Pothys AGM AI Assistant. I assist AGM executives with branch operations, "
            "reports, meetings, sales insights and operational decision support."
        )
    elif intent == StaticIntent.GREETING:
        hour = datetime.now().hour
        time_of_day = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
        return f"Good {time_of_day}, Sir. How can I assist you today?"
    elif intent == StaticIntent.HELP:
        return (
            "I am the Pothys AGM AI Assistant. I can assist you with the following business queries:\n\n"
            "• **Reports**: Check today's report status across all branches.\n"
            "• **Branch Report**: View a specific branch's full daily report.\n"
            "• **Sales & Revenue**: Check today's sales or compare branches.\n"
            "• **Attendance**: Check how many staff members are present.\n"
            "• **Alerts**: Find today's operational alerts or issues.\n"
            "• **Complaints**: View customer complaints across branches.\n"
            "• **Remarks**: Get the latest remarks from branch managers.\n"
            "• **Meetings**: Retrieve scheduled corporate or branch meetings.\n"
            "• **Tasks**: Trace pending or completed action items.\n"
            "• **Top Performer**: Find today's highest performing executive.\n"
            "• **Top Branch**: Find the branch with the highest revenue."
        )
    return "I'm sorry, I could not understand your query."


@router.post("/query", response_model=AIMessageResponse)
async def query_copilot(
    payload: AIQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM", "MANAGER"]))
):
    """
    AI Copilot Chat Query — New Architecture.

    Flow:
      1. IntentClassifier.classify(query)
      2a. BUSINESS → BusinessQueryExecutor (PostgreSQL → JSON → LLM format)
      2b. KNOWLEDGE → RAG Pipeline (embedding → vector search → LLM)
      2c. STATIC → Hardcoded response
    """
    conv_repo = ConversationRepository(db)

    # 1. Resolve or create chat conversation thread
    if payload.conversation_id:
        conversation = await conv_repo.get_conversation(payload.conversation_id)
        if not conversation or conversation.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation thread not found"
            )
    else:
        title = payload.content[:50] + "..." if len(payload.content) > 50 else payload.content
        conversation = await conv_repo.create_conversation(current_user.id, title)

    # Save user query message to DB
    await conv_repo.create_message(
        conversation_id=conversation.id,
        role="user",
        content=payload.content
    )

    # 2. Classify the intent FIRST — before any embedding or vector search
    category, intent, branch_name = intent_classifier.classify(payload.content)
    print(f"[AI_ROUTE] Category: {category} | Intent: {intent} | Branch: {branch_name}")

    answer = ""
    citations = []

    # 3. Route based on category
    if category == IntentCategory.STATIC:
        # ── STATIC: No DB, no RAG ──
        answer = _get_static_response(intent)

    elif category == IntentCategory.BUSINESS:
        # ── BUSINESS: PostgreSQL → Structured JSON → LLM Format ──
        # No embedding. No vector search. No RAG.
        answer = await business_executor.execute(
            intent=intent,
            query=payload.content,
            db=db,
            branch_name=branch_name,
            current_user=current_user,
        )

    elif category == IntentCategory.KNOWLEDGE:
        # ── KNOWLEDGE: RAG Pipeline (for SOPs, policies, manuals) ──
        try:
            from app.services.rag_engine import rag_engine
            query_vector = await rag_engine.get_embedding(payload.content)

            doc_repo = DocumentRepository(db)
            raw_chunks = await doc_repo.semantic_search(query_vector=query_vector, limit=8)

            # Apply branch filtering for managers
            context_chunks = []
            for chunk in raw_chunks:
                if current_user.role == "MANAGER":
                    if chunk.report_id:
                        stmt = select(DailyReport).where(DailyReport.id == chunk.report_id)
                        res = await db.execute(stmt)
                        report = res.scalars().first()
                        if report and report.branch_id != current_user.branch_id:
                            continue
                    elif chunk.document_id:
                        stmt = select(Document).where(Document.id == chunk.document_id)
                        res = await db.execute(stmt)
                        doc = res.scalars().first()
                        if doc and doc.branch_id != current_user.branch_id:
                            continue
                context_chunks.append(chunk.content)

            # Fetch chat history for conversation context
            chat_history = []
            if payload.conversation_id:
                db_messages = await db.execute(
                    select(AIMessage)
                    .where(AIMessage.conversation_id == conversation.id)
                    .order_by(AIMessage.created_at.asc())
                )
                for msg in db_messages.scalars().all():
                    chat_history.append({"role": msg.role, "content": msg.content})

            answer, citations = await rag_engine.generate_rag_response(
                query=payload.content,
                context_chunks=context_chunks,
                chat_history=chat_history,
            )
        except Exception as e:
            print(f"[AI_ROUTE] RAG pipeline error: {e}")
            answer = "I couldn't retrieve the requested information at the moment. Please try again."
            citations = []

    # 4. Save assistant answer to DB
    assistant_msg = await conv_repo.create_message(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        retrieved_sources=citations
    )

    return AIMessageResponse(
        id=assistant_msg.id,
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        retrieved_sources=citations,
        created_at=assistant_msg.created_at
    )


@router.get("/conversations", response_model=List[AIConversationResponse])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM", "MANAGER"]))
):
    """Retrieve all chat threads started by the current user."""
    conv_repo = ConversationRepository(db)
    conversations = await conv_repo.get_user_conversations(current_user.id)
    return conversations


@router.get("/conversations/{conversation_id}", response_model=AIConversationDetailResponse)
async def get_conversation_details(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM", "MANAGER"]))
):
    """Fetch all messages inside a specific conversation thread."""
    conv_repo = ConversationRepository(db)
    conversation = await conv_repo.get_conversation(conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation thread not found"
        )
    return conversation
