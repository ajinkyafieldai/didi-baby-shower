# Shared notes and people frontend

Notes and uploaded wall photos now POST `family_add` to `blessings`. Family pins
and manual arrivals POST to `pins` and `guests`. Reactions POST `family_react` using
the backend-supported emoji set. Snapshots are accepted by monotonically increasing
family revision, independently of ceremony sequence numbers.

Forms show success and reset only after a successful mutation. A failed save keeps
the form content and entry ID for retry. Reaction mutation IDs survive re-rendering
after failure; new successful clicks get new IDs. Shared photo asset URLs render on
the wall and Moments mosaic. Photo upload and publication are separate operations;
an uploaded asset is reused when publication is retried.

Existing local notes, photos, pins and arrivals remain visible, explicitly marked
as device-only. They are not bulk-published. Legacy note reactions are disabled
because those note IDs are not present in the shared backend. Automatic call
arrivals remain device-local; the manual arrival form publishes shared arrivals.
Timeline and capsule sync are outside this backend contract.

More for the family is expanded by default. Full PDF export is separately available
on `feature/didi-full-keepsake-pdf` and is not bundled into this sync change.

Tests: `node scripts/test-shared-family-frontend.mjs`,
`node scripts/test-family-state.mjs`, `node scripts/test-server-photo-flow.mjs`,
`node scripts/test-shared-recipes.mjs`, and `npm run build`.

The frontend test uses two independent clients against the real Durable Object
implementation, then recreates both clients and the authority to verify stored
notes, pins and reactions. It also checks stale snapshots, retry deduplication,
shared photos, failed writes, and the real note form's failure/retry behavior.
This is not a physical-device test.

After merging and deploying Pages, use PC to add a wish, Android to react and add
a pin, and confirm both appear on the other device. Refresh both and confirm they
persist. Also share a photo and confirm it appears in the other device's Moments.
The backend must be deployed; the user reports PR #16's backend is already live.
