import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.db.session import get_db
from app.api.deps import get_current_user, check_role
from app.models.user import User
from app.models.conversation import AIMessage
from app.models.report import DailyReport
from app.models.document import Document, DocumentChunk
from app.repositories.conversation import ConversationRepository
from app.repositories.document import DocumentRepository
from app.schemas.ai import AIQueryRequest, AIMessageResponse, AIConversationResponse, AIConversationDetailResponse
from app.services.rag_engine import rag_engine

router = APIRouter()

@router.post("/query", response_model=AIMessageResponse)
async def query_copilot(
    payload: AIQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM", "MANAGER"]))
):
    """
    RAG Copilot Chat Query.
    Executes semantic search on branches reports/documents and answers the query via OpenAI.
    Managers are restricted to their own branch context. AGM can query everything.
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
        # Create a new conversation with a short title from the query
        title = payload.content[:50] + "..." if len(payload.content) > 50 else payload.content
        conversation = await conv_repo.create_conversation(current_user.id, title)

    # Save user query message to DB
    await conv_repo.create_message(
        conversation_id=conversation.id,
        role="user",
        content=payload.content
    )

    # 2. Convert query to vector embedding
    try:
        query_vector = await rag_engine.get_embedding(payload.content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate query embedding: {str(e)}"
        )

    # 3. Retrieve relevant context chunks (filtered by RBAC / branch constraints)
    doc_repo = DocumentRepository(db)
    raw_chunks = await doc_repo.semantic_search(query_vector=query_vector, limit=8)
    
    # Apply branch filtering in Python (covers both SQLite and Postgres easily)
    context_chunks = []
    for chunk in raw_chunks:
        # Managers can only see data from their own branch
        if current_user.role == "MANAGER":
            # If chunk is tied to a report, verify branch
            # We can lazy load or filter
            if chunk.report_id:
                # Load report details
                stmt = select(DailyReport).where(DailyReport.id == chunk.report_id)
                res = await db.execute(stmt)
                report = res.scalars().first()
                if report and report.branch_id != current_user.branch_id:
                    continue # skip other branch reports
            elif chunk.document_id:
                stmt = select(Document).where(Document.id == chunk.document_id)
                res = await db.execute(stmt)
                doc = res.scalars().first()
                if doc and doc.branch_id != current_user.branch_id:
                    continue # skip other branch docs
        
        context_chunks.append(chunk.content)

    # 4. Fetch recent chat history to maintain conversation flow
    chat_history = []
    if payload.conversation_id:
        db_messages = await db.execute(
            select(AIMessage)
            .where(AIMessage.conversation_id == conversation.id)
            .order_by(AIMessage.created_at.asc())
        )
        for msg in db_messages.scalars().all():
            chat_history.append({"role": msg.role, "content": msg.content})

    # 5. Generate Answer via RAG service
    try:
        answer, citations = await rag_engine.generate_response(
            query=payload.content,
            context_chunks=context_chunks,
            chat_history=chat_history,
            db=db
        )
    except Exception as e:
        print(f"Error in deterministic AI engine: {e}")
        answer = "I couldn't retrieve the requested information at the moment. Please try again."
        citations = []

    # 6. Save assistant answer to DB
    assistant_msg = await conv_repo.create_message(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        retrieved_sources=citations
    )

    # Return the assistant message with the conversation_id included.
    # This is the critical field the frontend needs to persist the thread —
    # without it, every subsequent message creates a new conversation in the DB.
    return AIMessageResponse(
        id=assistant_msg.id,
        conversation_id=conversation.id,   # ← THE FIX
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
