# AI usage disclosure — WELP

This is a draft based on the development work completed with ChatGPT. The applicant should review, correct and supplement it before Hiya submission.

## AI tools used to build the prototype

- **OpenAI ChatGPT (GPT-6):** Assisted with early ideation, scope reduction for the Hiya challenge, design/implementation of the HTML/CSS/JavaScript MVP, MediaPipe integration, posture-state heuristics, voice command interpretation, HIIT onboarding, the new interval state machine, automatic rest and fatigue check-ins, workout-history adaptation, automated tests, and documentation.
- **GitHub connector:** ChatGPT read the repository and pushed changes to `feat/welp-home-workout-helper`, with the work maintained in Pull Request #1. GitHub Actions runs syntax and unit-test checks.
- **Human input:** The applicant chose the product concept and HIIT direction, selected conversational-style coaching, tested early webcam movement tracking, and provided feedback that led to the tracker improvement. The applicant must still test the new guided HIIT session and speech features.

## Models in the running app

- **Google MediaPipe Pose Landmarker Lite** (pretrained): Estimates body pose landmarks on-device. WELP's own 2D geometry and state-machine rules count reps.
- **Browser Web Speech API:** Speech-to-text and text-to-speech for spoken coaching and control. Browser speech recognition may use a remote service.
- **Bounded natural-language parser:** `parseCoachRequest` handles multiple expressions and contextual follow-up answers, such as “yes” in response to “Do you need a break?” This is not a generative language model.
- **Workout planner and intensity adaptation:** Transparent deterministic rules based on selected preferences and prior results. It does not infer health status or fatigue medically.
- **Optional energy estimate:** Simple MET-based approximation, not model inference or a measured calorie count.

## Not used

No custom-trained rep classifier, general-purpose LLM at inference time, cloud account database, medically validated exercise analysis or safety-critical fitness prescription.

## Verify before submitting

- [ ] Run `node --test tests/*.test.mjs` and record the result.
- [ ] Test one complete camera + microphone HIIT circuit in Chrome.
- [ ] Verify breaks, skips, transitions, saved history and “make it easier.”
- [ ] Explain the choice of deterministic session actions versus unrestricted LLM generation.
- [ ] Add any other AI tools actually used (e.g. Cursor, Copilot).
