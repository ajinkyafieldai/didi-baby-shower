import { setupCelebrationLayout } from "./frontend/celebration-layout.js";
import {
  FEATURES,
  featureEnabled,
  configureFeatures,
  applyFeatureVisibility
} from "./frontend/features.js";
import {
  loadEventPackage,
  applyEventTheme,
  applyParticipantCopy
} from "./frontend/event-config.js";

const EVENT_PACKAGE = await loadEventPackage();
configureFeatures(EVENT_PACKAGE);
applyEventTheme(EVENT_PACKAGE);
applyParticipantCopy(EVENT_PACKAGE);
applyFeatureVisibility();
window.__DIDI_FEATURES__ = FEATURES;
window.__APSILA_EVENT__ = EVENT_PACKAGE;

const uiTask = window.scheduler?.postTask
  ? (callback, priority = "user-visible") => window.scheduler.postTask(callback, { priority })
  : (callback) => Promise.resolve().then(callback);

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setBusy(button, busy, label = "") {
  if (!button) return;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  button.setAttribute("aria-busy", busy ? "true" : "false");
  if (busy && label) button.textContent = label;
  if (!busy) button.textContent = button.dataset.originalLabel || button.textContent;
}

function warmLocalUi() {
  // Touch frequently used local stores after first paint so opening panels feels instant.
  uiTask(() => {
    try {
      localStorage.getItem("baby-shower-blessings-v1");
      localStorage.getItem("baby-shower-family-hub-v1");
    } catch {}
  }, "background");
}

requestAnimationFrame(() => warmLocalUi());

const stage = document.querySelector(".video-stage");
const frame = document.getElementById("video-frame");
const joinForm = document.getElementById("join-form");
const joinMessage = document.getElementById("join-message");
const statusText = document.getElementById("status-text");
const markLayer = document.getElementById("mark-layer");
const effectLayer = document.getElementById("effect-layer");
const eventLabel = document.getElementById("event-label");
const guestNameInput = document.getElementById("guest-name");
const joinButton = document.getElementById("join-button");
const callStatus = document.querySelector(".call-status");
const photoButton = document.querySelector(".photo-button");
const photoHost = new URLSearchParams(location.search).get("photoHost") === "1";
const gamePanel = document.getElementById("game-panel");
const gameContent = document.getElementById("game-content");
const gameClose = document.getElementById("game-close");
const blessingLaunch = document.getElementById("blessing-launch");
const blessingPanel = document.getElementById("blessing-panel");
const blessingClose = document.getElementById("blessing-close");
const blessingForm = document.getElementById("blessing-form");
const blessingMessage = document.getElementById("blessing-message");
const blessingCount = document.getElementById("blessing-count");
const blessingWall = document.getElementById("blessing-wall");
const blessingExport = document.getElementById("blessing-export");
const wallPhotoInput = document.getElementById("wall-photo-input");
const wallPhotoCaption = document.getElementById("wall-photo-caption");
const wallPhotoStatus = document.getElementById("wall-photo-status");
const timelineForm = document.getElementById("timeline-form");
const timelineList = document.getElementById("timeline-list");
const mapForm = document.getElementById("map-form");
const familyMap = document.getElementById("family-map");
const mapList = document.getElementById("map-list");
const capsuleForm = document.getElementById("capsule-form");
const capsuleList = document.getElementById("capsule-list");
const recipeForm = document.getElementById("recipe-form");
const recipeList = document.getElementById("recipe-list");
const photoMosaic = document.getElementById("photo-mosaic");
const guestForm = document.getElementById("guest-form");
const arrivalRibbon = document.getElementById("arrival-ribbon");
const keepsakeSummary = document.getElementById("keepsake-summary");
const afterpartyPreview = document.getElementById("afterparty-preview");
const hubTabs = Array.from(document.querySelectorAll("[data-hub-tab]"));
const hubViews = Array.from(document.querySelectorAll("[data-hub-view]"));
const afterpartyMode = new URLSearchParams(location.search).get("afterparty") === "1";

let gameState = { names: [], quiz: [] };
let activeGame = null;

const blessingStore = (() => {
  const key = "baby-shower-blessings-v1";

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(key, JSON.stringify(items.slice(-200)));
  }

  return {
    list() {
      return read().sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
    },
    add(entry) {
      const items = read();
      items.push(entry);
      write(items);
      return entry;
    },
    react(id, emoji) {
      const items = read();
      const entry = items.find((item) => item.id === id);
      if (!entry) return;

      entry.reactions = entry.reactions || {};
      entry.reactions[emoji] = Number(entry.reactions[emoji] || 0) + 1;
      write(items);
    }
  };
})();

const wallPhotoStore = (() => {
  const dbName = "didi-baby-shower-family-wall";
  const storeName = "photos";

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open photo storage."));
    });
  }

  async function transact(mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = callback(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Photo storage failed."));
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Photo storage failed."));
      };
    });
  }

  return {
    put(id, blob) {
      return transact("readwrite", (store) => store.put(blob, id));
    },
    get(id) {
      return transact("readonly", (store) => store.get(id));
    }
  };
})();

const familyStore = (() => {
  const key = "baby-shower-family-hub-v1";

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return {
        timeline: Array.isArray(value.timeline) ? value.timeline : [],
        pins: Array.isArray(value.pins) ? value.pins : [],
        capsules: Array.isArray(value.capsules) ? value.capsules : [],
        recipes: Array.isArray(value.recipes) ? value.recipes : [],
        guests: Array.isArray(value.guests) ? value.guests : []
      };
    } catch {
      return { timeline: [], pins: [], capsules: [], recipes: [], guests: [] };
    }
  }

  function write(value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function add(type, entry) {
    const value = read();
    value[type].push(entry);
    write(value);
    return entry;
  }

  return { read, write, add };
})();

const cityCoordinates = {
  "mumbai": [72.8777, 19.0760],
  "bombay": [72.8777, 19.0760],
  "pune": [73.8567, 18.5204],
  "delhi": [77.1025, 28.7041],
  "new delhi": [77.2090, 28.6139],
  "bengaluru": [77.5946, 12.9716],
  "bangalore": [77.5946, 12.9716],
  "hyderabad": [78.4867, 17.3850],
  "chennai": [80.2707, 13.0827],
  "kolkata": [88.3639, 22.5726],
  "ahmedabad": [72.5714, 23.0225],
  "vadodara": [73.1812, 22.3072],
  "london": [-0.1276, 51.5072],
  "new york": [-74.0060, 40.7128],
  "san francisco": [-122.4194, 37.7749],
  "los angeles": [-118.2437, 34.0522],
  "toronto": [-79.3832, 43.6532],
  "vancouver": [-123.1207, 49.2827],
  "singapore": [103.8198, 1.3521],
  "dubai": [55.2708, 25.2048],
  "sydney": [151.2093, -33.8688],
  "melbourne": [144.9631, -37.8136],
  "paris": [2.3522, 48.8566],
  "berlin": [13.4050, 52.5200]
};

