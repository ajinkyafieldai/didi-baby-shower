#!/usr/bin/env python3
"""Receive Daily camera frames; never publishes media or captures a desktop."""
import argparse
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import hashlib
import io
import json
import logging
import math
import os
from pathlib import Path
import signal
import threading
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from daily import CallClient, Daily, EventHandler
from PIL import Image, ImageDraw, ImageFont, ImageOps

LOG = logging.getLogger("daily-photobooth")
BOT_ID = "daily-photobooth"
COUNTDOWN_MS = 3000
LATE_MS = 750
FRAME_MAX_AGE_MS = 2000
SAFE_SETTINGS = {
    "inputs": {"camera": {"isEnabled": False}, "microphone": {"isEnabled": False}},
    "publishing": {key: {"isPublishing": False} for key in
                   ("camera", "microphone", "screenVideo", "screenAudio")},
}


def now_ms():
    return time.time() * 1000


def compose_grid(tiles):
    if not tiles:
        raise RuntimeError("No family participants in the room")
    columns = math.ceil(math.sqrt(len(tiles)))
    rows = math.ceil(len(tiles) / columns)
    # Bound output and retain every participant instead of truncating the family.
    width = min(1920, columns * 640)
    cell_w = width // columns
    cell_h = int(cell_w * 0.75)
    label_h = max(24, int(cell_w * 0.065))
    image = Image.new("RGB", (width, rows * (cell_h + label_h)), "#181322")
    draw = ImageDraw.Draw(image)
    font_path = os.getenv("PHOTO_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    try:
        font = ImageFont.truetype(font_path, max(14, label_h - 10))
    except OSError:
        font = ImageFont.load_default()
    for i, (name, frame, reason) in enumerate(tiles):
        x, y = (i % columns) * cell_w, (i // columns) * (cell_h + label_h)
        if frame is not None:
            image.paste(ImageOps.fit(frame, (cell_w, cell_h)), (x, y))
        else:
            draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), fill="#302a3e")
            draw.text((x + cell_w // 2, y + cell_h // 2), reason,
                      font=font, fill="white", anchor="mm")
        # Fit long names; optional PHOTO_FONT supports the family's scripts.
        label = str(name).replace("\n", " ")[:100]
        while draw.textlength(label, font=font) > cell_w - 20 and label:
            label = label[:-1]
        draw.text((x + 10, y + cell_h + 3), label, font=font, fill="white")
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=88, optimize=True)
    return out.getvalue()


class SiteAPI:
    def __init__(self, base_url):
        self.base = base_url.rstrip("/")

    def request(self, path, data=None, headers=None):
        if isinstance(data, dict):
            data = json.dumps(data).encode()
            headers = {"Content-Type": "application/json", **(headers or {})}
        req = Request(self.base + path, data=data, headers={"User-Agent": "Didi-Photobooth/1.0", **(headers or {})})
        with urlopen(req, timeout=8) as response:
            result = json.load(response)
        if result.get("ok") is False or result.get("error"):
            raise RuntimeError("Site API rejected request")
        return result


class RoomEvents(EventHandler):
    def __init__(self, worker, generation):
        self.worker, self.generation = worker, generation

    def on_participant_joined(self, participant):
        self.worker.participant(participant, self.generation)

    def on_participant_updated(self, participant):
        self.worker.participant(participant, self.generation)

    def on_participant_left(self, participant, reason):
        with self.worker.lock:
            if self.generation == self.worker.generation:
                pid = participant["id"]
                self.worker.people.pop(pid, None)
                self.worker.frames.pop(pid, None)
                self.worker.renderers.discard(pid)

    def on_call_state_updated(self, state):
        with self.worker.lock:
            if self.generation != self.worker.generation:
                return
            self.worker.ready = state == "joined"
            if state in ("left", "error"):
                self.worker.failure("daily_disconnected")


