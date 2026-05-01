from flask import Flask, request, jsonify, render_template
import tempfile, os, json, re

from dotenv import load_dotenv
load_dotenv()

from groq import Groq
from skill_extractor import extract_text_from_pdf, extract_resume_data
from rag import store_resume, query_resume

app = Flask(__name__)

# Groq client initialised once
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


# ── Helper: extract raw text from any supported file ──────────────────────

def get_text(file, temp_path):
    name = file.filename.lower()
    if name.endswith(".pdf"):
        return extract_text_from_pdf(temp_path)
    elif name.endswith(".txt"):
        with open(temp_path, "r", encoding="utf-8") as f:
            return f.read()
    elif name.endswith(".docx"):
        import docx
        doc = docx.Document(temp_path)
        return "\n".join([p.text for p in doc.paragraphs])
    else:
        raise ValueError("Unsupported file type. Use PDF, TXT, or DOCX.")


# ── Routes ────────────────────────────────────────────────────────────────

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/extract", methods=["POST"])
def extract():
    if "resume" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["resume"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    # Save to a temp file with the right extension
    ext = os.path.splitext(file.filename)[1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.close()
    file.save(tmp.name)

    try:
        text = get_text(file, tmp.name)

        # Store in vector DB for RAG
        store_resume(text, file.filename)

        # Extract skills via LLM
        raw = extract_resume_data(text)
        raw = raw.replace("```json", "").replace("```", "").strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(match.group()) if match else {
            "summary": "", "technical": [], "soft": [], "tools": [], "domain": []
        }
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        os.remove(tmp.name)


@app.route("/ask", methods=["POST"])
def ask():
    """RAG: answer a question about the uploaded resume."""
    body = request.get_json()
    question = (body or {}).get("question", "").strip()

    if not question:
        return jsonify({"error": "No question provided"}), 400

    chunks = query_resume(question)
    if not chunks:
        return jsonify({"answer": "No resume has been uploaded yet. Please upload a resume first."})

    context = "\n\n".join(chunks)

    prompt = f"""You are a helpful assistant. Answer the question using ONLY the resume information provided below.
If the answer is not in the resume, say so clearly.

RESUME CONTENT:
{context}

QUESTION:
{question}

Answer concisely and directly."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        answer = response.choices[0].message.content
    except Exception as e:
        answer = f"Error: {str(e)}"

    return jsonify({"answer": answer})


@app.route("/match", methods=["POST"])
def match():
    """RAG: compare the uploaded resume against a job description."""
    body = request.get_json()
    job = (body or {}).get("job", "").strip()

    if not job:
        return jsonify({"error": "No job description provided"}), 400

    chunks = query_resume(job)
    if not chunks:
        return jsonify({"result": "No resume has been uploaded yet. Please upload a resume first."})

    context = "\n\n".join(chunks)

    prompt = f"""You are a recruiter evaluating a candidate's resume against a job description.

RESUME (relevant sections):
{context}

JOB DESCRIPTION:
{job}

Provide:
1. Match score (0-100)
2. Key matching skills/experiences
3. Missing or weak areas
4. One-line hiring recommendation

Keep it concise."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        result = response.choices[0].message.content
    except Exception as e:
        result = f"Error: {str(e)}"

    return jsonify({"result": result})


if __name__ == "__main__":
    app.run(debug=True)