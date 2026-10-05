const stage = document.querySelector(".video-stage");
const frame = document.getElementById("zoom-frame");
const joinForm = document.getElementById("join-form");
const joinMessage = document.getElementById("join-message");
const statusText = document.getElementById("status-text");
const markLayer = document.getElementById("mark-layer");
const effectLayer = document.getElementById("effect-layer");
const eventLabel = document.getElementById("event-label");
const guestNameInput = document.getElementById("guest-name");
const joinButton = document.getElementById("join-button");
const callStatus = document.querySelector(".call-status");

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

function updateJoinButtonState() {
  joinButton.disabled = !guestNameInput.value.trim();
}

guestNameInput.addEventListener("input", updateJoinButtonState);
updateJoinButtonState();

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(joinForm);
  guestName = String(formData.get("guestName") || "").trim();

  if (!guestName) {
    joinMessage.textContent = "Please enter your name.";
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    joinMessage.textContent = "This browser cannot access the camera and microphone.";
    return;
  }

  joinButton.disabled = true;
  joinButton.textContent = "Joining…";
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
    joinButton.textContent = "Joining…";
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
    joinButton.textContent = "Join";
  }
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;

  const message = event.data || {};
  if (message.type === "zoom-status") {
    statusText.textContent = message.text || "Zoom";
    callStatus.classList.toggle("compact", message.text === "Live");
  }

  if (message.type === "zoom-config-error") {
    stage.classList.remove("in-call");
    joinMessage.textContent = message.text || "Zoom is not configured yet.";
    statusText.textContent = "Zoom setup needed";
    callStatus.classList.remove("compact");
  }
});

let lastEventSeq = 0;
let eventsInitialized = false;
let syncTimer = null;
let syncBusy = false;

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

    if (!eventsInitialized) {
      if (typeof data.seq === "number") {
        lastEventSeq = data.seq;
      }
      eventsInitialized = true;
    } else {
      const events = Array.isArray(data.events)
        ? data.events
        : (data.event ? [data.event] : []);

      events
        .filter((event) => event && event.type === "effect" && Number(event.seq || 0) > lastEventSeq)
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .forEach((event, index) => {
          window.setTimeout(() => {
            playEffect(event.effect, event.sender || "Someone");
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
      playGroupCelebration(
        data.event.effect,
        data.event.groupCount || 2,
        Boolean(data.event.groupBurst)
      );
    }
  } catch (error) {
    console.error("Celebration sync send failed", error);
    statusText.textContent = "Celebration sync offline (" + (error.message || "error") + ")";
    playEffect(effect, guestName || "Someone");
  }
}

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    button.classList.remove("is-sent");
    void button.offsetWidth;
    button.classList.add("is-sent");
    sendEffect(button.dataset.effect);

    window.setTimeout(() => {
      button.disabled = false;
      button.classList.remove("is-sent");
    }, 700);
  });
});

pollEvents();
syncTimer = window.setInterval(pollEvents, 750);

function clearNormalEffects() {
  Array.from(effectLayer.children).forEach((child) => {
    if (!child.classList.contains("group-celebration")) {
      child.remove();
    }
  });
}

function playEffect(effect, sender) {
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

  if (effect === "celebrate") {
    const burst = document.createElement("div");
    burst.className = "celebration-burst";
    burst.textContent = "🎉";
    effectLayer.appendChild(burst);
  }

  effectTimer = window.setTimeout(() => {
    clearNormalEffects();
    eventLabel.classList.remove("visible");
  }, 3600);
}

const groupEmoji = {
  ovalni: "🪔",
  flowers: "🌸",
  ashirwad: "🙌",
  supari: "🌰",
  haldi: "🟡",
  kunku: "🔴",
  oti: "🥥",
  celebrate: "🎉"
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

  const confetti = ["✨", "🎉", "💛", "🩷", "🌸"];
  for (let i = 0; i < 34; i += 1) {
    const piece = document.createElement("span");
    piece.className = "meet-celebration-confetti";
    piece.textContent = confetti[Math.floor(Math.random() * confetti.length)];
    piece.style.left = `${12 + Math.random() * 76}%`;
    piece.style.setProperty("--drift", `${-48 + Math.random() * 96}px`);
    piece.style.setProperty("--spin", `${-220 + Math.random() * 440}deg`);
    piece.style.setProperty("--rise", `${35 + Math.random() * 34}vh`);
    piece.style.setProperty("--float-time", `${2.8 + Math.random() * 1.2}s`);
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    celebration.appendChild(piece);
  }

  const balloons = ["🎈", "🎈", "🎈", "🥳"];
  for (let i = 0; i < 8; i += 1) {
    const balloon = document.createElement("span");
    balloon.className = "meet-celebration-balloon";
    balloon.textContent = balloons[i % balloons.length];
    balloon.style.left = `${10 + Math.random() * 80}%`;
    balloon.style.setProperty("--sway", `${-30 + Math.random() * 60}px`);
    balloon.style.setProperty("--rise-time", `${3.2 + Math.random() * 1.2}s`);
    balloon.style.animationDelay = `${Math.random() * 0.7}s`;
    celebration.appendChild(balloon);
  }

  effectLayer.appendChild(celebration);
  window.setTimeout(() => celebration.remove(), 4600);
}

// Expose only the small event-rendering boundary that the realtime layer needs.
window.babyShower = { playEffect, playGroupCelebration };
