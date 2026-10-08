const root = document.getElementById("video-root");
const bootMessage = document.getElementById("boot-message");
const name = new URLSearchParams(location.search).get("name") || "Guest";

const APSILA_DAILY_THEME = {
  colors: {
    accent: "#A94762",
    accentText: "#FFFFFF",
    background: "#FFFAF2",
    backgroundAccent: "#FFF2E8",
    baseText: "#422F35",
    border: "#E8D8C7",
    mainAreaBg: "#FFF7EF",
    mainAreaBgAccent: "#F6E9DF",
    mainAreaText: "#422F35",
    supportiveText: "#7A6970"
  }
};

async function blendDaily(callFrame) {
  // Daily Prebuilt supports native theming; use it instead of brittle iframe CSS.
  try {
    await callFrame.setTheme(APSILA_DAILY_THEME);
  } catch (error) {
    console.warn("Daily theme could not be applied", error);
  }

  // Give the current speaker the main stage, with family thumbnails alongside.
  try {
    await callFrame.setActiveSpeakerMode(true);
  } catch (error) {
    console.warn("Daily grid mode could not be enabled", error);
  }

  try {
    await callFrame.setShowParticipantsBar(true);
  } catch {}
}


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
  if (new URLSearchParams(location.search).get("ui") !== "prebuilt") {
    const { startCustomCall } = await import("./frontend/custom-call.js");
    return startCustomCall({ root, bootMessage, name, report, fail });
  }
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
      showLeaveButton: false,
      activeSpeakerMode: true,
      theme: APSILA_DAILY_THEME,
      iframeStyle: {
        width: "100%",
        height: "100%",
        border: "0",
        borderRadius: "14px",
        background: "#FFF7EF"
      }
    });

    let joined = false;
    let loaded = false;

    const loadTimeout = window.setTimeout(() => {
      if (!loaded) fail("Daily room load timed out.");
    }, 15000);

    callFrame.on("loaded", async () => {
      loaded = true;
      window.clearTimeout(loadTimeout);
      await blendDaily(callFrame);
      if (bootMessage && bootMessage.isConnected) bootMessage.remove();
      report("video-status", "Ready to join");
    });

    callFrame.on("joined-meeting", async () => {
      joined = true;
      try {
        await callFrame.setUserName(name);
      } catch {}
      await blendDaily(callFrame);
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
