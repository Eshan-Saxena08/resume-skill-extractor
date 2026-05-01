import chromadb
from sentence_transformers import SentenceTransformer

# Load once at startup
model = SentenceTransformer("all-MiniLM-L6-v2")

client = chromadb.Client()
collection = client.get_or_create_collection(name="resumes")


def chunk_text(text, chunk_size=500):
    """Split text into fixed-size character chunks."""
    chunks = []
    for i in range(0, len(text), chunk_size):
        chunk = text[i:i + chunk_size].strip()
        if chunk:
            chunks.append(chunk)
    return chunks


def store_resume(text, filename):
    """Embed and store resume chunks in ChromaDB."""
    chunks = chunk_text(text)
    if not chunks:
        return

    embeddings = model.encode(chunks).tolist()
    ids = [f"{filename}_chunk_{i}" for i in range(len(chunks))]

    # Delete old chunks for this file if re-uploaded
    try:
        existing = collection.get(where={"source": filename})
        if existing["ids"]:
            collection.delete(ids=existing["ids"])
    except Exception:
        pass

    collection.add(
        documents=chunks,
        embeddings=embeddings,
        ids=ids,
        metadatas=[{"source": filename} for _ in chunks]
    )


def query_resume(question, n_results=4):
    """Return top-k relevant chunks for a question."""
    if collection.count() == 0:
        return []

    q_embedding = model.encode([question]).tolist()

    results = collection.query(
        query_embeddings=q_embedding,
        n_results=min(n_results, collection.count())
    )

    return results["documents"][0] if results["documents"] else []