import sys
from pathlib import Path
import os
import uuid
from functools import wraps
from datetime import datetime, timezone
import io
import csv
from dotenv import load_dotenv

# Ensure backend directory is in sys.path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Load environment variables from .env
load_dotenv()

from flask import Flask, request, jsonify, send_from_directory, session, redirect, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from PyPDF2 import PdfReader
from docx import Document
from bson import ObjectId

import db
from recommender import analyze_profile, load_data, suggest_roles
import interview_ai
import ats_optimizer

BASE_DIR = BACKEND_DIR.parent
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "docx"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB limit

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
app.secret_key = os.getenv("SECRET_KEY", "skillbridge_dev_secret_key_2026_super_secure")
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE

# Enable CORS with credentials for local dev and production
CORS(app, supports_credentials=True)

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

# ==========================================================
# AUTHENTICATION DECORATORS
# ==========================================================
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required. Please log in."}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Admin login required."}), 401
            return redirect("/login")
        if session.get("user", {}).get("role") != "admin":
            if request.path.startswith("/api/"):
                return jsonify({"error": "Forbidden: Administrator privileges required."}), 403
            return redirect("/")
        return f(*args, **kwargs)
    return decorated_function

# ==========================================================
# INITIALIZATION (Seeding & Default Admin Creation)
# ==========================================================
def init_admin():
    admin_email = os.getenv("ADMIN_EMAIL").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD")

    database = db.get_db()
    if database is not None:
        try:
            existing_admin = database["users"].find_one({"role": "admin"})
            if not existing_admin:
                admin_doc = {
                    "email": admin_email,
                    "password_hash": generate_password_hash(admin_password),
                    "full_name": "System Administrator",
                    "role": "admin",
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc)
                }
                database["users"].insert_one(admin_doc)
                print(f"[SkillBridge Init] Initial admin created: {admin_email}")
        except Exception as e:
            print(f"[SkillBridge Init] Admin check warning: {e}")
    else:
        # Check mock store
        has_admin = any(u.get("role") == "admin" for u in db._mock_store["users"])
        if not has_admin:
            db._mock_store["users"].append({
                "_id": "mock_admin_1",
                "email": admin_email,
                "password_hash": generate_password_hash(admin_password),
                "full_name": "System Administrator",
                "role": "admin",
                "is_active": True,
                "created_at": datetime.now(timezone.utc)
            })

# Seed data and ensure initial admin exists on startup
try:
    db.seed_database_if_empty()
    init_admin()
except Exception as e:
    print(f"[SkillBridge Init] Startup initialization notice: {e}")

# ==========================================================
# FRONTEND PAGE ROUTES
# ==========================================================
@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/profile")
def profile():
    return send_from_directory(FRONTEND_DIR, "profile.html")

@app.route("/login")
def login_page():
    return send_from_directory(FRONTEND_DIR, "login.html")

@app.route("/register")
def register_page():
    return send_from_directory(FRONTEND_DIR, "register.html")

@app.route("/dashboard")
def dashboard_page():
    return send_from_directory(FRONTEND_DIR, "dashboard.html")

@app.route("/admin")
@admin_required
def admin_page():
    return send_from_directory(FRONTEND_DIR, "admin.html")

@app.route("/skill-analyzer")
@app.route("/analyzer")
def analyzer():
    return send_from_directory(FRONTEND_DIR, "analyzer.html")

@app.route("/skill-gap")
@app.route("/skill-gaps")
@app.route("/gap")
def gap():
    return send_from_directory(FRONTEND_DIR, "gap.html")

@app.route("/interview")
@app.route("/mock-interview")
def interview():
    return send_from_directory(FRONTEND_DIR, "interview.html")

@app.route("/learning-roadmap")
@app.route("/roadmap")
def roadmap():
    return send_from_directory(FRONTEND_DIR, "roadmap.html")

@app.route("/certifications")
@app.route("/certification")
def certifications():
    return send_from_directory(FRONTEND_DIR, "certifications.html")

@app.route("/companies")
@app.route("/jobs")
@app.route("/job-matches")
def companies():
    return send_from_directory(FRONTEND_DIR, "jobs.html")

@app.route("/ats-optimizer")
@app.route("/ats")
@app.route("/resume-optimizer")
def ats_page():
    return send_from_directory(FRONTEND_DIR, "ats.html")

