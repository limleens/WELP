# AI usage disclosure — WELP

> **Important:** This is a starting disclosure generated with AI assistance. Review and edit it before submission to reflect what you actually did, verified, and changed.

## Coding assistance

- **OpenAI ChatGPT (GPT-6)** was used to brainstorm the product concept, scope the prototype, draft JavaScript/CSS/HTML modules, create unit tests, and prepare initial documentation.
- ChatGPT also assisted with the WELP rebrand, rep correction, weekly summaries, robustness fixes, documentation, and automated tests.
- The application code and all claims must be reviewed by the submitting developer. Static logic tests can be run using `node --test tests/engine.test.mjs`.

## Models and AI in the application

- **MediaPipe Pose Landmarker Lite**: pretrained pose-estimation model for on-device 33-point body landmark estimation. Our own deterministic movement state machine counts squats and jumping jacks from these landmarks.
- **Browser Web Speech API**: built-in browser speech recognition and speech synthesis powers hands-free voice commands and audible coaching. Recognition implementation and backend may vary by browser.
- **Adaptive planner**: deterministic heuristic based on completed exercise target and user-reported exertion; does **not** call an LLM or pretend to measure fatigue from audio/video.

## What was NOT used

- No custom-trained workout classification model.
- No AI-powered injury diagnosis or medically validated form correction.
- No cloud backend or account-based tracking in this MVP.

## Human review and validation (complete before submitting)

- [ ] Personally explain the app's architecture and each major module.
- [ ] Run unit tests and record the output.
- [ ] Validate pose tracking and voice commands in the target browser.
- [ ] Record observed mistakes and limitations in the submission write-up.
- [ ] Document any additional AI coding tools (Cursor, Copilot, etc.) you used.
