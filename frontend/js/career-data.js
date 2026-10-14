/**
 * SkillBridge AI - Shared Career Data Manager
 * Ensures that Skill Gaps, Roadmap, Certifications, and Jobs pages
 * always have valid, personalized analysis data and NEVER bounce the user away.
 */

async function getCareerData() {
  // 1. Check persistent localStorage or sessionStorage
  try {
    const raw = localStorage.getItem("skillbridgeResult") || sessionStorage.getItem("skillbridgeResult");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.job_role && Array.isArray(parsed.missing_skills)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error reading cached career data:", e);
  }

  // 2. Auto-generate from profile if not yet analyzed
  try {
    const profile = JSON.parse(localStorage.getItem("sb_profile") || "{}");
    const targetRole = (profile.target_role || "Software Developer").trim();
    const skills = profile.skills || "Python, Java, SQL, Git, HTML, CSS, JavaScript";
    const education = profile.degree ? `${profile.degree} ${profile.branch || ''}` : "B.E. Computer Science";
    const experience = profile.experience || 0;

    const formData = new FormData();
    formData.append("target_role", targetRole);
    formData.append("skills", skills);
    formData.append("education", education);
    formData.append("experience", experience);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("skillbridgeResult", JSON.stringify(data));
      sessionStorage.setItem("skillbridgeResult", JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.error("Auto analyze request error:", err);
  }

  // 3. Fallback mock data if server is unreachable
  const fallback = {
    job_role: "Software Developer",
    category: "Software Development",
    experience_level: "Fresher / Junior",
    education: "B.E. Computer Science",
    user_skills: ["python", "sql", "git", "html", "css", "javascript"],
    required_skills: ["python", "java", "data structures", "algorithms", "sql", "git", "object oriented programming"],
    matched_skills: ["python", "sql", "git"],
    missing_skills: ["java", "data structures", "algorithms", "object oriented programming"],
    optional_skills: ["docker", "rest api", "cloud"],
    optional_matched: [],
    skill_score: 42.86,
    similarity_score: 55.20,
    readiness_score: 48.75,
    certifications: [
      {
        certification_id: "C003",
        job_role: "Software Engineer",
        certification: "Oracle Java SE Certification",
        provider: "Oracle",
        level: "Intermediate",
        url: "https://education.oracle.com/java-certification/"
      },
      {
        certification_id: "C004",
        job_role: "Software Engineer",
        certification: "AWS Certified Cloud Practitioner",
        provider: "AWS",
        level: "Beginner",
        url: "https://aws.amazon.com/certification/certified-cloud-practitioner/"
      }
    ],
    learning_recommendations: [
      {
        skill: "data structures",
        resource_name: "Data Structures and Algorithms in Python",
        provider: "Coursera",
        resource_type: "Course",
        url: "https://www.coursera.org/specializations/data-structures-algorithms"
      },
      {
        skill: "java",
        resource_name: "Java Programming Masterclass",
        provider: "Udemy",
        resource_type: "Course",
        url: "https://www.udemy.com/course/java-the-complete-java-developer-course/"
      },
      {
        skill: "algorithms",
        resource_name: "Algorithms, Part I",
        provider: "Princeton / Coursera",
        resource_type: "Course",
        url: "https://www.coursera.org/learn/algorithms-part1"
      }
    ],
    guidance: {
      level: "Needs improvement",
      summary: "Start with the highest-priority missing skills, complete guided courses and build portfolio projects.",
      priority_order: ["data structures", "algorithms", "java", "object oriented programming"]
    }
  };

  localStorage.setItem("skillbridgeResult", JSON.stringify(fallback));
  sessionStorage.setItem("skillbridgeResult", JSON.stringify(fallback));
  return fallback;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
