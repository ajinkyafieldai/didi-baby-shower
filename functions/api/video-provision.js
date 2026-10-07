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

async function releaseClaim(env, claimToken) {
  if (!claimToken) return;
  try {
    await realtime(env, "POST", {
      type: "video_room_release",
      claimToken
    });
  } catch {}
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
  const force = requested.force === true;

  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return json({ error: "hours must be between 0 and 24." }, 400);
  }

  let claimToken = null;
  try {
    const { response, data } = await realtime(context.env, "POST", {
      type: "video_room_claim",
      force
    });

    if (!response.ok) {
      return json(
        { error: data.error || "Unable to claim video room provisioning." },
        response.status
      );
    }

    if (data.action === "reuse" && data.videoRoom?.roomUrl) {
      return json({
        ok: true,
        reused: true,
        provider: "whereby",
        roomUrl: data.videoRoom.roomUrl,
        meetingId: data.videoRoom.meetingId || null,
        endDate: data.videoRoom.endDate || null
      });
    }

    claimToken = String(data.claimToken || "");
    if (!claimToken) {
      return json({ error: "Video room provisioning claim was not returned." }, 502);
    }
  } catch (error) {
    return json({ error: error.message || "Unable to claim video room provisioning." }, 503);
  }

  const endDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  let meeting;
  try {
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

    meeting = await whereby.json().catch(() => ({}));
    if (!whereby.ok) {
      await releaseClaim(context.env, claimToken);
      return json(
        { error: meeting.error || meeting.message || `Whereby HTTP ${whereby.status}` },
        whereby.status
      );
    }
  } catch (error) {
    await releaseClaim(context.env, claimToken);
    return json({ error: error.message || "Unable to create Whereby meeting." }, 502);
  }

  try {
    const { response, data } = await realtime(context.env, "POST", {
      type: "video_room_set",
      claimToken,
      roomUrl: meeting.roomUrl,
      meetingId: meeting.meetingId || null,
      endDate
    });

    if (!response.ok) {
      await releaseClaim(context.env, claimToken);
      return json({ error: data.error || "Unable to store video room." }, response.status);
    }
  } catch (error) {
    await releaseClaim(context.env, claimToken);
    return json({ error: error.message || "Unable to store video room." }, 503);
  }

  return json({
    ok: true,
    reused: false,
    rotated: force,
    provider: "whereby",
    roomUrl: meeting.roomUrl,
    hostRoomUrl: meeting.hostRoomUrl || null,
    meetingId: meeting.meetingId || null,
    endDate
  });
}
