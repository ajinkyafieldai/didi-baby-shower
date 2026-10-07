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
    return json({ error: data.error || "Unable to read video room." }, response.status);
  }

  const room = data.videoRoom;
  if (!room?.roomUrl) {
    return json({ error: "Video room is not configured." }, 503);
  }

  if (room.endDate) {
    const end = Date.parse(room.endDate);
    if (Number.isFinite(end) && end <= Date.now()) {
      return json({ error: "Video room has expired." }, 410);
    }
  }

  return json({
    provider: "whereby",
    roomUrl: room.roomUrl,
    meetingId: room.meetingId || null,
    endDate: room.endDate || null
  });
}
