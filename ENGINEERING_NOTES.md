# WELP — Engineering Walkthrough for Hiya
**Voice AI Challenge · Real-Time Assistance · November 2026**

## 30-second pitch

WELP is a hands-free, adaptive HIIT companion for home workouts. A user can set down their phone, hear live coaching and change an exercise by **talking**, such as: "make my breaks shorter", "I'm tired", or "track ten more jumping jacks." WELP combines microphone transcription, **optional Gemini natural-language understanding**, a constrained workout action system, camera-based repetition counting, and spoken responses. It is designed to work even if Gemini isn't configured.

## Architecture and data flow

```text
Phone / laptop microphone
  -> Browser SpeechRecognition (transcript; browser vendor may process audio remotely)
  -> Opt-in Node /api/coach -> Gemini generateContent
      -> JSON { reply, action, exercise, reps, seconds }
      -> validateCoachResponse
  OR local fallbackCoachReply (when cloud disabled/unavailable)
  -> performCoachAction -> HiitSession / RepCounter / workout history
  -> text response -> optional Node /api/tts (Gemini TTS)
                   -> fallback browser SpeechSynthesis
                   -> user's speaker

Webcam -> MediaPipe Pose Landmarker Lite -> 33 keypoints
       -> engine.mjs RepCounter -> counted rep -> HiitSession
       -> progress bar / displayed target / workout history

Profile + prior session history -> buildHiitPlan -> timed work/rest schedule
```

**Important interview distinction:** The AI does **not** generate arbitrary exercise prescriptions or directly mutate objects. Gemini handles language interpretation and phrasing. The state machine owns timers, exercise selection, limits and history. The language model outputs only a proposed structured action.

## Files to understand

| File | Responsibility |
|---|---|
| `index.html`, `styles.css` | Responsive onboarding, large voice-first live progress, controls and camera preview |
| `app.mjs` | Browser orchestration: speech recognition/synthesis, UI, session changes, MediaPipe, opt-in cloud calls |
| `coach-actions.mjs` | Action allowlist, numeric sanitization, natural-language offline fallback |
| `hiit.mjs` | Profile normalization, HIIT plan builder, timed session controller, added exercise stages, rest control |
| `engine.mjs` | Pure geometry and state-machine repetition counting |
| `server.mjs` | Optional Node HTTP server (static files, `/api/status`, `/api/coach`, `/api/tts`); keeps Gemini secret server-side |
| `tests/*.test.mjs` | Reproducible CI tests; excludes hardware accuracy |
| `ai.md` | Hiya-mandated disclosure of AI used |
| `one-page-writeup.md` | Hiya-mandated project summary draft |

## How voice changes a workout

Example input: **"Hey, can you help me track ten more jumping jacks?"**

1. Browser speech recognition produces a transcript.
2. If Gemini is enabled, the local server sends transcript and **limited session context only** (current exercise, countdown, recent exchanges) to Google's API. No webcam footage, full profile or body weight is sent.
3. Gemini returns a short reply and a proposed action: `{ action:"track_reps", exercise:"jack", reps:10, seconds:15, reply:"..." }`.
4. `validateCoachResponse` enforces an allowlist of operations, permitted exercises, bounded reps (3–40) and bounded seconds.
5. `HiitSession.addExercise` schedules the rep-target stage after the next recovery where possible. It prevents unlimited arbitrary stage creation.
6. When that stage begins, MediaPipe-based `RepCounter` counts jack reps. The display switches to **reps remaining**; the stage advances upon reaching ten, with a 120-second timeout.
7. A brief confirmation is spoken. If Gemini fails, the local phrase interpreter can perform the same bounded action.

Other calls map to explicit methods: `adjustRests`, `makeEasier`, `makeHarder`, `takeBreak`, `skip`, `start`, `pause`.

## Why HIIT and voice are a natural pairing

Hands and eyes are occupied during exercise. The most useful moments for voice are changing rest duration without tapping, asking how many reps remain, receiving exercise transitions, and **reporting effort verbally**. WELP therefore removes the on-screen "How hard does it feel?" slider and asks how someone is doing **every third recovery period**. A "too much" response triggers a gentler plan; a "good" response stores positive feedback. It does not infer medical fatigue from webcam motion or voice tone.

## Session state and resilience

- `HiitSession.status`: `ready → active ↔ paused → complete`.
- `HiitSession.stages`: work stages, recovery stages and optional custom rep-target sets.
- `tick(now)`: uses elapsed milliseconds with a cap on hidden-tab gaps, advances stages deterministically and emits transitions.
- Profile fields: goal, experience, intensity, duration and optional weight. **Weight does not set difficulty**; it is used only for an approximate energy estimate.
- Workout history: records active time, recovery time, reps, segments, check-in-derived effort and completion; saved to localStorage.
- Inactivity prompt: a question offered after prolonged low rep activity **only when the camera has detected the user**. Not a diagnosis.
- If an AI request returns after the interval changes, potentially disruptive actions are ignored and the user is asked to repeat the request.
- All major actions have fallback buttons/text input.

