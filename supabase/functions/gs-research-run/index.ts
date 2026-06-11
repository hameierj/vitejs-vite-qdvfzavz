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

// Documents the user attached to steer research. PDFs/images are sent to
// Claude as native content blocks so the model actually reads decks and
// one-pagers; the client extracts text from docx/txt and folds it into
// userContext instead.
interface ResearchDoc {
  name?: string;
  mediaType?: string;
  base64?: string;
}

// content is the user message content — a plain prompt string, or an array of
// content blocks (text + document/image) when attachments are present.
async function callClaude(anthropicKey: string, content: string | unknown[]): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: "You are a senior B2B go-to-market researcher. Return only valid JSON.",
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`Claude error ${r.status}`);
  const json = await r.json();
  return json.content?.[0]?.text ?? "";
}

// Turn attached docs into Claude content blocks. PDFs → document blocks,
// images → image blocks. Anything else is skipped (its text was already
// folded into userContext client-side).
function docBlocks(documents: ResearchDoc[]): unknown[] {
  const blocks: unknown[] = [];
  for (const d of documents) {
    if (!d?.base64) continue;
    const mt = d.mediaType || "";
    if (mt === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: d.base64 }, title: d.name || "document" });
    } else if (mt.startsWith("image/")) {
      blocks.push({ type: "image", source: { type: "base64", media_type: mt, data: d.base64 } });
    }
  }
  return blocks;
}

async function runPipeline(sb: SupabaseClient, anthropicKey: string, wsId: string, inputDomain: string, userContext = "", documents: ResearchDoc[] = []): Promise<void> {
  let normUrl = inputDomain.trim();
  if (normUrl && !/^https?:\/\//i.test(normUrl)) normUrl = `https://${normUrl}`;
  const domain = normUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  await appendLog(sb, wsId, "Fetching website (homepage + key pages)...");

  // Fetch the homepage and all candidate sub-pages concurrently rather than
  // one-at-a-time, then keep the first sub-page (in priority order) that
  // returned usable content. This cuts wall-clock from sum-of-timeouts to the
  // single slowest request.
  const extraPaths = ["/products", "/services", "/solutions", "/about", "/platform"];
  const [homepage, ...subPages] = await Promise.all([
    fetchPage(normUrl, 20000, 12000),
    ...extraPaths.map((path) => fetchPage(`${normUrl}${path}`, 10000, 6000)),
  ]);

  let pageContent = homepage;
  if (pageContent) {
    await appendLog(sb, wsId, `Fetched homepage (${Math.round(pageContent.length / 100) / 10}k chars)`);
  } else {
    await appendLog(sb, wsId, "Warning: could not fetch homepage — proceeding with limited data");
  }

  const bestIdx = subPages.findIndex((sub) => sub && sub.length > 500);
  if (bestIdx !== -1) {
    const path = extraPaths[bestIdx];
    pageContent += `\n\n${path.toUpperCase()} PAGE:\n${subPages[bestIdx]}`;
    await appendLog(sb, wsId, `Fetched ${path}`);
  }

  const blocks = docBlocks(documents);
  if (blocks.length) await appendLog(sb, wsId, `Including ${blocks.length} uploaded document${blocks.length > 1 ? "s" : ""}`);
  await appendLog(sb, wsId, "Analyzing with Claude...");

  const prompt = `Produce a comprehensive pre-onboarding research brief for a B2B outreach team about ${domain}.
${userContext ? `
═══════════════════════════════════════════════
USER-PROVIDED CONTEXT — AUTHORITATIVE. THIS IS THE GROUND TRUTH.
═══════════════════════════════════════════════
${userContext}

RULES FOR USING THIS CONTEXT (these override everything else):
- The user knows this business better than the website does. When the website and this context disagree, the user is RIGHT — follow the user.
- This context CONSTRAINS the brief, it doesn't just "inform" it. If the user states what the company sells (e.g. "they mainly sell X and sometimes Y, that's it"), then "productsServices" must contain ONLY those items. Do NOT add other products, services, or business lines from the website — even if the website prominently features them. Treat anything the user excluded as out of scope.
- Use the website (and any attached documents) ONLY to enrich and add detail to what the user described — never to expand the scope beyond it.
═══════════════════════════════════════════════
` : ""}${blocks.length ? `\nThe user also attached ${blocks.length} document${blocks.length > 1 ? "s" : ""} (decks/PDFs/one-pagers) below. Treat them as authoritative primary sources, second only to the user-provided context above.\n` : ""}
WEBSITE CONTENT${userContext ? " (use for enrichment only — do not let it override the user context above)" : ""}:
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
  ],   // If the user-provided context scopes what they sell, this list must contain ONLY those items — nothing else from the website.
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

  // When docs are attached, send a content-block array (text prompt first,
  // then the document/image blocks); otherwise just the prompt string.
  const content = blocks.length ? [{ type: "text", text: prompt }, ...blocks] : prompt;
  const raw = await callClaude(anthropicKey, content);

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
    const { workspaceId, domain, userContext, documents } = body as { workspaceId?: string; domain?: string; userContext?: string; documents?: ResearchDoc[] };

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
        await runPipeline(sb, anthropicKey, workspaceId, domain, userContext || "", Array.isArray(documents) ? documents : []);
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
