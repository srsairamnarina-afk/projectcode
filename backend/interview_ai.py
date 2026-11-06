import os
import json
import urllib.request
import urllib.error
import re
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv()

def get_api_key():
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

def call_gemini(messages, system_instruction=None, response_mime_type=None, max_tokens=1000):
    api_key = get_api_key()
    if not api_key:
        return {"error": "GEMINI_API_KEY not configured"}
    
    candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest"]
    
    contents = []
    for msg in messages:
        role = "model" if msg.get("role") == "assistant" else "user"
        contents.append({
            "role": role,
            "parts": [{"text": msg.get("content", "")}]
        })
        
    gen_config = {
        "temperature": 0.7,
        "maxOutputTokens": max_tokens
    }
    if response_mime_type:
        gen_config["responseMimeType"] = response_mime_type
        
    payload = {
        "contents": contents,
        "generationConfig": gen_config
    }
    
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
        
    data = json.dumps(payload).encode("utf-8")
    last_error = None

    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                result = json.loads(response.read().decode("utf-8"))
                if "candidates" in result and len(result["candidates"]) > 0:
                    text = result["candidates"][0]["content"]["parts"][0]["text"]
                    return {"reply": text}
                else:
                    return {"error": "Invalid response format from AI provider."}
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            last_error = f"AI API Error: {e.code} - {err_msg}"
            if e.code in (503, 429, 404):
                continue
            return {"error": last_error}
        except Exception as e:
            last_error = f"Failed to connect to AI API: {str(e)}"
            continue

    return {"error": last_error or "All candidate AI models were unavailable."}

def build_system_prompt(data):
    role = data.get("target_role", "Software Professional")
    skills = ", ".join(data.get("matched_skills", []))
    gaps = ", ".join(data.get("missing_skills", []))
    interview_type = data.get("interview_type", "Mixed")
    difficulty = data.get("difficulty", "Intermediate")
    num_questions = data.get("num_questions", 5)
    
    prompt = (
        f"You are Sarah, an expert, professional female technical interviewer and career coach for the role of {role}.\n"
        f"Your name is Sarah. In Phase 1 (Welcome), warmly introduce yourself as Sarah.\n"
        f"You are conducting a {difficulty} level {interview_type} interview.\n"
        f"The candidate's acquired skills: {skills}.\n"
        f"The candidate's identified skill gaps (needs improvement): {gaps}.\n\n"
        "STRICT INTERVIEW STRUCTURE:\n"
        f"This interview will consist of exactly {num_questions} main questions, plus occasional follow-ups.\n"
        "Phase 1: Welcome - Greet the candidate, introduce yourself as Sarah, and briefly explain the format.\n"
        "Phase 2: Introduction - Ask them to introduce themselves and their journey.\n"
        "Phase 3: Background - Ask about their acquired skills and relevant projects.\n"
        "Phase 4: Core Interview - Ask technical and behavioral questions relevant to their target role. Test their knowledge, including touching on their skill gaps to see if they've improved.\n"
        "Phase 5: Follow-ups - If an answer is brief or weak, ask a clarifying follow-up before moving to a new topic.\n"
        "Phase 6: Candidate Questions - Ask if they have any questions for you.\n"
        "Phase 7: Closing - Formally thank the candidate and end the interview.\n\n"
        "RULES:\n"
        "1. NEVER give the answers away.\n"
        "2. Do NOT break character. You are Sarah, the interviewer.\n"
        "3. Keep your responses concise (1-2 paragraphs max).\n"
        "4. Ask exactly one question at a time.\n"
        "5. Respond naturally to the candidate's answers."
    )
    return prompt

def _extract_meta_from_prompt(system_prompt):
    role_match = re.search(r"role of ([^.\n]+)", system_prompt or "")
    role = role_match.group(1).strip() if role_match else "Software Professional"
    
    gaps_match = re.search(r"identified skill gaps \(needs improvement\): ([^.\n]+)", system_prompt or "")
    gaps = [g.strip() for g in gaps_match.group(1).split(",") if g.strip()] if gaps_match else []
    
    skills_match = re.search(r"acquired skills: ([^.\n]+)", system_prompt or "")
    skills = [s.strip() for s in skills_match.group(1).split(",") if s.strip()] if skills_match else []
    
    return role, skills, gaps

