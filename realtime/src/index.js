const EFFECTS = new Set(["ovalni", "flowers", "ashirwad", "supari", "haldi", "kunku", "oti", "tika", "celebrate", "photo"]);
const GROUP_WINDOW_MS = 10_000;
const GROUP_THRESHOLD = 2;
const GROUP_BURST_THRESHOLD = 2;

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
        games: await gameSnapshot(this.ctx)
      });
    }

    if (request.method === "POST") {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
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
