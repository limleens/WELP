# hanpi · 汉拼

**See it. Say it. Understand your tone.** A desktop-first Mandarin pronunciation coach for the Hiya Voice AI Challenge.

Hanpi turns a photo of Hanzi into a spoken practice session. Upload a Chinese phrase, check the pinyin, select one character, listen to a reference voice, **say one syllable aloud**, and inspect the contour of your actual pitch with actionable feedback.

## Run locally (desktop browser)

Use **Python 3.11** and a computer with a microphone.

1. Download this feature branch and enter the hanpi folder.
2. Create a Python virtual environment:

```bash
python -m venv .venv
```

Activate it: on Windows, run `.venv\Scripts\Activate.ps1`; on macOS/Linux run `source .venv/bin/activate`.

```bash
python -m pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:7860** in your desktop browser and grant microphone access. No GPU or API keys are needed. First-time installation downloads model/package dependencies.

## Demo

1. Start with the sample **你好**, or upload a photo, click **Find Hanzi in photo**, and correct the OCR output if necessary.
2. Select **你**: its written pinyin is *nǐ*, but before **好** it is normally pronounced *ní* (third-tone sandhi).
3. Use **Hear an example** (it plays a whole phrase when the selected syllable changes tone in context; otherwise the single character).
4. Record yourself saying **ní only**, then press **Analyse my tone**.
5. View your pitch curve, the estimated contour type, and a correction tip.
6. Repeat with **好** or try **中国 / 谢谢 / 妈妈**.

For tone testing, isolated **妈, 麻, 马, 骂** target tones 1–4 respectively.

## Architecture and honest limitations

| Stage | Technology |
| --- | --- |
| Photo → Chinese text | Local RapidOCR pretrained ONNX model; optional Tesseract fallback |
| Hanzi → written/spoken pinyin | PyPinyin with tone-sandhi handling |
| Reference speech | Browser SpeechSynthesis (platform-dependent voice availability) |
| Voice → pitch | Praat/Parselmouth F0 extraction from microphone audio |
| Pitch → coaching | Interpretable, non-ML heuristic contour classification; abstains if uncertain |
| Optional speech transcription | Faster-Whisper tiny, CPU; installed separately |

**Important:** This is a functional **isolated-syllable practice prototype**, not a validated Mandarin pronunciation-scoring model. There is no automatic alignment of connected multi-syllable speech. Pitch alone cannot independently identify the consonant/vowel, and naturally low third tones may be marked uncertain. Neutral tone is not scored. The reference is a schematic curve, not voice-matched. Neither OCR nor polyphonic-character readings are infallible. Keep the page open during recording; there is no iPhone background listening.

**Experimental text transcription** can be enabled with:

```bash
python -m pip install -r requirements-asr.txt
```

It downloads a small pretrained Whisper model on first use; ASR is not used for tone grading.

## Testing

```bash
python -m pip install pytest
python -m pytest -q
```

Unit tests cover four generated pitch contours, silent recordings, Hanzi filtering and third-tone sandhi. Synthetic tests do **not** prove accuracy on human speech. See [TASKS.md](TASKS.md) for outstanding manual validation.

## Inspiration and code provenance

New code developed for Hanpi. Project-level architecture informed by [Tone.me](https://github.com/tone-me/tone-me) (MIT), [Mandarin Speech Coach](https://github.com/anton-dergunov/mandarin-speech-coach) and [Mandarin Pronunciation Evaluator](https://github.com/FeisalDy/oral_pronunciation_assessment). **No entire source files were copied**. Third-party dependencies include [RapidOCR](https://github.com/RapidAI/RapidOCR), [PyPinyin](https://github.com/mozillazg/python-pinyin) (MIT), and [Parselmouth](https://github.com/YannickJadoul/Parselmouth). Review individual package/model licences if redistributing.

See [ai.md](ai.md) for project and developer AI usage. Photos/recordings are processed locally by default; speech playback may rely on browser/platform services.