def generate_fallback_start(context_data, sys_prompt):
    role = context_data.get("target_role", "Software Professional")
    diff = context_data.get("difficulty", "Intermediate")
    skills = context_data.get("matched_skills", [])
    skills_sample = ", ".join(skills[:3]) if skills else "your core technical stack"
    
    reply = (
        f"Hello! Welcome to your {diff}-level mock interview for the {role} role. "
        f"My name is Sarah, and I will be conducting your session today. "
        f"We'll explore your hands-on experience with {skills_sample}, real-world problem-solving, and system design thinking. "
        f"To get started, please introduce yourself and tell me a bit about your background and recent projects."
    )
    return {
        "reply": reply,
        "system_prompt": sys_prompt
    }

def generate_fallback_message(system_prompt, conversation_history):
    role, skills, gaps = _extract_meta_from_prompt(system_prompt)
    user_msgs = [m for m in conversation_history if m.get("role") == "user"]
    q_index = len(user_msgs)
    
    skill_highlight = skills[0] if skills else "Python & Software Engineering"
    gap_highlight = gaps[0] if gaps else "System Scalability & Performance Optimization"
    
    if q_index == 1:
        reply = (
            f"Thank you for sharing that overview! Let's dive right into your technical experience. "
            f"Could you walk me through a challenging problem or project where you worked extensively with {skill_highlight}? "
            f"Specifically, what technical trade-offs did you evaluate and how did you implement the solution?"
        )
    elif q_index == 2:
        reply = (
            f"That's a very clear explanation of your architecture and design decisions. "
            f"For a {role}, proficiency with {gap_highlight} is especially important. "
            f"How would you approach {gap_highlight} in a production environment, and what potential failure modes or edge cases would you guard against?"
        )
    elif q_index == 3:
        reply = (
            f"Great technical perspective. Now let's explore your debugging and observability skills: "
            f"Suppose an API endpoint in your service starts exhibiting intermittent 500 errors and elevated p99 latency during peak traffic. "
            f"What systematic steps and telemetry tools would you use to isolate and resolve the root cause?"
        )
    elif q_index == 4:
        reply = (
            f"Well structured troubleshooting methodology. From a collaboration and teamwork angle: "
            f"Can you describe an experience where you had a differing architectural opinion with a teammate or stakeholder? "
            f"How did you present your arguments, navigate the discussion, and achieve alignment?"
        )
    elif q_index == 5:
        reply = (
            f"Excellent communication and teamwork mindset. That covers our core technical and behavioral questions for today! "
            f"Before we conclude the session, do you have any questions for me about the {role} position, engineering standards, or company growth?"
        )
    else:
        reply = (
            f"Thank you very much for your time and thoughtful responses today! "
            f"You communicated clearly and demonstrated solid technical understanding. "
            f"You can now click 'End & Evaluate' below to review your comprehensive performance report and scoring breakdown."
        )
        
    return {"reply": reply}

