import type { IncomingMessage, ServerResponse } from "node:http";

const endpoints = new Map([["snapshot", "GET"], ["audit", "GET"], ["report", "POST"]]);

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  function error(status: number, message: string) {
    res.statusCode = status;
    res.end(JSON.stringify({ error: message }));
  }

  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  const endpoint = query.get("endpoint") ?? "";
  const method = endpoints.get(endpoint);
  if (!method) return error(404, "Unknown lottery endpoint");
  if (req.method !== method) return error(405, "Method not allowed");
  const round = query.get("round");
  if (round !== null && !/^\d{1,13}$/.test(round)) return error(400, "Invalid round");
  const origin = process.env.LOTTERY_KEEPER_UPSTREAM_URL;
  if (!origin) return error(503, "Lottery Keeper temporarily unavailable");

  try {
    const base = new URL(origin);
    if (base.protocol !== "https:" || base.username || base.password) return error(503, "Lottery Keeper unavailable");
    const target = new URL(`/${endpoint}`, base);
    if (round !== null) target.searchParams.set("round", round);
    let body: string | undefined;
    if (method === "POST") {
      if (req.body !== undefined) {
        body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      } else {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const part of req) {
          const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
          length += chunk.length;
          if (length > 2048) return error(413, "Report is too large");
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      if (Buffer.byteLength(body) > 2048) return error(413, "Report is too large");
    }
    const reply = await fetch(target, { method, body, redirect: "error", signal: AbortSignal.timeout(25_000),
      headers: { Accept: "application/json", "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" } });
    if (!reply.headers.get("content-type")?.startsWith("application/json")) {
      return error(502, "Lottery Keeper temporarily unavailable");
    }
    const digest = reply.headers.get("x-audit-digest");
    if (digest && /^0x[\da-f]{64}$/i.test(digest)) res.setHeader("X-Audit-Digest", digest);
    res.statusCode = reply.status;
    res.end(await reply.text());
  } catch {
    error(502, "Lottery Keeper temporarily unavailable");
  }
}
