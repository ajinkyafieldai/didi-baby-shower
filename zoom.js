import { ZoomMtg } from "@zoom/meetingsdk";

const bootMessage = document.getElementById("boot-message");
const name = new URLSearchParams(location.search).get("name") || "Guest";

function report(type, text) {
  parent.postMessage({ type, text }, location.origin);
}

function stage(text) {
  bootMessage.textContent = text;
  report("zoom-status", text);
}

async function startZoom() {
  try {
    stage("Getting Zoom access…");

    const controller = new AbortController();
    const signatureTimeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("/api/zoom-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(signatureTimeout);
    const config = await response.json();

    if (!response.ok) {
      throw new Error(config.error || "Zoom is not configured.");
    }

    stage("Loading Zoom video engine…");

    ZoomMtg.setZoomJSLib("https://source.zoom.us/6.5.0/lib", "/av");
    ZoomMtg.preLoadWasm();
    ZoomMtg.prepareWebSDK();

    stage("Starting Zoom…");

    const initTimeout = setTimeout(() => {
      stage("Zoom startup is taking too long. Please reload and try again.");
    }, 20000);

    ZoomMtg.init({
      leaveUrl: location.origin + "/",
      patchJsMedia: true,
      disableCORP: !window.crossOriginIsolated,
      success: function () {
        clearTimeout(initTimeout);
        stage("Joining the family call…");

        ZoomMtg.join({
          signature: config.signature,
          meetingNumber: config.meetingNumber,
          passWord: config.passcode || "",
          userName: name,
          success: function () {
            bootMessage.remove();
            report("zoom-status", "Live");
          },
          error: function (error) {
            console.error(error);
            const detail = error && (error.reason || error.errorMessage || error.message);
            bootMessage.textContent = detail
              ? "Could not join Zoom: " + detail
              : "Could not join the Zoom meeting.";
            report("zoom-status", bootMessage.textContent);
          }
        });
      },
      error: function (error) {
        clearTimeout(initTimeout);
        console.error(error);
        const detail = error && (error.reason || error.errorMessage || error.message);
        bootMessage.textContent = detail
          ? "Could not start Zoom: " + detail
          : "Could not start Zoom.";
        report("zoom-status", bootMessage.textContent);
      }
    });
  } catch (error) {
    console.error(error);
    const message = error && error.name === "AbortError"
      ? "Timed out while getting Zoom access."
      : (error.message || "Zoom is not configured yet.");
    bootMessage.textContent = message;
    report("zoom-config-error", message);
  }
}

startZoom();