let guestName = "";
let coarseLocation = null;
const locationReady = (featureEnabled("familyMap") || featureEnabled("guestRibbon"))
  ? fetch("/api/location", { cache: "no-store" }).then(async response => {
      if (!response.ok) return null;
      const value = await response.json();
      if (typeof value.city !== "string") return null;
      coarseLocation = value;
      fillLocationForms();
      return value;
    }).catch(() => null)
  : Promise.resolve(null);

function fillLocationForms() {
  for (const form of [mapForm, guestForm]) {
    if (!form.elements.name.value) form.elements.name.value = guestName || guestNameInput.value.trim();
    if (!form.elements.city.value && coarseLocation?.city) form.elements.city.value = coarseLocation.city;
  }
}

function coordinatesForCity(city) {
  if (coarseLocation?.city && city.trim().toLowerCase() === coarseLocation.city.toLowerCase()) {
    return coarseLocation.coords || lookupCity(city);
  }
  return lookupCity(city);
}

let effectTimer = null;
let groupEffectTimer = null;
let audioContext = null;
let photoCaptureStream = null;

function showPhotoButton() {
  if (!featureEnabled("familyPhoto") || !photoButton) return;
  photoButton.classList.add("is-peeking");
  photoButton.setAttribute("aria-hidden", "false");
  photoButton.style.left = "auto";
  photoButton.style.top = "auto";
  photoButton.style.right = "14px";
  photoButton.style.bottom = "14px";
}

async function saveFamilyPhotoBlob(blob) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `baby-shower-${stamp}.jpg`;

  const localUrl = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = localUrl;
  download.download = filename;
  download.style.display = "none";
  document.body.appendChild(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(localUrl), 1000);

  const response = await fetch("/api/photos", {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      "X-Photo-Name": filename
    },
    body: blob
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Cloud photo save failed" + (detail ? ": " + detail : ""));
  }

  return response.json();
}

async function ensurePhotoCapture() {
  if (
    photoCaptureStream &&
    photoCaptureStream.getVideoTracks().some((track) => track.readyState === "live")
  ) {
    return photoCaptureStream;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error("This browser cannot capture the family photo.");
  }

  // Prefer capturing this tab on Chromium. If a browser rejects these
  // optional hints, retry with the standards-only request.
  try {
    photoCaptureStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser" },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "include"
    });
  } catch (error) {
    if (error && error.name === "TypeError") {
      photoCaptureStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
    } else {
      throw error;
    }
  }

  const [track] = photoCaptureStream.getVideoTracks();
  if (track) {
    track.addEventListener("ended", () => {
      photoCaptureStream = null;
    }, { once: true });
  }

  return photoCaptureStream;
}

async function captureFamilyPhoto() {
  const stream = photoCaptureStream;
  const track = stream && stream.getVideoTracks()[0];

  if (!track || track.readyState !== "live") {
    throw new Error("Photo capture is no longer active.");
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Could not read the captured tab."));
  });
  await video.play();

  const rect = stage.getBoundingClientRect();
  const scaleX = video.videoWidth / window.innerWidth;
  const scaleY = video.videoHeight / window.innerHeight;
  const sx = Math.max(0, Math.round(rect.left * scaleX));
  const sy = Math.max(0, Math.round(rect.top * scaleY));
  const sw = Math.min(video.videoWidth - sx, Math.max(1, Math.round(rect.width * scaleX)));
  const sh = Math.min(video.videoHeight - sy, Math.max(1, Math.round(rect.height * scaleY)));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  video.pause();
  video.srcObject = null;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Could not create the family photo.");

  return saveFamilyPhotoBlob(blob);
}

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function playChime(kind = "ritual") {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== "running") return;

  const now = ctx.currentTime;
  const notes = kind === "photo"
    ? [659.25, 783.99, 987.77]
    : [523.25, 659.25];

  notes.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);

    const start = now + index * 0.095;
    const end = start + 0.42;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === "photo" ? 0.055 : 0.035, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });
}

const participantId = (() => {
  const key = "baby-shower-participant-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
})();

let latestRenderLatencyMs = null;

async function sendTelemetry() {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "telemetry",
        clientId: participantId,
        role: "guest",
        latencyMs: latestRenderLatencyMs,
        lastEventSeq,
        visible: document.visibilityState === "visible"
      }),
      cache: "no-store"
    });
  } catch (error) {
    console.debug("Telemetry heartbeat failed", error);
  }
}

function updateJoinButtonState() {
  joinButton.disabled = !guestNameInput.value.trim();
}

guestNameInput.addEventListener("input", updateJoinButtonState);
updateJoinButtonState();

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ensureAudioContext();

  const formData = new FormData(joinForm);
  guestName = String(formData.get("guestName") || "").trim();

  if (!guestName) {
    joinMessage.textContent = "Please enter your name.";
    return;
  }

  joinButton.disabled = true;
  joinButton.textContent = "Joining…";
  joinMessage.textContent = "Your browser may ask for camera and microphone permission.";
  statusText.textContent = "Connecting to video call…";

  frame.src = `/daily.html?name=${encodeURIComponent(guestName)}`;
  stage.classList.add("in-call");
  fillLocationForms();
  if (featureEnabled("guestRibbon")) {
    recordArrival(guestName, coarseLocation?.city || "", coarseLocation?.coords);
    locationReady.then(location => {
      const arrival = familyStore.read().guests.find(guest => guest.name === guestName);
      if (location && !arrival?.city) recordArrival(guestName, location.city, location.coords);
      fillLocationForms();
      renderGuests();
      if (activeHubView === "map") renderMap();
    });
  }
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;

  const message = event.data || {};

  if (message.type === "video-status") {
    statusText.textContent = message.text || "Video call";
    callStatus.classList.toggle("compact", message.text === "Live");
    if (message.text === "Live") {
      showPhotoButton();
    }
  }

  if (message.type === "video-config-error") {
    stage.classList.remove("in-call");
    joinMessage.textContent = message.text || "Video call is not configured yet.";
    statusText.textContent = "Video setup needed";
    callStatus.classList.remove("compact");
  }
});

let lastEventSeq = 0;
let eventsInitialized = false;
let syncTimer = null;
let syncBusy = false;
let lastPollCompletedAt = Date.now();
let resyncOnNextPoll = false;
const RESUME_GAP_MS = 5000;
const MAX_EFFECT_AGE_MS = 4000;

function photoAssetUrl(asset) {
  return "/api/photos?key=" + encodeURIComponent(asset);
}

function showCapturedPhoto(asset) {
  if (!asset) return;

  let overlay = document.getElementById("shared-photo-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "shared-photo-overlay";
    overlay.className = "shared-photo-overlay";

    const image = document.createElement("img");
    image.alt = "Latest family photo";
    overlay.appendChild(image);
    document.body.appendChild(overlay);
  }

  const image = overlay.querySelector("img");
  image.src = photoAssetUrl(asset);
  overlay.classList.remove("visible");
  void overlay.offsetWidth;
  overlay.classList.add("visible");

  window.clearTimeout(overlay._hideTimer);
  overlay._hideTimer = window.setTimeout(() => {
    overlay.classList.remove("visible");
  }, 5000);
}

