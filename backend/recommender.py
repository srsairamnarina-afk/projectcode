import re
from pathlib import Path
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "datasets"

ROLES_FILE = DATA_DIR / "job_roles.csv"
CERT_FILE = DATA_DIR / "certifications.csv"
RESOURCE_FILE = DATA_DIR / "learning_resources.csv"

# Comprehensive synonym mapping
SYNONYMS = {
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "ml": "machine learning",
    "ai": "artificial intelligence",
    "dl": "deep learning",
    "nlp": "natural language processing",
    "cv": "computer vision",
    "aws": "amazon web services",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "mongo": "mongodb",
    "reactjs": "react",
    "react.js": "react",
    "nodejs": "node.js",
    "node": "node.js",
    "golang": "go",
    "cpp": "c++",
    "csharp": "c#",
    "fe": "frontend",
    "be": "backend",
    "fs": "fullstack",
    "db": "database",
    "sql server": "sql",
    "ms sql": "sql",
    "rest": "rest api",
    "restful": "rest api",
    "ci / cd": "ci/cd",
    "ci cd": "ci/cd",
    "continuous integration": "ci/cd",
    "devops": "devops",
    "ui": "ui/ux",
    "ux": "ui/ux",
    "ui ux": "ui/ux",
    "user experience": "user research",
    "data science": "data scientist",
    "powerbi": "power bi",
    "docker containers": "docker",
    "oops": "object oriented programming",
    "oop": "object oriented programming"
}

# Inverse synonym mapping for keyword detection
INVERSE_SYNONYMS = {}
for alias, canon in SYNONYMS.items():
    INVERSE_SYNONYMS.setdefault(canon, []).append(alias)

