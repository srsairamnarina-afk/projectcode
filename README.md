# SkillBridge AI 🚀
### AI-Powered Engineering Career Guidance & Skill-Gap Analysis Platform

SkillBridge AI is a comprehensive career guidance and skill-gap analysis web platform designed for engineering students and early-career tech professionals. It bridges the gap between student resumes and modern industry requirements through AI skill extraction, TF-IDF cosine similarity matching, personalized learning roadmaps, ATS resume optimization, AI mock interviews, automated user progress tracking, and an administrative control portal.

---

## 🌟 Key Features

### 🧠 Smarter AI & Recommender Engine
- **TF-IDF & Cosine Similarity:** Recommends roles and matches skills using Scikit-Learn vectorization.
- **Synonym & Alias Normalization:** Intelligently maps abbreviations to industry terminology (e.g., `JS` → `JavaScript`, `ML` → `Machine Learning`, `K8s` → `Kubernetes`, `Node` → `Node.js`).
- **Weighted Job-Readiness Scoring:** Weights required skills (50%) higher than optional skills (10%), with factors for TF-IDF similarity (20%), experience (10%), and verified resume projects/certifications (10%).
- **Top-3 Job Role Suggestion:** Ranks the top 3 best-fit roles from a user's skills and resume if they are undecided on their target track.
- **ATS Resume Optimizer:** Flags weak action verbs, calculates match percentages against target job descriptions, and offers bullet-point rewrites.
- **AI Mock Interviewer:** Interactive technical interview simulator with instant scoring and feedback.

### 👥 User Authentication & Progress Tracking
- **Session-Based Authentication:** Secure user registration, login, and logout with hashed passwords (`werkzeug.security`).
- **Personal Dashboard & Growth Line Chart (`/dashboard`):** Records past analyses in MongoDB and visualizes readiness score progression over time via Chart.js.
- **Immediate Profile Routing:** Smooth onboarding routes users to their personal profile upon login.

### 🛡️ Admin Portal (`/admin`)
- **System Metrics & Bar Charts:** Live counts of registered users, evaluations run, average readiness, and Chart.js bar charts for most in-demand roles and common missing skills.
- **Job Role Management:** View, create, and delete job roles with comma-separated skill tagging and CSV export.
- **Dataset Management:** Add or remove certifications and learning resources directly from the UI.
- **User Account Management:** Deactivate/reactivate users and promote/demote administrator privileges.

### 🔒 Security & Engineering Quality
- **File Validation & Cleanup:** 5 MB upload limits, PDF/DOCX whitelist, `secure_filename`, and automatic deletion of temporary files after extraction.
- **Clean JSON Responses:** Suppresses raw internal stack traces in production error states.
- **Graceful Fallbacks:** MongoDB-first architecture that seamlessly falls back to local CSV datasets if the database is temporarily unreachable.
- **Automated Unit Testing:** 11 comprehensive tests in `pytest` utilizing `mongomock`.

---

## 📁 Project Structure

```text
skillbridge_ai/
├── backend/
│   ├── app.py                # Flask application, auth endpoints & admin routes
│   ├── db.py                 # MongoDB Atlas connection, seeding & fallback engine
│   ├── recommender.py        # TF-IDF matching, synonyms, scoring & role ranking
│   ├── ats_optimizer.py      # ATS score analysis & bullet rewriter
│   └── interview_ai.py       # AI mock interview simulation
├── frontend/
│   ├── index.html            # Landing page & integrated login
│   ├── login.html            # Dedicated login page
│   ├── register.html         # User registration page
│   ├── profile.html          # Profile management
│   ├── dashboard.html        # My History & readiness progress chart
│   ├── admin.html            # Administrator management portal
│   ├── analyzer.html         # Resume upload & skill analysis
│   ├── gap.html              # Skill gaps visualization
│   ├── roadmap.html          # Week-by-week learning roadmap
│   ├── certifications.html   # Recommended certifications
│   ├── jobs.html             # Matched job opportunities
│   ├── ats.html              # ATS resume optimizer
│   ├── interview.html        # AI mock interview page
│   ├── css/style.css         # Modern responsive stylesheet
│   └── js/
│       ├── nav.js            # Dynamic navigation & role-based menu
│       └── app.js            # Frontend logic
├── datasets/
│   ├── job_roles.csv         # Canonical roles & skill sets
│   ├── certifications.csv   # Industry credentials
│   └── learning_resources.csv# Curated courses & guides
├── tests/
│   ├── test_app.py           # Flask route & auth tests with mongomock
│   └── test_recommender.py   # AI matching, synonym & scoring unit tests
├── uploads/                  # Temporary upload scratch directory
├── requirements.txt          # Production dependencies
├── requirements-dev.txt      # Testing dependencies (pytest, mongomock)
├── Procfile                  # Render / Gunicorn web process definition
├── .env.example              # Sample environment configuration
├── .gitignore                # Excluded files and credentials
└── README.md                 # Project documentation
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (copied from `.env.example`):

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/skillbridge_ai?retryWrites=true&w=majority` |
| `SECRET_KEY` | Flask session secret key | `super_secure_random_string_32_chars` |
| `PORT` | Local or production port | `5001` |

