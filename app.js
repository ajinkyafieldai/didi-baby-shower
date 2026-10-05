const stage = document.querySelector(".video-stage");
const frame = document.getElementById("zoom-frame");
const joinForm = document.getElementById("join-form");
const joinMessage = document.getElementById("join-message");
const statusText = document.getElementById("status-text");
const effectLayer = document.getElementById("effect-layer");
const eventLabel = document.getElementById("event-label");

let guestName = "";
let effectTimer = null;

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

let eventSocket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;

function connectEvents() {
  clearTimeout(reconnectTimer);

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
  eventSocket = socket;

  socket.addEventListener("open", () => {
    reconnectDelay = 1000;
    statusText.textContent = stage.classList.contains("in-call")
      ? "Live"
      : "Ready to join";
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "effect" && message.effect) {
        playEffect(message.effect, message.sender || "Someone");
      }
    } catch (error) {
      console.error("Invalid celebration event", error);
    }
  });

  socket.addEventListener("close", (event) => {
    if (eventSocket === socket) {
      eventSocket = null;
    }

    const reason = event.reason ? `: ${event.reason}` : "";
    statusText.textContent = `Celebration sync offline (${event.code})${reason}`;

    reconnectTimer = window.setTimeout(connectEvents, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  });

  socket.addEventListener("error", () => {
    statusText.textContent = "Celebration sync connection failed";
    socket.close();
  });
}

function sendEffect(effect) {
  if (!eventSocket || eventSocket.readyState !== WebSocket.OPEN) {
    playEffect(effect, guestName || "Someone");
    statusText.textContent = "Celebration sync reconnecting…";
    return;
  }

  eventSocket.send(JSON.stringify({
    type: "effect",
    effect,
    sender: guestName || "Someone"
  }));
}

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", () => {
    sendEffect(button.dataset.effect);
  });
});

connectEvents();

function playEffect(effect, sender) {
  clearTimeout(effectTimer);
  effectLayer.replaceChildren();

  const names = {
    ovalni: "Ovalni",
    flowers: "Flowers",
    blessings: "Blessings",
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

  if (effect === "blessings") {
    const burst = document.createElement("div");
    burst.className = "blessing-burst";
    burst.textContent = "🙏✨";
    effectLayer.appendChild(burst);
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

// Expose only the small event-rendering boundary that the realtime layer needs.
window.babyShower = { playEffect };
