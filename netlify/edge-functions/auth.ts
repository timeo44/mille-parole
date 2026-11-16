import type { Config, Context } from "@netlify/edge-functions";

// Zugangsdaten (nur serverseitig, werden nie an den Browser ausgeliefert)
const USER = "timeo";
const PASS = "italienischlernen";
const SECRET = "mp-7f3c9a1e5b2d48e6a0c4f91b3d7e2a58";
const COOKIE = "mp_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return token === (await sign(USER));
}

function loginPage(error = false, status = 401): Response {
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#d6322a">
<meta name="robots" content="noindex">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<title>Mille parole – Anmelden</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100svh;background:#d6322a;color:#1a1517;font:16px/1.5 Inter,system-ui,sans-serif;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 18px max(24px,env(safe-area-inset-bottom))}
.wrap{width:100%;max-width:380px}
h1{margin:0 0 18px;color:#fff;font:400 52px/1 "Instrument Serif",Georgia,serif;text-align:center}
h1 i{color:#f6c445}
form{background:#fff;border-radius:22px;padding:26px 22px;box-shadow:0 24px 50px -24px rgba(60,10,10,.6);display:grid;gap:14px}
label{font-size:14px;font-weight:600;display:grid;gap:6px}
input{font:inherit;font-size:16px;min-height:50px;border:1.5px solid #e8e1e2;border-radius:12px;padding:0 14px;color:#1a1517;background:#fff}
input:focus{outline:3px solid #f6c445;outline-offset:1px}
button{font:inherit;font-weight:600;min-height:52px;border:0;border-radius:12px;background:#d6322a;color:#fff;cursor:pointer;margin-top:4px}
button:active{background:#b0241d}
.err{background:#fde8e6;color:#b0241d;border-radius:10px;padding:10px 12px;font-size:14px}
p{color:#fff;opacity:.85;text-align:center;font-size:14px;margin:16px 0 0}
</style></head><body>
<div class="wrap">
<h1>Mille <i>parole</i></h1>
<form method="post" action="/login">
${error ? '<div class="err">Benutzername oder Passwort stimmt nicht.</div>' : ""}
<label>Benutzername<input name="u" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
<label>Passwort<input name="p" type="password" autocomplete="current-password" required></label>
<button>Anmelden</button>
</form>
<p>Die 1000 häufigsten italienischen Wörter</p>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);

  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    const u = String(form.get("u") ?? "").trim().toLowerCase();
    const p = String(form.get("p") ?? "");
    if (u === USER && p === PASS) {
      const token = await sign(USER);
      return new Response(null, {
        status: 303,
        headers: {
          location: "/",
          "set-cookie": `${COOKIE}=${token}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`,
          "cache-control": "no-store",
        },
      });
    }
    return loginPage(true);
  }

  if (url.pathname === "/logout") {
    return new Response(null, {
      status: 303,
      headers: {
        location: "/",
        "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        "cache-control": "no-store",
      },
    });
  }

  if (await validToken(context.cookies.get(COOKIE))) {
    if (url.pathname === "/login") return Response.redirect(new URL("/", request.url), 303);
    const next = await context.next();
    const res = new Response(next.body, next);
    res.headers.set("cache-control", "no-store");
    return res;
  }

  return loginPage(false, url.pathname === "/login" ? 200 : 401);
};

export const config: Config = {
  path: "/*",
  excludedPath: ["/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"],
};
