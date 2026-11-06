import pytest
import sys
from pathlib import Path

# Add backend to sys.path
TEST_DIR = Path(__file__).resolve().parent
PROJECT_DIR = TEST_DIR.parent
BACKEND_DIR = PROJECT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from recommender import (
    normalize,
    canonical_skill,
    split_skills,
    calculate_similarity,
    extract_skills_from_text,
    suggest_roles,
    analyze_profile,
    build_guidance
)

def test_normalize_and_synonyms():
    assert normalize("JS") == "javascript"
    assert normalize("ML") == "machine learning"
    assert normalize("Python3") == "python3"
    assert canonical_skill("react.js") == "react"

def test_extract_skills_from_text():
    known_skills = ["javascript", "machine learning", "python", "sql", "docker"]
    text = "Developed web applications using JS and Python. Built ML models and deployed with Docker."
    extracted = extract_skills_from_text(text, known_skills)
    
    assert "javascript" in extracted
    assert "machine learning" in extracted
    assert "python" in extracted
    assert "docker" in extracted
    assert "sql" not in extracted

def test_calculate_similarity():
    # Empty lists return 0.0
    assert calculate_similarity([], ["python", "sql"]) == 0.0
    assert calculate_similarity(["python"], []) == 0.0

    # Matching lists return 1.0
    sim = calculate_similarity(["python", "sql"], ["python", "sql"])
    assert sim >= 0.99

    # Partial match
    sim_partial = calculate_similarity(["python"], ["python", "sql", "docker"])
    assert 0.0 < sim_partial < 1.0

def test_analyze_profile_data_scientist():
    result = analyze_profile(
        target_role="Data Scientist",
        user_skills=["python", "sql", "pandas"],
        education="B.Tech Computer Science",
        experience=1,
        resume_text="Hands-on experience with Python, Pandas, and SQL database queries."
    )

    assert result["job_role"] == "Data Scientist"
    assert "python" in result["matched_skills"]
    assert "sql" in result["matched_skills"]
    assert "pandas" in result["matched_skills"]
    assert result["readiness_score"] > 0
    assert isinstance(result["missing_skills"], list)
    assert "guidance" in result

def test_analyze_profile_edge_case_empty():
    # Empty skills and resume
    result = analyze_profile(
        target_role="Software Engineer",
        user_skills=[],
        education="",
        experience=0,
        resume_text=""
    )

    assert result["job_role"] == "Software Engineer"
    assert len(result["matched_skills"]) == 0
    assert len(result["missing_skills"]) > 0
    assert result["readiness_score"] >= 0.0
    assert result["guidance"]["level"] == "Needs improvement"

def test_analyze_profile_edge_case_unknown_role():
    # Unknown role string should fall back gracefully rather than crash
    result = analyze_profile(
        target_role="Galactic Astronaut Engineer",
        user_skills=["python"],
        education="",
        experience=0,
        resume_text=""
    )

    assert "job_role" in result
    assert result["readiness_score"] >= 0

def test_suggest_roles():
    suggestions = suggest_roles(
        user_skills=["python", "pandas", "numpy", "statistics"],
        resume_text="Built machine learning models using Python and Pandas.",
        top_k=3
    )

    assert len(suggestions) <= 3
    assert len(suggestions) > 0
    top_role = suggestions[0]
    assert "job_role" in top_role
    assert "match_score" in top_role
    assert top_role["match_score"] > 0
