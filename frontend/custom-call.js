import './custom-call.css';

export async function startCustomCall({ root, bootMessage, name, report, fail }) {
  let call;
  let speaker;
  let pinned;
  let outputId;
  const tiles = new Map();
  const audios = new Map();
  const shell = document.createElement('section');
  shell.className = 'custom-call';
  shell.innerHTML = `<div class="call-picture"></div><div class="call-thumbnails" aria-label="Family cameras"></div>
    <footer class="call-footer"><span class="call-home">Home page <small class="call-count"></small></span>
    <button data-action="mic" aria-label="Mute microphone">Mic</button><button data-action="camera" aria-label="Turn camera off">Camera</button>
    <button data-action="flip" aria-label="Flip camera">Flip</button><button data-action="audio" aria-label="Choose audio output">Audio</button>
    <button data-action="leave">Leave</button></footer><p class="call-notice" role="status"></p>`;
  root.append(shell);
  const picture = shell.querySelector('.call-picture');
  const thumbnails = shell.querySelector('.call-thumbnails');
  const notice = shell.querySelector('.call-notice');
  const buttons = Object.fromEntries([...shell.querySelectorAll('[data-action]')].map(b => [b.dataset.action, b]));
  Object.values(buttons).forEach(b => b.disabled = true);
  function attach(element, track) {
    if (element.srcObject?.getTracks()[0] === track) return;
    element.srcObject = track ? new MediaStream([track]) : null;
    if (track) element.play().catch(() => { if (element.tagName === 'AUDIO') notice.textContent = 'Tap Audio to hear the call.'; });
  }
  function render() {
    const people = Object.values(call.participants());
    const ids = new Set(people.map(p => p.session_id));
    for (const p of people) if (!p.local) for (const kind of ['audio', 'screenAudio']) ids.add(`${p.session_id}:${kind}`);
    for (const [id, tile] of tiles) if (!ids.has(id)) { tile.remove(); tiles.delete(id); }
    for (const [id, audio] of audios) if (!ids.has(id)) { audio.srcObject = null; audio.remove(); audios.delete(id); }
    const shared = people.find(p => p.tracks?.screenVideo?.state === 'playable');
    const main = people.find(p => p.session_id === pinned) || shared || people.find(p => p.session_id === speaker && !p.local) || people.find(p => !p.local) || people[0];
    for (const p of people) {
      let tile = tiles.get(p.session_id);
      if (!tile) {
        tile = document.createElement('button'); tile.className = 'camera-tile';
        tile.innerHTML = '<video autoplay playsinline muted></video><span class="camera-name"></span>';
        tile.onclick = () => { pinned = pinned === p.session_id ? null : p.session_id; render(); };
        tiles.set(p.session_id, tile);
      }
      const isMain = p === main;
      const track = isMain && p === shared ? p.tracks.screenVideo.persistentTrack : p.tracks?.video?.state === 'playable' ? p.tracks.video.persistentTrack : null;
      attach(tile.querySelector('video'), track);
      tile.classList.toggle('no-camera', !track);
      tile.classList.toggle('self-camera', !!p.local && p !== shared);
      tile.querySelector('.camera-name').textContent = `${p.user_name || 'Guest'}${p.local ? ' (you)' : ''}${['playable', 'sendable'].includes(p.tracks?.audio?.state) ? '' : ' · muted'}`;
      tile.setAttribute('aria-label', `${p.user_name || 'Guest'}: ${pinned === p.session_id ? 'unpin' : 'pin'} video`);
      const container = isMain ? picture : thumbnails;
      if (tile.parentElement !== container) container.append(tile);
      if (!p.local) {
        for (const kind of ['audio', 'screenAudio']) {
          const id = `${p.session_id}:${kind}`;
          // Audio streams are independent of the selected camera.
          let audio = audios.get(id);
          if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; root.append(audio); audios.set(id, audio); if (outputId && audio.setSinkId) audio.setSinkId(outputId).catch(() => {}); }
          attach(audio, p.tracks?.[kind]?.state === 'playable' ? p.tracks[kind].persistentTrack : null);
        }
      }
    }
    shell.querySelector('.call-count').textContent = `${people.length} in call`;
    buttons.mic.textContent = call.localAudio() ? 'Mute' : 'Unmute';
    buttons.mic.setAttribute('aria-label', `${call.localAudio() ? 'Mute' : 'Unmute'} microphone`);
    buttons.mic.setAttribute('aria-pressed', String(!call.localAudio()));
    buttons.camera.textContent = call.localVideo() ? 'Camera off' : 'Camera on';
    buttons.camera.setAttribute('aria-pressed', String(!call.localVideo()));
  }
  async function act(button, task) {
    button.disabled = true; notice.textContent = '';
    try { await task(); render(); } catch (error) { notice.textContent = error.message || 'Could not change this device.'; }
    finally { button.disabled = call.meetingState() !== 'joined-meeting'; }
  }
  try {
    const response = await fetch('/api/video-config', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || config.provider !== 'daily') throw new Error(config.error || 'Daily room is not configured.');
    call = window.Daily.createCallObject();
    for (const event of ['participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped']) call.on(event, render);
    call.on('active-speaker-change', e => { speaker = e.activeSpeaker?.peerId; render(); });
    call.on('joined-meeting', () => { bootMessage?.remove(); Object.values(buttons).forEach(b => b.disabled = false); render(); report('video-status', 'Live'); });
    call.on('error', e => { notice.textContent = e.errorMsg || 'Call connection failed.'; report('video-status', notice.textContent); });
    call.on('camera-error', () => { notice.textContent = 'Check camera and microphone permissions.'; });
    call.on('left-meeting', () => { for (const audio of audios.values()) audio.srcObject = null; Object.values(buttons).forEach(b => b.disabled = true); picture.replaceChildren(); thumbnails.replaceChildren(); notice.textContent = 'You left the call. Reload to join again.'; report('video-status', 'Call ended'); });
    buttons.mic.onclick = () => act(buttons.mic, () => call.setLocalAudio(!call.localAudio()));
    buttons.camera.onclick = () => act(buttons.camera, () => call.setLocalVideo(!call.localVideo()));
    buttons.flip.onclick = () => act(buttons.flip, () => call.cycleCamera());
    buttons.leave.onclick = () => act(buttons.leave, () => call.leave());
    buttons.audio.onclick = () => act(buttons.audio, async () => {
      for (const audio of audios.values()) await audio.play().catch(() => {});
      if (navigator.mediaDevices.selectAudioOutput && HTMLMediaElement.prototype.setSinkId) {
        const device = await navigator.mediaDevices.selectAudioOutput(); outputId = device.deviceId;
        await Promise.all([...audios.values()].map(audio => audio.setSinkId(outputId)));
      } else notice.textContent = 'Choose Bluetooth or speaker in your phone’s audio output settings.';
    });
    window.addEventListener('pagehide', () => { call.destroy(); }, { once: true });
    await call.join({ url: config.roomUrl, userName: name });
  } catch (error) { fail(error.message || 'Could not join the call.'); await call?.destroy(); }
}
