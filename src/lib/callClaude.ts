export async function callClaude(
  prompt: string,
  system: string,
  maxTokens: number,
  model: "haiku" | "sonnet" = "haiku"
): Promise<string> {
  const apiKey = (() => { try { return localStorage.getItem("b2br_api_key") || ""; } catch { return ""; } })();
  if (!apiKey) throw new Error("No Anthropic API key found. Add it in the API Keys settings.");
  const modelId = model === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
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
      system,
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

export function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/s);
    return JSON.parse(match ? match[1] : raw) as T;
  } catch {
    return fallback;
  }
}
