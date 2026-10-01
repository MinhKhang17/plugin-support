import hashlib
import threading


class HashDeduplicator:
    def __init__(self):
        self._seen = set()
        self._lock = threading.Lock()

    def add_if_new(self, data: bytes):
        digest = hashlib.sha256(data).hexdigest()
        with self._lock:
            if digest in self._seen:
                return False, digest
            self._seen.add(digest)
            return True, digest
