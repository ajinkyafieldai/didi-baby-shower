const EFFECTS = new Set(["ovalni", "flowers", "ashirwad", "supari", "tika", "celebrate"]);

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

      const latest = {
        seq,
        event: {
          type: "effect",
          effect: body.effect,
          sender: String(body.sender || "Someone").trim().slice(0, 60) || "Someone",
          id: crypto.randomUUID(),
          at: Date.now()
        }
      };

      await this.ctx.storage.put("latest", latest);
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
