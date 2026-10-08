# didi-baby-shower

A phone-first remote baby-shower experience and Apsila prototype.

The video transport is embedded Daily. Ceremony effects, games, photo workflow, realtime state, and transcript-driven triggers are owned by this application.

## Architecture

- Cloudflare Pages frontend
- provider-neutral video shell at `/daily.html`
- Daily Embedded for live audio/video
- Cloudflare Pages Functions for frontend-facing APIs
- Cloudflare Worker + Durable Object for shared realtime event state
- native photobooth client for family-photo capture
- optional local GPU transcript pipeline for keyword-driven ceremony triggers

Video transport is intentionally separate from Apsila interaction logic.

## Daily

Room creation is deliberate and does not require a Pages redeploy.

```sh
node babyshower.js room create --hours 8 --dry-run
node babyshower.js room create --hours 8
```

The CLI calls `/api/video-provision`. The Pages Function uses the server-side `DAILY_API_KEY`, creates or reuses a Daily meeting, and stores the current room in the existing realtime Durable Object.

Guests call `/api/video-config`, which reads that stored room from realtime state and returns only the guest room URL and metadata needed by the browser. The Daily API key is never exposed to the client.

A new room therefore changes runtime event state rather than deployment configuration.

## Realtime event layer

Shared ceremony effects, games, telemetry, photo state, and commands are handled by the realtime Worker.

The Worker uses the `CelebrationRoom` Durable Object configured in `realtime/wrangler.jsonc`.

Supported command triggers currently include:

- `photo.capture`
- `photo.show`
- `flowers`
- `celebrate`
- `haldi`
- `kunku`
- `oti`

## Local transcript trigger pipeline

The transcript transport is separate from trigger semantics:

```text
meeting/system audio
  -> ffmpeg
  -> faster-whisper
  -> tolerant keyword matcher
  -> babyshower trigger
```

Install once on Ubuntu/PipeWire:

```sh
sudo apt install ffmpeg python3-venv pulseaudio-utils
python3 -m venv .venv-whisper
.venv-whisper/bin/pip install -r requirements-transcript.txt
```

List audio sources:

```sh
npm run transcript:sources
```

Set `BABYSHOWER_AUDIO_SOURCE` in `.env` to the desired PipeWire/Pulse source, typically an output `.monitor` source for meeting audio.

Run directly:

```sh
npm run transcript:local
```

Or run it in tmux:

```sh
npm run transcript:tmux
npm run transcript:tmux -- status
npm run transcript:tmux -- attach
npm run transcript:tmux -- stop
```

The keyword matcher is intentionally tolerant of noisy ASR output and supports Latin and Devanagari ceremony aliases. Duplicate suppression and per-trigger cooldowns remain in place.

## Photo workflow

The native photobooth captures the visible meeting surface and uploads the image to the event backend.

```sh
node photobooth.js run
```

The shared flow is:

```text
photo.capture
  -> native photobooth
  -> upload
  -> photo.captured(asset)
  -> photo.show(asset)
  -> guest/projector display
```

## Development

Development happens on `devel`.

Do not commit directly to `main`.


## Video and chat transport boundaries

Video and chat are separate Apsila capabilities even when the current provider supplies both.

```text
/api/video-config -> video transport
/api/chat-config  -> chat transport
```

Today both capabilities use the same Daily room, but they are stored independently in realtime state as `videoRoom` and `chatRoom`. Daily chat is enabled when the room is provisioned.

Frontend code should consume the capability-specific endpoint rather than assuming that chat and video always share a provider or room. This keeps a future chat-provider change independent from video transport.
