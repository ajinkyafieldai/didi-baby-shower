(function () {
  var bootMessage = document.getElementById("boot-message");
  var name = new URLSearchParams(location.search).get("name") || "Guest";

  function report(type, text) {
    parent.postMessage({ type: type, text: text }, location.origin);
  }

  function stage(text) {
    bootMessage.textContent = text;
    report("zoom-status", text);
  }

  function detail(error) {
    if (!error) return "";
    return error.reason || error.errorMessage || error.message || String(error);
  }

  async function captureVisibleZoomSurface() {
    var rootRect = document.documentElement.getBoundingClientRect();
    var width = Math.max(1, Math.round(window.innerWidth || rootRect.width));
    var height = Math.max(1, Math.round(window.innerHeight || rootRect.height));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#161215";
    ctx.fillRect(0, 0, width, height);

    var sources = Array.prototype.slice.call(document.querySelectorAll("canvas, video"))
      .filter(function (element) {
        var rect = element.getBoundingClientRect();
        var style = getComputedStyle(element);
        return (
          rect.width > 8 &&
          rect.height > 8 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || 1) > 0
        );
      })
      .sort(function (a, b) {
        var ar = a.getBoundingClientRect();
        var br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });

    if (!sources.length) {
      throw new Error("Zoom has no visible video/canvas surface to capture.");
    }

    var drawn = 0;
    for (var i = 0; i < sources.length; i += 1) {
      var source = sources[i];
      var rect = source.getBoundingClientRect();

      try {
        ctx.drawImage(
          source,
          Math.round(rect.left),
          Math.round(rect.top),
          Math.round(rect.width),
          Math.round(rect.height)
        );
        drawn += 1;
      } catch (error) {
        console.warn("Could not draw Zoom surface", source, error);
      }
    }

    if (!drawn) {
      throw new Error("Zoom video surfaces could not be drawn.");
    }

    var blob = await new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (result) {
          if (result) resolve(result);
          else reject(new Error("Zoom capture produced no image."));
        }, "image/jpeg", 0.92);
      } catch (error) {
        reject(error);
      }
    });

    return blob;
  }

  window.addEventListener("message", async function (event) {
    if (event.origin !== location.origin || event.source !== parent) return;

    var message = event.data || {};
    if (message.type !== "zoom-capture-request") return;

    try {
      var blob = await captureVisibleZoomSurface();
      parent.postMessage({
        type: "zoom-capture-result",
        requestId: message.requestId,
        blob: blob
      }, location.origin);
    } catch (error) {
      parent.postMessage({
        type: "zoom-capture-result",
        requestId: message.requestId,
        error: detail(error) || "Zoom capture failed."
      }, location.origin);
    }
  });

  async function startZoom() {
    try {
      if (!window.ZoomMtg) {
        throw new Error("Zoom CDN loaded but ZoomMtg was not created.");
      }

      stage("Getting video access…");

      var controller = new AbortController();
      var signatureTimeout = setTimeout(function () {
        controller.abort();
      }, 10000);

      var response = await fetch("/api/zoom-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
        signal: controller.signal
      });

      clearTimeout(signatureTimeout);

      var config = await response.json();

      if (!response.ok) {
        throw new Error(config.error || "Zoom is not configured.");
      }

      stage("Loading video engine…");

      console.log("Zoom requirements", ZoomMtg.checkSystemRequirements());

      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      stage("Loading video call…");

      ZoomMtg.i18n.load("en-US");
      ZoomMtg.i18n.onLoad(function () {
        stage("Starting video call…");

        ZoomMtg.init({
          leaveUrl: location.origin + "/",
          disableCORP: !window.crossOriginIsolated,
          disablePreview: true,
          patchJsMedia: true,

          // Keep the Meeting SDK as close as possible to a plain video surface.
          // These are supported Client View options; no brittle DOM/CSS surgery.
          disableZoomLogo: true,
          disableInvite: true,
          disableCallOut: true,
          disableZoomPhone: true,
          disableReport: true,
          disableRecord: true,
          disablePictureInPicture: true,
          isSupportChat: false,
          isSupportCC: false,
          isSupportBreakout: false,
          isSupportPolling: false,
          isSupportQA: false,
          isSupportNonverbal: false,
          videoHeader: false,
          meetingInfo: [],
          theme: "dark",
          success: function () {
            stage("Joining the family call…");

            ZoomMtg.join({
              signature: config.signature,
              meetingNumber: config.meetingNumber,
              passWord: config.passcode || "",
              userName: name,
              success: function () {
                if (bootMessage && bootMessage.parentNode) {
                  bootMessage.parentNode.removeChild(bootMessage);
                }
                report("zoom-status", "Live");
              },
              error: function (error) {
                console.error("Zoom join error", error);
                var d = detail(error);
                bootMessage.textContent = d
                  ? "Could not join video call: " + d
                  : "Could not join the video call.";
                report("zoom-status", bootMessage.textContent);
              }
            });
          },
          error: function (error) {
            console.error("Zoom init error", error);
            var d = detail(error);
            bootMessage.textContent = d
              ? "Could not start video call: " + d
              : "Could not start video call.";
            report("zoom-status", bootMessage.textContent);
          }
        });
      });
    } catch (error) {
      console.error(error);
      var message = error && error.name === "AbortError"
        ? "Timed out while getting Zoom access."
        : (error.message || "Video call startup failed.");
      bootMessage.textContent = message;
      report("zoom-config-error", message);
    }
  }

  startZoom();
})();
