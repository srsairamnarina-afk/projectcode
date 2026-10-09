import os
import json
import urllib.request
import urllib.error

# We use urllib to avoid adding external dependencies like 'requests' or 'google-genai'
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

def call_gemini(messages, system_instruction=None, response_mime_type=None, max_tokens=800):
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY environment variable is not set. Please configure it to enable AI Mock Interviews."}
    
    candidate_models = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"]
    
    # Format messages for Gemini API
    # Gemini uses {"role": "user"|"model", "parts": [{"text": "..."}]}
    contents = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append({
            "role": role,
            "parts": [{"text": msg["content"]}]
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
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        
        try:
            with urllib.request.urlopen(req) as response:
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
            return {"error": f"Failed to connect to AI API: {str(e)}"}

    return {"error": last_error or "All candidate AI models were unavailable."}

def start_interview(context_data):
    """
    Called when an interview starts.
    context_data contains role, skills, missing_skills, difficulty, etc.
    Returns the first AI message.
    """
    sys_prompt = build_system_prompt(context_data)
    
    # To start, we just send a "start" cue as the user
    messages = [{"role": "user", "content": "The candidate has joined the interview. Please begin Phase 1 (Welcome) and introduce yourself."}]
    
    resp = call_gemini(messages, system_instruction=sys_prompt)
    if "error" in resp:
        return resp
        
    return {
        "reply": resp["reply"],
        "system_prompt": sys_prompt  # return it so frontend can pass it back
    }

def handle_message(system_prompt, conversation_history):
    """
    Called on subsequent messages.
    conversation_history should be a list of {"role": "user"|"assistant", "content": "..."}
    """
    return call_gemini(conversation_history, system_instruction=system_prompt)

def evaluate_interview(system_prompt, conversation_history):
    """
    Called at the end of the interview.
    """
    eval_system_instruction = (
        "You are an expert, objective technical interview evaluator and career coach. "
        "Your task is to analyze the candidate's interview responses from the provided transcript "
        "and generate a comprehensive evaluation report in valid JSON format. "
        "You MUST output valid JSON only, following the exact schema provided. "
        "Even if the interview concluded early or was short, you must still return valid JSON."
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
        "If the interview ended early or has few answers, provide a realistic assessment noting that the interview was incomplete.\n"
        "Do NOT evaluate emotions, personality, or intelligence. Focus strictly on professional skills and answer quality."
    )
    
    # Format the transcript clearly for the evaluator
    transcript_lines = []
    has_user_answers = False
    for msg in conversation_history:
        role = "Interviewer" if msg.get("role") == "assistant" else "Candidate"
        if msg.get("role") == "user":
            has_user_answers = True
        transcript_lines.append(f"{role}: {msg.get('content', '')}")
    transcript_str = "\n\n".join(transcript_lines)
    
    if not has_user_answers or not transcript_str.strip():
        # Candidate ended without answering any questions
        return {
            "evaluation": {
                "overall_feedback": "The interview session was concluded before any questions were answered. To generate an in-depth performance analysis, please complete the interview questions.",
                "categories": [
                    {"name": "Technical Knowledge", "score": 0, "max": 10, "feedback": "No technical answers were provided during this session."},
                    {"name": "Communication", "score": 0, "max": 10, "feedback": "Session ended before communication could be evaluated."}
                ],
                "strengths": ["Initiated the interview practice session."],
                "improvements": ["Complete all interview questions to receive full evaluation and scoring."],
                "recommended_topics": ["Core Technical Concepts", "Interview Preparation & Practice"],
                "question_feedback": [
                    {
                        "question": "Interview Session",
                        "candidate_answer": "Session ended prematurely without submitting answers.",
                        "missing": "Candidate responses to the interviewer's prompts.",
                        "stronger_answer": "Speak or type answers thoroughly before concluding the interview.",
                        "practice_topic": "Mock Interview Completion"
                    }
                ]
            }
        }

    eval_message = f"Interview Transcript:\n\n{transcript_str}\n\nTask:\n{eval_prompt}"
    messages = [{"role": "user", "content": eval_message}]
    
    resp = call_gemini(messages, system_instruction=eval_system_instruction, response_mime_type="application/json", max_tokens=2500)
    if "error" in resp:
        return resp
        
    try:
        raw_reply = resp.get("reply", "").strip()
        # Clean up potential markdown formatting from the response
        if raw_reply.startswith("```json"):
            raw_reply = raw_reply[7:]
        if raw_reply.startswith("```"):
            raw_reply = raw_reply[3:]
        if raw_reply.endswith("```"):
            raw_reply = raw_reply[:-3]
        raw_reply = raw_reply.strip()

        # Try direct JSON parse
        try:
            evaluation = json.loads(raw_reply)
        except Exception:
            # Fallback regex extraction of JSON object
            import re
            match = re.search(r"\{.*\}", raw_reply, re.DOTALL)
            if match:
                evaluation = json.loads(match.group(0))
            else:
                raise ValueError("No JSON object found in response.")

        # Ensure required keys exist
        if "overall_feedback" not in evaluation:
            evaluation["overall_feedback"] = "Assessment completed."
        if "categories" not in evaluation or not isinstance(evaluation["categories"], list):
            evaluation["categories"] = [
                {"name": "Technical Knowledge", "score": 7, "max": 10, "feedback": "Good fundamental understanding."},
                {"name": "Communication", "score": 7, "max": 10, "feedback": "Clear and structured responses."}
            ]
        if "strengths" not in evaluation or not isinstance(evaluation["strengths"], list):
            evaluation["strengths"] = ["Addressed interview questions."]
        if "improvements" not in evaluation or not isinstance(evaluation["improvements"], list):
            evaluation["improvements"] = ["Provide more specific project examples."]
        if "recommended_topics" not in evaluation or not isinstance(evaluation["recommended_topics"], list):
            evaluation["recommended_topics"] = ["System Design", "Problem Solving"]
        if "question_feedback" not in evaluation or not isinstance(evaluation["question_feedback"], list):
            evaluation["question_feedback"] = []

        return {"evaluation": evaluation}
    except Exception as e:
        return {"error": f"Failed to parse AI evaluation as JSON: {str(e)}\nRaw response: {resp.get('reply')}"}

def transcribe_audio(audio_base64, mime_type="audio/webm"):
    """
    Transcribes spoken audio recorded by browser using Gemini multimodal audio capabilities.
    Works across all browsers (Brave, Chrome, Firefox, Safari, Edge) without requiring Google speech cloud web sockets.
    """
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY is not configured."}
        
    candidate_models = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"]
    
    # Strip data URL prefix if present
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
    last_error = None
    
    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        
        try:
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode("utf-8"))
                if "candidates" in result and len(result["candidates"]) > 0:
                    text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                    return {"transcript": text}
                else:
                    return {"transcript": ""}
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            last_error = f"AI API Error: {e.code} - {err_msg}"
            if e.code in (503, 429, 404):
                continue
            return {"error": last_error}
        except Exception as e:
            return {"error": f"Failed to transcribe: {str(e)}"}
            
    return {"error": last_error or "Transcription service temporarily unavailable."}

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
