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

  async function startZoom() {
    try {
      if (!window.ZoomMtg) {
        throw new Error("Zoom CDN loaded but ZoomMtg was not created.");
      }

      stage("Getting Zoom access…");

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

      stage("Loading Zoom video engine…");

      console.log("Zoom requirements", ZoomMtg.checkSystemRequirements());

      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      stage("Loading Zoom language…");

      ZoomMtg.i18n.load("en-US");
      ZoomMtg.i18n.onLoad(function () {
        stage("Starting Zoom…");

        ZoomMtg.init({
          leaveUrl: location.origin + "/",
          disableCORP: !window.crossOriginIsolated,
          patchJsMedia: true,
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
                  ? "Could not join Zoom: " + d
                  : "Could not join the Zoom meeting.";
                report("zoom-status", bootMessage.textContent);
              }
            });
          },
          error: function (error) {
            console.error("Zoom init error", error);
            var d = detail(error);
            bootMessage.textContent = d
              ? "Could not start Zoom: " + d
              : "Could not start Zoom.";
            report("zoom-status", bootMessage.textContent);
          }
        });
      });
    } catch (error) {
      console.error(error);
      var message = error && error.name === "AbortError"
        ? "Timed out while getting Zoom access."
        : (error.message || "Zoom startup failed.");
      bootMessage.textContent = message;
      report("zoom-config-error", message);
    }
  }

  startZoom();
})();
