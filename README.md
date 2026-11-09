# WELP — Home Workout Helper

**Hiya Voice AI Challenge 2026** · Track: **Real-Time Assistance**

WELP is a voice-first, camera-assisted **HIIT coach for equipment-free home workouts**. It builds short timed circuits from a user's goal, experience, preferred intensity and duration, then walks them through work/rest intervals. It counts squats and jumping jacks using pose landmarks, listens for natural spoken requests, adapts the session if someone struggles, and saves progress locally.

## Run it

Requires Python 3, Chrome or Edge, and an internet connection for MediaPipe assets.

```bash
git clone https://github.com/limleens/WELP.git
cd WELP
git switch feat/welp-home-workout-helper
python -m http.server 8000
```

Open **http://localhost:8000** (not `file://`). The branch is a pull request; after merge, the `git switch` step is no longer needed.

1. **Set your preferences** in the Welcome panel: goal, level, intensity and preferred session length. Body weight is optional **only** for a rough active-energy estimate, not for deciding difficulty.
2. **Build my HIIT circuit** to generate a timed sequence of squats, jumping jacks, plank holds and recovery intervals. Your plan is saved in browser storage.
3. **Enable camera**, wait for **Pose tracking ready**, and stand far enough back to show your full body. Side-on for squats, facing forward for jumping jacks.
4. **Enable voice** with the microphone button if supported. Say **“start workout”** or click **Start guided HIIT**. Spoken guidance also works with the microphone off if browser speech synthesis is available.
5. Try conversational requests: **“I'm exhausted, can we make it easier?”**, **“I need a break”**, **“what's next?”**, **“how much time is left?”**, **“skip this exercise”**, **“give me more rest”**, **“repeat the instructions”**, or **“finish workout”**.
6. Each work interval counts down, followed by a recovery break; WELP announces transitions. For a completely hands-free demo, use voice. If speech recognition fails, use the **Ask coach** text input as a fallback.
7. At the end, view your active time, reps and saved circuit in **My progress**. If you opted into providing weight, a **very rough estimated** active-energy number is displayed.

**Note:** HIIT intervals are **time-based**, not fixed-rep targets. Rep counts are tracked as progress within each timed work interval. Plank is a timer only; the app does **not** verify plank form.

## How it works

```text
User preferences -> buildHiitPlan -> work/rest schedule
                                       |
Webcam -> MediaPipe -> RepCounter ------+-> UI + voice status
Microphone -> SpeechRecognition -> parseCoachRequest -> allowed session actions
                                       |
                               HiitSession state machine
                                       |
                               SpeechSynthesis guidance
                                       |
                         localStorage profile + workout history
```

- `hiit.mjs`: pure plan generation, time-based session state machine, context-aware natural-language intent parsing and optional MET-based energy estimate.
- `engine.mjs`: pure 2D pose geometry, squat/jack rep state machine and legacy session logic.
- `app.mjs`: browser UI, on-device pose inference, microphone recognition, spoken feedback, workout orchestration and storage.
- `index.html` / `styles.css`: responsive onboarding, live studio, plan overview and progress views.
- `tests/engine.test.mjs`, `tests/hiit.test.mjs`: deterministic unit tests; GitHub Actions runs all tests.
- `ENGINEERING_NOTES.md`: trade-offs, architecture and suggested reviewer walkthrough.
- `ai.md`: required AI-tool disclosure.
- `one-page-writeup.md`: draft Hiya submission write-up.

The **voice coach is not a free-form generative LLM**: it recognizes diverse natural-language expressions through a deliberately bounded, context-aware parser and turns them into deterministic, testable session actions. The user's “yes” to a break prompt is interpreted in context. This keeps the demo API-key-free. A future LLM could map utterances to the *same validated action schema*, but would need its own backend and robust testing.

## Tests

Requires Node.js 18+:

```bash
node --check app.mjs
node --test tests/*.test.mjs
```

The tests cover exercise angles, rep cycles, profile validation, multi-round planning, timed interval transitions, pause/resume, extra breaks, reduced intensity, and conversational intent interpretation.

**Important:** Unit tests cannot verify real-world microphone or webcam accuracy. Test the complete workflow in your own browser and record actual observations. User feedback indicated the revised movement counter works on their setup; guided HIIT and speech interactions require new live testing.

## Safety, privacy and limitations

- Webcam video is processed **locally in the browser**, not uploaded or recorded by WELP. MediaPipe files are downloaded from public hosts.
- Browser **SpeechRecognition may use a vendor-hosted service**. Do not claim voice audio always stays on-device.
- Profile and workout records are held in the browser's `localStorage`, not synced across devices; clearing history deletes local results.
- No fitness level is inferred from body size. Calorie estimates require optional weight and use a crude MET-based approximation for active time only. These are **not measured** or appropriate as calorie-burn targets.
- No injury diagnosis, validated form correction, physiological fatigue detection, or individualized medical exercise prescription.
- Inactivity triggers an **optional** check-in only when a body is detected; it is not a diagnosis of exhaustion.
- Voice recognition can miss utterances, especially with music/breathing; the text fallback and UI buttons remain available.
- If uncomfortable, stop; if dizzy or experiencing significant symptoms, stop exercising and seek appropriate help.

## Submission checklist

- [ ] Test a whole circuit using live camera and mic on the target laptop.
- [ ] Verify work/rest transitions, pause/resume, skip, “make it easier”, and “yes” to a break prompt.
- [ ] Verify history persists across refresh and a new circuit can be generated.
- [ ] Personalize `one-page-writeup.md` and `ai.md` to reflect what you actually used and tested.
- [ ] Record optional 2–3 minute video as insurance.
- [ ] Submit working prototype, one-page write-up and GitHub repo/ZIP by **11 Nov 2026, 11:59pm GMT**.

## Reference and attribution

- MediaPipe Pose Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
