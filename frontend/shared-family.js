const collections = ['blessings', 'pins', 'guests'];
export function createSharedFamily({ request = fetch, changed = () => {} } = {}) {
  let revision = -1;
  let state = Object.fromEntries(collections.map(key => [key, []]));
  function accept(family) {
    if (!family || !Number.isSafeInteger(family.revision) || family.revision <= revision ||
        collections.some(key => !Array.isArray(family[key]))) return false;
    revision = family.revision;
    state = family;
    changed();
    return true;
  }
  async function mutate(body) {
    const response = await request('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not share. Please try again.');
    if (!data.family || !Number.isSafeInteger(data.family.revision) || collections.some(key => !Array.isArray(data.family[key]))) {
      throw new Error('Shared family state is unavailable. Please try again.');
    }
    accept(data.family);
    return data;
  }
  function list(collection, local = []) {
    const shared = state[collection] || [];
    const ids = new Set(shared.map(item => item.id));
    return [...local.filter(item => !ids.has(item.id)).map(item => ({ ...item, localOnly: true })),
      ...shared.map(item => ({ ...item, localOnly: false }))].sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  }
  return {
    accept, list, snapshot: () => state,
    add: (collection, entry) => mutate({ type: 'family_add', collection, entry }),
    react: (id, emoji, mutationId) => mutate({ type: 'family_react', collection: 'blessings', id, emoji, mutationId })
  };
}

export function sharedPhotoPath(asset) {
  return typeof asset === 'string' && /^\/api\/photos\?key=photos(?:%2[fF]|\/)[a-zA-Z0-9%._-]+$/.test(asset) ? asset : null;
}
