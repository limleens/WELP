"""Pitch contour coaching for one isolated syllable; not validated on humans."""
from dataclasses import dataclass
import numpy as np
import parselmouth
from scipy.ndimage import median_filter

TONES = {
    1: "level (first tone)", 2: "rising (second tone)",
    3: "low / dipping (third tone)", 4: "falling (fourth tone)",
    5: "neutral tone",
}
PRACTICE_TIPS = {
    1: "Sustain a steady, high vowel without a glide.",
    2: "Begin around the middle of your range and glide upward.",
    3: "Start low and stay low; in isolation you may dip and rise. In connected speech it often stays low.",
    4: "Start high and fall quickly, like a decisive 'No!'.",
    5: "Use a short unstressed vowel; neutral tone is not graded in this demo.",
}

@dataclass
class PitchResult:
    detected: int | None
    signal_quality: str
    reason: str
    times: np.ndarray
    semitones: np.ndarray
    range_st: float
    net_st: float

def _mono_float(data):
    a = np.asarray(data)
    if a.ndim == 2:
        a = np.mean(a.astype(np.float64), axis=1)
    if a.ndim != 1 or len(a) == 0:
        raise ValueError("Invalid audio. Record one clear syllable.")
    if np.issubdtype(a.dtype, np.integer):
        a = a.astype(np.float64) / float(np.iinfo(a.dtype).max)
    else:
        a = a.astype(np.float64)
    if not np.all(np.isfinite(a)):
        raise ValueError("Audio contains invalid samples.")
    return a

def analyze_tone(audio: tuple[int, np.ndarray]) -> PitchResult:
    if audio is None:
        raise ValueError("Record your pronunciation first.")
    sr, data = audio
    if sr < 8000 or sr > 192000:
        raise ValueError("Unsupported recording sample rate.")
    y = _mono_float(data)
    if len(y) / sr < .24:
        raise ValueError("Too short. Say one syllable clearly for about half a second.")
    if len(y) / sr > 8:
        raise ValueError("Recording too long; practise one syllable (under 8 seconds).")
    if float(np.sqrt(np.mean(y**2))) < .003:
        raise ValueError("No usable sound detected. Move closer to the microphone.")
    sound = parselmouth.Sound(y, sampling_frequency=sr)
    pitch = sound.to_pitch(time_step=.01, pitch_floor=75., pitch_ceiling=600.)
    hz = pitch.selected_array["frequency"]
    xs = pitch.xs()
    good = np.isfinite(hz) & (hz > 0)
    if good.sum() < 15:
        return PitchResult(None, "insufficient", "Not enough clearly voiced audio.", np.array([]), np.array([]), 0, 0)
    ids = np.flatnonzero(good)
    chunks = np.split(np.arange(len(ids)), np.flatnonzero(np.diff(ids) > 1) + 1)
    longest = max(chunks, key=len)
    times, f0 = xs[good][longest], hz[good][longest]
    if len(f0) < 15 or times[-1] - times[0] < .14:
        return PitchResult(None, "insufficient", "Pitch tracking too short; retry in a quiet room.", np.array([]), np.array([]), 0, 0)
    f0 = median_filter(f0, size=5, mode="nearest")
    median_log = float(np.median(np.log2(f0)))
    close = np.abs(12 * (np.log2(f0) - median_log)) < 8.5
    if close.sum() < 12:
        return PitchResult(None, "insufficient", "Unstable pitch tracking.", np.array([]), np.array([]), 0, 0)
    times, f0 = times[close], f0[close]
    t = (times - times[0]) / max(times[-1] - times[0], 1e-5)
    sample_t = np.linspace(0, 1, 41)
    signal = np.interp(sample_t, t, f0)
    st = median_filter(12 * np.log2(signal / np.median(signal)), size=3, mode="nearest")
    first, middle, last = float(np.mean(st[5:12])), float(np.mean(st[17:24])), float(np.mean(st[29:36]))
    net = last - first
    spread = float(np.percentile(st[3:38], 90) - np.percentile(st[3:38], 10))
    valley = min(first, last) - middle
    result, reason = None, "Unclear contour. Retry slowly with a clean, sustained vowel."
    if valley > 1.05 and (last - middle) > 1.05:
        result, reason = 3, "Pitch dipped low and then rose again."
    elif net >= 1.65 and last - middle >= .55:
        result, reason = 2, "Pitch rose across the vowel."
    elif net <= -1.65 and first - middle >= .40:
        result, reason = 4, "Pitch fell across the vowel."
    elif spread <= 1.70 and abs(net) <= 1.20:
        result, reason = 1, "Pitch stayed relatively level."
    return PitchResult(result, "usable", reason, sample_t, st, spread, net)
