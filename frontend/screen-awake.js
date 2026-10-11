export function createScreenAwake({ page = document, device = navigator, changed = () => {} } = {}) {
  let active = false, lock = null, pending = false;
  async function acquire() {
    if (!active || page.visibilityState !== 'visible' || lock || pending) return;
    if (!device.wakeLock) { changed('Screen wake support is unavailable on this browser.'); return; }
    pending = true;
    try {
      const next = await device.wakeLock.request('screen');
      if (!active || page.visibilityState !== 'visible') { await next.release(); return; }
      lock = next;
      next.addEventListener('release', () => {
        if (lock === next) lock = null;
        changed(active ? 'Screen wake paused. Tap to retry.' : '');
      });
      changed('Screen stays awake during the call.');
    } catch { changed('Could not keep the screen awake. Tap to retry.'); }
    finally { pending = false; }
  }
  async function setActive(value) {
    active = value;
    if (value) return acquire();
    const previous = lock; lock = null;
    if (previous) await previous.release().catch(() => {});
    changed('');
  }
  page.addEventListener('visibilitychange', acquire);
  page.addEventListener('pointerdown', acquire);
  return { setActive };
}
