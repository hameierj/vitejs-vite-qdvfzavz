// products-run — edge function (Gate 2 of the gated onboarding flow)
// Generates full product/service profiles from the confirmed company research.
// Accepts { workspaceId }, responds immediately with jobId, then runs the
// generation under EdgeRuntime.waitUntil. Progress + result are written to
// app_data[products_job_<workspaceId>]; the client polls, merges into the
// `products` array, and its normal save effect persists it (avoiding races).
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

const JOB_KEY = (wsId: string) => `products_job_${wsId}`;
const WS_KEY = (wsId: string) => `ws_${wsId}`;
const RESEARCH_JOB_KEY = (wsId: string) => `gs_research_job_${wsId}`;

const PRODUCT_NAMING = `PRODUCT NAMING RULES (strict):
- USE THE EXACT PRODUCT NAME as it appears on the company's website. Do NOT rename or genericize.
- Only simplify when the company uses excessive marketing fluff.
- Keep under 40 characters. Preserve the company's branding.`;

const PRODUCT_FIELD_IDS = [
  "name","description","category","useCases","keyFeatures","problemsSolved","valueProposition",
  "timeToValue","idealCustomer","marketMaturity","competitors","buyerObjections","switchTriggers",
  "dealType","acv","mrr","contractLength","renewalRate","expansionRevenue","ltv","avgDealSize",
  "repeatRate","referralRate","avgDaysToClose","closeRateByStage","dealStakeholders",
  "discountAuthority","paymentTerms","proofPoints","roiMetrics","caseStudies","industryProof",
  "socialProof","objectionRebuttals","unsolvedImpact","elevatorPitch","positioningStatement",
  "messagingDos","messagingDonts","prod_notes",
];

function uid(): string { return crypto.randomUUID(); }
function EMPTY_PRODUCT(): any {
  return { id: uid(), ...Object.fromEntries(PRODUCT_FIELD_IDS.map((f) => [f, ""])), sourceUrl: "", createdAt: new Date().toISOString() };
}

async function readWs(sb: SupabaseClient, wsId: string): Promise<any> {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", WS_KEY(wsId)).single();
    return data?.value ? JSON.parse(data.value as string) : {};
  } catch { return {}; }
}

// The research brief is written DIRECTLY to the research job row by gs-research-run, so it's
// always present server-side — unlike ws_<id>.companyData._initialResearchBrief, which depends
// on the client having polled + merged + saved it. Read the job row as the source of truth.
async function readResearchBrief(sb: SupabaseClient, wsId: string): Promise<any> {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", RESEARCH_JOB_KEY(wsId)).single();
    const job = data?.value ? JSON.parse(data.value as string) : {};
    return (job && job.result) ? job.result : null;
  } catch { return null; }
}

async function writeJob(sb: SupabaseClient, wsId: string, patch: Record<string, unknown>) {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", JOB_KEY(wsId)).single();
    const current = data?.value ? JSON.parse(data.value as string) : {};
    await sb.from("app_data").upsert({ key: JOB_KEY(wsId), value: JSON.stringify({ ...current, ...patch }) }, { onConflict: "key" });
  } catch (e) { console.error("writeJob failed:", e); }
}

