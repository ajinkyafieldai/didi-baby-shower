const EFFECTS = new Set(["ovalni", "flowers", "blessings", "celebrate"]);

export class CelebrationRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(_socket, message) {
    let event;

    try {
      event = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (!event || event.type !== "effect" || !EFFECTS.has(event.effect)) {
      return;
    }

    const sender = String(event.sender || "Someone").trim().slice(0, 60) || "Someone";

    const broadcast = JSON.stringify({
      type: "effect",
      effect: event.effect,
      sender,
      id: crypto.randomUUID(),
      at: Date.now()
    });

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(broadcast);
      } catch {
        // Cloudflare will clean up disconnected hibernating sockets.
      }
    }
  }

  async webSocketClose(socket, code, reason) {
    socket.close(code, reason);
  }

  async webSocketError(socket) {
    try {
      socket.close(1011, "WebSocket error");
    } catch {}
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/room") {
      return new Response("Not found", { status: 404 });
    }

    const id = env.CELEBRATION_ROOM.idFromName("didi-baby-shower");
    return env.CELEBRATION_ROOM.get(id).fetch(request);
  }
};
