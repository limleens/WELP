# WELP — Start here (voice-first demo)

**Branch:** `feat/welp-home-workout-helper` · **Hiya deadline:** Wed 11 Nov 2026, 11:59pm GMT

## 1. Run WELP without any AI account

```bash
git clone https://github.com/limleens/WELP.git
cd WELP
git switch feat/welp-home-workout-helper
node server.mjs
```

Use Node.js 22+. Open **http://localhost:8000** in Chrome.

Build a workout from the welcome screen. Enable your camera and mic. Say **"start workout"**, try a few squats, and ask **"how much time left?"**. Basic speech interpretation is available without any Gemini key.

## 2. Turn on actual Gemini conversation

1. Create a key through https://aistudio.google.com/apikey.
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY=...`. **Don't post the key in chat or push it to GitHub.**
3. Run `node --env-file=.env server.mjs`.
4. Refresh localhost and turn on **Gemini conversation** in the coach area. You explicitly opt in to sending short transcripts and limited current-workout context to Google's service; camera video stays local.
5. Say *"Can you help me track ten more jumping jacks?"* and check that WELP adds a real interval.
6. Optional: set `GEMINI_TTS=1` and restart to enable **Expressive AI voice**. This can be slower; leave it off if responsiveness is more important.

## 3. Verify the new voice-first behaviour

Try these requests during an active session:

- "Make my breaks 10 seconds shorter" → future rest times decrease, with a minimum.
- "I'm exhausted" → remaining work becomes gentler and the coach offers a break.
- "This is too easy" → a small, bounded increase.
- "Add another set of squats" → a new squat interval appears after recovery.
- "Help me track 10 more jumping jacks" → a rep-target stage is added; once it starts, the large progress bar shows reps remaining and advances after ten detected reps.
- "How am I doing?" → spoken progress summary.
- Every third rest break → a brief spoken check-in about how you're feeling.

## 4. Test and prepare for the review

```bash
node --test tests/*.test.mjs
```

Read `ENGINEERING_NOTES.md` and `ai.md` to explain **where AI is used**, how model responses are translated to **validated workout actions**, the privacy choices, and what hasn't been tested. Capture an optional 2–3 minute demonstration video for Hiya.

**Phone testing note:** camera/mic typically require a secure origin. Localhost on your laptop works; a phone connecting to your laptop's plain HTTP LAN IP may not. Use HTTPS for genuine cross-device testing, with a secured backend. The provided local server is not production-ready.

**Manual verification still necessary:** Github Actions tests do not check a real Gemini account, real microphone, neural audio playback or full webcam workout accuracy.
