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

    // Stream & Audio State
    let stream = null;
    let recognition = null;
    let isRecording = false;
    let shouldBeRecording = false;
    let timerInterval = null;
    let seconds = 0;
    let aiVoiceEnabled = true;
    let baseTranscript = "";
    
    // Interview State
    let systemPrompt = "";
    let conversationHistory = [];
    let currentQ = 1;
    let maxQ = 5;

    // Proctoring / Tab-Switch State (Active ONLY during mock interview)
    let proctoringActive = false;
    let tabSwitchCount = 0;
    const MAX_TAB_SWITCHES = 3;
    let lastTabSwitchTime = 0;

    // 2. Camera Setup
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

    // 3. Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
            isRecording = true;
            updateMicUI(true);
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcriptPiece = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcriptPiece;
                } else {
                    interimTranscript += transcriptPiece;
                }
            }

            if (finalTranscript) {
                baseTranscript += (baseTranscript ? " " : "") + finalTranscript.trim();
            }

            const currentDisplay = baseTranscript + (interimTranscript ? (baseTranscript ? " " : "") + interimTranscript : "");
            document.getElementById("transcriptBox").value = currentDisplay;

            if (currentDisplay.trim().length > 0) {
                document.getElementById("btnSubmitAnswer").disabled = false;
            }
        };

        recognition.onerror = (e) => {
            console.warn("Speech recognition warning:", e.error);
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                shouldBeRecording = false;
                isRecording = false;
                updateMicUI(false);
                alert("Microphone or speech service permission denied. You can type your answers directly.");
            }
        };

        recognition.onend = () => {
            isRecording = false;
            // Auto-restart if user still has mic toggled ON (prevents silence timeouts)
            if (shouldBeRecording && interviewPhase.style.display !== "none") {
                try {
                    recognition.start();
                } catch (err) {
                    // Ignore if already active
                }
            } else {
                updateMicUI(false);
            }
        };
    } else {
        console.warn("SpeechRecognition API not available in this browser.");
    }

    // 4. Test Mic Button on Setup Phase
    const btnTestMic = document.getElementById("btnTestMic");
    if (btnTestMic) {
        let isTesting = false;
        btnTestMic.addEventListener("click", () => {
            if (!recognition) {
                alert("Speech recognition is not supported in this browser. You can type answers during the interview.");
                return;
            }
            if (isTesting) return;
            isTesting = true;
            btnTestMic.textContent = "🎙️ Speak now (testing 5s)...";
            btnTestMic.classList.add("primary");

            let heardWords = "";
            const testRec = new SpeechRecognition();
            testRec.lang = 'en-US';
            testRec.onresult = (ev) => {
                heardWords = ev.results[0][0].transcript;
            };
            testRec.onend = () => {
                isTesting = false;
                btnTestMic.classList.remove("primary");
                if (heardWords) {
                    btnTestMic.textContent = "✅ Mic Working!";
                    alert(`Microphone test passed! Heard: "${heardWords}"`);
                } else {
                    btnTestMic.textContent = "🎤 Test Mic Again";
                    alert("Microphone active! No speech detected, but your mic is ready.");
                }
            };
            testRec.onerror = (err) => {
                isTesting = false;
                btnTestMic.classList.remove("primary");
                btnTestMic.textContent = "⚠️ Mic Test Failed";
                alert("Mic permission needed. Please allow microphone in browser settings or type answers.");
            };
            testRec.start();
        });
    }

    // 5. Speak / Mic Toggle Button
    const btnSpeak = document.getElementById("btnSpeak");
    btnSpeak.addEventListener("click", () => {
        if (!recognition) {
            alert("Speech recognition is not supported on this browser. Please type your answer.");
            return;
        }
        if (shouldBeRecording) {
            toggleMic(false);
        } else {
            toggleMic(true);
        }
    });

    function toggleMic(start) {
        shouldBeRecording = start;
        if (start) {
            // Cancel any AI TTS when candidate speaks
            stopAISpeech();
            baseTranscript = document.getElementById("transcriptBox").value.trim();
            try {
                recognition.start();
            } catch (e) {
                // Already started or busy
            }
        } else {
            try {
                recognition.stop();
            } catch (e) {
                // Already stopped
            }
            updateMicUI(false);
        }
    }

    function updateMicUI(active) {
        const badge = document.getElementById("badgeMic");
        const liveStatus = document.getElementById("speechLiveStatus");
        if (active) {
            btnSpeak.innerHTML = `<span class="recording-indicator"></span> Stop Speaking`;
            badge.classList.add("active");
            badge.textContent = "🎤 Mic ON";
            if (liveStatus) liveStatus.style.display = "flex";
        } else {
            btnSpeak.innerHTML = `<span id="speakIcon">🎤</span> <span id="speakText">Start Speaking</span>`;
            badge.classList.remove("active");
            badge.textContent = "🎤 Mic OFF";
            if (liveStatus) liveStatus.style.display = "none";
            if (document.getElementById("transcriptBox").value.trim().length > 0) {
                document.getElementById("btnSubmitAnswer").disabled = false;
            }
        }
    }

    // 6. AI Text-To-Speech (AI Speaking Out Loud)
    const btnToggleVoice = document.getElementById("btnToggleVoice");
    if (btnToggleVoice) {
        btnToggleVoice.addEventListener("click", () => {
            aiVoiceEnabled = !aiVoiceEnabled;
            if (aiVoiceEnabled) {
                btnToggleVoice.textContent = "🔊 Voice ON";
                btnToggleVoice.classList.remove("muted");
            } else {
                btnToggleVoice.textContent = "🔇 Voice OFF";
                btnToggleVoice.classList.add("muted");
                stopAISpeech();
            }
        });
    }

    function speakAI(text) {
        if (!aiVoiceEnabled || !('speechSynthesis' in window)) return;
        stopAISpeech();

        // Clean text for natural speech (remove markdown formatting)
        const cleanText = text
            .replace(/[*#_`~>]/g, '')
            .replace(/Phase \d+:/gi, '')
            .trim();

        if (!cleanText) return;

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // Pick preferred English voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("David") || v.name.includes("Zira")));
        if (preferredVoice) utterance.voice = preferredVoice;

        window.speechSynthesis.speak(utterance);
    }

    function stopAISpeech() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    // 7. Proctoring / Tab Switch Restriction (STRICTLY during active mock interview only)
    function startProctoring() {
        proctoringActive = true;
        tabSwitchCount = 0;
        updateProctorBadge();

        document.addEventListener("visibilitychange", handleTabSwitch);
        window.addEventListener("blur", handleTabSwitch);
        window.addEventListener("beforeunload", handleBeforeUnload);

        // Intercept in-app navigation during interview
        document.querySelectorAll("header.navbar a, nav a").forEach(link => {
            link.addEventListener("click", handleNavIntercept);
        });
    }

    function stopProctoring() {
        proctoringActive = false;
        document.removeEventListener("visibilitychange", handleTabSwitch);
        window.removeEventListener("blur", handleTabSwitch);
        window.removeEventListener("beforeunload", handleBeforeUnload);

        document.querySelectorAll("header.navbar a, nav a").forEach(link => {
            link.removeEventListener("click", handleNavIntercept);
        });

        const modal = document.getElementById("tabWarningModal");
        if (modal) modal.style.display = "none";
    }

    function handleTabSwitch() {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        
        // Debounce multiple events within 1 second
        const now = Date.now();
        if (now - lastTabSwitchTime < 1000) return;
        lastTabSwitchTime = now;

        if (document.hidden) {
            tabSwitchCount++;
            updateProctorBadge();

            // Show Proctoring Warning Modal
            const modal = document.getElementById("tabWarningModal");
            const countEl = document.getElementById("modalViolationCount");
            if (modal && countEl) {
                countEl.textContent = `${tabSwitchCount} of ${MAX_TAB_SWITCHES}`;
                modal.style.display = "flex";
            }
        }
    }

    function updateProctorBadge() {
        const badge = document.getElementById("badgeProctor");
        if (!badge) return;
        badge.textContent = `🛡️ Tab Switches: ${tabSwitchCount}`;
        badge.classList.remove("warning", "danger");
        if (tabSwitchCount >= 3) {
            badge.classList.add("danger");
        } else if (tabSwitchCount >= 1) {
            badge.classList.add("warning");
        }
    }

    function handleBeforeUnload(e) {
        if (proctoringActive && interviewPhase.style.display !== "none") {
            e.preventDefault();
            e.returnValue = "An AI mock interview is currently in progress. Leaving this page will terminate your session.";
            return e.returnValue;
        }
    }

    function handleNavIntercept(e) {
        if (proctoringActive && interviewPhase.style.display !== "none") {
            const confirmed = confirm("An AI mock interview is currently in progress. If you leave now, your current interview session will be closed.\n\nDo you want to leave?");
            if (!confirmed) {
                e.preventDefault();
            } else {
                stopProctoring();
                stopAISpeech();
            }
        }
    }

    const btnDismissWarning = document.getElementById("btnDismissWarning");
    if (btnDismissWarning) {
        btnDismissWarning.addEventListener("click", () => {
            const modal = document.getElementById("tabWarningModal");
            if (modal) modal.style.display = "none";
        });
    }

    // 8. Start Interview
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
        startProctoring(); // Enable proctoring exclusively for this interview session

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
            speakAI(data.reply); // Speak question out loud
        } catch (e) {
            document.getElementById("aiQuestion").innerHTML = `<span style='color:var(--danger)'>Error: ${e.message}</span>`;
        }
    });

    // Transcript Box Manual Typing support
    document.getElementById("transcriptBox").addEventListener("input", function() {
        baseTranscript = this.value;
        document.getElementById("btnSubmitAnswer").disabled = this.value.trim().length === 0;
    });

    // 9. Submit Answer
    document.getElementById("btnSubmitAnswer").addEventListener("click", async () => {
        if (shouldBeRecording) toggleMic(false);
        stopAISpeech();
        
        const answer = document.getElementById("transcriptBox").value.trim();
        if (!answer) return;
        
        document.getElementById("btnSubmitAnswer").disabled = true;
        document.getElementById("transcriptBox").value = "";
        baseTranscript = "";
        
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
            speakAI(data.reply); // Speak AI response out loud
            
            currentQ++;
            updateProgress();
            
        } catch (e) {
            document.getElementById("aiQuestion").innerHTML = `<span style='color:var(--danger)'>Error: ${e.message}</span>`;
        }
    });

    // 10. End / Evaluate Interview
    document.getElementById("btnEndEarly").addEventListener("click", () => {
        if (confirm("Are you sure you want to end the interview and generate the performance report?")) {
            generateReport();
        }
    });

    async function generateReport() {
        stopProctoring(); // Disable tab restriction as interview concludes
        stopAISpeech();
        if (shouldBeRecording) toggleMic(false);

        interviewPhase.style.display = "none";
        reportPhase.style.display = "block";
        clearInterval(timerInterval);
        
        // Stop camera stream
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }

        document.getElementById("reportContent").innerHTML = `
            <div style="text-align:center; padding: 50px;">
                <div class="spinner" style="margin: 0 auto 20px;"></div>
                <h3>AI is evaluating your interview...</h3>
                <p class="muted">Generating your comprehensive performance analysis.</p>
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
            
            // Save history with proctoring metadata
            const history = JSON.parse(localStorage.getItem('sb_interview_history') || '[]');
            history.push({
                date: new Date().toISOString(),
                role: profile.target_role || resultData.job_role,
                duration: document.getElementById("timer").textContent,
                tab_switches: tabSwitchCount,
                evaluation: data.evaluation
            });
            localStorage.setItem('sb_interview_history', JSON.stringify(history));
            
        } catch (e) {
            document.getElementById("reportContent").innerHTML = `<div class="error">Failed to generate report: ${e.message}</div>`;
        }
    }

    function renderReport(eval) {
        let proctoringBadgeHTML = '';
        if (tabSwitchCount === 0) {
            proctoringBadgeHTML = `<div style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🟢</span>
                <div>
                    <strong>Proctoring Integrity: Perfect Focus</strong>
                    <div class="muted" style="font-size: 13px;">0 tab switches detected during the session.</div>
                </div>
            </div>`;
        } else if (tabSwitchCount <= 2) {
            proctoringBadgeHTML = `<div style="background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🟡</span>
                <div>
                    <strong>Proctoring Integrity: Minor Distractions (${tabSwitchCount} Tab Switches)</strong>
                    <div class="muted" style="font-size: 13px;">Tab switching was detected during the interview session.</div>
                </div>
            </div>`;
        } else {
            proctoringBadgeHTML = `<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🔴</span>
                <div>
                    <strong>Proctoring Integrity: Flagged (${tabSwitchCount} Tab Switches)</strong>
                    <div class="muted" style="font-size: 13px;">Multiple tab switches occurred during the active interview.</div>
                </div>
            </div>`;
        }

        let html = `
            ${proctoringBadgeHTML}
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
        
        if (eval.question_feedback && eval.question_feedback.length > 0) {
            html += `<h3 style="margin-top:40px; margin-bottom: 20px;">Detailed Question Feedback</h3>`;
            eval.question_feedback.forEach((q) => {
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
        }
        
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
        
        if (currentQ > maxQ) {
            document.getElementById("btnEndEarly").textContent = "Finish & Evaluate Interview";
            document.getElementById("btnEndEarly").classList.remove("danger-btn");
            document.getElementById("btnEndEarly").classList.add("primary");
        }
    }

    function typeWriter(elementId, text, speed = 15) {
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
        return String(value || '').replace(/[&<>"']/g, c => ({
            "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
        }[c]));
    }
});
