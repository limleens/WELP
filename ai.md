# WELP — AI tools and model disclosure (Hiya Voice AI Challenge)

> Applicant: verify and personalize this description before submission. Do not claim tests or providers you have not personally exercised.

## AI tools used during development

- **OpenAI ChatGPT (GPT-6):** Helped brainstorm the project, choose the product direction, write and revise the browser UI, develop pose-based rep-counting rules, implement a HIIT plan/state machine, prototype a conversational Gemini connection with validated tool actions, create test cases, interpret GitHub Actions failures, and prepare documentation.
- **GitHub connector and GitHub Actions:** Used to edit the linked source repository on a feature branch and run Node syntax checks and unit tests.
- **User decisions and verification:** The applicant selected WELP, home HIIT, conversational coaching, and phone-first design; provided webcam tracking feedback and confirmed earlier movement-tracking improvements. Applicant still needs to manually test the optional Gemini, TTS, mobile UI and full guided workflow.

## AI used by the running prototype

1. **Google MediaPipe Pose Landmarker Lite:** A pretrained model locally estimates body landmarks from the camera. WELP uses a custom, rule-based state machine to count squats and jumping jacks. No exercise model was custom-trained.
2. **Browser SpeechRecognition:** Transcribes spoken commands. Some browser implementations process speech on vendor servers. **Browser SpeechSynthesis** reads coaching text aloud.
3. **Google Gemini** (optional, configured by the developer with `GEMINI_API_KEY` on a local Node server): Conversational text model maps free-form user speech into a brief natural reply and a structured workout action. The app validates action types, exercise names, repetition counts and time adjustments before applying them. **The API key never goes into frontend code.** Without a key, the app uses an extended deterministic phrase interpreter.
4. **Optional Gemini TTS:** An optional server-side expressive speech model is enabled by `GEMINI_TTS=1`; browser voices are used if unavailable or too slow. TTS costs and responsiveness depend on model access.

## What isn't claimed

- WELP is **not** an autonomous medical or fitness-prescription agent.
- Gemini does not have authority to bypass the workout controller's constraints.
- The voice coach does not diagnose exhaustion from silence or camera input; it asks for user feedback.
- Optional caloric expenditure is an approximation, not a measured value.
- Real-world speech quality, latency and exercise-count accuracy are not established by unit tests.

## Before submitting

- [ ] Confirm actual Gemini API availability with your own key (and avoid exposing it).
- [ ] Test voice transcription, conversational response, and voice playback in Chrome.
- [ ] Try adding "10 more jumping jacks" and verify a real rep-target interval appears.
- [ ] Verify spoken rest check-in every third break, shorter/longer rests and workout pause/resume.
- [ ] Run `node --test tests/*.test.mjs` and view GitHub Actions.
- [ ] List any other AI coding tools you used yourself (e.g., Cursor or Copilot).
