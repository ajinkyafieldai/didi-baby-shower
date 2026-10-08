import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const realtime = readFileSync("realtime/src/index.js", "utf8");
const provision = readFileSync("functions/api/video-provision.js", "utf8");
const videoConfig = readFileSync("functions/api/video-config.js", "utf8");
const chatConfig = readFileSync("functions/api/chat-config.js", "utf8");

assert.match(realtime, /videoRoom/);
assert.match(realtime, /chatRoom/);
assert.match(realtime, /video_room_set/);
assert.match(realtime, /chat_room_set/);

assert.match(provision, /enable_chat:\s*true/);
assert.match(provision, /type:\s*"video_room_set"/);
assert.match(provision, /type:\s*"chat_room_set"/);

assert.doesNotMatch(videoConfig, /chatRoom/);
assert.doesNotMatch(chatConfig, /videoRoom/);

console.log("Verified: video and chat use independent backend capability contracts.");
