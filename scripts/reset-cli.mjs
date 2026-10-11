import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function resetPins({ confirm = false, backup, request = fetch } = {}) {
  const base = String(process.env.BABYSHOWER_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('BABYSHOWER_URL is required.');
  const url = new URL(base);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) {
    throw new Error('Use an HTTPS event URL, or localhost for development.');
  }
  const response = await request(base + '/api/events?since=999999999', {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000)
  });
  const snapshot = await response.json();
  const family = snapshot.family;
  if (!response.ok || !Array.isArray(family?.pins) || !Number.isSafeInteger(family.revision)) {
    throw new Error('Shared map pins are unavailable.');
  }
  console.log(`Shared manual pins: ${family.pins.length}; revision ${family.revision}`);
  for (const pin of family.pins) console.log(`  ${pin.name} · ${pin.city || 'No city'} (${pin.id})`);
  if (!confirm) {
    console.log('Preview only. Use reset pins --confirm to back up and clear these pins. Guest-arrival markers remain.');
    return;
  }
  const token = String(process.env.BABYSHOWER_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('BABYSHOWER_ADMIN_TOKEN is required for reset.');
  if (!family.pins.length) {
    console.log('No manual pins to reset.');
    return;
  }
  const filename = backup || `didi-pins-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(filename, JSON.stringify({ site: base, collection: 'pins', revision: family.revision,
    savedAt: new Date().toISOString(), pins: family.pins }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Backup saved: ${filename}`);
  const result = await request(base + '/api/family-reset', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ collection: 'pins', expectedRevision: family.revision, mutationId: randomUUID() })
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.ok) throw new Error(data.error || `Reset failed: HTTP ${result.status}. Check the map before retrying.`);
  console.log(`Reset ${data.removed} manual pins; revision ${data.family.revision}. Connected devices update on their next poll.`);
}
