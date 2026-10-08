
const iconPaths = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  camera: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-4v12l-6-4"/>',
  flip: '<path d="M20 7h-5l2-3M4 17h5l-2 3M20 7a9 9 0 0 0-15-3M4 17a9 9 0 0 0 15 3"/>',
  audio: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="2" y="12" width="4" height="8" rx="2"/><rect x="18" y="12" width="4" height="8" rx="2"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  view: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
};
export function participantInitials(name) {
  const words = (name || 'Guest').trim().split(/\s+/).filter(Boolean);
  return [words[0] || 'Guest', ...(words.length > 1 ? [words.at(-1)] : [])].map(word => Array.from(word)[0]).join('').toLocaleUpperCase();
}
export function chooseCallLayout(width, height, aspect, count) {
  aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const tileWidth = Math.min(164, Math.max(112, (width - 24) / Math.min(Math.max(count, 1), 3)));
  const tileHeight = Math.round(tileWidth * .7);
  const across = Math.max(1, Math.floor((width - 12) / (tileWidth + 6)));
  const rows = count > across && height >= 500 ? 2 : 1;
  const rowSpace = Math.min(height * .3, rows * (tileHeight + 6) + 12);
  const railWidth = Math.min(164, Math.max(112, width * .25));
  const fittedArea = (w, h) => { const fittedWidth = Math.min(w, h * aspect); return fittedWidth * fittedWidth / aspect; };
  const rowScore = fittedArea(width, Math.max(1, height - rowSpace)) + Math.min(count, across * rows) * 6000;
  const columnScore = fittedArea(width - railWidth - 12, height) + Math.min(count, Math.floor(height / (railWidth * .7 + 6))) * 6000;
  return { rail: count && width >= 360 && width - railWidth >= 230 && columnScore > rowScore ? 'side' : 'bottom', tileWidth, tileHeight, rowSpace, railWidth };
}
function controlIcon(kind, off = false) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[kind]}${off ? '<path d="m3 3 18 18"/>' : ''}</svg>`;
}

export async function startCustomCall({ root, bootMessage, name, report, fail }) {
  let call;
  let speaker;
  let pinned;
  let mode = 'speaker';
  let outputId;
  let joinTimer;
  const tiles = new Map();
  const audios = new Map();
  const shell = document.createElement('section');
  shell.className = 'custom-call';
  shell.innerHTML = `<div class="call-picture"></div><div class="call-thumbnails" aria-label="Family cameras"></div>
    <footer class="call-footer"><span class="call-home">Home page <small class="call-count"></small><small class="call-connection" role="status"></small></span><button class="show-controls" aria-label="Show video controls" hidden>•••</button><button class="more-people" aria-label="Scroll to more people" hidden>↓</button>
    <button data-action="mic" aria-label="Mute microphone">Mic</button><button data-action="camera" aria-label="Turn camera off">Camera</button>
    <button data-action="flip" aria-label="Flip camera">Flip</button><button data-action="audio" aria-label="Choose audio output">Audio</button>
    <button data-action="view" aria-label="Video modes and pinning">View</button><button data-action="fullscreen" aria-label="Fullscreen video">Fullscreen</button>
    </footer><p class="call-notice" role="status"></p>`;
  root.append(shell);
  const devicePanel = document.createElement('section');
  devicePanel.className = 'call-devices'; devicePanel.hidden = true;
  devicePanel.setAttribute('aria-label', 'Call devices');
  devicePanel.innerHTML = '<header><strong>Call devices</strong><button type="button" aria-label="Close device picker">×</button></header><label>Microphone<select data-device="audioinput"></select></label><label>Camera<select data-device="videoinput"></select></label><label>Speaker / headphones<select data-device="audiooutput"></select></label><p class="device-help" role="status"></p>';
  shell.append(devicePanel);
  const viewPanel = document.createElement('section');
  viewPanel.className = 'call-devices'; viewPanel.hidden = true;
  viewPanel.setAttribute('aria-label', 'Video layout');
  viewPanel.innerHTML = '<header><strong>Video layout</strong><button aria-label="Close video layout">×</button></header><label>View<select class="view-mode"><option value="speaker">Speaker — large video and thumbnails</option><option value="grid">Grid — everyone together</option><option value="focus">Focus — large video only</option></select></label><label>Pin video<select class="pin-person"><option value="">Automatic speaker</option></select></label><p class="device-help">Use the pin at the top right of a video. Tap it again to unpin.</p>';
  shell.append(viewPanel);
  const picture = shell.querySelector('.call-picture');
  const thumbnails = shell.querySelector('.call-thumbnails');
  const notice = shell.querySelector('.call-notice');
  const connection = shell.querySelector('.call-connection');
  const reveal = shell.querySelector('.show-controls');
  const more = shell.querySelector('.more-people');
  let controlsTimer;
  let scrollFrame;
  function showControls() {
    clearTimeout(controlsTimer);
    shell.classList.remove('controls-hidden'); reveal.hidden = true;
    controlsTimer = setTimeout(() => {
      if (!devicePanel.hidden || !viewPanel.hidden || shell.querySelector(':focus-visible') || shell.querySelector('[data-action]:disabled')) { showControls(); return; }
      shell.classList.add('controls-hidden'); reveal.hidden = false;
    }, 4000);
  }
  reveal.onclick = showControls;
  for (const event of ['pointerdown', 'pointermove', 'keydown', 'focusin']) shell.addEventListener(event, showControls);
  function updateScrollCue() {
    const target = mode === 'grid' ? picture : thumbnails;
    more.hidden = mode === 'focus' || target.scrollHeight - target.clientHeight - target.scrollTop < 8;
  }
  more.onclick = () => { const target = mode === 'grid' ? picture : thumbnails; target.scrollBy({ top: Math.max(80, target.clientHeight * .8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  picture.addEventListener('scroll', updateScrollCue);
  thumbnails.addEventListener('scroll', updateScrollCue);
  function arrangeVideos() {
    const video = picture.querySelector('video');
    const settings = video?.srcObject?.getVideoTracks()[0]?.getSettings();
    const aspect = video?.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : settings?.aspectRatio || (settings?.width && settings?.height ? settings.width / settings.height : 16 / 9);
    const height = Math.max(1, shell.clientHeight - shell.querySelector('.call-footer').offsetHeight - notice.offsetHeight);
    const layout = chooseCallLayout(shell.clientWidth, height, aspect, thumbnails.children.length);
    shell.dataset.rail = layout.rail;
    shell.style.setProperty('--thumb-width', `${layout.tileWidth}px`);
    shell.style.setProperty('--thumb-height', `${layout.tileHeight}px`);
    shell.style.setProperty('--rail-height', `${layout.rowSpace}px`);
    shell.style.setProperty('--rail-width', `${layout.railWidth}px`);
    cancelAnimationFrame(scrollFrame); scrollFrame = requestAnimationFrame(updateScrollCue);
  }
  const layoutObserver = new ResizeObserver(arrangeVideos);
  layoutObserver.observe(shell);
  const buttons = Object.fromEntries([...shell.querySelectorAll('[data-action]')].map(b => [b.dataset.action, b]));
  for (const [kind, button] of Object.entries(buttons)) { button.innerHTML = controlIcon(kind); button.title = button.getAttribute('aria-label') || 'Leave call'; }
  buttons.audio.setAttribute('aria-label', 'Choose microphone, camera and speaker');
  buttons.audio.setAttribute('aria-expanded', 'false');
  buttons.view.setAttribute('aria-expanded', 'false');
  viewPanel.querySelector('button').onclick = () => { viewPanel.hidden = true; buttons.view.setAttribute('aria-expanded', 'false'); buttons.view.focus(); };
  viewPanel.querySelector('.view-mode').onchange = e => { mode = e.target.value; render(); };
  viewPanel.querySelector('.pin-person').onchange = e => { pinned = e.target.value || null; if (pinned && mode === 'grid') mode = 'speaker'; render(); };
  buttons.view.onclick = () => { devicePanel.hidden = true; buttons.audio.setAttribute('aria-expanded', 'false'); viewPanel.hidden = !viewPanel.hidden; buttons.view.setAttribute('aria-expanded', String(!viewPanel.hidden)); if (!viewPanel.hidden) viewPanel.querySelector('button').focus(); };
  const fullDocument = window.parent === window ? document : parent.document;
  const fullStage = fullDocument.querySelector('.video-stage') || root;
  function updateFullscreen() {
    const expanded = !!fullDocument.fullscreenElement || fullStage.classList.contains('video-expanded');
    buttons.fullscreen.setAttribute('aria-pressed', String(expanded));
    buttons.fullscreen.setAttribute('aria-label', expanded ? 'Exit fullscreen video' : 'Fullscreen video');
    buttons.fullscreen.title = buttons.fullscreen.getAttribute('aria-label');
  }
  buttons.fullscreen.onclick = async () => {
    try {
      if (fullDocument.fullscreenElement) await fullDocument.exitFullscreen();
      else if (fullStage.classList.contains('video-expanded')) { fullStage.classList.remove('video-expanded'); fullDocument.body.classList.remove('video-expanded-open'); }
      else { try { await fullStage.requestFullscreen({ navigationUI: 'hide' }); } catch { fullStage.classList.add('video-expanded'); fullDocument.body.classList.add('video-expanded-open'); } }
    } catch { notice.textContent = 'Fullscreen could not be changed.'; }
    updateFullscreen();
  };
  fullDocument.addEventListener('fullscreenchange', updateFullscreen);
  const selects = [...devicePanel.querySelectorAll('select')];
  let deviceRefresh = 0;
  async function refreshDevices() {
    const version = ++deviceRefresh;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (version !== deviceRefresh) return;
      const local = call.participants().local;
      for (const select of selects) {
        const kind = select.dataset.device;
        const current = kind === 'audiooutput' ? outputId || '' : local?.tracks?.[kind === 'audioinput' ? 'audio' : 'video']?.persistentTrack?.getSettings().deviceId;
        const choices = devices.filter(d => d.kind === kind && d.deviceId);
        select.replaceChildren();
        if (kind === 'audiooutput') select.add(new Option('Default output', ''));
        choices.forEach((d, i) => select.add(new Option(d.label || `${kind === 'videoinput' ? 'Camera' : kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${i + 1}`, d.deviceId)));
        select.disabled = !choices.length || (kind === 'audiooutput' && !HTMLMediaElement.prototype.setSinkId);
        if (!select.options.length) select.add(new Option('No device available', ''));
        if ([...select.options].some(o => o.value === current)) select.value = current;
        select.dataset.applied = select.value;
      }
      const output = selects.find(s => s.dataset.device === 'audiooutput');
      devicePanel.querySelector('.device-help').textContent = output.disabled ? 'This browser does not expose speaker switching. Audio uses the connected default output.' : 'Select a connected device. Bluetooth appears here when the browser makes it available.';
    } catch (error) { devicePanel.querySelector('.device-help').textContent = error.message || 'Could not list devices.'; }
  }
  function closeDevices() { devicePanel.hidden = true; buttons.audio.setAttribute('aria-expanded', 'false'); buttons.audio.focus(); }
  devicePanel.querySelector('button').onclick = closeDevices;
  shell.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!devicePanel.hidden) closeDevices(); if (!viewPanel.hidden) viewPanel.querySelector('button').click(); if (fullStage.classList.contains('video-expanded')) { fullStage.classList.remove('video-expanded'); fullDocument.body.classList.remove('video-expanded-open'); updateFullscreen(); } } });
  for (const select of selects) select.onchange = async () => {
    const previous = select.dataset.applied || '';
    select.disabled = true;
    try {
      if (select.dataset.device === 'audiooutput') {
        const id = select.value;
        // Validate even when nobody else is in the call yet.
        const probe = document.createElement('audio'); await probe.setSinkId(id);
        await Promise.all([...audios.values()].map(audio => audio.setSinkId(id)));
        outputId = id;
      } else await call.setInputDevicesAsync({ [select.dataset.device === 'audioinput' ? 'audioDeviceId' : 'videoDeviceId']: select.value });
      select.dataset.applied = select.value;
      notice.textContent = ''; render();
    } catch (error) { select.value = previous; notice.textContent = error.message || 'Could not switch device.'; }
    finally { await refreshDevices(); }
  };
  Object.values(buttons).forEach(b => b.disabled = true);
  function attach(element, track) {
    if (element.srcObject?.getTracks()[0] === track) return;
    element.srcObject = track ? new MediaStream([track]) : null;
    if (track) element.play().catch(() => { if (element.tagName === 'AUDIO') notice.textContent = 'Tap Audio to hear the call.'; });
  }
  function render() {
    const people = Object.values(call.participants());
    if (!people.some(p => p.session_id === pinned)) pinned = null;
    shell.dataset.mode = mode;
    viewPanel.querySelector('.view-mode').value = mode;
    const pinSelect = viewPanel.querySelector('.pin-person');
    const signature = JSON.stringify(people.map(p => [p.session_id, p.user_name]));
    if (pinSelect.dataset.people !== signature) { pinSelect.replaceChildren(new Option('Automatic speaker', '')); for (const p of people) pinSelect.add(new Option(`${p.user_name || 'Guest'}${p.local ? ' (you)' : ''}`, p.session_id)); pinSelect.dataset.people = signature; }
    pinSelect.value = pinned || '';
    const ids = new Set(people.map(p => p.session_id));
    for (const p of people) if (!p.local) for (const kind of ['audio', 'screenAudio']) ids.add(`${p.session_id}:${kind}`);
    for (const [id, tile] of tiles) if (!ids.has(id)) { tile.remove(); tiles.delete(id); }
    for (const [id, audio] of audios) if (!ids.has(id)) { audio.srcObject = null; audio.remove(); audios.delete(id); }
    const shared = people.find(p => p.tracks?.screenVideo?.state === 'playable');
    const main = people.find(p => p.session_id === pinned) || shared || people.find(p => p.session_id === speaker && !p.local) || people.find(p => !p.local) || people[0];
    for (const p of people) {
      let tile = tiles.get(p.session_id);
      if (!tile) {
        tile = document.createElement('div'); tile.className = 'camera-tile';
        tile.innerHTML = '<video autoplay playsinline muted></video><span class="camera-initials" aria-hidden="true"></span><span class="camera-name"></span><button type="button" class="video-pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 7 4 4v2H6v-2l4-4zM12 16v6"/></svg></button>';
        tile.querySelector('video').onloadedmetadata = arrangeVideos;
        let nameTimer;
        tile.addEventListener('click', () => { tile.classList.add('show-name'); clearTimeout(nameTimer); nameTimer = setTimeout(() => tile.classList.remove('show-name'), 2500); });
        tile.querySelector('.video-pin').onclick = () => { pinned = pinned === p.session_id ? null : p.session_id; if (pinned && mode === 'grid') mode = 'speaker'; render(); };
        tiles.set(p.session_id, tile);
      }
      const isMain = p === main;
      const track = isMain && p === shared ? p.tracks.screenVideo.persistentTrack : p.tracks?.video?.state === 'playable' ? p.tracks.video.persistentTrack : null;
      attach(tile.querySelector('video'), track);
      tile.classList.toggle('no-camera', !track);
      tile.querySelector('.camera-initials').textContent = participantInitials(p.user_name);
      tile.classList.toggle('active-speaker', p.session_id === speaker && ['playable', 'sendable'].includes(p.tracks?.audio?.state));
      tile.classList.toggle('self-camera', !!p.local && p !== shared);
      tile.classList.toggle('pinned-camera', pinned === p.session_id);
      tile.querySelector('.camera-name').textContent = `${p.user_name || 'Guest'}${p.local ? ' (you)' : ''}${['playable', 'sendable'].includes(p.tracks?.audio?.state) ? '' : ' · muted'}`;
      const pin = tile.querySelector('.video-pin');
      pin.setAttribute('aria-label', `${pinned === p.session_id ? 'Unpin' : 'Pin'} ${p.user_name || 'Guest'} video`);
      pin.setAttribute('aria-pressed', String(pinned === p.session_id));
      pin.title = pin.getAttribute('aria-label');
      const container = mode === 'grid' || isMain ? picture : thumbnails;
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
    buttons.mic.innerHTML = controlIcon('mic', !call.localAudio());
    buttons.mic.setAttribute('aria-label', `${call.localAudio() ? 'Mute' : 'Unmute'} microphone`);
    buttons.mic.setAttribute('aria-pressed', String(!call.localAudio()));
    buttons.camera.innerHTML = controlIcon('camera', !call.localVideo());
    buttons.camera.setAttribute('aria-label', `Turn camera ${call.localVideo() ? 'off' : 'on'}`);
    buttons.mic.title = buttons.mic.getAttribute('aria-label');
    buttons.camera.title = buttons.camera.getAttribute('aria-label');
    buttons.camera.setAttribute('aria-pressed', String(!call.localVideo()));
    arrangeVideos();
  }
  async function act(button, task) {
    button.disabled = true; notice.textContent = '';
    try { await task(); render(); } catch (error) { notice.textContent = error.message || 'Could not change this device.'; }
    finally { button.disabled = call.meetingState() !== 'joined-meeting'; }
  }
  try {
    if (bootMessage) bootMessage.textContent = 'Getting Daily room…';
    const response = await fetch('/api/video-config', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || config.provider !== 'daily') throw new Error(config.error || 'Daily room is not configured.');
    call = window.Daily.createCallObject();
    if (bootMessage) bootMessage.textContent = 'Joining… Allow camera and microphone if prompted.';
    joinTimer = window.setTimeout(() => {
      if (bootMessage?.isConnected) bootMessage.textContent = 'Still connecting. Check camera permissions, then reload to try again.';
    }, 20000);
    for (const event of ['participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped']) call.on(event, render);
    call.on('active-speaker-change', e => { speaker = e.activeSpeaker?.peerId; render(); });
    const interrupted = new Set();
    function updateConnection() { connection.textContent = !navigator.onLine ? 'Offline · reconnecting…' : interrupted.size ? 'Connection interrupted · reconnecting…' : ''; }
    const offline = () => updateConnection();
    const online = () => updateConnection();
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    call.on('network-connection', e => { const key = `${e.type}:${e.session_id || e.sfu_id || ''}`; if (e.event === 'interrupted') interrupted.add(key); if (e.event === 'connected') interrupted.delete(key); updateConnection(); });
    call.on('network-quality-change', e => { if (!interrupted.size && navigator.onLine) connection.textContent = ['warning', 'bad'].includes(e.networkState) ? 'Weak connection' : ''; });
    call.on('joined-meeting', () => { interrupted.clear(); updateConnection(); showControls(); window.clearTimeout(joinTimer); bootMessage?.remove(); Object.values(buttons).forEach(b => b.disabled = false); render(); report('video-status', 'Live'); });
    call.on('error', e => { notice.textContent = e.errorMsg || 'Call connection failed.'; report('video-status', notice.textContent); });
    call.on('camera-error', () => { notice.textContent = 'Check camera and microphone permissions.'; });
    call.on('left-meeting', () => { for (const audio of audios.values()) { audio.srcObject = null; audio.remove(); } Object.values(buttons).forEach(b => b.disabled = true); picture.replaceChildren(); thumbnails.replaceChildren(); tiles.clear(); audios.clear(); connection.textContent = 'Disconnected'; notice.replaceChildren(document.createTextNode('Connection ended. ')); const retry = document.createElement('button'); retry.textContent = 'Rejoin'; retry.onclick = async () => { retry.disabled = true; connection.textContent = 'Reconnecting…'; try { await call.join({ url: config.roomUrl, userName: name }); notice.textContent = ''; } catch { connection.textContent = 'Could not reconnect'; retry.disabled = false; } }; notice.append(retry); showControls(); report('video-status', 'Disconnected'); });
    buttons.mic.onclick = () => act(buttons.mic, () => call.setLocalAudio(!call.localAudio()));
    buttons.camera.onclick = () => act(buttons.camera, () => call.setLocalVideo(!call.localVideo()));
    buttons.flip.onclick = () => act(buttons.flip, () => call.cycleCamera());
    buttons.audio.onclick = async () => {
      viewPanel.hidden = true; buttons.view.setAttribute('aria-expanded', 'false');
      for (const audio of audios.values()) audio.play().catch(() => {});
      devicePanel.hidden = !devicePanel.hidden;
      buttons.audio.setAttribute('aria-expanded', String(!devicePanel.hidden));
      if (!devicePanel.hidden) { await refreshDevices(); devicePanel.querySelector('button').focus(); }
    };
    const devicesChanged = () => { if (!devicePanel.hidden) refreshDevices(); };
    navigator.mediaDevices.addEventListener('devicechange', devicesChanged);
    window.addEventListener('pagehide', () => { clearTimeout(controlsTimer); cancelAnimationFrame(scrollFrame); window.removeEventListener('offline', offline); window.removeEventListener('online', online); layoutObserver.disconnect(); fullDocument.removeEventListener('fullscreenchange', updateFullscreen); navigator.mediaDevices.removeEventListener('devicechange', devicesChanged); call.destroy(); }, { once: true });
    await call.join({ url: config.roomUrl, userName: name });
  } catch (error) { window.clearTimeout(joinTimer); fail(error.message || 'Could not join the call.'); await call?.destroy(); }
}
