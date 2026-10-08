function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestGet(context) {
  const url = String(context.env.REALTIME_URL || "").trim();
  const secret = String(context.env.REALTIME_SHARED_SECRET || "").trim();

  if (!url || !secret) {
    return json({ error: "Realtime proxy is not configured." }, 503);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { "x-realtime-secret": secret },
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({ error: data.error || "Unable to read chat transport." }, response.status);
  }

  const room = data.chatRoom;
  if (!room?.roomUrl) {
    return json({ error: "Chat transport is not configured." }, 503);
  }

  const end = Date.parse(String(room.endDate || ""));
  if (Number.isFinite(end) && end <= Date.now()) {
    return json({ error: "Chat transport has expired." }, 410);
  }

  return json({
    provider: room.provider,
    roomUrl: room.roomUrl,
    roomId: room.roomId || null,
    endDate: room.endDate || null
  });
}
