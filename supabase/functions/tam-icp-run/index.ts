// tam-icp-run — edge function (Gate 3 of the gated onboarding flow)
// Builds a TAM tree (company-level TAM + TAM per product/service), identifies
// ICPs per branch (flagged unique vs cross-product overlap), explains each, and
// scores them on the 5-dimension rubric. Accepts { workspaceId }, responds with
// jobId, runs under EdgeRuntime.waitUntil, and writes progress + result to
// app_data[tamicp_job_<workspaceId>]. The client merges:
//   result.tamTree   -> companyData._tamTree
//   result.icps      -> icps[]
//   result.scoring   -> companyData._icpScoringResult
//
// Required Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JOB_KEY = (wsId: string) => `tamicp_job_${wsId}`;
const WS_KEY = (wsId: string) => `ws_${wsId}`;
const ICP_COLORS = ["#6C5CE7","#00D68F","#FF6B6B","#54A0FF","#9B59B6","#FFC048","#E84393","#00CEC9"];

// 5-dimension scoring rubric (matches the client ICPScoringMatrix weights).
const DIMENSIONS = [
  { key: "market_size",   label: "Market Size & Accessibility", weight: 0.20 },
  { key: "pmf",           label: "Product-Market Fit",          weight: 0.25 },
  { key: "proof",         label: "Proof Availability",          weight: 0.20 },
  { key: "outreach",      label: "Outreach Accessibility",      weight: 0.20 },
  { key: "advantage",     label: "Competitive Advantage",       weight: 0.15 },
];

function uid(): string { return crypto.randomUUID(); }

function newICP(idx: number, data: any, name: string): any {
  return {
    id: uid(), color: ICP_COLORS[idx % ICP_COLORS.length], name, data, outputs: null,
    approval: "draft", sectionApprovals: {}, comments: [], confidence: {},
    linkedProductIds: [], linkedOfferIds: [],
    linkedProductFit: {} as Record<string, string>, linkedProductFitReason: {} as Record<string, string>,
  };
}

async function readWs(sb: SupabaseClient, wsId: string): Promise<any> {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", WS_KEY(wsId)).single();
    return data?.value ? JSON.parse(data.value as string) : {};
  } catch { return {}; }
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

async function callClaude(anthropicKey: string, prompt: string, tokens: number, system = "You are a senior B2B go-to-market strategist. Return only valid JSON."): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: tokens, system, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(150000),
  });
  if (!r.ok) throw new Error(`Claude error ${r.status}`);
  const json = await r.json();
  return json.content?.[0]?.text ?? "";
}

function parseJSON(raw: string): any {
  const match = (raw || "").match(/```(?:json)?\s*([\s\S]*?)```/) || (raw || "").match(/(\{[\s\S]*\})/);
  return JSON.parse(match ? match[1] : raw);
}

