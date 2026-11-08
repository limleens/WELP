# WELP — Engineering Notes for Hiya Review

**WELP: Home Workout Helper** | Hiya Voice AI Challenge | Real-Time Assistance track

## Thirty-second pitch
WELP is a voice-first companion for equipment-free home workouts. During exercise users' hands and attention are occupied, so they can say "start workout", "make it easier", "pause", "undo rep", or "how was my week?" without touching the screen. A pretrained on-device pose detector produces body landmarks; a deterministic state machine counts repetitions; session history and self-reported exertion inform the next target.

## Architecture
```
Webcam -> MediaPipe Pose Landmarker Lite -> 33 pose landmarks -> RepCounter
Microphone -> browser speech recognition -> parseVoiceCommand -> session state
Session state -> speech synthesis -> spoken coach
Session completion + effort rating -> localStorage -> suggestTarget
History -> weeklySummary -> progress page and spoken recap
```
There is no server, account, custom-trained pose classifier, or LLM inference in the app. MediaPipe runtime/model files download from external hosts. Browser speech recognition **may send audio to its vendor service**.

## File responsibilities
- `index.html`: UI layout and accessible controls.
- `styles.css`: responsive visual design.
- `app.mjs`: camera, microphone, voice synthesis, session state, rendering and local persistence.
- `engine.mjs`: pure angle geometry, repetition counting, voice intent parsing, target adaptation and weekly summaries.
- `tests/engine.test.mjs`: deterministic unit tests not requiring webcam access.
- `ai.md`: AI tools used and how.
- `one-page-writeup.md`: assignment write-up draft.

## Rep counting algorithm
MediaPipe estimates pose landmarks, **not repetitions**. Squat counts use the angle hip–knee–ankle; <112 degrees is down, >155 degrees is up. Jumping jacks compare wrist height with shoulders and ankle separation against shoulder width. The counter accepts a movement state after it remains stable for 140ms, requires a complete movement cycle, and limits counts to at most one per 650ms. Pause or lost camera tracking clears an incomplete movement so it cannot create a phantom rep on resumption. Users may manually add or undo reps. Plank mode is only a timer; form is not checked.

These fixed thresholds were chosen for a demonstration and are not validated across different body types, cameras, lighting, or exercise techniques.

## Voice interface
SpeechRecognition returns a transcript and a rule-based parser converts it to a structured intent. Both spoken commands and buttons use the same session functions, avoiding divergent state. Browser SpeechSynthesis speaks the result. Recognition pauses during the coach's speech to reduce accidental self-triggering. Commands include start, pause, resume, finish, target difficulty changes, progress, undo rep, exercise switch (between sessions), and weekly recap.

This is an intentional, constrained **voice-driven assistant**, not an open-ended LLM chatbot.

## Adaptation rules
The most recent saved session for the same exercise supplies completed/target and user-reported exertion (1–10):
- Under 80% completion or effort >=8: reduce next target by approximately 20%, subject to a minimum.
- Completed at least 100% with effort <=5: increase target slightly (+2 reps or +5 seconds), capped.
- Otherwise: maintain the current target.

The seven-day feature describes historical sessions; it does **not** create a personalized week-long workout programme. The heuristic is explainable and testable but not medical or professional exercise advice.

## Trade-offs
- **Vanilla browser JS**, rather than a bundled frontend and backend, minimizes setup risks under the three-day deadline.
- **MediaPipe pretrained model**, rather than training pose estimation, preserves time for a meaningful voice-driven interaction.
- **Deterministic workout decisions**, rather than an LLM generating fitness prescriptions, avoid unexplained high-impact changes.
- **localStorage**, rather than cloud accounts, simplifies privacy and demonstration, but data won't sync across devices.
- **Manual correction and screen controls** provide fallbacks for miscounted reps and unavailable speech.

## Changes made during WELP development (2026-11-08)
- Rebranded the original PacePal browser MVP as WELP — Home Workout Helper.
- Added undo rep by button and spoken command.
- Added seven-day session count and voice summary.
- Cleared incomplete movement states on pause, camera loss, and manual adjustments.
- Preserved older `pacepal-history-v1` records through a legacy-storage fallback.
- Moved tests from the incorrect root location into `tests/`, expanded tests, and added CI.
- Updated README, AI disclosure, and submission write-up.

## Suggested 2–3 minute demonstration
1. Open `http://localhost:8000` in Chrome after running `python -m http.server 8000`.
2. Show camera permission and how pose landmarks respond to a squat.
3. Enable microphone, say "start workout", perform a couple of reps.
4. Say "make it easier", "how many reps left?", and "undo rep" to demonstrate voice-driven state.
5. Rate the set as difficult, finish the workout, show saved history and the revised target. Ask "how was my week?"
6. Explain `engine.mjs` and run `node --test tests/engine.test.mjs`.

## Questions Hiya engineers might ask
**Why not train a model for reps?** MediaPipe provides sufficient low-level pose landmarks for a narrow demo. A deterministic state machine is transparent and easy to test; a future version would benchmark a temporal classifier.

**How prevent double counts?** Hysteresis thresholds, 140ms stability, complete cycles, 650ms cooldown, tracking interruption resets, and manual corrections.

**What if the camera or mic fails?** State and logs remain usable via on-screen controls; provide error messages and don't pretend failed input worked.

**Why is voice the right interface?** People are physically moving, have occupied hands, and need immediate audio feedback rather than typing mid-set.

**What next?** Real-user testing and measured rep error rates; better speech latency; rest timers, multi-exercise sessions, longitudinal planning, optional privacy-aware account sync.

## Verification and honesty
Local automated logic tests: **11 passed** with Node 22 when changes were prepared. Unit tests do **not** validate real-world camera accuracy, speech support or sound device behavior. Before submission:
- [ ] Test real webcam and MediaPipe download in Chrome.
- [ ] Try squats and jacks with varied distances and lighting.
- [ ] Test microphone permissions and voice commands.
- [ ] Verify pause/resume, persistence after page refresh, and history clearing.
- [ ] Test fresh-clone setup.
- [ ] Record optional demo video.

Disclose AI coding tools and verify every claim yourself before presenting.