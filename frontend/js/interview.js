document.addEventListener("DOMContentLoaded", async () => {
    // 1. Setup UI elements
    const setupPhase = document.getElementById("setupPhase");
    const interviewPhase = document.getElementById("interviewPhase");
    const reportPhase = document.getElementById("reportPhase");
    
    // Profile Data
    const profile = JSON.parse(localStorage.getItem('sb_profile') || '{}');
    const resultData = JSON.parse(sessionStorage.getItem('skillbridgeResult') || '{}');
    
    document.getElementById("setupName").textContent = profile.full_name || 'Candidate';
    document.getElementById("setupRole").textContent = profile.target_role || resultData.job_role || 'Not Set';
    const gaps = resultData.missing_skills ? resultData.missing_skills.join(", ") : "None available";
    document.getElementById("setupGaps").textContent = gaps;

    // Stream state
    let stream = null;
    let recognition = null;
    let isRecording = false;
    let timerInterval = null;
    let seconds = 0;
    
    // Interview state
    let systemPrompt = "";
    let conversationHistory = [];
    let currentQ = 1;
    let maxQ = 5;

    // 2. Start Interview Event Listener
    document.getElementById("btnStart").addEventListener("click", async () => {
        if (!stream) {
            document.getElementById("setupError").textContent = "Please allow camera and microphone access before starting the interview.";
            document.getElementById("setupError").style.display = "block";
            return;
        }

        const payload = {
            target_role: profile.target_role || resultData.job_role,
            matched_skills: resultData.matched_skills || [],
            missing_skills: resultData.missing_skills || [],
            interview_type: document.getElementById("selType").value,
            difficulty: document.getElementById("selDiff").value,
            num_questions: parseInt(document.getElementById("selNum").value)
        };
        maxQ = payload.num_questions;
        
        setupPhase.style.display = "none";
        interviewPhase.style.display = "grid";
        startTimer();
        updateProgress();

        try {
            const res = await fetch("/api/interview/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Failed to start interview.");
            
            systemPrompt = data.system_prompt;
            conversationHistory.push({ role: "assistant", content: data.reply });
            typeWriter("aiQuestion", data.reply);
        } catch (e) {
            document.getElementById("aiQuestion").innerHTML = `<span style='color:var(--danger)'>Error: ${e.message}</span>`;
        }
    });

    // 3. Camera Setup
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById("setupVideo").srcObject = stream;
        document.getElementById("interviewVideo").srcObject = stream;
        document.getElementById("camOverlay").style.display = "none";
    } catch (err) {
        document.getElementById("camOverlay").textContent = "Camera/Mic access denied. Please allow permissions.";
        document.getElementById("setupError").textContent = "You must allow Camera & Microphone access to conduct a mock interview.";
        document.getElementById("setupError").style.display = "block";
    }

    // 4. Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                document.getElementById("transcriptBox").value += " " + finalTranscript;
                document.getElementById("btnSubmitAnswer").disabled = false;
            }
        };
        
        recognition.onerror = (e) => {
            console.error("Speech Rec Error:", e.error);
            if(e.error === 'not-allowed') {
                alert("Microphone access denied for speech recognition.");
                toggleMic(false);
            }
        };
    } else {
        document.getElementById("setupError").textContent = "Warning: Web Speech API is not supported in this browser. You will have to type your answers.";
        document.getElementById("setupError").style.display = "block";
    }

    // 5. Speak / Mic Button
    const btnSpeak = document.getElementById("btnSpeak");
    btnSpeak.addEventListener("click", () => {
        if(!recognition) {
            alert("Speech recognition is not supported on this browser. Please type your answer.");
            return;
        }
        if (isRecording) {
            toggleMic(false);
        } else {
            toggleMic(true);
        }
    });

    function toggleMic(start) {
        isRecording = start;
        const badge = document.getElementById("badgeMic");
        if (start) {
            recognition.start();
            btnSpeak.innerHTML = `<span class="recording-indicator"></span> Stop Speaking`;
            badge.classList.add("active");
            badge.textContent = "🎤 Mic ON";
        } else {
            recognition.stop();
            btnSpeak.innerHTML = `🎤 Start Speaking`;
            badge.classList.remove("active");
            badge.textContent = "🎤 Mic OFF";
            
            if(document.getElementById("transcriptBox").value.trim().length > 0){
                document.getElementById("btnSubmitAnswer").disabled = false;
            }
        }
    }

    // Transcript Box Manual Typing support
    document.getElementById("transcriptBox").addEventListener("input", function() {
        document.getElementById("btnSubmitAnswer").disabled = this.value.trim().length === 0;
    });

    // 6. Submit Answer
    document.getElementById("btnSubmitAnswer").addEventListener("click", async () => {
        if(isRecording) toggleMic(false);
        
        const answer = document.getElementById("transcriptBox").value.trim();
        if(!answer) return;
        
        document.getElementById("btnSubmitAnswer").disabled = true;
        document.getElementById("transcriptBox").value = "";
        
        conversationHistory.push({ role: "user", content: answer });
        document.getElementById("aiQuestion").innerHTML = "<div class='spinner' style='width:20px;height:20px;'></div> AI is thinking...";

        try {
            const res = await fetch("/api/interview/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_prompt: systemPrompt,
                    conversation_history: conversationHistory
                })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error);
            
            conversationHistory.push({ role: "assistant", content: data.reply });
            typeWriter("aiQuestion", data.reply);
            
            currentQ++;
            updateProgress();
            
        } catch (e) {
            document.getElementById("aiQuestion").innerHTML = `<span style='color:var(--danger)'>Error: ${e.message}</span>`;
        }
    });

    // 7. End / Evaluate
    document.getElementById("btnEndEarly").addEventListener("click", () => {
        if(confirm("Are you sure you want to end the interview and generate the report?")) {
            generateReport();
        }
    });

    async function generateReport() {
        interviewPhase.style.display = "none";
        reportPhase.style.display = "block";
        clearInterval(timerInterval);
        
        // Stop camera
        if(stream) {
            stream.getTracks().forEach(t => t.stop());
        }

        document.getElementById("reportContent").innerHTML = `
            <div style="text-align:center; padding: 50px;">
                <div class="spinner" style="margin: 0 auto 20px;"></div>
                <h3>AI is evaluating your interview...</h3>
                <p class="muted">This may take a few seconds.</p>
            </div>
        `;

        try {
            const res = await fetch("/api/interview/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_prompt: systemPrompt,
                    conversation_history: conversationHistory
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            renderReport(data.evaluation);
            
            // Save history
            const history = JSON.parse(localStorage.getItem('sb_interview_history') || '[]');
            history.push({
                date: new Date().toISOString(),
                role: profile.target_role || resultData.job_role,
                duration: document.getElementById("timer").textContent,
                evaluation: data.evaluation
            });
            localStorage.setItem('sb_interview_history', JSON.stringify(history));
            
        } catch (e) {
            document.getElementById("reportContent").innerHTML = `<div class="error">Failed to generate report: ${e.message}</div>`;
        }
    }

    function renderReport(eval) {
        let html = `
            <div class="report-card">
                <h3>Overall Feedback</h3>
                <p>${escapeHtml(eval.overall_feedback)}</p>
                <hr style="margin: 20px 0; border-top:1px solid var(--border-color);">
                <div class="grid two">
        `;
        
        eval.categories.forEach(c => {
            html += `
                <div style="margin-bottom:15px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <strong>${escapeHtml(c.name)}</strong>
                        <span style="color:var(--primary); font-weight:bold;">${c.score}/${c.max}</span>
                    </div>
                    <div class="progress-bar-container" style="margin:0; height:6px;">
                        <div class="progress-bar-fill" style="width: ${(c.score/c.max)*100}%;"></div>
                    </div>
                    <p class="muted" style="font-size:13px; margin-top:5px;">${escapeHtml(c.feedback)}</p>
                </div>
            `;
        });
        
        html += `</div></div><div class="grid two" style="margin-top:20px;">
            <div class="report-card">
                <h3>✓ Strengths</h3>
                <ul style="margin-left: 20px;">
                    ${eval.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                </ul>
            </div>
            <div class="report-card" style="border-color: var(--danger);">
                <h3 style="color:var(--danger)">⚠ Areas to Improve</h3>
                <ul style="margin-left: 20px;">
                    ${eval.improvements.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                </ul>
                <div style="margin-top: 15px; background: rgba(245,158,11,0.1); padding: 10px; border-radius: 8px;">
                    <strong>Recommended Topics:</strong> ${eval.recommended_topics.join(", ")}
                </div>
            </div>
        </div>`;
        
        html += `<h3 style="margin-top:40px; margin-bottom: 20px;">Detailed Question Feedback</h3>`;
        eval.question_feedback.forEach((q, i) => {
            html += `
                <div class="report-card" style="margin-bottom: 20px;">
                    <h4 style="color:var(--primary);">Q: ${escapeHtml(q.question)}</h4>
                    <p style="margin-bottom:10px;"><strong>Your Answer:</strong> <em>"${escapeHtml(q.candidate_answer)}"</em></p>
                    <div style="background: rgba(239,68,68,0.05); padding: 15px; border-radius: 8px; margin-bottom:10px; border-left: 3px solid var(--danger);">
                        <strong>What was missing:</strong> ${escapeHtml(q.missing)}
                    </div>
                    <div style="background: rgba(16,185,129,0.05); padding: 15px; border-radius: 8px; margin-bottom:10px; border-left: 3px solid var(--success);">
                        <strong>Stronger Answer:</strong> ${escapeHtml(q.stronger_answer)}
                    </div>
                    <p class="muted" style="font-size:13px;"><strong>Practice Topic:</strong> ${escapeHtml(q.practice_topic)}</p>
                </div>
            `;
        });
        
        document.getElementById("reportContent").innerHTML = html;
    }

    // Utilities
    function startTimer() {
        timerInterval = setInterval(() => {
            seconds++;
            const m = String(Math.floor(seconds / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            document.getElementById("timer").textContent = `${m}:${s}`;
        }, 1000);
    }

    function updateProgress() {
        const qStr = currentQ <= maxQ ? currentQ : maxQ;
        document.getElementById("qProgress").textContent = `Q ${qStr} of ${maxQ}`;
        
        // Auto-show 'End Interview' if maxQ is exceeded
        if(currentQ > maxQ) {
            document.getElementById("btnEndEarly").textContent = "Finish & Evaluate Interview";
            document.getElementById("btnEndEarly").classList.remove("danger-btn");
            document.getElementById("btnEndEarly").classList.add("primary");
        }
    }

    function typeWriter(elementId, text, speed = 20) {
        const el = document.getElementById(elementId);
        el.innerHTML = "";
        let i = 0;
        function type() {
            if (i < text.length) {
                el.innerHTML += text.charAt(i);
                i++;
                setTimeout(type, speed);
            }
        }
        type();
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
        }[c]));
    }
});
