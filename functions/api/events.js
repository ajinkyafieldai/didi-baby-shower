export async function onRequest(context) {
  const upgrade = context.request.headers.get("Upgrade");

  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  if (!context.env.CELEBRATION_ROOM) {
    return new Response("Celebration room is not bound", { status: 503 });
  }

  const id = context.env.CELEBRATION_ROOM.idFromName("didi-baby-shower");
  const room = context.env.CELEBRATION_ROOM.get(id);

  return room.fetch(context.request);
}
