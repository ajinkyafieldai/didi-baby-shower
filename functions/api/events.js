export async function onRequest(context) {
  const upgrade = context.request.headers.get("Upgrade");

  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  if (!context.env.REALTIME) {
    return new Response("Realtime service is not bound", { status: 503 });
  }

  const url = new URL(context.request.url);
  url.pathname = "/room";
  url.search = "";

  return context.env.REALTIME.fetch(new Request(url.toString(), context.request));
}
