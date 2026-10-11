export async function onRequestPost({ request, env }) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!env.BABYSHOWER_ADMIN_TOKEN || !env.DAILY_API_KEY || !env.REALTIME_URL || !env.REALTIME_SHARED_SECRET) return reply({ error: 'Hidden photobooth is not configured.' }, 503);
  if (request.headers.get('authorization') !== `Bearer ${env.BABYSHOWER_ADMIN_TOKEN}`) return reply({ error: 'Unauthorized' }, 401);
  const response = await fetch(env.REALTIME_URL, { headers: { 'x-realtime-secret': env.REALTIME_SHARED_SECRET }, cache: 'no-store' });
  if (!response.ok) return reply({ error: 'Could not read active room.' }, 502);
  const { videoRoom: room } = await response.json();
  const end = Date.parse(room?.endDate || '');
  if (room?.provider !== 'daily' || !Number.isFinite(end) || end <= Date.now()) return reply({ error: 'No active Daily room.' }, 409);
  let url;
  try { url = new URL(room.roomUrl); } catch { return reply({ error: 'Invalid room URL.' }, 409); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.daily.co') || !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname)) return reply({ error: 'Invalid Daily room.' }, 409);
  const tokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST', headers: { authorization: `Bearer ${env.DAILY_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ properties: { room_name: url.pathname.slice(1), user_id: 'daily-photobooth',
      user_name: 'Family Photobooth', exp: Math.floor(end / 1000), eject_at_token_exp: true,
      is_owner: false, start_audio_off: true, start_video_off: true,
      permissions: { hasPresence: false, canSend: false, canAdmin: false, canReceive: { base: {
        video: true, audio: false, screenVideo: false, screenAudio: false,
        customVideo: { '*': false }, customAudio: { '*': false }
      } } }
    } })
  });
  const data = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !data.token) {
    let detail = String(data.info || data.error || 'No token returned').replace(/[\x00-\x1f\x7f]/g, ' ');
    for (const secret of [env.DAILY_API_KEY, env.BABYSHOWER_ADMIN_TOKEN, env.REALTIME_SHARED_SECRET]) {
      if (secret) detail = detail.split(secret).join('[redacted]');
    }
    detail = detail.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted token]').slice(0, 300);
    return reply({ error: `Daily token request failed (HTTP ${tokenResponse.status}): ${detail}` }, 502);
  }
  return reply({ token: data.token, roomUrl: room.roomUrl });
}
