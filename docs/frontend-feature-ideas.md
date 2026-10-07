# Front-end Feature Ideas

This branch is the incubation area for baby-shower UX ideas.

Nothing in this document is assumed to be committed product scope. Ideas can be explored, refined, prototyped, merged selectively, or dropped without affecting `devel`.

## Current ideas

### Host cue cards
Small host-only prompts during the event, such as:

- ask Aaji for a story
- family photo in two minutes
- time for Oti
- start the next game

Goal: help the event flow without turning the site into a control dashboard.

### Moment bookmarks
A one-tap way for the host to mark moments worth keeping.

Examples:

- family photo
- funny story
- everyone laughed here
- ritual started

Later these can feed the keepsake timeline and potentially align with transcript timestamps.

### Family relationships
Optional field such as:

- Aaji
- Mama
- Mavshi
- Cousin
- Friend

This can enrich the map and keepsake without becoming a genealogy system.

### Baby predictions scoreboard
Guests predict things such as:

- birth date
- birth time
- weight
- hair / no hair
- who the baby will resemble

Predictions lock before birth and can later be scored.

### Baby-name tournament
A playful elimination tournament:

16 names -> 8 -> 4 -> 2 -> winner

Separate from the simple name suggestion/poll flow.

### Memory prompt roulette
One-tap prompts to start conversations.

Examples:

- Tell us about Didi as a child
- What is the funniest thing she did?
- What food does she make best?
- What advice would you give the baby?

### Family tree-lite
A simple visual cluster of attendees around Didi and the baby, built from relationship information.

Not intended to become a full family-tree product.

### Live reaction trail
A subtle scrolling activity ribbon, for example:

- Aaji sent Flowers
- Mama sent Ashirwad
- Rohan added a photo

Designed to add life without covering the video.

### Quiet mode
A simplified interface for guests who want the least possible UI.

Possible behavior:

- video dominates the screen
- only essential ritual actions remain visible
- games and Family Hub stay tucked away
- large touch targets

### Host mode
A host-focused interface exposing controls such as:

- photo trigger
- cue cards
- game controls
- moment bookmarks
- participant overview

### Event phases
Progress the UI through stages such as:

1. Welcome
2. Rituals
3. Games
4. Family photo
5. Wrap-up

Only controls relevant to the current phase are emphasized.

This should work with the existing feature-flag architecture rather than introducing a second feature system.

### "I'm here" postcard
A lightweight arrival card containing:

- guest name
- coarse city
- relationship
- optional selfie/photo

The same entry can feed the family map and keepsake.

### Afterparty slideshow
An automatic slideshow assembled from:

- Family Wall photos
- notes
- memories
- map
- recipes
- selected moments

### Printable keepsake
Generate a grandparents-friendly printable artifact after the event.

Potential content:

- Who Was Here / map
- Family Wall
- timeline
- selected photos
- recipes
- time-capsule summary

### Birth-announcement reuse
Reuse the same site after the baby is born.

Possible additions:

- Meet the baby
- birth date/time/weight
- prediction winners
- selected shower memories
- preserved baby-shower keepsake

## Strong architectural direction

The next major UX improvement should not just be adding more controls.

Prefer making the interface aware of:

- **role** — guest / host
- **mode** — normal / quiet / afterparty
- **phase** — welcome / rituals / games / photo / wrap-up

The existing front-end feature manifest should remain the base mechanism. Role, mode, and phase should decide which enabled features are surfaced or emphasized rather than duplicating feature configuration.
