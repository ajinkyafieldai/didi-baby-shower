import { createRecordingNotes } from './recording-notes.mjs';
const API = 'https://api.daily.co/v1';

export async function recordingCommand(action = 'run', options = {}) {
  const key = String(process.env.DAILY_API_KEY || '').trim();
  if (!key) throw new Error('DAILY_API_KEY is required in your environment.');
  const base = String(process.env.BABYSHOWER_URL || '').replace(/\/$/, '');
  async function request(url, method = 'GET', body, daily = true) {
    const response = await fetch(url, {
      method, headers: { ...(daily ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.info || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  if (!['run', 'start', 'stop', 'status'].includes(action)) throw new Error('Use recording run, start, stop or status.');
  if (action === 'status') {
    if (!options.id) throw new Error('recording status requires --id <recording-id>.');
    const info = await request(`${API}/recordings/${encodeURIComponent(options.id)}`);
    console.log(JSON.stringify({ id: info.id, status: info.status, duration: info.duration, room: info.room_name }, null, 2));
    return;
  }
  let room = options.room;
  if (!room) {
    if (!base) throw new Error('BABYSHOWER_URL is required, or pass --room <room-name>.');
    const config = await request(`${base}/api/video-config`, 'GET', undefined, false);
    const url = new URL(config.roomUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.daily.co')) throw new Error('Invalid Daily room configuration.');
    room = url.pathname.split('/').filter(Boolean)[0];
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(room || '')) throw new Error('Invalid room name.');
  const endpoint = `${API}/rooms/${encodeURIComponent(room)}/recordings`;
  if (action === 'stop') {
    await request(`${endpoint}/stop`, 'POST');
    console.log(`Stop requested for ${room}. Processing may continue; check recording status.`);
    return;
  }
  if (action === 'start') {
    const result = await request(`${endpoint}/start`, 'POST', { type: 'cloud' });
    console.log(JSON.stringify({ status: result.status, recordingId: result.recordingId, room }, null, 2));
    return;
  }

  let interrupted = false;
  let wake = () => {};
  const onSignal = () => { interrupted = true; wake(); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  function pause(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      wake = () => { clearTimeout(timer); resolve(); };
      if (interrupted) wake();
    });
  }
  let accepted = false;
  let finished = false;
  let recordingId;
  let notes;
  try {
    if (interrupted) return;
    console.log(`Starting cloud recording in ${room}…`);
    const result = await request(`${endpoint}/start`, 'POST', { type: 'cloud' });
    accepted = true;
    recordingId = result.recordingId;
    if (!recordingId) throw new Error('Start accepted without a recording ID; cannot confirm recording.');
    console.log(`Start accepted: ${recordingId}. Waiting for confirmation…`);
    let active = false;
    const deadline = Date.now() + 60_000;
    while (!interrupted) {
      let info;
      try { info = await request(`${API}/recordings/${encodeURIComponent(recordingId)}`); }
      catch (error) {
        if (!active && error.status === 404 && Date.now() < deadline && !interrupted) {
          await pause(3000);
          continue;
        }
        throw error;
      }
      if (info.status === 'in-progress') {
        if (!active) {
          console.log('● RECORDING — Ctrl+C to stop.');
          try { notes = createRecordingNotes({ recordingId, room, startTs: info.start_ts, filename: options.notes, interrupt: onSignal }); }
          catch (error) { console.error(`Notes unavailable: ${error.message}. Recording continues.`); }
        }
        active = true;
      } else if (info.status === 'finished' || info.status === 'canceled') {
        finished = true;
        console.log(`Recording ${info.status}: ${recordingId}`);
        if (info.status === 'canceled') throw new Error('Daily canceled the recording.');
        return;
      } else if (!active && Date.now() > deadline) {
        throw new Error('Recording did not become active within 60 seconds.');
      }
      await pause(3000);
    }
  } finally {
    try { notes?.close(); }
    catch (error) { console.error(`Notes cleanup failed: ${error.message}. Stopping recording anyway.`); }
    try {
      if (accepted && !finished) {
        console.log('Stopping recording…');
        await request(`${endpoint}/stop`, 'POST');
        console.log(`Stop accepted. Recording ${recordingId || '(unknown ID)'} is processing.`);
      }
    } catch (error) {
      console.error(`STOP FAILED: ${error.message}. Run: babyshower recording stop --room ${room}`);
      throw error;
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }
  }
}
