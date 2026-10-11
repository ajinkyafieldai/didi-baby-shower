export async function onRequestGet({ request, env }) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  const error = (message, status) => new Response(JSON.stringify({ error: message }), { status, headers });
  if (!env.BABYSHOWER_ADMIN_TOKEN || !env.REALTIME_URL || !env.REALTIME_SHARED_SECRET) return error('Family downloads are not configured.', 503);
  if (request.headers.get('authorization') !== `Bearer ${env.BABYSHOWER_ADMIN_TOKEN}`) return error('Incorrect family download key.', 401);
  const url = new URL('/capsules/export', env.REALTIME_URL);
  const response = await fetch(url, { headers: { 'x-realtime-secret': env.REALTIME_SHARED_SECRET,
    'x-family-admin': env.REALTIME_SHARED_SECRET }, cache: 'no-store' });
  return new Response(response.body, { status: response.status, headers: {
    ...headers, ...(response.ok ? { 'content-disposition': 'attachment; filename="didi-time-capsules.json"' } : {})
  } });
}
