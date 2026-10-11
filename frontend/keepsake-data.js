import { keepsakeGames } from './keepsake-extras.js';
const list = value => Array.isArray(value) ? value : [];

export function mergeEntries(local, shared) {
  const entries = new Map();
  list(local).forEach((item, i) => entries.set(item.id || `local-${i}`, { ...item, localOnly: true }));
  list(shared).forEach((item, i) => entries.set(item.id || `shared-${i}`, { ...item, localOnly: false }));
  return [...entries.values()].sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
}

export function buildKeepsake({ title, honoree, wall, hub = {}, family = {}, games = {}, latestPhoto, warnings = [] }) {
  const notes = mergeEntries(wall, family.blessings);
  const places = mergeEntries(hub.pins, family.pins);
  const guests = mergeEntries(hub.guests, family.guests);
  const people = new Map();
  [...places, ...guests].forEach(person => {
    const key = `${String(person.name || '').trim().toLowerCase()}|${String(person.city || '').trim().toLowerCase()}`;
    const existing = people.get(key);
    people.set(key, { ...existing, ...person, coords: person.coords || existing?.coords });
  });
  const photos = notes.filter(item => item.kind === 'photo');
  if (latestPhoto?.asset && !photos.some(item => item.asset === latestPhoto.asset)) {
    photos.push({ ...latestPhoto, caption: 'Family photo moment', sender: 'Family', kind: 'photo' });
  }
  return {
    title, honoree, exportedAt: Date.now(), warnings: [...warnings], games: keepsakeGames(games),
    notes: notes.filter(item => item.kind !== 'photo'), photos,
    moments: mergeEntries(hub.timeline, family.timeline),
    people: [...people.values()],
    recipes: mergeEntries(hub.recipes, family.recipes),
    // Export the seal metadata only. Never put a sealed message in the PDF model.
    capsules: mergeEntries(hub.capsules, family.capsules).map(({ title, sender, openAt, at }) => ({ title, sender, openAt, at }))
  };
}

export function photoPath(asset) {
  if (typeof asset !== 'string') return null;
  let key = asset;
  if (asset.startsWith('/api/photos?')) {
    key = new URL(asset, 'https://event.test').searchParams.get('key') || '';
  }
  return /^photos\/[a-zA-Z0-9._-]+$/.test(key) ? '/api/photos?key=' + encodeURIComponent(key) : null;
}