async function pollEvents() {
  if (syncBusy) return;
  syncBusy = true;

  try {
    const response = await fetch(`/api/events?since=${lastEventSeq}`, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error("HTTP " + response.status + (errorText ? ": " + errorText : ""));
    }

    const data = await response.json();
    const now = Date.now();
    const resumedAfterGap = now - lastPollCompletedAt > RESUME_GAP_MS;
    const shouldResync = resyncOnNextPoll || resumedAfterGap;

    if (data.games) {
      const previous = JSON.stringify(gameState);
      gameState = data.games;
      if (activeGame && JSON.stringify(gameState) !== previous) renderGame(activeGame);
    }

    if (!eventsInitialized || shouldResync) {
      if (typeof data.seq === "number") {
        lastEventSeq = data.seq;
      }
      eventsInitialized = true;
      resyncOnNextPoll = false;
    } else {
      const events = Array.isArray(data.events)
        ? data.events
        : (data.event ? [data.event] : []);

      events
        .filter((event) =>
          event &&
          event.type === "command" &&
          event.command === "photo.show" &&
          event.asset &&
          Number(event.seq || 0) > lastEventSeq &&
          now - Number(event.at || 0) <= MAX_EFFECT_AGE_MS
        )
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .forEach((event) => {
          latestRenderLatencyMs = Math.max(0, Date.now() - Number(event.at || Date.now()));
          showCapturedPhoto(event.asset);
        });

      events
        .filter((event) =>
          event &&
          event.type === "effect" &&
          Number(event.seq || 0) > lastEventSeq &&
          now - Number(event.at || 0) <= MAX_EFFECT_AGE_MS
        )
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .forEach((event, index) => {
          window.setTimeout(() => {
            latestRenderLatencyMs = Math.max(0, Date.now() - Number(event.at || Date.now()));
            playEffect(event.effect, event.sender || "Someone", event.effect === "photo" && photoHost);
            if (event.groupCelebration) {
              playGroupCelebration(event.effect, event.groupCount || 2, Boolean(event.groupBurst));
            }
          }, index * 450);
        });

      if (typeof data.seq === "number") {
        lastEventSeq = Math.max(lastEventSeq, data.seq);
      }
    }

    if (!stage.classList.contains("in-call")) {
      statusText.textContent = "Ready to join";
    }
  } catch (error) {
    console.error("Celebration sync poll failed", error);
    callStatus.classList.remove("compact");
    statusText.textContent = "Celebration sync offline (" + (error.message || "error") + ")";
  } finally {
    lastPollCompletedAt = Date.now();
    syncBusy = false;
  }
}

async function sendEffect(effect) {
  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "effect",
        effect,
        sender: guestName || "Someone",
        senderId: participantId
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error("HTTP " + response.status + (errorText ? ": " + errorText : ""));
    }

    const data = await response.json();

    if (typeof data.seq === "number") {
      lastEventSeq = Math.max(lastEventSeq, data.seq);
    }

    playEffect(effect, guestName || "Someone", effect === "photo" && photoHost);
    if (data.event && data.event.groupCelebration) {
      playGroupCelebration(
        data.event.effect,
        data.event.groupCount || 2,
        Boolean(data.event.groupBurst)
      );
    }
  } catch (error) {
    console.error("Celebration sync send failed", error);
    statusText.textContent = "Celebration sync offline (" + (error.message || "error") + ")";
    playEffect(effect, guestName || "Someone", effect === "photo" && photoHost);
  }
}

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    ensureAudioContext();

    const effect = button.dataset.effect;
    button.disabled = true;
    button.classList.remove("is-sent");
    void button.offsetWidth;
    button.classList.add("is-sent");

    sendEffect(effect);

    window.setTimeout(() => {
      button.disabled = false;
      button.classList.remove("is-sent");
      if (effect === "photo") {
        showPhotoButton();
      }
    }, effect === "photo" ? 4200 : 700);
  });
});

const didiQuestions = [
  "What is Didi's comfort food?",
  "What phrase does Didi say all the time?",
  "Where would Didi pick for a surprise holiday?",
  "What always makes Didi laugh?"
];

async function sendGame(body) {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      sender: guestName || "Someone",
      senderId: participantId
    }),
    cache: "no-store"
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Game update failed");
  if (data.games) gameState = data.games;
  if (activeGame) renderGame(activeGame);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderGame(game) {
  if (game === "names" && !featureEnabled("babyNames")) return;
  if (game === "didi" && !featureEnabled("didiQuiz")) return;
  activeGame = game;
  gamePanel.hidden = false;

  if (game === "names") {
    const names = Array.isArray(gameState.names) ? gameState.names : [];
    const rows = names.length
      ? names.map((entry) => {
          const voted = Array.isArray(entry.voters) && entry.voters.includes(participantId);
          return `
            <button class="name-vote ${voted ? "voted" : ""}" type="button" data-name-id="${entry.id}">
              <span>${escapeHtml(entry.name)}</span>
              <strong>♡ ${entry.voters?.length || 0}</strong>
            </button>`;
        }).join("")
      : '<p class="game-empty">No suggestions yet. Be first 👀</p>';

    gameContent.innerHTML = `
      <h2 id="game-title">👶 Baby Name Poll</h2>
      <p class="game-subtitle">Suggest a name or vote for your favourites.</p>
      <form id="name-form" class="game-form">
        <input name="babyName" maxlength="40" placeholder="Type a baby name…" required>
        <button type="submit">Add + vote</button>
      </form>
      <div class="name-list">${rows}</div>`;

    document.getElementById("name-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.babyName;
      const name = input.value.trim();
      if (!name) return;
      const submit = event.currentTarget.querySelector("button");
      input.disabled = true;
      setBusy(submit, true, "Adding…");
      try {
        await sendGame({ type: "name_suggestion", name });
      } catch (error) {
        input.disabled = false;
        setBusy(submit, false);
        eventLabel.textContent = error.message;
        eventLabel.classList.add("visible");
      }
    });

    gameContent.querySelectorAll("[data-name-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await sendGame({ type: "name_vote", id: button.dataset.nameId });
        } catch (error) {
          button.disabled = false;
        }
      });
    });
    return;
  }

  const existing = Array.isArray(gameState.quiz)
    ? gameState.quiz.find((entry) => entry.senderId === participantId)
    : null;

  if (existing) {
    gameContent.innerHTML = `
      <h2 id="game-title">🏆 Who Knows Didi Best?</h2>
      <div class="quiz-done">Answers locked 🔒</div>
      <p class="game-subtitle">Didi gets to judge. ${gameState.quiz.length} people have played.</p>
      <div class="quiz-review">
        ${didiQuestions.map((question, index) => `
          <div><small>${escapeHtml(question)}</small><strong>${escapeHtml(existing.answers[index])}</strong></div>
        `).join("")}
      </div>`;
    return;
  }

  gameContent.innerHTML = `
    <h2 id="game-title">🏆 Who Knows Didi Best?</h2>
    <p class="game-subtitle">No cheating. Didi judges the answers 😄</p>
    <form id="didi-form" class="quiz-form">
      ${didiQuestions.map((question, index) => `
        <label>
          <span>${escapeHtml(question)}</span>
          <input name="q${index}" maxlength="100" required>
        </label>
      `).join("")}
      <button type="submit">Lock my answers</button>
    </form>
    <p class="quiz-count">${gameState.quiz.length} people have played.</p>`;

  document.getElementById("didi-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const answers = didiQuestions.map((_, index) => event.currentTarget.elements[`q${index}`].value.trim());
    if (answers.some((value) => !value)) return;
    const submit = event.currentTarget.querySelector("button");
    setBusy(submit, true, "Locking…");
    try {
      await sendGame({ type: "quiz_submit", answers });
      playChime("photo");
    } catch (error) {
      setBusy(submit, false);
      eventLabel.textContent = error.message;
      eventLabel.classList.add("visible");
    }
  });
}



