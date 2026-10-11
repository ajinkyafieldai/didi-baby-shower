export function createFamilyNotifications(notify) {
  let revision = -1;
  let previous = {};
  const collections = ['blessings', 'recipes', 'pins', 'guests', 'capsules'];
  return family => {
    if (!family || !Number.isSafeInteger(family.revision) || family.revision <= revision) return;
    const messages = [];
    for (const key of collections) {
      const items = Array.isArray(family[key]) ? family[key] : [];
      const old = new Map((previous[key] || []).map(item => [item.id, item]));
      if (revision >= 0) for (const item of items) {
        const earlier = old.get(item.id);
        const name = item.sender || item.name || 'Someone';
        if (!earlier) {
          messages.push(`${name} ${key === 'blessings' ? (item.kind === 'photo' ? 'shared a photo' : 'shared a note') :
            key === 'recipes' ? 'shared a recipe' : key === 'pins' ? 'added a map pin' : key === 'guests' ? 'said hello' : 'sealed a time capsule'}.`);
        } else if (key === 'blessings' && Object.entries(item.reactions || {}).some(([emoji, count]) => count > (earlier.reactions?.[emoji] || 0))) {
          messages.push(`New reaction on ${name}’s note.`);
        }
      }
      previous[key] = structuredClone(items);
    }
    revision = family.revision;
    if (messages.length) notify(messages.length <= 2 ? messages.join(' ') : `${messages[0]} Plus ${messages.length - 1} more family updates.`);
  };
}
