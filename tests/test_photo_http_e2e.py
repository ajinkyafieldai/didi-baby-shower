"""Real HTTP contract and countdown with synthetic frame callbacks (not Daily live)."""
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
from types import SimpleNamespace
import unittest
from PIL import Image
from server.daily_photobooth import Photobooth, SiteAPI, now_ms


class HTTPFlowTest(unittest.TestCase):
    def test_two_participant_countdown_upload_publication_and_latest(self):
        state = {'seq': 0, 'events': [], 'latestPhoto': None, 'jpeg': None}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def reply(self, value):
                body = json.dumps(value).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def do_GET(self): self.reply({k: v for k, v in state.items() if k != "jpeg"})
            def do_POST(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                if self.path == '/api/photos':
                    self.assert_jpeg = self.headers['Content-Type']
                    state['jpeg'] = body
                    self.reply({'ok': True, 'key': 'photos/family.jpg'})
                    return
                value = json.loads(body)
                if value.get('type') == 'telemetry':
                    self.reply({'ok': True})
                    return
                state['seq'] += 1
                event = {**value, 'seq': state['seq'], 'id': str(state['seq']), 'at': now_ms()}
                state['events'].append(event)
                if value.get('event') == 'photo.captured':
                    state['latestPhoto'] = {'asset': value['asset'], 'at': event['at'], 'seq': event['seq']}
                self.reply({'event': event, 'seq': state['seq']})
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        api = SiteAPI(f'http://127.0.0.1:{server.server_port}')
        w = Photobooth(api)
        w.client = SimpleNamespace(set_video_renderer=lambda *a, **kw: None)
        w.ready = True
        try:
            w.poll()
            for pid, name, status in [('a', 'Alice', 'playable'), ('b', 'Bob', 'off')]:
                w.participant({'id': pid, 'info': {'userName': name}, 'media': {'camera': {'state': status}}}, 0)
            command = api.request('/api/events', {'type': 'command', 'command': 'photo.capture'})['event']
            frame = Image.new('RGB', (320, 240), '#c44')
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and w.last_capture is None:
                w.frame('a', SimpleNamespace(width=320, height=240, buffer=frame.tobytes()), 'camera', 0)
                w.poll()
                time.sleep(.05)
            self.assertIsNotNone(w.last_capture)
            self.assertEqual(w.last_capture['participants'], 2)
            self.assertEqual(w.last_capture['frameCount'], 1)
            self.assertLess(w.last_capture['deadlineDelayMs'], 750)
            # Only upload after event.at + 3 seconds, and only one publication.
            event = state['events'][-1]
            self.assertGreaterEqual(event['at'], command['at'] + 3000)
            latest = api.request('/api/events')['latestPhoto']
            self.assertEqual(latest['asset'], 'photos/family.jpg')
            self.assertEqual(Image.open(io.BytesIO(state['jpeg'])).format, 'JPEG')
            w.schedule(command)
            self.assertFalse(w.pending)
            self.assertEqual(len([e for e in state['events'] if e.get('event') == 'photo.captured']), 1)
        finally:
            w.stop.set()
            for timer in w.pending.values(): timer.cancel()
            w.pool.shutdown(wait=True)
            server.shutdown()
            server.server_close()
