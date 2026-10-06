# Event runtime, photobooth, transcript triggers, and replay

This document captures the event-runtime design for the Didi baby shower and the reusable boundaries that may later support a more general live-event interaction product.

## Product framing

The immediate goal is a family baby-shower experience layered around Zoom.

The reusable product idea is broader: **keep Zoom as the familiar call layer, and add a produced interactive-event layer around it**.

That reusable layer can provide:

- synchronized reactions and ceremony effects
- games and polls
- transcript-driven easter eggs
- shared photo moments
- operator controls and manual overrides
- event logging
- post-production replay of UI effects over the Zoom recording

The current repository remains event-specific. Reusability should come from clean runtime boundaries, not premature extraction into a framework.

## Runtime roles

The same `babyshower` program may support multiple explicit roles.

Examples:

```sh
babyshower serve
babyshower photobooth
babyshower trigger photo show
babyshower trigger games show
babyshower trigger haldi-kunku wobble
babyshower trigger oti wobble
```

Roles should be selected explicitly by arguments rather than inferred from the environment.

## Guest UI gating

The landing page should contain only the join/admission flow.

Interactive event controls should appear only after the guest has been accepted into the call/event.

This prevents unauthenticated visitors from triggering effects and keeps the landing experience distinct from the event UI.

## Photobooth client

A dedicated Ubuntu laptop will act as the primary photo client.

The laptop runs the native Zoom desktop client in Gallery View. For the expected event size, the goal is to fit all participants on a single gallery page.

The same machine runs:

```sh
babyshower photobooth
```

The photobooth process:

1. registers with the event backend
2. waits for capture requests
3. invokes a deterministic screenshot backend
4. uploads the resulting image
5. reports success/failure

Initial capture may use Flameshot in non-interactive full-screen mode while Zoom is dedicated/full-screen:

```sh
flameshot full -p /tmp/family-photo.png
```

A future backend may capture only the Zoom window.

If the automated capture path fails, the operator can take a screenshot manually and upload/use it. This event does not require an SRE-grade failover system.

## Photo lifecycle

Capturing and showing a photo are separate actions.

Suggested commands:

```sh
babyshower photo capture
babyshower photo show
babyshower photo hide
```

`photo capture` asks the photobooth client to create and upload a new image.

`photo show` reveals the latest successfully uploaded image. It does not trigger a new capture.

### Shared reveal

When a new photo is intentionally shown to everyone:

1. the backend broadcasts a photo event
2. each client preloads the image
3. the UI darkens
4. the photo is shown prominently for about five seconds
5. all underlying interaction is blocked while the modal is active
6. the overlay disappears or transitions to its post-reveal state

The overlay must consume pointer input and suppress relevant keyboard shortcuts so ceremony controls cannot be triggered accidentally.

### Discoverable photo easter egg

The latest photo is hidden by default.

The first time the transcript phrase matcher detects the word or phrase mapped to `photo`:

1. the photo appears in the center for a few seconds
2. it then shrinks into a corner
3. it remains there for the rest of that client session
4. subsequent `photo` transcript matches do nothing for that client

This should be modeled as per-client discovery state.

The operator can trigger the same behavior manually through the CLI/REST path.

## Transcript / RTMS input

Zoom RTMS can provide a live transcription feed.

The transcript path should remain deliberately dumb and Unix-like:

```sh
rtms-transcript \
  | tee -a transcript.log /dev/stderr \
  | phrase-map \
  | xargs -r -n1 babyshower trigger
```

`tee` keeps the live chatter visible to the operator and optionally logs it.

`phrase-map` must emit only fixed, whitelisted command tokens. Arbitrary transcript text must never be passed through as executable shell input.

Example mappings:

```text
photo          -> photo show
games          -> games show
haldi kunku    -> haldi-kunku wobble
oti            -> oti wobble
```

The transcript layer reports **what happened**. The `babyshower` runtime decides **where/how it should happen**.

## Dispatcher and load balancing

`babyshower` is the stateful dispatcher.

It can decide whether an event is:

- broadcast to all clients
- sent only to clients that have not discovered something
- distributed across a subset of clients
- rate-limited
- debounced
- routed to one of multiple photobooth clients if that ever becomes necessary

This keeps RTMS/phrase matching stateless.

## Manual override and --force

All automated behavior should have an operator path.

Normal commands respect state, cooldowns, discovery, and routing:

```sh
babyshower photo show
```

The operator override bypasses those guards:

```sh
babyshower photo show --force
babyshower games show --force
babyshower haldi-kunku wobble --force
babyshower oti wobble --force
```

`--force` should be the consistent emergency/admin escape hatch rather than creating separate debug commands.

## REST control plane

The CLI may be a thin wrapper around an internal REST control plane.

Possible endpoints:

```text
POST /api/photo/capture
POST /api/photo/show
POST /api/photo/hide
POST /api/games/show
POST /api/haldi-kunku/wobble
POST /api/oti/wobble
```

A force override may be represented as a query parameter or request body field, for example:

```json
{"force": true}
```

These control endpoints should be restricted to the operator/control plane. Guest browsers receive resulting realtime events but should not gain direct admin-trigger capability.

## Realtime event model

The event backend should expose one canonical event vocabulary shared by:

- browser UI
- transcript-trigger path
- CLI
- REST control plane
- photobooth
- post-production replay

Example event names:

```text
photo.capture
photo.show
photo.corner
photo.hide
games.show
haldi-kunku.wobble
oti.wobble
confetti.burst
poll.show
```

The point is to avoid separate implementations for transcript, manual controls, and replay.

## Recording strategy

Zoom owns the primary meeting recording.

Using Zoom recording preserves Zoom's active-speaker switching and participant tiling instead of trying to recreate the call layout ourselves.

The dedicated laptop may also be the photobooth client; there is no need to split roles unless performance testing shows a real problem.

If Zoom Pro/cloud recording is available, use that as the clean base recording.

The custom baby-shower UI does not need to be screen-recorded live.

## Event log

`babyshower` should append a timestamped event log during the event.

JSONL is a good format:

```json
{"t_ms":734220,"ts":"2026-10-18T14:12:14.220+05:30","event":"haldi-kunku.wobble"}
{"t_ms":1083481,"ts":"2026-10-18T14:18:03.481+05:30","event":"photo.show","asset":"family-photo-3.jpg"}
{"t_ms":1088512,"ts":"2026-10-18T14:18:08.512+05:30","event":"photo.corner","asset":"family-photo-3.jpg"}
```

Use both:

- a monotonic/session-relative timestamp for deterministic replay
- wall-clock time for human debugging and correlation

The log should be append-only.

## Recording synchronization

Create an explicit synchronization marker when Zoom recording starts:

```sh
babyshower marker zoom-recording-start
```

This gives post-production an unambiguous alignment point between the Zoom recording and the baby-shower event timeline.

## Post-production replay

The Zoom MP4 is the base video.

The baby-shower event log is replayed into a transparent UI layer using the same event vocabulary and preferably the same browser animation code used live.

Proposed pipeline:

```text
Zoom MP4
+ babyshower JSONL event log
+ captured assets
        |
        v
browser replay renderer
        |
        v
transparent overlay video
        |
        v
FFmpeg composite
        |
        v
final event video
```

A replay page can run under Chromium/Playwright with a transparent background and consume recorded events according to their stored timestamps.

The resulting transparent video can be composited over the Zoom recording with FFmpeg.

Example:

```sh
ffmpeg \
  -i zoom-recording.mp4 \
  -i babyshower-overlay.webm \
  -filter_complex "[0:v][1:v]overlay=0:0:format=auto[v]" \
  -map "[v]" -map 0:a \
  -c:v libx264 -crf 18 -preset medium \
  -c:a copy \
  final.mp4
```

The live UI and replay UI should interpret the same event names identically.

## Failure philosophy

This is a family event, not an SRE exercise.

The system should degrade gracefully:

- RTMS fails -> operator runs the CLI/REST trigger
- automated screenshot fails -> operator takes a screenshot manually
- photobooth helper fails -> operator can upload/use an image manually
- replay tooling fails -> Zoom recording still exists as the archival video

Avoid unnecessary HA, failover, queues, or infrastructure unless a concrete failure mode justifies them.

## Reusable product boundary

The potentially sellable product is not "a baby-shower website."

It is a **live-event interaction layer for existing video calls**.

A generic future runtime could provide:

- event transport
- synchronized effects
- transcript-to-event mapping
- operator console/CLI
- photobooth roles
- games/polls
- event logs
- deterministic replay
- post-production overlays

Event-specific ceremony concepts such as haldi-kunku, oti, blessings, or baby-name polls should remain theme/content modules layered on top of that runtime.

For now, keep the implementation inside this repository and optimize for the actual Didi event. Extract only when reuse is proven.