# ==========================================================
# HEALTH ENDPOINTS
# ==========================================================
@app.route("/health")
@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "SkillBridge AI",
        "database": "connected" if db.is_connected() else "fallback_mode",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

# ==========================================================
# AUTHENTICATION API
# ==========================================================
@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True) or request.form.to_dict()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()
    full_name = str(data.get("full_name", "")).strip()

    if not email or "@" not in email:
        return jsonify({"error": "A valid email address is required."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long."}), 400

    database = db.get_db()
    if database is not None:
        if database["users"].find_one({"email": email}):
            return jsonify({"error": "An account with this email already exists."}), 400
        
        user_doc = {
            "email": email,
            "password_hash": generate_password_hash(password),
            "full_name": full_name or email.split("@")[0].capitalize(),
            "role": "user",
            "is_active": True,
            "created_at": datetime.now(timezone.utc)
        }
        res = database["users"].insert_one(user_doc)
        user_id = str(res.inserted_id)
    else:
        # Fallback store
        if any(u.get("email") == email for u in db._mock_store["users"]):
            return jsonify({"error": "An account with this email already exists."}), 400
        user_id = f"user_{len(db._mock_store['users']) + 1}"
        db._mock_store["users"].append({
            "_id": user_id,
            "email": email,
            "password_hash": generate_password_hash(password),
            "full_name": full_name or email.split("@")[0].capitalize(),
            "role": "user",
            "is_active": True,
            "created_at": datetime.now(timezone.utc)
        })

    session["user"] = {
        "id": user_id,
        "email": email,
        "full_name": full_name or email.split("@")[0].capitalize(),
        "role": "user"
    }

    return jsonify({
        "message": "Registration successful.",
        "user": session["user"]
    }), 201

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True) or request.form.to_dict()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    database = db.get_db()
    user = None
    if database is not None:
        user = database["users"].find_one({"email": email})
    else:
        for u in db._mock_store["users"]:
            if u.get("email") == email:
                user = u
                break

    if not user or not check_password_hash(user.get("password_hash", ""), password):
        return jsonify({"error": "Invalid email or password."}), 401

    if not user.get("is_active", True):
        return jsonify({"error": "Your account has been deactivated. Please contact support."}), 403

    user_id = str(user.get("_id"))
    session["user"] = {
        "id": user_id,
        "email": user["email"],
        "full_name": user.get("full_name", user["email"].split("@")[0].capitalize()),
        "role": user.get("role", "user")
    }

    return jsonify({
        "message": "Login successful.",
        "user": session["user"]
    })

@app.route("/api/auth/logout", methods=["POST", "GET"])
def auth_logout():
    session.pop("user", None)
    return jsonify({"message": "Logged out successfully."})

@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = session.get("user")
    if user:
        return jsonify({"logged_in": True, "user": user})
    return jsonify({"logged_in": False, "user": None})

# ==========================================================
# USER HISTORY & SUGGESTIONS API
# ==========================================================
@app.route("/api/user/analyses", methods=["GET"])
def get_user_analyses():
    user = session.get("user")
    if not user:
        return jsonify([])
    history = db.get_analyses_for_user(user["id"])
    return jsonify(history)

@app.route("/api/suggest-roles", methods=["POST"])
def suggest_roles_api():
    data = request.get_json(silent=True) or request.form.to_dict()
    skills_input = data.get("skills", [])
    if isinstance(skills_input, str):
        user_skills = [s.strip() for s in skills_input.split(",") if s.strip()]
    else:
        user_skills = list(skills_input)
    resume_text = data.get("resume_text", "")

    suggestions = suggest_roles(user_skills=user_skills, resume_text=resume_text, top_k=3)
    return jsonify(suggestions)

# ==========================================================
# CORE ANALYSIS API
# ==========================================================
@app.get("/api/jobs")
def jobs():
    roles, _, _ = load_data()
    cols = ["job_id", "job_role", "category", "experience_level"]
    available_cols = [c for c in cols if c in roles.columns]
    data = roles[available_cols].to_dict(orient="records")
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
            extracted = extract_resume(temp_path)
            resume_text = (extracted + "\n" + resume_text).strip()

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

        # Record analysis in database / fallback store
        current_user = session.get("user")
        user_id = current_user["id"] if current_user else "guest"

        saved_doc = db.save_analysis(
            user_id=user_id,
            target_role=result["job_role"],
            extracted_skills=result["user_skills"],
            missing_skills=result["missing_skills"],
            readiness_score=result["readiness_score"],
            extra_data={
                "category": result.get("category", "General"),
                "matched_count": len(result.get("matched_skills", [])),
                "missing_count": len(result.get("missing_skills", []))
            }
        )
        result["analysis_id"] = saved_doc.get("_id")
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        # Return clean error message without exposing raw stack trace
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500
    finally:
        # Cleanup uploaded resume immediately after text is extracted
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass

@app.post("/api/ats/analyze")
def ats_analyze_api():
    data = request.form.to_dict()
    resume_text = data.get("resume_text", "")
    job_description = data.get("job_description", "")
    target_role = data.get("target_role", "Software Engineer")
    resume_file = request.files.get("resume")

    temp_path = None
    try:
        if resume_file and resume_file.filename:
            if not allowed_file(resume_file.filename):
                return jsonify({"error": "Only PDF and DOCX resumes are supported."}), 400

            filename = f"ats_{uuid.uuid4().hex}_{secure_filename(resume_file.filename)}"
            temp_path = UPLOAD_DIR / filename
            resume_file.save(temp_path)
            extracted = extract_resume(temp_path)
            resume_text = (extracted + "\n" + resume_text).strip()

        if not resume_text:
            return jsonify({"error": "Please upload a resume or paste your resume text."}), 400

        result = ats_optimizer.analyze_ats(
            resume_text=resume_text,
            job_description=job_description,
            target_role=target_role
        )
        if "error" in result:
            return jsonify({"error": result["error"]}), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"ATS Analysis error: {str(e)}"}), 500
    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass

