function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function validWherebyUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    if (
      url.protocol !== "https:" ||
      !(url.hostname === "whereby.com" || url.hostname.endsWith(".whereby.com"))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
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

  const roomUrl = validWherebyUrl(room.roomUrl);
  if (!roomUrl) {
    return json({ error: "Stored video room URL is invalid." }, 500);
  }

  const end = Date.parse(String(room.endDate || ""));
  if (!Number.isFinite(end)) {
    return json({ error: "Stored video room expiry is invalid." }, 500);
  }

  if (end <= Date.now()) {
    return json({ error: "Video room has expired." }, 410);
  }

  return json({
    provider: "whereby",
    roomUrl,
    meetingId: room.meetingId || null,
    endDate: new Date(end).toISOString()
  });
}
