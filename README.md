# WELP — Home Workout Helper

**Hiya Voice AI Challenge 2026** · Track: **Real-Time Assistance**

**WELP is a voice-first adaptive HIIT coach** for equipment-free workouts at home. It uses a webcam to count reps, a large glanceable timer/rep progress bar, and a voice coach to guide exercises, rest periods, and user-directed adaptations. You can say "add ten jumping jacks", "make breaks shorter", "I'm struggling", "what's next?", and WELP changes its session, not just its spoken answer.

## Quick start (no API key)

Requires Node.js 22+ (recommended) or Python 3, and recent Chrome/Edge.

```bash
git clone https://github.com/limleens/WELP.git
cd WELP
git switch feat/welp-home-workout-helper
node server.mjs
```

Open **http://localhost:8000**. WELP runs with **local conversation fallback**, basic browser speech recognition/synthesis, MediaPipe pose tracking, HIIT planning and history. You can also run `python -m http.server 8000` if you only need the static UI; the Gemini options will remain unavailable.

## Enable real Gemini conversation (optional)

The prototype includes a **Node.js backend proxy** so no API key is exposed to the browser. Google AI Studio access and model availability depend on your project; rates/costs may apply.

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env`, paste your key into `GEMINI_API_KEY`, and keep `.env` private (already gitignored).
3. Run:
   ```bash
   node --env-file=.env server.mjs
   ```
4. Open localhost, build a workout, and enable **Gemini conversation** in the coach area. This toggle is an explicit opt-in: transcript text and limited workout context are sent to Gemini, **not webcam video or body weight**.
5. For optional expressive Google neural speech, set `GEMINI_TTS=1` in `.env`, restart and turn on **Expressive AI voice** in the app. This feature may add latency and incur additional cost. Device speech is used automatically if the audio service fails.

**Windows PowerShell**: `Copy-Item .env.example .env` then edit `.env` with VS Code; run the Node command above.

**Security:** Never paste your key into `index.html`, `app.mjs`, a public GitHub issue, or the submission write-up. The server binds to `127.0.0.1` for local development; it is **not a production internet-facing API** (no user authentication or rate limits).

## Faster voice responses (November 9 performance iteration)

WELP now executes familiar workout requests **locally and immediately**, even with Gemini turned on; only unfamiliar or ambiguous conversational questions need a cloud request. A short cloud wait (~2.4 seconds) triggers a local fallback rather than leaving a workout hanging. Spoken exercise instructions are shorter; the browser ASR now distinguishes **Listening now** from **Reconnecting mic** and retries after restarts.

For best responsiveness, leave **Expressive AI voice** off initially, as full Gemini TTS responses add extra network delay. If the microphone still seems deaf, watch its live status and try speaking after the short spoken cue completes. **True barge-in (talking over the coach)** isn't fully supported with the browser Web Speech stack; the streaming architecture for that next step is described in [VOICE_PERFORMANCE.md](VOICE_PERFORMANCE.md).

## The voice-first experience

1. Choose workout goal, experience, intensity, length and optional weight (used **only** for a rough active-energy estimate).
2. Build a timed HIIT circuit of squats, jumping jacks, plank holds and recovery intervals.
3. Enable camera and microphone, then say **"start workout"**.
4. The app automatically announces transitions. It checks in about how the workout feels **every third rest break**, and may ask if you want a break when rep activity stops while a body remains visible.
5. Requests can modify the workout:

   - **"Can you track 10 more jumping jacks?"** — inserts a camera-counted, **10-rep target** interval after the next recovery. The next stage begins once those reps are detected (a time limit also applies).
   - **"Add another set of squats."** — inserts a 30-second squat interval.
   - **"Make my breaks 10 seconds shorter."** — reduces remaining rest durations, with an 8-second minimum.
   - **"I'm exhausted; can we make it easier?"** — shortens remaining work, extends recovery and offers a break.
   - **"This is too easy."** — makes a small, bounded adjustment to later work/rest.
   - **"How am I doing?"**, **"What's next?"**, **"How do I do this?"**, **"Pause"**, **"Resume"**, **"Skip this"**, **"Finish workout"** — handled using session context.
6. WELP saves active time, reps, completed intervals, effort inferred only from **spoken feedback** (not a forced on-screen rating), and recent training results.

The **phone interface** emphasizes a large timer or reps-remaining counter and a progress bar. Small controls remain for permissions, correction and stopping the session. Camera/microphone permissions require **localhost or HTTPS**; simply accessing the laptop's plain HTTP LAN address from a phone will generally not give camera permissions. For a real remote-phone demo, use an HTTPS deployment with an appropriate secured backend.

## Architecture

```text
Webcam -> MediaPipe pose landmarks -> RepCounter ------------------+
Browser microphone -> SpeechRecognition -> transcript             |
                                          |                        v
                              Local intent fallback    Validated action dispatcher
                                          |                        |
               [opt-in] Node server /api/coach -> Gemini JSON -----+
                                                                   |
                              HiitSession timed/rep intervals <----+
                                        |                   |
                                Progress UI                 Spoken response
                                        |                   |
                                 localStorage        Browser TTS / optional
                                                     /api/tts Gemini speech
