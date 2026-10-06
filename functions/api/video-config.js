function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function realtimeRequest(env, method, body) {
  const url = String(env.REALTIME_URL || "").trim();
  const secret = String(env.REALTIME_SHARED_SECRET || "").trim();

  if (!url || !secret) {
    throw new Error("Realtime proxy is not configured.");
  }

  const headers = {
    "x-realtime-secret": secret
  };

  if (body !== undefined) headers["content-type"] = "application/json";

  return fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
}

export async function onRequestGet(context) {
  try {
    const response = await realtimeRequest(context.env, "GET");
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
  } catch (error) {
    return json({ error: error.message || "Unable to read video room." }, 503);
  }
}

export async function onRequestPost(context) {
  const apiKey = String(context.env.WHEREBY_API_KEY || "").trim();
  if (!apiKey) {
    return json({ error: "WHEREBY_API_KEY is not configured." }, 503);
  }

  let requested = {};
  try {
    requested = await context.request.json();
  } catch {
    requested = {};
  }

  const hours = Number(requested.hours ?? 8);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return json({ error: "hours must be between 0 and 24." }, 400);
  }

  const endDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const whereby = await fetch("https://api.whereby.dev/v1/meetings", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      endDate,
      fields: ["hostRoomUrl"]
    })
  });

  const meeting = await whereby.json().catch(() => ({}));
  if (!whereby.ok) {
    return json(
      { error: meeting.error || meeting.message || `Whereby HTTP ${whereby.status}` },
      whereby.status
    );
  }

  try {
    const stored = await realtimeRequest(context.env, "POST", {
      type: "video_room_set",
      roomUrl: meeting.roomUrl,
      meetingId: meeting.meetingId || null,
      endDate
    });
    const storedData = await stored.json().catch(() => ({}));

    if (!stored.ok) {
      return json({ error: storedData.error || "Unable to store video room." }, stored.status);
    }
  } catch (error) {
    return json({ error: error.message || "Unable to store video room." }, 503);
  }

  return json({
    ok: true,
    provider: "whereby",
    roomUrl: meeting.roomUrl,
    hostRoomUrl: meeting.hostRoomUrl || null,
    meetingId: meeting.meetingId || null,
    endDate
  });
}
