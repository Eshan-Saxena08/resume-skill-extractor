from flask import Flask, request, jsonify, render_template
import tempfile
import json
import os
import re

from skill_extractor import extract_text_from_pdf, extract_resume_data

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/extract", methods=["POST"])
def extract():

    if "resume" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["resume"]

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    # create temp file
    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    temp.close()   # prevents Windows file lock
    file.save(temp.name)

    try:
        # extract text from PDF
        text = extract_text_from_pdf(temp.name)

        # send to LLM
        result = extract_resume_data(text)

        # clean formatting if model returned markdown
        result = result.replace("```json", "").replace("```", "").strip()

        # extract JSON safely
        match = re.search(r"\{.*\}", result, re.DOTALL)

        if match:
            data = json.loads(match.group())
        else:
            data = {
                "summary": "",
                "technical": [],
                "soft": [],
                "tools": [],
                "domain": []
            }

        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        os.remove(temp.name)


if __name__ == "__main__":
    app.run(debug=True)