"""Local OCR with RapidOCR (preferred) and Tesseract fallback."""
from functools import lru_cache
from PIL import Image, ImageOps
from .text import clean_hanzi

@lru_cache(maxsize=1)
def _rapidocr():
    from rapidocr import RapidOCR
    return RapidOCR()

def extract_hanzi(image: Image.Image) -> tuple[str, str]:
    if image is None:
        raise ValueError("Upload a photo before selecting Detect Hanzi.")
    image = ImageOps.exif_transpose(image).convert("RGB")
    if max(image.size) > 2400:
        image.thumbnail((2400, 2400))
    errors = []
    try:
        import numpy as np
        result = _rapidocr()(np.array(image))
        txts = getattr(result, "txts", None)
        if txts is None and isinstance(result, (tuple, list)):
            rows = result[0] if len(result) == 2 else result
            txts = [row[1] for row in (rows or []) if len(row) >= 2]
        detected = clean_hanzi("".join(txts or []))
        if detected:
            return detected, "RapidOCR"
        errors.append("RapidOCR found no Hanzi")
    except (ImportError, OSError, RuntimeError, ValueError, TypeError) as exc:
        errors.append(f"RapidOCR: {exc}")
    try:
        import pytesseract
        raw = pytesseract.image_to_string(image, lang="chi_sim+chi_tra", config="--psm 6")
        detected = clean_hanzi(raw)
        if detected:
            return detected, "Tesseract"
        errors.append("Tesseract found no Hanzi")
    except Exception as exc:
        errors.append(f"Tesseract: {exc}")
    raise RuntimeError("No Hanzi detected. Try a close crop or type it manually. " + " | ".join(errors))
