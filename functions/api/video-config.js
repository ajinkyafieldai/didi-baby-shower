export async function onRequestGet(context) {
  const raw = String(context.env.BABYSHOWER_VIDEO_ROOM_URL || "").trim();

  if (!raw) {
    return Response.json(
      { error: "Video room is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let roomUrl;
  try {
    roomUrl = new URL(raw);
  } catch {
    return Response.json(
      { error: "Video room URL is invalid." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (
    roomUrl.protocol !== "https:" ||
    !(roomUrl.hostname === "whereby.com" || roomUrl.hostname.endsWith(".whereby.com"))
  ) {
    return Response.json(
      { error: "Video room URL must be an HTTPS Whereby room." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    { provider: "whereby", roomUrl: roomUrl.toString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
