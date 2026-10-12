> **RETIRED EVENT (12 October 2026):** Didi's live ceremony infrastructure is no longer an authorized service. Only the existing keepsake page is intended to remain online. Do not redeploy the old frontend, Pages Functions, Daily room, realtime Worker or photo capture. The live keepsake was updated outside this repository; this source tree is **not** an authoritative copy of the keepsake and must not be used to redeploy the Pages site. See [retirement runbook](docs/retirement-2026-10-12.md).

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
# Deliberately switch future joins to a new cloud-recording-capable room:
node babyshower.js room create --hours 8 --recording cloud --force
```

The CLI calls `/api/video-provision`. The Pages Function uses the server-side `DAILY_API_KEY`, creates or reuses a Daily meeting, and stores the current room in the existing realtime Durable Object.

Cloud recording capability does not start recording automatically. Start recording separately through Daily after participants join. `--force` stores the new room for future joins; existing participants remain in the previous room until they leave/rejoin.

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

The server photobooth receives participant camera frames from the active Daily room,
composes a named family grid at the three-second countdown deadline, and uploads a JPEG.
Its camera and microphone publishing stay disabled.

```sh
python3 -m pip install -r requirements-photobooth.txt
BABYSHOWER_URL=https://didi-baby-shower.pages.dev python3 server/daily_photobooth.py
```

The shared flow is `photo.capture` → Daily camera grid → upload →
`photo.captured(asset)` → `latestPhoto` → guest/projector display.
See [server setup, telemetry and verification](docs/daily-photobooth-server.md).

## Development

Development happens on `devel`.

Do not commit directly to `main`.


## Event package runtime proof

The web runtime can load an event package by event ID without changing application code.

The default event remains:

```text
didi-baby-shower
```

Event selection now resolves through `public/events/registry.json`. The browser selects an event slug; the registry maps that slug to an event package and pins its expected template ID/version.

```text
/?event=didi
/?event=maya
/host.html?event=maya
/projector.html?event=maya
```

Legacy event IDs such as `?event=didi-baby-shower` remain accepted as compatibility aliases.

Participant, host, and projector surfaces all load the same package. Event identity, copy, accent, and supported module overrides come from that package. Browser-local event data is namespaced by event ID so one event cannot reuse another event's local family-wall state.

The JSON registry is deliberately the first registry adapter. A future database/API-backed registry can replace it while preserving the same slug -> record -> package contract.

## Recording from the CLI

Set `BABYSHOWER_URL=https://didi-baby-shower.pages.dev` and provide `DAILY_API_KEY` through your terminal environment. The CLI never sends the Daily key to Pages or prints it.

```sh
node babyshower.js recording
```

This resolves the current room, starts cloud recording, prints `RECORDING` only after the provider confirms `in-progress`, and stays running. Ctrl+C or SIGTERM requests stop for the same room it started, even if the current event room later changes. A signal received while start is pending waits for the response and then requests stop. Stop failures exit nonzero and print the manual recovery command.

While recording in an interactive terminal, press any key (for example Space) to
print the current `HH:MM:SS` recording time. Type your message and press Enter to
save it. The timestamp belongs to the keypress, so time spent typing does not move
the bookmark. Esc cancels a note; Ctrl+C saves a partially typed message and stops.
Notes are saved locally to `didi-recording-<recording-id>-notes.jsonl`, with the
recording ID, seconds, timestamp and message. Use `--notes <file>` to choose another
path; existing files are never overwritten. Notes use Daily's `start_ts`; if it is
missing, times are explicitly labelled estimated from first active confirmation.
A noninteractive terminal or a notes-file error does not stop the recording.

```sh
node babyshower.js recording start
node babyshower.js recording stop
node babyshower.js recording status --id <recording-id>
node babyshower.js recording stop --room <room-name>
```

`start` returns immediately after provider acceptance; `stop` without a room resolves the event's current room. Use the printed recording ID to verify finalization. `run`/the default keeps checking status and exits when recording finishes or is canceled. SIGKILL, machine shutdown or loss of network cannot guarantee cleanup; recover with `stop --room` from another terminal. An ambiguous start timeout may also require manual stop. Do not start multiple recording controllers for the same room: Daily's stop operation is room-wide. This command records Daily media, not Didi's page animations.

## Reset map pins

`node babyshower.js reset pins` previews shared manual pins. Add `--confirm` to
back them up and clear them with the operator admin token. See
[setup and reset scope](docs/map-pin-reset.md).
