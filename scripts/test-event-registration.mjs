import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  validSlug,
  validRecord,
  validatePackage
} from "../functions/api/event-registry.js";

assert.equal(validSlug("maya"), true);
assert.equal(validSlug("Maya"), false);
assert.equal(validSlug("../maya"), false);

const record = {
  event_id: "maya-baby-shower",
  package_base: "/events/maya-baby-shower",
  template_id: "baby-shower-classic",
  template_version: 1,
  status: "preview"
};

assert.equal(validRecord(record), true);
assert.equal(validRecord({ ...record, package_base: "https://example.com/x" }), false);
assert.equal(validRecord({ ...record, status: "unknown" }), false);

const realFetch = globalThis.fetch;

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const prefix = "/events/maya-baby-shower/";
  assert.ok(url.pathname.startsWith(prefix), `unexpected URL: ${url.pathname}`);

  const relative = url.pathname.slice(prefix.length);
  const path = join("public", "events", "maya-baby-shower", relative);

  try {
    const body = await readFile(path);
    const contentType = relative.endsWith(".json") || relative === "event.yaml"
      ? "application/json"
      : "application/octet-stream";
    return new Response(body, {
      status: 200,
      headers: { "content-type": contentType }
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
};

try {
  await validatePackage("https://apsila.test", record);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Verified event registration package validation against Dugong output.");
