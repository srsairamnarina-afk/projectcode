import pytest
import sys
from pathlib import Path
import mongomock

TEST_DIR = Path(__file__).resolve().parent
PROJECT_DIR = TEST_DIR.parent
BACKEND_DIR = PROJECT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import db
from app import app, init_admin

@pytest.fixture
def test_client():
    # Inject mongomock so no real database is ever touched during tests
    mock_client = mongomock.MongoClient()
    mock_db = mock_client["test_skillbridge"]
    db.set_db_instance(mock_db)

    # Seed mock db from CSVs
    db.seed_database_if_empty()
    init_admin()

    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test_secret_key_12345"

    with app.test_client() as client:
        yield client

def test_health_endpoint(test_client):
    res = test_client.get("/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "ok"
    assert data["service"] == "SkillBridge AI"

def test_auth_register_and_login(test_client):
    # Register new user
    reg_res = test_client.post("/api/auth/register", json={
        "email": "student@skillbridge.ai",
        "password": "Password123!",
        "full_name": "Test Student"
    })
    assert reg_res.status_code == 201
    reg_data = reg_res.get_json()
    assert reg_data["user"]["email"] == "student@skillbridge.ai"

    # Duplicate registration should fail
    dup_res = test_client.post("/api/auth/register", json={
        "email": "student@skillbridge.ai",
        "password": "Password123!"
    })
    assert dup_res.status_code == 400

    # Test /api/auth/me session
    me_res = test_client.get("/api/auth/me")
    assert me_res.status_code == 200
    assert me_res.get_json()["logged_in"] is True

    # Logout
    logout_res = test_client.post("/api/auth/logout")
    assert logout_res.status_code == 200

    # Me after logout
    me_after = test_client.get("/api/auth/me")
    assert me_after.get_json()["logged_in"] is False

    # Login again with correct credentials
    login_res = test_client.post("/api/auth/login", json={
        "email": "student@skillbridge.ai",
        "password": "Password123!"
    })
    assert login_res.status_code == 200
    assert login_res.get_json()["user"]["email"] == "student@skillbridge.ai"

    # Login with wrong password
    bad_login = test_client.post("/api/auth/login", json={
        "email": "student@skillbridge.ai",
        "password": "WrongPassword!"
    })
    assert bad_login.status_code == 401

def test_analyze_api(test_client):
    res = test_client.post("/api/analyze", data={
        "target_role": "Software Engineer",
        "skills": "python, java, sql, git",
        "education": "B.S. in Computer Science",
        "experience": "1"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["job_role"] == "Software Engineer"
    assert data["readiness_score"] > 0
    assert "missing_skills" in data
    assert "guidance" in data

def test_admin_protection(test_client):
    # 1. Unauthenticated request to admin API should fail with 401
    unauth_res = test_client.get("/api/admin/stats")
    assert unauth_res.status_code == 401

    # 2. Authenticate as regular user
    test_client.post("/api/auth/register", json={
        "email": "regular_user@example.com",
        "password": "Password123!"
    })
    forbidden_res = test_client.get("/api/admin/stats")
    assert forbidden_res.status_code == 403

    # 3. Authenticate as Admin
    test_client.post("/api/auth/logout")
    admin_login = test_client.post("/api/auth/login", json={
        "email": "admin@skillbridge.ai",
        "password": "AdminPassword123!"
    })
    assert admin_login.status_code == 200

    admin_stats_res = test_client.get("/api/admin/stats")
    assert admin_stats_res.status_code == 200
    stats_data = admin_stats_res.get_json()
    assert "total_users" in stats_data
    assert "average_readiness" in stats_data
