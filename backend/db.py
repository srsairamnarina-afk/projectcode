import os
from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
from dotenv import load_dotenv
import pymongo
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

# Load environment variables
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATASETS_DIR = BASE_DIR / "datasets"

MONGO_URI = os.getenv("MONGO_URI", "").strip()
DB_NAME = os.getenv("MONGO_DB_NAME", "skillbridge_ai")

# In-memory fallbacks when MongoDB is not connected
_mock_store = {
    "users": [],
    "analyses": [],
    "job_roles": [],
    "certifications": [],
    "learning_resources": []
}

_client = None
_db = None

def get_client():
    global _client
    if _client is not None:
        return _client
    if not MONGO_URI:
        return None
    try:
        _client = pymongo.MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=2500,
            connectTimeoutMS=2500
        )
        # Test connection
        _client.admin.command("ping")
        return _client
    except Exception as e:
        print(f"[SkillBridge DB] Warning: Could not connect to MongoDB Atlas ({e}). Operating in fallback mode.")
        _client = None
        return None

def set_db_instance(mock_db):
    """Used by pytest to inject a mongomock instance."""
    global _db, _client
    _db = mock_db

def get_db():
    global _db
    if _db is not None:
        return _db
    client = get_client()
    if client is not None:
        _db = client[DB_NAME]
        return _db
    return None

def is_connected():
    try:
        db = get_db()
        if db is not None:
            # Check with a lightweight ping
            client = get_client()
            if client:
                client.admin.command("ping")
            return True
    except Exception:
        pass
    return False

# Collection Accessors
def get_collection(col_name):
    db = get_db()
    if db is not None:
        return db[col_name]
    return None

def seed_database_if_empty():
    """
    On startup, if collections are empty, seed them from CSVs.
    If database is not connected, populates the fallback in-memory store from CSVs.
    """
    roles_file = DATASETS_DIR / "job_roles.csv"
    certs_file = DATASETS_DIR / "certifications.csv"
    res_file = DATASETS_DIR / "learning_resources.csv"

    db = get_db()

    # 1. Seed Job Roles
    try:
        if roles_file.exists():
            roles_df = pd.read_csv(roles_file)
            records = roles_df.to_dict(orient="records")
            # Ensure skills are list-formatted for rich querying
            for r in records:
                if isinstance(r.get("required_skills"), str):
                    r["required_skills_list"] = [s.strip().lower() for s in r["required_skills"].split("|") if s.strip()]
                if isinstance(r.get("optional_skills"), str):
                    r["optional_skills_list"] = [s.strip().lower() for s in r["optional_skills"].split("|") if s.strip()]

            if db is not None:
                if db["job_roles"].count_documents({}) == 0:
                    db["job_roles"].insert_many(records)
                    print(f"[SkillBridge DB] Seeded {len(records)} job roles into MongoDB.")
            else:
                if not _mock_store["job_roles"]:
                    _mock_store["job_roles"] = records
    except Exception as e:
        print(f"[SkillBridge DB] Note seeding job_roles: {e}")

    # 2. Seed Certifications
    try:
        if certs_file.exists():
            certs_df = pd.read_csv(certs_file)
            records = certs_df.to_dict(orient="records")
            if db is not None:
                if db["certifications"].count_documents({}) == 0:
                    db["certifications"].insert_many(records)
                    print(f"[SkillBridge DB] Seeded {len(records)} certifications into MongoDB.")
            else:
                if not _mock_store["certifications"]:
                    _mock_store["certifications"] = records
    except Exception as e:
        print(f"[SkillBridge DB] Note seeding certifications: {e}")

    # 3. Seed Learning Resources
    try:
        if res_file.exists():
            res_df = pd.read_csv(res_file)
            records = res_df.to_dict(orient="records")
            if db is not None:
                if db["learning_resources"].count_documents({}) == 0:
                    db["learning_resources"].insert_many(records)
                    print(f"[SkillBridge DB] Seeded {len(records)} learning resources into MongoDB.")
            else:
                if not _mock_store["learning_resources"]:
                    _mock_store["learning_resources"] = records
    except Exception as e:
        print(f"[SkillBridge DB] Note seeding learning_resources: {e}")

def save_analysis(user_id, target_role, extracted_skills, missing_skills, readiness_score, extra_data=None):
    """
    Saves an analysis record to the analyses collection (or fallback store).
    """
    doc = {
        "user_id": str(user_id) if user_id else "guest",
        "target_role": target_role,
        "extracted_skills": extracted_skills or [],
        "missing_skills": missing_skills or [],
        "readiness_score": float(readiness_score or 0.0),
        "created_at": datetime.now(timezone.utc),
        "created_at_iso": datetime.now(timezone.utc).isoformat()
    }
    if extra_data and isinstance(extra_data, dict):
        doc.update(extra_data)

    db = get_db()
    if db is not None:
        try:
            result = db["analyses"].insert_one(doc)
            doc["_id"] = str(result.inserted_id)
            return doc
        except Exception as e:
            print(f"[SkillBridge DB] Error saving analysis to MongoDB: {e}")

    # Fallback store
    doc["_id"] = f"fallback_{len(_mock_store['analyses']) + 1}"
    _mock_store["analyses"].append(doc)
    return doc

def get_analyses_for_user(user_id):
    """Fetch analyses list for a user ordered by created_at descending."""
    db = get_db()
    if db is not None:
        try:
            records = list(db["analyses"].find({"user_id": str(user_id)}).sort("created_at", -1))
            for r in records:
                r["_id"] = str(r["_id"])
                if isinstance(r.get("created_at"), datetime):
                    r["created_at_str"] = r["created_at"].strftime("%b %d, %Y %I:%M %p")
            return records
        except Exception as e:
            print(f"[SkillBridge DB] Error reading analyses from MongoDB: {e}")

    # Fallback
    results = [a for a in _mock_store["analyses"] if a.get("user_id") == str(user_id)]
    for r in results:
        if isinstance(r.get("created_at"), datetime):
            r["created_at_str"] = r["created_at"].strftime("%b %d, %Y %I:%M %p")
        else:
            r["created_at_str"] = str(r.get("created_at_iso", "Recent"))
    results.reverse()
    return results
