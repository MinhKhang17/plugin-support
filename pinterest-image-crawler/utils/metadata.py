import csv
import os
import threading


class MetadataWriter:
    FIELDS = ["keyword", "source", "image_url", "file_path", "width", "height", "sha256"]

    def __init__(self, path):
        self.path = path
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path):
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                csv.DictWriter(f, fieldnames=self.FIELDS).writeheader()

    def write(self, row):
        with self._lock:
            with open(self.path, "a", newline="", encoding="utf-8-sig") as f:
                csv.DictWriter(f, fieldnames=self.FIELDS).writerow(row)
