"""Hanpi — desktop-first, voice-led Mandarin pronunciation practice.

Run from this directory: python app.py
"""
from __future__ import annotations

from html import escape
import gradio as gr
import matplotlib.pyplot as plt
import numpy as np

from hanpi_core.ocr import extract_hanzi
from hanpi_core.gloss import meaning_for
from hanpi_core.library import save_entry, list_entries, get_entry, delete_entry, mark_practiced
from hanpi_core.text import clean_hanzi, get_syllables
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

#hero{border-radius:25px;padding:2.2rem!important;background:radial-gradient(circle at 95% 10%,#ffe7d1,transparent 45%),linear-gradient(125deg,#fff7ed,#fffdf9);border:1px solid #f2e4d6;margin:15px 0 23px;}
.tone-strip{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0;}
.tone-chip{min-width:76px;display:flex;flex-direction:column;gap:4px;padding:13px;border-radius:16px;text-align:center;border:1px solid transparent;}
.tone-chip b{font-size:28px}.tone-chip small{font-size:15px;font-weight:600}
.tone-1{background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe;}
.tone-2{background:#d1fae5;color:#047857;border-color:#a7f3d0;}
.tone-3{background:#ede9fe;color:#6d28d9;border-color:#ddd6fe;}
.tone-4{background:#fee2e2;color:#b91c1c;border-color:#fecaca;}
.tone-5{background:#f1f5f9;color:#475569;border-color:#e2e8f0;}
.library-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:15px 0;}
.library-card{padding:21px;border-radius:20px;background:#fffdfa;border:1px solid #ece4dc;}
.library-card .hanzi{font-size:34px;font-weight:700;margin:8px 0;color:#3c3026}
.library-card .reading{color:#996844;font-size:16px;}
.library-card .meaning{font-size:14px;margin-top:12px;color:#45392e}
.library-card .meta{font-size:12px;color:#a88764;margin-top:12px}
.library-empty{padding:28px;text-align:center;background:#fffaf5;border:1px dashed #d8bda4;border-radius:20px}
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
            '</div></div>', (''.join(s.hanzi for s in syllables) if selected.written_pinyin != selected.spoken_pinyin else selected.hanzi))

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



def _tones_markup(text):
    syllables, error = _readings(text)
    if error or not syllables:
        return '<em>Upload a photo or type Hanzi to see the tones.</em>'
    return '<div class="tone-strip">' + ''.join(
        f'<div class="tone-chip tone-{v.expected_tone}"><b>{escape(v.hanzi)}</b><small>{escape(v.spoken_pinyin)}</small></div>'
        for v in syllables) + '</div><small>Blue 1 · Green 2 · Purple 3 · Red 4 · Grey neutral (spoken tones).</small>'


def _library_view():
    entries = list_entries()
    if not entries:
        cards = '<div class="library-empty">☆ Nothing saved yet. Star a word or sentence in Practice.</div>'
    else:
        cards = '<div class="library-grid">' + ''.join(
            f'<div class="library-card"><div class="meta">★ {escape(e.kind)}</div>'
            f'<div class="hanzi">{escape(e.hanzi)}</div>'
            f'<div class="reading">{escape(e.written_pinyin)}</div>'
            f'<div class="meaning">{escape(e.meaning)}</div>'
            f'<div class="meta">Practised {e.practice_count} time(s)</div></div>'
            for e in entries) + '</div>'
    choices = [(f"{e.hanzi} — {e.meaning} ({e.kind})", str(e.id)) for e in entries]
    return (gr.update(choices=choices, value=str(entries[0].id) if entries else None),
            cards, f"**{len(entries)} saved item(s)** · Stored locally on this computer.")


def _star_word(text, selection, word, meaning):
    syllables, error = _readings(text)
    if error or not syllables:
        return ("⚠️ Enter valid Hanzi first.", *_library_view())
    try:
        selected = syllables[int(selection or 0)].hanzi
    except (ValueError, IndexError):
        return ("⚠️ Choose a character first.", *_library_view())
    term = (word or "").strip() or selected
    if term not in clean_hanzi(text):
        return ("⚠️ The word must appear in the current phrase.", *_library_view())
    try:
        e = save_entry("word", term, meaning)
        return (f"★ Saved **{e.hanzi}**.", *_library_view())
    except (ValueError, RuntimeError) as exc:
        return (f"⚠️ {exc}", *_library_view())


def _star_sentence(text, meaning):
    try:
        e = save_entry("sentence", clean_hanzi(text), meaning)
        return (f"★ Saved **{e.hanzi}**.", *_library_view())
    except (ValueError, RuntimeError) as exc:
        return (f"⚠️ {exc}", *_library_view())


def _saved_detail(entry_id):
    e = get_entry(entry_id)
    if not e:
        return "Select an entry to see its reading."
    sandhi = f" · Spoken **{escape(e.spoken_pinyin)}**" if e.written_pinyin != e.spoken_pinyin else ""
    return f"### {escape(e.hanzi)} · {escape(e.written_pinyin)}\n\n{escape(e.meaning)}{sandhi}\n\nPractised {e.practice_count} time(s)."


def _reopen_saved(entry_id):
    e = get_entry(entry_id)
    if not e:
        return gr.update(), gr.update(), gr.update(), None, "⚠️ Select a saved item."
    return (e.hanzi, e.meaning, gr.update(selected="practice"), str(e.id),
            f"★ Reopened {e.hanzi} for practice.")


def _remove_saved(entry_id):
    ok = delete_entry(entry_id)
    return ("Removed star." if ok else "Select a saved item.", *_library_view())


def _meaning_for_selection(text, selection):
    syllables, _ = _readings(text)
    try:
        return meaning_for(syllables[int(selection or 0)].hanzi)
    except (ValueError, IndexError):
        return ""


def _suggest_meaning(text, saved_id):
    e = get_entry(saved_id)
    return e.meaning if e and e.hanzi == clean_hanzi(text) else meaning_for(text)


def _assess_and_track(audio, text, selection, use_asr, saved_id):
    feedback, chart, transcript = _assess(audio, text, selection, use_asr)
    e = get_entry(saved_id)
    if feedback.startswith("###") and e and e.hanzi == clean_hanzi(text):
        mark_practiced(saved_id)
    return feedback, chart, transcript


def build_app():
    with gr.Blocks(title="hanpi · see it, say it") as demo:
        gr.Markdown("""<div id='hero'><div id='eyebrow'>Voice-first language practice</div>
<h1>hanpi <span style='color:#bb7544'>·</span> 汉拼</h1>
<p>See a Chinese character. Hear its pronunciation. Try the tone. Learn from your own voice.</p></div>""")
        active_saved = gr.State(None)
        with gr.Tabs(selected="practice") as main_tabs:
            with gr.Tab("🎙 Practice", id="practice"):
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
                        hear_btn = gr.Button("🔊 Hear an example (in context for sandhi)", variant="secondary")
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

                gr.Markdown("### Pinyin & tone colours")
                tone_cards = gr.HTML(_tones_markup("你好"))
                sentence_meaning = gr.Textbox(label="English meaning (editable)", value="Hello", placeholder="Add a meaning for your phrase")
                gr.Markdown("### ☆ Add to your collection")
                with gr.Row():
                    with gr.Column():
                        word_input = gr.Textbox(label="Word from the phrase (optional)", placeholder="Leave blank for the selected character")
                        word_meaning = gr.Textbox(label="English word meaning", value="You")
                        star_word_button = gr.Button("☆ Star word", variant="secondary")
                    with gr.Column():
                        gr.Markdown("**Save the full phrase**")
                        gr.Markdown("Store the Hanzi, pinyin and editable English meaning.")
                        star_sentence_button = gr.Button("☆ Star sentence", variant="secondary")
                star_status = gr.Markdown("Saved vocabulary is private and remains on your computer.")
            with gr.Tab("★ Starred", id="starred"):
                gr.Markdown("### Your Mandarin collection")
                gr.Markdown("Words and sentences you have starred—ready to practise again.")
                starred_total = gr.Markdown("Loading saved items…")
                starred_cards = gr.HTML('<div class="library-empty">Loading…</div>')
                saved_choice = gr.Dropdown(choices=[], label="Choose a saved word or sentence", interactive=True)
                saved_details = gr.Markdown("Choose a saved entry to review.")
                with gr.Row():
                    review_btn = gr.Button("🎙 Practise this again", variant="primary")
                    refresh_btn = gr.Button("↻ Refresh")
                    unstar_btn = gr.Button("Remove star", variant="secondary")
                starred_status = gr.Markdown("Stored offline in hanpi/data/hanpi_library.sqlite3.")

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
        assess_btn.click(_assess_and_track, inputs=[speech, hanzi_input, choice, use_asr, active_saved],
                         outputs=[judgement, pitch_plot, transcription])
        hanzi_input.change(_tones_markup, inputs=hanzi_input, outputs=tone_cards)
        hanzi_input.change(_suggest_meaning, inputs=[hanzi_input, active_saved], outputs=sentence_meaning)
        choice.change(_meaning_for_selection, inputs=[hanzi_input, choice], outputs=word_meaning)
        word_input.change(lambda x: meaning_for(x) if x else '', inputs=word_input, outputs=word_meaning)
        star_word_button.click(_star_word, inputs=[hanzi_input, choice, word_input, word_meaning],
                               outputs=[star_status, saved_choice, starred_cards, starred_total])
        star_sentence_button.click(_star_sentence, inputs=[hanzi_input, sentence_meaning],
                                   outputs=[star_status, saved_choice, starred_cards, starred_total])
        demo.load(_library_view, outputs=[saved_choice, starred_cards, starred_total])
        refresh_btn.click(_library_view, outputs=[saved_choice, starred_cards, starred_total])
        saved_choice.change(_saved_detail, inputs=saved_choice, outputs=saved_details)
        review_btn.click(_reopen_saved, inputs=saved_choice,
                         outputs=[hanzi_input, sentence_meaning, main_tabs, active_saved, starred_status])
        unstar_btn.click(_remove_saved, inputs=saved_choice,
                         outputs=[starred_status, saved_choice, starred_cards, starred_total])
    return demo

if __name__ == "__main__":
    build_app().launch(server_name="127.0.0.1", server_port=7860, inbrowser=True,
                       theme=gr.themes.Soft(primary_hue="orange", secondary_hue="slate", neutral_hue="stone"),
                       css=CSS)
