# Reset Didi event content

Use the same `BABYSHOWER_URL` and `BABYSHOWER_ADMIN_TOKEN` already configured for `reset pins`. The Pages secret is unchanged.

```sh
git switch devel
git pull --ff-only origin devel
export BABYSHOWER_URL=https://didi-baby-shower.pages.dev
node babyshower.js reset all
node babyshower.js reset all --confirm
```

Preview requires the admin token because it reads private capsules. Confirm saves a private `didi-all-backup-<timestamp>.json` before clearing. `--backup <file>` chooses a filename; existing files are never overwritten. A concurrent change to family content, games or events aborts reset with a fresh-backup instruction. No reset occurs if backup creation fails.

Clears shared notes/photos on the wall, recipes, manual pins, guest arrival markers, capsules, game suggestions/answers, event effects and the latest family photo. Devices running the updated frontend clear their local wall and family-hub content on their next successful poll, including local moments. Offline devices do so on reconnect. Local content is archived in browser storage; photo blobs and uploaded R2 files are retained for recovery. The JSON server backup contains asset references, not image binaries or browser-only memories.

The active Daily room, live call, recordings and telemetry remain. This command does not delete Daily recordings or uploaded files. Keep the backup private: it contains capsule messages. No automatic restore command is provided.

Before resetting, update/restart the photobooth worker with `python server/daily_photobooth.py` in its activated virtual environment. The updated worker cancels old countdowns and tags new photos with the reset marker. The server rejects late captures from before the reset. An older running worker must be restarted to publish new photos after a reset.

Existing tabs loaded before this frontend deployment need a refresh to receive the reset behavior. Afterward, content resets do not reload the page or leave the call.

`node babyshower.js reset pins [--confirm]` remains available for clearing only manual pins.
