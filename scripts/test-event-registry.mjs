import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const registry = JSON.parse(
  await readFile(join("public", "events", "registry.json"), "utf8")
);

assert.equal(registry.schema, 1);
assert.equal(typeof registry.default_event, "string");
assert.ok(registry.events && typeof registry.events === "object");

const slugs = Object.keys(registry.events);
assert.ok(slugs.length > 0);
assert.ok(registry.events[registry.default_event], "default event is missing");

const eventIds = new Set();

for (const [slug, record] of Object.entries(registry.events)) {
  assert.match(slug, /^[a-z0-9][a-z0-9-]{0,79}$/);
  assert.match(record.event_id, /^[a-z0-9][a-z0-9-]{0,79}$/);
  assert.equal(typeof record.package_base, "string");
  assert.ok(record.package_base.startsWith("/events/"));
  assert.equal(typeof record.template_id, "string");
  assert.ok(Number.isInteger(record.template_version));
  assert.ok(["active", "preview", "disabled"].includes(record.status));

  assert.ok(!eventIds.has(record.event_id), `duplicate event_id: ${record.event_id}`);
  eventIds.add(record.event_id);

  const relativeBase = record.package_base.replace(/^\//, "");
  const manifest = JSON.parse(
    await readFile(join("public", relativeBase, "event.yaml"), "utf8")
  );
  const provenance = JSON.parse(
    await readFile(join("public", relativeBase, ".dugong-package.json"), "utf8")
  );

  assert.equal(manifest.id, record.event_id, `${slug}: manifest id mismatch`);
  assert.equal(manifest.template_id, record.template_id, `${slug}: template id mismatch`);
  assert.equal(
    manifest.template_version,
    record.template_version,
    `${slug}: template version mismatch`
  );
  assert.equal(provenance.event_id, record.event_id, `${slug}: provenance id mismatch`);
  assert.equal(provenance.template_id, record.template_id, `${slug}: provenance template mismatch`);
  assert.equal(
    provenance.template_version,
    record.template_version,
    `${slug}: provenance version mismatch`
  );
}

console.log(
  `Verified event registry: ${slugs.length} records, default=${registry.default_event}`
);
