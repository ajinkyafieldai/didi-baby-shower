function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function onRequest(context) {
  if (!['POST', 'GET'].includes(context.request.method)) return json({ error: 'Method not allowed' }, 405);
  const { BABYSHOWER_ADMIN_TOKEN, REALTIME_URL, REALTIME_SHARED_SECRET } = context.env;
  if (!BABYSHOWER_ADMIN_TOKEN || !REALTIME_URL || !REALTIME_SHARED_SECRET) {
    return json({ error: 'Admin reset is not configured' }, 503);
  }
  if (context.request.headers.get('authorization') !== `Bearer ${BABYSHOWER_ADMIN_TOKEN}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (context.request.method === 'GET') {
    const url = new URL(REALTIME_URL); url.pathname = '/reset/export'; url.search = '';
    const response = await fetch(url, { headers: { 'x-realtime-secret': REALTIME_SHARED_SECRET, 'x-family-admin': REALTIME_SHARED_SECRET } });
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!['pins', 'all'].includes(body?.collection)) return json({ error: 'Use pins or all' }, 400);
  const response = await fetch(REALTIME_URL, {
    method: 'POST', headers: { 'content-type': 'application/json',
      'x-realtime-secret': REALTIME_SHARED_SECRET, 'x-family-admin': REALTIME_SHARED_SECRET },
    body: JSON.stringify({ type: 'family_reset', collection: body.collection, expectedSeq: body.expectedSeq, expectedGames: body.expectedGames,
      expectedRevision: body.expectedRevision, mutationId: body.mutationId })
  });
  return new Response(response.body, { status: response.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
