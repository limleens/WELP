# WELP — Voice Latency and Listening Reliability

**Why this document exists:** In a live workout, a command that takes 3–8 seconds to complete may be too late. The applicant reported that voice requests often weren't heard or returned after the exercise had already changed. This is a real product issue, not something a more expressive voice alone fixes.

## What caused the problem (previous iteration)

1. **Serialized network calls:** Browser SpeechRecognition first produced a final transcript; then the app waited for an HTTP Gemini `generateContent` response; optional Gemini TTS performed another request. These delays accumulate.
2. **The coach gated its microphone during speech:** `speak()` stopped recognition until the full spoken sentence ended, and restarting previously waited another ~650ms. Long instructions produced avoidable deaf periods.
3. **Browser recognition lifecycle was fragile:** `SpeechRecognition` can end unexpectedly. A failed `start()` was caught and ignored, with no reliable retry; status said "Listening" even when the recognizer wasn't active.
4. **Pending cloud replies blocked later requests:** When an old Gemini turn was outstanding, a new user command could be ignored. That is unacceptable for "pause" or "take a break."

## Implemented fast-path improvements

- **Local control first:** `voice-fastpath.mjs` classifies unambiguous requests such as "pause my workout", "shorten breaks by fifteen seconds", "track ten jumping jacks", or "I'm tired". These execute immediately in the deterministic controller, without waiting on Gemini. **Unfamiliar conversational requests still use Gemini** if the user opts in.
- **Bound cloud waits:** Gemini calls in the browser have a short timeout (~2.4 seconds) before local fallback. A newer command aborts and supersedes an older pending cloud request. This is a responsiveness trade-off: some slower but valid Gemini responses will not be used.
- **Short automatic speech:** Stage announcements are brief, and coach replies are capped, reducing the periods when browser recognition cannot hear new commands.
- **More resilient SpeechRecognition:** Enable interim and continuous results where supported, display partial transcription, distinguish "Listening now" from "Reconnecting mic", retry `start()` after failures, and restart around 120ms after recognition ends or 90ms after audio playback.
- **Playback watchdog:** If a browser misses a speech-completion callback, the mic is eventually allowed to resume rather than remaining permanently gated.
- **Expressive TTS remains optional:** It currently generates a complete audio response before playback and can feel slower than the device voice. The app falls back to device speech after a short wait.

**Do not claim true real-time duplex / barge-in yet.** Web Speech browser recognition is deliberately paused during coach audio playback to reduce the app hearing its own speaker output. An uninterrupted user may still have to wait until the current short prompt ends. Full streaming audio, echo cancellation, voice activity detection and interruption handling require a stronger audio stack.

## Projects researched (architecture references only — no code copied)

1. [Google Gemini Live API Examples](https://github.com/google-gemini/gemini-live-api-examples): persistent audio streaming, model input/output, optional WebSocket sessions.
2. [Google Gemini Live API Web Console](https://github.com/google-gemini/live-api-web-console): browser audio recording/playback and event logs.
3. [LiveKit Agents](https://github.com/livekit/agents) and [Turn documentation](https://docs.livekit.io/agents/logic/turns/): reliable turn boundaries, barge-in, preemptive response generation, interruption state and VAD.
4. [Pipecat Examples](https://github.com/pipecat-ai/pipecat-examples): continuous STT→LLM→TTS pipeline, streaming and asynchronous audio.
5. [Google Gemini Live Best Practices](https://ai.google.dev/gemini-api/docs/live-api/best-practices): low-latency audio chunks, interruption events and promptly clearing old audio buffers.

We use these repositories for **conceptual design guidance**, not source-code duplication; inspect their licenses before incorporating files.

## Recommended architecture *after* the Hiya submission

Prefer a **Gemini Live audio session** or **LiveKit Agents + transport** with streaming browser audio over a persistent connection. Add VAD and endpointing to detect speech turns early, allow user barge-in to interrupt coach audio, and integrate WELP's validated workout actions as tools. Keep the existing `HiitSession` / `RepCounter` pure modules. This avoids migrating the UI and workout logic at the same time as replacing voice transport.

That migration is genuinely larger: secured sessions/authentication, audio packetization, resampling, buffering, device permission behavior, disconnect/reconnect recovery, echo handling and live tool-calling evaluation.

## How to verify and measure on your laptop

1. Run WELP in Chrome at localhost; build a 5-minute circuit and enable the microphone.
2. Watch **Listening now / Reconnecting mic / Coach speaking**. Say "pause my workout" and "resume" between prompts. Both should be handled without Gemini delay.
3. Say "shorten my breaks by 10 seconds" and "track ten more jumping jacks." Observe real workout stage changes.
4. With Gemini enabled, try an unfamiliar question. Check the developer console for `[WELP voice] Gemini response X ms`. After the short time budget, the local fallback should respond instead of waiting indefinitely.
5. Try with expressive TTS disabled first. Enable it afterward to see the latency difference.
6. Check whether the mic misses speech *while the coach is still talking*; this remains a known limitation and is not hidden by test results.

**Target metrics to measure manually:** (a) final transcript → workout action time, (b) final transcript → audible response start, (c) percent of distinct utterances recognized on the first try, and (d) number of missed instructions while TTS is active. Automated unit tests can only validate command classification and speech policies, not live capture or acoustics.

## Interview explanation

"We first used browser speech recognition, an optional Gemini text request, and TTS sequentially. In real workouts we saw delayed responses and missed commands. I profiled the architecture and introduced a hybrid fast path: time-critical commands bypass the LLM entirely, while ambiguous conversations still get a richer Gemini response. I shortened spoken prompts, made microphone restarts explicit, and bounded cloud request latency. The next step is a streaming voice session with VAD and interruption handling, using the same validated workout actions."

That describes an **observed engineering trade-off**, not a falsely claimed benchmark.
