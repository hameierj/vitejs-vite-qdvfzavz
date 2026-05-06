// comms-analyze — analyze communication log touchpoints
// Input: { workspaceId: string, touchpoints: Touchpoint[] }
// Returns: flags (risk/opportunity signals) + recommended actions
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function callAI(key: string, prompt: string, tokens = 1500, retries = 4): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: tokens,
          system: "You are a senior customer success strategist. Analyze B2B client relationships and identify risks and opportunities. Return only valid JSON.",
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(55000),
      });
      if (r.status === 429 || r.status >= 500) {
        if (attempt < retries) { await sleep(Math.min(1000 * Math.pow(2, attempt), 20000)); continue; }
        return "";
      }
      const json = await r.json();
      return json.content?.[0]?.text ?? "";
    } catch {
      if (attempt < retries) { await sleep(1000 * Math.pow(2, attempt)); continue; }
      return "";
    }
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";

  try {
    const { workspaceId, touchpoints } = await req.json();

    if (!Array.isArray(touchpoints) || touchpoints.length === 0) {
      return new Response(JSON.stringify({ error: "touchpoints array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load existing handoff doc for context
    let existingContext = "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (supabaseUrl && supabaseKey && workspaceId) {
      const sb = createClient(supabaseUrl, supabaseKey);
      const { data: doc } = await sb
        .from("documents")
        .select("content")
        .eq("workspace_id", workspaceId)
        .eq("type", "handoff")
        .order("version", { ascending: false })
        .limit(1)
        .single();
      if (doc?.content) existingContext = JSON.stringify(doc.content).slice(0, 2000);
    }

    const prompt = `You are analyzing the client communication history for a B2B customer success team.

${existingContext ? `CLIENT CONTEXT (from handoff doc):\n${existingContext}\n\n` : ""}COMMUNICATION LOG (${touchpoints.length} touchpoints):
${JSON.stringify(touchpoints, null, 2).slice(0, 10000)}

Analyze this communication history and return ONLY a JSON object:
{
  "flags": [
    {
      "id": "flag_1",
      "type": "risk" | "opportunity" | "info",
      "severity": "high" | "medium" | "low",
      "title": "short flag title",
      "description": "2-3 sentences explaining the flag",
      "recommendedAction": "specific action the CS team should take",
      "relatedTouchpointIds": ["tp_id_1"]
    }
  ],
  "healthScore": 1-10 integer (overall relationship health),
  "healthSummary": "2 sentence assessment of the client relationship",
  "daysSinceContact": estimated days since last meaningful contact (integer),
  "momentum": "positive" | "neutral" | "declining"
}

Focus on:
- Response patterns (going silent, slowing down)
- Sentiment shifts (excited → hesitant)
- Unresolved action items
- Expansion signals (asking about more features/seats)
- Risk signals (escalation, cancellation language, champion left)`;

    const raw = await callAI(anthropicKey, prompt);
    let result: any;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(match?.[0] ?? raw);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
