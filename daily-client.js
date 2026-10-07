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
    stage("Getting Daily room…");

    const response = await fetch("/api/video-config", {
      cache: "no-store"
    });
    const config = await response.json();

    if (!response.ok) {
      throw new Error(config.error || "Video room is not configured.");
    }

    if (config.provider !== "daily") {
      throw new Error("Configured video provider is not Daily.");
    }

    if (!window.Daily || typeof window.Daily.createFrame !== "function") {
      throw new Error("Daily client failed to load.");
    }

    stage("Loading Daily…");

    const callFrame = window.Daily.createFrame(root, {
      showLeaveButton: true,
      iframeStyle: {
        width: "100%",
        height: "100%",
        border: "0"
      }
    });

    let joined = false;
    let loaded = false;

    const loadTimeout = window.setTimeout(() => {
      if (!loaded) fail("Daily room load timed out.");
    }, 15000);

    callFrame.on("loaded", () => {
      loaded = true;
      window.clearTimeout(loadTimeout);
      if (bootMessage && bootMessage.isConnected) bootMessage.remove();
      report("video-status", "Ready to join");
    });

    callFrame.on("joined-meeting", async () => {
      joined = true;
      try {
        await callFrame.setUserName(name);
      } catch {}
      if (bootMessage) bootMessage.remove();
      report("video-status", "Live");
    });

    callFrame.on("error", (event) => {
      window.clearTimeout(loadTimeout);
      const message = event?.errorMsg || event?.error?.msg || "Daily call failed.";
      fail(message);
    });

    callFrame.on("load-attempt-failed", (event) => {
      window.clearTimeout(loadTimeout);
      const message = event?.errorMsg || event?.error?.msg || "Daily room failed to load.";
      fail(message);
    });

    await callFrame.join({
      url: config.roomUrl,
      userName: name
    });
  } catch (error) {
    console.error(error);
    fail(error.message || "Video call startup failed.");
  }
}

startVideo();
