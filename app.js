const stage = document.querySelector(".video-stage");
const frame = document.getElementById("zoom-frame");
const joinForm = document.getElementById("join-form");
const joinMessage = document.getElementById("join-message");
const statusText = document.getElementById("status-text");
const effectLayer = document.getElementById("effect-layer");
const eventLabel = document.getElementById("event-label");

let guestName = "";
let effectTimer = null;
let groupEffectTimer = null;

const participantId = (() => {
  const key = "baby-shower-participant-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
})();

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(joinForm);
  guestName = String(formData.get("guestName") || "").trim();

  if (!guestName) {
    joinMessage.textContent = "Please enter your name.";
    return;
  }

  const joinButton = document.getElementById("join-button");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    joinMessage.textContent = "This browser cannot access the camera and microphone.";
    return;
  }

  joinButton.disabled = true;
  joinButton.textContent = "Waiting for permission…";
  joinMessage.textContent = "When your browser asks, tap Allow for camera and microphone.";
  statusText.textContent = "Requesting camera & microphone…";

  let stream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    stream.getTracks().forEach((track) => track.stop());

    joinMessage.textContent = "";
    joinButton.textContent = "Opening family call…";
    statusText.textContent = "Connecting to Zoom…";

    frame.src = `/zoom.html?name=${encodeURIComponent(guestName)}`;
    stage.classList.add("in-call");
  } catch (error) {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    console.error("Camera/microphone permission error", error);

    const denied = error && (
      error.name === "NotAllowedError" ||
      error.name === "SecurityError"
    );

    joinMessage.textContent = denied
      ? "Camera and microphone permission was not allowed. Please enable it in your browser and try again."
      : "Could not access the camera and microphone. Please check your device settings and try again.";

    statusText.textContent = "Camera & microphone permission needed";
    joinButton.disabled = false;
    joinButton.textContent = "Try camera & microphone again";
  }
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;

  const message = event.data || {};
  if (message.type === "zoom-status") {
    statusText.textContent = message.text || "Zoom";
  }

  if (message.type === "zoom-config-error") {
    stage.classList.remove("in-call");
    joinMessage.textContent = message.text || "Zoom is not configured yet.";
    statusText.textContent = "Zoom setup needed";
  }
});

let lastEventSeq = 0;
let syncTimer = null;
let syncBusy = false;

async function pollEvents() {
  if (syncBusy) return;
  syncBusy = true;

  try {
    const response = await fetch("/api/events", {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error("HTTP " + response.status + (errorText ? ": " + errorText : ""));
    }

    const data = await response.json();

    if (typeof data.seq === "number" && data.seq > lastEventSeq) {
      lastEventSeq = data.seq;

      if (data.event && data.event.type === "effect") {
        playEffect(data.event.effect, data.event.sender || "Someone");
        if (data.event.groupCelebration) {
          playGroupCelebration();
        }
      }
    }

    if (!stage.classList.contains("in-call")) {
      statusText.textContent = "Ready to join";
    }
  } catch (error) {
    console.error("Celebration sync poll failed", error);
    statusText.textContent = "Celebration sync offline (" + (error.message || "error") + ")";
  } finally {
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

    playEffect(effect, guestName || "Someone");
    if (data.event && data.event.groupCelebration) {
      playGroupCelebration();
    }
  } catch (error) {
    console.error("Celebration sync send failed", error);
    statusText.textContent = "Celebration sync offline (" + (error.message || "error") + ")";
    playEffect(effect, guestName || "Someone");
  }
}

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", () => {
    sendEffect(button.dataset.effect);
  });
});

pollEvents();
syncTimer = window.setInterval(pollEvents, 750);

function playEffect(effect, sender) {
  clearTimeout(effectTimer);
  effectLayer.replaceChildren();

  const names = {
    ovalni: "Ovalni",
    flowers: "Flowers",
    ashirwad: "Ashirwad",
    supari: "Supari",
    tika: "Tikka",
    celebrate: "Celebrate"
  };

  eventLabel.textContent = `${sender} sent ${names[effect] || "a celebration"}`;
  eventLabel.classList.add("visible");

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

  if (effect === "tika") {
    const tika = document.createElement("div");
    tika.className = "tika-drop";
    effectLayer.appendChild(tika);
  }

  if (effect === "celebrate") {
    const burst = document.createElement("div");
    burst.className = "celebration-burst";
    burst.textContent = "🎉";
    effectLayer.appendChild(burst);
  }

  effectTimer = window.setTimeout(() => {
    effectLayer.replaceChildren();
    eventLabel.classList.remove("visible");
  }, 3600);
}

function playGroupCelebration() {
  clearTimeout(groupEffectTimer);

  const group = document.createElement("div");
  group.className = "group-celebration";

  const banner = document.createElement("div");
  banner.className = "group-celebration-banner";
  banner.textContent = "Everyone's celebrating! 🎉";
  group.appendChild(banner);

  const pieces = ["🎉", "✨", "💐", "🌸", "🥳", "💛", "🩷", "🪷"];
  for (let i = 0; i < 90; i += 1) {
    const piece = document.createElement("span");
    piece.className = "group-confetti";
    piece.textContent = pieces[Math.floor(Math.random() * pieces.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty("--x", `${-140 + Math.random() * 280}px`);
    piece.style.setProperty("--spin", `${Math.round(-720 + Math.random() * 1440)}deg`);
    piece.style.setProperty("--duration", `${2.4 + Math.random() * 2.2}s`);
    piece.style.animationDelay = `${Math.random() * 0.65}s`;
    piece.style.fontSize = `${18 + Math.random() * 32}px`;
    group.appendChild(piece);
  }

  effectLayer.appendChild(group);
  eventLabel.textContent = "Group celebration! 🎉";
  eventLabel.classList.add("visible");

  groupEffectTimer = window.setTimeout(() => {
    group.remove();
  }, 5200);
}

// Expose only the small event-rendering boundary that the realtime layer needs.
window.babyShower = { playEffect, playGroupCelebration };
