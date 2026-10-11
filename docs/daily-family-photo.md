# Server-side Daily family photo

The guest frontend now requests a server capture. It does not use tab capture,
`getDisplayMedia`, canvas screenshots, automatic local downloads, or `photoHost=1`.
This is frontend wiring; the Daily capture service still needs implementation and
deployment by the backend owner. The existing `photobooth.js` defaults to a desktop
screenshot and must not be used as the Daily capture service.

## Existing API contract

1. The guest photo button and host capture button POST `/api/events` with
   `{ "type": "command", "command": "photo.capture", "sender": "…", "senderId": "…" }`.
   The response's `event.id`, `event.seq`, and `event.at` identify the accepted request.
   All connected guests render the countdown against `event.at + 3000`.
2. The server capture service polls the same events API. It captures at that target
   time using Daily participant camera frames, composes a grid, and uploads the JPEG
   to `/api/photos` with `Content-Type: image/jpeg` and `X-Photo-Name: family-photo.jpg`.
   That endpoint returns `{ "ok": true, "key": "photos/…" }`.
3. Only after a successful upload, the service POSTs `/api/events` with
   `{ "type": "system", "event": "photo.captured", "asset": "photos/…", "sender": "Photobooth", "senderId": "daily-photobooth" }`.
4. The backend persists `latestPhoto: { asset, at, seq, senderId }`. Guests display
   the new asset from `/api/photos?key=…`, including after a short reconnect. Repeated
   snapshots do not display it twice. Host `photo.show` remains available for replay.

Legacy host/CLI `type: effect, effect: photo` requests also render the countdown;
the service should consume these as capture requests during migration. Deduplicate
by event ID and run a single active consumer. Start at the current event cursor;
do not replay old requests when the service starts. Reject stale requests instead
of taking a new photo after the moment has passed.

## Backend implementation required

Use Daily's Python SDK `CallClient.set_video_renderer` to receive camera frames in
a server participant. Join the currently provisioned room from `videoRoom` in the
events snapshot, with camera and microphone publishing disabled. Follow room changes
and expiry. Keep any Daily meeting tokens on the server.

Compose active participant frames into a balanced grid with names. Use placeholders
for camera-off or stale/missing frames rather than old images. Exclude the capture
participant itself. Upload and publish only a completed image; if capture or upload
fails, retain an error in photobooth telemetry and never publish a success event.
The frontend waits up to 30 seconds and then tells guests to ask the host to check
capture. It does not claim a photo was saved when a request merely succeeded.

SDK reference: https://reference-python.daily.co/api_reference.html#daily.CallClient.set_video_renderer

This requires a running server process capable of hosting the native Daily SDK;
the current Cloudflare Worker alone is not that capture process.

## Live verification pending

Run the server capture service and deploy the frontend, then request a photo with
PC, Android, and iPhone in the room. Confirm there is no screen-sharing picker,
all guests count down, the shared image comes from participant camera frames,
camera-off guests have placeholders, and the same stored image appears across
devices. Check an upload failure and a reconnect during capture. Local contract
tests do not establish that Daily frame capture is deployed or working live.
