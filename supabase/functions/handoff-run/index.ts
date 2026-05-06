// handoff-run — edge function
// Input: { transcript: string, workspaceId: string }
// Calls Claude to produce a structured sales handoff document.
// Saves the result to the documents table and returns it synchronously.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL          (auto-set by Supabase runtime)
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callAI(
  anthropicKey: string,
  prompt: string,
  sys = "",
  tokens = 2000,
  retries = 4,
): Promise<string> {
  const sysMsg = sys || "You are a senior B2B sales strategist. Extract structured information precisely. Return only valid JSON.";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: tokens,
          system: sysMsg,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(55000),
      });
      if (r.status === 429 || r.status === 529 || r.status >= 500) {
        if (attempt < retries) { await sleep(Math.min(1000 * Math.pow(2, attempt), 20000)); continue; }
        return "";
      }
      const json = await r.json();
      return json.content?.[0]?.text ?? "";
    } catch (e) {
      if (attempt < retries) { await sleep(1000 * Math.pow(2, attempt)); continue; }
      return "";
    }
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { transcript, workspaceId } = await req.json();

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 50) {
      return new Response(JSON.stringify({ error: "transcript is required (min 50 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are analyzing a B2B sales discovery call transcript. Extract a structured handoff document for the customer success team.

TRANSCRIPT:
${transcript.slice(0, 24000)}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "companyName": "company name from the transcript",
  "companyContext": "2-3 sentence summary of what the company does, their size/stage, and current situation",
  "painPoints": ["specific pain point 1", "specific pain point 2", "...up to 6 pain points"],
  "useCase": "the specific use case or problem they want B2B Rocket to solve (2-3 sentences)",
  "keyContacts": [
    { "name": "Full Name", "title": "Job Title", "email": "email if mentioned", "phone": "phone if mentioned", "notes": "anything notable about this person" }
  ],
  "dealDetails": {
    "budget": "budget range or 'Not discussed'",
    "timeline": "desired timeline or urgency",
    "decisionMakers": "who makes the final decision",
    "competitors": "other vendors they mentioned evaluating",
    "currentStack": "relevant tools/platforms they mentioned"
  },
  "nextSteps": ["next step 1", "next step 2", "..."],
  "callSummary": "1-2 sentence exec summary of the whole call",
  "fitScore": 1-10 integer for how good a fit they appear to be based on the transcript,
  "fitReason": "one sentence explaining the fit score"
}`;

    const raw = await callAI(anthropicKey, prompt, undefined, 2000);

    let handoff: any;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      handoff = JSON.parse(jsonMatch?.[0] ?? raw);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    handoff.generatedAt = new Date().toISOString();

    // Save to documents table if workspaceId provided
    if (workspaceId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data: existing } = await sb
          .from("documents")
          .select("id, version")
          .eq("workspace_id", workspaceId)
          .eq("type", "handoff")
          .order("version", { ascending: false })
          .limit(1)
          .single();

        await sb.from("documents").insert({
          workspace_id: workspaceId,
          type: "handoff",
          version: (existing?.version ?? 0) + 1,
          content: handoff,
        });
      }
    }

    return new Response(JSON.stringify({ handoff }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
