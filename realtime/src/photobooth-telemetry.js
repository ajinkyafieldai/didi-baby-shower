const text = (value, max = 100) => typeof value === 'string' ? value.slice(0, max) : null;
const number = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;

export function sanitizePhotobooth(body) {
  if (body.role !== 'photobooth') return {};
  const error = body.lastError;
  const capture = body.lastCapture;
  return {
    status: text(body.status, 40),
    lastRequestId: text(body.lastRequestId),
    lastError: error && typeof error === 'object' ? {
      code: text(error.code, 80), at: number(error.at), requestId: text(error.requestId)
    } : null,
    lastCapture: capture && typeof capture === 'object' ? {
      requestId: text(capture.requestId), asset: text(capture.asset, 500), at: number(capture.at),
      participants: number(capture.participants), frameCount: number(capture.frameCount),
      deadlineDelayMs: number(capture.deadlineDelayMs)
    } : null
  };
}

export function photoboothSnapshot(clients, now, activeMs) {
  return Object.entries(clients).filter(([, c]) => c.role === 'photobooth')
    .map(([clientId, c]) => ({ clientId, ...sanitizePhotobooth(c), lastSeen: c.lastSeen,
      active: now - Number(c.lastSeen || 0) <= activeMs }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}
