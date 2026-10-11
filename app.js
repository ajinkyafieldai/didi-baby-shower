import { applyEventReset } from './frontend/event-reset.js';
import { createScreenAwake } from './frontend/screen-awake.js';
import { createFamilyNotifications } from './frontend/family-notifications.js';
import { buildKeepsake, photoPath } from "./frontend/keepsake-data.js";
import { createSharedFamily, sharedPhotoPath } from "./frontend/shared-family.js";
import { setupCelebrationLayout } from "./frontend/celebration-layout.js";
import { createSharedRecipes } from "./frontend/shared-recipes.js";
import { clientEnvironment, createCallMetrics } from "./frontend/pilot-telemetry.js";
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

const EVENT_ID = EVENT_PACKAGE.id;
const EVENT_TITLE = String(EVENT_PACKAGE.manifest.title || "Apsila Event");
const HONOREE_NAME = String(EVENT_PACKAGE.content.honoree_name || "Honoree").trim() || "Honoree";

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
      localStorage.getItem(`${EVENT_ID}:baby-shower-blessings-v1`);
      localStorage.getItem(`${EVENT_ID}:baby-shower-family-hub-v1`);
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
const keepsakeExportStatus = document.getElementById("keepsake-export-status");
let keepsakeSharedSnapshot = {};
const htmlExport = document.getElementById('blessing-export-html');
const capsuleStatus = document.getElementById('capsule-status');
const capsuleBackup = document.getElementById('capsule-backup');
const screenAwakeStatus = document.getElementById('screen-awake-status');
const screenAwake = createScreenAwake({ changed: text => { screenAwakeStatus.textContent = text; } });
const familyToast = document.getElementById('family-toast');
document.addEventListener('fullscreenchange', () => {
  const full = document.fullscreenElement;
  (full && full.tagName !== 'IFRAME' ? full : document.body).append(familyToast);
});
const toastQueue = [];
let toastShowing = false;
function showFamilyToast(text) {
  toastQueue.push(text);
  if (toastShowing) return;
  function next() {
    const message = toastQueue.shift();
    toastShowing = Boolean(message);
    familyToast.hidden = !message;
    familyToast.textContent = message || '';
    // The call iframe can enter fullscreen, so forward to its own toast surface too.
    frame.contentWindow?.postMessage({ type: 'family-toast', text: message || '' }, location.origin);
    if (message) window.setTimeout(next, 5500);
  }
  next();
}
const familyNotifications = createFamilyNotifications(showFamilyToast);
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
const recipeStatus = document.getElementById("recipe-status");
const sharedRecipes = createSharedRecipes({ changed: () => {
  if (activeHubView === "recipes") renderRecipes();
  if (activeHubView === "keepsake") renderKeepsakeSummary();
} });
let recipeDraft = null;
const notesStatus = document.getElementById("notes-status");
const mapStatus = document.getElementById("map-status");
const guestStatus = document.getElementById("guest-status");
const sharedFamily = createSharedFamily({ changed: () => {
  if (activeHubView === 'wall') renderBlessings();
  if (activeHubView === 'map') { renderMap(); renderGuests(); }
  if (activeHubView === 'mosaic') renderMosaic();
  if (activeHubView === 'capsule') renderCapsules();
  if (activeHubView === 'keepsake') renderKeepsakeSummary();
} });
const familyDrafts = new WeakMap();
const reactionDrafts = new Map();
let wallPhotoDraft = null;
function stableFamilyDraft(form, content) {
  const fingerprint = JSON.stringify(content);
  let draft = familyDrafts.get(form);
  if (!draft || draft.fingerprint !== fingerprint) {
    draft = { fingerprint, entry: { id: crypto.randomUUID(), ...content } };
    familyDrafts.set(form, draft);
  }
  return draft.entry;
}
function wallItems() { return sharedFamily.list('blessings', blessingStore.list()); }
function peopleItems(collection) { return sharedFamily.list(collection, familyStore.read()[collection]); }

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
  const key = `${EVENT_ID}:baby-shower-blessings-v1`;

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
  const dbName = `${EVENT_ID}:family-wall`;
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
  const key = `${EVENT_ID}:baby-shower-family-hub-v1`;

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
let photoResultTimer = null;
let lastPhotoSeq = 0;
let lastPhotoAt = 0;

