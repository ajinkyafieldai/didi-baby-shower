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

  if (!roomUrl) {
    return json({ error: "Video room is not configured." }, 503);
  }

  return json({ provider: "whereby", roomUrl });
}

export async function onRequestPost(context) {
  const branch = String(context.env.CF_PAGES_BRANCH || "");
  if (!branch || branch === "devel" || branch === "main") {
    return json({ error: "Preview room provisioning is disabled on this branch." }, 403);
  }

  const apiKey = String(context.env.WHEREBY_API_KEY || "").trim();
  if (!apiKey) {
    return json({ error: "WHEREBY_API_KEY is not configured for this Pages preview." }, 503);
  }

  let requested = {};
  try {
    requested = await context.request.json();
  } catch {
    requested = {};
  }

  const hours = Number(requested.hours ?? 2);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return json({ error: "hours must be between 0 and 24." }, 400);
  }

  const endDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const response = await fetch("https://api.whereby.dev/v1/meetings", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({ endDate })
  });

  const meeting = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json(
      { error: meeting.error || meeting.message || `Whereby HTTP ${response.status}` },
      response.status
    );
  }

  return json({
    ok: true,
    provider: "whereby",
    roomUrl: meeting.roomUrl,
    meetingId: meeting.meetingId || null,
    endDate,
    preview: true
  });
}
