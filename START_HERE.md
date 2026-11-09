# Start here — WELP HIIT prototype

**Pull request:** https://github.com/limleens/WELP/pull/1  
**Challenge deadline:** Wednesday, 11 November 2026, 11:59 PM GMT

## Try the guided workout (Chrome recommended)

```bash
git clone https://github.com/limleens/WELP.git
cd WELP
git switch feat/welp-home-workout-helper
python -m http.server 8000
```

Open **http://localhost:8000**; grant camera/mic permissions when prompted.

1. Enter a goal (e.g., Improve cardio), experience (Beginner), intensity (Light/Moderate), and quick 5-minute session; leave weight blank unless you want a rough calorie estimate.
2. Click **Build my HIIT circuit**. Review the timed work/rest schedule.
3. Click **Enable camera**, wait until the status says **Pose tracking ready**. Frame your entire body; squats side-on, jumping jacks facing forward.
4. Press the microphone button, then say **"start workout"**. Alternatively press **Start guided HIIT**. If speech recognition does not work, type commands into **Ask coach**; spoken outputs may still work.
5. Perform repetitions and watch the timer and rep counter. At a rest period, WELP should speak the transition and name the next exercise.
6. Ask **"how much time is left?"**, **"what's next?"**, **"I'm exhausted, make it easier"**, **"give me more rest"**, **"repeat instructions"**, **"skip this"**, or **"finish workout"**.
7. Test pause/resume and an inserted recovery break. Finish and open **My progress**; saved circuits should remain after refreshing the page.
8. Generate the next circuit and check that recent difficulty influences the plan.

## Run logic tests

```bash
node --test tests/*.test.mjs
```

Review `ENGINEERING_NOTES.md` to prepare for a Hiya code walkthrough and `ai.md` to accurately disclose AI assistance.

**Current verification:** automated logic and UI reference checks passed in GitHub Actions. The applicant previously confirmed the underlying revised pose counter works on their device, but **the new guided HIIT flow and conversational speech handling need live browser testing**. Do not claim they are validated until you try them.

## Priority if something breaks

1. Ensure you're on the **feature branch** and hard-refresh with **Ctrl + Shift + R**.
2. If the camera view is live but reps don't count, check **Pose tracking ready**, **ACTIVE** session status, and the knee/arms diagnostic below the video.
3. If voice recognition fails, use Chrome, allow microphone permissions, and use the text coach as fallback.
4. If a timer skips an interval or a request behaves unexpectedly, capture the exact command and visible stage/timer status for debugging.
5. Record a 2–3 minute optional screen demo as insurance before submitting.

This is an educational prototype, not exercise-related medical advice or a validated form-correction system.
