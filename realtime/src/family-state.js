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
  const family = await storage.get(KEY) || empty();
  const capsules = await storage.get('sealedCapsules') || [];
  return { ...family, capsules: capsules.map(({ message, ...metadata }) => metadata) };
}
export async function sealCapsule(storage, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(source.id || '') ||
      !['1', '5', '10', '18', '21'].includes(String(source.openAt))) return { status: 400, error: 'Invalid capsule' };
  const message = String(source.message || '').trim().slice(0, 500);
  const id = String(source.id);
  if (!message) return { status: 400, error: 'Supply a message' };
  return storage.transaction(async tx => {
    const capsules = await tx.get('sealedCapsules') || [];
    if (capsules.some(item => item.id === id)) return { ok: true, duplicate: true, family: await familySnapshot(tx) };
    if (capsules.length >= 200) return { status: 409, error: 'Time capsule collection is full' };
    capsules.push({ id, message, openAt: String(source.openAt),
      title: String(source.title || '').trim().slice(0, 60), sender: String(source.sender || '').trim().slice(0, 60), at: Date.now() });
    await tx.put('sealedCapsules', capsules);
    const family = await tx.get(KEY) || empty();
    family.revision += 1;
    await tx.put(KEY, family);
    return { ok: true, family: await familySnapshot(tx) };
  });
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

export async function resetFamilyPins(storage, body) {
  if (body.collection !== 'pins' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.mutationId || '')) {
    return { status: 400, error: 'Invalid pin reset' };
  }
  return storage.transaction(async tx => {
    const family = await familySnapshot(tx);
    const receipts = await tx.get('familyPinResetReceipts') || [];
    const previous = receipts.find(receipt => receipt.id === body.mutationId);
    if (previous) return { ok: true, duplicate: true, removed: previous.removed, family };
    if (family.revision !== body.expectedRevision) return { status: 409, error: 'Family state changed. Preview the pins again before resetting.' };
    const removed = family.pins.length;
    family.pins = [];
    family.revision += 1;
    await tx.put(KEY, family);
    await tx.put('familyPinResetReceipts', [...receipts, { id: body.mutationId, removed }].slice(-100));
    return { ok: true, removed, family };
  });
}

// Private, consistent backup. Capsule messages never enter the public snapshot.
export async function exportEventContent(storage) {
  return storage.transaction(async tx => {
    const content = {};
    for (const key of ['sharedFamily', 'sealedCapsules', 'nameSuggestions', 'quizAnswers',
      'latestPhoto', 'latest', 'events', 'recentCelebrations', 'familyReactionIds']) {
      content[key] = await tx.get(key) ?? null;
    }
    return { content, revision: (await familySnapshot(tx)).revision, seq: content.latest?.seq || 0 };
  });
}

export async function resetAllContent(storage, body) {
  if (body.collection !== 'all' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 ||
      !Number.isSafeInteger(body.expectedSeq) || body.expectedSeq < 0 ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.mutationId || '')) return { status: 400, error: 'Invalid event reset' };
  return storage.transaction(async tx => {
    const family = await familySnapshot(tx);
    const receipts = await tx.get('familyAllResetReceipts') || [];
    if (receipts.includes(body.mutationId)) return { ok: true, duplicate: true, family };
    const latest = await tx.get('latest');
    const games = { nameSuggestions: await tx.get('nameSuggestions') ?? null, quizAnswers: await tx.get('quizAnswers') ?? null };
    if (JSON.stringify(body.expectedGames) !== JSON.stringify(games)) return { status: 409, error: 'Game content changed. Run reset again for a fresh backup.' };
    if (family.revision !== body.expectedRevision || (latest?.seq || 0) !== body.expectedSeq) {
      return { status: 409, error: 'Event content changed. Run the reset again to save a fresh backup.' };
    }
    const reset = { id: body.mutationId, at: Date.now() };
    const cleared = { ...empty(), revision: family.revision + 1, reset };
    await tx.put(KEY, cleared);
    for (const key of ['sealedCapsules', 'nameSuggestions', 'quizAnswers', 'events', 'recentCelebrations', 'familyReactionIds']) await tx.put(key, []);
    await tx.put('latestPhoto', null);
    // Existing polling clients must retain a monotonically increasing cursor.
    await tx.put('latest', { seq: body.expectedSeq + 1, event: null });
    await tx.put('familyAllResetReceipts', [...receipts, body.mutationId].slice(-100));
    return { ok: true, family: await familySnapshot(tx) };
  });
}
