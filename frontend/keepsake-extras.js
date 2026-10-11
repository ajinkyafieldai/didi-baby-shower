export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const quizQuestions = ['Comfort food', 'Common phrase', 'Surprise holiday', 'Makes her laugh'];
const list = value => Array.isArray(value) ? value : [];
export function keepsakeGames(games = {}) {
  return {
    names: list(games.names).map(item => ({ name: String(item.name || ''), sender: String(item.sender || 'Someone'),
      votes: new Set(list(item.voters).filter(value => typeof value === 'string')).size, at: item.at })),
    quiz: list(games.quiz).map(item => ({ sender: String(item.sender || 'Someone'),
      answers: list(item.answers).slice(0, 4).map(String), at: item.at }))
  };
}
export function timestamp(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(n => String(n).padStart(2, '0')).join(':');
}
export function recordingTimeline(records) {
  const headers = list(records).filter(item => item.type === 'recording');
  if (headers.length !== 1 || !headers[0].recordingId || !Number.isFinite(headers[0].startAt)) {
    throw new Error('Notes must contain exactly one recording header with its start time and recording ID.');
  }
  const recording = headers[0];
  const timeline = list(records).filter(item => item.type === 'note').map(item => {
    if (!Number.isFinite(item.seconds) || item.seconds < 0 || typeof item.message !== 'string') throw new Error('Invalid recording bookmark.');
    return { seconds: item.seconds, time: timestamp(item.seconds), message: item.message,
      estimated: Boolean(item.estimated || recording.timing !== 'daily-start-ts'), interrupted: Boolean(item.interrupted) };
  }).sort((a, b) => a.seconds - b.seconds);
  return { recording: { id: String(recording.recordingId), startAt: recording.startAt, timing: recording.timing }, timeline };
}
export function renderGames(games = { names: [], quiz: [] }) {
  const e = escapeHtml;
  return `<!-- keepsake-games:start --><section><h2>Baby-name poll (${games.names.length})</h2>${games.names.map(item => `<article><h3>${e(item.name)}</h3><p>${item.votes} ${item.votes === 1 ? 'vote' : 'votes'}</p><small>Suggested by ${e(item.sender)}</small></article>`).join('') || '<p>No entries collected.</p>'}</section>` +
    `<section><h2>Didi quiz (${games.quiz.length})</h2>${games.quiz.map(item => `<article><h3>${e(item.sender)}</h3><dl>${quizQuestions.map((question, i) => `<dt>${question}</dt><dd>${e(item.answers[i] || 'No answer')}</dd>`).join('')}</dl></article>`).join('') || '<p>No entries collected.</p>'}</section><!-- keepsake-games:end -->`;
}
export function safeVideoSource(source) {
  if (!source) return '';
  if (/[\x00-\x1f\\]/.test(source) || source.startsWith('//')) throw new Error('Use a relative video filename or an HTTPS URL.');
  const url = new URL(source, 'https://keepsake.invalid/');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a relative video filename or an HTTPS URL.');
  return source;
}
export function renderTimeline({ recording, timeline = [] } = {}, video = '') {
  const e = escapeHtml;
  if (!recording) return '';
  const source = safeVideoSource(video);
  return `<section><h2>Recording timeline (${timeline.length})</h2><p>Recording ${e(recording.id)}. Times are offsets from the start of this recording.${recording.timing !== 'daily-start-ts' ? ' Timing is estimated from recording confirmation.' : ''}</p>` +
    (source ? `<video id="keepsake-video" controls preload="none" src="${e(source)}" style="width:100%"></video><p>Choose a timestamp to seek in the recording.</p>` : '<p>Use these timestamps with the original recording. No video is embedded.</p>') +
    `<ol>${timeline.map(item => `<li>${source ? `<button type="button" data-recording-seconds="${item.seconds}">${item.time}</button>` : `<strong>${item.time}</strong>`} — ${e(item.message)}${item.estimated ? ' <small>(estimated)</small>' : ''}${item.interrupted ? ' <small>(unfinished note)</small>' : ''}</li>`).join('')}</ol></section>`;
}
// Static script: no family content is inserted into executable JavaScript.
export const keepsakeControls = `document.addEventListener('click', function(event) {
  const print = event.target.closest('[data-keepsake-print]');
  if (print) { window.print(); return; }
  const mark = event.target.closest('[data-recording-seconds]');
  const video = document.getElementById('keepsake-video');
  if (!mark || !video) return;
  const seconds = Number(mark.dataset.recordingSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const seek = function() { video.currentTime = Math.min(seconds, Number.isFinite(video.duration) ? video.duration : seconds); video.scrollIntoView({block:'center'}); };
  if (video.readyState) seek(); else { video.addEventListener('loadedmetadata', seek, {once:true}); video.load(); }
});`;
export async function controlsPolicy() {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keepsakeControls));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `script-src 'sha256-${hash}'; media-src 'self' file: https:`;
}
export const printButton = '<div class="keepsake-tools"><button type="button" data-keepsake-print>Export PDF</button><small> Choose Save as PDF in the print dialog.</small></div>';
export const printStyles = '@media print{.keepsake-tools,video{display:none}button[data-recording-seconds]{border:0;background:none;padding:0;color:inherit;font:inherit}}';
