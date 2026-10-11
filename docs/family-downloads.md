# Family downloads and call experience

The family hub offers **Export keepsake PDF** and **Export keepsake HTML**. Both
contain notes, reactions, photos, timeline memories, map locations and recipes.
HTML embeds photos and the Natural Earth map; no scripts, remote assets or fonts
are required to open it offline. Both formats contain only sealed capsule metadata.
Missing photos or stale shared content are reported in export notes.

## Time capsules

Capsule submissions now POST `family_add`, collection `capsules`, with a stable
entry ID. Success/reset happens only after the POST succeeds. Durable storage keeps
message bodies in `sealedCapsules`; `/api/events.family.capsules` contains metadata
only, under the same monotonic family revision. Duplicate submissions are no-ops.
Limit: 200 capsules, 500 characters per message, opening ages 1/5/10/18/21.

Existing browser-local messages cannot be recovered remotely. Each device that
sealed a message before this update must open Capsule and use **Back up messages
from this device**. This preserves IDs and can be retried after partial failure.
Local entries remain available and are labelled until their backup succeeds.

Private download: open `/host.html`, enter the family download key and click
**Download time capsules (JSON)**. It downloads all server-backed message bodies
and opening ages. The key is cleared after the request and is never persisted in
browser storage or URLs. The public host page itself grants no download access.
`GET /api/capsule-export` requires `Authorization: Bearer <FAMILY_ADMIN_KEY>`.
The realtime `/capsules/export` route additionally requires the internal realtime
secret AND `x-family-admin-key`. Missing configuration returns 503; wrong keys 401.

Configure the SAME strong random `FAMILY_ADMIN_KEY` as a secret in both:

1. Cloudflare Pages `didi-baby-shower` production environment.
2. Cloudflare Worker `billowing-shadow-fa0a`.

Redeploy Pages after changing its secret; the Worker needs its new secret too.
Do not use a `VITE_` variable, commit the key, or put it in a shared link.
The downloaded JSON is the family's archive, not a public keepsake.

## Hidden photobooth

Daily-native invisibility requires a room-scoped meeting token with
`permissions.hasPresence:false`, `canSend:false`, `canAdmin:false`, and camera
receive permission. `POST /api/photobooth-token`, protected by the family key,
issues this token using the existing Pages `DAILY_API_KEY`. It only issues tokens
for the currently stored, unexpired Daily room. Tokens expire with the room.

Update the Python process and give it `FAMILY_ADMIN_KEY` in its server environment;
it fetches a new hidden token on each room change/rejoin. A failed or wrong-room
token prevents that join and reports `hidden_token_failed`. No keys or tokens are
logged. Alternatively supply a correctly scoped hidden `DAILY_MEETING_TOKEN`.
A legacy keyless process can still capture, but has ordinary Daily presence.
The custom frontend excludes that legacy bot's reserved name/user ID from tiles,
counts and pin menus. Restart the Python process for actual Daily invisibility,
including direct Daily/Prebuilt clients. Test frame reception after hidden join.

## Notifications and screen

Accepted family revisions notify every polling device of newly shared notes,
photos, recipes, locations, arrivals, capsule seals and reactions. The initial
snapshot is quiet; repeated/older revisions are quiet. Batched changes are grouped.
No sealed message body appears in a toast. Toasts appear for 5.5 seconds in a fixed
page overlay, and in the call iframe when it enters fullscreen.

Screen Wake Lock is requested while the call is Live, re-requested when the page
becomes visible or is tapped, and released on disconnection/page exit. A small
status reports unsupported browsers or denied/released locks. Browser/OS policy
may refuse a wake lock; it is not a guarantee during backgrounding or low battery.

## Checks

`node scripts/test-family-experience.mjs` exercises independent clients against
the real Durable Object: sealed persistence, metadata privacy, private download
access checks, hidden token scope/permissions, revision toast deduplication,
wake-lock lifecycle and standalone HTML escaping/assets. The Python tests check
token handoff and rejection of a token for another room.

Physical follow-up: share a note/recipe/pin from PC, confirm phone toast, refresh
both; seal a capsule and privately download its body; capture two real cameras
with the hidden Python worker; confirm no photobooth tile/count; leave the phone
idle during the call and switch away/back. Automated tests do not prove device
wake-lock permission or Daily media reception with a hidden participant.