class Photobooth:
    def __init__(self, api, token=None):
        self.api, self.token = api, token
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.client = None
        self.generation = 0
        self.room = None
        self.ready = False
        self.people, self.frames = {}, {}
        self.renderers = set()
        self.cursor = None
        self.seen = OrderedDict()
        self.pending = {}
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.status = "starting"
        self.last_error = None
        self.last_request = None
        self.last_capture = None
        self.last_snapshot = 0
        self.join_started = 0
        self.last_heartbeat = 0

    def failure(self, code, request_id=None):
        with self.lock:
            self.status = "error"
            self.last_error = {"code": code, "at": int(now_ms()), "requestId": request_id}
        LOG.error("%s request=%s", code, request_id)

    def participant(self, participant, generation):
        info = participant.get("info", {})
        if info.get("isLocal") or info.get("userId") == BOT_ID:
            return
        pid = participant["id"]
        with self.lock:
            if generation != self.generation:
                return
            self.people[pid] = participant
            if participant.get("media", {}).get("camera", {}).get("state") not in ("playable", "receivable"):
                self.frames.pop(pid, None)
            if pid in self.renderers:
                return
            self.renderers.add(pid)
            client = self.client
        try:
            client.set_video_renderer(pid, lambda p, f, source: self.frame(p, f, source, generation),
                                      video_source="camera", color_format="RGB")
        except Exception:
            with self.lock:
                self.renderers.discard(pid)
            self.failure("renderer_failed")

    def frame(self, pid, frame, source, generation):
        if source != "camera":
            return
        try:
            image = Image.frombytes("RGB", (frame.width, frame.height), bytes(frame.buffer))
            image.thumbnail((640, 480))
            with self.lock:
                person = self.people.get(pid, {})
                state = person.get("media", {}).get("camera", {}).get("state")
                if generation == self.generation and state in ("playable", "receivable"):
                    self.frames[pid] = (now_ms(), image)
        except Exception:
            self.failure("frame_decode_failed")

    def switch_room(self, room):
        with self.lock:
            self.generation += 1
            generation = self.generation
            old, self.client = self.client, None
            self.ready = False
            self.room = room
            self.people.clear()
            self.frames.clear()
            self.renderers.clear()
            for rid, timer in self.pending.items():
                timer.cancel()
                self.failure("room_changed", rid)
            self.pending.clear()
        if old:
            old.leave()
            old.release()
        if not room:
            self.status = "waiting_for_room"
            return
        self.join_started = now_ms()
        self.status = "joining"
        client = CallClient(event_handler=RoomEvents(self, generation))
        with self.lock:
            self.client = client
        if os.getenv("DAILY_PROXY_URL"):
            client.set_proxy_url(os.environ["DAILY_PROXY_URL"])
        client.set_user_name("Family Photobooth")
        client.update_subscription_profiles({"base": {"camera": "subscribed", "microphone": "unsubscribed",
                                                      "screenVideo": "unsubscribed", "screenAudio": "unsubscribed"}})

        def joined(data, error):
            if generation != self.generation:
                return
            if error:
                self.failure("daily_join_failed")
                return
            with self.lock:
                self.ready = True
                self.status = "ready"
            for p in client.participants().values():
                self.participant(p, generation)
            LOG.info("Joined active Daily room; camera/mic publishing disabled")
        client.join(room["roomUrl"], meeting_token=self.token, client_settings=SAFE_SETTINGS, completion=joined)

    def schedule(self, event):
        if not ((event.get("type") == "command" and event.get("command") == "photo.capture") or
                (event.get("type") == "effect" and event.get("effect") == "photo")):
            return
        rid = str(event.get("id") or "")
        if not rid:
            self.failure("invalid_capture_request")
            return
        with self.lock:
            if rid in self.seen:
                return
            self.seen[rid] = True
            if len(self.seen) > 2000:
                self.seen.popitem(last=False)
            try:
                target = float(event["at"]) + COUNTDOWN_MS
            except (KeyError, ValueError, TypeError):
                self.failure("invalid_capture_request", rid)
                return
            if not math.isfinite(target) or target > now_ms() + COUNTDOWN_MS + 1000:
                self.failure("invalid_capture_time", rid)
                return
            if now_ms() > target:
                self.failure("stale_request", rid)
                return
            if not self.ready:
                self.failure("daily_not_ready", rid)
                return
            # Bound in-flight requests to prevent an accidental capture flood.
            if len(self.pending) >= 8:
                self.failure("capture_busy", rid)
                return
            generation = self.generation
            self.last_request = rid
            self.status = "countdown"
            timer = threading.Timer(max(0, (target - now_ms()) / 1000), self.freeze,
                                    args=(rid, target, generation))
            timer.daemon = True
            self.pending[rid] = timer
            timer.start()

    def freeze(self, rid, target, generation):
        with self.lock:
            self.pending.pop(rid, None)
            if self.stop.is_set():
                return
            if generation != self.generation or not self.ready:
                self.failure("room_changed", rid)
                return
            stamp = now_ms()
            if stamp > target + LATE_MS or stamp - self.last_snapshot > 2000:
                self.failure("stale_request", rid)
                return
            tiles = []
            for pid, p in sorted(self.people.items(), key=lambda item: (item[1].get("info", {}).get("userName", ""), item[0])):
                state = p.get("media", {}).get("camera", {}).get("state")
                recent = self.frames.get(pid)
                frame = recent[1] if (recent and stamp - recent[0] <= FRAME_MAX_AGE_MS and
                                      state in ("playable", "receivable")) else None
                reason = "Camera off" if state == "off" else "Camera unavailable"
                tiles.append((p.get("info", {}).get("userName") or "Family member", frame, reason))
            self.status = "capturing"
            # Freeze references here; subsequent callbacks replace images, never mutate these.
            self.pool.submit(self.complete, rid, generation, tiles, stamp - target)

    def complete(self, rid, generation, tiles, delay):
        stage = "compose"
        try:
            jpeg = compose_grid(tiles)
            with self.lock:
                if generation != self.generation or self.stop.is_set():
                    raise RuntimeError("Room changed")
            stage = "upload"
            result = self.api.request("/api/photos", jpeg,
                                      {"Content-Type": "image/jpeg", "X-Photo-Name": "family-photo.jpg"})
            key = result.get("key", "")
            if not key.startswith("photos/") or ".." in key:
                raise RuntimeError("Invalid upload asset")
            with self.lock:
                if generation != self.generation or self.stop.is_set():
                    raise RuntimeError("Room changed")
                stage = "publish"
                self.api.request("/api/events", {"type": "system", "event": "photo.captured", "asset": key,
                                                 "sender": "Photobooth", "senderId": BOT_ID})
                self.last_capture = {"requestId": rid, "asset": key, "at": int(now_ms()),
                                     "participants": len(tiles), "frameCount": sum(t[1] is not None for t in tiles),
                                     "deadlineDelayMs": round(delay)}
                self.status = "ready"
            LOG.info("Captured request=%s participants=%s frames=%s asset=%s", rid, len(tiles),
                     self.last_capture["frameCount"], key)
        except Exception as exc:
            # Do not log URLs/tokens from SDK or HTTP exceptions.
            self.failure(stage + "_failed_" + type(exc).__name__, rid)
        self.heartbeat()

    def heartbeat(self):
        with self.lock:
            body = {"type": "telemetry", "clientId": BOT_ID, "role": "photobooth", "visible": True,
                    "lastEventSeq": self.cursor or 0, "status": self.status,
                    "lastError": self.last_error, "lastCapture": self.last_capture,
                    "lastRequestId": self.last_request}
        try:
            self.api.request("/api/events", body)
        except Exception:
            LOG.warning("Telemetry delivery failed; retained locally for next heartbeat")
        self.last_heartbeat = now_ms()

    def poll(self):
        snapshot = self.api.request("/api/events?since=" + str(self.cursor or 0))
        self.last_snapshot = now_ms()
        room = snapshot.get("videoRoom")
        if room:
            url = urlparse(room.get("roomUrl", ""))
            if url.scheme != "https" or not url.hostname or not url.hostname.endswith(".daily.co"):
                room = None
            elif room.get("endDate") and datetime.fromisoformat(room["endDate"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                room = None
        if room != self.room or (room and not self.ready and now_ms() - self.join_started > 45000):
            self.switch_room(room)
        if self.cursor is None:
            self.cursor = int(snapshot.get("seq", 0))  # No startup replay.
        else:
            for event in sorted(snapshot.get("events", []), key=lambda e: e.get("seq", 0)):
                if int(event.get("seq", 0)) > self.cursor:
                    self.schedule(event)
                    self.cursor = int(event["seq"])
            self.cursor = max(self.cursor, int(snapshot.get("seq", 0)))
        if now_ms() - self.last_heartbeat > 5000:
            self.heartbeat()

    def run(self):
        try:
            while not self.stop.is_set():
                try:
                    self.poll()
                except Exception as exc:
                    self.failure("poll_failed_" + type(exc).__name__)
                    self.heartbeat()
                self.stop.wait(0.25)
        finally:
            with self.lock:
                for timer in self.pending.values():
                    timer.cancel()
                self.pending.clear()
            self.pool.shutdown(wait=True, cancel_futures=True)
            self.switch_room(None)
            self.status = "stopped"
            self.heartbeat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.getenv("BABYSHOWER_URL"), help="Event site URL")
    args = parser.parse_args()
    if not args.url or urlparse(args.url).scheme not in ("http", "https"):
        parser.error("Set BABYSHOWER_URL or --url")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    # Single consumer per site on this server. Run exactly one replica globally.
    digest = hashlib.sha256(args.url.rstrip("/").encode()).hexdigest()[:16]
    lock_path = Path(os.getenv("PHOTO_LOCK_DIR", "/tmp")) / ("daily-photobooth-" + digest + ".lock")
    with lock_path.open("w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error("A photobooth worker is already running for this site")
        Daily.init()
        worker = Photobooth(SiteAPI(args.url), os.getenv("DAILY_MEETING_TOKEN"))
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: worker.stop.set())
        worker.run()


if __name__ == "__main__":
    main()
