import { readFileSync } from "node:fs";

const html = readFileSync("dist/zoom.html", "utf8");

if (html.includes("@zoom/meetingsdk")) {
  console.error("ERROR: dist/zoom.html still contains bare @zoom/meetingsdk import.");
  process.exit(1);
}

if (!html.includes("/assets/")) {
  console.error("ERROR: dist/zoom.html does not reference a bundled Vite asset.");
  process.exit(1);
}

console.log("Verified: Zoom page is Vite-bundled.");