let activeHubView = "wall";
let timelineObjectUrls = [];
let recipeObjectUrls = [];
let mosaicObjectUrls = [];

function safeGuestName() {
  return guestName || guestNameInput.value.trim() || "Someone";
}

function switchHubView(view) {
  const featureForView = {
    wall: "familyWall",
    timeline: "familyTimeline",
    map: "familyMap",
    capsule: "timeCapsule",
    recipes: "recipeBook",
    mosaic: "photoMosaic",
    guests: "guestRibbon",
    keepsake: "keepsake"
  }[view];

  if (featureForView && !featureEnabled(featureForView)) {
    const fallback = [
      ["wall", "familyWall"],
      ["timeline", "familyTimeline"],
      ["map", "familyMap"],
      ["capsule", "timeCapsule"],
      ["recipes", "recipeBook"],
      ["mosaic", "photoMosaic"],
      ["guests", "guestRibbon"],
      ["keepsake", "keepsake"]
    ].find(([, feature]) => featureEnabled(feature));

    if (!fallback) return;
    view = fallback[0];
  }

  activeHubView = view;
  hubTabs.forEach((button) => {
    const active = button.dataset.hubTab === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  hubViews.forEach((section) => {
    const active = section.dataset.hubView === view;
    section.classList.toggle("active", active);
    section.hidden = !active;
  });

  // Let the selected tab paint first; load images/content right after.
  requestAnimationFrame(() => renderHubView(view));
}

function worldPoint(lon, lat) {
  const x = ((Number(lon) + 180) / 360) * 100;
  const y = ((90 - Number(lat)) / 180) * 100;
  return [x, y];
}

function lookupCity(city) {
  return cityCoordinates[String(city || "").trim().toLowerCase()] || null;
}

function recordArrival(name, city, suppliedCoords = null) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  const data = familyStore.read();
  const recent = data.guests.find((guest) =>
    guest.name.toLowerCase() === cleanName.toLowerCase() &&
    Date.now() - Number(guest.at || 0) < 12 * 60 * 60 * 1000
  );

  if (recent) {
    if (city) {
      recent.city = String(city).trim().slice(0, 60);
      const coords = suppliedCoords || coordinatesForCity(recent.city);
      if (coords) recent.coords = coords;
      else delete recent.coords;
      familyStore.write(data);
    }
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    name: cleanName.slice(0, 60),
    city: String(city || "").trim().slice(0, 60),
    at: Date.now()
  };
  const coords = suppliedCoords || coordinatesForCity(entry.city);
  if (coords) entry.coords = coords;
  familyStore.add("guests", entry);
}

async function storeOptionalPhoto(file) {
  if (!file || !file.size) return null;
  const blob = await compressWallPhoto(file);
  const photoId = crypto.randomUUID();
  await wallPhotoStore.put(photoId, blob);
  return photoId;
}

async function renderTimeline() {
  timelineObjectUrls.forEach(URL.revokeObjectURL);
  timelineObjectUrls = [];
  const items = familyStore.read().timeline.slice().reverse();

  if (!items.length) {
    timelineList.innerHTML = '<p class="hub-empty">No timeline memories yet. Start with a childhood one ✨</p>';
    return;
  }

  const rows = [];
  for (const item of items) {
    let photo = "";
    if (item.photoId) {
      try {
        const blob = await wallPhotoStore.get(item.photoId);
        if (blob) {
          const url = URL.createObjectURL(blob);
          timelineObjectUrls.push(url);
          photo = `<img src="${url}" alt="">`;
        }
      } catch {}
    }
    rows.push(`
      <article class="timeline-item">
        <div class="timeline-when">${escapeHtml(item.when)}</div>
        <div class="timeline-card">
          ${photo}
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.story)}</p>
          <small>— ${escapeHtml(item.sender)}</small>
        </div>
      </article>
    `);
  }
  timelineList.innerHTML = rows.join("");
}

let mapRenderVersion = 0;
async function renderMap() {
  const version = ++mapRenderVersion;
  fillLocationForms();
  const data = familyStore.read();
  const combined = [...data.pins];
  data.guests.forEach(guest => {
    if (!combined.some(pin => pin.name === guest.name && pin.city === guest.city)) combined.push(guest);
  });
  const people = combined.map(person => ({ ...person, coords: person.coords || lookupCity(person.city) }));
  mapList.innerHTML = people.length
    ? people.map(person => `<span>📍 <strong>${escapeHtml(person.name)}</strong> · ${escapeHtml(person.city || "Location unavailable")}</span>`).join("")
    : '<p class="hub-empty">Family locations appear here when you join.</p>';
  try {
    const { renderFamilyMap } = await import("./frontend/family-map.js");
    if (version !== mapRenderVersion) return;
    renderFamilyMap(familyMap, people);
  } catch {
    familyMap.textContent = "Map could not load. Family locations are listed below.";
  }
  if (people.some(person => !person.coords)) {
    const hint = document.createElement("p");
    hint.className = "map-hint";
    hint.textContent = "Guests without map coordinates stay in the list.";
    mapList.append(hint);
  }
}

function renderCapsules() {
  const items = familyStore.read().capsules.slice().reverse();
  capsuleList.innerHTML = items.length
    ? items.map((item) => `
      <article class="capsule-card">
        <div class="capsule-seal">🔒</div>
        <div>
          <small>Open at age ${escapeHtml(item.openAt)}</small>
          <strong>${escapeHtml(item.title || "A message from the family")}</strong>
          <span>Sealed by ${escapeHtml(item.sender)}</span>
        </div>
      </article>
    `).join("")
    : '<p class="hub-empty">No sealed messages yet.</p>';
}

async function renderRecipes() {
  recipeObjectUrls.forEach(URL.revokeObjectURL);
  recipeObjectUrls = [];
  const items = familyStore.read().recipes.slice().reverse();
  if (!items.length) {
    recipeList.innerHTML = '<p class="hub-empty">No recipes yet. Someone has to preserve the family food lore 🍲</p>';
    return;
  }

  const rows = [];
  for (const item of items) {
    let photo = "";
    if (item.photoId) {
      try {
        const blob = await wallPhotoStore.get(item.photoId);
        if (blob) {
          const url = URL.createObjectURL(blob);
          recipeObjectUrls.push(url);
          photo = `<img src="${url}" alt="">`;
        }
      } catch {}
    }

    rows.push(`
      <article class="recipe-card">
        ${photo}
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          ${item.why ? `<p class="recipe-why">${escapeHtml(item.why)}</p>` : ""}
          <details>
            <summary>Recipe</summary>
            <pre>${escapeHtml(item.recipe)}</pre>
          </details>
          <small>— ${escapeHtml(item.sender)}</small>
        </div>
      </article>
    `);
  }
  recipeList.innerHTML = rows.join("");
}

async function renderMosaic() {
  mosaicObjectUrls.forEach(URL.revokeObjectURL);
  mosaicObjectUrls = [];
  const photos = blessingStore.list().filter((item) => item.kind === "photo" && item.photoId);

  if (!photos.length) {
    photoMosaic.innerHTML = '<p class="hub-empty">Share photos on the Family Wall and they will build the mosaic here.</p>';
    return;
  }

  const tiles = [];
  for (const item of photos.slice(0, 40)) {
    try {
      const blob = await wallPhotoStore.get(item.photoId);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      mosaicObjectUrls.push(url);
      tiles.push(`<figure><img src="${url}" alt="${escapeHtml(item.caption || "Family photo")}"><figcaption>${escapeHtml(item.caption || item.sender || "")}</figcaption></figure>`);
    } catch {}
  }
  photoMosaic.innerHTML = tiles.join("") || '<p class="hub-empty">No photos available on this device.</p>';
}

function renderGuests() {
  const items = familyStore.read().guests.slice().reverse();
  arrivalRibbon.innerHTML = items.length
    ? items.map((item, index) => `
      <article class="arrival-card">
        <span class="arrival-number">${items.length - index}</span>
        <div>
          <strong>👋 ${escapeHtml(item.name)}</strong>
          <small>${item.city ? "joined from " + escapeHtml(item.city) : "was here"} · ${new Date(item.at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</small>
        </div>
      </article>
    `).join("")
    : '<p class="hub-empty">No arrivals recorded yet.</p>';
}

function renderKeepsakeSummary() {
  const hub = familyStore.read();
  const wall = blessingStore.list();
  const photoCount = wall.filter((item) => item.kind === "photo").length;
  const noteCount = wall.filter((item) => item.kind !== "photo").length;

  keepsakeSummary.innerHTML = `
    <div class="keepsake-hero">
      <span>✨</span>
      <div><h3>Didi's Baby Shower</h3><p>The day, collected by everyone who was there.</p></div>
    </div>
    <div class="keepsake-stats">
      <div><strong>${noteCount}</strong><span>notes</span></div>
      <div><strong>${photoCount}</strong><span>photos</span></div>
      <div><strong>${hub.timeline.length}</strong><span>memories</span></div>
      <div><strong>${hub.capsules.length}</strong><span>time capsules</span></div>
      <div><strong>${hub.recipes.length}</strong><span>recipes</span></div>
      <div><strong>${hub.guests.length}</strong><span>people here</span></div>
    </div>
    <div class="keepsake-callout">
      <strong>After the party</strong>
      <p>Use the afterparty link to turn this site into a quiet keepsake instead of a live call.</p>
      <code>${escapeHtml(location.origin + location.pathname + "?afterparty=1")}</code>
    </div>
  `;
}

function renderHubView(view) {
  if (!featureEnabled("familyHub")) return;
  if (view === "wall" && featureEnabled("familyWall")) renderBlessings();
  if (view === "timeline" && featureEnabled("familyTimeline")) renderTimeline();
  if (view === "map" && featureEnabled("familyMap")) {
    renderMap();
    if (featureEnabled("guestRibbon")) renderGuests();
  }
  if (view === "capsule" && featureEnabled("timeCapsule")) renderCapsules();
  if (view === "recipes" && featureEnabled("recipeBook")) renderRecipes();
  if (view === "mosaic" && featureEnabled("photoMosaic")) renderMosaic();
  if (view === "guests" && featureEnabled("guestRibbon")) renderGuests();
  if (view === "keepsake" && featureEnabled("keepsake")) renderKeepsakeSummary();
}

hubTabs.forEach((button) => {
  button.addEventListener("click", () => switchHubView(button.dataset.hubTab));
});

timelineForm.addEventListener("submit", async (event) => {
  if (!featureEnabled("familyTimeline")) return;
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const photoId = await storeOptionalPhoto(event.currentTarget.elements.photo.files[0]);
  familyStore.add("timeline", {
    id: crypto.randomUUID(),
    when: String(data.get("when") || "").trim().slice(0, 20),
    title: String(data.get("title") || "").trim().slice(0, 70),
    story: String(data.get("story") || "").trim().slice(0, 280),
    photoId,
    sender: safeGuestName(),
    at: Date.now()
  });
  event.currentTarget.reset();
  setBusy(submit, false);
  playChime("photo");
  renderTimeline();
});

mapForm.addEventListener("submit", (event) => {
  if (!featureEnabled("familyMap")) return;
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  const city = String(data.get("city") || "").trim();
  const entry = { id: crypto.randomUUID(), name, city, at: Date.now() };
  const coords = coordinatesForCity(city);
  if (coords) entry.coords = coords;
  familyStore.add("pins", entry);
  recordArrival(name, city, coords);
  fillLocationForms();
  playChime();
  renderMap();
  renderGuests();
});

capsuleForm.addEventListener("submit", (event) => {
  if (!featureEnabled("timeCapsule")) return;
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  familyStore.add("capsules", {
    id: crypto.randomUUID(),
    openAt: String(data.get("openAt") || "18"),
    title: String(data.get("title") || "").trim().slice(0, 60),
    message: String(data.get("message") || "").trim().slice(0, 500),
    sender: safeGuestName(),
    at: Date.now()
  });
  event.currentTarget.reset();
  playChime("photo");
  renderCapsules();
});

recipeForm.addEventListener("submit", async (event) => {
  if (!featureEnabled("recipeBook")) return;
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const photoId = await storeOptionalPhoto(event.currentTarget.elements.photo.files[0]);
  familyStore.add("recipes", {
    id: crypto.randomUUID(),
    name: String(data.get("name") || "").trim().slice(0, 80),
    why: String(data.get("why") || "").trim().slice(0, 180),
    recipe: String(data.get("recipe") || "").trim().slice(0, 900),
    photoId,
    sender: safeGuestName(),
    at: Date.now()
  });
  event.currentTarget.reset();
  setBusy(submit, false);
  playChime("photo");
  renderRecipes();
});

guestForm.addEventListener("submit", (event) => {
  if (!featureEnabled("guestRibbon")) return;
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const city = String(data.get("city") || "").trim();
  recordArrival(String(data.get("name") || "").trim(), city, coordinatesForCity(city));
  event.currentTarget.reset();
  fillLocationForms();
  playChime();
  renderGuests();
  if (activeHubView === "map") renderMap();
});

afterpartyPreview.addEventListener("click", () => {
  const url = new URL(location.href);
  url.searchParams.set("afterparty", "1");
  location.href = url.toString();
});

let wallObjectUrls = [];

function clearWallObjectUrls() {
  wallObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  wallObjectUrls = [];
}

async function renderBlessings() {
  const items = blessingStore.list();
  clearWallObjectUrls();

  if (!items.length) {
    blessingWall.innerHTML = '<p class="blessing-empty">The family wall is waiting for its first note or photo ✨</p>';
    return;
  }

  const rows = await Promise.all(items.map(async (item) => {
    const reactions = item.reactions || {};

    if (item.kind === "photo" && item.photoId) {
      let imageHtml = '<div class="wall-photo-missing">Photo unavailable on this device</div>';
      try {
        const blob = await wallPhotoStore.get(item.photoId);
        if (blob) {
          const url = URL.createObjectURL(blob);
          wallObjectUrls.push(url);
          imageHtml = `<img class="wall-photo" src="${url}" alt="${escapeHtml(item.caption || "Shared family photo")}">`;
        }
      } catch (error) {
        console.warn("Could not load wall photo", error);
      }

      return `
        <article class="blessing-note wall-photo-note" data-blessing-id="${escapeHtml(item.id)}">
          ${imageHtml}
          ${item.caption ? `<p class="wall-photo-caption">${escapeHtml(item.caption)}</p>` : ""}
          <footer>
            <strong>📷 ${escapeHtml(item.sender || "Someone")}</strong>
            <div class="blessing-reactions">
              ${["❤️","🥹","😂"].map((emoji) => `
                <button type="button" data-blessing-react="${emoji}">
                  <span>${emoji}</span>
                  <small>${Number(reactions[emoji] || 0) || ""}</small>
                </button>
              `).join("")}
            </div>
          </footer>
        </article>
      `;
    }

    const forWhom = item.audience === "didi" ? "For Didi" : "For the baby";
    return `
      <article class="blessing-note" data-blessing-id="${escapeHtml(item.id)}">
        <div class="blessing-note-top">
          <span>${item.audience === "didi" ? "🌸" : "👶"} ${forWhom}</span>
          <time>${new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
        <p>${escapeHtml(item.message || "")}</p>
        <footer>
          <strong>— ${escapeHtml(item.sender || "Someone")}</strong>
          <div class="blessing-reactions">
            ${["❤️","🥹","😂"].map((emoji) => `
              <button type="button" data-blessing-react="${emoji}">
                <span>${emoji}</span>
                <small>${Number(reactions[emoji] || 0) || ""}</small>
              </button>
            `).join("")}
          </div>
        </footer>
      </article>
    `;
  }));

  blessingWall.innerHTML = rows.join("");

  blessingWall.querySelectorAll("[data-blessing-react]").forEach((button) => {
    button.addEventListener("click", () => {
      const note = button.closest("[data-blessing-id]");
      if (!note) return;
      blessingStore.react(note.dataset.blessingId, button.dataset.blessingReact);
      renderBlessings();
      playChime();
    });
  });
}

function showBlessingFloat(entry) {
  const note = document.createElement("div");
  note.className = "blessing-float";
  note.innerHTML = `
    <span>${entry.kind === "photo" ? "📷" : (entry.audience === "didi" ? "🌸" : "👶")}</span>
    <div>
      <strong>${escapeHtml(entry.sender || "Someone")}</strong>
      <p>${escapeHtml(entry.kind === "photo" ? (entry.caption || "shared a photo") : entry.message)}</p>
    </div>
  `;
  effectLayer.appendChild(note);
  window.setTimeout(() => note.remove(), 5200);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read photo."));
    reader.readAsDataURL(blob);
  });
}

