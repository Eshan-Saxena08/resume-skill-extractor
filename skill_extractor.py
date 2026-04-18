import fitz
from groq import Groq
client = Groq(api_key="YOUR_GROQ_API")


def extract_text_from_pdf(pdf_path):
    text = ""
    doc = fitz.open(pdf_path)
    for page in doc:
        text += page.get_text()
    return text


def extract_resume_data(resume_text):

    prompt = f"""
Extract skills from the resume.

Return ONLY JSON in this format:

{{
 "summary": "",
 "technical": [],
 "soft": [],
 "tools": [],
 "domain": []
}}

Resume:
{resume_text}
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}]
        )

        return response.choices[0].message.content

    except Exception as e:
        # Return valid JSON instead of crashing Flask
        return """{
 "summary": "LLM request failed",
 "technical": [],
 "soft": [],
 "tools": [],
 "domain": []
}"""