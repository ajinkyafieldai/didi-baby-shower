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

    if (!element.dataset.featureInitialHidden) {
      element.dataset.featureInitialHidden = element.hidden ? "true" : "false";
    }

    const enabled = names.every(featureEnabled);
    const initiallyHidden = element.dataset.featureInitialHidden === "true";

    // Preserve UI state such as closed dialogs/tabs when a feature is enabled.
    // A feature flag may hide something; it should never force-open it.
    element.hidden = !enabled || initiallyHidden;
    element.toggleAttribute("data-feature-disabled", !enabled);

    if (!enabled) {
      element.setAttribute("aria-hidden", "true");
      if ("disabled" in element) element.disabled = true;
    }
  });
}
