# Reset shared manual map pins

Preview (no credentials or changes):

```sh
export BABYSHOWER_URL=https://didi-baby-shower.pages.dev
node babyshower.js reset pins
```

Clear the previewed pins after creating a local JSON backup:

```sh
node babyshower.js reset pins --confirm
```

Optionally choose an unused backup filename with `--backup ./pins-backup.json`.
The backup contains the site, snapshot revision, timestamp and all removed pins.
The CLI refuses to overwrite a backup; a backup-write failure prevents the reset.
If the shared revision changes after the preview, the server returns 409 without
clearing anything. Run the preview again and repeat the command. An ambiguous
network failure is not automatically retried; check the map first.

## One-time operator setup

Configure `BABYSHOWER_ADMIN_TOKEN` as a secret on Cloudflare Pages project
`didi-baby-shower`, and export the same value in the operator's terminal.
Use a dedicated random admin token, not the Daily API key. The Worker requires no
additional secret: it uses the existing `REALTIME_SHARED_SECRET` internally.

For example, on your own machine with Wrangler authenticated:

```sh
export BABYSHOWER_ADMIN_TOKEN="$(openssl rand -hex 32)"
printf '%s\n' "$BABYSHOWER_ADMIN_TOKEN" | npx wrangler pages secret put BABYSHOWER_ADMIN_TOKEN --project-name didi-baby-shower
```

Keep the value in your password manager or local secret store so later terminals
can export the same token. Configure the secret before deploying this change;
if added later, redeploy the Pages site so its Functions have the binding.
The token must never be placed in browser code or committed.

## Scope and API

`POST /api/family-reset` requires `Authorization: Bearer <admin token>` and:

```json
{"collection":"pins","expectedRevision":12,"mutationId":"a-unique-uuid"}
```

Only `family.pins` is cleared. Guest arrivals, notes, recipes, reactions, timeline,
capsules, uploaded photos, `latestPhoto`, events and the Daily room are preserved.
Guest-arrival locations also appear on the map and remain after this command.
Browser-local legacy pins are not in shared storage and are not removed.

The reset transaction increments the shared revision, so connected frontends pick
up the empty manual-pin list during normal polling. Reset receipts deduplicate the
most recent 100 mutation IDs. Public `/api/events` requests cannot authorize reset:
the public proxy strips caller headers, and the Durable Object requires a separate
internal admin header. The endpoint is unavailable until its admin secret is set.

Validation: `node scripts/test-pin-reset.mjs` exercises admin auth, public bypass
rejection, stale revisions, reset replay, preservation of other collections,
preview-only mode, backup permissions and failed-backup behavior. No production
pins are cleared while implementing or testing this command.
