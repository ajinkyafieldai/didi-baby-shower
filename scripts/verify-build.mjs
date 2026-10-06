import { existsSync, readFileSync } from "node:fs";

const requiredPages = ["index.html", "video.html", "host.html", "projector.html"];

for (const page of requiredPages) {
  const path = `dist/${page}`;
  if (!existsSync(path)) {
    console.error(`ERROR: missing built entrypoint ${path}`);
    process.exit(1);
  }
}

const videoHtml = readFileSync("dist/video.html", "utf8");
if (!videoHtml.includes("/assets/")) {
  console.error("ERROR: dist/video.html does not reference a bundled Vite asset.");
  process.exit(1);
}

for (const page of ["host.html", "projector.html"]) {
  const html = readFileSync(`dist/${page}`, "utf8");
  if (!html.includes("/assets/")) {
    console.error(`ERROR: dist/${page} does not reference bundled assets.`);
    process.exit(1);
  }
}

console.log("Verified: guest, video, host, and projector pages are built.");
