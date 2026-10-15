import os
import re
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env is loaded
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "datasets"

ACTION_VERBS = {
    "accelerated", "achieved", "analyzed", "architected", "automated", 
    "built", "collaborated", "constructed", "created", "decreased", 
    "delivered", "deployed", "designed", "developed", "devised", 
    "directed", "eliminated", "engineered", "established", "executed", 
    "expanded", "expedited", "formulated", "generated", "implemented", 
    "improved", "increased", "initiated", "integrated", "launched", 
    "led", "maximized", "mentored", "minimized", "modernized", 
    "optimized", "orchestrated", "overhauled", "pioneered", "reduced", 
    "refactored", "resolved", "restructured", "revamped", "scaled", 
    "spearheaded", "streamlined", "strengthened", "transformed", "upgraded"
}

WEAK_PHRASES = [
    "responsible for", "helped with", "worked on", "assisted in", 
    "duties included", "handled", "participated in", "tasked with", 
    "part of a team that", "familiar with"
]

SAMPLE_BULLET_REWRITES = [
    {
        "original": "Responsible for developing backend APIs and databases.",
        "optimized": "Architected and deployed 18+ RESTful microservice APIs in Python & PostgreSQL, reducing request latency by 34% across 100K+ monthly queries.",
        "category": "Backend Development",
        "impact": "+34% Speed"
    },
    {
        "original": "Worked on machine learning models for data classification.",
        "optimized": "Engineered an end-to-end predictive machine learning pipeline using Scikit-Learn & Pandas, achieving 92.5% accuracy and saving 12 hours of weekly manual reporting.",
        "category": "Data Science & AI",
        "impact": "92.5% Accuracy"
    },
    {
        "original": "Helped team build website frontend with React.",
        "optimized": "Spearheaded responsive React & Tailwind UI design system, enhancing page load speed by 40% and boosting user engagement by 25%.",
        "category": "Frontend Development",
        "impact": "+40% Performance"
    },
    {
        "original": "Handled CI/CD pipelines and cloud deployments.",
        "optimized": "Automated Docker & GitHub Actions CI/CD deployment pipelines to AWS ECS, trimming release cycle time from 4 hours to under 15 minutes.",
        "category": "Cloud & DevOps",
        "impact": "94% Faster Deployments"
    }
]

def clean_text(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()

def extract_contact_info(text):
    email = re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", text)
    phone = re.findall(r"(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}", text)
    linkedin = re.findall(r"linkedin\.com/in/[\w-]+", text, re.IGNORECASE)
    github = re.findall(r"github\.com/[\w-]+", text, re.IGNORECASE)
    
    return {
        "email": email[0] if email else None,
        "phone": phone[0] if phone else None,
        "linkedin": linkedin[0] if linkedin else None,
        "github": github[0] if github else None
    }

def detect_sections(text):
    text_lower = text.lower()
    sections = {
        "Contact Information": bool(re.search(r"[\w\.-]+@[\w\.-]+\.\w+", text)),
        "Professional Summary": bool(re.search(r"\b(summary|objective|about me|profile)\b", text_lower)),
        "Work Experience": bool(re.search(r"\b(experience|employment|work history|internship)\b", text_lower)),
        "Education": bool(re.search(r"\b(education|academic|university|degree|college)\b", text_lower)),
        "Skills": bool(re.search(r"\b(skills|technical skills|technologies|competencies)\b", text_lower)),
        "Projects": bool(re.search(r"\b(projects|personal projects|academic projects)\b", text_lower))
    }
    return sections

def extract_tokens(text):
    # Normalize and extract clean alphanumeric words
    tokens = re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.-]{1,24}\b", text.lower())
    stopwords = {
        "and", "the", "with", "for", "from", "that", "this", "have", "been", 
        "will", "about", "your", "more", "into", "some", "than", "them", 
        "their", "they", "were", "what", "when", "where", "which", "while", 
        "who", "whom", "why", "would", "could", "should", "shall", "does",
        "doing", "done", "must", "might", "also", "each", "both", "such",
        "seeking", "looking", "hiring", "proficient", "proficiency", "experience", 
        "experienced", "skills", "skilled", "ability", "strong", "knowledge", 
        "understanding", "responsibilities", "requirements", "qualifications", 
        "preferred", "plus", "candidate", "candidates", "work", "working", 
        "team", "teams", "role", "roles", "job", "company", "years", "degree", 
        "required", "highly", "desired", "must", "well", "good", "across", 
        "within", "other", "using", "used", "like", "need", "needs", "able"
    }
    return [t for t in tokens if t not in stopwords and len(t) > 2]

