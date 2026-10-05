const stage = document.querySelector(".video-stage");
const frame = document.getElementById("zoom-frame");
const joinForm = document.getElementById("join-form");
const joinMessage = document.getElementById("join-message");
const statusText = document.getElementById("status-text");
const effectLayer = document.getElementById("effect-layer");
const eventLabel = document.getElementById("event-label");

let guestName = "";
let effectTimer = null;

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(joinForm);
  guestName = String(formData.get("guestName") || "").trim();

  if (!guestName) {
    joinMessage.textContent = "Please enter your name.";
    return;
  }

  joinMessage.textContent = "";
  statusText.textContent = "Connecting to Zoom…";

  frame.src = `/zoom.html?name=${encodeURIComponent(guestName)}`;
  stage.classList.add("in-call");
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

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", () => {
    const effect = button.dataset.effect;
    playEffect(effect, guestName || "Someone");

    // Intentionally local for the first deployment.
    // The shared Cloudflare event channel will call playEffect() on every
    // connected browser using the same event payload.
  });
});

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