@app.route("/api/interview/start", methods=["POST"])
def start_interview_api():
    try:
        data = request.json or {}
        result = interview_ai.start_interview(data)
        if "error" in result:
            return jsonify({"error": result["error"]}), 503
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/interview/message", methods=["POST"])
def interview_message_api():
    try:
        data = request.json or {}
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
        data = request.json or {}
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

# ==========================================================
# ADMIN PORTAL API (ADMIN ONLY)
# ==========================================================
@app.route("/api/admin/stats", methods=["GET"])
@admin_required
def admin_stats():
    database = db.get_db()
    users_list = []
    analyses_list = []

    if database is not None:
        try:
            users_list = list(database["users"].find({}))
            analyses_list = list(database["analyses"].find({}))
        except Exception:
            pass
    else:
        users_list = db._mock_store["users"]
        analyses_list = db._mock_store["analyses"]

    total_users = len(users_list)
    total_analyses = len(analyses_list)
    
    scores = [float(a.get("readiness_score", 0)) for a in analyses_list if a.get("readiness_score") is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    # Role frequency
    role_counts = {}
    missing_skill_counts = {}
    for a in analyses_list:
        r = a.get("target_role", "Unknown")
        role_counts[r] = role_counts.get(r, 0) + 1
        for m in a.get("missing_skills", []):
            missing_skill_counts[m] = missing_skill_counts.get(m, 0) + 1

    top_roles = sorted(role_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    top_missing = sorted(missing_skill_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return jsonify({
        "total_users": total_users,
        "total_analyses": total_analyses,
        "average_readiness": avg_score,
        "top_roles": [{"role": k, "count": v} for k, v in top_roles],
        "top_missing_skills": [{"skill": k, "count": v} for k, v in top_missing]
    })

# --- Admin Job Roles CRUD ---
@app.route("/api/admin/roles", methods=["GET"])
@admin_required
def admin_list_roles():
    roles, _, _ = load_data()
    return jsonify(roles.to_dict(orient="records"))

@app.route("/api/admin/roles", methods=["POST"])
@admin_required
def admin_add_role():
    data = request.get_json(silent=True) or request.form.to_dict()
    job_role = str(data.get("job_role", "")).strip()
    category = str(data.get("category", "General")).strip()
    req_skills_raw = data.get("required_skills", "")
    opt_skills_raw = data.get("optional_skills", "")
    experience_level = str(data.get("experience_level", "Fresher / Junior")).strip()

    if not job_role:
        return jsonify({"error": "Job role name is required."}), 400

    # Parse comma or pipe separated skills into uniform pipe-separated string
    if isinstance(req_skills_raw, list):
        req_skills_pipe = "|".join([s.strip().lower() for s in req_skills_raw if s.strip()])
    else:
        parts = [s.strip().lower() for s in str(req_skills_raw).replace(",", "|").split("|") if s.strip()]
        req_skills_pipe = "|".join(parts)

    if isinstance(opt_skills_raw, list):
        opt_skills_pipe = "|".join([s.strip().lower() for s in opt_skills_raw if s.strip()])
    else:
        parts = [s.strip().lower() for s in str(opt_skills_raw).replace(",", "|").split("|") if s.strip()]
        opt_skills_pipe = "|".join(parts)

    job_id = f"JR{uuid.uuid4().hex[:5].upper()}"
    new_doc = {
        "job_id": job_id,
        "job_role": job_role,
        "category": category,
        "required_skills": req_skills_pipe,
        "optional_skills": opt_skills_pipe,
        "experience_level": experience_level
    }

    database = db.get_db()
    if database is not None:
        database["job_roles"].insert_one(new_doc)
        new_doc["_id"] = str(new_doc.get("_id"))
    else:
        db._mock_store["job_roles"].append(new_doc)

    return jsonify({"message": "Job role added successfully.", "role": new_doc}), 201

@app.route("/api/admin/roles/<role_id>", methods=["DELETE"])
@admin_required
def admin_delete_role(role_id):
    database = db.get_db()
    if database is not None:
        database["job_roles"].delete_one({"job_id": role_id})
    else:
        db._mock_store["job_roles"] = [r for r in db._mock_store["job_roles"] if r.get("job_id") != role_id]
    return jsonify({"message": f"Job role {role_id} deleted."})

@app.route("/api/admin/export-roles-csv", methods=["GET"])
@admin_required
def admin_export_roles_csv():
    roles, _, _ = load_data()
    output = io.StringIO()
    roles.to_csv(output, index=False)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=job_roles.csv"}
    )

# --- Admin Certifications CRUD ---
@app.route("/api/admin/certifications", methods=["GET"])
@admin_required
def admin_list_certifications():
    _, certs, _ = load_data()
    return jsonify(certs.to_dict(orient="records"))

@app.route("/api/admin/certifications", methods=["POST"])
@admin_required
def admin_add_certification():
    data = request.get_json(silent=True) or request.form.to_dict()
    job_role = str(data.get("job_role", "")).strip()
    certification = str(data.get("certification", "")).strip()
    provider = str(data.get("provider", "Coursera")).strip()
    level = str(data.get("level", "Beginner")).strip()
    url = str(data.get("url", "#")).strip()

    if not job_role or not certification:
        return jsonify({"error": "Job role and certification name are required."}), 400

    cert_id = f"C{uuid.uuid4().hex[:4].upper()}"
    new_doc = {
        "certification_id": cert_id,
        "job_role": job_role,
        "certification": certification,
        "provider": provider,
        "level": level,
        "url": url
    }

    database = db.get_db()
    if database is not None:
        database["certifications"].insert_one(new_doc)
        new_doc["_id"] = str(new_doc.get("_id"))
    else:
        db._mock_store["certifications"].append(new_doc)

    return jsonify({"message": "Certification added successfully.", "certification": new_doc}), 201

@app.route("/api/admin/certifications/<cert_id>", methods=["DELETE"])
@admin_required
def admin_delete_certification(cert_id):
    database = db.get_db()
    if database is not None:
        database["certifications"].delete_one({"certification_id": cert_id})
    else:
        db._mock_store["certifications"] = [c for c in db._mock_store["certifications"] if c.get("certification_id") != cert_id]
    return jsonify({"message": f"Certification {cert_id} deleted."})

# --- Admin Resources CRUD ---
@app.route("/api/admin/resources", methods=["GET"])
@admin_required
def admin_list_resources():
    _, _, resources = load_data()
    return jsonify(resources.to_dict(orient="records"))

@app.route("/api/admin/resources", methods=["POST"])
@admin_required
def admin_add_resource():
    data = request.get_json(silent=True) or request.form.to_dict()
    skill = str(data.get("skill", "")).strip().lower()
    resource_name = str(data.get("resource_name", "")).strip()
    provider = str(data.get("provider", "Documentation")).strip()
    resource_type = str(data.get("resource_type", "Course")).strip()
    url = str(data.get("url", "#")).strip()

    if not skill or not resource_name:
        return jsonify({"error": "Skill and resource name are required."}), 400

    res_id = f"R{uuid.uuid4().hex[:4].upper()}"
    new_doc = {
        "resource_id": res_id,
        "skill": skill,
        "resource_name": resource_name,
        "provider": provider,
        "resource_type": resource_type,
        "url": url
    }

    database = db.get_db()
    if database is not None:
        database["learning_resources"].insert_one(new_doc)
        new_doc["_id"] = str(new_doc.get("_id"))
    else:
        db._mock_store["learning_resources"].append(new_doc)

    return jsonify({"message": "Resource added successfully.", "resource": new_doc}), 201

@app.route("/api/admin/resources/<resource_id>", methods=["DELETE"])
@admin_required
def admin_delete_resource(resource_id):
    database = db.get_db()
    if database is not None:
        database["learning_resources"].delete_one({"resource_id": resource_id})
    else:
        db._mock_store["learning_resources"] = [r for r in db._mock_store["learning_resources"] if r.get("resource_id") != resource_id]
    return jsonify({"message": f"Resource {resource_id} deleted."})

# --- Admin Users Management ---
@app.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_list_users():
    database = db.get_db()
    user_records = []
    if database is not None:
        cursor = list(database["users"].find({}, {"password_hash": 0}))
        for u in cursor:
            uid = str(u["_id"])
            u["_id"] = uid
            u["analyses_count"] = database["analyses"].count_documents({"user_id": uid})
            if isinstance(u.get("created_at"), datetime):
                u["created_at_str"] = u["created_at"].strftime("%Y-%m-%d")
            user_records.append(u)
    else:
        for u in db._mock_store["users"]:
            copy_u = dict(u)
            copy_u.pop("password_hash", None)
            uid = str(copy_u["_id"])
            copy_u["analyses_count"] = len([a for a in db._mock_store["analyses"] if a.get("user_id") == uid])
            copy_u["created_at_str"] = "Recent"
            user_records.append(copy_u)

    return jsonify(user_records)

@app.route("/api/admin/users/<user_id>/toggle-status", methods=["POST"])
@admin_required
def admin_toggle_user_status(user_id):
    database = db.get_db()
    if database is not None:
        try:
            target = database["users"].find_one({"_id": ObjectId(user_id)})
            if target:
                new_status = not target.get("is_active", True)
                database["users"].update_one({"_id": ObjectId(user_id)}, {"$set": {"is_active": new_status}})
                return jsonify({"message": "User status updated.", "is_active": new_status})
        except Exception:
            pass
    # Fallback
    for u in db._mock_store["users"]:
        if str(u.get("_id")) == str(user_id):
            u["is_active"] = not u.get("is_active", True)
            return jsonify({"message": "User status updated.", "is_active": u["is_active"]})

    return jsonify({"error": "User not found."}), 404

@app.route("/api/admin/users/<user_id>/toggle-role", methods=["POST"])
@admin_required
def admin_toggle_user_role(user_id):
    database = db.get_db()
    if database is not None:
        try:
            target = database["users"].find_one({"_id": ObjectId(user_id)})
            if target:
                new_role = "user" if target.get("role") == "admin" else "admin"
                database["users"].update_one({"_id": ObjectId(user_id)}, {"$set": {"role": new_role}})
                return jsonify({"message": "User role updated.", "role": new_role})
        except Exception:
            pass
    # Fallback
    for u in db._mock_store["users"]:
        if str(u.get("_id")) == str(user_id):
            u["role"] = "user" if u.get("role") == "admin" else "admin"
            return jsonify({"message": "User role updated.", "role": u["role"]})

    return jsonify({"error": "User not found."}), 404

# ==========================================================
# ERROR HANDLERS (Clean JSON, No Leaked Stack Traces)
# ==========================================================
@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({"error": "File size exceeds the 5 MB maximum limit."}), 413

@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Requested resource was not found."}), 404
    return send_from_directory(FRONTEND_DIR, "index.html"), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "An internal server error occurred. Please try again later."}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
