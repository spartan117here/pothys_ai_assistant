import re
import random
from typing import List, Optional
from app.core.config import settings

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = bool(settings.OPENAI_API_KEY and "your-openai" not in settings.OPENAI_API_KEY)
except ImportError:
    OPENAI_AVAILABLE = False

class RAGEngine:
    def __init__(self):
        self.client = None
        if OPENAI_AVAILABLE:
            try:
                self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
                print("OpenAI client initialized successfully for RAG service.")
            except Exception as e:
                print(f"Warning: Failed to initialize OpenAI client: {e}")
        else:
            print("OpenAI API key not configured. RAG service running in Mock/Development mode.")

    def chunk_text(self, text: str, chunk_size: int = 800, overlap: int = 100) -> List[str]:
        """Slice large document text into overlapping chunks for vector search."""
        if not text:
            return []
        
        # Clean up double linebreaks
        text = re.sub(r'\n+', '\n', text).strip()
        
        words = text.split()
        chunks = []
        
        i = 0
        while i < len(words):
            # Take chunk of size
            chunk_words = words[i:i + chunk_size]
            chunk_text = " ".join(chunk_words)
            chunks.append(chunk_text)
            
            # Step forward by chunk_size - overlap
            i += (chunk_size - overlap)
            if i >= len(words) or len(chunk_words) < chunk_size:
                break
                
        return chunks

    async def get_embedding(self, text: str) -> List[float]:
        """
        Generates a 1536-dimensional embedding using text-embedding-3-small.
        Returns a mock vector in development if OpenAI key is not set.
        """
        if self.client:
            try:
                # Call OpenAI embedding API
                response = self.client.embeddings.create(
                    input=[text.replace("\n", " ")],
                    model="text-embedding-3-small"
                )
                return response.data[0].embedding
            except Exception as e:
                print(f"OpenAI embedding generation failed: {e}. Falling back to mock vector.")
        
        # Mock 1536-D vector for development
        # Deterministic seed based on text content to keep matching consistent in mock testing
        random.seed(hash(text))
        return [random.uniform(-1, 1) for _ in range(1536)]

    def is_query_in_domain(self, query: str) -> bool:
        """
        Basic regex check to block obvious out-of-domain prompts before invoking LLM.
        Prevents general-purpose chat abuse (code help, recipes, jokes, external news).
        """
        # Basic keyword blockers for developer fallback and OpenAI protection
        out_of_domain_keywords = [
            "python", "javascript", "code", "programming", "scrape", "recipe",
            "cook", "joke", "president", "photosynthesis", "physics", "capital of"
        ]
        
        query_lower = query.lower()
        for kw in out_of_domain_keywords:
            if kw in query_lower:
                return False

        out_of_domain_patterns = [
            r"\b(write a code|python script|html template|javascript function)\b",
            r"\b(recipe for|how to cook|ingredients of)\b",
            r"\b(tell a joke|make me laugh|joke of the day)\b",
            r"\b(weather in|latest news about|current price of)\b",
            r"\b(who is the president of|capital city of|population of)\b",
            r"\b(explain photosynthesis|quantum physics|meaning of life)\b"
        ]
        
        for pattern in out_of_domain_patterns:
            if re.search(pattern, query_lower):
                return False
                
        return True

    async def generate_response(self, query: str, context_chunks: List[str], chat_history: Optional[List[dict]] = None) -> tuple[str, List[str]]:
        """
        Generates domain-restricted response using context retrieval.
        Returns a tuple: (answer_string, list_of_citations_used).
        """
        # 1. Pre-filter out of domain queries
        if not self.is_query_in_domain(query):
            return "As the Pothys AGM AI Assistant, my operations are restricted to Pothys business operations. I cannot assist with external queries.", []

        # Format context chunks
        formatted_context = ""
        citations = []
        for idx, chunk in enumerate(context_chunks, start=1):
            formatted_context += f"[Source {idx}]:\n{chunk}\n\n"
            citations.append(chunk)

        system_instruction = (
            "You are the \"Pothys AGM AI Executive Assistant\", an enterprise AI built specifically for the Assistant General Manager (AGM) of Pothys Swarna Mahal.\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. You are strictly restricted to Pothys business operations, sales, performance metrics, daily reports, inventory, tasks, and meetings across the 8 Pothys Swarna Mahal branches: T. Nagar, Chromepet, Coimbatore, Madurai, Trichy, Tirunelveli, Nagercoil, and Pondicherry.\n"
            "2. If the user asks ANY question unrelated to Pothys business operations, management, or reports, you must respond politely: \"As the Pothys AGM AI Assistant, my operations are restricted to Pothys business operations. I cannot assist with external queries.\"\n"
            "3. Answer the query using ONLY the provided Source context logs below. Do not use external general knowledge.\n"
            "4. If the provided context does not contain sufficient details to answer the query, reply: \"I cannot find this information in the uploaded reports or database.\"\n"
            "5. Never hallucinate. State facts and sales figures exactly as they appear in the source context. If mentioning a metric, refer to which [Source X] it was retrieved from.\n"
            "6. Always keep your response concise, professional, and dashboard-friendly."
        )

        user_content = f"CONTEXT INFORMATION FROM COMPANY RECORDS:\n{formatted_context}\n\nUSER QUERY: {query}"

        # 2. Call Chat Completion API
        if self.client:
            try:
                messages = [{"role": "system", "content": system_instruction}]
                
                # Append recent chat history if available
                if chat_history:
                    for msg in chat_history[-5:]: # limit to last 5 message pairs
                        messages.append({"role": msg["role"], "content": msg["content"]})
                        
                messages.append({"role": "user", "content": user_content})

                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    temperature=0.0 # Strict factual answering
                )
                answer = response.choices[0].message.content
                return answer, citations
            except Exception as e:
                print(f"OpenAI Chat Completion failed: {e}")
                return f"Error: OpenAI request failed: {str(e)}", []
        
        # Local factual context synthesizer if no OpenAI API key is configured
        query_lower = query.lower()
        combined_context = "\n".join(context_chunks).lower()
        
        has_relevance = True
        if "shortage" in query_lower or "issue" in query_lower or "problem" in query_lower:
            if not any(k in combined_context for k in ["shortage", "issue", "problem", "missed"]):
                has_relevance = False
                
        if not context_chunks or not has_relevance:
            return "I cannot find this information in the uploaded reports or database.", []
            
        answer = "Based on the retrieved operational database records:\n" + "\n".join(
            f"- [Source {idx}]: {chunk.strip()}" for idx, chunk in enumerate(context_chunks, start=1)
        )
        return answer, context_chunks

rag_engine = RAGEngine()
