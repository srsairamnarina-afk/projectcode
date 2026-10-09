document.addEventListener("DOMContentLoaded", async () => {
    // 1. Setup UI Elements
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

    // UI Controls
    const btnStart = document.getElementById("btnStart");
    const btnSpeak = document.getElementById("btnSpeak");
    const btnRespeak = document.getElementById("btnRespeak");
    const btnSubmitAnswer = document.getElementById("btnSubmitAnswer");
    const btnEndEarly = document.getElementById("btnEndEarly");
    const btnTestMic = document.getElementById("btnTestMic");
    const btnToggleVoice = document.getElementById("btnToggleVoice");
    const transcriptBox = document.getElementById("transcriptBox");
    const speechLiveStatus = document.getElementById("speechLiveStatus");
    const badgeMic = document.getElementById("badgeMic");
    const badgeCam = document.getElementById("badgeCam");
    const badgeProctor = document.getElementById("badgeProctor");
    const tabWarningModal = document.getElementById("tabWarningModal");
    const btnDismissWarning = document.getElementById("btnDismissWarning");
    const modalViolationCount = document.getElementById("modalViolationCount");

    // State Variables
    let videoStream = null;
    let audioStream = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let recognition = null;
    let isListening = false;
    let shouldBeListening = false;
    let aiVoiceEnabled = true;
    let baseTranscript = "";
    let interimTranscript = "";
    let timerInterval = null;
    let seconds = 0;
    
    // Interview State
    let systemPrompt = "";
    let conversationHistory = [];
    let currentQ = 1;
    let maxQ = 5;

    // Proctoring State (Active ONLY during mock interview)
    let proctoringActive = false;
    let tabSwitchCount = 0;
    const MAX_TAB_SWITCHES = 3;
    let lastTabSwitchTime = 0;

    // 2. Camera Setup
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        document.getElementById("setupVideo").srcObject = videoStream;
        document.getElementById("interviewVideo").srcObject = videoStream;
        document.getElementById("camOverlay").style.display = "none";
        if (badgeCam) badgeCam.classList.add("active");
    } catch (err) {
        console.warn("Camera access note:", err);
        document.getElementById("camOverlay").textContent = "Camera preview unavailable. You can still proceed with voice interview.";
    }

    // 3. Audio & Speech Recognition Engine Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    async function initAudioStream() {
        if (!audioStream) {
            try {
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (e) {
                console.warn("Microphone access error:", e);
            }
        }
        return audioStream;
    }

    // Start Audio Recording with MediaRecorder (Guaranteed to work in Brave/Chrome/Edge/Firefox)
    async function startMediaRecording() {
        const stream = await initAudioStream();
        if (!stream) return;

        audioChunks = [];
        try {
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
                ? "audio/webm;codecs=opus" 
                : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4");
            
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };
            mediaRecorder.start(100);
        } catch (err) {
            console.warn("MediaRecorder start error:", err);
        }
    }

    // Stop Media Recording and Transcribe via AI if Web Speech didn't capture text
    async function stopMediaRecordingAndTranscribe() {
        if (!mediaRecorder || mediaRecorder.state === "inactive") return;

        return new Promise((resolve) => {
            mediaRecorder.onstop = async () => {
                // If Web Speech API already transcribed the speech, we don't need backend fallback
                if (transcriptBox.value.trim().length > 0) {
                    resolve(transcriptBox.value.trim());
                    return;
                }

                if (audioChunks.length === 0) {
                    resolve("");
                    return;
                }

                const mimeType = mediaRecorder.mimeType || "audio/webm";
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                
                if (audioBlob.size < 1000) {
                    resolve("");
                    return;
                }

                // Show processing indicator
                const origStatus = speechLiveStatus ? speechLiveStatus.innerHTML : "";
                if (speechLiveStatus) {
                    speechLiveStatus.innerHTML = `<div class="speech-wave"><span></span><span></span><span></span></div> <span>Transcribing voice with AI...</span>`;
                    speechLiveStatus.style.display = "flex";
                }

                try {
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = async () => {
                        const base64Audio = reader.result;
                        try {
                            const res = await fetch("/api/interview/transcribe", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ audio_data: base64Audio, mime_type: mimeType })
                            });
                            const data = await res.json();
                            if (data.transcript && data.transcript.trim()) {
                                transcriptBox.value = data.transcript.trim();
                                baseTranscript = data.transcript.trim();
                                btnSubmitAnswer.disabled = false;
                                if (btnRespeak) btnRespeak.style.display = "inline-block";
                            }
                        } catch (apiErr) {
                            console.warn("AI Transcribe API error:", apiErr);
                        } finally {
                            if (speechLiveStatus) speechLiveStatus.style.display = "none";
                            resolve(transcriptBox.value.trim());
                        }
                    };
                } catch (e) {
                    if (speechLiveStatus) speechLiveStatus.style.display = "none";
                    resolve("");
                }
            };

            try {
                mediaRecorder.stop();
            } catch (e) {
                resolve("");
            }
        });
    }

    function createWebSpeechInstance() {
        if (!SpeechRecognition) return null;
        
        if (recognition) {
            try { recognition.abort(); } catch (e) {}
            recognition = null;
        }

        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onstart = () => {
            isListening = true;
            updateMicState(true);
        };

        rec.onresult = (event) => {
            let finalPiece = '';
            let currentInterim = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const item = event.results[i];
                if (item.isFinal) {
                    finalPiece += item[0].transcript;
                } else {
                    currentInterim += item[0].transcript;
                }
            }

            if (finalPiece) {
                baseTranscript += (baseTranscript ? " " : "") + finalPiece.trim();
            }
            interimTranscript = currentInterim;

            const fullText = baseTranscript + (interimTranscript ? (baseTranscript ? " " : "") + interimTranscript : "");
            transcriptBox.value = fullText;
            transcriptBox.scrollTop = transcriptBox.scrollHeight;

            if (fullText.trim().length > 0) {
                btnSubmitAnswer.disabled = false;
                if (btnRespeak) btnRespeak.style.display = "inline-block";
            }
        };

        rec.onerror = (event) => {
            console.warn("Web Speech event note:", event.error);
        };

        rec.onend = () => {
            isListening = false;
            if (shouldBeListening && interviewPhase.style.display !== "none") {
                setTimeout(() => {
                    if (shouldBeListening && interviewPhase.style.display !== "none") {
                        try {
                            rec.start();
                        } catch (e) {
                            recognition = createWebSpeechInstance();
                            if (recognition) {
                                try { recognition.start(); } catch (err) {}
                            }
                        }
                    }
                }, 100);
            } else {
                updateMicState(false);
            }
        };

        return rec;
    }

    async function startListening() {
        stopAISpeech();
        shouldBeListening = true;

        // 1. Start Native MediaRecorder (Local Microphone Stream)
        await startMediaRecording();

        // 2. Start Web Speech API for real-time live preview
        recognition = createWebSpeechInstance();
        if (recognition) {
            try {
                recognition.start();
            } catch (e) {}
        }
        updateMicState(true);
    }

    async function stopListening() {
        shouldBeListening = false;
        if (recognition) {
            try {
                recognition.stop();
            } catch (e) {}
        }
        isListening = false;
        updateMicState(false);

        // Process audio and transcribe if needed
        await stopMediaRecordingAndTranscribe();
    }

    function updateMicState(active) {
        if (active) {
            btnSpeak.innerHTML = `<span class="recording-indicator"></span> ⏹️ Done Speaking`;
            btnSpeak.classList.add("primary");
            btnSpeak.classList.remove("outline-btn");
            if (badgeMic) {
                badgeMic.classList.add("active");
                badgeMic.textContent = "🎤 Mic ON (Listening...)";
            }
            if (speechLiveStatus) speechLiveStatus.style.display = "flex";
        } else {
            btnSpeak.innerHTML = `<span id="speakIcon">🎤</span> <span id="speakText">Speak Answer</span>`;
            btnSpeak.classList.remove("primary");
            btnSpeak.classList.add("outline-btn");
            if (badgeMic) {
                badgeMic.classList.remove("active");
                badgeMic.textContent = "🎤 Mic OFF";
            }
            if (speechLiveStatus) speechLiveStatus.style.display = "none";
            if (transcriptBox.value.trim().length > 0) {
                btnSubmitAnswer.disabled = false;
                if (btnRespeak) btnRespeak.style.display = "inline-block";
            }
        }
    }

    // Mic Toggle Button
    btnSpeak.addEventListener("click", () => {
        if (shouldBeListening || isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    // Re-speak Button
    if (btnRespeak) {
        btnRespeak.addEventListener("click", () => {
            stopListening();
            transcriptBox.value = "";
            baseTranscript = "";
            interimTranscript = "";
            btnSubmitAnswer.disabled = true;
            btnRespeak.style.display = "none";
            startListening();
        });
    }

    // 4. Mic Test Feature in Setup Phase
    if (btnTestMic) {
        let isTesting = false;
        btnTestMic.addEventListener("click", async () => {
            if (isTesting) return;
            isTesting = true;
            btnTestMic.textContent = "🎙️ Speak now (testing 5s)...";
            btnTestMic.classList.add("primary");

            const stream = await initAudioStream();
            if (!stream) {
                isTesting = false;
                btnTestMic.classList.remove("primary");
                btnTestMic.textContent = "⚠️ Mic Access Denied";
                alert("Microphone permission needed. Please allow microphone in your browser settings.");
                return;
            }

            let heardWords = "";
            const testRec = createWebSpeechInstance();
            if (testRec) {
                testRec.onresult = (ev) => {
                    heardWords = ev.results[0][0].transcript;
                };
                testRec.onend = () => {
                    isTesting = false;
                    btnTestMic.classList.remove("primary");
                    if (heardWords) {
                        btnTestMic.textContent = "✅ Mic Working!";
                        alert(`Microphone test passed! Detected speech: "${heardWords}"`);
                    } else {
                        btnTestMic.textContent = "✅ Mic Active";
                        alert("Microphone active and ready for your mock interview!");
                    }
                };
                try { testRec.start(); } catch (e) {}
            } else {
                setTimeout(() => {
                    isTesting = false;
                    btnTestMic.classList.remove("primary");
                    btnTestMic.textContent = "✅ Mic Ready";
                    alert("Microphone stream connected successfully!");
                }, 3000);
            }
        });
    }

    // 5. Female Voice AI Text-To-Speech (Sarah)
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

    function speakAI(text, onComplete) {
        if (!aiVoiceEnabled || !('speechSynthesis' in window)) {
            if (onComplete) onComplete();
            return;
        }
        stopAISpeech();

        // Clean text for natural speech
        const cleanText = text
            .replace(/[*#_`~>]/g, '')
            .replace(/Phase \d+:/gi, '')
            .trim();

        if (!cleanText) {
            if (onComplete) onComplete();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.95;
        utterance.pitch = 1.25; // Warm, friendly female voice tone

        // Select Female English Voice (e.g., Zira, Samantha, Victoria, Google UK Female, etc.)
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => 
            v.lang.startsWith("en") && (
                v.name.toLowerCase().includes("zira") ||
                v.name.toLowerCase().includes("female") ||
                v.name.toLowerCase().includes("samantha") ||
                v.name.toLowerCase().includes("victoria") ||
                v.name.toLowerCase().includes("karen") ||
                v.name.toLowerCase().includes("moira") ||
                v.name.toLowerCase().includes("fiona") ||
                v.name.toLowerCase().includes("jenny") ||
                v.name.toLowerCase().includes("aria") ||
                v.name.toLowerCase().includes("serena") ||
                v.name.toLowerCase().includes("ava") ||
                v.name.toLowerCase().includes("emma")
            )
        ) || voices.find(v => v.lang.startsWith("en") && !v.name.toLowerCase().includes("david") && !v.name.toLowerCase().includes("male") && !v.name.toLowerCase().includes("george"));

        if (femaleVoice) {
            utterance.voice = femaleVoice;
        }

        utterance.onend = () => {
            if (onComplete) onComplete();
        };

        utterance.onerror = () => {
            if (onComplete) onComplete();
        };

        window.speechSynthesis.speak(utterance);
    }

    function stopAISpeech() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    // 6. Proctoring & Tab Switch Restriction (Active ONLY during mock interview)
    function startProctoring() {
        proctoringActive = true;
        tabSwitchCount = 0;
        updateProctorBadge();

        document.addEventListener("visibilitychange", handleTabSwitch);
        window.addEventListener("blur", handleTabSwitch);
        window.addEventListener("beforeunload", handleBeforeUnload);

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

        if (tabWarningModal) tabWarningModal.style.display = "none";
    }

    function handleTabSwitch() {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        
        const now = Date.now();
        if (now - lastTabSwitchTime < 1000) return;
        lastTabSwitchTime = now;

        if (document.hidden) {
            tabSwitchCount++;
            updateProctorBadge();

            if (tabWarningModal && modalViolationCount) {
                modalViolationCount.textContent = `${tabSwitchCount} of ${MAX_TAB_SWITCHES}`;
                tabWarningModal.style.display = "flex";
            }
        }
    }

    function updateProctorBadge() {
        if (!badgeProctor) return;
        badgeProctor.textContent = `🛡️ Tab Switches: ${tabSwitchCount}`;
        badgeProctor.classList.remove("warning", "danger");
        if (tabSwitchCount >= 3) {
            badgeProctor.classList.add("danger");
        } else if (tabSwitchCount >= 1) {
            badgeProctor.classList.add("warning");
        }
    }

    function handleBeforeUnload(e) {
        if (proctoringActive && interviewPhase.style.display !== "none") {
            e.preventDefault();
            e.returnValue = "An AI mock interview is in progress. Leaving will terminate your session.";
            return e.returnValue;
        }
    }

    function handleNavIntercept(e) {
        if (proctoringActive && interviewPhase.style.display !== "none") {
            const confirmed = confirm("An AI mock interview is currently in progress. If you leave now, your session will end.\n\nDo you want to leave?");
            if (!confirmed) {
                e.preventDefault();
            } else {
                stopProctoring();
                stopAISpeech();
                stopListening();
            }
        }
    }

    if (btnDismissWarning) {
        btnDismissWarning.addEventListener("click", () => {
            if (tabWarningModal) tabWarningModal.style.display = "none";
        });
    }

    // 7. Start Interview
    btnStart.addEventListener("click", async () => {
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
        startProctoring();

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
            
            // Sarah speaks the question aloud, then turns on mic automatically
            speakAI(data.reply, () => {
                startListening();
            });
        } catch (e) {
            document.getElementById("aiQuestion").innerHTML = `<span style='color:var(--danger)'>Error: ${e.message}</span>`;
        }
    });

    // Transcript Box fallback input handler
    transcriptBox.addEventListener("input", function() {
        baseTranscript = this.value;
        btnSubmitAnswer.disabled = this.value.trim().length === 0;
        if (btnRespeak && this.value.trim().length > 0) {
            btnRespeak.style.display = "inline-block";
        }
    });

    // 8. Submit Voice Answer
    btnSubmitAnswer.addEventListener("click", async () => {
        await stopListening();
        stopAISpeech();
        
        const answer = transcriptBox.value.trim();
        if (!answer) return;
        
        btnSubmitAnswer.disabled = true;
        if (btnRespeak) btnRespeak.style.display = "none";
        transcriptBox.value = "";
        baseTranscript = "";
        interimTranscript = "";
        
        conversationHistory.push({ role: "user", content: answer });
        document.getElementById("aiQuestion").innerHTML = "<div class='spinner' style='width:20px;height:20px;'></div> Sarah is evaluating your reply and preparing the next question...";

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
            
            // Sarah speaks follow-up question, then mic starts listening automatically
            speakAI(data.reply, () => {
                startListening();
            });
            
            currentQ++;
            updateProgress();
            
        } catch (e) {
            document.getElementById("aiQuestion").innerHTML = `<span style='color:var(--danger)'>Error: ${e.message}</span>`;
        }
    });

    // 9. End / Evaluate Interview Early
    btnEndEarly.addEventListener("click", () => {
        if (confirm("Are you sure you want to end the interview and generate your performance report?")) {
            generateReport();
        }
    });

    async function generateReport() {
        stopProctoring();
        stopAISpeech();
        await stopListening();

        interviewPhase.style.display = "none";
        reportPhase.style.display = "block";
        clearInterval(timerInterval);
        
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
        }
        if (audioStream) {
            audioStream.getTracks().forEach(t => t.stop());
        }

        document.getElementById("reportContent").innerHTML = `
            <div style="text-align:center; padding: 50px;">
                <div class="spinner" style="margin: 0 auto 20px;"></div>
                <h3>AI is evaluating your interview...</h3>
                <p class="muted">Generating comprehensive feedback from your spoken responses.</p>
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
            
            // Save history with proctoring stats
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
            btnEndEarly.textContent = "Finish & Evaluate Interview";
            btnEndEarly.classList.remove("danger-btn");
            btnEndEarly.classList.add("primary");
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
