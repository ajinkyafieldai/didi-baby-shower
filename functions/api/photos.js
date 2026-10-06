function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function safeName(value) {
  return String(value || "family-photo.jpg")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 120);
}

export async function onRequestGet(context) {
  const bucket = context.env.BABY_SHOWER_PHOTOS;
  if (!bucket) {
    return json({ error: "Photo storage is not configured." }, 503);
  }

  const url = new URL(context.request.url);
  const key = String(url.searchParams.get("key") || "");
  if (!key.startsWith("photos/") || key.includes("..")) {
    return json({ error: "Invalid photo key." }, 400);
  }

  const object = await bucket.get(key);
  if (!object) {
    return json({ error: "Photo not found." }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=0, no-store");
  headers.set("content-disposition", "inline");
  return new Response(object.body, { headers });
}

export async function onRequestPost(context) {
  const bucket = context.env.BABY_SHOWER_PHOTOS;
  if (!bucket) {
    return json({ error: "Photo storage is not configured." }, 503);
  }

  const type = context.request.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    return json({ error: "Expected an image." }, 400);
  }

  const body = await context.request.arrayBuffer();
  if (!body.byteLength || body.byteLength > 10 * 1024 * 1024) {
    return json({ error: "Invalid photo size." }, 400);
  }

  const requestedName = safeName(context.request.headers.get("x-photo-name"));
  const key = `photos/${Date.now()}-${crypto.randomUUID()}-${requestedName}`;

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: type,
      cacheControl: "private, max-age=0"
    },
    customMetadata: {
      source: "family-photo"
    }
  });

  return json({ ok: true, key });
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405);
}