async function appendLog(sb: SupabaseClient, wsId: string, line: string) {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", JOB_KEY(wsId)).single();
    const current = data?.value ? JSON.parse(data.value as string) : {};
    const log = Array.isArray(current.log) ? current.log : [];
    log.push(line);
    await sb.from("app_data").upsert({ key: JOB_KEY(wsId), value: JSON.stringify({ ...current, log, phase: line }) }, { onConflict: "key" });
  } catch (e) { console.error("appendLog failed:", e); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT_ERROR_TYPES = new Set(["overloaded_error", "rate_limit_error", "api_error", "timeout_error"]);

// STREAMING call. A full profile can take >2 minutes to generate; a non-streaming request with a
// fixed timeout kept getting cut off ("Signal timed out"). Streaming lets a long-but-healthy
// generation finish — we only abort if the stream actually STALLS (no new text for INACTIVITY ms),
// which is what a hung connection looks like. Retries 429/529/5xx with backoff, bounded by deadline.
const INACTIVITY_MS = 40000; // abort only if the model sends no text for 40s
async function callClaude(anthropicKey: string, prompt: string, tokens: number, deadline: number, system = "Return only valid JSON. Be specific and actionable."): Promise<string> {
  let lastErr = "";
  for (let attempt = 0; ; attempt++) {
    if (Date.now() + 5000 > deadline) throw new Error(lastErr || "deadline reached");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: tokens, system, stream: true, messages: [{ role: "user", content: prompt }] }),
      });
      if (r.status === 429 || r.status === 529 || r.status >= 500) {
        lastErr = `Anthropic HTTP ${r.status}`;
        const ra = parseInt(r.headers.get("retry-after") || "", 10);
        const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 20000) : Math.min(2500 * (attempt + 1), 15000);
        if (Date.now() + wait + 2000 < deadline) { await sleep(wait); continue; }
        throw new Error(lastErr);
      }
      if (!r.ok || !r.body) {
        const ej = await r.json().catch(() => ({} as any));
        lastErr = ej?.error ? `${ej.error.type}: ${ej.error.message}` : `HTTP ${r.status}`;
        if (TRANSIENT_ERROR_TYPES.has(ej?.error?.type) && Date.now() + 4000 < deadline) { await sleep(3000); continue; }
        throw new Error(lastErr);
      }
      // Read the SSE stream, accumulating text. Abort on inactivity or deadline.
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let text = "", buf = "";
      while (true) {
        const res: any = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ __stall: true }), INACTIVITY_MS)),
        ]);
        if (res?.__stall) { try { await reader.cancel(); } catch { /* ignore */ } throw new Error("stream stalled (no output for 40s)"); }
        if (res.done) break;
        buf += decoder.decode(res.value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text;
            else if (ev.type === "error") lastErr = ev.error?.message || "stream error";
          } catch { /* partial JSON line — ignore */ }
        }
        if (Date.now() > deadline) { try { await reader.cancel(); } catch { /* ignore */ } break; }
      }
      if (text.trim()) return text;
      lastErr = lastErr || "empty stream";
      if (Date.now() + 4000 < deadline) { await sleep(2000); continue; }
      throw new Error(lastErr);
    } catch (e) {
      lastErr = String((e as Error)?.message ?? e);
      // A stall is a real failure for this attempt; retry only if we still have time.
      if (Date.now() + 6000 < deadline) { await sleep(Math.min(2000 * (attempt + 1), 6000)); continue; }
      throw new Error(lastErr);
    }
  }
}

