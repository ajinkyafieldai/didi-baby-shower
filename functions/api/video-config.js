function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function validWherebyRoom(raw) {
  if (!raw) return null;
  try {
    const roomUrl = new URL(String(raw).trim());
    if (
      roomUrl.protocol !== "https:" ||
      !(roomUrl.hostname === "whereby.com" || roomUrl.hostname.endsWith(".whereby.com"))
    ) return null;
    return roomUrl.toString();
  } catch {
    return null;
  }
}

export async function onRequestGet(context) {
  const roomUrl = validWherebyRoom(context.env.BABYSHOWER_VIDEO_ROOM_URL);

  if (roomUrl) {
    return json({ provider: "whereby", roomUrl });
  }

  const branch = String(context.env.CF_PAGES_BRANCH || "");
  if (!branch || branch === "devel" || branch === "main") {
    return json({ error: "Video room is not configured." }, 503);
  }

  const production = await fetch("https://didi-baby-shower.pages.dev/api/video-provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hours: 2 }),
    cache: "no-store"
  });

  const data = await production.json().catch(() => ({}));
  if (!production.ok) {
    return json(
      { error: data.error || "Unable to provision preview video room." },
      production.status
    );
  }

  return json({
    provider: "whereby",
    roomUrl: data.roomUrl,
    meetingId: data.meetingId || null,
    endDate: data.endDate || null,
    preview: true,
    reused: Boolean(data.reused)
  });
}
