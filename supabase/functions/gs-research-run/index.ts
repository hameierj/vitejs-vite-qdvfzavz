// gs-research-run — edge function
// Background runner for the Getting Started "Initial AI Research" step.
// Accepts { workspaceId, domain }, responds immediately with jobId, then
// runs the homepage fetch + Claude analysis under EdgeRuntime.waitUntil.
// Progress is written to app_data[gs_research_job_<workspaceId>] and the
// final brief is also merged into app_data[ws_<workspaceId>].companyData
// so the client picks it up on reload / workspace switch.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL          (auto-set by Supabase runtime)
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JOB_KEY = (wsId: string) => `gs_research_job_${wsId}`;

function uid(): string {
  return crypto.randomUUID();
}

async function writeJob(sb: SupabaseClient, wsId: string, patch: Record<string, unknown>) {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", JOB_KEY(wsId)).single();
    const current = data?.value ? JSON.parse(data.value as string) : {};
    const updated = { ...current, ...patch };
    await sb.from("app_data").upsert({ key: JOB_KEY(wsId), value: JSON.stringify(updated) }, { onConflict: "key" });
  } catch (e) {
    console.error("writeJob failed:", e);
  }
}

async function appendLog(sb: SupabaseClient, wsId: string, line: string) {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", JOB_KEY(wsId)).single();
    const current = data?.value ? JSON.parse(data.value as string) : {};
    const log = Array.isArray(current.log) ? current.log : [];
    log.push(line);
    await sb.from("app_data").upsert(
      { key: JOB_KEY(wsId), value: JSON.stringify({ ...current, log, phase: line }) },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("appendLog failed:", e);
  }
}

async function fetchPage(url: string, timeoutMs: number, limit: number): Promise<string> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return "";
    const t = await r.text();
    return t.slice(0, limit);
  } catch {
    return "";
  }
}

async function callClaude(anthropicKey: string, prompt: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      system: "You are a senior B2B go-to-market researcher. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`Claude error ${r.status}`);
  const json = await r.json();
  return json.content?.[0]?.text ?? "";
}

async function runPipeline(sb: SupabaseClient, anthropicKey: string, wsId: string, inputDomain: string): Promise<void> {
  let normUrl = inputDomain.trim();
  if (normUrl && !/^https?:\/\//i.test(normUrl)) normUrl = `https://${normUrl}`;
  const domain = normUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  await appendLog(sb, wsId, "Fetching homepage...");
  let pageContent = await fetchPage(normUrl, 20000, 12000);
  if (pageContent) {
    await appendLog(sb, wsId, `Fetched homepage (${Math.round(pageContent.length / 100) / 10}k chars)`);
  } else {
    await appendLog(sb, wsId, "Warning: could not fetch homepage — proceeding with limited data");
  }

  const extraPaths = ["/products", "/services", "/solutions", "/about", "/platform"];
  for (const path of extraPaths) {
    const sub = await fetchPage(`${normUrl}${path}`, 10000, 6000);
    if (sub && sub.length > 500) {
      pageContent += `\n\n${path.toUpperCase()} PAGE:\n${sub}`;
      await appendLog(sb, wsId, `Fetched ${path}`);
      break;
    }
  }

  await appendLog(sb, wsId, "Analyzing with Claude...");

  const prompt = `Analyze the following website content for ${domain} and produce a comprehensive pre-onboarding research brief for a B2B outreach team.

WEBSITE CONTENT:
${pageContent || "(no content fetched — use domain knowledge about " + domain + ")"}

DOMAIN: ${domain}

Return a JSON object:
{
  "generatedAt": "${new Date().toISOString()}",
  "domain": "${domain}",
  "sources": ["${normUrl}"],
  "companyOverview": {
    "name": "company name",
    "size": "estimated employee count or range",
    "stage": "startup/growth/established/enterprise",
    "businessModel": "B2B SaaS / agency / services / marketplace / etc."
  },
  "productsServices": [
    { "name": "product name", "description": "what it does in 1-2 sentences", "targetBuyer": "who buys this", "differentiator": "what makes it different" }
  ],
  "valuePropositions": [
    { "claim": "specific value claim", "evidence": "supporting evidence if any", "quantified": true/false }
  ],
  "targetMarketEvidence": {
    "industries": ["industry1", "industry2"],
    "companySizes": ["size range"],
    "knownCustomers": ["customer1 if mentioned"]
  },
  "competitivePositioning": {
    "category": "market category",
    "mainCompetitors": ["competitor1"],
    "differentiators": ["differentiator1", "differentiator2"]
  },
  "icpHypotheses": [
    { "name": "ICP name e.g. 'Mid-Market SaaS — VP Sales'", "rationale": "why this is likely an ICP", "confidence": "high/medium/low", "signals": ["signal1", "signal2"] }
  ],
  "recommendedAngles": [
    { "angle": "outbound angle name", "why": "why this angle works for this company", "bestChannel": "email/linkedin", "suggestedHook": "a concrete hook sentence to test" }
  ],
  "callPrepNotes": "A bulleted list of 5-8 things the CSM should confirm, ask, or validate during the onboarding call. Focus on gaps in the research and hypotheses that need validation.",
  "confidenceNotes": "1 sentence about the quality/completeness of the research — what was unclear or missing"
}

Return only valid JSON. Be specific and concrete — no vague marketing language.`;

  const raw = await callClaude(anthropicKey, prompt);

  let brief: any;
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/s);
    brief = JSON.parse(match ? match[1] : raw);
  } catch {
    brief = {
      generatedAt: new Date().toISOString(),
      domain,
      sources: [normUrl],
      callPrepNotes: raw,
      confidenceNotes: "Parse error — raw output shown in call prep notes.",
    };
  }

  await appendLog(sb, wsId, "Brief generated");

  // Only write to the job row. The client polls this and merges the brief
  // into its own state, then its normal save effect persists it back to
  // app_data[ws_<workspaceId>] — avoiding a race with concurrent client writes.
  await writeJob(sb, wsId, {
    status: "done",
    phase: "Complete",
    completedAt: new Date().toISOString(),
    result: brief,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const body = await req.json();
    const { workspaceId, domain } = body as { workspaceId?: string; domain?: string };

    if (!workspaceId || !domain) {
      return new Response(JSON.stringify({ error: "workspaceId and domain are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Supabase credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, supabaseKey);
    const jobId = uid();

    await sb.from("app_data").upsert(
      { key: JOB_KEY(workspaceId), value: JSON.stringify({
        jobId,
        status: "running",
        phase: "Starting...",
        log: ["Starting research..."],
        domain,
        startedAt: new Date().toISOString(),
      }) },
      { onConflict: "key" },
    );

    // @ts-ignore — EdgeRuntime is available in Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try {
        await runPipeline(sb, anthropicKey, workspaceId, domain);
      } catch (err) {
        console.error("gs-research pipeline failed:", err);
        await writeJob(sb, workspaceId, {
          status: "error",
          error: String((err as Error)?.message ?? err),
          completedAt: new Date().toISOString(),
        });
      }
    })());

    return new Response(JSON.stringify({ jobId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
