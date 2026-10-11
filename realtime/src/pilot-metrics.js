const counters = ['attempts', 'successes', 'failures', 'errors', 'permissionErrors', 'reconnects', 'weakConnectionEvents'];
const times = ['connectedMs', 'joinTotalMs', 'joinMaxMs'];
function bounded(value, max) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(max, value))) : 0;
}
function choice(value, allowed) { return allowed.includes(value) ? value : 'Other'; }
export function sanitizePilot(body) {
  if (!body.call || typeof body.call !== 'object') return {};
  const call = { state: choice(body.call.state, ['idle', 'joining', 'connected', 'reconnecting', 'failed', 'left']) };
  for (const key of counters) call[key] = bounded(body.call[key], 10000);
  for (const key of times) call[key] = bounded(body.call[key], 86400000);
  return {
    call,
    revision: bounded(body.revision, Number.MAX_SAFE_INTEGER),
    environment: {
      browser: choice(body.environment?.browser, ['Chrome', 'Edge', 'Firefox', 'Safari']),
      os: choice(body.environment?.os, ['Android', 'iOS/iPadOS', 'Windows', 'macOS', 'Linux']),
      viewport: choice(body.environment?.viewport, ['small', 'medium', 'large'])
    }
  };
}
export function summarizePilot(clients, now, activeMs) {
  const result = { retainedPageSessions: 0, activeCalls: 0, joining: 0, reconnecting: 0, connectedMs: 0, joinTotalMs: 0, joinMaxMs: 0, environments: {} };
  for (const key of counters) result[key] = 0;
  for (const entry of Object.values(clients)) {
    if (!entry.call) continue;
    result.retainedPageSessions++;
    for (const key of [...counters, 'connectedMs', 'joinTotalMs']) result[key] += entry.call[key] || 0;
    result.joinMaxMs = Math.max(result.joinMaxMs, entry.call.joinMaxMs || 0);
    if (now - entry.lastSeen <= activeMs) {
      if (entry.call.state === 'connected') result.activeCalls++;
      if (entry.call.state === 'joining') result.joining++;
      if (entry.call.state === 'reconnecting') result.reconnecting++;
    }
    const group = `${entry.environment.os} / ${entry.environment.browser} / ${entry.environment.viewport}`;
    const bucket = result.environments[group] ||= { pageSessions: 0, attempts: 0, successes: 0, failures: 0, permissionErrors: 0, reconnects: 0 };
    bucket.pageSessions++;
    for (const key of ['attempts', 'successes', 'failures', 'permissionErrors', 'reconnects']) bucket[key] += entry.call[key] || 0;
  }
  result.joinMeanMs = result.successes ? Math.round(result.joinTotalMs / result.successes) : null;
  result.participantMinutesEstimate = Math.round(result.connectedMs / 60000 * 10) / 10;
  return result;
}
