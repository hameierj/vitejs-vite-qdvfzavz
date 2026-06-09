import { SUPABASE_URL, SUPABASE_KEY } from "./supabase";

interface CallOpts {
  // When true, the system prompt is sent as a cacheable block. Use for calls
  // that share a large, static system prompt (rubrics, frameworks, schemas) so
  // repeated calls within the 5-min window reuse the cached prefix instead of
  // re-billing it. The prefix must be ~1024+ tokens for the cache to activate.
  cacheSystem?: boolean;
}

export async function callClaude(
  prompt: string,
  system: string,
  maxTokens: number,
  model: "haiku" | "sonnet" = "haiku",
  opts: CallOpts = {}
): Promise<string> {
  // Resolve the key the same way the rest of the app does (getApiKey in App.tsx):
  // a cloud-loaded key lives on window.__B2BR_API_KEY__ and may not be mirrored
  // to localStorage, so check both — otherwise browser AI features fail with a
  // spurious "No API key" even though the app has one.
  const apiKey = (() => {
    try { return ((window as any).__B2BR_API_KEY__ || localStorage.getItem("b2br_api_key") || "").trim(); }
    catch { return ((window as any).__B2BR_API_KEY__ || "").trim(); }
  })();
  if (!apiKey) throw new Error("No Anthropic API key found. Add it in the API Keys settings.");
  const modelId = model === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";

  // Cacheable system prompts are sent as a content-block array with
  // cache_control; plain strings otherwise (no caching overhead).
  const systemField = opts.cacheSystem
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : system;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system: systemField,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as any).error?.message || `Claude error ${resp.status}`);
  }
  const data = await resp.json();
  return (data.content?.[0]?.text || "").trim();
}

// Call Claude through the server-side ai-proxy edge function, which holds the
// ANTHROPIC_API_KEY as a Supabase secret. Browser AI features should prefer this
// over callClaude() so they don't depend on a valid user/localStorage key.
// The proxy always streams (SSE); we accumulate the text deltas and return the
// full text, so callers can use it exactly like callClaude(). Falls back to the
// direct browser call when the proxy isn't configured.
export async function callClaudeProxy(
  prompt: string,
  system: string,
  maxTokens: number,
  model: "haiku" | "sonnet" = "sonnet"
): Promise<string> {
  if (!SUPABASE_URL) return callClaude(prompt, system, maxTokens, model);
  const modelId = model === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok || !resp.body) {
    let msg = `AI proxy error ${resp.status}`;
    try { const j = await resp.json(); msg = (j as any)?.error?.message || msg; } catch { /* not json */ }
    throw new Error(msg);
  }

  // Accumulate the Anthropic SSE stream into the full response text.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      let evt: any;
      try { evt = JSON.parse(data); } catch { continue; }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") out += evt.delta.text;
      else if (evt.type === "error" && evt.error?.message) throw new Error(evt.error.message);
    }
  }
  return out.trim();
}

export function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/s);
    return JSON.parse(match ? match[1] : raw) as T;
  } catch {
    return fallback;
  }
}
