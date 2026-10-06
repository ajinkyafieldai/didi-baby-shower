import { existsSync, readFileSync } from "node:fs";

const requiredPages = ["index.html", "zoom.html", "host.html", "projector.html"];

for (const page of requiredPages) {
  const path = `dist/${page}`;
  if (!existsSync(path)) {
    console.error(`ERROR: missing built entrypoint ${path}`);
    process.exit(1);
  }
}

const zoomHtml = readFileSync("dist/zoom.html", "utf8");
if (zoomHtml.includes("@zoom/meetingsdk")) {
  console.error("ERROR: dist/zoom.html still contains bare @zoom/meetingsdk import.");
  process.exit(1);
}
if (!zoomHtml.includes("/assets/")) {
  console.error("ERROR: dist/zoom.html does not reference a bundled Vite asset.");
  process.exit(1);
}

for (const page of ["host.html", "projector.html"]) {
  const html = readFileSync(`dist/${page}`, "utf8");
  if (!html.includes("/assets/")) {
    console.error(`ERROR: dist/${page} does not reference bundled assets.`);
    process.exit(1);
  }
}

console.log("Verified: guest, Zoom, host, and projector pages are built.");
