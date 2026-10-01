import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO

import requests
from PIL import Image

from processing.validator import validate_image


def slugify(text):
    value = re.sub(r"[^a-zA-Z0-9_-]+", "_", text.strip()).strip("_")
    return value[:100] or "keyword"


def _fetch(url, timeout, retries):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
        "Referer": "https://www.pinterest.com/",
    }
    last_error = "unknown"
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            r.raise_for_status()
            content_type = (r.headers.get("Content-Type") or "").lower()
            if not content_type.startswith("image/"):
                return None, f"not_image:{content_type}"
            return r.content, "ok"
        except requests.RequestException as exc:
            last_error = str(exc)
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))
    return None, last_error


def _prepare(url, timeout, retries, min_width, min_height):
    data, status = _fetch(url, timeout, retries)
    if data is None:
        return {"ok": False, "url": url, "reason": status}
    valid, reason, info = validate_image(data, min_width, min_height)
    if not valid:
        return {"ok": False, "url": url, "reason": reason}
    width, height, _ = info
    return {"ok": True, "url": url, "data": data, "width": width, "height": height}


def download_candidates(urls, keyword, output_root, limit, workers, timeout, retries,
                        min_width, min_height, jpeg_quality, deduper, metadata):
    folder = os.path.join(output_root, slugify(keyword))
    os.makedirs(folder, exist_ok=True)
    saved = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_prepare, u, timeout, retries, min_width, min_height) for u in urls]
        for future in as_completed(futures):
            if saved >= limit:
                break
            result = future.result()
            if not result["ok"]:
                continue
            is_new, digest = deduper.add_if_new(result["data"])
            if not is_new:
                continue
            try:
                with Image.open(BytesIO(result["data"])) as im:
                    if im.mode not in ("RGB", "L"):
                        im = im.convert("RGB")
                    elif im.mode == "L":
                        im = im.convert("RGB")
                    filename = f"{saved + 1:04d}_{digest[:12]}.jpg"
                    path = os.path.join(folder, filename)
                    im.save(path, "JPEG", quality=jpeg_quality, optimize=True)
                saved += 1
                metadata.write({
                    "keyword": keyword,
                    "source": "pinterest",
                    "image_url": result["url"],
                    "file_path": path.replace("\\", "/"),
                    "width": result["width"],
                    "height": result["height"],
                    "sha256": digest,
                })
                print(f"  DOWNLOAD {saved}/{limit} | OK")
            except OSError:
                continue
    return saved