// Extract the outermost JSON object even if the model wraps it in prose or code fences,
// so a little extra text never collapses a profile to the empty fallback.
function parseJSON(raw: string): any {
  let s = (raw || "").replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

async function runPipeline(sb: SupabaseClient, anthropicKey: string, wsId: string, userContext = ""): Promise<void> {
  // Hard wall: the whole pipeline (all products in parallel) must finish within this window so
  // it always writes a terminal status and never gets killed mid-run. Comfortably under the
  // edge function's wall-clock limit.
  const deadline = Date.now() + 350000;
  await appendLog(sb, wsId, "Reading confirmed company research...");
  const ws = await readWs(sb, wsId);
  const cd = ws.companyData || {};
  // Prefer the brief written directly by gs-research-run (always present), fall back to the
  // copy the client merged into companyData. This is why the gated flow was producing the
  // empty "Core Offering" placeholder — the client-saved copy hadn't landed in ws_.
  const jobBrief = await readResearchBrief(sb, wsId);
  const brief = jobBrief || cd._initialResearchBrief || {};
  await appendLog(sb, wsId, jobBrief ? "Loaded research brief from research job." : (cd._initialResearchBrief ? "Loaded research brief from workspace." : "No research brief found — using company fields."));

  // Seed product list from the confirmed research brief (preferred) or the
  // company product breakdown. Each seed is expanded into a full profile.
  let seeds: any[] = Array.isArray(brief.productsServices) ? brief.productsServices : [];
  if (seeds.length === 0 && cd.co_product) {
    seeds = [{ name: cd.co_product, description: cd.co_prod_breakdown || cd.co_pitch || "" }];
  }
  if (seeds.length === 0) seeds = [{ name: cd.co_name || "Core Offering", description: cd.co_pitch || "" }];
  seeds = seeds.slice(0, 4);

  await appendLog(sb, wsId, `Building ${seeds.length} product profile(s)...`);

  // Distill the confirmed research brief into a rich company context block. The gated flow
  // populates _initialResearchBrief (NOT the co_* profile fields), so reading co_pitch /
  // co_competitors here yields nothing — every profile then comes out generic. Feed the brief
  // directly so products-run has the same depth the fully-automated launchpad flow had.
  const co = brief.companyOverview || {};
  const cp = brief.competitivePositioning || {};
  const valueProps = Array.isArray(brief.valuePropositions)
    ? brief.valuePropositions.map((v: any) => `- ${v.claim || v}${v.evidence ? ` (${v.evidence})` : ""}`).join("\n")
    : "";
  const icpHints = Array.isArray(brief.icpHypotheses)
    ? brief.icpHypotheses.map((h: any) => `- ${h.name}${h.rationale ? `: ${h.rationale}` : ""}`).join("\n")
    : "";
  const companyName = co.name || cd.co_name || "the company";
  const businessModel = co.businessModel || cd.co_pitch || "";
  const category = cp.category || cd.co_category || cd.co_industry || "";
  const competitors = (Array.isArray(cp.mainCompetitors) ? cp.mainCompetitors.join(", ") : "") || cd.co_competitors || "";
  const differentiators = (Array.isArray(cp.differentiators) ? cp.differentiators.join("; ") : "") || cd.co_diff || "";
  const briefContext = [
    `COMPANY (from the confirmed company research — ground every field in this; do NOT genericize):`,
    `Name: ${companyName}${co.size ? ` · Size: ${co.size}` : ""}${co.stage ? ` · Stage: ${co.stage}` : ""}`,
    businessModel ? `Business model: ${businessModel}` : "",
    category ? `Category: ${category}` : "",
    competitors ? `Main competitors: ${competitors}` : "",
    differentiators ? `Key differentiators: ${differentiators}` : "",
    valueProps ? `Value propositions:\n${valueProps}` : "",
    icpHints ? `Target buyers / ICP hypotheses:\n${icpHints}` : "",
  ].filter(Boolean).join("\n");

  const genProduct = async (p: any, pDeadline: number) => {
    const prompt = `Create a COMPLETE product profile for a SPECIFIC company's product. Fill EVERY field — no empty values. Stay true to ${companyName}'s actual business; do NOT produce generic SaaS boilerplate.
KEEP EVERY FIELD CONCISE: 1-2 sentences (or a short comma/newline list) per field — specific, not padded. Completing all fields matters more than length.

${PRODUCT_NAMING}

${briefContext}

THIS PRODUCT (expand into a full profile — keep it specific to ${companyName}):
Name: ${p.name}
Description: ${p.description || ""}
Target buyer: ${p.targetBuyer || ""}
Differentiator: ${p.differentiator || ""}
${userContext ? `\nUSER-PROVIDED CONTEXT (authoritative — weight this heavily):\n${userContext}\n` : ""}
Every field below must reflect ${companyName} specifically — reuse the company's real category, competitors, differentiators, and value props above rather than inventing generic ones.

Return ONLY JSON:
{"name":"","description":"","category":"Software|Platform|Service|Hardware|Consulting|Other","useCases":"","keyFeatures":"","problemsSolved":"","valueProposition":"","timeToValue":"","idealCustomer":"","marketMaturity":"Established category — buyers know what this is|Emerging category — some education needed|New category — significant education required|Replacing an existing behavior (not a tool)","competitors":"","buyerObjections":"","switchTriggers":"","dealType":"Recurring (subscription / retainer)|One-Time (project / purchase)|Both — recurring and one-time options","acv":"","mrr":"","contractLength":"Month-to-month|Quarterly|6 months|Annual|Multi-year|Custom","renewalRate":"","expansionRevenue":"","ltv":"","avgDealSize":"","repeatRate":"","referralRate":"","avgDaysToClose":"","closeRateByStage":"","dealStakeholders":"","discountAuthority":"","paymentTerms":"","proofPoints":"","roiMetrics":"","caseStudies":"","industryProof":"","socialProof":"","objectionRebuttals":"","unsolvedImpact":"","elevatorPitch":"","positioningStatement":"","messagingDos":"","messagingDonts":""}

unsolvedImpact: what happens if the customer does nothing — lost revenue, competitive disadvantage, scaling limits.
IMPORTANT for dealType: Infer whether recurring (SaaS, subscription, retainer) or one-time (project, purchase). Fill the relevant commercial fields accordingly.`;
    // Up to 2 attempts for parse/thin issues — callClaude already handles transient API
    // overloads internally (bounded by the shared deadline), so we don't compound retries here.
    let lastErr = "";       // the real underlying failure (API/timeout/parse)
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (Date.now() + 8000 > pDeadline) break; // no time for another full attempt
      try {
        const raw = await callClaude(anthropicKey, prompt, 3500, pDeadline);
        const parsed = parseJSON(raw);
        const filledCount = Object.values(parsed).filter((v) => v && String(v).trim()).length;
        // A real profile fills many fields; if we only got a couple, treat as a bad parse and retry.
        if (filledCount < 6) { lastErr = `model returned only ${filledCount} fields`; console.warn(`product "${p.name}" attempt ${attempt}: ${lastErr}, retrying`); continue; }
        return { ...EMPTY_PRODUCT(), ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v && String(v).trim())) };
      } catch (err) {
        lastErr = String((err as Error)?.message ?? err);
        console.error(`product "${p.name}" attempt ${attempt} failed:`, lastErr);
      }
    }
    // Surface the REAL reason (the actual API/parse error), not just "out of time".
    await appendLog(sb, wsId, `⚠️ "${p.name}" came back thin — reason: ${lastErr || "unknown"}`);
    return { ...EMPTY_PRODUCT(), name: p.name || "", description: p.description || "", category: "Other" };
  };

  // Generate STRICTLY ONE AT A TIME. Running product calls in parallel made them throttle each
  // other (Anthropic 429/529), so some came back thin. Sequential = each call gets the full
  // capacity and the deadline budget, so every profile comes back complete.
  const results: any[] = [];
  for (let i = 0; i < seeds.length; i++) {
    // Each product gets a generous slice (~130s) — enough for a real ~40-60s call plus a retry —
    // capped by the overall deadline. We only skip a product if the WHOLE budget is already gone,
    // so an early product can't be starved before it even starts.
    if (Date.now() + 10000 > deadline) {
      await appendLog(sb, wsId, `⚠️ "${seeds[i].name}" skipped — overall time budget exhausted`);
      results.push({ ...EMPTY_PRODUCT(), name: seeds[i].name || "", description: seeds[i].description || "", category: "Other" });
      continue;
    }
    const pDeadline = Math.min(Date.now() + 150000, deadline);
    await appendLog(sb, wsId, `Building product ${i + 1} of ${seeds.length}: ${seeds[i].name || "Untitled"}...`);
    results.push(await genProduct(seeds[i], pDeadline));
  }
  const products = results.filter((r: any) => r?.name);

  await appendLog(sb, wsId, `Generated ${products.length} product profiles`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", completedAt: new Date().toISOString(), result: { products } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const { workspaceId, userContext } = await req.json() as { workspaceId?: string; userContext?: string };
    if (!workspaceId) return new Response(JSON.stringify({ error: "workspaceId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!anthropicKey || !supabaseUrl || !supabaseKey) return new Response(JSON.stringify({ error: "server not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(supabaseUrl, supabaseKey);
    const jobId = uid();
    await sb.from("app_data").upsert({ key: JOB_KEY(workspaceId), value: JSON.stringify({ jobId, status: "running", phase: "Starting...", log: ["Starting product generation..."], startedAt: new Date().toISOString() }) }, { onConflict: "key" });

    // @ts-ignore — EdgeRuntime is available in the Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try { await runPipeline(sb, anthropicKey, workspaceId, userContext || ""); }
      catch (err) {
        console.error("products pipeline failed:", err);
        await writeJob(sb, workspaceId, { status: "error", error: String((err as Error)?.message ?? err), completedAt: new Date().toISOString() });
      }
    })());

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
