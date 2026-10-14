document.addEventListener("DOMContentLoaded", async () => {
    // 1. Setup UI Elements
    const setupPhase = document.getElementById("setupPhase");
    const interviewPhase = document.getElementById("interviewPhase");
    const reportPhase = document.getElementById("reportPhase");
    
    // Profile Data
    const profile = JSON.parse(localStorage.getItem('sb_profile') || '{}');
    const resultData = JSON.parse(sessionStorage.getItem('skillbridgeResult') || '{}');
    
    const candidateName = profile.full_name || 'Candidate';
    const targetRole = profile.target_role || resultData.job_role || 'Software Professional';
    
    document.getElementById("setupName").textContent = candidateName;
    document.getElementById("setupRole").textContent = targetRole;
    const gaps = resultData.missing_skills ? resultData.missing_skills.join(", ") : "None available";
    document.getElementById("setupGaps").textContent = gaps;

    // Meet UI Elements
    const dockRoleName = document.getElementById("dockRoleName");
    if (dockRoleName) dockRoleName.textContent = targetRole;

    const candidateNameTag = document.getElementById("candidateNameTag");
    if (candidateNameTag) candidateNameTag.textContent = `${candidateName} (You)`;

    const btnStart = document.getElementById("btnStart");
    const btnSpeak = document.getElementById("btnSpeak");
    const btnToggleCam = document.getElementById("btnToggleCam");
    const btnRespeak = document.getElementById("btnRespeak");
    const btnRaiseHand = document.getElementById("btnRaiseHand");
    const btnToggleCaptions = document.getElementById("btnToggleCaptions");
    const btnShareScreen = document.getElementById("btnShareScreen");
    const btnInfo = document.getElementById("btnInfo");
    const btnPeople = document.getElementById("btnPeople");
    const btnChat = document.getElementById("btnChat");
    const btnSubmitAnswer = document.getElementById("btnSubmitAnswer");
    const btnEndEarly = document.getElementById("btnEndEarly");
    const btnTestMic = document.getElementById("btnTestMic");
    const btnToggleVoice = document.getElementById("btnToggleVoice");
    const aiQuestion = document.getElementById("aiQuestion");
    const candidateLiveTranscript = document.getElementById("candidateLiveTranscript");
    const sarahTile = document.getElementById("sarahTile");
    const sarahStatus = document.getElementById("sarahStatus");
    const candidateTile = document.getElementById("candidateTile");
    const userSpeakingTag = document.getElementById("userSpeakingTag");
    const userMicIcon = document.getElementById("userMicIcon");
    const badgeProctor = document.getElementById("badgeProctor");
    const tabWarningModal = document.getElementById("tabWarningModal");
    const btnDismissWarning = document.getElementById("btnDismissWarning");
    const modalViolationCount = document.getElementById("modalViolationCount");
    const transcriptBox = document.getElementById("transcriptBox");
    const interviewVideo = document.getElementById("interviewVideo");
    const camOffPlaceholder = document.getElementById("camOffPlaceholder");

    // Audio / Speech State
    let videoStream = null;
    let audioStream = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let recognition = null;
    let isListening = false;
    let shouldBeListening = false;
    let aiVoiceEnabled = true;
    let isCamOn = true;
    let baseTranscript = "";
    let interimTranscript = "";
    let timerInterval = null;
    let seconds = 0;
    
    // Interview State
    let systemPrompt = "";
    let conversationHistory = [];
    let currentQ = 1;
    let maxQ = 5;

    // Proctoring State (Active STRICTLY during live interview only)
    let proctoringActive = false;
    let tabSwitchCount = 0;
    const MAX_TAB_SWITCHES = 3;
    let lastTabSwitchTime = 0;

    // Audio Beep Alert for Anti-Cheat Warnings
    function playWarningBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {}
    }

    // 2. Camera Setup
    async function initCamera() {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
            document.getElementById("setupVideo").srcObject = videoStream;
            interviewVideo.srcObject = videoStream;
            document.getElementById("camOverlay").style.display = "none";
        } catch (err) {
            console.warn("Camera note:", err);
            document.getElementById("camOverlay").textContent = "Camera preview unavailable. Voice interview is ready.";
        }
    }
    initCamera();

    // Toggle Camera Button in Meeting
    if (btnToggleCam) {
        btnToggleCam.addEventListener("click", () => {
            isCamOn = !isCamOn;
            if (videoStream) {
                videoStream.getVideoTracks().forEach(t => t.enabled = isCamOn);
            }
            const camIcon = document.getElementById("camIcon");
            const camTooltip = document.getElementById("camTooltip");
            if (isCamOn) {
                interviewVideo.style.display = "block";
                if (camOffPlaceholder) camOffPlaceholder.style.display = "none";
                btnToggleCam.style.background = "#3c4043";
                if (camIcon) {
                    camIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
                }
                if (camTooltip) camTooltip.textContent = "Turn camera off";
            } else {
                interviewVideo.style.display = "none";
                if (camOffPlaceholder) camOffPlaceholder.style.display = "flex";
                btnToggleCam.style.background = "#ea4335";
                if (camIcon) {
                    camIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2zM15 16H6c-.55 0-1-.45-1-1V8.27L14.73 18H15v-2z"/></svg>`;
                }
                if (camTooltip) camTooltip.textContent = "Turn camera on";
            }
        });
    }

    // 3. Audio & Speech Recognition Engine Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    async function initAudioStream() {
        if (!audioStream) {
            try {
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (e) {
                console.warn("Mic access error:", e);
            }
        }
        return audioStream;
    }

    // Native MediaRecorder for Reliable Audio Capture (Brave/Chrome/Firefox/Edge)
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
            console.warn("MediaRecorder start note:", err);
        }
    }

    // Stop MediaRecorder & Auto-transcribe via AI if Web Speech was shielded
    async function stopMediaRecordingAndTranscribe() {
        if (!mediaRecorder || mediaRecorder.state === "inactive") return;

        return new Promise((resolve) => {
            mediaRecorder.onstop = async () => {
                if (baseTranscript.trim().length > 0) {
                    resolve(baseTranscript.trim());
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

                if (candidateLiveTranscript) {
                    candidateLiveTranscript.innerHTML = `<span style="color: #60a5fa;">⏳ Transcribing your voice with AI speech recognition...</span>`;
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
                                baseTranscript = data.transcript.trim();
                                if (transcriptBox) transcriptBox.value = baseTranscript;
                                if (candidateLiveTranscript) {
                                    candidateLiveTranscript.textContent = `"${baseTranscript}"`;
                                }
                                btnSubmitAnswer.disabled = false;
                                if (btnRespeak) btnRespeak.style.display = "flex";
                            }
                        } catch (apiErr) {
                            console.warn("AI Transcribe error:", apiErr);
                        } finally {
                            resolve(baseTranscript);
                        }
                    };
                } catch (e) {
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
            if (transcriptBox) transcriptBox.value = fullText;
            
            if (candidateLiveTranscript) {
                candidateLiveTranscript.textContent = `"${fullText}"`;
            }

            if (fullText.trim().length > 0) {
                btnSubmitAnswer.disabled = false;
                if (btnRespeak) btnRespeak.style.display = "flex";
            }
        };

        rec.onerror = (event) => {
            console.warn("Web Speech note:", event.error);
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

        if (sarahTile) sarahTile.classList.remove("speaking-active");
        if (sarahStatus) sarahStatus.textContent = "Sarah is listening to you...";

        if (candidateTile) candidateTile.classList.add("speaking-active");
        if (userSpeakingTag) userSpeakingTag.style.display = "inline-block";
        if (candidateLiveTranscript && !baseTranscript) {
            candidateLiveTranscript.innerHTML = `<span style="color: #34d399;">🎙️ Listening... Speak your answer now</span>`;
        }

        // 1. Start Native MediaRecorder
        await startMediaRecording();

        // 2. Start Web Speech for real-time live preview
        recognition = createWebSpeechInstance();
        if (recognition) {
            try { recognition.start(); } catch (e) {}
        }
        updateMicState(true);
    }

    async function stopListening() {
        shouldBeListening = false;
        if (recognition) {
            try { recognition.stop(); } catch (e) {}
        }
        isListening = false;
        updateMicState(false);

        if (candidateTile) candidateTile.classList.remove("speaking-active");
        if (userSpeakingTag) userSpeakingTag.style.display = "none";

        // Process audio and transcribe if needed
        await stopMediaRecordingAndTranscribe();
    }

    function updateMicState(active) {
        const speakIcon = document.getElementById("speakIcon");
        const speakText = document.getElementById("speakText");
        const candidateMicBadge = document.getElementById("candidateMicBadge");
        
        if (active) {
            btnSpeak.classList.add("active");
            btnSpeak.classList.remove("muted");
            if (speakIcon) {
                speakIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;
            }
            if (speakText) speakText.textContent = "Turn off mic";
            if (candidateMicBadge) {
                candidateMicBadge.classList.add("active");
                candidateMicBadge.classList.remove("muted");
            }
        } else {
            btnSpeak.classList.remove("active");
            btnSpeak.classList.add("muted");
            if (speakIcon) {
                speakIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-1.02.9-2.18.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.24-5.3-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c1.33-.19 2.53-.78 3.52-1.61l3.2 3.2 1.27-1.27L4.27 3z"/></svg>`;
            }
            if (speakText) speakText.textContent = "Turn on mic";
            if (candidateMicBadge) {
                candidateMicBadge.classList.remove("active");
                candidateMicBadge.classList.add("muted");
            }
        }
    }

    // Mic Button Click in Meeting
    btnSpeak.addEventListener("click", () => {
        if (shouldBeListening || isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    // Google Meet Raise Hand (Repeat Question / Re-speak)
    if (btnRaiseHand) {
        btnRaiseHand.addEventListener("click", () => {
            stopListening();
            baseTranscript = "";
            interimTranscript = "";
            if (transcriptBox) transcriptBox.value = "";
            if (candidateLiveTranscript) {
                candidateLiveTranscript.innerHTML = `<span style="color: #60a5fa;">Hand raised. Sarah will repeat the question...</span>`;
            }
            btnSubmitAnswer.disabled = true;
            
            // Re-read current question from assistant
            const assistantMsgs = conversationHistory.filter(m => m.role === "assistant");
            if (assistantMsgs.length > 0) {
                const lastQ = assistantMsgs[assistantMsgs.length - 1].content;
                speakAI(lastQ, () => {
                    startListening();
                });
            } else {
                startListening();
            }
        });
    }

    // Google Meet Captions Toggle ([CC])
    let captionsEnabled = true;
    if (btnToggleCaptions) {
        btnToggleCaptions.addEventListener("click", () => {
            captionsEnabled = !captionsEnabled;
            const sarahCaptions = document.getElementById("sarahCaptionsOverlay");
            const candidateCaptions = document.getElementById("candidateCaptionsOverlay");
            if (sarahCaptions) sarahCaptions.style.display = captionsEnabled ? "block" : "none";
            if (candidateCaptions) candidateCaptions.style.display = captionsEnabled ? "block" : "none";
            
            if (captionsEnabled) {
                btnToggleCaptions.classList.add("active");
                btnToggleCaptions.style.background = "#8ab4f8";
                btnToggleCaptions.style.color = "#202124";
            } else {
                btnToggleCaptions.classList.remove("active");
                btnToggleCaptions.style.background = "#3c4043";
                btnToggleCaptions.style.color = "#ffffff";
            }
        });
    }

    // Google Meet Screen Sharing
    if (btnShareScreen) {
        btnShareScreen.addEventListener("click", async () => {
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                    interviewVideo.srcObject = screenStream;
                    btnShareScreen.style.background = "#1a73e8";
                    screenStream.getVideoTracks()[0].onended = () => {
                        if (videoStream) interviewVideo.srcObject = videoStream;
                        btnShareScreen.style.background = "#3c4043";
                    };
                }
            } catch (err) {
                console.log("Screen share cancelled:", err);
            }
        });
    }

    // Right Dock Buttons (Info, People, Chat)
    if (btnInfo) {
        btnInfo.addEventListener("click", () => {
            alert(`Meeting Details:\nRole: ${targetRole}\nProctored AI Technical Interview`);
        });
    }
    if (btnPeople) {
        btnPeople.addEventListener("click", () => {
            alert(`Participants in call (2):\n1. Sarah (Technical Interviewer)\n2. ${candidateName} (Candidate - You)`);
        });
    }
    if (btnChat) {
        btnChat.addEventListener("click", () => {
            alert(`In-Call Messages / Transcript:\nAll spoken responses are automatically transcribed in real time.`);
        });
    }

    // 4. Test Mic Button on Setup Screen
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
                        alert(`Microphone verified! Heard: "${heardWords}"`);
                    } else {
                        btnTestMic.textContent = "✅ Mic Active";
                        alert("Microphone is active and connected!");
                    }
                };
                try { testRec.start(); } catch (e) {}
            } else {
                setTimeout(() => {
                    isTesting = false;
                    btnTestMic.classList.remove("primary");
                    btnTestMic.textContent = "✅ Mic Ready";
                    alert("Microphone stream connected!");
                }, 3000);
            }
        });
    }

    // 5. Consistent Female Voice AI Text-To-Speech (Sarah)
    let lockedFemaleVoice = null;

    const MALE_VOICE_NAMES = [
        "alex", "fred", "daniel", "tom", "bruce", "ralph", "junior", "albert", 
        "george", "guy", "mark", "paul", "richard", "james", "john", "michael", 
        "william", "joseph", "charles", "edward", "david", "male", "oliver", "rishi"
    ];

    const PREFERRED_FEMALE_NAMES = [
        "samantha", "victoria", "karen", "moira", "tessa", "fiona", "ava", 
        "allison", "susan", "jenny", "aria", "zira", "serena", "kate", 
        "emma", "stephanie", "zoe", "claire", "hazel", "alice", "olivia", "emily"
    ];

    function getLockedFemaleVoice() {
        if (lockedFemaleVoice) return lockedFemaleVoice;
        if (!('speechSynthesis' in window)) return null;

        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;

        // 1. Check known high-quality English female names
        for (const preferred of PREFERRED_FEMALE_NAMES) {
            const match = voices.find(v => {
                const name = (v.name || "").toLowerCase();
                const lang = (v.lang || "").toLowerCase();
                return lang.startsWith("en") && name.includes(preferred);
            });
            if (match) {
                lockedFemaleVoice = match;
                return match;
            }
        }

        // 2. Look for any English voice with "female" in its name
        const explicitFemale = voices.find(v => {
            const name = (v.name || "").toLowerCase();
            const lang = (v.lang || "").toLowerCase();
            return lang.startsWith("en") && name.includes("female") && !name.includes("male");
        });
        if (explicitFemale) {
            lockedFemaleVoice = explicitFemale;
            return explicitFemale;
        }

        // 3. Look for any English voice that is strictly NOT in the male name list
        const nonMale = voices.find(v => {
            const name = (v.name || "").toLowerCase();
            const lang = (v.lang || "").toLowerCase();
            if (!lang.startsWith("en")) return false;
            return !MALE_VOICE_NAMES.some(m => name.includes(m));
        });
        if (nonMale) {
            lockedFemaleVoice = nonMale;
            return nonMale;
        }

        lockedFemaleVoice = voices[0] || null;
        return lockedFemaleVoice;
    }

    if ('speechSynthesis' in window) {
        getLockedFemaleVoice();
        window.speechSynthesis.onvoiceschanged = () => {
            getLockedFemaleVoice();
        };
    }

    if (btnToggleVoice) {
        btnToggleVoice.addEventListener("click", () => {
            aiVoiceEnabled = !aiVoiceEnabled;
            if (aiVoiceEnabled) {
                btnToggleVoice.style.background = "#3c4043";
                btnToggleVoice.querySelector(".meet-btn-tooltip").textContent = "Sarah's Voice (ON)";
            } else {
                btnToggleVoice.style.background = "#ea4335";
                btnToggleVoice.querySelector(".meet-btn-tooltip").textContent = "Sarah's Voice (OFF)";
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

        if (sarahTile) sarahTile.classList.add("speaking-active");
        if (sarahStatus) sarahStatus.textContent = "Sarah is asking a question...";

        const cleanText = text
            .replace(/[*#_`~>]/g, '')
            .replace(/Phase \d+:/gi, '')
            .trim();

        if (!cleanText) {
            if (onComplete) onComplete();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.98;
        utterance.pitch = 1.18; // Warm, consistent, natural female pitch

        // Select and lock Female English Voice for Sarah
        const femaleVoice = getLockedFemaleVoice();
        if (femaleVoice) {
            utterance.voice = femaleVoice;
            utterance.lang = femaleVoice.lang || "en-US";
        }

        utterance.onend = () => {
            if (sarahTile) sarahTile.classList.remove("speaking-active");
            if (sarahStatus) sarahStatus.textContent = "Sarah is listening to you...";
            if (onComplete) onComplete();
        };

        utterance.onerror = () => {
            if (sarahTile) sarahTile.classList.remove("speaking-active");
            if (onComplete) onComplete();
        };

        window.speechSynthesis.speak(utterance);
    }

    function stopAISpeech() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (sarahTile) sarahTile.classList.remove("speaking-active");
    }

    // 6. Strict Fullscreen Proctoring & Tab-Switch Lock (STRICTLY during active mock interview)
    function enterFullscreen() {
        try {
            if (!document.fullscreenElement) {
                const el = document.documentElement;
                if (el.requestFullscreen) {
                    el.requestFullscreen().catch(() => {});
                } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                } else if (el.msRequestFullscreen) {
                    el.msRequestFullscreen();
                }
            }
        } catch (e) {}
    }

    function exitFullscreen() {
        try {
            if (document.fullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        } catch (e) {}
    }

    function startProctoring() {
        proctoringActive = true;
        tabSwitchCount = 0;
        document.body.classList.add("proctoring-active");
        updateProctorBadge();
        enterFullscreen();

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("blur", handleWindowBlur);
        window.addEventListener("focus", handleWindowFocus);
        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.addEventListener("keydown", handleKeyLock, true);
        document.addEventListener("contextmenu", handleContextMenuLock);
        document.addEventListener("copy", handleCopyPasteLock);
        document.addEventListener("paste", handleCopyPasteLock);

        document.querySelectorAll("header.navbar a, nav a").forEach(link => {
            link.addEventListener("click", handleNavIntercept);
        });
    }

    function stopProctoring() {
        proctoringActive = false;
        document.body.classList.remove("proctoring-active");
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("blur", handleWindowBlur);
        window.removeEventListener("focus", handleWindowFocus);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.removeEventListener("keydown", handleKeyLock, true);
        document.removeEventListener("contextmenu", handleContextMenuLock);
        document.removeEventListener("copy", handleCopyPasteLock);
        document.removeEventListener("paste", handleCopyPasteLock);

        document.querySelectorAll("header.navbar a, nav a").forEach(link => {
            link.removeEventListener("click", handleNavIntercept);
        });

        if (tabWarningModal) tabWarningModal.style.display = "none";
        exitFullscreen();
    }

    function triggerProctorViolation(source = "tab_switch") {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        
        const now = Date.now();
        if (now - lastTabSwitchTime < 1500) return;
        lastTabSwitchTime = now;

        tabSwitchCount++;
        updateProctorBadge();
        playWarningBeep();

        if (tabWarningModal && modalViolationCount) {
            modalViolationCount.textContent = `${tabSwitchCount} of ${MAX_TAB_SWITCHES}`;
            tabWarningModal.style.display = "flex";
        }

        // Auto-terminate if strikes reach maximum
        if (tabSwitchCount >= MAX_TAB_SWITCHES) {
            setTimeout(() => {
                alert(`⚠️ Session Notice: You have reached ${tabSwitchCount} tab violations. The proctored interview is now completing.`);
                if (tabWarningModal) tabWarningModal.style.display = "none";
                finishInterview();
            }, 1000);
        }
    }

    function handleVisibilityChange() {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        if (document.hidden) {
            triggerProctorViolation("tab_hidden");
        } else {
            // Returned to tab after switching
            if (tabWarningModal) {
                modalViolationCount.textContent = `${tabSwitchCount} of ${MAX_TAB_SWITCHES}`;
                tabWarningModal.style.display = "flex";
            }
        }
    }

    function handleWindowBlur() {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        triggerProctorViolation("window_blur");
    }

    function handleWindowFocus() {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        if (tabSwitchCount > 0 && tabWarningModal) {
            tabWarningModal.style.display = "flex";
        }
    }

    function handleFullscreenChange() {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            triggerProctorViolation("fullscreen_exit");
        }
    }

    function handleKeyLock(e) {
        if (!proctoringActive || interviewPhase.style.display === "none") return;
        
        // Strict blocking of shortcuts: Ctrl+Tab, Alt+Tab, Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+R, F5, F11, F12, Escape
        const isCtrl = e.ctrlKey || e.metaKey;
        const key = e.key;

        if (
            (isCtrl && (key === 't' || key === 'T' || key === 'w' || key === 'W' || key === 'n' || key === 'N' || key === 'r' || key === 'R' || key === 'l' || key === 'L' || key === 'u' || key === 'U' || key === 'Tab' || (key >= '1' && key <= '9'))) ||
            (isCtrl && e.shiftKey && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c')) ||
            (e.altKey && (key === 'Tab' || key === 'F4' || key === 'ArrowLeft' || key === 'ArrowRight')) ||
            key === 'F11' || key === 'F5' || key === 'F12'
        ) {
            e.preventDefault();
            e.stopPropagation();
            triggerProctorViolation("key_shortcut");
            return false;
        }

        if (key === 'Escape') {
            triggerProctorViolation("escape_key");
        }
    }

    function handleContextMenuLock(e) {
        if (proctoringActive && interviewPhase.style.display !== "none") {
            e.preventDefault();
        }
    }

    function handleCopyPasteLock(e) {
        if (proctoringActive && interviewPhase.style.display !== "none") {
            e.preventDefault();
        }
    }

    function updateProctorBadge() {
        if (!badgeProctor) return;
        badgeProctor.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: -2px; margin-right: 4px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Tab Lock: ${tabSwitchCount} / ${MAX_TAB_SWITCHES} Strikes`;
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
            e.returnValue = "An AI mock interview is currently in progress. Leaving will terminate your session.";
            return e.returnValue;
        }
    }

    function handleNavIntercept(e) {
        if (proctoringActive && interviewPhase.style.display !== "none") {
            const confirmed = confirm("An AI mock interview is in progress. If you leave now, your session will be closed.\n\nDo you want to leave?");
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
            enterFullscreen();
        });
    }

    // 7. Join Interview Room (Start)
    btnStart.addEventListener("click", async () => {
        const payload = {
            target_role: targetRole,
            matched_skills: resultData.matched_skills || [],
            missing_skills: resultData.missing_skills || [],
            interview_type: document.getElementById("selType").value,
            difficulty: document.getElementById("selDiff").value,
            num_questions: parseInt(document.getElementById("selNum").value)
        };
        maxQ = payload.num_questions;
        
        setupPhase.style.display = "none";
        interviewPhase.style.display = "flex";
        startTimer();
        updateProgress();
        startProctoring(); // Lock tabs & enter fullscreen mode

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
            
            // Sarah speaks question aloud, then auto-activates microphone for reply
            speakAI(data.reply, () => {
                startListening();
            });
        } catch (e) {
            aiQuestion.innerHTML = `<span style='color:#ef4444'>Error: ${e.message}</span>`;
        }
    });

    // 8. Submit Spoken Answer
    btnSubmitAnswer.addEventListener("click", async () => {
        await stopListening();
        stopAISpeech();
        
        const answer = baseTranscript.trim();
        if (!answer) return;
        
        btnSubmitAnswer.disabled = true;
        if (btnRespeak) btnRespeak.style.display = "none";
        baseTranscript = "";
        interimTranscript = "";
        if (transcriptBox) transcriptBox.value = "";
        
        conversationHistory.push({ role: "user", content: answer });
        aiQuestion.innerHTML = "<div class='spinner' style='width:20px;height:20px;display:inline-block;'></div> Sarah is analyzing your reply and preparing the next question...";

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
            
            // Sarah speaks next question, then arms mic
            speakAI(data.reply, () => {
                startListening();
            });
            
            currentQ++;
            updateProgress();
            
        } catch (e) {
            aiQuestion.innerHTML = `<span style='color:#ef4444'>Error: ${e.message}</span>`;
        }
    });

    // 9. Hangup / End Interview Early
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
                <p class="muted">Analyzing your spoken answers and generating scoring.</p>
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
                role: targetRole,
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
            proctoringBadgeHTML = `<div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(16,185,129,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--success);">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                    <strong>Proctoring Integrity: Perfect Focus</strong>
                    <div class="muted" style="font-size: 13px;">0 tab switches detected. Full session integrity maintained.</div>
                </div>
            </div>`;
        } else if (tabSwitchCount <= 2) {
            proctoringBadgeHTML = `<div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(245,158,11,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--warning);">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div>
                    <strong>Proctoring Integrity: Minor Distractions (${tabSwitchCount} Tab Switches)</strong>
                    <div class="muted" style="font-size: 13px;">Tab switching was detected during the interview session.</div>
                </div>
            </div>`;
        } else {
            proctoringBadgeHTML = `<div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(239,68,68,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--danger);">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
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
                <h3 style="color:var(--success); display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Strengths
                </h3>
                <ul style="margin-left: 20px;">
                    ${eval.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                </ul>
            </div>
            <div class="report-card" style="border-color: rgba(239,68,68,0.3);">
                <h3 style="color:var(--danger); display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Areas to Improve
                </h3>
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
        document.getElementById("qProgress").textContent = `Question ${qStr} of ${maxQ}`;
        
        if (currentQ > maxQ) {
            btnEndEarly.querySelector(".meet-btn-tooltip").textContent = "Finish & Evaluate Interview";
        }
    }

    function typeWriter(elementId, text, speed = 15) {
        const el = document.getElementById(elementId);
        if (!el) return;
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
