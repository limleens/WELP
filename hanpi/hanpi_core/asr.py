"""Optional offline Mandarin transcription; NOT used for tone grading."""
from functools import lru_cache
from tempfile import NamedTemporaryFile
from pathlib import Path
import numpy as np
import soundfile as sf

@lru_cache(maxsize=1)
def _model():
    from faster_whisper import WhisperModel
    return WhisperModel("tiny", device="cpu", compute_type="int8")

def transcribe(audio):
    rate, data = audio
    a = np.asarray(data)
    if a.ndim == 2:
        a = np.mean(a.astype(np.float32), axis=1)
    if np.issubdtype(a.dtype, np.integer):
        a = a.astype(np.float32) / float(np.iinfo(a.dtype).max)
    with NamedTemporaryFile(suffix=".wav", delete=False) as temp:
        path = Path(temp.name)
    try:
        sf.write(str(path), a, rate)
        segments, _ = _model().transcribe(str(path), language="zh", beam_size=1)
        return "".join(s.text for s in segments).strip() or "No speech recognized"
    finally:
        path.unlink(missing_ok=True)