async function runPipeline(sb: SupabaseClient, anthropicKey: string, wsId: string): Promise<void> {
  await appendLog(sb, wsId, "Reading confirmed company + product profiles...");
  const ws = await readWs(sb, wsId);
  const cd = ws.companyData || {};
  const products: any[] = Array.isArray(ws.products) ? ws.products : [];

  const productLines = products.length
    ? products.map((p: any, i: number) => `${i}. ${p.name} — ${p.description || p.valueProposition || ""} (ideal customer: ${p.idealCustomer || "?"})`).join("\n")
    : `0. ${cd.co_product || cd.co_name || "Core offering"} — ${cd.co_pitch || ""}`;

  await appendLog(sb, wsId, "Building TAM tree and identifying ICPs per branch...");

  const prompt = `Build a TAM (Total Addressable Market) tree for this company and identify the Ideal Customer Profiles (ICPs) for outbound, branching by product/service.

COMPANY: ${cd.co_name || ""} (${cd.co_industry || ""})
VALUE PROP: ${cd.co_pitch || ""}
KEY SELLING POINTS: ${cd.co_ksp || ""}
DIFFERENTIATORS: ${cd.co_diff || ""}
PROOF: ${cd.co_proof || ""}
COMPETITORS: ${cd.co_competitors || ""}
KNOWN CUSTOMERS: ${cd.co_customers || ""}

PRODUCTS / SERVICES (branch the tree per product):
${productLines}

INSTRUCTIONS:
1. Company-level TAM: summarize the overall addressable market and break it into 2-4 broad market segments with a rough size estimate and rationale each.
2. Per-product TAM: for EACH product/service above, summarize its addressable market and identify 1-3 ICPs that would buy it.
3. Flag each ICP's scope: "unique" (specific to one product) or "cross_product" (a buyer that fits multiple products — note which).
4. For EACH ICP, score the 5 dimensions 1-10 with a one-line rationale:
   - market_size (Market Size & Accessibility)
   - pmf (Product-Market Fit)
   - proof (Proof Availability — do we have evidence/case studies for them)
   - outreach (Outreach Accessibility — can we reach them by email/LinkedIn)
   - advantage (Competitive Advantage vs incumbents for this buyer)
5. Give each ICP: a 1-2 sentence explanation of WHY it's an ICP, top 2 strengths, top 2 gaps, a one-sentence suggested outbound angle, and a recommendation: "launch_first"|"launch_second"|"test_small"|"defer"|"skip".

Use a SHORT ICP name format: "[Industry/Vertical] — [Buyer Role]" (e.g. "Mid-Market SaaS — VP Sales"). Identify 3-8 distinct ICPs total across all branches; merge true duplicates into one cross_product ICP.

Return ONLY valid JSON:
{
  "companyLevel": { "tamSummary": "", "segments": [{ "name": "", "sizeEstimate": "", "rationale": "" }] },
  "perProduct": [
    { "productIndex": 0, "productName": "", "tamSummary": "",
      "icps": [
        { "name": "", "scope": "unique|cross_product", "alsoFitsProducts": ["product name"],
          "explanation": "", "industries": "", "buyerTitles": "", "primaryPain": "",
          "dimensions": { "market_size": {"score":0,"rationale":""}, "pmf": {"score":0,"rationale":""}, "proof": {"score":0,"rationale":""}, "outreach": {"score":0,"rationale":""}, "advantage": {"score":0,"rationale":""} },
          "topStrengths": ["",""], "topGaps": ["",""], "suggestedAngle": "", "recommendation": "launch_first" }
      ] }
  ]
}
Raw JSON only. Be specific and concrete — no vague marketing language.`;

  const raw = await callClaude(anthropicKey, prompt, 8000);
  const tree = parseJSON(raw);

  await appendLog(sb, wsId, "Scoring and ranking ICPs...");

  // Flatten ICPs across branches into the icps[] array + scoring matrix, dedup
  // cross-product ICPs by name so a shared buyer appears once.
  const icps: any[] = [];
  const scoringRows: any[] = [];
  const seenByName = new Map<string, string>(); // lowercased name -> icpId
  let idx = 0;

  const branches = Array.isArray(tree.perProduct) ? tree.perProduct : [];
  for (const branch of branches) {
    const product = products[branch.productIndex] || products.find((p: any) => p.name === branch.productName);
    for (const icp of (Array.isArray(branch.icps) ? branch.icps : [])) {
      const nameKey = String(icp.name || "").trim().toLowerCase();
      let icpId = seenByName.get(nameKey);
      if (!icpId) {
        const created = newICP(idx, {
          industries: icp.industries || "",
          buyer: icp.buyerTitles || "",
          pain1: icp.primaryPain || "",
          _tamScope: icp.scope || "unique",
          _tamExplanation: icp.explanation || "",
        }, icp.name || `ICP ${idx + 1}`);
        if (product?.id) {
          created.linkedProductIds = [product.id];
          created.linkedProductFit = { [product.id]: "high" };
        }
        icps.push(created);
        icpId = created.id;
        seenByName.set(nameKey, icpId);
        idx++;

        // Compute weighted score from dimension scores.
        const dims = DIMENSIONS.map((d) => {
          const v = icp.dimensions?.[d.key] || {};
          const score = Math.max(0, Math.min(10, Number(v.score) || 0));
          return { key: d.key, label: d.label, weight: d.weight, score, rationale: String(v.rationale || "") };
        });
        const weightedScore = Math.round(dims.reduce((s, d) => s + d.score * d.weight, 0) * 100) / 100;
        scoringRows.push({
          icpId, icpName: icp.name || `ICP ${idx}`,
          dimensions: dims, weightedScore, rank: 0,
          recommendation: icp.recommendation || "test_small",
          topStrengths: Array.isArray(icp.topStrengths) ? icp.topStrengths : [],
          topGaps: Array.isArray(icp.topGaps) ? icp.topGaps : [],
          suggestedAngle: icp.suggestedAngle || "",
          scope: icp.scope || "unique",
        });
      } else if (product?.id) {
        // Cross-product ICP also fits this product — link it.
        const existing = icps.find((c) => c.id === icpId);
        if (existing && !existing.linkedProductIds.includes(product.id)) {
          existing.linkedProductIds.push(product.id);
          existing.linkedProductFit[product.id] = "high";
          existing.data._tamScope = "cross_product";
        }
      }
    }
  }

  // Rank by weighted score.
  scoringRows.sort((a, b) => b.weightedScore - a.weightedScore);
  scoringRows.forEach((r, i) => { r.rank = i + 1; });

  const result = {
    tamTree: { companyLevel: tree.companyLevel || { tamSummary: "", segments: [] }, perProduct: branches },
    icps,
    scoring: { generatedAt: new Date().toISOString(), rubric: DIMENSIONS, icps: scoringRows },
  };

  await appendLog(sb, wsId, `Identified ${icps.length} ICPs across ${branches.length} product branch(es)`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", completedAt: new Date().toISOString(), result });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const { workspaceId } = await req.json() as { workspaceId?: string };
    if (!workspaceId) return new Response(JSON.stringify({ error: "workspaceId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!anthropicKey || !supabaseUrl || !supabaseKey) return new Response(JSON.stringify({ error: "server not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(supabaseUrl, supabaseKey);
    const jobId = uid();
    await sb.from("app_data").upsert({ key: JOB_KEY(workspaceId), value: JSON.stringify({ jobId, status: "running", phase: "Starting...", log: ["Starting TAM tree + ICP analysis..."], startedAt: new Date().toISOString() }) }, { onConflict: "key" });

    // @ts-ignore — EdgeRuntime is available in the Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try { await runPipeline(sb, anthropicKey, workspaceId); }
      catch (err) {
        console.error("tam-icp pipeline failed:", err);
        await writeJob(sb, workspaceId, { status: "error", error: String((err as Error)?.message ?? err), completedAt: new Date().toISOString() });
      }
    })());

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
