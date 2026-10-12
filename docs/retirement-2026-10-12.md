# Didi infrastructure retirement — 12 October 2026

## Decision and preservation boundary

The 11 October 2026 event has concluded. **The final keepsake is the only approved public Didi surface.** Interactive conference, API, photo upload, game state, room creation, recording, transcript/photobooth and realtime services are retired. This is operational retirement evidence, not a new architectural RFC.

The final Pages keepsake was updated directly after the event and is **not captured as a verified source artifact in this repository**. Preserve its **actual deployed HTML, assets, video embeds and URL** before redeploying Pages or deleting any Pages project/deployment. Do not rebuild `index.html` from this repository as a substitute: it is still the old live interactive event UI.

## Shutdown sequence and evidence checklist

1. **Preserve first:** save an authoritative, tested copy of the deployed keepsake and all assets it requires. Verify its static rendering without realtime APIs. Record source deployment identifier and checksums, without embedding private guest data or credentials in public Git.
2. **Stop automatic publication:** remove the GitHub Actions Pages deployment workflow before any subsequent merge to `devel`. This protects the existing published keepsake from being overwritten by stale event source.
3. **Quiesce backend:** after preserving authoritative application data as required, deploy a deny-all Worker entry point or disable the Didi Worker route. Verify old Worker hostname and state-changing API endpoints cannot reach it. Do **not** erase Durable Object/R2 storage as a substitute for access revocation.
4. **Eliminate public Pages Functions:** only after step 1, publish a static-only keepsake deployment that excludes all `functions/`, `_worker.js`, live JavaScript, event controls, and other API handlers. Confirm every `/api/*` path is nonfunctional with no dynamic backend. **The existing Pages functions currently cannot be assumed safe simply because the Worker is blocked:** `/api/photos` accesses R2 directly, and `/api/video-provision` calls Daily directly before attempting to store room state.
5. **Retire provider access:** terminate and delete unused Daily rooms/tokens, stop recording or photobooth jobs, remove unused Didi-specific Cloudflare Worker routes/services, and revoke Didi-only credentials. Before rotating a shared Cloudflare deployment token, identify every other authorized consumer so unrelated deployments are not interrupted. Retire or narrow secrets in Pages/Workers and GitHub as appropriate; store no values in Git or logs.
6. **Verify externally:** from an unauthenticated session verify the keepsake still renders, no call can join, no uploads or mutations can occur, no photo/private export is reachable, and the old Worker no longer serves responses. Record access tests as HTTP status and endpoint only, never guest content.
7. **Preserve history:** retain Git, retrospective, incident disposition and any required backups/retention evidence. Remove unused Didi deployments and resources only after preserving non-reconstructable user records under the applicable retention policy.

## Current state and limitations

The repository transition blocks future **automatic Pages deployment**, but does **not itself** remove the Pages site's existing Functions or turn off already deployed Workers. Cloudflare account-side verification/action is required. Static keepsake capture and live platform access remain unverified until separate evidence is recorded.

## Governing requirements

- RFC-0007 (including accepted amendment): revoke retired access, preserve secrets and their recovery lifecycle; no secret disclosure.
- RFC-0008: assess actual security/process incidents separately and record findings/disposition.
- RFC-0004: release qualification and production deployment are not interchangeable.
- RFC-0003: preserve authoritative data separately from managed service lifecycle where applicable.
