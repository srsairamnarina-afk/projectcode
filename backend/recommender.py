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

def normalize(text):
    text = str(text or "").lower()
    text = re.sub(r"[^a-z0-9+#.\- ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def split_skills(value):
    return [normalize(x) for x in str(value or "").split("|") if normalize(x)]

def load_data():
    roles = pd.read_csv(ROLES_FILE)
    certs = pd.read_csv(CERT_FILE)
    resources = pd.read_csv(RESOURCE_FILE)
    return roles, certs, resources

def extract_skills_from_text(text, known_skills):
    normalized_text = normalize(text)
    found = []
    for skill in known_skills:
        s = normalize(skill)
        if not s:
            continue
        pattern = r"(?<!\w)" + re.escape(s) + r"(?!\w)"
        if re.search(pattern, normalized_text):
            found.append(s)
    return sorted(set(found))

def calculate_similarity(user_skills, required_skills):
    if not user_skills or not required_skills:
        return 0.0
    corpus = [" ".join(required_skills), " ".join(user_skills)]
    vectorizer = TfidfVectorizer()
    matrix = vectorizer.fit_transform(corpus)
    return float(cosine_similarity(matrix[0:1], matrix[1:2])[0][0])

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

def analyze_profile(target_role, user_skills, education="", experience=0, resume_text=""):
    roles, certs, resources = load_data()

    role = resolve_role(target_role, roles)
    required = split_skills(role["required_skills"])
    optional = split_skills(role["optional_skills"])

    all_known = set(required + optional)
    for _, row in roles.iterrows():
        all_known.update(split_skills(row["required_skills"]))
        all_known.update(split_skills(row["optional_skills"]))

    resume_found = extract_skills_from_text(resume_text, all_known)
    combined = sorted(set(normalize(s) for s in user_skills if normalize(s)) | set(resume_found))

    matched = [s for s in required if s in combined]
    missing = [s for s in required if s not in combined]
    optional_matched = [s for s in optional if s in combined]

    skill_score = (len(matched) / len(required) * 100) if required else 0
    similarity_score = calculate_similarity(combined, required) * 100

    try:
        exp = max(0, float(experience or 0))
    except:
        exp = 0

    experience_level = str(role["experience_level"]).lower()
    if "fresher" in experience_level:
        exp_score = 100 if exp >= 0 else 0
    elif "junior" in experience_level:
        exp_score = min(100, exp / 2 * 100)
    else:
        exp_score = min(100, exp / 5 * 100)

    readiness = round(
        0.65 * skill_score +
        0.25 * similarity_score +
        0.10 * exp_score, 2
    )

    role_certs = certs[
        certs["job_role"].str.lower().str.strip() == role["job_role"].lower().strip()
    ].to_dict(orient="records")

    recommendations = []
    for skill in missing:
        rows = resources[
            resources["skill"].str.lower().str.strip() == skill.lower().strip()
        ]
        for _, row in rows.head(3).iterrows():
            recommendations.append({
                "skill": skill,
                "resource_name": row["resource_name"],
                "provider": row["provider"],
                "resource_type": row["resource_type"],
                "url": row["url"]
            })

    return {
        "job_role": role["job_role"],
        "category": role["category"],
        "experience_level": role["experience_level"],
        "education": education,
        "user_skills": combined,
        "required_skills": required,
        "matched_skills": matched,
        "missing_skills": missing,
        "optional_skills": optional,
        "optional_matched": optional_matched,
        "skill_score": round(skill_score, 2),
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
