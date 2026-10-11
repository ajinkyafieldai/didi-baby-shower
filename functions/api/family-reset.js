function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { BABYSHOWER_ADMIN_TOKEN, REALTIME_URL, REALTIME_SHARED_SECRET } = context.env;
  if (!BABYSHOWER_ADMIN_TOKEN || !REALTIME_URL || !REALTIME_SHARED_SECRET) {
    return json({ error: 'Admin reset is not configured' }, 503);
  }
  if (context.request.headers.get('authorization') !== `Bearer ${BABYSHOWER_ADMIN_TOKEN}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (body?.collection !== 'pins') return json({ error: 'Only manual map pins can be reset' }, 400);
  const response = await fetch(REALTIME_URL, {
    method: 'POST', headers: { 'content-type': 'application/json',
      'x-realtime-secret': REALTIME_SHARED_SECRET, 'x-family-admin': REALTIME_SHARED_SECRET },
    body: JSON.stringify({ type: 'family_reset', collection: 'pins',
      expectedRevision: body.expectedRevision, mutationId: body.mutationId })
  });
  return new Response(response.body, { status: response.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
