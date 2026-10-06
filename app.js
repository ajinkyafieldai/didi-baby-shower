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

let gameState = { names: [], quiz: [] };
let activeGame = null;

let guestName = "";
let effectTimer = null;
let groupEffectTimer = null;
let audioContext = null;
let photoCaptureStream = null;

function showPhotoButton() {
  if (!photoButton) return;
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

  frame.src = `/video.html?name=${encodeURIComponent(guestName)}`;
  stage.classList.add("in-call");
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
      gameState = data.games;
      if (activeGame) renderGame(activeGame);
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
      input.disabled = true;
      try {
        await sendGame({ type: "name_suggestion", name });
      } catch (error) {
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
    event.currentTarget.querySelector("button").disabled = true;
    try {
      await sendGame({ type: "quiz_submit", answers });
      playChime("photo");
    } catch (error) {
      event.currentTarget.querySelector("button").disabled = false;
      eventLabel.textContent = error.message;
      eventLabel.classList.add("visible");
    }
  });
}

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
            requestZoomPhoto()
              .then((blob) => saveFamilyPhotoBlob(blob))
              .catch(async (directError) => {
                console.warn("Direct Zoom capture unavailable; falling back to tab capture", directError);
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
