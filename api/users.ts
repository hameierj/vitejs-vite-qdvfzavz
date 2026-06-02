import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured on server" });
  }

  const baseUrl = `${SUPABASE_URL}/auth/v1/admin/users`;
  const headers = {
    "Content-Type": "application/json",
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  };

  if (req.method === "POST") {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    const r = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || "Failed to create user" });
    return res.status(200).json({ id: data.id });
  }

  if (req.method === "PUT") {
    const { id, password, name, role } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const body: Record<string, unknown> = { user_metadata: { name, role } };
    if (password) body.password = password;
    const r = await fetch(`${baseUrl}/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || "Failed to update user" });
    return res.status(200).json({ id: data.id });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const r = await fetch(`${baseUrl}/${id}`, {
      method: "DELETE",
      headers,
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: (data as any).message || "Failed to delete user" });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
