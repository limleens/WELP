# Hanpi — delivery checklist

## P0: working Hiya prototype

- [x] Research existing Mandarin tone feedback, OCR and pitch-extraction projects.
- [x] Choose desktop-first browser app (Gradio) over native iPhone for the 12-hour scope.
- [x] Use a **separate feature branch** to avoid overwriting WELP.
- [x] Upload photo → local Chinese OCR → editable Hanzi text.
- [x] Show pinyin with basic tone sandhi (e.g., 你好: nǐ hǎo → ní hǎo).
- [x] Select individual syllable → play browser reference → record microphone input.
- [x] Measure real F0 via Praat/Parselmouth; estimate isolated-syllable contours.
- [x] Show qualitative results, pitch chart, and tone-specific practice tip.
- [x] Add conservative refusal for silent, too-short, ambiguous recordings.
- [x] Add optional offline ASR only when explicitly enabled.
- [x] Add setup documentation, AI use disclosure, and automated tests.
- [x] Run automated contour and sandhi tests locally (10 passing).
- [x] Smoke-test photo OCR fallback with a generated image of 你好.
- [ ] **Run clean install on the target Windows laptop** and check microphone permissions.
- [ ] **Test with genuine speaker recordings** of all four tones; log misses/abstentions.
- [ ] **Test on 3 actual photos**, including a sign/menu rather than only generated text.
- [ ] Confirm a Mandarin speech-synthesis voice exists on the demo browser.
- [ ] Capture end-to-end demo video and write one-page Hiya summary.
- [ ] Move hanpi folder to a standalone repository later if desired.

## P1: after P0 is reliable

- [ ] Collect real Mandarin speech examples and calibrate/replace the heuristic grader.
- [ ] Evaluate [Tone.me pretrained Wav2Vec2 model](https://huggingface.co/cge7/wav2vec2-base-version3) for more robust tone classification.
- [ ] Add syllable-level forced alignment for longer phrases.
- [ ] Add proper phoneme/initial/final assessment separately from pitch.
- [ ] Test tone sandhi and neutral tones with native speakers.
- [ ] Check iPhone camera/microphone integration over HTTPS.

## Manual test matrix

| Input | Expected | Evidence |
| --- | --- | --- |
| Generated image of 你好 | OCR returns 你好 | Local Tesseract smoke test passed |
| Written 你好 | Spoken ní hǎo | Unit test passed |
| Synthesised level/rising/dipping/falling tones | Labels 1/2/3/4 | Four unit tests passed |
| Silence, missing recording | Clear retry message | Unit tests passed |
| Spoken Mandarin by multiple speakers | Quality judged cautiously | **Not validated yet** |
| Connected sentence | Outside current scope | Deliberately unsupported |
