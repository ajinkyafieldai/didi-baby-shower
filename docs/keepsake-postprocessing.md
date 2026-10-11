# Keepsake post-processing and recording timeline

Work is isolated on `feature/didi-keepsake-polls-timeline`. Do not merge or deploy
during the event.

The post-processing command enriches an already downloaded keepsake HTML without
changing the live site. It adds baby-name suggestions, recorded submitter names,
vote counts, named quiz answers and recording bookmarks. It preserves embedded
photos and the family map. Sealed capsule messages are never imported.

Save the event snapshot after the event, before resetting its content:

```bash
curl -fsS "$BABYSHOWER_URL/api/events" -o didi-events.json
```

Use the JSONL notes file printed by `babyshower record`. Its header identifies
the recording and its start time. Notes contain seconds from that start, frozen
when the key was pressed. Notes marked estimated retain that label. Unfinished
notes are labelled too. This is a timeline of the operator's recording bookmarks;
it does not transcribe or infer chapters from the audio/video.

```bash
node scripts/postprocess-keepsake.mjs \
  --input original-keepsake.html \
  --output complete-keepsake.html \
  --snapshot didi-events.json \
  --notes didi-recording-RECORDING_ID-notes.jsonl \
  --video recording.mp4
```

`--snapshot` and `--notes` can be used independently. `--video` requires notes;
it is optional. Put the matching recording alongside the output HTML, using the
relative filename supplied to `--video`. If the recording was trimmed or edited,
its offsets will no longer match these bookmarks. No video is embedded or
downloaded by this tool. To share playable bookmarks, send both files together.
An HTTPS video URL also works while that URL remains accessible; a local file
is more durable. The original untrimmed Daily recording is the time reference.

Open the output HTML. Click a bookmark to seek, then use the video controls to
play. Export PDF opens the browser print dialog; select Save as PDF. The PDF keeps
the written timestamps and answers; it does not contain playable video. Without
`--video`, bookmarks are printed timestamps to use with the original recording.

The command refuses to overwrite files, rejects repeated processing, validates
recording headers and timestamps, escapes all family content and uses a hash
allowlist for its static controls script. It reads local files only. A missing
submitter name stays “Someone”; voter IDs are counted, not guessed as names.
Votes reflect the supplied snapshot, not historical changes to the poll.

The same branch adds poll/quiz sections to new HTML and PDF exports and Export
PDF inside the HTML. Existing new-format game sections are replaced during
post-processing so they do not appear twice. This is not deployed.

Validation:

```bash
node scripts/test-keepsake-postprocess.mjs
node scripts/test-keepsake-export.mjs
npm run build
```
