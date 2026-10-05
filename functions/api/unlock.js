const COOKIE_NAME = "baby_shower_access";
const COOKIE_MAX_AGE = 12 * 60 * 60;

function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function accessToken(env) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.ZOOM_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("didi-baby-shower:" + env.FAMILY_PIN)
  );

  return base64Url(signature);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export async function onRequestPost(context) {
  if (!context.env.FAMILY_PIN || !context.env.ZOOM_CLIENT_SECRET) {
    return json({ error: "Family PIN is not configured" }, 503);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const pin = String(body && body.pin || "").trim();
  if (pin !== String(context.env.FAMILY_PIN).trim()) {
    return json({ error: "Invalid PIN" }, 401);
  }

  const token = await accessToken(context.env);
  return json({ ok: true }, 200, {
    "set-cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
  });
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405);
}
