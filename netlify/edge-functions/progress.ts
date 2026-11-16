import type { Config } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";

// Läuft nach auth.ts (alphabetisch) – nur angemeldete Anfragen kommen hier an.
const store = () => getStore({ name: "lernstand", region: "eu-central-1", consistency: "strong" });
const KEY = "timeo";

type Progress = { b: Record<string, number>; u: Record<string, number>; r: number };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const valid = (p: any): p is Progress =>
  p && typeof p === "object" && typeof p.b === "object" && typeof p.u === "object" && typeof p.r === "number";

export default async (request: Request) => {
  if (request.method === "GET") {
    const data = await store().get(KEY, { type: "json" });
    return json(data ?? { b: {}, u: {}, r: 0 });
  }

  if (request.method === "PUT" || request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Ungültiges JSON" }, 400);
    }
    if (!valid(body)) return json({ error: "Ungültige Daten" }, 400);

    // Serverseitig nochmal zusammenführen, damit kein Gerät neuere Einträge überschreibt
    const old = ((await store().get(KEY, { type: "json" })) ?? { b: {}, u: {}, r: 0 }) as Progress;
    const r = Math.max(old.r || 0, body.r || 0);
    const out: Progress = { b: {}, u: {}, r };
    for (const src of [old, body]) {
      for (const k of Object.keys(src.b)) {
        const t = src.u[k] ?? 0;
        if (t < r) continue;
        if (out.u[k] === undefined || t >= out.u[k]) {
          out.b[k] = Math.max(0, Math.min(5, Number(src.b[k]) || 0));
          out.u[k] = t;
        }
      }
    }
    await store().setJSON(KEY, out);
    return json(out);
  }

  return json({ error: "Methode nicht erlaubt" }, 405);
};

export const config: Config = { path: "/api/progress", method: ["GET", "PUT", "POST"] };
