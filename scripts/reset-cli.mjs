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

export async function resetAll({ confirm = false, backup, request = fetch } = {}) {
  const base = String(process.env.BABYSHOWER_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('BABYSHOWER_URL is required.');
  const url = new URL(base);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password) throw new Error('Use HTTPS or localhost.');
  const token = String(process.env.BABYSHOWER_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('BABYSHOWER_ADMIN_TOKEN is required.');
  const options = { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store' };
  const response = await request(base + '/api/family-reset', options);
  const snapshot = await response.json();
  if (!response.ok || !snapshot.content || !Number.isSafeInteger(snapshot.revision) || !Number.isSafeInteger(snapshot.seq)) throw new Error(snapshot.error || 'Event backup unavailable.');
  const family = snapshot.content.sharedFamily || {};
  for (const key of ['blessings', 'recipes', 'pins', 'guests']) console.log(`${key}: ${(family[key] || []).length}`);
  for (const key of ['sealedCapsules', 'nameSuggestions', 'quizAnswers']) console.log(`${key}: ${(snapshot.content[key] || []).length}`);
  console.log('Also clears event effects, latest family photo, and local event content on reconnect. Active room and Daily recordings remain.');
  if (!confirm) { console.log('Preview only. Use reset all --confirm to back up and clear.'); return; }
  const filename = backup || `didi-all-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(filename, JSON.stringify({ site: base, savedAt: new Date().toISOString(), ...snapshot }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Backup saved: ${filename}`);
  const result = await request(base + '/api/family-reset', { ...options, signal: AbortSignal.timeout(15000), method: 'POST',
    headers: { ...options.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection: 'all', expectedGames: { nameSuggestions: snapshot.content.nameSuggestions, quizAnswers: snapshot.content.quizAnswers }, expectedRevision: snapshot.revision, expectedSeq: snapshot.seq, mutationId: randomUUID() }) });
  const data = await result.json();
  if (!result.ok || !data.ok) throw new Error(data.error || 'Reset failed.');
  console.log('Event content reset. Connected devices clear on their next poll; offline devices clear when they reconnect.');
}