def normalize(text):
    text = str(text or "").lower()
    text = re.sub(r"[^a-z0-9+#.\- ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return SYNONYMS.get(text, text)

def canonical_skill(skill):
    norm = normalize(skill)
    return SYNONYMS.get(norm, norm)

def split_skills(value):
    if isinstance(value, list):
        return [canonical_skill(x) for x in value if canonical_skill(x)]
    return [canonical_skill(x) for x in str(value or "").split("|") if canonical_skill(x)]

def load_data():
    """
    Loads roles, certifications, and resources.
    Reads from MongoDB if connected and populated, falling back to local CSV files.
    """
    try:
        from db import get_db
        db = get_db()
        if db is not None:
            roles_cursor = list(db["job_roles"].find({}, {"_id": 0}))
            if roles_cursor and len(roles_cursor) > 0:
                roles = pd.DataFrame(roles_cursor)
                certs_cursor = list(db["certifications"].find({}, {"_id": 0}))
                res_cursor = list(db["learning_resources"].find({}, {"_id": 0}))
                certs = pd.DataFrame(certs_cursor) if certs_cursor else pd.read_csv(CERT_FILE)
                resources = pd.DataFrame(res_cursor) if res_cursor else pd.read_csv(RESOURCE_FILE)
                return roles, certs, resources
    except Exception:
        pass

    roles = pd.read_csv(ROLES_FILE)
    certs = pd.read_csv(CERT_FILE)
    resources = pd.read_csv(RESOURCE_FILE)
    return roles, certs, resources

def extract_skills_from_text(text, known_skills):
    """
    Extracts known skills from freeform text, resolving synonyms and word boundaries.
    """
    normalized_text = " " + normalize(text) + " "
    found = []
    
    for skill in known_skills:
        s = canonical_skill(skill)
        if not s:
            continue
        
        # Test the canonical skill
        patterns = [r"(?<!\w)" + re.escape(s) + r"(?!\w)"]
        # Also test all known synonym aliases for this skill
        if s in INVERSE_SYNONYMS:
            for alias in INVERSE_SYNONYMS[s]:
                patterns.append(r"(?<!\w)" + re.escape(alias) + r"(?!\w)")
        
        for pat in patterns:
            if re.search(pat, normalized_text):
                found.append(s)
                break
                
    return sorted(set(found))

def calculate_similarity(user_skills, required_skills):
    """
    Calculates TF-IDF Cosine Similarity between user skill pool and target role requirements.
    """
    if not user_skills or not required_skills:
        return 0.0
    corpus = [" ".join(required_skills), " ".join(user_skills)]
    try:
        vectorizer = TfidfVectorizer()
        matrix = vectorizer.fit_transform(corpus)
        return float(cosine_similarity(matrix[0:1], matrix[1:2])[0][0])
    except Exception:
        # Fallback to Jaccard similarity if TF-IDF cannot form vocabulary
        set_u = set(user_skills)
        set_r = set(required_skills)
        intersection = set_u & set_r
        union = set_u | set_r
        return float(len(intersection) / len(union)) if union else 0.0

ROLE_ALIASES = {
    "software developer": "Software Engineer",
    "software dev": "Software Engineer",
    "developer": "Software Engineer",
    "programmer": "Software Engineer",
    "coder": "Software Engineer",
    "full stack developer": "Software Engineer",
    "full stack engineer": "Software Engineer",
    "fullstack developer": "Software Engineer",
    "fullstack engineer": "Software Engineer",
    "full stack": "Software Engineer",
    "frontend engineer": "Frontend Developer",
    "front end developer": "Frontend Developer",
    "front-end developer": "Frontend Developer",
    "frontend dev": "Frontend Developer",
    "backend engineer": "Backend Developer",
    "back end developer": "Backend Developer",
    "back-end developer": "Backend Developer",
    "backend dev": "Backend Developer",
    "ai engineer": "Machine Learning Engineer",
    "ml engineer": "Machine Learning Engineer",
    "ai/ml engineer": "Machine Learning Engineer",
    "machine learning": "Machine Learning Engineer",
    "data science": "Data Scientist",
    "data analytics": "Data Analyst",
    "business analyst": "Data Analyst",
    "bi analyst": "Data Analyst",
    "cloud architect": "Cloud Engineer",
    "cloud": "Cloud Engineer",
    "aws engineer": "Cloud Engineer",
    "devops": "DevOps Engineer",
    "site reliability engineer": "DevOps Engineer",
    "sre": "DevOps Engineer",
    "security analyst": "Cybersecurity Analyst",
    "cyber security": "Cybersecurity Analyst",
    "cybersecurity": "Cybersecurity Analyst",
    "ui designer": "UI/UX Designer",
    "ux designer": "UI/UX Designer",
    "ui/ux": "UI/UX Designer",
    "product designer": "UI/UX Designer",
    "servicenow": "ServiceNow Developer"
}

def resolve_role(target_role, roles_df):
    clean = str(target_role or "").lower().strip()
    if not clean:
        return roles_df.iloc[0]

    # 1. Exact match
    matched = roles_df[roles_df["job_role"].str.lower().str.strip() == clean]
    if not matched.empty:
        return matched.iloc[0]

    # 2. Alias match
    if clean in ROLE_ALIASES:
        alias_role = ROLE_ALIASES[clean]
        matched = roles_df[roles_df["job_role"].str.lower().str.strip() == alias_role.lower().strip()]
        if not matched.empty:
            return matched.iloc[0]

    # 3. Substring match
    for _, r in roles_df.iterrows():
        r_name = r["job_role"].lower()
        if r_name in clean or clean in r_name:
            return r

    # 4. Keyword token matching
    tokens = set(clean.split())
    for _, r in roles_df.iterrows():
        r_tokens = set(r["job_role"].lower().split())
        if tokens & r_tokens:
            return r

    # 5. Fallback to Software Engineer or first role
    sw = roles_df[roles_df["job_role"].str.lower().str.contains("software engineer")]
    if not sw.empty:
        return sw.iloc[0]
    return roles_df.iloc[0]

def suggest_roles(user_skills=None, resume_text="", top_k=3):
    """
    Ranks top 3 best-fit roles based on TF-IDF cosine similarity and skill overlap.
    """
    roles, _, _ = load_data()
    all_known = set()
    for _, row in roles.iterrows():
        all_known.update(split_skills(row.get("required_skills", "")))
        all_known.update(split_skills(row.get("optional_skills", "")))

    user_skills = [canonical_skill(s) for s in (user_skills or []) if canonical_skill(s)]
    resume_found = extract_skills_from_text(resume_text, all_known) if resume_text else []
    combined = sorted(set(user_skills) | set(resume_found))

    ranked = []
    for _, row in roles.iterrows():
        req = split_skills(row.get("required_skills", ""))
        opt = split_skills(row.get("optional_skills", ""))
        matched_req = [s for s in req if s in combined]
        matched_opt = [s for s in opt if s in combined]
        
        req_ratio = (len(matched_req) / len(req)) if req else 0.0
        similarity = calculate_similarity(combined, req + opt)
        score = round((0.60 * req_ratio + 0.40 * similarity) * 100, 1)

        ranked.append({
            "job_id": row.get("job_id", ""),
            "job_role": row["job_role"],
            "category": row.get("category", "General"),
            "match_score": score,
            "matched_skills": matched_req + matched_opt,
            "missing_required": [s for s in req if s not in combined]
        })

    ranked.sort(key=lambda x: x["match_score"], reverse=True)
    return ranked[:top_k]

def analyze_profile(target_role, user_skills, education="", experience=0, resume_text=""):
    """
    Performs AI-driven skill-gap analysis, smart readiness scoring with weighted required vs
    optional skills, TF-IDF cosine similarity, experience factoring, and resource recommendations.
    """
    roles, certs, resources = load_data()

    role = resolve_role(target_role, roles)
    required = split_skills(role["required_skills"])
    optional = split_skills(role["optional_skills"])

    all_known = set(required + optional)
    for _, row in roles.iterrows():
        all_known.update(split_skills(row.get("required_skills", "")))
        all_known.update(split_skills(row.get("optional_skills", "")))

    resume_found = extract_skills_from_text(resume_text, all_known)
    combined = sorted(set(canonical_skill(s) for s in user_skills if canonical_skill(s)) | set(resume_found))

    matched = [s for s in required if s in combined]
    missing = [s for s in required if s not in combined]
    optional_matched = [s for s in optional if s in combined]

    # Required skills match score (heavier weight)
    req_score = (len(matched) / len(required) * 100) if required else 0
    # Optional skills bonus score
    opt_score = (len(optional_matched) / len(optional) * 100) if optional else 0
    # TF-IDF Cosine Similarity
    similarity_score = calculate_similarity(combined, required) * 100

    # Experience level scoring
    try:
        exp = max(0.0, float(experience or 0))
    except (ValueError, TypeError):
        exp = 0.0

    exp_level_str = str(role.get("experience_level", "")).lower()
    if "fresher" in exp_level_str:
        exp_score = 100.0 if exp >= 0 else 0.0
    elif "junior" in exp_level_str:
        exp_score = min(100.0, (exp / 2.0) * 100.0)
    else:
        exp_score = min(100.0, (exp / 5.0) * 100.0)

    # Project / Certification detection in resume text
    resume_lower = str(resume_text or "").lower()
    project_bonus = 5.0 if ("project" in resume_lower or "github" in resume_lower) else 0.0
    cert_bonus = 5.0 if ("certified" in resume_lower or "certification" in resume_lower) else 0.0

    # Weighted job readiness calculation:
    # 50% Required Skills + 10% Optional Skills + 20% TF-IDF Cosine Similarity + 10% Experience + 10% Projects/Certs
    readiness = (
        0.50 * req_score +
        0.10 * opt_score +
        0.20 * similarity_score +
        0.10 * exp_score +
        project_bonus + cert_bonus
    )
    readiness = min(100.0, max(0.0, round(readiness, 2)))

    # Fetch role certifications
    role_certs = certs[
        certs["job_role"].str.lower().str.strip() == role["job_role"].lower().strip()
    ].to_dict(orient="records") if "job_role" in certs.columns else []

    # Recommendations for missing skills
    recommendations = []
    if "skill" in resources.columns:
        for skill in missing:
            rows = resources[
                resources["skill"].str.lower().str.strip() == skill.lower().strip()
            ]
            for _, rrow in rows.head(3).iterrows():
                recommendations.append({
                    "skill": skill,
                    "resource_name": rrow.get("resource_name", ""),
                    "provider": rrow.get("provider", "Web"),
                    "resource_type": rrow.get("resource_type", "Course"),
                    "url": rrow.get("url", "#")
                })

    return {
        "job_role": role["job_role"],
        "category": role.get("category", "General"),
        "experience_level": role.get("experience_level", "Fresher"),
        "education": education,
        "user_skills": combined,
        "required_skills": required,
        "matched_skills": matched,
        "missing_skills": missing,
        "optional_skills": optional,
        "optional_matched": optional_matched,
        "skill_score": round(req_score, 2),
        "similarity_score": round(similarity_score, 2),
        "readiness_score": readiness,
        "certifications": role_certs,
        "learning_recommendations": recommendations,
        "guidance": build_guidance(missing, readiness)
    }

def build_guidance(missing, readiness):
    if readiness >= 80:
        level = "Strong match"
        text = "You have a strong skill match. Focus on projects, interview preparation and role-specific certifications."
    elif readiness >= 60:
        level = "Moderate match"
        text = "You have a moderate match. Close the missing skill gaps and build one or two practical projects."
    else:
        level = "Needs improvement"
        text = "Start with the highest-priority missing skills, complete guided courses and build portfolio projects."

    return {
        "level": level,
        "summary": text,
        "priority_order": missing[:5]
    }
