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

async function callClaude(anthropicKey: string, prompt: string, tokens: number, system = "Return only valid JSON. Be specific and actionable."): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: tokens, system, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`Claude error ${r.status}`);
  const json = await r.json();
  return json.content?.[0]?.text ?? "";
}

function parseJSON(raw: string): any {
  return JSON.parse((raw || "").replace(/```json?\s*/gi, "").replace(/```/g, "").trim());
}

async function runPipeline(sb: SupabaseClient, anthropicKey: string, wsId: string): Promise<void> {
  await appendLog(sb, wsId, "Reading confirmed company research...");
  const ws = await readWs(sb, wsId);
  const cd = ws.companyData || {};
  const brief = cd._initialResearchBrief || {};

  // Seed product list from the confirmed research brief (preferred) or the
  // company product breakdown. Each seed is expanded into a full profile.
  let seeds: any[] = Array.isArray(brief.productsServices) ? brief.productsServices : [];
  if (seeds.length === 0 && cd.co_product) {
    seeds = [{ name: cd.co_product, description: cd.co_prod_breakdown || cd.co_pitch || "" }];
  }
  if (seeds.length === 0) seeds = [{ name: cd.co_name || "Core Offering", description: cd.co_pitch || "" }];
  seeds = seeds.slice(0, 4);

  await appendLog(sb, wsId, `Building ${seeds.length} product profile(s)...`);

  const products = (await Promise.all(seeds.map(async (p: any) => {
    const prompt = `Create a COMPLETE product profile. Fill EVERY field — no empty values. Be specific and actionable.

${PRODUCT_NAMING}

Product: ${p.name}
Description: ${p.description || ""}
Target buyer: ${p.targetBuyer || ""}
Differentiator: ${p.differentiator || ""}
Company: ${cd.co_name || ""} (${cd.co_industry || ""})
Company value prop: ${cd.co_pitch || ""}
Competitors: ${cd.co_competitors || ""}

Return ONLY JSON:
{"name":"","description":"","category":"Software|Platform|Service|Hardware|Consulting|Other","useCases":"","keyFeatures":"","problemsSolved":"","valueProposition":"","timeToValue":"","idealCustomer":"","marketMaturity":"Established category — buyers know what this is|Emerging category — some education needed|New category — significant education required|Replacing an existing behavior (not a tool)","competitors":"","buyerObjections":"","switchTriggers":"","dealType":"Recurring (subscription / retainer)|One-Time (project / purchase)|Both — recurring and one-time options","acv":"","mrr":"","contractLength":"Month-to-month|Quarterly|6 months|Annual|Multi-year|Custom","renewalRate":"","expansionRevenue":"","ltv":"","avgDealSize":"","repeatRate":"","referralRate":"","avgDaysToClose":"","closeRateByStage":"","dealStakeholders":"","discountAuthority":"","paymentTerms":"","proofPoints":"","roiMetrics":"","caseStudies":"","industryProof":"","socialProof":"","objectionRebuttals":"","unsolvedImpact":"","elevatorPitch":"","positioningStatement":"","messagingDos":"","messagingDonts":""}

unsolvedImpact: what happens if the customer does nothing — lost revenue, competitive disadvantage, scaling limits.
IMPORTANT for dealType: Infer whether recurring (SaaS, subscription, retainer) or one-time (project, purchase). Fill the relevant commercial fields accordingly.`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await callClaude(anthropicKey, prompt, attempt === 1 ? 6000 : 8000);
        const parsed = parseJSON(raw);
        return { ...EMPTY_PRODUCT(), ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v && String(v).trim())) };
      } catch (err) {
        console.error(`product "${p.name}" attempt ${attempt} failed:`, err);
        if (attempt === 2) return { ...EMPTY_PRODUCT(), name: p.name || "", description: p.description || "", category: "Other" };
      }
    }
    return { ...EMPTY_PRODUCT(), name: p.name || "", description: p.description || "", category: "Other" };
  }))).filter((r: any) => r?.name);

  await appendLog(sb, wsId, `Generated ${products.length} product profiles`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", completedAt: new Date().toISOString(), result: { products } });
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
    await sb.from("app_data").upsert({ key: JOB_KEY(workspaceId), value: JSON.stringify({ jobId, status: "running", phase: "Starting...", log: ["Starting product generation..."], startedAt: new Date().toISOString() }) }, { onConflict: "key" });

    // @ts-ignore — EdgeRuntime is available in the Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try { await runPipeline(sb, anthropicKey, workspaceId); }
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
