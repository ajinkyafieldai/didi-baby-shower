#!/usr/bin/env node
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const command = args[0] || "help";
const baseUrl = (process.env.BABYSHOWER_URL || "").replace(/\/$/, "");
const clientId = process.env.BABYSHOWER_CLIENT_ID || `photobooth-${randomUUID()}`;

function usage() {
  console.log(`Usage:
  BABYSHOWER_URL=https://example.com node photobooth.js run
  BABYSHOWER_URL=https://example.com node photobooth.js capture
  BABYSHOWER_URL=https://example.com node photobooth.js health

Environment:
  BABYSHOWER_URL        Required. Event site base URL.
  BABYSHOWER_CLIENT_ID  Optional stable client id.
  BABYSHOWER_CAPTURE    Optional capture backend command (default: flameshot).
`);
}

function requireBaseUrl() {
  if (!baseUrl) {
    console.error("BABYSHOWER_URL is required.");
    process.exit(2);
  }
}

async function postJson(path, body) {
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function getJson(path) {
  const response = await fetch(baseUrl + path, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function heartbeat(lastEventSeq = 0, latencyMs = null, status = "ready") {
  return postJson("/api/events", {
    type: "telemetry",
    clientId,
    role: "photobooth",
    latencyMs,
    lastEventSeq,
    visible: true,
    status
  });
}

async function runProcess(cmd, argv) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed (${signal || code})`));
    });
  });
}

async function captureImage() {
  const capture = process.env.BABYSHOWER_CAPTURE || "flameshot";
  await access("/usr/bin/env").catch(() => {});
  const dir = await mkdtemp(join(tmpdir(), "babyshower-photo-"));
  const path = join(dir, `family-photo-${Date.now()}.png`);

  try {
    if (capture === "flameshot") {
      await runProcess("flameshot", ["full", "-p", path]);
    } else {
      await runProcess(capture, [path]);
    }

    const bytes = await readFile(path);
    if (!bytes.length) throw new Error("Capture produced an empty image.");

    const response = await fetch(baseUrl + "/api/photos", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-Photo-Name": path.split("/").pop()
      },
      body: bytes
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Photo upload failed: HTTP ${response.status}`);
    return data;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function captureOnce() {
  requireBaseUrl();
  const started = Date.now();
  console.log("Capturing family photo...");
  try {
    const result = await captureImage();
    const latencyMs = Date.now() - started;
    await heartbeat(0, latencyMs, "ready");
    console.log(`Uploaded ${result.key} in ${latencyMs} ms`);
    return result;
  } catch (error) {
    await heartbeat(0, Date.now() - started, "error").catch(() => {});
    throw error;
  }
}

async function runPhotobooth() {
  requireBaseUrl();
  let lastEventSeq = 0;
  let initialized = false;
  let stopping = false;
  let lastHeartbeatAt = 0;

  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(`Photobooth ${clientId} connecting to ${baseUrl}`);

  while (!stopping) {
    const loopStarted = Date.now();
    try {
      const data = await getJson(`/api/events?since=${lastEventSeq}`);

      if (!initialized) {
        lastEventSeq = Number(data.seq || 0);
        initialized = true;
      } else {
        const events = Array.isArray(data.events) ? data.events : [];
        for (const event of events.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))) {
          const seq = Number(event.seq || 0);
          if (seq <= lastEventSeq) continue;

          if (event.type === "command" && event.command === "photo.capture") {
            console.log(`[${new Date().toISOString()}] photo.capture from ${event.sender || "operator"}`);
            await heartbeat(lastEventSeq, null, "capturing");
            try {
              const started = Date.now();
              const result = await captureImage();
              console.log(`Uploaded ${result.key} in ${Date.now() - started} ms`);
              await heartbeat(seq, Date.now() - started, "ready");
            } catch (error) {
              console.error("Capture failed:", error.message);
              await heartbeat(seq, null, "error").catch(() => {});
            }
          }

          lastEventSeq = Math.max(lastEventSeq, seq);
        }
      }

      if (typeof data.seq === "number") lastEventSeq = Math.max(lastEventSeq, data.seq);

      if (Date.now() - lastHeartbeatAt >= 5000) {
        await heartbeat(lastEventSeq, Date.now() - loopStarted, "ready");
        lastHeartbeatAt = Date.now();
      }
    } catch (error) {
      console.error("Photobooth sync failed:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  console.log("Photobooth stopped.");
}

async function health() {
  requireBaseUrl();
  const started = Date.now();
  const data = await heartbeat(0, null, "ready");
  console.log(JSON.stringify({
    clientId,
    url: baseUrl,
    latencyMs: Date.now() - started,
    telemetry: data.telemetry || null
  }, null, 2));
}

try {
  if (command === "run") await runPhotobooth();
  else if (command === "capture") await captureOnce();
  else if (command === "health") await health();
  else usage();
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
}
