# PacePal — A Voice-First Adaptive Home Workout Companion

**Track:** Real-Time Assistance — Hiya Voice AI Challenge 2026

A minimal but working browser application for hands-free, equipment-free exercise. Uses webcam-based pose landmarks to count squats and jumping jacks, browser speech recognition for commands, text-to-speech coaching, local workout history, and transparent adaptive goals. Timed planks are included without pretending to verify correct form.

## Quick start

Requires Python 3 and a modern browser (Chrome or Edge recommended).

```bash
cd pacepal-starter
python -m http.server 8000
```

Open **http://localhost:8000** in Chrome. Do **not** open `index.html` as a `file://` URL. The browser must have an internet connection to download the MediaPipe JS runtime and pose model on first use.

1. Allow **camera** access by clicking *Enable camera*.
2. Stand sideways for squats, with your hip, knee, and ankle in the frame; allow pose model to load.
3. Click the **microphone button** and permit speech recognition. It listens for workout commands and speaks responses. Browser speech recognition may require a connection to a browser-provider service.
4. Say **“start workout”** (or click the Start button). Complete a squat and watch the counter. If pose tracking misses a rep, use *Add rep manually*.
5. Say **“make it easier”**, **“how many reps left”**, **“pause”**, **“resume”**, or **“finish workout”**.
6. Record your difficulty (1–10), finish, and visit *My progress* for saved history. Re-select the exercise to see your next target.

### Other voice commands

- `start workout`
- `pause`, `resume`, `finish workout`
- `make it easier`, `make it harder`
- `how many reps left?`
- `squats`, `jumping jacks`, `plank` (only between sessions)
- `help`

## Tech & implementation

- **Frontend:** vanilla HTML/CSS/JavaScript ES modules; deliberately dependency-light for the short deadline.
- **Computer vision:** Google MediaPipe Pose Landmarker Lite, loaded from jsDelivr / Google storage, processed on-device in the browser.
- **Rep counting:** custom hysteresis rule on knee angle (squats) or wrist/ankle landmarks (jacks); short hold duration guards against noisy landmarks. Not a form assessment.
- **Voice:** browser Web Speech API for speech recognition/synthesis. Voice support varies by browser, and recognition in Chrome may use a cloud service.
- **Planning:** deterministic rule using completion ratio and self-reported perceived effort; no medical claims or unvalidated fatigue inference.
- **Storage:** `localStorage` in the browser; no server required, no user accounts.

## Run the unit tests

Requires Node.js 18+ and no npm install:

```bash
node --test tests/*.test.mjs
```

## Privacy and constraints

- Webcam frames are processed by MediaPipe locally and are not stored by PacePal. The initial model/runtime files are downloaded from public CDNs.
- Browser speech recognition may send audio to the browser vendor's recognition service. Explain this to demo participants and use with their consent.
- Workout history is kept in the browser only and can be cleared in *My progress*.
- Pose counting is experimental. It can miss or overcount reps due to occlusion, side/front camera positioning, clothing, distance, or lighting. A manual correction control is included.
- Plank mode is a timer: it **does not analyze or correct plank form**.
- One exercise is supported per session. No real-time personal training assessment, medical advice, or safety-critical form correction.

## Known limitations / next steps

- Test webcam and voice recognition on the actual target Windows + Chrome computer. Browser hardware cannot be exercised from a command-line test.
- Tune rep-counting thresholds against real recordings from multiple people; show estimation confidence and a correction mechanism.
- Offer voice activity detection / alternative speech-to-text provider to reduce recognition restart latency.
- Add more exercises and per-user settings; expose a clear explanation of adaptation rules.
- Move history into a server database only with appropriate privacy protections.
- For the longer-term MLOps portfolio, add Docker, CI/CD, model testing, and logging; this is deliberately not required for the challenge MVP.

## Files

- `index.html` — UI structure.
- `styles.css` — responsive application design.
- `app.mjs` — UI, camera, speech, and storage integration.
- `engine.mjs` — pure pose-based rep counter, adaptation rules, voice command parsing.
- `tests/engine.test.mjs` — automated logic tests.
- `ai.md` — AI tool disclosure.
- `one-page-writeup.md` — submission draft; edit with your own results.

## Attribution

MediaPipe Pose Landmarker is provided by Google. Read its documentation and license before redistribution: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js

Web Speech browser support: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
