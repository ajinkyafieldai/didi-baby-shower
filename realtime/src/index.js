const EFFECTS = new Set(["ovalni", "flowers", "ashirwad", "supari", "haldi", "kunku", "oti", "tika", "celebrate", "photo"]);
const GROUP_WINDOW_MS = 10_000;
const GROUP_THRESHOLD = 2;
const GROUP_BURST_THRESHOLD = 2;
const TELEMETRY_ACTIVE_MS = 15_000;
const TELEMETRY_MAX_CLIENTS = 200;

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

async function telemetrySnapshot(ctx) {
  const stored = await ctx.storage.get("telemetryClients");
  const clients = stored && typeof stored === "object" ? stored : {};
  const now = Date.now();
  const active = Object.values(clients).filter((entry) => now - Number(entry.lastSeen || 0) <= TELEMETRY_ACTIVE_MS);
  const byRole = {};
  const latencies = [];

  for (const entry of active) {
    const role = String(entry.role || "guest");
    byRole[role] = (byRole[role] || 0) + 1;
    const latency = Number(entry.latencyMs);
    if (Number.isFinite(latency) && latency >= 0) latencies.push(latency);
  }

  const startedAt = Number(await ctx.storage.get("startedAt") || now);
  return {
    activeClients: active.length,
    byRole,
    latencyMs: {
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
      samples: latencies.length
    },
    startedAt,
    uptimeMs: Math.max(0, now - startedAt)
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function gameSnapshot(ctx) {
  const nameSuggestions = await ctx.storage.get("nameSuggestions");
  const quizAnswers = await ctx.storage.get("quizAnswers");
  return {
    names: Array.isArray(nameSuggestions) ? nameSuggestions : [],
    quiz: Array.isArray(quizAnswers) ? quizAnswers : []
  };
}

export class CelebrationRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.ctx.blockConcurrencyWhile(async () => {
      const startedAt = await this.ctx.storage.get("startedAt");
      if (!startedAt) await this.ctx.storage.put("startedAt", Date.now());
    });
  }

  async fetch(request) {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const since = Math.max(0, Number(url.searchParams.get("since") || 0));
      const latest = await this.ctx.storage.get("latest");
      const storedEvents = await this.ctx.storage.get("events");
      const events = Array.isArray(storedEvents)
        ? storedEvents.filter((event) => Number(event.seq || 0) > since)
        : [];

      return json({
        seq: latest && Number(latest.seq) ? Number(latest.seq) : 0,
        events,
        games: await gameSnapshot(this.ctx),
        telemetry: await telemetrySnapshot(this.ctx)
      });
    }

    if (request.method === "POST") {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      if (body && body.type === "telemetry") {
        const clientId = String(body.clientId || "").trim().slice(0, 100);
        if (!clientId) return json({ error: "Invalid telemetry client" }, 400);

        const stored = await this.ctx.storage.get("telemetryClients");
        const clients = stored && typeof stored === "object" ? stored : {};
        clients[clientId] = {
          role: String(body.role || "guest").trim().slice(0, 30) || "guest",
          lastSeen: Date.now(),
          latencyMs: Number.isFinite(Number(body.latencyMs)) ? Math.max(0, Math.min(60_000, Number(body.latencyMs))) : null,
          lastEventSeq: Math.max(0, Number(body.lastEventSeq || 0)),
          visible: body.visible !== false
        };

        const entries = Object.entries(clients)
          .sort((a, b) => Number(b[1].lastSeen || 0) - Number(a[1].lastSeen || 0))
          .slice(0, TELEMETRY_MAX_CLIENTS);
        await this.ctx.storage.put("telemetryClients", Object.fromEntries(entries));
        return json({ ok: true, telemetry: await telemetrySnapshot(this.ctx) });
      }

      if (body && body.type === "name_suggestion") {
        const name = String(body.name || "").trim().slice(0, 40);
        const senderId = String(body.senderId || "").trim().slice(0, 100);
        if (!name || !senderId) return json({ error: "Invalid name suggestion" }, 400);

        const stored = await this.ctx.storage.get("nameSuggestions");
        const suggestions = Array.isArray(stored) ? stored : [];
        const existing = suggestions.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

        if (existing) {
          existing.voters = Array.isArray(existing.voters) ? existing.voters : [];
          if (!existing.voters.includes(senderId)) existing.voters.push(senderId);
        } else {
          suggestions.push({
            id: crypto.randomUUID(),
            name,
            sender: String(body.sender || "Someone").trim().slice(0, 60) || "Someone",
            voters: [senderId],
            at: Date.now()
          });
        }

        suggestions.sort((a, b) => (b.voters?.length || 0) - (a.voters?.length || 0));
        await this.ctx.storage.put("nameSuggestions", suggestions.slice(0, 40));
        return json({ ok: true, games: await gameSnapshot(this.ctx) });
      }

      if (body && body.type === "name_vote") {
        const id = String(body.id || "");
        const senderId = String(body.senderId || "").trim().slice(0, 100);
        const stored = await this.ctx.storage.get("nameSuggestions");
        const suggestions = Array.isArray(stored) ? stored : [];
        const entry = suggestions.find((item) => item.id === id);
        if (!entry || !senderId) return json({ error: "Invalid vote" }, 400);

        entry.voters = Array.isArray(entry.voters) ? entry.voters : [];
        if (entry.voters.includes(senderId)) {
          entry.voters = entry.voters.filter((value) => value !== senderId);
        } else {
          entry.voters.push(senderId);
        }

        suggestions.sort((a, b) => (b.voters?.length || 0) - (a.voters?.length || 0));
        await this.ctx.storage.put("nameSuggestions", suggestions);
        return json({ ok: true, games: await gameSnapshot(this.ctx) });
      }

      if (body && body.type === "quiz_submit") {
        const senderId = String(body.senderId || "").trim().slice(0, 100);
        const sender = String(body.sender || "Someone").trim().slice(0, 60) || "Someone";
        const answers = Array.isArray(body.answers)
          ? body.answers.slice(0, 4).map((value) => String(value || "").trim().slice(0, 100))
          : [];
        if (!senderId || answers.length !== 4 || answers.some((value) => !value)) {
          return json({ error: "Complete all quiz answers" }, 400);
        }

        const stored = await this.ctx.storage.get("quizAnswers");
        const quiz = Array.isArray(stored) ? stored.filter((entry) => entry.senderId !== senderId) : [];
        quiz.push({ senderId, sender, answers, at: Date.now() });
        await this.ctx.storage.put("quizAnswers", quiz.slice(-80));
        return json({ ok: true, games: await gameSnapshot(this.ctx) });
      }

      if (!body || body.type !== "effect" || !EFFECTS.has(body.effect)) {
        return json({ error: "Invalid event" }, 400);
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

      recent.push({ senderId, effect: body.effect, at: now });

      const sameEffect = recent.filter((entry) => entry.effect === body.effect);
      const uniqueParticipants = new Set(sameEffect.map((entry) => entry.senderId)).size;
      const groupable = body.effect !== "photo";
      const groupCelebration = groupable && uniqueParticipants >= GROUP_THRESHOLD;
      const groupBurst = groupable && uniqueParticipants >= GROUP_BURST_THRESHOLD;

      const event = {
        type: "effect",
        effect: body.effect,
        sender,
        senderId,
        id: crypto.randomUUID(),
        at: now,
        seq,
        groupCelebration,
        groupCount: uniqueParticipants,
        groupBurst
      };

      const latest = { seq, event };
      const storedEvents = await this.ctx.storage.get("events");
      const events = Array.isArray(storedEvents) ? storedEvents : [];
      events.push(event);
      const trimmedEvents = events.slice(-80);

      await this.ctx.storage.put("latest", latest);
      await this.ctx.storage.put("events", trimmedEvents);
      await this.ctx.storage.put(
        "recentCelebrations",
        groupBurst
          ? recent.filter((entry) => entry.effect !== body.effect)
          : recent
      );
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
