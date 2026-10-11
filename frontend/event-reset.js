// Retain recoverable local archives and photo blobs, but clear visible event content.
export function applyEventReset(storage, eventId, reset) {
  if (!reset?.id) return false;
  const marker = `${eventId}:last-event-reset`;
  if (storage.getItem(marker) === reset.id) return false;
  const keys = [`${eventId}:baby-shower-blessings-v1`, `${eventId}:baby-shower-family-hub-v1`];
  const backupKey = `${eventId}:backup:${reset.id}`;
  if (storage.getItem(backupKey) === null) storage.setItem(backupKey,
    JSON.stringify(Object.fromEntries(keys.map(key => [key, storage.getItem(key)]))));
  keys.forEach(key => storage.removeItem(key));
  storage.setItem(marker, reset.id);
  return true;
}
