from io import BytesIO
from PIL import Image, UnidentifiedImageError


def validate_image(data: bytes, min_width: int, min_height: int):
    try:
        with Image.open(BytesIO(data)) as im:
            im.verify()
        with Image.open(BytesIO(data)) as im:
            width, height = im.size
            fmt = (im.format or "").upper()
        if width < min_width or height < min_height:
            return False, f"too_small:{width}x{height}", None
        if fmt in {"GIF", "SVG"}:
            return False, f"unsupported:{fmt}", None
        return True, "ok", (width, height, fmt)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        return False, f"invalid:{exc}", None
