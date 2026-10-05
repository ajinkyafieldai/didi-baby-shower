const EFFECTS = new Set(["ovalni", "flowers", "ashirwad", "supari", "tika", "celebrate"]);
const GROUP_WINDOW_MS = 10_000;
const GROUP_THRESHOLD = 2;
const GROUP_COOLDOWN_MS = 10_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export class CelebrationRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    if (request.method === "GET") {
      const latest = await this.ctx.storage.get("latest");
      return json(latest || { seq: 0, event: null });
    }

    if (request.method === "POST") {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      if (!body || body.type !== "effect" || !EFFECTS.has(body.effect)) {
        return json({ error: "Invalid effect" }, 400);
      }

      const previous = await this.ctx.storage.get("latest");
      const seq = previous && Number(previous.seq) ? Number(previous.seq) + 1 : 1;
      const now = Date.now();
      const sender = String(body.sender || "Someone").trim().slice(0, 60) || "Someone";
      const senderId = String(body.senderId || sender).trim().slice(0, 100) || sender;

      const storedRecent = await this.ctx.storage.get("recentCelebrations");
      const recent = Array.isArray(storedRecent)
        ? storedRecent.filter((entry) => now - Number(entry.at || 0) <= GROUP_WINDOW_MS)
        : [];

      recent.push({ senderId, at: now });

      const uniqueParticipants = new Set(recent.map((entry) => entry.senderId)).size;
      const lastGroupAt = Number(await this.ctx.storage.get("lastGroupAt") || 0);
      const groupCelebration =
        uniqueParticipants >= GROUP_THRESHOLD &&
        now - lastGroupAt >= GROUP_COOLDOWN_MS;

      const latest = {
        seq,
        event: {
          type: "effect",
          effect: body.effect,
          sender,
          senderId,
          id: crypto.randomUUID(),
          at: now,
          groupCelebration
        }
      };

      await this.ctx.storage.put("latest", latest);
      await this.ctx.storage.put("recentCelebrations", recent);
      if (groupCelebration) {
        await this.ctx.storage.put("lastGroupAt", now);
      }
      return json(latest);
    }

    return json({ error: "Method not allowed" }, 405);
  }
}

export default {
  async fetch(request, env) {
    if (!env.REALTIME_SHARED_SECRET) {
      return json({ error: "Worker secret not configured" }, 503);
    }

    if (request.headers.get("x-realtime-secret") !== env.REALTIME_SHARED_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const id = env.CELEBRATION_ROOM.idFromName("didi-baby-shower");
    return env.CELEBRATION_ROOM.get(id).fetch(request);
  }
};
