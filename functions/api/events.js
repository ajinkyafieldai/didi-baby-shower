export async function onRequest(context) {
  if (!context.env.CELEBRATION_ROOM) {
    return new Response(JSON.stringify({ error: "Celebration room is not bound" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const id = context.env.CELEBRATION_ROOM.idFromName("didi-baby-shower");
  const room = context.env.CELEBRATION_ROOM.get(id);

  return room.fetch(context.request);
}