async function compressWallPhoto(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Choose an image.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = sourceUrl;
    await image.decode();

    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) throw new Error("Could not prepare photo.");
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function exportBlessingsKeepsake() {
  blessingExport.disabled = true;
  blessingExport.textContent = "Preparing…";

  try {
    const items = blessingStore.list().slice().reverse();
    const rows = [];

    for (const item of items) {
      if (item.kind === "photo" && item.photoId) {
        let photoHtml = "";
        try {
          const blob = await wallPhotoStore.get(item.photoId);
          if (blob) {
            const dataUrl = await blobToDataUrl(blob);
            photoHtml = `<img src="${dataUrl}" alt="${escapeHtml(item.caption || "Family photo")}">`;
          }
        } catch (error) {
          console.warn("Could not export wall photo", error);
        }

        rows.push(`
          <article>
            <div class="meta">Family photo · ${new Date(item.at).toLocaleString()}</div>
            ${photoHtml}
            ${item.caption ? `<blockquote>${escapeHtml(item.caption)}</blockquote>` : ""}
            <div class="from">— ${escapeHtml(item.sender || "Someone")}</div>
          </article>
        `);
        continue;
      }

      const title = item.audience === "didi" ? "For Didi" : "For the baby";
      rows.push(`
        <article>
          <div class="meta">${title} · ${new Date(item.at).toLocaleString()}</div>
          <blockquote>${escapeHtml(item.message || "")}</blockquote>
          <div class="from">— ${escapeHtml(item.sender || "Someone")}</div>
        </article>
      `);
    }

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Didi's Baby Shower — Family Wall</title>
<style>
  body{font-family:Georgia,serif;margin:0;padding:48px;background:#fffaf7;color:#422f35}
  main{max-width:820px;margin:auto}
  h1{font-size:42px;margin:0 0 8px}
  .sub{color:#7a6970;margin-bottom:36px}
  article{break-inside:avoid;margin:0 0 18px;padding:22px;border:1px solid #eadfdc;border-radius:18px;background:white}
  article img{display:block;width:100%;max-height:620px;object-fit:contain;border-radius:14px;margin:10px 0}
  .meta{font:700 12px system-ui;color:#a94762;text-transform:uppercase;letter-spacing:.06em}
  blockquote{margin:12px 0;font-size:22px;line-height:1.45}
  .from{text-align:right;font-weight:700}
  @media print{body{padding:0}article{box-shadow:none}}
</style>
</head>
<body><main>
<h1>Didi's Baby Shower</h1>
<p class="sub">Family Wall — notes, memories and photos 💛</p>
${rows.join("") || "<p>The wall is empty.</p>"}
</main></body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "didi-baby-shower-family-wall.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    blessingExport.disabled = false;
    blessingExport.textContent = "Export keepsake";
  }
}

blessingLaunch.addEventListener("click", () => {
  if (!featureEnabled("familyHub")) return;
  ensureAudioContext();
  blessingPanel.hidden = false;
  if (!afterpartyMode) blessingPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  blessingPanel.classList.add("opening");
  requestAnimationFrame(() => {
    blessingPanel.classList.remove("opening");
    switchHubView(activeHubView);
    if (activeHubView === "wall") blessingMessage.focus({ preventScroll: true });
  });
});

blessingClose.addEventListener("click", () => {
  blessingPanel.hidden = true;
});

blessingPanel.addEventListener("click", (event) => {
  if (afterpartyMode && event.target === blessingPanel) blessingPanel.hidden = true;
});

blessingMessage.addEventListener("input", () => {
  blessingCount.textContent = `${blessingMessage.value.length}/180`;
});

blessingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!featureEnabled("familyWall")) return;
  const data = new FormData(blessingForm);
  const message = String(data.get("message") || "").trim();
  if (!message) return;

  const entry = {
    id: crypto.randomUUID(),
    kind: "note",
    sender: guestName || guestNameInput.value.trim() || "Someone",
    audience: data.get("audience") === "didi" ? "didi" : "baby",
    message,
    at: Date.now(),
    reactions: {}
  };

  blessingStore.add(entry);
  blessingForm.reset();
  blessingMessage.value = "";
  blessingCount.textContent = "0/180";
  showBlessingFloat(entry);
  playChime("photo");
  requestAnimationFrame(() => renderBlessings());
});

wallPhotoInput.addEventListener("change", async () => {
  if (!featureEnabled("familyWall")) return;
  const [file] = wallPhotoInput.files || [];
  if (!file) return;

  wallPhotoInput.disabled = true;
  wallPhotoStatus.textContent = "Preparing photo…";
  await nextFrame();

  try {
    const blob = await compressWallPhoto(file);
    const photoId = crypto.randomUUID();
    await wallPhotoStore.put(photoId, blob);

    const entry = {
      id: crypto.randomUUID(),
      kind: "photo",
      photoId,
      sender: guestName || guestNameInput.value.trim() || "Someone",
      caption: wallPhotoCaption.value.trim().slice(0, 80),
      at: Date.now(),
      reactions: {}
    };

    blessingStore.add(entry);
    wallPhotoInput.value = "";
    wallPhotoCaption.value = "";
    wallPhotoStatus.textContent = "Added ✓";
    await renderBlessings();
    showBlessingFloat(entry);
    playChime("photo");
    window.setTimeout(() => {
      wallPhotoStatus.textContent = "";
    }, 2200);
  } catch (error) {
    console.error("Family wall photo failed", error);
    wallPhotoStatus.textContent = error.message || "Could not add photo.";
  } finally {
    wallPhotoInput.disabled = false;
  }
});

blessingExport.addEventListener("click", exportBlessingsKeepsake);

document.querySelectorAll("[data-game]").forEach((button) => {
  button.addEventListener("click", () => {
    ensureAudioContext();
    renderGame(button.dataset.game);
  });
});

gameClose.addEventListener("click", () => {
  activeGame = null;
  gamePanel.hidden = true;
});

gamePanel.addEventListener("click", (event) => {
  if (event.target === gamePanel) {
    activeGame = null;
    gamePanel.hidden = true;
  }
});

if (afterpartyMode && featureEnabled("afterparty") && featureEnabled("familyHub") && featureEnabled("keepsake")) {
  document.body.classList.add("afterparty-mode");
  blessingPanel.hidden = false;
  activeHubView = "keepsake";
  switchHubView("keepsake");
}

pollEvents();
syncTimer = window.setInterval(pollEvents, 750);
sendTelemetry();
window.setInterval(sendTelemetry, 5000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    resyncOnNextPoll = true;
    pollEvents();
  }
  sendTelemetry();
});

