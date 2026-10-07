const root = document.getElementById("video-root");
const bootMessage = document.getElementById("boot-message");
const name = new URLSearchParams(location.search).get("name") || "Guest";

function report(type, text) {
  parent.postMessage({ type, text }, location.origin);
}

function stage(text) {
  if (bootMessage) bootMessage.textContent = text;
  report("video-status", text);
}

function fail(message) {
  if (bootMessage) bootMessage.textContent = message;
  report("video-config-error", message);
}

async function startVideo() {
  try {
    stage("Getting Whereby room…");

    const response = await fetch("/api/video-config", {
      cache: "no-store"
    });
    const config = await response.json();

    if (!response.ok) {
      throw new Error(config.error || "Video room is not configured.");
    }

    stage("Loading Whereby…");
    await customElements.whenDefined("whereby-embed");

    const meeting = document.createElement("whereby-embed");
    meeting.setAttribute("room", config.roomUrl);
    meeting.setAttribute("display-name", name);
    meeting.setAttribute("minimal", "");
    meeting.setAttribute("chat", "off");
    meeting.setAttribute("screenshare", "off");
    meeting.setAttribute("people", "off");
    meeting.setAttribute("room-integrations", "off");

    meeting.addEventListener("ready", () => {
      if (bootMessage) bootMessage.remove();
      report("video-status", "Live");
    }, { once: true });

    root.appendChild(meeting);

    // The component can be usable before a browser emits the ready event.
    // Remove the boot overlay after a short grace period rather than blocking.
    window.setTimeout(() => {
      if (bootMessage && bootMessage.isConnected) {
        bootMessage.remove();
        report("video-status", "Live");
      }
    }, 3000);
  } catch (error) {
    console.error(error);
    fail(error.message || "Video call startup failed.");
  }
}

startVideo();