## Rep counting (underlying computer vision)

MediaPipe provides landmarks, not rep counts. A visible-leg knee angle + normalized hip depth estimates squat up/down states; arm and ankle geometry estimates jumping jack open/closed. Two consistent observations and a completed movement cycle are needed to count one rep. Tracking interruptions reset partial states. The applicant reported that a previous iteration fixed their webcam's squat/jack detection, but this is not a cross-user accuracy benchmark. A plank is **only timed**, never form-scored.

## Gemini integration and key protection

Google's `generateContent` endpoint receives `systemInstruction` and a structured-output schema for proposed actions. Keys live in the **Node server environment** (`.env` is gitignored). Server binds to localhost and does not return or log keys. The app requests opt-in before sending user transcripts to Gemini.

Optional Gemini text-to-speech uses a separate model and returns audio for short replies; device speech synthesis is the fallback. Cloud audio can add latency, so it is opt-in. For wider deployment add HTTPS, authentication, quotas/rate limits and abuse safeguards. **Never deploy this local proxy publicly unchanged.**

Google model availability and TTS quality must be confirmed with a real key and tested in the target environment. Automatic unit tests mock those responses.

## Why these engineering choices?

- **Constrained tool actions instead of an unrestricted LLM:** easier to validate, test, debug, and prevent unbounded intensity changes.
- **Optional LLM:** the prototype still starts with a local fallback if API keys are unavailable to Hiya reviewers.
- **No frontend build system:** dependency-light Node+browser prototype is faster to set up and less brittle before a short deadline.
- **On-device vision:** avoids video upload, reduces inference overhead and uses a capable pretrained model.
- **Big phone progress view:** user may be across the room; tiny dashboard controls are not the primary interface.
- **Separate `hiit.mjs`, `coach-actions.mjs`, `engine.mjs`:** pure logic can be tested without browser hardware, while `app.mjs` handles integration.

## 2–3 minute demo narrative

1. Show onboarding, pick a 5-minute HIIT session, and generate a circuit.
2. Enable camera and microphone. For a Gemini demo, start Node with your private key, enable the Gemini toggle and optionally expressive TTS.
3. Say **"start workout"** and do visible squats or jumping jacks.
4. Say **"shorten my breaks"** and **"add ten more jumping jacks"**; demonstrate the queue changing and the added rep-target progress.
5. During a break, show a natural-language exchange like **"I'm tired"** and watch the remaining plan adapt. If there are three rest periods in the demo, WELP asks proactively how the user is feeling.
6. Show updated history and the pure tests. Explain the limitation that cloud Gemini inference/voice quality and actual camera accuracy require device testing.

## Likely questions and compact answers

**Why use Gemini instead of keyword matching?** It interprets paraphrases and short conversational replies, but is not trusted with direct mutations; the controller applies a fixed schema.

**Where is AI in the app?** MediaPipe for pose inference, browser ASR, optional Gemini for natural-language understanding and optional Gemini TTS. Planning, counting-state changes and adaptation are explainable programmed logic.

**How do you prevent prompt-injection-like workout actions?** Only named actions are accepted, with allowed exercise keys and numeric limits; a model response cannot execute code or set unrestricted targets. Client validation is the final guard.

**Why can reviewers run without credentials?** A local fallback exists. This is important because a private API key must not be committed to GitHub.

**How does feedback adapt the plan?** Spoken positive/difficult feedback updates a bounded session difficulty score; future plans reduce work/recovery burden or slightly progress if comfortable.

**What hasn't been proven?** Real device latency, ASR reliability during heavy breathing, API availability/billing, cross-camera motion accuracy, and fitness efficacy.

## Verification checklist

- [ ] `node --test tests/*.test.mjs` passes locally and in GitHub Actions.
- [ ] The UI works in Chrome on localhost with no key.
- [ ] With a private Gemini key, the checkbox enables and a free-form utterance triggers a validated action.
- [ ] Optional Gemini TTS plays, or falls back to browser voice.
- [ ] Added ten-rep jack stage actually counts to ten and advances.
- [ ] After three rests, WELP asks how the user feels; response affects remaining plan.
- [ ] Mobile viewport remains legible, and camera/mic permissions are available under HTTPS.
- [ ] AI usage disclosure and one-page write-up describe only verified behaviour.

**Honesty note:** The CI test suite verifies pure logic, mocked API calls, local server routes and DOM references—not a fully validated end-to-end browser or fitness system.


## Voice latency and microphone feedback iteration
The applicant reported missed spoken commands and model replies arriving after exercise transitions. WELP now uses an instant local fast path for unambiguous commands and limits network waits for less familiar conversation. It restarts browser recognition more aggressively, shows current recognition state, and produces short automatic coaching cues. See **VOICE_PERFORMANCE.md** for a failure analysis, architectural alternatives (Gemini Live, LiveKit Agents, Pipecat), validation instructions, and interview discussion. Full-duplex interruption is still a known limitation.
