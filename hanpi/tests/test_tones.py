"""Synthetic tests validate contour mechanics only; not human speech accuracy."""
import numpy as np
import pytest
from hanpi_core.tones import analyze_tone

def synth(contour, sr=16000, duration=.85):
    t = np.arange(int(sr * duration), dtype=float) / sr
    st = np.interp(t / duration, np.linspace(0, 1, len(contour)), contour)
    f = 195 * 2 ** (st / 12)
    phase = 2 * np.pi * np.cumsum(f) / sr
    envelope = np.minimum(1, np.minimum(t / .07, (duration - t) / .07)).clip(0, 1)
    y = envelope * (.28 * np.sin(phase) + .1 * np.sin(2*phase))
    return sr, y.astype(np.float32)

@pytest.mark.parametrize("expected,contour", [
    (1, [0,0,0,0,0]), (2, [-3,-2,-1,1,3]),
    (3, [2,-1,-3,-1,2]), (4, [3,1,-1,-3,-4]),
])
def test_synthetic_tones(expected, contour):
    out = analyze_tone(synth(contour))
    assert out.detected == expected
    assert len(out.times) == len(out.semitones) == 41

def test_silence():
    with pytest.raises(ValueError, match="No usable sound"):
        analyze_tone((16000, np.zeros(16000)))

def test_missing_audio():
    with pytest.raises(ValueError, match="Record"):
        analyze_tone(None)
