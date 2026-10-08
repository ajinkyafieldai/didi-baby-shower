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


## Event package runtime proof

The web runtime can load an event package by event ID without changing application code.

The default event remains:

```text
didi-baby-shower
```

For the current static proof, event packages live under `public/events/<event-id>/` and may be selected with the `event` query parameter:

```text
/?event=didi-baby-shower
/?event=maya-baby-shower
/host.html?event=maya-baby-shower
/projector.html?event=maya-baby-shower
```

Participant, host, and projector surfaces all load the same package. Event identity, copy, accent, and supported module overrides come from that package. Browser-local event data is namespaced by event ID so one event cannot reuse another event's local family-wall state.

The static directory is deliberately a proof adapter, not the final event registry. A future database/API resolver can replace the package source while preserving the runtime contract.
