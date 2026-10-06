# SkillBridge AI

SkillBridge AI is a career guidance and skill-gap analysis web application for engineering projects.

## Main features
- User can enter education, skills, experience and target job role through a form.
- User can upload a PDF or DOCX resume.
- Resume text is extracted automatically.
- System identifies missing skills for the selected job role.
- System recommends certifications and learning resources.
- System calculates a simple job-readiness score.
- Job roles and skill requirements are stored in CSV datasets.
- REST API built with Flask.
- Frontend uses HTML, CSS and JavaScript.

## Project structure

skillbridge_ai/
├── backend/
│   ├── app.py
│   └── recommender.py
├── frontend/
│   ├── index.html
│   ├── result.html
│   ├── css/style.css
│   └── js/app.js
├── datasets/
│   ├── job_roles.csv
│   ├── certifications.csv
│   └── learning_resources.csv
├── uploads/
├── models/
├── requirements.txt
└── README.md

## Run on Windows

1. Open the project folder in VS Code.
2. Create a virtual environment:

   python -m venv venv

3. Activate it:

   venv\Scripts\activate

4. Install dependencies:

   pip install -r requirements.txt

5. Start the backend:

   python backend/app.py

6. Open:

   http://127.0.0.1:5000

## Resume support

The application accepts:
- PDF
- DOCX

For a production deployment, add authentication, database storage, virus scanning, file-size limits, HTTPS and stronger resume parsing.

## Dataset format

job_roles.csv contains:
job_id, job_role, category, required_skills, optional_skills, experience_level

Skills are pipe-separated.

certifications.csv contains:
certification_id, job_role, certification, provider, level, url

learning_resources.csv contains:
resource_id, skill, resource_name, provider, resource_type, url
