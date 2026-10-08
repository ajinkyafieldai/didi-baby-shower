import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function sha256(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function verify(id) {
  const base = join("public", "events", id);
  const provenance = JSON.parse(
    await readFile(join(base, ".dugong-package.json"), "utf8")
  );

  assert.equal(provenance.schema, 1);
  assert.equal(provenance.generator, "dugong");
  assert.equal(provenance.event_id, id);
  assert.equal(provenance.template_id, "baby-shower-classic");
  assert.equal(provenance.template_version, 1);

  for (const [relative, expected] of Object.entries(provenance.files || {})) {
    const actual = await sha256(join(base, relative));
    assert.equal(
      actual,
      expected,
      `${id}: generated package hash mismatch for ${relative}`
    );
  }

  return provenance;
}

await verify("didi-baby-shower");
await verify("maya-baby-shower");

console.log("Verified: Apsila runtime fixtures are byte-identical to Dugong-generated packages.");