function showPhotoButton() {
  if (!featureEnabled("familyPhoto") || !photoButton) return;
  photoButton.classList.add("is-peeking");
  photoButton.setAttribute("aria-hidden", "false");
  photoButton.style.left = "auto";
  photoButton.style.top = "auto";
  photoButton.style.right = "14px";
  photoButton.style.bottom = "14px";
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
const callMetrics = createCallMetrics();
const telemetryId = crypto.randomUUID(); // A page session, not a unique person.
const environment = clientEnvironment(navigator, window.innerWidth);
let telemetryRevision = 0;

async function sendTelemetry() {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "telemetry",
        clientId: telemetryId,
        role: "guest",
        latencyMs: latestRenderLatencyMs,
        lastEventSeq,
        visible: document.visibilityState === "visible",
        environment,
        revision: ++telemetryRevision,
        call: callMetrics.snapshot()
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

  frame.src = `/daily.html?name=${encodeURIComponent(guestName)}&event=${encodeURIComponent(EVENT_ID)}`;
  callMetrics.signal('joining');
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
  if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;

  const message = event.data || {};
  if (message.type === 'call-metric') {
    callMetrics.signal(message.text);
    sendTelemetry();
    return;
  }

  if (message.type === "video-status") {
    screenAwake.setActive(message.text === "Live");
    statusText.textContent = message.text || "Video call";
    callStatus.classList.toggle("compact", message.text === "Live");
    if (message.text === "Live") {
      showPhotoButton();
    }
  }

  if (message.type === "video-config-error") {
    screenAwake.setActive(false);
    callMetrics.signal('error');
    stage.classList.remove("in-call");
    joinMessage.textContent = message.text || "Video call is not configured yet.";
    statusText.textContent = "Video setup needed";
    callStatus.classList.remove("compact");
    joinButton.disabled = !guestNameInput.value.trim();
    joinButton.textContent = 'Join';
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
    const didReset = applyEventReset(localStorage, EVENT_ID, data.family?.reset);
    if (didReset) {
      keepsakeSharedSnapshot = {};
      wallPhotoDraft = null; recipeDraft = null;
      window.clearTimeout(photoResultTimer); window.clearTimeout(effectTimer);
      document.querySelector('#shared-photo-overlay')?.remove();
      eventLabel.classList.remove('visible');
      resyncOnNextPoll = true;
    }
    familyNotifications(data.family);
    sharedRecipes.accept(data.family);
    acceptKeepsakeSnapshot(data);
    sharedFamily.accept(data.family);
    if (didReset) renderHubView(activeHubView);
    const resumedAfterGap = now - lastPollCompletedAt > RESUME_GAP_MS;
    const shouldResync = resyncOnNextPoll || resumedAfterGap;
    // Snapshot recovery also catches a completed capture after a polling gap.
    const photo = data.latestPhoto;
    if (photo && Number(photo.seq) > lastPhotoSeq) {
      if (eventsInitialized && now - Number(photo.at || 0) <= 60000) {
        window.clearTimeout(photoResultTimer);
        window.clearTimeout(effectTimer);
        showCapturedPhoto(photo.asset);
        eventLabel.textContent = "Family photo saved ✓";
        eventLabel.classList.add("visible");
        effectTimer = window.setTimeout(() => eventLabel.classList.remove("visible"), 5200);
      }
      lastPhotoSeq = Number(photo.seq);
      lastPhotoAt = Number(photo.at || 0);
    }

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
          (event.type === "effect" ||
            (event.type === "command" && event.command === "photo.capture")) &&
          Number(event.seq || 0) > lastEventSeq &&
          now - Number(event.at || 0) <= MAX_EFFECT_AGE_MS
        )
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .forEach((event, index) => {
          window.setTimeout(() => {
            latestRenderLatencyMs = Math.max(0, Date.now() - Number(event.at || Date.now()));
            playEffect(event.effect || "photo", event.sender || "Someone", Number(event.at) || Date.now());
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
        ...(effect === "photo"
          ? { type: "command", command: "photo.capture" }
          : { type: "effect", effect }),
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

    playEffect(effect, guestName || "Someone", Number(data.event?.at) || Date.now());
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
    if (effect === "photo") {
      eventLabel.textContent = "Photo request failed. Please try again.";
      eventLabel.classList.add("visible");
    } else {
      playEffect(effect, guestName || "Someone");
    }
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
  `What is ${HONOREE_NAME}'s comfort food?`,
  `What phrase does ${HONOREE_NAME} say all the time?`,
  `Where would ${HONOREE_NAME} pick for a surprise holiday?`,
  `What always makes ${HONOREE_NAME} laugh?`
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
      <h2 id="game-title">🏆 Who Knows ${HONOREE_NAME} Best?</h2>
      <div class="quiz-done">Answers locked 🔒</div>
      <p class="game-subtitle">${HONOREE_NAME} gets to judge. ${gameState.quiz.length} people have played.</p>
      <div class="quiz-review">
        ${didiQuestions.map((question, index) => `
          <div><small>${escapeHtml(question)}</small><strong>${escapeHtml(existing.answers[index])}</strong></div>
        `).join("")}
      </div>`;
    return;
  }

  gameContent.innerHTML = `
    <h2 id="game-title">🏆 Who Knows ${HONOREE_NAME} Best?</h2>
    <p class="game-subtitle">No cheating. ${HONOREE_NAME} judges the answers 😄</p>
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
let recipeRenderVersion = 0;
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
  const combined = peopleItems("pins");
  peopleItems("guests").forEach(guest => {
    if (!combined.some(pin => pin.name === guest.name && pin.city === guest.city)) combined.push(guest);
  });
  const people = combined.map(person => ({ ...person, coords: person.coords || lookupCity(person.city) }));
  mapList.innerHTML = people.length
    ? people.map(person => `<span>📍 <strong>${escapeHtml(person.name)}</strong> · ${escapeHtml(person.city || "Location unavailable")}${person.localOnly ? ' <small>(on this device)</small>' : ''}</span>`).join("")
    : '<p class="hub-empty">Join the call to appear here, or add your name and city above.</p>';
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
  const items = sharedFamily.list('capsules', familyStore.read().capsules);
  const localCount = items.filter(item => item.localOnly).length;
  capsuleBackup.hidden = !localCount;
  capsuleBackup.textContent = `Back up ${localCount} message${localCount === 1 ? '' : 's'} from this device`;
  capsuleList.innerHTML = items.length
    ? items.map((item) => `
      <article class="capsule-card">
        <div class="capsule-seal">🔒</div>
        <div>
          <small>Open at age ${escapeHtml(item.openAt)}</small>
          <strong>${escapeHtml(item.title || "A message from the family")}</strong>
          <span>Sealed by ${escapeHtml(item.sender)}${item.localOnly ? " · saved on this device only" : " · backed up"}</span>
        </div>
      </article>
    `).join("")
    : '<p class="hub-empty">No sealed messages yet.</p>';
}

async function renderRecipes() {
  const version = ++recipeRenderVersion;
  const nextObjectUrls = [];
  const items = sharedRecipes.list(familyStore.read().recipes);
  if (!items.length) {
    recipeObjectUrls.forEach(URL.revokeObjectURL);
    recipeObjectUrls = [];
    recipeList.innerHTML = '<p class="hub-empty">No recipes yet. Someone has to preserve the family food lore 🍲</p>';
    return;
  }

  const rows = [];
  for (const item of items) {
    let photo = "";
    if (typeof item.asset === "string" && /^\/api\/photos\?key=photos(?:%2[fF]|\/)[a-zA-Z0-9%._-]+$/.test(item.asset)) {
      photo = `<img src="${escapeHtml(item.asset)}" alt="Dish photo">`;
    }
    if (item.photoId) {
      try {
        const blob = await wallPhotoStore.get(item.photoId);
        if (blob) {
          const url = URL.createObjectURL(blob);
          nextObjectUrls.push(url);
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
          ${item.localOnly ? '<small>Saved on this device only</small>' : ''}
        </div>
      </article>
    `);
  }
  if (version !== recipeRenderVersion) { nextObjectUrls.forEach(URL.revokeObjectURL); return; }
  recipeObjectUrls.forEach(URL.revokeObjectURL);
  recipeObjectUrls = nextObjectUrls;
  recipeList.innerHTML = rows.join("");
}

async function renderMosaic() {
  mosaicObjectUrls.forEach(URL.revokeObjectURL);
  mosaicObjectUrls = [];
  const photos = wallItems().filter((item) => item.kind === "photo" && (item.photoId || sharedPhotoPath(item.asset)));

  if (!photos.length) {
    photoMosaic.innerHTML = '<p class="hub-empty">Your family photos will appear here. Open Wishes and choose Share a photo to add the first one.</p>';
    return;
  }

  const tiles = [];
  for (const item of photos.slice(0, 40)) {
    if (sharedPhotoPath(item.asset)) {
      tiles.push(`<figure><img src="${escapeHtml(sharedPhotoPath(item.asset))}" alt="${escapeHtml(item.caption || 'Family photo')}"><figcaption>${escapeHtml(item.caption || item.sender || '')}</figcaption></figure>`);
      continue;
    }
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
  const items = peopleItems("guests");
  arrivalRibbon.innerHTML = items.length
    ? items.map((item, index) => `
      <article class="arrival-card">
        <span class="arrival-number">${items.length - index}</span>
        <div>
          <strong>👋 ${escapeHtml(item.name)}</strong>
          <small>${item.city ? "joined from " + escapeHtml(item.city) : "was here"} · ${new Date(item.at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}${item.localOnly ? ' · on this device' : ''}</small>
        </div>
      </article>
    `).join("")
    : '<p class="hub-empty">Be the first to say hello. Add your name and city above.</p>';
}

function renderKeepsakeSummary() {
  const hub = familyStore.read();
  const wall = wallItems();
  const photoCount = wall.filter((item) => item.kind === "photo").length;
  const noteCount = wall.filter((item) => item.kind !== "photo").length;

  keepsakeSummary.innerHTML = `
    <div class="keepsake-hero">
      <span>✨</span>
      <div><h3>${EVENT_TITLE}</h3><p>The day, collected by everyone who was there.</p></div>
    </div>
    <div class="keepsake-stats">
      <div><strong>${noteCount}</strong><span>notes</span></div>
      <div><strong>${photoCount}</strong><span>photos</span></div>
      <div><strong>${hub.timeline.length}</strong><span>memories</span></div>
      <div><strong>${sharedFamily.list("capsules", hub.capsules).length}</strong><span>time capsules</span></div>
      <div><strong>${sharedRecipes.list(hub.recipes).length}</strong><span>recipes</span></div>
      <div><strong>${peopleItems("guests").length}</strong><span>people here</span></div>
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

mapForm.addEventListener("submit", async (event) => {
  if (!featureEnabled("familyMap")) return;
  event.preventDefault();
  await sharePeopleForm(mapForm, 'pins', mapStatus);
});

async function sharePeopleForm(form, collection, status) {
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const city = String(data.get('city') || '').trim();
  if (!name) return;
  const coords = coordinatesForCity(city);
  const entry = stableFamilyDraft(form, { name, city, ...(coords ? { coords } : {}) });
  const fields = [...form.elements].filter(element => element !== submit);
  const disabled = fields.map(element => element.disabled);
  fields.forEach(element => { element.disabled = true; });
  setBusy(submit, true, 'Sharing…');
  status.textContent = 'Sharing with the family…';
  try {
    await sharedFamily.add(collection, entry);
    familyDrafts.delete(form);
    form.reset();
    status.textContent = 'Shared with everyone ✓';
    renderMap(); renderGuests(); playChime();
  } catch (error) {
    status.textContent = error.message || 'Could not share. Your entry is still here; try again.';
  } finally {
    fields.forEach((element, i) => { element.disabled = disabled[i]; });
    setBusy(submit, false);
  }
}

capsuleForm.addEventListener('submit', async event => {
  if (!featureEnabled('timeCapsule')) return;
  event.preventDefault();
  const form = event.currentTarget, submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const data = new FormData(form);
  const entry = stableFamilyDraft(form, {
    openAt: String(data.get('openAt') || '18'), title: String(data.get('title') || '').trim().slice(0, 60),
    message: String(data.get('message') || '').trim().slice(0, 500), sender: safeGuestName()
  });
  const fields = Array.from(form.elements), disabled = fields.map(field => field.disabled);
  fields.forEach(field => { field.disabled = true; });
  capsuleStatus.textContent = 'Sealing and backing up…';
  try {
    await sharedFamily.add('capsules', entry);
    familyDrafts.delete(form); form.reset();
    capsuleStatus.textContent = 'Message sealed and backed up ✓';
    playChime('photo'); renderCapsules();
  } catch (error) { capsuleStatus.textContent = error.message || 'Could not back up. Your draft is still here.'; }
  finally { fields.forEach((field, i) => { field.disabled = disabled[i]; }); }
});
capsuleBackup.addEventListener('click', async () => {
  if (capsuleBackup.disabled) return;
  capsuleBackup.disabled = true;
  try {
    for (const item of sharedFamily.list('capsules', familyStore.read().capsules).filter(item => item.localOnly)) {
      await sharedFamily.add('capsules', item);
    }
    capsuleStatus.textContent = 'Messages from this device are backed up ✓';
    renderCapsules();
  } catch (error) { capsuleStatus.textContent = error.message || 'Backup paused. Retry to continue.'; }
  finally { capsuleBackup.disabled = false; }
});

recipeForm.addEventListener("submit", async (event) => {
  if (!featureEnabled("recipeBook")) return;
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const data = new FormData(form);
  const file = form.elements.photo.files[0];
  const content = {
    name: String(data.get("name") || "").trim().slice(0, 80),
    why: String(data.get("why") || "").trim().slice(0, 180),
    recipe: String(data.get("recipe") || "").trim().slice(0, 900),
    sender: safeGuestName()
  };
  const fingerprint = JSON.stringify(content);
  if (!recipeDraft || recipeDraft.fingerprint !== fingerprint || recipeDraft.file !== file) {
    recipeDraft = { fingerprint, file, entry: { id: crypto.randomUUID(), ...content } };
  }
  const fields = [...form.elements].filter(element => element !== submit);
  const disabled = fields.map(element => element.disabled);
  fields.forEach(element => { element.disabled = true; });
  setBusy(submit, true, "Sharing…");
  recipeStatus.textContent = "Sharing recipe…";
  try {
    if (file && !recipeDraft.entry.asset) {
      const blob = await compressWallPhoto(file);
      const response = await fetch('/api/photos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'recipe.jpg' }, body: blob });
      const uploaded = await response.json();
      if (!response.ok || !uploaded.ok || !uploaded.key) throw new Error(uploaded.error || 'Could not upload dish photo. Try again.');
      recipeDraft.entry.asset = '/api/photos?key=' + encodeURIComponent(uploaded.key);
    }
    await sharedRecipes.add(recipeDraft.entry);
    form.reset();
    recipeDraft = null;
    recipeStatus.textContent = "Shared with everyone ✓";
    playChime("photo");
    renderRecipes();
  } catch (error) {
    recipeStatus.textContent = error.message || "Could not share recipe. Your recipe is still here; try again.";
  } finally {
    fields.forEach((element, index) => { element.disabled = disabled[index]; });
    setBusy(submit, false);
  }
});

guestForm.addEventListener("submit", async (event) => {
  if (!featureEnabled("guestRibbon")) return;
  event.preventDefault();
  await sharePeopleForm(guestForm, 'guests', guestStatus);
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

let wallRenderVersion = 0;
async function renderBlessings() {
  const version = ++wallRenderVersion;
  const nextUrls = [];
  const items = wallItems();
  clearWallObjectUrls();

  if (!items.length) {
    blessingWall.innerHTML = '<p class="blessing-empty">Leave the first wish for the baby, or share a family photo above.</p>';
    return;
  }

  const rows = await Promise.all(items.map(async (item) => {
    const reactions = item.reactions || {};

    if (item.kind === "photo" && (item.photoId || sharedPhotoPath(item.asset))) {
      let imageHtml = sharedPhotoPath(item.asset)
        ? `<img class="wall-photo" src="${escapeHtml(sharedPhotoPath(item.asset))}" alt="${escapeHtml(item.caption || 'Shared family photo')}">`
        : '<div class="wall-photo-missing">Photo unavailable on this device</div>';
      try {
        const blob = item.photoId ? await wallPhotoStore.get(item.photoId) : null;
        if (blob) {
          const url = URL.createObjectURL(blob);
          nextUrls.push(url);
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
            ${item.localOnly ? '<small>Saved on this device only</small>' : ""}
            <div class="blessing-reactions">
              ${["❤️","🥰","😂"].map((emoji) => `
                <button type="button" data-blessing-react="${emoji}" ${item.localOnly || reactionDrafts.get(`${item.id}|${emoji}`)?.pending ? "disabled" : ""}>
                  <span>${emoji}</span>
                  <small>${Number(reactions[emoji] || 0) || ""}</small>
                </button>
              `).join("")}
            </div>
          </footer>
        </article>
      `;
    }

    const forWhom = item.audience === "didi" ? `${HONOREE_NAME ? "For " + HONOREE_NAME : "For the honoree"}` : "For the baby";
    return `
      <article class="blessing-note" data-blessing-id="${escapeHtml(item.id)}">
        <div class="blessing-note-top">
          <span>${item.audience === "didi" ? "🌸" : "👶"} ${forWhom}</span>
          <time>${new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
        <p>${escapeHtml(item.message || "")}</p>
        <footer>
          <strong>— ${escapeHtml(item.sender || "Someone")}</strong>
          ${item.localOnly ? '<small>Saved on this device only</small>' : ""}
            <div class="blessing-reactions">
            ${["❤️","🥰","😂"].map((emoji) => `
              <button type="button" data-blessing-react="${emoji}" ${item.localOnly || reactionDrafts.get(`${item.id}|${emoji}`)?.pending ? "disabled" : ""}>
                <span>${emoji}</span>
                <small>${Number(reactions[emoji] || 0) || ""}</small>
              </button>
            `).join("")}
          </div>
        </footer>
      </article>
    `;
  }));

  if (version !== wallRenderVersion) { nextUrls.forEach(URL.revokeObjectURL); return; }
  wallObjectUrls = nextUrls;
  blessingWall.innerHTML = rows.join("");

  blessingWall.querySelectorAll("[data-blessing-react]").forEach((button) => {
    button.addEventListener("click", async () => {
      const note = button.closest("[data-blessing-id]");
      if (!note || button.disabled) return;
      const key = `${note.dataset.blessingId}|${button.dataset.blessingReact}`;
      const previous = reactionDrafts.get(key);
      if (previous?.pending) return;
      const mutationId = previous?.mutationId || crypto.randomUUID();
      reactionDrafts.set(key, { mutationId, pending: true });
      button.disabled = true;
      try {
        await sharedFamily.react(note.dataset.blessingId, button.dataset.blessingReact, mutationId);
        reactionDrafts.delete(key);
        renderBlessings();
        notesStatus.textContent = 'Reaction shared ✓';
        playChime();
      } catch (error) {
        reactionDrafts.set(key, { mutationId, pending: false });
        notesStatus.textContent = error.message || 'Could not share reaction. Tap again to retry.';
        renderBlessings();
      } finally { button.disabled = false; }
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

function acceptKeepsakeSnapshot(data) {
  if (data.games) keepsakeSharedSnapshot.games = data.games;
  if (data.family && Number.isSafeInteger(data.family.revision) &&
      data.family.revision >= (keepsakeSharedSnapshot.family?.revision ?? -1)) {
    keepsakeSharedSnapshot.family = data.family;
  }
  if (data.latestPhoto && Number(data.latestPhoto.seq) > Number(keepsakeSharedSnapshot.latestPhoto?.seq || 0)) {
    keepsakeSharedSnapshot.latestPhoto = data.latestPhoto;
  }
}

async function exportBlessingsKeepsake(format = 'pdf') {
  if (blessingExport.disabled) return;
  blessingExport.disabled = true;
  htmlExport.disabled = true;
  const label = format.toUpperCase();
  keepsakeExportStatus.textContent = `Collecting the family keepsake for ${label}…`;
  const warnings = [];
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/events', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Shared content unavailable');
      const snapshot = await response.json();
      acceptKeepsakeSnapshot(snapshot);
      if (!snapshot.family) warnings.push('Shared family content is not available from the server yet. This export includes entries available on this device.');
    } catch {
      warnings.push('Shared content could not be refreshed. This export includes the last available shared entries and entries saved on this device.');
    } finally { window.clearTimeout(timer); }
    const currentFamily = sharedFamily.snapshot();
    const family = currentFamily.revision > (keepsakeSharedSnapshot.family?.revision ?? -1)
      ? currentFamily : keepsakeSharedSnapshot.family;
    const data = buildKeepsake({
      title: EVENT_TITLE, honoree: HONOREE_NAME,
      wall: blessingStore.list(), hub: familyStore.read(),
      ...keepsakeSharedSnapshot, games: keepsakeSharedSnapshot.games || gameState, family, warnings
    });
    data.people = data.people.map(person => ({ ...person, coords: person.coords || lookupCity(person.city) }));
    const createExport = format === 'html'
      ? (await import('./frontend/keepsake-html.js')).createKeepsakeHtml
      : (await import('./frontend/keepsake-pdf.js')).createKeepsakePdf;
    const result = await createExport(data, {
      progress: section => { keepsakeExportStatus.textContent = `Preparing ${section.toLowerCase()}…`; },
      loadPhoto: async item => {
        const path = photoPath(item.asset);
        if (path) {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 10000);
          try {
            const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error('Photo unavailable');
            return await response.blob();
          } catch (error) { if (!item.photoId) throw error; }
          finally { window.clearTimeout(timer); }
        }
        return item.photoId ? wallPhotoStore.get(item.photoId) : null;
      }
    });
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${EVENT_ID}-family-keepsake.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    keepsakeExportStatus.textContent = result.warnings.length
      ? `${label} ready. Some content was unavailable; see Export notes in the download.`
      : `${label} ready${result.pages ? ` (${result.pages} pages)` : ""}. Photos and map are included for offline sharing.`;
  } catch (error) {
    console.error('Keepsake export failed', error);
    keepsakeExportStatus.textContent = 'Could not prepare the download. Please try again.';
  } finally {
    blessingExport.disabled = false;
    htmlExport.disabled = false;
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

blessingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!featureEnabled("familyWall")) return;
  const submit = blessingForm.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const data = new FormData(blessingForm);
  const message = String(data.get('message') || '').trim();
  if (!message) return;
  const entry = stableFamilyDraft(blessingForm, {
    sender: guestName || guestNameInput.value.trim() || 'Someone',
    audience: data.get('audience') === 'didi' ? 'didi' : 'baby', message
  });
  const fields = [...blessingForm.elements].filter(element => element !== submit);
  const disabled = fields.map(element => element.disabled);
  fields.forEach(element => { element.disabled = true; });
  setBusy(submit, true, 'Sharing…'); notesStatus.textContent = 'Sharing note…';
  try {
    await sharedFamily.add('blessings', entry);
    familyDrafts.delete(blessingForm);
    blessingForm.reset(); blessingMessage.value = ''; blessingCount.textContent = '0/180';
    notesStatus.textContent = 'Shared with everyone ✓';
    showBlessingFloat(entry); playChime('photo'); renderBlessings();
  } catch (error) {
    notesStatus.textContent = error.message || 'Could not share. Your note is still here; try again.';
  } finally {
    fields.forEach((element, i) => { element.disabled = disabled[i]; });
    setBusy(submit, false);
  }
});

async function shareWallPhoto() {
  if (!featureEnabled('familyWall') || wallPhotoInput.disabled) return;
  const [file] = wallPhotoInput.files || [];
  if (!file) return;
  const content = {
    sender: guestName || guestNameInput.value.trim() || 'Someone',
    caption: wallPhotoCaption.value.trim().slice(0, 80)
  };
  const fingerprint = JSON.stringify(content);
  if (!wallPhotoDraft || wallPhotoDraft.file !== file || wallPhotoDraft.fingerprint !== fingerprint) {
    wallPhotoDraft = { file, fingerprint, entry: { id: crypto.randomUUID(), ...content } };
  }
  wallPhotoInput.disabled = true; wallPhotoCaption.disabled = true;
  wallPhotoRetry.disabled = true;
  wallPhotoStatus.textContent = 'Sharing photo…';
  try {
    if (!wallPhotoDraft.entry.asset) {
      const blob = await compressWallPhoto(file);
      const response = await fetch('/api/photos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'family-wall.jpg' }, body: blob });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !uploaded.ok || !uploaded.key) throw new Error(uploaded.error || 'Could not upload photo. Please retry.');
      wallPhotoDraft.entry.asset = '/api/photos?key=' + encodeURIComponent(uploaded.key);
    }
    const entry = wallPhotoDraft.entry;
    await sharedFamily.add('blessings', entry);
    wallPhotoDraft = null;
    wallPhotoInput.value = ''; wallPhotoCaption.value = '';
    wallPhotoRetry.hidden = true;
    wallPhotoStatus.textContent = 'Shared with everyone ✓';
    renderBlessings();
    showBlessingFloat({ ...entry, kind: 'photo' }); playChime('photo');
  } catch (error) {
    wallPhotoStatus.textContent = error.message || 'Could not share photo. Please retry.';
    wallPhotoRetry.hidden = false;
  } finally {
    wallPhotoInput.disabled = false; wallPhotoCaption.disabled = false;
    wallPhotoRetry.disabled = false;
  }
}
const wallPhotoRetry = document.getElementById('wall-photo-retry');
wallPhotoInput.addEventListener('change', shareWallPhoto);
wallPhotoRetry.addEventListener('click', shareWallPhoto);

blessingExport.addEventListener('click', () => exportBlessingsKeepsake('pdf'));
htmlExport.addEventListener('click', () => exportBlessingsKeepsake('html'));
window.addEventListener('pagehide', () => screenAwake.setActive(false));

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

function playEffect(effect, sender, requestedAt = Date.now()) {
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

          if (lastPhotoAt < requestedAt) {
            eventLabel.textContent = "Saving family photo…";
            eventLabel.classList.add("visible");
            window.clearTimeout(photoResultTimer);
            photoResultTimer = window.setTimeout(() => {
              eventLabel.textContent = "Photo has not arrived yet — ask the host to check capture.";
              eventLabel.classList.add("visible");
            }, 30000);
          }

          const flash = document.createElement("div");
          flash.className = "photo-flash";
          effectLayer.appendChild(flash);
          window.setTimeout(() => flash.remove(), 650);
        } else {
          playChime("ritual");
        }
      }, Math.max(0, requestedAt + delay - Date.now()));
    });

    window.setTimeout(() => photo.remove(), Math.max(0, requestedAt + 4600 - Date.now()));
  }

  if (effect === "celebrate") {
    const burst = document.createElement("div");
    burst.className = "celebration-burst";
    burst.textContent = "🎉";
    effectLayer.appendChild(burst);
  }

  effectTimer = window.setTimeout(() => {
    clearNormalEffects();
    if (effect !== "photo") eventLabel.classList.remove("visible");
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
        window.setTimeout(() => piece.remove(), 2900);
      }
    }

    window.setTimeout(() => group.remove(), 900);
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
  window.setTimeout(() => celebration.remove(), 4600);
}

// Expose only the small event-rendering boundary that the realtime layer needs.
window.babyShower = { playEffect, playGroupCelebration };


showPhotoButton();



if (!afterpartyMode) {
  setupCelebrationLayout({
    stage, panel: blessingPanel, enabled: featureEnabled("familyHub"),
    showView: switchHubView, close: blessingClose
  });
}