function clearNormalEffects() {
  Array.from(effectLayer.children).forEach((child) => {
    if (
      !child.classList.contains("group-celebration") &&
      !child.classList.contains("meet-reaction-balloon") &&
      !child.classList.contains("meet-celebration")
    ) {
      child.remove();
    }
  });
}

function playEffect(effect, sender, capturePhoto = false) {
  clearTimeout(effectTimer);
  clearNormalEffects();

  const names = {
    ovalni: "Ovalni",
    flowers: "Flowers",
    ashirwad: "Ashirwad",
    supari: "Supari",
    haldi: "Haldi",
    kunku: "Kunku",
    oti: "Oti",
    celebrate: "Celebrate",
    photo: "Family Photo"
  };

  eventLabel.textContent = effect === "photo"
    ? `${sender} called for a family photo 📸`
    : `${sender} sent ${names[effect] || "a celebration"}`;
  eventLabel.classList.add("visible");

  playChime(effect === "photo" ? "photo" : "ritual");

  if (effect === "ovalni") {
    const ring = document.createElement("div");
    ring.className = "effect-ovalni-ring";
    effectLayer.appendChild(ring);
  }

  if (effect === "flowers") {
    const flowers = ["🌸", "🌺", "🌼", "🌷"];
    for (let i = 0; i < 26; i += 1) {
      const petal = document.createElement("span");
      petal.className = "petal";
      petal.textContent = flowers[i % flowers.length];
      petal.style.left = `${(i * 37) % 100}%`;
      petal.style.setProperty("--fall", `${2.3 + (i % 7) * 0.22}s`);
      petal.style.setProperty("--drift", `${-60 + (i % 9) * 16}px`);
      petal.style.animationDelay = `${(i % 6) * 0.08}s`;
      effectLayer.appendChild(petal);
    }
  }

  if (effect === "ashirwad") {
    const burst = document.createElement("div");
    burst.className = "ashirwad-burst";
    burst.textContent = "🙌";
    effectLayer.appendChild(burst);
  }

  if (effect === "supari") {
    const supari = document.createElement("div");
    supari.className = "supari-circle";
    effectLayer.appendChild(supari);
  }

  if (effect === "haldi" || effect === "kunku" || effect === "tika") {
    const markType = effect === "haldi" ? "haldi" : "kunku";
    const effectClass = markType === "haldi" ? "haldi-effect" : "kunku-effect";

    const application = document.createElement("div");
    application.className = `tika-effect ${effectClass}`;

    const applicator = document.createElement("div");
    applicator.className = "tika-applicator";
    application.appendChild(applicator);
    effectLayer.appendChild(application);

    const existingMark = markLayer.querySelector(`[data-mark="${markType}"]`);
    if (existingMark) {
      existingMark.remove();
    }

    const mark = document.createElement("div");
    mark.className = `applied-mark ${effectClass}`;
    mark.dataset.mark = markType;

    const smudge = document.createElement("div");
    smudge.className = "tika-smudge applied-smudge";
    mark.appendChild(smudge);
    markLayer.appendChild(mark);

    window.setTimeout(() => {
      mark.remove();
    }, 5000);
  }

  if (effect === "oti") {
    const oti = document.createElement("div");
    oti.className = "oti-effect";

    const lap = document.createElement("div");
    lap.className = "oti-lap";
    lap.textContent = "🪷";

    const offerings = ["🥥", "🌾", "🌾", "🌸", "🪷", "🌾", "✨"];
    offerings.forEach((symbol, index) => {
      const item = document.createElement("span");
      item.className = "oti-offering";
      item.textContent = symbol;
      item.style.setProperty("--oti-x", `${-72 + index * 24}px`);
      item.style.animationDelay = `${index * 0.12}s`;
      oti.appendChild(item);
    });

    oti.appendChild(lap);
    effectLayer.appendChild(oti);
  }


  if (effect === "photo") {
    const photo = document.createElement("div");
    photo.className = "photo-moment";

    const prompt = document.createElement("div");
    prompt.className = "photo-prompt";
    prompt.textContent = "Everyone smile! 📸";

    const countdown = document.createElement("div");
    countdown.className = "photo-countdown";
    countdown.textContent = "3";

    photo.append(prompt, countdown);
    effectLayer.appendChild(photo);

    const steps = [
      { delay: 1000, text: "2" },
      { delay: 2000, text: "1" },
      { delay: 3000, text: "📸", snap: true }
    ];

    steps.forEach(({ delay, text, snap }) => {
      window.setTimeout(() => {
        if (!countdown.isConnected) return;
        countdown.textContent = text;
        countdown.classList.remove("tick");
        void countdown.offsetWidth;
        countdown.classList.add("tick");

        if (snap) {
          playChime("photo");

          if (capturePhoto) {
            // Only the designated desktop/laptop photo host stores the image.
            // Everyone else just participates in the synchronized countdown.
            Promise.resolve()
              .then(async () => {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                  throw new Error("Photo host browser does not support tab capture.");
                }
                statusText.textContent = "Photo host: select this tab once…";
                await ensurePhotoCapture();
                return captureFamilyPhoto();
              })
              .then(() => {
                eventLabel.textContent = "Family photo saved ✓";
                eventLabel.classList.add("visible");
                statusText.textContent = stage.classList.contains("in-call") ? "Live" : "Ready to join";
              })
              .catch((error) => {
                console.error("Family photo save failed", error);
                eventLabel.textContent = "Photo host failed to save: " + (error.message || "unknown error");
                eventLabel.classList.add("visible");
                statusText.textContent = stage.classList.contains("in-call") ? "Live" : "Ready to join";
              });
          }

          const flash = document.createElement("div");
          flash.className = "photo-flash";
          effectLayer.appendChild(flash);
          window.setTimeout(() => flash.remove(), 650);
        } else {
          playChime("ritual");
        }
      }, delay);
    });

    window.setTimeout(() => photo.remove(), 4600);
  }

  if (effect === "celebrate") {
    const burst = document.createElement("div");
    burst.className = "celebration-burst";
    burst.textContent = "🎉";
    effectLayer.appendChild(burst);
  }

  effectTimer = window.setTimeout(() => {
    clearNormalEffects();
    eventLabel.classList.remove("visible");
  }, 5200);
}

