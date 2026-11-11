"""Hanpi — desktop-first, voice-led Mandarin pronunciation practice.

Run from this directory: python app.py
"""
from __future__ import annotations

from html import escape
import gradio as gr
import matplotlib.pyplot as plt
import numpy as np

from hanpi_core.ocr import extract_hanzi
from hanpi_core.text import get_syllables
from hanpi_core.tones import PRACTICE_TIPS, TONES, analyze_tone

CSS = """
.gradio-container {max-width: 1160px !important;margin:auto !important;}
#hero {padding:2rem 0 1rem;}
#hero h1 {font-size:clamp(2.4rem,5vw,4rem);line-height:1.1;letter-spacing:-.045em;}
#hero p {font-size:1.08rem;color:var(--body-text-color-subdued);}
#target-card {min-height:145px;border-radius:18px;background:linear-gradient(135deg,#f3eee3,#fff8e9);color:#362618;padding:22px;}
#target-card .hanzi {font-size:3.7rem;font-weight:700;line-height:1.35;}
#target-card .pinyin {font-size:1.4rem;color:#7a5535;margin-top:5px;}
#target-card .hint {font-size:.82rem;color:#806d58;margin-top:10px;}
#result-card {padding:14px;border-radius:14px;background:var(--background-fill-secondary);}
#eyebrow {letter-spacing:.16em;font-size:.75rem;font-weight:800;color:#a36a3b;text-transform:uppercase;}
"""

def _readings(text):
    try:
        return get_syllables(text), ""
    except RuntimeError as exc:
        return [], str(exc)

def _target_panel(text: str, index: str):
    syllables, error = _readings(text)
    if not syllables:
        return f'<div id="target-card"><p>{escape(error or "Enter Hanzi to begin.")}</p></div>', ""
    try:
        selected = syllables[int(index or 0)]
    except (ValueError, IndexError):
        selected = syllables[0]
    spoken = escape(selected.spoken_pinyin)
    written = escape(selected.written_pinyin)
    note = f"Written {written} · spoken {spoken} (tone sandhi)" if written != spoken else f"Written and spoken: {spoken}"
    return (f'<div id="target-card"><div class="hanzi">{escape(selected.hanzi)}</div>'
            f'<div class="pinyin">{spoken}</div><div class="hint">{note} · '
            f'tone {selected.expected_tone if selected.expected_tone != 5 else "neutral"}'
            '</div></div>', selected.hanzi)

def _sync_text(text):
    syllables, error = _readings(text)
    if error:
        return gr.update(choices=[], value=None), f"⚠️ {error}"
    if not syllables:
        return gr.update(choices=[], value=None), "Add a short phrase by photo or typing."
    menu = [(s.title, str(s.index)) for s in syllables]
    note = "Select one character; record only that syllable."
    if any(s.written_pinyin != s.spoken_pinyin for s in syllables):
        note += " Basic tone sandhi is accounted for."
    return gr.update(choices=menu, value="0"), note

def _read_image(image):
    try:
        result, engine = extract_hanzi(image)
        return result, f"✅ Detected with **{engine}**. Please review and correct OCR mistakes."
    except (ValueError, RuntimeError) as exc:
        return gr.update(), f"⚠️ {exc}"

