from pathlib import Path
import os
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader
from docx import Document

from recommender import analyze_profile, load_data
import interview_ai

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "docx"}
MAX_FILE_SIZE = 5 * 1024 * 1024

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_pdf(path):
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)

def extract_docx(path):
    doc = Document(str(path))
    return "\n".join(p.text for p in doc.paragraphs)

def extract_resume(path):
    ext = path.suffix.lower()
    if ext == ".pdf":
        return extract_pdf(path)
    if ext == ".docx":
        return extract_docx(path)
    raise ValueError("Unsupported resume format.")

@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/profile")
def profile():
    return send_from_directory(FRONTEND_DIR, "profile.html")

@app.route("/login")
def login():
    return send_from_directory(FRONTEND_DIR, "login.html")

@app.route("/skill-analyzer")
def analyzer():
    return send_from_directory(FRONTEND_DIR, "analyzer.html")

@app.route("/skill-gap")
def gap():
    return send_from_directory(FRONTEND_DIR, "gap.html")

@app.route("/interview")
def interview():
    return send_from_directory(FRONTEND_DIR, "interview.html")

@app.route("/learning-roadmap")
def roadmap():
    return send_from_directory(FRONTEND_DIR, "roadmap.html")

@app.route("/certifications")
def certifications():
    return send_from_directory(FRONTEND_DIR, "certifications.html")

@app.route("/companies")
def companies():
    return send_from_directory(FRONTEND_DIR, "jobs.html")

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "SkillBridge AI"})

@app.get("/api/jobs")
def jobs():
    roles, _, _ = load_data()
    data = roles[["job_id", "job_role", "category", "experience_level"]].to_dict(orient="records")
    return jsonify(data)

@app.post("/api/analyze")
def analyze():
    data = request.form.to_dict()
    resume_text = data.get("resume_text", "")
    resume_file = request.files.get("resume")

    temp_path = None

    try:
        if resume_file and resume_file.filename:
            if not allowed_file(resume_file.filename):
                return jsonify({"error": "Only PDF and DOCX resumes are supported."}), 400

            filename = f"{uuid.uuid4().hex}_{secure_filename(resume_file.filename)}"
            temp_path = UPLOAD_DIR / filename
            resume_file.save(temp_path)
            resume_text += "\n" + extract_resume(temp_path)

        skills_raw = data.get("skills", "")
        skills = [x.strip() for x in skills_raw.split(",") if x.strip()]

        target_role = data.get("target_role", "").strip()
        if not target_role:
            return jsonify({"error": "Target job role is required."}), 400

        result = analyze_profile(
            target_role=target_role,
            user_skills=skills,
            education=data.get("education", ""),
            experience=data.get("experience", 0),
            resume_text=resume_text
        )
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)

@app.route("/api/interview/start", methods=["POST"])
def start_interview_api():
    try:
        data = request.json
        result = interview_ai.start_interview(data)
        if "error" in result:
            return jsonify({"error": result["error"]}), 503
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/interview/message", methods=["POST"])
def interview_message_api():
    try:
        data = request.json
        system_prompt = data.get("system_prompt")
        history = data.get("conversation_history", [])
        result = interview_ai.handle_message(system_prompt, history)
        if "error" in result:
            return jsonify({"error": result["error"]}), 503
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/interview/evaluate", methods=["POST"])
def interview_evaluate_api():
    try:
        data = request.json
        system_prompt = data.get("system_prompt")
        history = data.get("conversation_history", [])
        result = interview_ai.evaluate_interview(system_prompt, history)
        if "error" in result:
            return jsonify({"error": result["error"]}), 503
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/interview/transcribe", methods=["POST"])
def interview_transcribe_api():
    try:
        data = request.json or {}
        audio_data = data.get("audio_data")
        mime_type = data.get("mime_type", "audio/webm")
        if not audio_data:
            return jsonify({"error": "No audio data provided"}), 400
        result = interview_ai.transcribe_audio(audio_data, mime_type)
        if "error" in result:
            return jsonify({"error": result["error"]}), 503
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
