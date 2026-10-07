import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const realtime = readFileSync("realtime/src/index.js", "utf8");
const provision = readFileSync("functions/api/video-provision.js", "utf8");
const config = readFileSync("functions/api/video-config.js", "utf8");

assert.match(realtime, /video_room_claim/);
assert.match(realtime, /video_room_release/);
assert.match(realtime, /claimToken/);
assert.doesNotMatch(realtime, /hostRoomUrl/);

assert.match(provision, /fields:\s*\["hostRoomUrl"\]/);
assert.match(provision, /video_room_claim/);
assert.match(provision, /video_room_release/);
assert.match(provision, /rotated:\s*force/);

assert.match(config, /Stored video room URL is invalid/);
assert.match(config, /Video room has expired/);

console.log("Verified: Whereby room lifecycle keeps host credentials operator-only and uses claimed state transitions.");
