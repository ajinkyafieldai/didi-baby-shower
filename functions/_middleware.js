const COOKIE_NAME = "baby_shower_access";

function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function accessToken(env) {
  if (!env.FAMILY_PIN || !env.ZOOM_CLIENT_SECRET) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.ZOOM_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("didi-baby-shower:" + env.FAMILY_PIN)
  );

  return base64Url(signature);
}

function readCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function gatePage() {
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#fff7f4">
  <title>Didi's Baby Shower</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 18% 15%, rgba(244,199,207,.38), transparent 24rem),
        radial-gradient(circle at 82% 28%, rgba(248,219,197,.48), transparent 28rem),
        #fffaf7;
      color: #422f35;
      font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif;
    }
    .card {
      width: min(100%, 25rem);
      padding: 28px 22px;
      border-radius: 24px;
      background: rgba(255,255,255,.9);
      box-shadow: 0 18px 60px rgba(75,44,52,.16);
      text-align: center;
    }
    .flower {
      width: 68px;
      height: 68px;
      margin: 0 auto 16px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: #f4c7cf;
      color: #a94762;
      font-size: 38px;
    }
    h1 {
      margin: 0 0 8px;
      font-family: Georgia, "Times New Roman", serif;
      font-weight: 500;
      font-size: 2rem;
    }
    p { margin: 0 0 18px; color: #7a6970; }
    form { display: grid; gap: 10px; }
    input {
      width: 100%;
      min-height: 54px;
      padding: 0 16px;
      border: 1px solid rgba(66,47,53,.14);
      border-radius: 16px;
      background: white;
      color: #422f35;
      font: inherit;
      font-size: 20px;
      text-align: center;
      letter-spacing: .18em;
      outline: none;
    }
    input:focus {
      border-color: #a94762;
      box-shadow: 0 0 0 4px rgba(169,71,98,.12);
    }
    button {
      min-height: 54px;
      border: 0;
      border-radius: 16px;
      background: #a94762;
      color: white;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .error { min-height: 1.4em; margin: 2px 0 0; color: #a94762; font-size: .9rem; }
  </style>
</head>
<body>
  <main class="card">
    <div class="flower" aria-hidden="true">✿</div>
    <h1>Didi's Baby Shower</h1>
    <p>Enter the family PIN to join.</p>
    <form id="pin-form">
      <input
        id="pin"
        name="pin"
        type="password"
        inputmode="numeric"
        autocomplete="one-time-code"
        placeholder="Family PIN"
        maxlength="12"
        required
        autofocus
      >
      <button id="enter" type="submit">Enter</button>
      <div id="error" class="error" role="status" aria-live="polite"></div>
    </form>
  </main>
  <script>
    const form = document.getElementById("pin-form");
    const input = document.getElementById("pin");
    const button = document.getElementById("enter");
    const error = document.getElementById("error");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      button.disabled = true;
      button.textContent = "Checking…";

      try {
        const response = await fetch("/api/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: input.value }),
          cache: "no-store"
        });

        if (!response.ok) {
          error.textContent = response.status === 401
            ? "That PIN is not correct."
            : "Could not unlock the page. Please try again.";
          input.select();
          return;
        }

        location.reload();
      } catch {
        error.textContent = "Could not unlock the page. Please try again.";
      } finally {
        button.disabled = false;
        button.textContent = "Enter";
      }
    });
  </script>
</body>
</html>`, {
    status: 401,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.pathname === "/api/unlock") {
    return context.next();
  }

  const expected = await accessToken(context.env);
  if (!expected) {
    return new Response("Family PIN is not configured.", {
      status: 503,
      headers: { "cache-control": "no-store" }
    });
  }

  const supplied = readCookie(context.request, COOKIE_NAME);
  if (supplied === expected) {
    return context.next();
  }

  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "PIN required" }), {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  return gatePage();
}
