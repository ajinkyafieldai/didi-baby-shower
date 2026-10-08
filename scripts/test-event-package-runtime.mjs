import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function readPackage(id) {
  const base = join("public", "events", id);
  const [manifest, content, theme] = await Promise.all([
    readFile(join(base, "event.yaml"), "utf8").then(JSON.parse),
    readFile(join(base, "content", "content.json"), "utf8").then(JSON.parse),
    readFile(join(base, "theme", "theme.json"), "utf8").then(JSON.parse)
  ]);

  assert.equal(manifest.id, id);
  return { manifest, content, theme };
}

const didi = await readPackage("didi-baby-shower");
const maya = await readPackage("maya-baby-shower");

assert.equal(didi.manifest.template_id, "baby-shower-classic");
assert.equal(maya.manifest.template_id, "baby-shower-classic");
assert.equal(didi.manifest.template_version, 1);
assert.equal(maya.manifest.template_version, 1);

for (const key of ["event_type", "surfaces", "capabilities", "rituals", "modules"]) {
  assert.deepEqual(
    didi.manifest[key],
    maya.manifest[key],
    `fixed template contract diverged at ${key}`
  );
}

assert.notEqual(didi.manifest.id, maya.manifest.id);
assert.notEqual(didi.manifest.title, maya.manifest.title);
assert.notDeepEqual(didi.manifest.data, maya.manifest.data);

assert.equal(didi.content.honoree_name, "Didi");
assert.equal(maya.content.honoree_name, "Maya");
assert.equal(didi.theme.accent, "rose");
assert.equal(maya.theme.accent, "mehendi");

assert.equal(didi.content.module_overrides.time_capsule, true);
assert.equal(maya.content.module_overrides.time_capsule, false);
assert.equal(didi.content.module_overrides.recipe_book, true);
assert.equal(maya.content.module_overrides.recipe_book, false);

console.log("Verified: one deployed runtime can consume two baby-shower-classic:v1 event packages.");