const groupEmoji = {
  ovalni: "🪔",
  flowers: "🌸",
  ashirwad: "🙌",
  supari: "🌰",
  haldi: "🟡",
  kunku: "🔴",
  oti: "🥥",
  celebrate: "🎉",
  photo: "📸"
};

function playGroupCelebration(effect, count = 2, burst = false) {
  clearTimeout(groupEffectTimer);

  let group = effectLayer.querySelector(`.meet-reaction-balloon[data-effect="${effect}"]`);
  if (!group) {
    group = document.createElement("div");
    group.className = "meet-reaction-balloon";
    group.dataset.effect = effect;

    const emoji = document.createElement("span");
    emoji.className = "meet-reaction-emoji";
    emoji.textContent = groupEmoji[effect] || "🎉";

    const countBadge = document.createElement("span");
    countBadge.className = "meet-reaction-count";

    group.append(emoji, countBadge);
    effectLayer.appendChild(group);
  }

  const countBadge = group.querySelector(".meet-reaction-count");
  countBadge.textContent = String(count);
  group.style.setProperty("--group-scale", String(1 + Math.min(count - 2, 4) * 0.13));

  group.classList.remove("wiggle");
  void group.offsetWidth;
  group.classList.add("wiggle");

  if (burst) {
    group.classList.add("burst");

    if (effect === "celebrate") {
      playMeetCelebrationBurst();
    } else {
      for (let i = 0; i < 36; i += 1) {
        const piece = document.createElement("span");
        piece.className = "meet-reaction-burst-piece";
        piece.textContent = groupEmoji[effect] || "🎉";
        piece.style.setProperty("--angle", `${(360 / 36) * i + Math.random() * 12}deg`);
        piece.style.setProperty("--distance", `${90 + Math.random() * 180}px`);
        piece.style.animationDelay = `${Math.random() * 0.12}s`;
        effectLayer.appendChild(piece);
        window.setTimeout(() => piece.remove(), 1500);
      }
    }

    window.setTimeout(() => group.remove(), 520);
    return;
  }

  groupEffectTimer = window.setTimeout(() => {
    group.remove();
  }, 3200);
}

