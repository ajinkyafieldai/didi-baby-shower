export function createSharedRecipes({ request = fetch, changed = () => {} } = {}) {
  let revision = -1;
  let recipes = [];
  function accept(family) {
    if (!family || !Number.isSafeInteger(family.revision) || family.revision < revision || !Array.isArray(family.recipes)) return false;
    if (family.revision === revision) return false;
    revision = family.revision;
    recipes = family.recipes;
    changed();
    return true;
  }
  async function add(entry) {
    const response = await request('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'family_add', collection: 'recipes', entry })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not share recipe. Try again.');
    if (!data.family || !Array.isArray(data.family.recipes)) throw new Error('Shared recipes are unavailable. Try again after the backend update.');
    accept(data.family);
    return data;
  }
  function list(local = []) {
    const sharedIds = new Set(recipes.map(item => item.id));
    return [...local.filter(item => !sharedIds.has(item.id)).map(item => ({ ...item, localOnly: true })), ...recipes]
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  }
  return { accept, add, list };
}
