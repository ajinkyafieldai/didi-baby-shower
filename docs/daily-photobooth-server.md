# Daily family photo server

This worker implements the `docs/daily-family-photo.md` frontend contract from PR #15.
It receives camera frames with Daily Python SDK renderers. It does not capture a browser,
request screen sharing, or publish a camera/microphone/screen stream.

## Run on a Linux server

Use Python 3.10+ on a Daily-supported Linux host with outbound HTTPS, WebSocket and
WebRTC/TURN connectivity. Keep the server clock synchronized (NTP).

```sh
python3 -m venv .venv-photobooth
. .venv-photobooth/bin/activate
python -m pip install -r requirements-photobooth.txt
BABYSHOWER_URL=https://didi-baby-shower.pages.dev python server/daily_photobooth.py
```

`npm run photobooth` runs the same worker after activating the environment.
For a private Daily room, set `DAILY_MEETING_TOKEN` on the server, with room access and
camera receive permission. Public rooms need no Daily API key. When rotating private
rooms, supply a token valid for the new room and restart the service.
`PHOTO_FONT` optionally names a TrueType/OpenType font supporting the family's scripts.
`DAILY_PROXY_URL` is for a Daily-compatible reverse proxy; a generic HTTP CONNECT proxy
is not compatible with Daily's proxy API.

Run exactly **one replica per event site**, using a process supervisor with automatic
restart. A file lock prevents duplicate workers on the same host; it is not a distributed
lease. Stop the previous worker before moving to another host. Stop any old screenshot
photobooth. Ctrl+C/SIGTERM stops this worker and releases the Daily client.
Do not place meeting tokens in frontend variables, repository files or command arguments.

## Behavior

- Startup reads the current `/api/events` cursor; historical requests are not replayed.
- Polls every 250 ms plus request latency; follows `videoRoom`, including expiry/removal.
  A failed join is retried after 45 seconds. Room changes clear participant/frame caches
  and cancel pending photos. Upload completion from an old room is not published.
- Deduplicates capture event IDs; supports `command:photo.capture` and legacy `effect:photo`.
- Freezes names and frames at `event.at + 3000 ms`. Requests discovered after their deadline
  are skipped. Scheduler delays over 750 ms or a room snapshot older than 2 seconds fail.
- Includes all remote participants and name labels, excludes the local capture bot and
  `userId:daily-photobooth`. Camera-off/missing/stale (>2 seconds) frames get placeholders.
  Screen-share tracks are never used. Empty rooms fail instead of creating an empty photo.
- Uploads raw JPEG to `/api/photos`, then publishes `system:photo.captured` with its returned
  asset key. `/api/events.latestPhoto` is the shared display source. No success on failure,
  no automatic retry of ambiguous uploads/publications (avoids duplicate success events).
- Sends photobooth heartbeat every 5 seconds and after completion. The realtime backend
  retains bounded `status`, `lastRequestId`, `lastError` and `lastCapture` fields and exposes
  them in `telemetry.photobooth`; errors remain visible after a later successful capture.
  Logs retain errors locally if telemetry delivery fails. Only the latest error is retained.

## Verification

Offline tests include a real local HTTP server and two synthetic participant frame
callbacks, countdown timing, upload/publication/latestPhoto, deduplication, stale frames,
camera-off placeholders, bot exclusion, room changes and failed upload behavior:

```sh
python -m unittest discover -s tests -p 'test*photo*.py'
node scripts/test-photobooth-telemetry.mjs
```

Live two-participant SDK test (stop the normal worker first):

```sh
BABYSHOWER_URL=https://didi-baby-shower.pages.dev python scripts/test-daily-family-photo.py
```

This joins the **active room** with a capture bot and two named virtual-camera participants,
publishes labelled synthetic camera images, requests a capture, downloads the JPEG and
asserts `latestPhoto`, at least two received frames and bot exclusion. It changes the shared
latest photo. It cleans up all participants. Then verify with two real PC/phone participants:
request a family photo in the frontend, check both names/cameras, repeat with one camera off,
and confirm both frontends display the same asset without browser permissions or prompts.

## Deployment status for this implementation

Feature branch: `feature/didi-server-family-photo`, target `devel`.
Local verification: nine Python tests and the realtime telemetry persistence test pass;
Daily's native SDK installs and initializes. Live Daily capture is **not verified** in the
restricted authoring workspace: direct SDK room lookup fails DNS and its HTTP proxy is
incompatible with Daily's proxy API. No live photo success was published.

No changes from this feature are deployed by preparing this branch. Merging into `devel`
triggers the existing Cloudflare realtime deploy workflow for the telemetry changes;
Pages needs the PR #15 frontend and existing `/api/photos` R2 binding. Cloudflare cannot
run this native Python process: the command above must still be started on a separate
server with Daily connectivity. Confirm the live test there before declaring capture ready.