def generate_fallback_evaluation(system_prompt, conversation_history):
    role, skills, gaps = _extract_meta_from_prompt(system_prompt)
    user_msgs = [m for m in conversation_history if m.get("role") == "user"]
    
    total_answers = len(user_msgs)
    total_words = sum(len(m.get("content", "").split()) for m in user_msgs)
    avg_words = total_words / max(1, total_answers)
    
    if total_answers == 0:
        return {
            "evaluation": {
                "overall_feedback": "The interview session ended before answers were submitted. Please complete the questions to generate a full evaluation.",
                "categories": [
                    {"name": "Technical Knowledge", "score": 0, "max": 10, "feedback": "No answers provided."},
                    {"name": "Communication", "score": 0, "max": 10, "feedback": "Session ended before evaluation."}
                ],
                "strengths": ["Initiated the mock interview session."],
                "improvements": ["Complete all interview questions for full evaluation."],
                "recommended_topics": [role, "Core Technical Principles"],
                "question_feedback": []
            }
        }
    
    # Calculate realistic scores based on engagement
    tech_score = 8 if avg_words > 25 else (7 if avg_words > 10 else 6)
    comm_score = 8 if avg_words > 20 else 7
    problem_score = 8 if total_answers >= 3 else 7
    overall_score = round((tech_score + comm_score + problem_score) / 3, 1)
    
    target_skill = skills[0] if skills else "Core Engineering Stack"
    target_gap = gaps[0] if gaps else "System Design & Optimization"
    
    q_feedback = []
    assistant_msgs = [m for m in conversation_history if m.get("role") == "assistant"]
    for i, u_msg in enumerate(user_msgs):
        q_text = assistant_msgs[i]["content"] if i < len(assistant_msgs) else f"Question {i+1}"
        ans_text = u_msg.get("content", "")
        # Summarize to concise text
        q_clean = q_text.split(".")[0] if "." in q_text else q_text[:80]
        q_feedback.append({
            "question": q_clean,
            "candidate_answer": ans_text[:200] + ("..." if len(ans_text) > 200 else ""),
            "missing": f"Could elaborate further on quantifiable metrics and production-scale trade-offs.",
            "stronger_answer": f"Highlight structured frameworks (e.g., STAR method) and mention monitoring, edge cases, and impact.",
            "practice_topic": target_gap if i % 2 == 1 else target_skill
        })
        
    evaluation = {
        "overall_feedback": (
            f"Strong performance for the {role} mock interview! You demonstrated a clear communication style "
            f"and good foundational command of your key skills ({target_skill}). To advance to senior-level discussions, "
            f"continue practicing in-depth system architecture trade-offs and deepen your experience in {target_gap}."
        ),
        "categories": [
            {
                "name": "Technical Knowledge",
                "score": tech_score,
                "max": 10,
                "feedback": f"Solid understanding of core concepts in {target_skill}. Add more depth regarding low-level architecture."
            },
            {
                "name": "Communication & Structure",
                "score": comm_score,
                "max": 10,
                "feedback": "Articulate, polite, and direct. Great pacing and response clarity."
            },
            {
                "name": "Problem Solving & Methodology",
                "score": problem_score,
                "max": 10,
                "feedback": "Logical approach to debugging and scenario breakdowns."
            },
            {
                "name": "Role Readiness",
                "score": int(overall_score),
                "max": 10,
                "feedback": f"Strong alignment with expectations for {role}. Ready for targeted interview loops."
            }
        ],
        "strengths": [
            f"Clear communication and articulate explanation of background.",
            f"Good familiarity with project workflows and technology stacks.",
            f"Constructive, collaborative mindset in behavioral scenarios."
        ],
        "improvements": [
            f"Incorporate more quantifiable metrics when discussing project outcomes.",
            f"Deepen knowledge in identified skill gaps: {target_gap}."
        ],
        "recommended_topics": [
            target_gap,
            "System Scalability & Resilience",
            "STAR Method for Behavioral Interviews",
            f"Advanced {target_skill} Best Practices"
        ],
        "question_feedback": q_feedback
    }
    
    return {"evaluation": evaluation}

def start_interview(context_data):
    """
    Called when an interview starts.
    context_data contains role, skills, missing_skills, difficulty, etc.
    Returns the first AI message.
    """
    sys_prompt = build_system_prompt(context_data)
    
    api_key = get_api_key()
    if api_key:
        messages = [{"role": "user", "content": "The candidate has joined the interview. Please begin Phase 1 (Welcome) and introduce yourself."}]
        resp = call_gemini(messages, system_instruction=sys_prompt)
        if "reply" in resp:
            return {
                "reply": resp["reply"],
                "system_prompt": sys_prompt
            }
    
    # Graceful fallback simulation mode
    return generate_fallback_start(context_data, sys_prompt)

def handle_message(system_prompt, conversation_history):
    """
    Called on subsequent messages.
    conversation_history should be a list of {"role": "user"|"assistant", "content": "..."}
    """
    api_key = get_api_key()
    if api_key:
        resp = call_gemini(conversation_history, system_instruction=system_prompt)
        if "reply" in resp:
            return resp
            
    # Graceful fallback simulation mode
    return generate_fallback_message(system_prompt, conversation_history)