def _pitch_figure(xs: np.ndarray, ys: np.ndarray, expected_tone: int):
    if not len(xs):
        return None
    fig, ax = plt.subplots(figsize=(8, 3.3))
    fig.patch.set_facecolor("#fbf8f3")
    ax.set_facecolor("#fbf8f3")
    ax.plot(xs, ys, color="#b8663b", linewidth=3, label="Your measured pitch")
    refs = {
        1: [0, 0, 0, 0, 0], 2: [-2.4, -1.5, -.6, 1, 2.6],
        3: [1.5, -1.2, -2.2, -1.3, .8], 4: [2.7, 1.6, 0, -1.8, -3.3],
    }
    if expected_tone in refs:
        reference = np.interp(xs, np.linspace(0, 1, 5), refs[expected_tone])
        reference -= float(np.median(reference))
        ax.plot(xs, reference, color="#6c8c90", linewidth=2, linestyle="--",
                label="Schematic expected tone (not voice-matched)")
    ax.axhline(0, color="#b5a99b", alpha=.5, linewidth=1)
    ax.set_xlabel("Position within voiced syllable")
    ax.set_ylabel("Pitch (semitones relative to median)")
    ax.set_xlim(0, 1)
    ax.legend(loc="lower left", fontsize=8, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    return fig

def _assess(audio, text: str, selected_index: str, use_asr: bool):
    syllables, error = _readings(text)
    if error or not syllables:
        return "⚠️ Enter a valid Hanzi phrase first.", None, "Not attempted"
    try:
        syllable = syllables[int(selected_index or 0)]
    except (ValueError, IndexError):
        return "⚠️ Choose a character first.", None, "Not attempted"
    try:
        score = analyze_tone(audio)
    except ValueError as exc:
        return f"⚠️ {exc}", None, "Not attempted"
    expected = syllable.expected_tone
    if expected == 5:
        judgement = "🟡 **Neutral tone is not automatically scored.**"
    elif score.detected is None:
        judgement = "🟡 **Not enough evidence to judge this tone.**"
    elif score.detected == expected:
        judgement = "🟢 **Promising match!** Your pitch contour resembles the target."
    else:
        judgement = f"🟠 **Different pitch pattern detected:** {TONES[score.detected]}."
    detected = TONES.get(score.detected, "uncertain")
    message = (f"### {syllable.hanzi} · {syllable.spoken_pinyin}\n\n"
               f"{judgement}\n\n"
               f"**Expected:** {TONES[expected]} · **Observed:** {detected}\n\n"
               f"**Evidence:** {score.reason}\n\n"
               f"**Try this:** {PRACTICE_TIPS[expected]}\n\n"
               "*Experimental pitch-based coaching, not a validated pronunciation score. "
               "This does not independently recognise the consonant or vowel.*")
    transcript = "Disabled. Enable optional Whisper transcription to try it."
    if use_asr:
        try:
            from hanpi_core.asr import transcribe
            transcript = transcribe(audio)
        except Exception as exc:
            transcript = f"Offline transcription unavailable: {exc}. Install the optional ASR requirements."
    return message, _pitch_figure(score.times, score.semitones, expected), transcript

def build_app():
    with gr.Blocks(title="hanpi · see it, say it") as demo:
        gr.Markdown("""<div id='hero'><div id='eyebrow'>Voice-first language practice</div>
<h1>hanpi <span style='color:#bb7544'>·</span> 汉拼</h1>
<p>See a Chinese character. Hear its pronunciation. Try the tone. Learn from your own voice.</p></div>""")
        gr.Markdown("**01 · Choose a phrase** &nbsp;&nbsp;&nbsp;&nbsp; **02 · Speak one syllable** &nbsp;&nbsp;&nbsp;&nbsp; **03 · Inspect pitch**")
        with gr.Row(equal_height=False):
            with gr.Column(scale=1, min_width=300):
                gr.Markdown("### 1. Start with a photo")
                photo = gr.Image(label="Photo of Hanzi", type="pil", sources=["upload", "webcam", "clipboard"], height=225)
                ocr_btn = gr.Button("Find Hanzi in photo", variant="secondary")
                ocr_message = gr.Markdown("Try a clear close-up of 1–8 Chinese characters.")
                hanzi_input = gr.Textbox(label="Detected / editable Hanzi", value="你好", max_lines=1,
                                         placeholder="例如：你好 or 中国")
                gr.Examples(examples=[["你好"], ["中国"], ["谢谢"], ["妈妈"], ["汉字"]],
                            inputs=[hanzi_input], label="Quick examples")
            with gr.Column(scale=1, min_width=300):
                gr.Markdown("### 2. Practise one syllable")
                choice = gr.Dropdown(choices=[("1. 你 · ní (sandhi)", "0"), ("2. 好 · hǎo", "1")],
                                     value="0", label="Select a syllable")
                chooser_note = gr.Markdown("Choose a character and record only that syllable.")
                target_panel = gr.HTML(_target_panel("你好", "0")[0])
                current_char = gr.Textbox(value="你", visible=False)
                hear_btn = gr.Button("🔊 Hear an example", variant="secondary")
                speech = gr.Audio(sources=["microphone", "upload"], type="numpy", format="wav",
                                  label="Record pronunciation (one syllable)")
                with gr.Accordion("Optional: text transcription", open=False):
                    use_asr = gr.Checkbox(value=False, label="Attempt offline Whisper (extra install + model download)")
                    gr.Markdown("Whisper can infer words from context; pitch assessment is separate.")
                assess_btn = gr.Button("Analyse my tone", variant="primary")
        gr.Markdown("### 3. Your feedback")
        with gr.Row():
            with gr.Column(scale=1):
                judgement = gr.Markdown("Record a syllable and press **Analyse my tone**.", elem_id="result-card")
                transcription = gr.Textbox(label="Optional text transcription (not used to grade tones)",
                                           value="Not yet run", interactive=False)
            with gr.Column(scale=1):
                pitch_plot = gr.Plot(label="Your pitch against a schematic target")
        gr.Markdown("""---
**Technique:** Photo OCR → Pinyin + sandhi → microphone audio → Praat pitch tracking → interpretable contour feedback.
Practise **one syllable at a time**; tone accuracy is not validated on human speech yet.""")
        ocr_btn.click(_read_image, inputs=photo, outputs=[hanzi_input, ocr_message])
        updated = hanzi_input.change(_sync_text, inputs=hanzi_input, outputs=[choice, chooser_note])
        updated.then(_target_panel, inputs=[hanzi_input, choice], outputs=[target_panel, current_char])
        choice.change(_target_panel, inputs=[hanzi_input, choice], outputs=[target_panel, current_char])
        hear_btn.click(fn=None, inputs=[current_char], outputs=None, js="""(hanzi) => {
            if (!hanzi) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(hanzi);
            u.lang='zh-CN'; u.rate=0.75;
            window.speechSynthesis.speak(u);
        }""")
        assess_btn.click(_assess, inputs=[speech, hanzi_input, choice, use_asr],
                         outputs=[judgement, pitch_plot, transcription])
    return demo

if __name__ == "__main__":
    build_app().launch(server_name="127.0.0.1", server_port=7860, inbrowser=True,
                       theme=gr.themes.Soft(primary_hue="orange", secondary_hue="slate", neutral_hue="stone"),
                       css=CSS)
