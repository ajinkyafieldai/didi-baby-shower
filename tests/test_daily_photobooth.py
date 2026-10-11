import io
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from PIL import Image
from server.daily_photobooth import Photobooth, SAFE_SETTINGS, compose_grid, now_ms, SiteAPI


class API:
    def __init__(self):
        self.calls = []
        self.snapshot = {"seq": 20, "events": []}
        self.fail = False

    def request(self, path, data=None, headers=None):
        self.calls.append((path, data, headers))
        if path.startswith('/api/events?'):
            return self.snapshot
        if path == '/api/photos':
            if self.fail:
                raise OSError('upload unavailable')
            return {"ok": True, "key": "photos/test.jpg"}
        return {"ok": True}


def person(pid, name, state='playable', local=False):
    return {"id": pid, "info": {"userName": name, "isLocal": local},
            "media": {"camera": {"state": state}}}


class CaptureTests(unittest.TestCase):
    def test_http_error_reports_reason_without_admin_token(self):
        import io
        from urllib.error import HTTPError
        error = HTTPError('https://site.test/api/photobooth-token', 502, 'Bad Gateway', {},
                          io.BytesIO(b'{"error":"Daily token request failed (HTTP 400): invalid setting test-secret"}'))
        with patch.dict('os.environ', {'BABYSHOWER_ADMIN_TOKEN': 'test-secret'}), \
                patch('server.daily_photobooth.urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'HTTP 502: Daily token request failed.*HTTP 400') as raised:
                SiteAPI('https://site.test').request('/api/photobooth-token', {}, {'Authorization': 'Bearer test-secret'})
            self.assertNotIn('test-secret', str(raised.exception))

    def test_fetches_room_scoped_hidden_token(self):
        w = self.worker
        w.client = None
        room = {'roomUrl': 'https://test.daily.co/one'}
        with patch.dict('os.environ', {'BABYSHOWER_ADMIN_TOKEN': 'test-key'}), \
                patch.object(self.api, 'request', return_value={'token': 'hidden-token', 'roomUrl': room['roomUrl']}) as request, \
                patch('server.daily_photobooth.CallClient') as clients:
            w.switch_room(room)
            request.assert_called_once_with('/api/photobooth-token', {}, {'Authorization': 'Bearer test-key'})
            self.assertEqual(clients.return_value.join.call_args.kwargs['meeting_token'], 'hidden-token')
            request.return_value = {'token': 'wrong-room', 'roomUrl': 'https://test.daily.co/two'}
            w.switch_room(room)
            self.assertEqual(w.last_error['code'], 'hidden_token_failed')
            self.assertEqual(clients.return_value.join.call_count, 1)

    def setUp(self):
        self.api = API()
        self.worker = Photobooth(self.api)
        self.worker.client = SimpleNamespace(set_video_renderer=lambda *a, **kw: None)
        self.worker.ready = True
        self.worker.last_snapshot = now_ms()
        self.addCleanup(self.cleanup)

    def cleanup(self):
        for t in self.worker.pending.values():
            t.cancel()
        self.worker.pool.shutdown(wait=True)

    def test_two_participants_and_bot_exclusion(self):
        w = self.worker
        w.participant(person('a', 'Alice'), 0)
        w.participant(person('b', 'Bob', 'off'), 0)
        w.participant(person('self', 'Family Photobooth', local=True), 0)
        img = Image.new('RGB', (64, 48), 'red')
        w.frame('a', SimpleNamespace(width=64, height=48, buffer=img.tobytes()), 'camera', 0)
        w.freeze('req', now_ms(), 0)
        w.pool.shutdown(wait=True)
        upload = next(c for c in self.api.calls if c[0] == '/api/photos')
        jpeg = Image.open(io.BytesIO(upload[1]))
        self.assertEqual(jpeg.format, 'JPEG')
        self.assertEqual(w.last_capture['participants'], 2)
        self.assertEqual(w.last_capture['frameCount'], 1)
        self.assertEqual(upload[2]['Content-Type'], 'image/jpeg')
        published = [c for c in self.api.calls if isinstance(c[1], dict) and c[1].get('event') == 'photo.captured']
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0][1]['asset'], 'photos/test.jpg')

    def test_dedup_countdown_and_stale(self):
        event = {"type": "command", "command": "photo.capture", "id": "one", "at": now_ms()}
        with patch('server.daily_photobooth.threading.Timer') as timer:
            self.worker.schedule(event)
            self.worker.schedule(event)
            self.assertEqual(timer.call_count, 1)
            self.assertAlmostEqual(timer.call_args[0][0], 3, delta=.1)
            self.worker.schedule({**event, 'id': 'old', 'at': now_ms() - 4000})
            self.assertEqual(timer.call_count, 1)
            self.assertEqual(self.worker.last_error['code'], 'stale_request')

    def test_startup_cursor_and_legacy(self):
        w = self.worker
        self.api.snapshot['events'] = [{"seq": 20, "id": 'old', "type": 'effect', "effect": 'photo', "at": now_ms()}]
        w.poll()
        self.assertEqual(w.cursor, 20)
        self.assertFalse(w.pending)
        with patch('server.daily_photobooth.threading.Timer') as timer:
            self.api.snapshot = {'seq': 21, 'events': [{**self.api.snapshot['events'][0], 'seq': 21, 'id': 'new'}]}
            w.poll()
            self.assertEqual(timer.call_count, 1)

    def test_upload_failure_never_publishes(self):
        self.api.fail = True
        self.worker.complete('r', 0, [('Alice', Image.new('RGB', (10, 10)), '')], 0)
        self.assertIsNotNone(self.worker.last_error)
        self.assertFalse(any(isinstance(c[1], dict) and c[1].get('event') == 'photo.captured' for c in self.api.calls))
        self.assertTrue(any(isinstance(c[1], dict) and c[1].get('lastError') for c in self.api.calls))

    def test_stale_frames_and_camera_off(self):
        w = self.worker
        w.participant(person('a', 'Alice'), 0)
        w.frames['a'] = (now_ms() - 3000, Image.new('RGB', (10, 10)))
        with patch('server.daily_photobooth.compose_grid', wraps=compose_grid) as compose:
            w.freeze('r', now_ms(), 0)
            w.pool.shutdown(wait=True)
            self.assertIsNone(compose.call_args[0][0][0][1])
        w.frames['a'] = (now_ms(), Image.new('RGB', (10, 10)))
        w.participant(person('a', 'Alice', 'off'), 0)
        self.assertNotIn('a', w.frames)

    def test_room_change_and_late_deadline(self):
        w = self.worker
        w.freeze('old-generation', now_ms(), 1)
        self.assertEqual(w.last_error['code'], 'room_changed')
        w.freeze('late', now_ms() - 1000, 0)
        self.assertEqual(w.last_error['code'], 'stale_request')
        w.client = None
        w.switch_room(None)
        self.assertFalse(w.ready)
        self.assertFalse(w.people)

    def test_reset_cancels_pending_capture_without_leaving_room(self):
        w = self.worker
        timer = SimpleNamespace(cancel=lambda: cancelled.append(True))
        cancelled = []
        w.pending['old'] = timer
        w.capture_resets['old'] = None
        self.api.snapshot['family'] = {'reset': {'id': 'reset1'}}
        w.last_capture = {'asset': 'photos/old.jpg'}
        w.poll()
        self.assertEqual(cancelled, [True])
        self.assertEqual(w.pending, {})
        self.assertIsNone(w.last_capture)
        self.assertEqual(w.reset_id, 'reset1')
        before = len([c for c in self.api.calls if c[0] == '/api/photos'])
        w.complete('old', w.generation, [], 0)
        self.assertEqual(len([c for c in self.api.calls if c[0] == '/api/photos']), before)

    def test_follows_snapshot_room_and_expiry(self):
        from datetime import datetime, timezone, timedelta
        w = self.worker
        w.client = None
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        room = {'roomUrl': 'https://test.daily.co/one', 'endDate': future}
        self.api.snapshot['videoRoom'] = room
        with patch('server.daily_photobooth.CallClient') as clients:
            client = clients.return_value
            client.participants.return_value = {}
            def joined(*args, **kw): kw['completion']({}, None)
            client.join.side_effect = joined
            w.poll()
            self.assertEqual(w.room, room)
            self.assertEqual(client.join.call_args.kwargs['client_settings'], SAFE_SETTINGS)
            w.people['old'] = person('old', 'Old room')
            w.frames['old'] = (now_ms(), Image.new('RGB', (10, 10)))
            self.api.snapshot['videoRoom'] = {**room, 'roomUrl': 'https://test.daily.co/two'}
            w.poll()
            self.assertEqual(client.leave.call_count, 1)
            self.assertFalse(w.frames)
            self.assertFalse(w.people)
            self.api.snapshot['videoRoom'] = {**room, 'endDate': '2000-01-01T00:00:00Z'}
            w.poll()
            self.assertIsNone(w.room)
            self.assertFalse(w.ready)
            self.assertEqual(client.release.call_count, 2)

    def test_no_participants_fails_and_safe_publishing(self):
        self.worker.complete('r', 0, [], 0)
        self.assertIsNone(self.worker.last_capture)
        for value in SAFE_SETTINGS['publishing'].values():
            self.assertFalse(value['isPublishing'])
        for value in SAFE_SETTINGS['inputs'].values():
            self.assertFalse(value['isEnabled'])


if __name__ == '__main__':
    unittest.main()
