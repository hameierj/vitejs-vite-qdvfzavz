// handoff-run — edge function
// Generates a structured sales handoff document.
// Primary source: HubSpot CRM data (company, contacts, deals, activity)
// Enrichment: optional call transcript
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function callAI(key: string, prompt: string, sys = "", tokens = 2500, retries = 4): Promise<string> {
  const sysMsg = sys || "You are a senior B2B customer success strategist. Extract and structure information precisely. Return only valid JSON.";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: tokens,
          system: sysMsg,
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

  try {
    const { hubspotData, transcript, workspaceId } = await req.json();

    if (!hubspotData && (!transcript || transcript.trim().length < 50)) {
      return new Response(JSON.stringify({ error: "hubspotData or transcript (min 50 chars) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the prompt — HubSpot data is structured foundation, transcript is enrichment
    const closedWonDate = hubspotData?.closedWonDate
      ? new Date(hubspotData.closedWonDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;

    const hubspotSection = hubspotData ? `
HUBSPOT CRM DATA (source of truth):
${closedWonDate ? `IMPORTANT: This deal closed on ${closedWonDate}. All activity below is from the pre-sale period (before close). Use it to understand the sales cycle, pain points discussed, and what was promised during the sales process.` : ""}

Company:
${JSON.stringify(hubspotData.company || {}, null, 2)}

Contacts (${(hubspotData.contacts || []).length}):
${JSON.stringify(hubspotData.contacts || [], null, 2).slice(0, 3000)}

Deals (${(hubspotData.deals || []).length}):
${JSON.stringify(hubspotData.deals || [], null, 2).slice(0, 2000)}

Pre-Sale Activity — emails (company + contact level) and notes (${(hubspotData.activity || []).length} items):
${JSON.stringify(hubspotData.activity || [], null, 2).slice(0, 4000)}
` : "";

    const transcriptSection = transcript?.trim() ? `
SALES CALL TRANSCRIPT (additional context — use to fill gaps in HubSpot data):
${transcript.slice(0, 12000)}
` : "";

    const prompt = `You are creating a structured sales-to-CS handoff document for the B2B Rocket customer success team.
${hubspotData ? "HubSpot is the source of truth. Use CRM data as the primary source; the transcript adds nuance and fills gaps." : "Use the transcript as the primary data source."}

${hubspotSection}
${transcriptSection}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "companyName": "company name",
  "companyDomain": "website domain",
  "companyContext": "2-3 sentence summary: what the company does, their size/stage, current situation",
  "industry": "industry vertical",
  "painPoints": ["specific pain point 1", "...up to 6 pain points — be specific, not generic"],
  "useCase": "the specific use case for B2B Rocket (2-3 sentences)",
  "keyContacts": [
    { "name": "Full Name", "title": "Job Title", "email": "email", "phone": "phone if known", "role": "champion|decision-maker|user|blocker", "notes": "anything notable" }
  ],
  "dealDetails": {
    "dealName": "HubSpot deal name if available",
    "dealStage": "current pipeline stage",
    "dealValue": "amount if available",
    "closeDate": "expected close date",
    "budget": "budget discussed",
    "timeline": "desired go-live timeline",
    "decisionMakers": "who makes the final call",
    "competitors": "other vendors they're evaluating",
    "currentStack": "relevant tools they use"
  },
  "nextSteps": ["specific agreed next step 1", "..."],
  "callSummary": "1-2 sentence exec summary of the relationship so far",
  "fitScore": 1-10 integer based on available data,
  "fitReason": "one sentence explaining the fit score",
  "hubspotOwner": "HubSpot owner full name — use company.ownerName if present, otherwise resolve from hubspot_owner_id if you can, otherwise omit",
  "lastActivity": "date and type of last pre-close CRM activity",
  "closedWonDate": "the deal close date if known, else null"
}`;

    const raw = await callAI(anthropicKey, prompt);

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
    handoff.sources = { hubspot: !!hubspotData, transcript: !!(transcript?.trim()) };

    // Save to documents table
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

        // Update workspace name from HubSpot company name if not already set
        if (hubspotData?.company?.name) {
          await sb.from("workspaces")
            .update({ hubspot_synced_at: new Date().toISOString() })
            .eq("id", workspaceId);
        }
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
