import type { VercelRequest, VercelResponse } from "@vercel/node";

const GAMMA_BASE = "https://public-api.gamma.app/v1.0";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GAMMA_API_KEY || "";
  if (!apiKey) {
    return res.status(500).json({ error: "GAMMA_API_KEY is not configured on the server" });
  }

  // POST /api/gamma → create a generation
  if (req.method === "POST") {
    const upstream = await fetch(`${GAMMA_BASE}/generations`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  }

  // GET /api/gamma?id=xxx → poll generation status
  if (req.method === "GET") {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const upstream = await fetch(`${GAMMA_BASE}/generations/${id}`, {
      headers: { "X-API-KEY": apiKey },
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