def extract_metrics(text):
    # Detect quantifiable figures: percentages, numbers, currency, ratios
    metrics = re.findall(r"\b(?:\d+%(?:\s+increase|\s+decrease|\s+growth|\s+reduction)?|\$\d+[\d,.]*(?:k|m|b)?|\d+x|\d+\+?\s*(?:users|clients|teams|projects|apis|requests|records|ms|seconds|minutes|hours))\b", text, re.IGNORECASE)
    return list(set(metrics))

def find_bullets(text):
    lines = text.split("\n")
    bullets = []
    for line in lines:
        stripped = line.strip()
        if "@" in stripped or "email" in stripped.lower() or "phone" in stripped.lower():
            continue
        if stripped.startswith(("-", "•", "*", "–", "—", ">", "1.", "2.", "3.", "4.", "5.")) or (len(stripped) > 20 and stripped[0].isupper() and (stripped.endswith(".") or len(stripped) < 140)):
            clean_b = re.sub(r"^[-•*–—>\d.]+\s*", "", stripped).strip()
            if len(clean_b) > 15:
                bullets.append(clean_b)
    return bullets

def analyze_ats(resume_text, job_description="", target_role="Software Engineer"):
    resume_clean = clean_text(resume_text)
    jd_clean = clean_text(job_description)

    if not resume_clean:
        return {"error": "Resume text is empty or could not be read."}

    # If JD is not provided, generate a target role baseline
    if not jd_clean:
        jd_clean = f"Seeking a {target_role} proficient in data structures, algorithms, problem solving, agile workflows, modern engineering practices, clean code, unit testing, Git version control, CI/CD, and collaborative team communication."

    # 1. Contact Information & Sections
    contacts = extract_contact_info(resume_text)
    sections = detect_sections(resume_text)
    
    sections_found = sum(1 for v in sections.values() if v)
    total_sections = len(sections)
    structure_score = round((sections_found / total_sections) * 100)

    # 2. Keywords Analysis
    jd_tokens = extract_tokens(jd_clean)
    resume_tokens = set(extract_tokens(resume_clean))

    # Frequency analysis of top JD terms
    freq_map = {}
    for t in jd_tokens:
        freq_map[t] = freq_map.get(t, 0) + 1

    # Sort keywords by frequency in JD
    top_jd_keywords = sorted(freq_map.keys(), key=lambda k: freq_map[k], reverse=True)[:35]

    matched_keywords = [k for k in top_jd_keywords if k in resume_tokens]
    missing_keywords = [k for k in top_jd_keywords if k not in resume_tokens]

    keyword_score = round((len(matched_keywords) / max(1, len(top_jd_keywords))) * 100)

    # 3. Action Verbs & Metrics (Impact Score)
    resume_words = set(re.findall(r"\b[a-zA-Z]+\b", resume_clean.lower()))
    found_action_verbs = list(resume_words & ACTION_VERBS)
    found_metrics = extract_metrics(resume_text)

    # Detect weak phrases
    found_weak_phrases = [p for p in WEAK_PHRASES if p in resume_clean.lower()]

    action_score = min(100, int((len(found_action_verbs) / 7) * 50) + int((len(found_metrics) / 4) * 50))

    # 4. Readability & Formatting
    word_count = len(resume_clean.split())
    if 350 <= word_count <= 950:
        length_status = "Optimal (1–2 Pages)"
        length_score = 95
    elif word_count < 350:
        length_status = "Too Short (Under 350 words)"
        length_score = 60
    else:
        length_status = "Long (Over 950 words)"
        length_score = 75

    readability_score = round(length_score)

    # Overall Weighted ATS Score
    # 40% Keyword Match + 25% Section Structure + 20% Impact/Action Verbs + 15% Formatting
    overall_score = round(
        (0.40 * keyword_score) +
        (0.25 * structure_score) +
        (0.20 * action_score) +
        (0.15 * readability_score)
    )
    overall_score = max(15, min(99, overall_score))

    # 5. Tailored Bullet-Point Rewrites
    bullets = find_bullets(resume_text)
    tailored_rewrites = []

    # Look for bullets with weak phrases to rewrite
    for b in bullets:
        b_lower = b.lower()
        has_weak = any(w in b_lower for w in WEAK_PHRASES)
        has_no_metric = not re.search(r"\d", b)
        
        if (has_weak or has_no_metric) and len(tailored_rewrites) < 3:
            # Strip weak passive phrase prefix
            stripped_content = re.sub(r"^(?:responsible for|worked on|helped with|assisted in|duties included|handled|participated in|tasked with)\s+", "", b.strip(), flags=re.IGNORECASE)
            stripped_content = stripped_content.lstrip('-•* \t')
            first_word = stripped_content.split()[0].lower() if stripped_content.split() else ""
            
            # Pick strong action verb
            if first_word.endswith("ing"):
                best_verb = first_word[:-3] + "ed"
            elif first_word in ACTION_VERBS:
                best_verb = first_word.capitalize()
            else:
                best_verb = "Architected and delivered"
            
            tailored_rewrites.append({
                "original": b,
                "optimized": f"{best_verb.capitalize()} {stripped_content.rstrip('.')} resulting in a 32% efficiency improvement across core deployments.",
                "category": "Impact & Metric Enhancement",
                "impact": "Quantifiable (+32%)"
            })

    # Supplement with curated high-impact templates if needed
    for template in SAMPLE_BULLET_REWRITES:
        if len(tailored_rewrites) >= 3:
            break
        if template not in tailored_rewrites:
            tailored_rewrites.append(template)

    # Actionable Improvement Checklist
    improvements = []
    if missing_keywords:
        improvements.append(f"Incorporate missing high-priority keywords: **{', '.join(missing_keywords[:6])}** in your Skills or Experience section.")
    if len(found_metrics) < 3:
        improvements.append("Quantify your achievements! Add numbers, percentages (e.g. *+30% speed*), or scales (*10K+ users*) to demonstrate measurable impact.")
    if not sections.get("Projects"):
        improvements.append("Add a dedicated **Projects** section detailing your personal or academic software builds, tech stack, and GitHub links.")
    if found_weak_phrases:
        improvements.append(f"Replace passive phrases like *'{found_weak_phrases[0]}'* with strong power verbs like *'Architected'*, *'Spearheaded'*, or *'Optimized'*.")
    if not contacts.get("linkedin") and not contacts.get("github"):
        improvements.append("Include your **LinkedIn** and **GitHub** profile URLs at the top of your resume for recruiter credibility.")

    return {
        "overall_score": overall_score,
        "keyword_score": keyword_score,
        "structure_score": structure_score,
        "action_score": action_score,
        "readability_score": readability_score,
        "word_count": word_count,
        "length_status": length_status,
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords[:15],
        "sections": sections,
        "contacts": contacts,
        "found_action_verbs": found_action_verbs[:10],
        "found_metrics": found_metrics[:8],
        "tailored_rewrites": tailored_rewrites,
        "improvements": improvements
    }
