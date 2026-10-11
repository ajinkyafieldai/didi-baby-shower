# Didi pilot: shared family state

Backend-only contract for the reported notes, recipes and people-map pin sync failures. The existing `/api/events` proxy passes these requests to the Didi Durable Object. The realtime Worker must deploy before frontend consumes this contract.

GET `/api/events?since=...` includes `family` on every response, independently of effect sequence:

```json
{"family":{"revision":0,"blessings":[],"recipes":[],"pins":[],"guests":[]}}
```

POST `/api/events`:

```json
{"type":"family_add","collection":"blessings","entry":{"id":"stable-uuid","sender":"Guest","message":"Hello baby","audience":"baby"}}
```

Use `collection:"recipes"` with `name`, `why`, `recipe`, `sender`; `collection:"pins"` or `"guests"` with `name`, `city`, optional `coords:[longitude,latitude]`. Entry IDs must remain stable on retries. Server timestamps are authoritative; duplicate IDs are no-ops. Each collection accepts 200 entries; full collections return 409 without discarding existing entries. Inputs are bounded and unrecognized fields are omitted.

Shared wish reactions:

```json
{"type":"family_react","collection":"blessings","id":"stable-uuid","emoji":"💛","mutationId":"unique-click-uuid"}
```

Reuse mutationId for a retry, generate a new one for a new click. Reaction retry deduplication covers the most recent 2000 clicks. Allowed emojis: 💛 ❤️ 🥰 👏 🙏 😂 💕 🎉.

Successful mutations return `{ok:true,family:{...}}`. Frontend must accept snapshots only when their revision is at least its current revision, including POST responses; older in-flight poll responses must not overwrite newer writes. Do not replace the server's entire collection with localStorage data. Do not display a successful share until the POST succeeds. Existing local-only entries require an explicit migration rather than automatic bulk publication.

Photos may reference `asset:"/api/photos?key=photos%2F..."` after upload to the existing photo API. Browser-local IndexedDB photoId values are deliberately omitted. Frontend must render assets explicitly; this backend change alone does not make local photos shared.

This remains Didi's existing public pilot authority model; supplied display names are not authenticated identity. Timeline and sealed capsules are not included.

Retest after frontend wiring: PC creates a wish, Android sees it; Android adds a recipe, PC sees it; iPhone adds a map pin, both see it. Refresh all three and verify persistence; retry one POST and check no duplicate.
