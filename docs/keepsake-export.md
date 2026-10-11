# Full keepsake PDF export

Branch: `feature/didi-full-keepsake-pdf`, based on the pilot frontend integration
in PR #15. This changes the Family Hub export button to **Export keepsake PDF**.
It is not deployed automatically.

The PDF includes wishes and reactions, wall photos, the latest server family photo,
timeline moments and their photos, a world map with pins plus a complete people and
location list, recipes and dish photos, and time capsule title/sender/opening age.
Sealed message bodies are excluded. The Moments photo mosaic is represented by
the Family photos section; timeline entries have their own section.

The export refreshes shared family state before creating a snapshot, merges it
with this device's local entries, and prefers shared versions of matching IDs.
The photo endpoint accepts only event photo keys. All available images and the
world map are embedded in the PDF; viewing the downloaded PDF requires no live
site, IndexedDB, map tiles, or network connection.

Offline or failed shared-state refreshes retain the last known shared snapshot.
Missing photos are identified beside their entry and in Export notes. Entries
saved only on another device and not published to shared state cannot be included.
The backend currently retains only the latest Daily capture in `latestPhoto`, so
this export cannot recover older captures not saved as wall entries.

PDF generation is loaded only when requested. Pages are rendered at double
resolution using browser canvas to preserve browser font shaping for names,
Marathi text, and emoji, then embedded into the PDF. Text is therefore not
selectable/searchable; glyph availability depends on device fonts. This is an
offline visual keepsake, not a machine-readable backup.

Map geometry comes from world-atlas's Natural Earth land data, with an embedded
attribution. Pins use the existing stored longitude/latitude or known city lookup.
Guests without coordinates remain in the list. Co-located pins can overlap; the
numbered list keeps each person's location readable.

Validation: `node scripts/test-keepsake-export.mjs`,
`node scripts/test-server-photo-flow.mjs`, and `npm run build`.
Local visual QA renders a six-page sample through the real canvas/PDF renderer and
Poppler. Tests cover shared/local deduplication, seal protection, complete sections,
long text pagination, missing images, and safe photo paths. Browser download/device
font behavior and live shared-state export still need device verification.
