# Start here — WELP

This starter is a **browser application prototype** with tested non-camera logic. The webcam-based pose tracking and live browser speech features still need manual testing on your own laptop; they cannot be validated by the automated unit tests alone.

## First 10 minutes

1. Install Python 3 if you do not have it.
2. Open the project folder in VS Code.
3. Start a local server: `python -m http.server 8000` (Windows: `py -3 -m http.server 8000`).
4. Open http://localhost:8000 in Chrome or Edge.
5. Without a camera, press **Start session**, click **Add rep manually** twice, then **Finish**. Check **My progress** to confirm persistence.
6. Next enable camera and wait for MediaPipe to initialize. Standing side-on with full body visible, test squats.
7. Enable voice commands with the round microphone button; allow your browser's microphone permission. Try: `start workout`, `make it easier`, `how many reps left`, `finish workout`.

## Next 3 days

**Monday:** Test camera, speech, and squat counting in your actual room. Fix the biggest issue before adding features. Record three clean demo clips.

**Tuesday:** Improve reliability, especially difficult lighting, microphone errors, partial reps, and saving sessions. Decide whether to keep jacks and planks in the demo, based on observed accuracy.

**Wednesday:** Finalize the one-page write-up in your own words, verify README and ai.md, record an optional 2–3 min demo, push a GitHub repository or submit the ZIP. Leave ample time to submit before **Nov 11, 2026, 11:59 PM GMT**.

## Important limitations

- Live MediaPipe and Web Speech need your own browser tests.
- Planks are timed, *not* detected by the camera.
- No exercise-form correction, diagnosis, or advice is offered.
- Nothing is automatically hosted or pushed to GitHub.