```

**Session state and safety remain deterministic.** Gemini generates a short natural reply plus one structured action; the controller validates the requested exercise, rep count, duration and session status before applying it. The AI cannot directly rewrite arbitrary workout code or issue unbounded fitness recommendations. If Gemini is absent or unavailable, the app falls back to an expanded local phrase interpreter.

- `hiit.mjs`: pure HIIT planner, state machine, added rep-target stages and break/workload adjustment.
- `coach-actions.mjs`: allowlisted AI actions, validation, local intent fallback.
- `voice-fastpath.mjs`: immediate local routing for time-critical spoken commands and short automatic voice cues.
- `server.mjs`: optional server-side Gemini text and TTS proxy, plus local static serving. No npm packages required.
- `engine.mjs`: MediaPipe landmark angle/state-machine rep counting.
- `app.mjs`: browser camera, speech, session events, UI, local storage and coaching integration.
- `index.html`, `styles.css`: accessible, responsive interface.
- `tests/`: Node unit tests for movement, planning, voice actions, server and UI references.
- `ENGINEERING_NOTES.md`, `VOICE_PERFORMANCE.md`, `ai.md`, `one-page-writeup.md`: engineering, audio-performance and submission materials.

## Automated tests

```bash
node --check server.mjs
node --check app.mjs
node --test tests/*.test.mjs
```

GitHub Actions runs these checks for each push and PR. They validate the state engine and mocks for Gemini calls; **they cannot verify real model access, audio quality, camera accuracy, browser microphone permissions, latency or natural speech on a phone**.

## Privacy and limitations

- Video frames are processed locally in MediaPipe; WELP does not record or upload them.
- Browser speech recognition may send audio to the browser vendor. When Gemini is opted in, transcript text and limited session context are sent to Google.
- No height, health history or medical condition is required; body weight is optional solely for rough MET-based energy estimates.
- Calorie values are estimates, not physiological measurements or calorie-burn goals.
- No claim of validated posture correction, injury prevention, fatigue detection, or medically supervised training. Inactivity simply triggers an optional check-in.
- Keep a manual rep-correction option; camera classification varies with lighting and perspective.
- This is a locally hosted prototype. If offering it publicly, add server authentication, rate limits, monitoring, HTTPS and key protections.

**Before submitting:** Run a live multi-interval workout with your own camera and microphone; test one Gemini conversation; test an added 10-rep interval; validate audio behaviour and exercise transitions; record a short demo. Deadline: **Wednesday, 11 November 2026, 11:59pm GMT**.

## Attribution

Google MediaPipe Pose Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js

Browser Speech Recognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

Gemini models and API key security: https://ai.google.dev/gemini-api/docs/