def evaluate_interview(system_prompt, conversation_history):
    """
    Called at the end of the interview.
    """
    eval_system_instruction = (
        "You are an expert, objective technical interview evaluator and career coach. "
        "Your task is to analyze the candidate's interview responses from the provided transcript "
        "and generate a comprehensive evaluation report in valid JSON format. "
        "You MUST output valid JSON only, following the exact schema provided."
    )

    eval_prompt = (
        "Evaluate the candidate's performance based on the interview transcript. "
        "Provide a final evaluation report in JSON format ONLY matching this exact schema:\n"
        "{\n"
        '  "overall_feedback": "A paragraph summarizing candidate performance",\n'
        '  "categories": [\n'
        '    {"name": "Technical Knowledge", "score": 7, "max": 10, "feedback": "..."},\n'
        '    {"name": "Communication", "score": 8, "max": 10, "feedback": "..."}\n'
        '  ],\n'
        '  "strengths": ["list of candidate strengths"],\n'
        '  "improvements": ["list of areas for improvement"],\n'
        '  "recommended_topics": ["list of recommended study topics"],\n'
        '  "question_feedback": [\n'
        '    {"question": "Question text", "candidate_answer": "Candidate answer summary", "missing": "What was missing", "stronger_answer": "Model answer", "practice_topic": "Topic"}\n'
        '  ]\n'
        "}\n"
    )
    
    api_key = get_api_key()
    if api_key:
        transcript_lines = []
        for msg in conversation_history:
            role = "Interviewer" if msg.get("role") == "assistant" else "Candidate"
            transcript_lines.append(f"{role}: {msg.get('content', '')}")
        transcript_str = "\n\n".join(transcript_lines)
        
        eval_message = f"Interview Transcript:\n\n{transcript_str}\n\nTask:\n{eval_prompt}"
        messages = [{"role": "user", "content": eval_message}]
        
        resp = call_gemini(messages, system_instruction=eval_system_instruction, response_mime_type="application/json", max_tokens=2500)
        if "reply" in resp:
            try:
                raw_reply = resp["reply"].strip()
                if raw_reply.startswith("```json"):
                    raw_reply = raw_reply[7:]
                if raw_reply.startswith("```"):
                    raw_reply = raw_reply[3:]
                if raw_reply.endswith("```"):
                    raw_reply = raw_reply[:-3]
                raw_reply = raw_reply.strip()
                
                try:
                    evaluation = json.loads(raw_reply)
                except Exception:
                    match = re.search(r"\{.*\}", raw_reply, re.DOTALL)
                    if match:
                        evaluation = json.loads(match.group(0))
                    else:
                        raise ValueError("No JSON object found")
                        
                if "overall_feedback" in evaluation and "categories" in evaluation:
                    return {"evaluation": evaluation}
            except Exception:
                pass
                
    # Graceful fallback simulation evaluation
    return generate_fallback_evaluation(system_prompt, conversation_history)

def transcribe_audio(audio_base64, mime_type="audio/webm"):
    """
    Transcribes spoken audio recorded by browser using Gemini multimodal audio capabilities.
    If no Gemini key is available, returns empty string so frontend uses Web Speech API.
    """
    api_key = get_api_key()
    if not api_key:
        return {"transcript": ""}
        
    candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest"]
    
    if "," in audio_base64:
        audio_base64 = audio_base64.split(",", 1)[1]
    
    clean_mime = mime_type.split(";")[0].strip() if mime_type else "audio/webm"

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": clean_mime,
                            "data": audio_base64
                        }
                    },
                    {
                        "text": "Transcribe the candidate's speech from this audio recording accurately and verbatim. Return ONLY the transcribed text. Do not add timestamps, commentary, conversational remarks, or markdown quotes."
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 800
        }
    }
    
    data = json.dumps(payload).encode("utf-8")
    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.loads(response.read().decode("utf-8"))
                if "candidates" in result and len(result["candidates"]) > 0:
                    text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                    return {"transcript": text}
        except Exception:
            continue
            
    return {"transcript": ""}
