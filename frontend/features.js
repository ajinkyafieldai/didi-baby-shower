// Front-end feature manifest.
//
// Disable a feature by changing its value to false. The DOM, navigation entry,
// and feature-specific auto-behaviour are suppressed without deleting code.
//
// Keep this file front-end only. Backend capability negotiation can be layered
// on later without changing the UI modules.
export const FEATURES = Object.freeze({
  videoCall: true,
  rituals: true,
  familyPhoto: true,

  babyNames: true,
  didiQuiz: true,

  familyHub: true,
  familyWall: true,
  familyTimeline: true,
  familyMap: true,
  timeCapsule: true,
  recipeBook: true,
  photoMosaic: true,
  guestRibbon: true,
  keepsake: true,
  afterparty: true
});

export function featureEnabled(name) {
  return FEATURES[name] !== false;
}

export function applyFeatureVisibility(root = document) {
  root.querySelectorAll("[data-feature]").forEach((element) => {
    const names = String(element.dataset.feature || "")
      .split(/\s+/)
      .filter(Boolean);

    const enabled = names.every(featureEnabled);
    element.hidden = !enabled;
    element.setAttribute("aria-hidden", enabled ? "false" : "true");

    if ("disabled" in element && !enabled) {
      element.disabled = true;
    }
  });
}
