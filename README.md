# didi-baby-shower

A phone-first remote baby-shower experience: Zoom stays embedded in the page while guests trigger shared ceremony animations over the live call.

## Architecture

- Static Cloudflare Pages frontend
- Zoom Meeting SDK Web **Client View**, isolated inside a same-origin iframe
- Cloudflare Pages Function generates participant-only Meeting SDK JWTs
- Ceremony animation layer stays outside Zoom so it can overlay the call cleanly
- Shared realtime event channel is the next layer; the UI already exposes `window.babyShower.playEffect(effect, sender)` as the receiving boundary

## Cloudflare Pages configuration

Set these under **Workers & Pages -> didi-baby-shower -> Settings -> Variables and Secrets**.

Secrets:

- `ZOOM_CLIENT_SECRET`

Variables (or secrets if preferred):

- `ZOOM_CLIENT_ID`
- `ZOOM_MEETING_NUMBER`
- `ZOOM_MEETING_PASSCODE`

Do not commit Zoom credentials.

The signature endpoint is intentionally locked to one server-configured meeting and always generates `role: 0` participant tokens.

## Current flow

1. Guest opens the Pages URL on a phone.
2. Guest enters a display name and taps **Join celebration**.
3. The same-origin `zoom.html` iframe obtains a short-lived participant JWT from `/api/zoom-signature`.
4. Zoom handles the live audio/video call.
5. Baby-shower controls remain outside the iframe.
6. Tapping **Ovalni**, **Flowers**, **Blessings**, or **Celebrate** renders the animation over the call.

The effects are currently local-only. The next implementation step is a Cloudflare-backed realtime broadcast channel so a tap by any guest triggers `playEffect()` on every connected guest.

## Branching

Development happens on `devel`. Do not commit directly to `main`.


## Transcript trigger pipeline

Transcript transport is intentionally separate from trigger semantics. Any source that emits one transcript line at a time can feed the mapper.

```sh
rtms-transcript \
  | tee -a transcript.log /dev/stderr \
  | node scripts/phrase-map.mjs \
  | xargs -r -n1 node babyshower.js trigger
```

`phrase-map.mjs` emits only fixed symbolic trigger names from a hard-coded whitelist. Transcript text is never executed as shell input.

Set `BABYSHOWER_URL` for the CLI target. The default per-trigger cooldown is 8 seconds and can be changed with `BABYSHOWER_PHRASE_COOLDOWN_MS`.


### Zoom RTMS transcript source

The Node adapter uses Zoom's official `@zoom/rtms` SDK and writes transcript text only to stdout. Transport/status information goes to stderr, so stdout stays safe to pipe into `phrase-map.mjs`.

Required environment:

```sh
export ZM_RTMS_CLIENT=...
export ZM_RTMS_SECRET=...
export ZM_RTMS_PORT=8080
export ZM_RTMS_PATH=/webhook
```

Optional:

```sh
export BABYSHOWER_TRANSCRIPT_LANGUAGE=ENGLISH
```

Run the full pipeline:

```sh
BABYSHOWER_URL=https://your-event.example \
npm run rtms:transcript \
  | tee -a transcript.log /dev/stderr \
  | npm run transcript:map --silent \
  | xargs -r -n1 node babyshower.js trigger
```

Configure the Zoom app's RTMS webhook endpoint to the public URL serving `ZM_RTMS_PATH`.
