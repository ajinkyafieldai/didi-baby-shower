function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequest(context) {
  const { REALTIME_URL, REALTIME_SHARED_SECRET } = context.env;

  if (!REALTIME_URL || !REALTIME_SHARED_SECRET) {
    const branch = String(context.env.CF_PAGES_BRANCH || "");
    if (branch && branch !== "devel" && branch !== "main") {
      const incoming = new URL(context.request.url);
      const production = new URL("https://didi-baby-shower.pages.dev/api/events");
      production.search = incoming.search;

      let body;
      const headers = new Headers();
      if (context.request.method === "POST") {
        headers.set("content-type", "application/json");
        body = await context.request.text();
      }

      const response = await fetch(production.toString(), {
        method: context.request.method,
        headers,
        body,
        cache: "no-store"
      });

      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    return json({ error: "Realtime proxy is not configured" }, 503);
  }

  const upstream = new URL(REALTIME_URL);
  const incoming = new URL(context.request.url);
  upstream.search = incoming.search;

  const headers = new Headers();
  headers.set("x-realtime-secret", REALTIME_SHARED_SECRET);

  let body;
  if (context.request.method === "POST") {
    headers.set("content-type", "application/json");
    body = await context.request.text();
  }

  const response = await fetch(upstream.toString(), {
    method: context.request.method,
    headers,
    body,
    cache: "no-store"
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
