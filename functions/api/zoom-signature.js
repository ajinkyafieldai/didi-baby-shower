function base64UrlEncode(input) {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function signHmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestPost(context) {
  const {
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_MEETING_NUMBER,
    ZOOM_MEETING_PASSCODE
  } = context.env;

  if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET || !ZOOM_MEETING_NUMBER) {
    return json({
      error: "Zoom is not configured yet. Add the Meeting SDK credentials and meeting number in Cloudflare Pages."
    }, 503);
  }

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + (60 * 60);

  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const payload = {
    appKey: ZOOM_CLIENT_ID,
    mn: String(ZOOM_MEETING_NUMBER),
    role: 0,
    iat,
    exp,
    tokenExp: exp,
    video_webrtc_mode: 1
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signatureBytes = await signHmacSha256(signingInput, ZOOM_CLIENT_SECRET);
  const signature = `${signingInput}.${base64UrlEncode(signatureBytes)}`;

  return json({
    signature,
    sdkKey: ZOOM_CLIENT_ID,
    meetingNumber: String(ZOOM_MEETING_NUMBER),
    passcode: ZOOM_MEETING_PASSCODE || ""
  });
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405);
}
