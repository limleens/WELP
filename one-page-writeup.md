# WELP: Home Workout Helper

**Hiya Voice AI Challenge — Real-Time Assistance**

**What I built.** WELP is a voice-first home workout companion that combines speech recognition, on-device pose tracking, spoken coaching, session history, and adaptive workout targets. Users can begin a workout, ask about progress, pause, adjust difficulty, or finish a session without touching their screen. The prototype includes camera-based repetition counting for bodyweight squats and jumping jacks, plus a simple plank timer.

**Who it's for.** People exercising at home without equipment, particularly beginners who want lightweight guidance and find constant tapping, timers, and manual repetition logging disruptive.

**The problem.** Most fitness trackers assume the user can look at and manipulate a screen mid-exercise. But during a workout, hands and attention are occupied. Additionally, rigid targets ignore that someone might struggle with a set or have an easier day than usual.

**Why voice is the right interface.** A spoken request such as “make it easier” can immediately modify the session while the user is moving. The assistant can announce progress without requiring a glance at the display. Voice makes the experience less interruptive than typing or tapping; visual pose estimation supports it rather than replacing it.

**How it works.** MediaPipe estimates body landmarks in the user's browser. An interpretable state machine converts landmark transitions into squat or jumping-jack counts. Browser speech recognition maps natural phrases to structured commands, while text-to-speech gives feedback. After each session, targets adapt conservatively using completion and self-reported difficulty. Workout logs remain in local browser storage; the app does not record webcam footage.

**Engineering decisions and trade-offs.** To deliver a reliable prototype quickly, I used a dependency-light browser app, a pretrained pose-estimation model, and deterministic rules instead of training a custom exercise model or asking an LLM to determine safe exercise prescriptions. Manual rep correction and on-screen controls are available if camera or speech recognition fails. This is not a fitness safety or injury-prevention tool.

**What I'd build next.** Validate exercise detection across people, devices and camera placements; add confidence-aware feedback; improve voice latency and conversational handling; introduce a privacy-conscious account system and longitudinal progress insights; and automate regression tests for movement counting.

**Before submission:** personalize this with what you implemented, the tests you ran, actual demo observations, and the technical decisions you can explain confidently. Keep the final write-up to one page.
