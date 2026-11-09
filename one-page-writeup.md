# WELP — A Voice-First Adaptive Home Workout Coach
**Hiya Voice AI Challenge — Real-Time Assistance**

**What I built.** WELP is a phone-friendly, hands-free home workout companion that plans and guides short HIIT circuits. After choosing a goal, workout duration and intensity, users follow a sequence of timed bodyweight exercises and recovery breaks. The primary live interface shows an oversized time/rep counter and progress bar; the interaction itself happens through voice.

**The problem and who it helps.** While doing squats, jumping jacks or planks, people are typically away from their phone, out of breath and unable to tap through screens. Traditional workout trackers make the user manage the timer, exercise sequence and logging. WELP acts as a conversational coach that handles those tasks so the user can focus on exercising.

**Why voice is essential.** Users can say “I’m struggling,” “make my breaks shorter,” “add another set of squats,” or “help me track ten more jumping jacks.” Those requests change the live workout. Rep-target requests create a new interval that ends on the requested count, not just a spoken acknowledgment. WELP also announces upcoming exercises and checks in about how the user feels every few rest periods. A spoken response can trigger longer recovery or gentler remaining intervals without interrupting the workout.

**How it works.** MediaPipe Pose Landmarker runs locally on webcam frames; a custom state machine counts squats and jumping jacks. A separate HIIT controller manages work/rest timing, pauses, added rep-target intervals and session history. Browser speech recognition converts voice to text. With an optional Gemini API key stored on the local backend, a language model produces a short natural reply and a **structured action**; WELP validates that action against allowable workout changes before executing it. Without Gemini, a local natural-language fallback remains available. Responses are read aloud using the browser voice, or optional Gemini neural text-to-speech.

**Design decisions and next steps.** I prioritized a testable controller and safe, bounded actions over letting an LLM generate unverified exercise prescriptions. The backend protects API keys; no webcam footage is uploaded. The main limitations are browser-dependent speech, model/TTS latency, imperfect pose tracking and the absence of clinically validated exercise advice. Next I would benchmark end-to-end voice latency and rep-count accuracy, add more exercises and accessibility options, test on different phones, and provide secure deployment with authentication and rate limits.

*This is a prototype, not medical advice or a measured calorie/fitness assessment. Customize this summary with actual live testing results before submitting.*
