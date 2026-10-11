#!/usr/bin/env python3
"""Live Daily smoke test: two named virtual-camera peers -> JPEG -> latestPhoto.
Publishes labelled synthetic images into the active room. Run only for a test.
"""
import argparse
import io
import os
from pathlib import Path
import sys
from urllib.request import Request, urlopen
import threading
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from daily import CallClient, Daily
from PIL import Image, ImageDraw
from server.daily_photobooth import Photobooth, SiteAPI


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=os.getenv('BABYSHOWER_URL'), required=not bool(os.getenv('BABYSHOWER_URL')))
    args = parser.parse_args()
    api = SiteAPI(args.url)
    room = api.request('/api/events?since=0')['videoRoom']['roomUrl']
    Daily.init()
    worker = Photobooth(api, os.getenv('DAILY_MEETING_TOKEN'))
    thread = threading.Thread(target=worker.run)
    peers, senders = [], []
    quit_senders = threading.Event()
    thread.start()
    try:
        for i, color in enumerate(('#c94646', '#367cb9')):
            name = f'Photo Test {i+1}'
            camera = Daily.create_camera_device(f'photo-test-{i}', width=640, height=480, color_format='RGB')
            frame = Image.new('RGB', (640, 480), color)
            ImageDraw.Draw(frame).text((50, 50), f'{name} — SYNTHETIC CAMERA', fill='white')
            client = CallClient()
            peers.append(client)
            if os.getenv('DAILY_PROXY_URL'):
                client.set_proxy_url(os.environ['DAILY_PROXY_URL'])
            client.set_user_name(name)
            client.update_subscription_profiles({'base': {'camera': 'unsubscribed', 'microphone': 'unsubscribed'}})
            joined = threading.Event()
            errors = []
            def done(data, error):
                if error: errors.append('Daily join failed')
                joined.set()
            client.join(room, meeting_token=os.getenv('DAILY_MEETING_TOKEN'),
                        client_settings={'inputs': {'camera': {'isEnabled': True, 'settings': {'deviceId': camera.name}},
                                                    'microphone': {'isEnabled': False}},
                                         'publishing': {'microphone': {'isPublishing': False}}}, completion=done)
            if not joined.wait(30) or errors:
                raise RuntimeError(f'{name} could not join Daily within 30 seconds')
            def send(cam=camera, pixels=frame.tobytes()):
                while not quit_senders.is_set():
                    cam.write_frame(pixels)
                    quit_senders.wait(.1)
            sender = threading.Thread(target=send)
            sender.start()
            senders.append(sender)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            with worker.lock:
                if worker.ready and len(worker.frames) >= 2: break
            time.sleep(.1)
        else:
            raise RuntimeError('Capture worker did not receive both Daily camera streams')
        command = api.request('/api/events', {'type': 'command', 'command': 'photo.capture',
                                              'sender': 'Photo test', 'senderId': 'daily-photo-test'})
        rid = command.get('event', command).get('id')
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            result = worker.last_capture
            if result and result['requestId'] == rid: break
            time.sleep(.1)
        else:
            raise RuntimeError('No completed capture for the live request')
        latest = api.request('/api/events?since=0')['latestPhoto']
        assert latest['asset'] == result['asset'], 'latestPhoto does not reference the uploaded JPEG'
        assert result['frameCount'] >= 2
        assert result['participants'] == len(worker.people), 'Capture bot included in grid'
        with urlopen(Request(args.url.rstrip('/') + '/api/photos?key=' + result['asset'],
                             headers={'User-Agent': 'Didi-Photobooth/1.0'}), timeout=10) as response:
            image = Image.open(io.BytesIO(response.read()))
            assert image.format == 'JPEG'
        print('PASS live two-participant capture', result, 'JPEG size', image.size)
    finally:
        quit_senders.set()
        for sender in senders: sender.join()
        for peer in peers:
            peer.leave()
            peer.release()
        worker.stop.set()
        thread.join(30)


if __name__ == '__main__':
    main()
