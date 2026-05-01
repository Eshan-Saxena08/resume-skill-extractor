from dotenv import load_dotenv
load_dotenv()
import fitz
from groq import Groq
import os

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def extract_text_from_pdf(pdf_path):

    text = ""
    doc = fitz.open(pdf_path)

    for page in doc:
        text += page.get_text()

    return text


def extract_resume_data(resume_text):

    prompt = f"""
Extract all skills from the resume.

Return ONLY JSON:

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
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )

        return response.choices[0].message.content

    except:
        return """{
 "summary": "LLM failed",
 "technical": [],
 "soft": [],
 "tools": [],
 "domain": []
}"""