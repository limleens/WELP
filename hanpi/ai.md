# AI use disclosure · Hanpi

**Voice-first feature:** Image of Hanzi → readings → user speaks into microphone → audio pitch assessment and pronunciation coaching. Voice is integral because reading pinyin cannot demonstrate one's ability to reproduce a tone.

## Runtime

- **RapidOCR:** pretrained ONNX Chinese OCR models, local processing. Tesseract fallback.
- **PyPinyin:** dictionary/rules for reading and tone sandhi, not a generative model.
- **Praat/Parselmouth:** signal-processing pitch measurement (F0); we wrote a simple contour heuristic which can abstain. This is not a trained Mandarin tone model and should not be presented as one.
- **SpeechSynthesis:** browser/platform TTS for pronunciation examples.
- **Faster-Whisper:** optional local text transcript; downloads a model only when installed/used. ASR text is NOT the measured spoken tone.

## Development tools

OpenAI ChatGPT (GPT-6) assisted with GitHub research, architecture, initial implementation, tests, and documentation. External repositories were used as references, not as copy-pasted application source. Dependency/model licences are owned by their maintainers.

## Evaluation and safeguards

Initial tests cover only artificially generated pitch contours and text rules; a generated Hanzi image was OCR-smoke-tested with Tesseract. Human recording accuracy, real-photo OCR, and the user's Windows install remain to be tested before submission. Pitch contour ≠ complete pronunciation; low or unclear tone 3 may be unclassified. This is educational feedback, not a validated language-assessment or medical product.

Default OCR and audio grading run locally; user recordings are not sent to an LLM. Browser speech-synthesis services may depend on the host platform.
