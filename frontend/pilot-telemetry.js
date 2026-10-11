// Coarse client groups only: never send names, room URLs, device labels or raw UA.
export function clientEnvironment(nav = {}, width = 0) {
  const ua = nav.userAgent || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1) ? 'iOS/iPadOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg(?:A|iOS)?\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return { os, browser, viewport: width < 600 ? 'small' : width < 1000 ? 'medium' : 'large' };
}

export function createCallMetrics(now = () => performance.now()) {
  const data = { state: 'idle', attempts: 0, successes: 0, failures: 0, errors: 0, permissionErrors: 0, reconnects: 0, connectedMs: 0, joinTotalMs: 0, joinMaxMs: 0, weakConnectionEvents: 0 };
  let attemptAt = null;
  let connectedAt = null;
  let quality = 'good';
  function stopTime() {
    if (connectedAt !== null) data.connectedMs += Math.max(0, now() - connectedAt);
    connectedAt = null;
  }
  return {
    signal(signal) {
      if (signal === 'joining' && !['joining', 'connected'].includes(data.state)) {
        stopTime(); data.attempts++; attemptAt = now(); data.state = 'joining';
      } else if (signal === 'joined' && data.state !== 'connected') {
        if (attemptAt !== null) {
          const elapsed = Math.max(0, now() - attemptAt);
          data.successes++; data.joinTotalMs += elapsed; data.joinMaxMs = Math.max(data.joinMaxMs, elapsed);
        }
        attemptAt = null; data.state = 'connected'; connectedAt = now();
      } else if (signal === 'interrupted' && data.state === 'connected') {
        stopTime(); data.reconnects++; data.state = 'reconnecting';
      } else if (signal === 'restored' && data.state === 'reconnecting') {
        data.state = 'connected'; connectedAt = now();
      } else if (signal === 'error' && data.state !== 'failed') {
        data.errors++;
        if (attemptAt !== null) { data.failures++; attemptAt = null; }
        stopTime(); data.state = 'failed';
      } else if (signal === 'permission-error') {
        data.permissionErrors++;
      } else if (signal === 'left') {
        if (attemptAt !== null) { data.failures++; attemptAt = null; }
        stopTime(); data.state = 'left';
      } else if (signal === 'weak' || signal === 'good') {
        if (signal === 'weak' && quality !== 'weak') data.weakConnectionEvents++;
        quality = signal;
      }
    },
    snapshot() {
      return { ...data, connectedMs: Math.round(data.connectedMs + (connectedAt === null ? 0 : Math.max(0, now() - connectedAt))), joinTotalMs: Math.round(data.joinTotalMs), joinMaxMs: Math.round(data.joinMaxMs) };
    }
  };
}

export function weakConnection(event) {
  return ['low', 'bad', 'very-low'].includes(event.networkState ?? event.threshold);
}

export function observeCall(call, emit) {
  const interrupted = new Set();
  let joined = false;
  call.on('joining-meeting', () => emit('joining'));
  call.on('joined-meeting', () => { joined = true; interrupted.clear(); emit('joined'); });
  call.on('left-meeting', () => { joined = false; interrupted.clear(); emit('left'); });
  call.on('error', () => { joined = false; emit('error'); });
  call.on('camera-error', () => emit('permission-error'));
  call.on('network-quality-change', e => emit(weakConnection(e) ? 'weak' : 'good'));
  call.on('network-connection', e => {
    // Remote peer disconnections must not count as this guest reconnecting.
    if (!joined || !['signaling', 'sfu'].includes(e.type)) return;
    const key = `${e.type}:${e.sfu_id || ''}`;
    const wasInterrupted = interrupted.size > 0;
    if (e.event === 'interrupted') interrupted.add(key);
    if (e.event === 'connected') interrupted.delete(key);
    if (!wasInterrupted && interrupted.size) emit('interrupted');
    if (wasInterrupted && !interrupted.size) emit('restored');
  });
}
