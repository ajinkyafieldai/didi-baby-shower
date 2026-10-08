function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function validSlug(value) {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(value || ""));
}

function validRecord(record) {
  return Boolean(
    record &&
    typeof record === "object" &&
    validSlug(record.event_id) &&
    typeof record.package_base === "string" &&
    /^\/events\/[a-z0-9][a-z0-9-]{0,79}$/.test(record.package_base) &&
    typeof record.template_id === "string" &&
    record.template_id.length > 0 &&
    record.template_id.length <= 100 &&
    Number.isInteger(record.template_version) &&
    record.template_version >= 1 &&
    ["active", "preview", "disabled"].includes(record.status)
  );
}

async function realtime(env, method = "GET", body) {
  const base = String(env.REALTIME_URL || "").trim();
  const secret = String(env.REALTIME_SHARED_SECRET || "").trim();
  if (!base || !secret) throw new Error("Realtime proxy is not configured.");

  const url = new URL(base);
  url.searchParams.set("registry", "1");

  const headers = { "x-realtime-secret": secret };
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Package request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function sha256Text(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Package request failed (${response.status}): ${url}`);
  }
  return response.text();
}

async function validatePackage(origin, record) {
  const base = new URL(record.package_base + "/", origin);
  const [manifestText, contentText, themeText, provenance] = await Promise.all([
    fetchText(new URL("event.yaml", base)),
    fetchText(new URL("content/content.json", base)),
    fetchText(new URL("theme/theme.json", base)),
    fetchJson(new URL(".dugong-package.json", base))
  ]);

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
    JSON.parse(contentText);
    JSON.parse(themeText);
  } catch {
    throw new Error("Event package contains invalid JSON.");
  }

  if (manifest.id !== record.event_id) {
    throw new Error("Package event ID does not match registry record.");
  }
  if (
    manifest.template_id !== record.template_id ||
    Number(manifest.template_version) !== record.template_version
  ) {
    throw new Error("Package template does not match registry record.");
  }

  if (
    provenance?.generator !== "dugong" ||
    provenance?.event_id !== record.event_id ||
    provenance?.template_id !== record.template_id ||
    Number(provenance?.template_version) !== record.template_version
  ) {
    throw new Error("Dugong provenance does not match registry record.");
  }

  const required = {
    "event.yaml": manifestText,
    "content/content.json": contentText,
    "theme/theme.json": themeText
  };

  for (const [path, text] of Object.entries(required)) {
    const expected = provenance?.files?.[path];
    if (!expected) throw new Error(`Dugong provenance is missing ${path}.`);
    const actual = await sha256Text(text);
    if (actual !== expected) {
      throw new Error(`Dugong provenance hash mismatch for ${path}.`);
    }
  }
}

async function readSeedRegistry(request) {
  const url = new URL("/events/registry.json", request.url);
  return fetchJson(url);
}

async function mergedRegistry(context) {
  const seed = await readSeedRegistry(context.request);
  let dynamic = {};

  try {
    const { response, data } = await realtime(context.env);
    if (response.ok && data?.events && typeof data.events === "object") {
      dynamic = data.events;
    }
  } catch {
    // Static seed remains a valid read-only fallback.
  }

  return {
    schema: 1,
    default_event: seed.default_event,
    events: {
      ...(seed.events || {}),
      ...dynamic
    }
  };
}

export async function onRequestGet(context) {
  try {
    return json(await mergedRegistry(context));
  } catch (error) {
    return json({ error: error.message || "Unable to read event registry." }, 503);
  }
}

export async function onRequestPost(context) {
  const configuredSecret = String(context.env.EVENT_REGISTRY_ADMIN_SECRET || "").trim();
  const suppliedSecret = String(
    context.request.headers.get("x-event-registry-secret") || ""
  ).trim();

  if (!configuredSecret) {
    return json({ error: "Event registry writes are not configured." }, 503);
  }
  if (!suppliedSecret || suppliedSecret !== configuredSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const slug = String(body?.slug || "").trim();
  const record = {
    event_id: String(body?.event_id || "").trim(),
    package_base: String(body?.package_base || "").trim(),
    template_id: String(body?.template_id || "").trim(),
    template_version: Number(body?.template_version),
    status: String(body?.status || "preview").trim()
  };

  if (!validSlug(slug)) return json({ error: "Invalid event slug." }, 400);
  if (!validRecord(record)) return json({ error: "Invalid event registry record." }, 400);

  try {
    const registry = await mergedRegistry(context);
    if (registry.events[slug]) {
      return json({ error: "Event slug already exists." }, 409);
    }
    if (
      Object.values(registry.events).some(
        (entry) => entry?.event_id === record.event_id
      )
    ) {
      return json({ error: "Event ID already exists." }, 409);
    }

    await validatePackage(new URL(context.request.url).origin, record);

    const { response, data } = await realtime(context.env, "POST", {
      type: "event_registry_set",
      slug,
      record
    });

    if (!response.ok) {
      return json({ error: data.error || "Unable to persist event registry record." }, response.status);
    }

    return json({
      ok: true,
      slug,
      event: data.record
    }, 201);
  } catch (error) {
    return json({ error: error.message || "Unable to register event." }, 400);
  }
}


export { validSlug, validRecord, validatePackage };
