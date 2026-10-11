const FIELDS = {
  blessings: { sender: 60, message: 500, audience: 20, caption: 180 },
  recipes: { sender: 60, name: 80, why: 180, recipe: 2000 },
  pins: { name: 60, city: 60 }, guests: { name: 60, city: 60 }
};
const EMOJIS = new Set(['💛', '❤️', '🥰', '👏', '🙏', '😂', '💕', '🎉']);
const KEY = 'sharedFamily';
function empty() {
  return { revision: 0, ...Object.fromEntries(Object.keys(FIELDS).map(key => [key, []])) };
}
export async function familySnapshot(storage) {
  return await storage.get(KEY) || empty();
}
export async function mutateFamily(storage, body) {
  const collection = body.collection;
  if (!Object.hasOwn(FIELDS, collection)) return { status: 400, error: 'Invalid family collection' };
  if (body.type === 'family_add') {
    const source = body.entry;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return { status: 400, error: 'Invalid entry' };
    const id = String(source.id || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return { status: 400, error: 'Supply a stable entry ID' };
    const entry = { id, at: Date.now() };
    for (const [field, limit] of Object.entries(FIELDS[collection])) entry[field] = String(source[field] || '').trim().slice(0, limit);
    const required = { blessings: 'message', recipes: 'recipe', pins: 'name', guests: 'name' }[collection];
    // Shared photos use the upload endpoint, never browser-local photo IDs.
    if (source.asset && /^\/api\/photos\?key=photos(?:%2[fF]|\/)[a-zA-Z0-9%._-]+$/.test(source.asset)) entry.asset = source.asset;
    if (!entry[required] && !(collection === 'blessings' && entry.asset)) return { status: 400, error: 'Missing entry content' };
    if (collection === 'blessings') {
      entry.kind = entry.asset ? 'photo' : 'note';
      entry.audience = entry.audience === 'didi' ? 'didi' : 'baby';
      entry.reactions = {};
    }
    if (['pins', 'guests'].includes(collection) && source.coords != null) {
      const coords = source.coords;
      if (!Array.isArray(coords) || coords.length !== 2 || !coords.every(Number.isFinite) || Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90) return { status: 400, error: 'Invalid coordinates' };
      entry.coords = coords;
    }
    return storage.transaction(async tx => {
      const family = await familySnapshot(tx);
      if (family[collection].some(item => item.id === id)) return { ok: true, duplicate: true, family };
      if (family[collection].length >= 200) return { status: 409, error: 'Family collection is full' };
      family[collection].push(entry);
      family.revision += 1;
      await tx.put(KEY, family);
      return { ok: true, family };
    });
  }
  if (body.type === 'family_react') {
    if (collection !== 'blessings' || !EMOJIS.has(body.emoji) || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.mutationId || '')) return { status: 400, error: 'Invalid reaction' };
    return storage.transaction(async tx => {
      const family = await familySnapshot(tx);
      const entry = family.blessings.find(item => item.id === body.id);
      if (!entry) return { status: 404, error: 'Note not found' };
      const seen = await tx.get('familyReactionIds') || [];
      if (seen.includes(body.mutationId)) return { ok: true, duplicate: true, family };
      entry.reactions[body.emoji] = (entry.reactions[body.emoji] || 0) + 1;
      family.revision += 1;
      await tx.put(KEY, family);
      await tx.put('familyReactionIds', [...seen, body.mutationId].slice(-2000));
      return { ok: true, family };
    });
  }
  return { status: 400, error: 'Invalid family mutation' };
}