---

## 🍃 MongoDB Atlas Setup

1. Visit [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and register for a free M0 cluster.
2. Under **Security → Database Access**, create a database user (e.g., `skillbridge_user`) with read/write privileges.
3. Under **Security → Network Access**, add IP address `0.0.0.0/0` (allow access from anywhere) to allow connections from local development and Render.
4. Under **Database → Deployment**, click **Connect → Drivers (Python)**.
5. Copy your connection string into `.env`:
   ```env
   MONGO_URI=mongodb+srv://skillbridge_user:<your_password>@cluster0.mongodb.net/skillbridge_ai?retryWrites=true&w=majority
   ```
*(Note: If no `MONGO_URI` is provided, SkillBridge AI runs automatically in fallback mode using the local CSV datasets without crashing).*

---

## 💻 Run on Windows Locally

### 1. Open Terminal & Navigate to Project
```powershell
cd "d:\IT'S ME\Project\Final year project\projectcode-main\projectcode-main"
```

### 2. Activate Virtual Environment
```powershell
venv\Scripts\activate
```

### 3. Install Dependencies
```powershell
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### 4. Start the Application
```powershell
python backend/app.py
```

### 5. Open in Browser
- **Application:** [http://127.0.0.1:5001](http://127.0.0.1:5001)
- **Default Admin Login:** Email: `admin@skillbridge.ai` | Password: `AdminPassword123!`
- **Admin Portal:** [http://127.0.0.1:5001/admin](http://127.0.0.1:5001/admin)
- **Health Check:** [http://127.0.0.1:5001/health](http://127.0.0.1:5001/health)

---

## 🧪 Run Automated Tests

The test suite runs with `pytest` using `mongomock` so your live database is never touched.

```powershell
pytest -v
```

Expected output:
```text
tests/test_app.py::test_health_endpoint PASSED                           [  9%]
tests/test_app.py::test_auth_register_and_login PASSED                   [ 18%]
tests/test_app.py::test_analyze_api PASSED                               [ 27%]
tests/test_app.py::test_admin_protection PASSED                          [ 36%]
tests/test_recommender.py::test_normalize_and_synonyms PASSED            [ 45%]
tests/test_recommender.py::test_extract_skills_from_text PASSED          [ 54%]
tests/test_recommender.py::test_calculate_similarity PASSED              [ 63%]
tests/test_recommender.py::test_analyze_profile_data_scientist PASSED    [ 72%]
tests/test_recommender.py::test_analyze_profile_edge_case_empty PASSED   [ 81%]
tests/test_recommender.py::test_analyze_profile_edge_case_unknown_role PASSED [ 90%]
tests/test_recommender.py::test_suggest_roles PASSED                     [100%]
======================== 11 passed in 4.04s ========================
```

---

## ☁️ Step-by-Step Render Deployment

1. Push your repository to GitHub.
2. Log in to [Render](https://render.com) and click **New + → Web Service**.
3. Select your GitHub repository.
4. Configure service settings:
   - **Name:** `skillbridge-ai`
   - **Environment:** `Python 3`
   - **Region:** Choose the closest region (e.g., Oregon or Frankfurt).
   - **Branch:** `main`
   - **Root Directory:** *(leave blank if repository root contains Procfile)*
   - **Build Command:**
     ```bash
     pip install -r requirements.txt
     ```
   - **Start Command:**
     ```bash
     gunicorn backend.app:app
     ```
5. In **Environment Variables**, add:
   - `MONGO_URI`: Your MongoDB Atlas URI connection string
   - `SECRET_KEY`: A 32-character random string
   - `ADMIN_EMAIL`: `admin@skillbridge.ai`
   - `ADMIN_PASSWORD`: Your chosen strong administrator password
6. Click **Deploy Web Service**.
7. Render will install all dependencies, bind to the dynamic `$PORT`, verify the `/health` endpoint, and launch your live URL.