function playMeetCelebrationBurst() {
  const celebration = document.createElement("div");
  celebration.className = "meet-celebration";

  const origin = document.createElement("div");
  origin.className = "meet-celebration-origin";
  celebration.appendChild(origin);

  const confetti = ["✨", "🎉", "💛", "🩷", "🌸"];
  for (let i = 0; i < 28; i += 1) {
    const piece = document.createElement("span");
    piece.className = "meet-celebration-confetti";
    piece.textContent = confetti[Math.floor(Math.random() * confetti.length)];
    piece.style.setProperty("--x", `${-190 + Math.random() * 380}px`);
    piece.style.setProperty("--y", `${-130 - Math.random() * 320}px`);
    piece.style.setProperty("--r", `${-160 + Math.random() * 320}deg`);
    piece.style.animationDelay = `${Math.random() * 0.14}s`;
    origin.appendChild(piece);
  }

  const balloons = ["🎈", "🎈", "🎈", "🥳"];
  for (let i = 0; i < 9; i += 1) {
    const balloon = document.createElement("span");
    balloon.className = "meet-celebration-balloon";
    balloon.textContent = balloons[i % balloons.length];
    balloon.style.setProperty("--x", `${-185 + Math.random() * 370}px`);
    balloon.style.setProperty("--sway", `${-40 + Math.random() * 80}px`);
    balloon.style.setProperty("--rise", `${-360 - Math.random() * 300}px`);
    balloon.style.animationDelay = `${0.08 + Math.random() * 0.22}s`;
    origin.appendChild(balloon);
  }

  effectLayer.appendChild(celebration);
  window.setTimeout(() => celebration.remove(), 3200);
}

// Expose only the small event-rendering boundary that the realtime layer needs.
window.babyShower = { playEffect, playGroupCelebration };


showPhotoButton();


if (photoHost) {
  console.info("Family photo host enabled for this browser.");
}

if (!afterpartyMode) {
  setupCelebrationLayout({
    stage, panel: blessingPanel, enabled: featureEnabled("familyHub"),
    showView: switchHubView, close: blessingClose
  });
}
