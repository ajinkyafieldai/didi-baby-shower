function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function realtime(env, method = "GET", body) {
  const url = String(env.REALTIME_URL || "").trim();
  const secret = String(env.REALTIME_SHARED_SECRET || "").trim();

  if (!url || !secret) {
    throw new Error("Realtime proxy is not configured.");
  }

  const headers = { "x-realtime-secret": secret };
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function currentDailyRoom(snapshot) {
  const room = snapshot?.videoRoom;
  if (!room?.roomUrl || room.provider !== "daily") return null;

  const end = Date.parse(String(room.endDate || ""));
  if (!Number.isFinite(end) || end <= Date.now()) return null;

  return room;
}

export async function onRequestPost(context) {
  const apiKey = String(context.env.DAILY_API_KEY || "").trim();
  if (!apiKey) {
    return json({ error: "DAILY_API_KEY is not configured." }, 503);
  }

  let existing;
  try {
    const { response, data } = await realtime(context.env);
    if (!response.ok) {
      return json({ error: data.error || "Unable to read event state." }, response.status);
    }
    existing = currentDailyRoom(data);
  } catch (error) {
    return json({ error: error.message || "Unable to read event state." }, 503);
  }

  if (existing) {
    return json({
      ok: true,
      reused: true,
      provider: "daily",
      roomUrl: existing.roomUrl,
      roomId: existing.roomId || null,
      endDate: existing.endDate
    });
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
  const exp = Math.floor(Date.parse(endDate) / 1000);

  const daily = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      privacy: "public",
      properties: {
        exp,
        eject_at_room_exp: true,
        enable_prejoin_ui: true,
        enable_chat: true,
        enable_screenshare: false
      }
    })
  });

  const room = await daily.json().catch(() => ({}));
  if (!daily.ok) {
    return json(
      { error: room.error || room.info || room.message || `Daily HTTP ${daily.status}` },
      daily.status
    );
  }

  if (!room.url) {
    return json({ error: "Daily did not return a room URL." }, 502);
  }

  try {
    const videoStore = await realtime(context.env, "POST", {
      type: "video_room_set",
      provider: "daily",
      roomUrl: room.url,
      roomId: room.id || null,
      endDate
    });

    if (!videoStore.response.ok) {
      return json(
        { error: videoStore.data.error || "Unable to store video room." },
        videoStore.response.status
      );
    }

    const chatStore = await realtime(context.env, "POST", {
      type: "chat_room_set",
      provider: "daily",
      roomUrl: room.url,
      roomId: room.id || null,
      endDate
    });

    if (!chatStore.response.ok) {
      return json(
        { error: chatStore.data.error || "Unable to store chat room." },
        chatStore.response.status
      );
    }
  } catch (error) {
    return json({ error: error.message || "Unable to store room capabilities." }, 503);
  }

  return json({
    ok: true,
    reused: false,
    provider: "daily",
    roomUrl: room.url,
    roomId: room.id || null,
    roomName: room.name || null,
    endDate
  });
}
