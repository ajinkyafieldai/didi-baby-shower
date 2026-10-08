const DEFAULT_EVENT_ID = "didi-baby-shower";

const ACCENTS = Object.freeze({
  rose: {
    accent: "#A94762",
    accentSoft: "#F4DDE4"
  },
  haldi: {
    accent: "#C89018",
    accentSoft: "#F7E9B8"
  },
  mehendi: {
    accent: "#5E7A46",
    accentSoft: "#DFE8D7"
  }
});

function safeEventId(value) {
  const id = String(value || DEFAULT_EVENT_ID).trim();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) {
    throw new Error("Invalid event id.");
  }
  return id;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Event package request failed (${response.status}): ${url}`);
  }
  return response.json();
}

export async function loadEventPackage() {
  const params = new URLSearchParams(location.search);
  const eventId = safeEventId(params.get("event") || DEFAULT_EVENT_ID);
  const base = `/events/${eventId}`;

  const [manifest, content, theme] = await Promise.all([
    fetchJson(`${base}/event.yaml`),
    fetchJson(`${base}/content/content.json`),
    fetchJson(`${base}/theme/theme.json`)
  ]);

  if (manifest.id !== eventId) {
    throw new Error("Event package id does not match requested event.");
  }

  return Object.freeze({
    id: eventId,
    manifest,
    content,
    theme
  });
}

export function applyEventTheme(eventPackage, root = document.documentElement) {
  const accentName = String(eventPackage?.theme?.accent || "rose");
  const palette = ACCENTS[accentName] || ACCENTS.rose;
  root.dataset.eventAccent = accentName;
  root.style.setProperty("--event-accent", palette.accent);
  root.style.setProperty("--event-accent-soft", palette.accentSoft);
  root.style.setProperty("--rose-deep", palette.accent);
  root.style.setProperty("--rose", palette.accentSoft);
}

export function applyParticipantCopy(eventPackage, root = document) {
  const { manifest, content } = eventPackage;
  const title = String(manifest.title || "Apsila Event");
  const honoree = String(content.honoree_name || "").trim();

  root.title = title;

  root.querySelectorAll("[data-event-title]").forEach((element) => {
    element.textContent = title;
  });

  root.querySelectorAll("[data-event-welcome]").forEach((element) => {
    element.textContent = content.welcome_text || "";
  });

  root.querySelectorAll("[data-event-family-hub-title]").forEach((element) => {
    element.textContent = content.family_hub_title || "With the family";
  });

  root.querySelectorAll("[data-event-honoree]").forEach((element) => {
    element.textContent = honoree;
  });

  root.querySelectorAll("[data-event-honoree-possessive]").forEach((element) => {
    element.textContent = honoree ? `${honoree}'s` : "Family";
  });

  const quizLabel = root.querySelector('[data-game="didi"] span:last-child');
  if (quizLabel && honoree) quizLabel.textContent = `${honoree} quiz`;

  const memoryTitle = root.querySelector('[data-hub-view="timeline"] h3');
  if (memoryTitle && honoree) memoryTitle.textContent = `Add a ${honoree} memory`;

  const forHonoree = root.querySelector('input[name="audience"][value="didi"] + span');
  if (forHonoree && honoree) forHonoree.textContent = `For ${honoree}`;

  const hubDescription = root.querySelector(".blessing-head p");
  if (hubDescription && honoree) {
    hubDescription.textContent =
      `Everything the family leaves behind for ${honoree} and the baby.`;
  }
}
