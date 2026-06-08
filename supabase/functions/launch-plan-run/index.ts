// launch-plan-run — edge function (Flow 2: campaign launch orchestration)
// Two modes, both keyed by { workspaceId }:
//   mode:"plan"     → reads confirmed personas + ICP scores + products and
//                     returns a LAUNCH PLAN (review gate): LinkedIn assignments
//                     (one per LinkedIn account, top ICPs), and ordered email
//                     waves (one ICP at a time, products in parallel) with an
//                     AI-picked campaign type + rationale per ICP. No copy yet.
//   mode:"generate" → for a specific wave ({ icpId } for an email wave, or
//                     { track:"linkedin" }) generates the actual campaign
//                     sequences (copy) so only the ICP being activated gets
//                     copy generated. Returns campaigns for the client to add.
// Progress + result written to app_data[launchplan_job_<workspaceId>].
//
// Required Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JOB_KEY = (wsId: string) => `launchplan_job_${wsId}`;
const WS_KEY = (wsId: string) => `ws_${wsId}`;
const MAX_PRODUCTS_PER_ICP = 3;
const MAX_LINKEDIN = 4;

// Email campaign types AI can pick from (per the GTM vision).
const EMAIL_TYPES = ["intent_signal", "conversation_starter", "free_value", "meeting_booking"];
const TYPE_TO_GOAL: Record<string, string> = {
  intent_signal: "book_meetings", conversation_starter: "start_conversation",
  free_value: "start_conversation", meeting_booking: "book_meetings",
};

const MERGE_TAG_RULES = `B2B ROCKET MERGE TAG RULES (strict — platform-substituted at send):
- Personalize using ONLY: {{prospect_first_name}} {{prospect_last_name}} {{prospect_title}} {{phone}} {{email}} {{sender_name}} {{sender_title}} {{sender_company_name}} {{sender_company_location}} {{sender_signature}}
- Greet with {{prospect_first_name}}; sign off with {{sender_signature}}. Never invent other tags or hardcode names.`;

function uid(): string { return crypto.randomUUID(); }

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

async function callClaude(anthropicKey: string, prompt: string, tokens: number, system = "Return only valid JSON. Be specific, concrete, no filler."): Promise<string> {
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
  const m = (raw || "").match(/```(?:json)?\s*([\s\S]*?)```/) || (raw || "").match(/([[{][\s\S]*[\]}])/);
  return JSON.parse(m ? m[1] : raw);
}

function rankedIcps(ws: any): any[] {
  const icps: any[] = Array.isArray(ws.icps) ? ws.icps : [];
  const scoring = ws.companyData?._icpScoringResult?.icps || [];
  const scoreById = new Map<string, any>();
  scoring.forEach((s: any) => scoreById.set(s.icpId, s));
  return [...icps]
    .map((ic) => ({ icp: ic, score: scoreById.get(ic.id) }))
    .filter((x) => x.score) // only scored ICPs are launch-eligible
    .sort((a, b) => (a.score.rank || 99) - (b.score.rank || 99));
}

function linkedinAccountCount(ws: any): number {
  const cd = ws.companyData || {};
  const fromIntake = Number(cd._intakeData?.linkedinAccounts) || 0;
  const fromCo = Number(cd.co_linkedin_accounts) || 0;
  return Math.max(0, Math.min(MAX_LINKEDIN, fromIntake || fromCo || 0));
}

function productsForIcp(ws: any, icp: any): any[] {
  const products: any[] = Array.isArray(ws.products) ? ws.products : [];
  const linked = Array.isArray(icp.linkedProductIds) ? icp.linkedProductIds : [];
  const matched = products.filter((p) => linked.includes(p.id));
  return (matched.length ? matched : products).slice(0, MAX_PRODUCTS_PER_ICP);
}

// ── PLAN ──
async function runPlan(sb: SupabaseClient, anthropicKey: string, wsId: string): Promise<void> {
  await appendLog(sb, wsId, "Reading confirmed personas + ICP scores...");
  const ws = await readWs(sb, wsId);
  const cd = ws.companyData || {};
  const ranked = rankedIcps(ws);
  if (!ranked.length) {
    await writeJob(sb, wsId, { status: "error", error: "No scored ICPs found — confirm the TAM/ICP gate first.", completedAt: new Date().toISOString() });
    return;
  }

  await appendLog(sb, wsId, "Selecting best campaign type per ICP...");
  const icpLines = ranked.map((x, i) => `${i}. id=${x.icp.id} "${x.icp.name}" rank=${x.score.rank} score=${x.score.weightedScore} rec=${x.score.recommendation} | pain=${x.icp.data?.pain1 || ""} | angle=${x.score.suggestedAngle || ""}`).join("\n");
  const typePrompt = `For each ICP below, choose the single best EMAIL campaign type for the FIRST test, from exactly these options:
- intent_signal: lead with a buying/intent signal, direct meeting ask (best when proof + accessibility are high)
- conversation_starter: low-friction question to open a dialogue (best for cold, top-of-funnel)
- free_value: lead by giving a useful asset/insight (best when education needed or trust must be built)
- meeting_booking: straight-to-the-point meeting ask (best for high-fit, high-intent ICPs)

COMPANY: ${cd.co_name || ""} (${cd.co_industry || ""}) — ${cd.co_pitch || ""}
ICPs (ranked):
${icpLines}

Return ONLY JSON: {"choices":[{"icpId":"","type":"intent_signal|conversation_starter|free_value|meeting_booking","rationale":"one sentence"}]}`;
  let choices: any[] = [];
  try {
    const raw = await callClaude(anthropicKey, typePrompt, 1500);
    choices = parseJSON(raw).choices || [];
  } catch (e) { console.error("type pick failed:", e); }
  const choiceById = new Map<string, any>();
  choices.forEach((c: any) => choiceById.set(c.icpId, c));

  // LinkedIn: one campaign per account, assigned to the top-N scored ICPs.
  const liCount = linkedinAccountCount(ws);
  const linkedin = ranked.slice(0, liCount).map((x, i) => ({
    accountIndex: i + 1, icpId: x.icp.id, icpName: x.icp.name,
    rank: x.score.rank, suggestedAngle: x.score.suggestedAngle || "",
  }));

  // Email waves: one per ICP, ordered by rank; products run in parallel within a wave.
  const emailWaves = ranked.map((x) => {
    const choice = choiceById.get(x.icp.id) || {};
    const prods = productsForIcp(ws, x.icp);
    return {
      icpId: x.icp.id, icpName: x.icp.name, rank: x.score.rank, weightedScore: x.score.weightedScore,
      recommendation: x.score.recommendation,
      campaignType: EMAIL_TYPES.includes(choice.type) ? choice.type : "conversation_starter",
      typeRationale: choice.rationale || "",
      products: prods.map((p) => ({ productId: p.id, productName: p.name })),
      status: "queued", // queued | active | finalized — only the lowest-rank queued wave is activatable
    };
  });

  const plan = {
    generatedAt: new Date().toISOString(),
    linkedinAccounts: liCount,
    linkedin,
    emailWaves,
    testingRule: "Email: one ICP at a time (lowest unfinished rank). All products/services for that ICP run in parallel. Finalize an ICP before activating the next.",
  };
  await appendLog(sb, wsId, `Planned ${emailWaves.length} email waves + ${linkedin.length} LinkedIn campaigns`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", mode: "plan", completedAt: new Date().toISOString(), result: { plan } });
}

// ── GENERATE (copy for one wave) ──
function emailSequencePrompt(cd: any, icp: any, product: any, type: string): string {
  const pd = icp.data || {};
  const typeGuide: Record<string, string> = {
    intent_signal: "Lead touch 1 with a plausible buying/intent signal relevant to this buyer, then a direct meeting ask. 5 touches.",
    conversation_starter: "Open with a low-friction, genuinely curious question — no pitch in touch 1. Build to a soft ask. 5 touches.",
    free_value: "Touch 1 offers a concrete useful asset/insight for free (no ask). Earn the reply, then soft ask. 5 touches.",
    meeting_booking: "Be direct and respectful of time; ask for a 15-min meeting early, reinforce with proof. 5 touches.",
  };
  return `Write a cold EMAIL sequence (5 touches, days 0/3/7/14/21) for B2B outreach.

CAMPAIGN TYPE: ${type} — ${typeGuide[type] || ""}
COMPANY: ${cd.co_name || ""} — ${cd.co_pitch || ""}
PRODUCT: ${product.name} — ${product.valueProposition || product.description || ""}
ICP: ${icp.name} | buyer: ${pd.buyer || ""} | pain: ${pd.pain1 || ""} | triggers: ${pd.triggers || ""} | tone: ${pd.tone || "Direct & Punchy"}
${MERGE_TAG_RULES}

Rules: NO links/URLs. NO exclamation marks. NO "I hope this finds you well". Each body under 120 words. Sound human.
Return ONLY JSON: {"steps":[{"stepNumber":1,"role":"hook|proof|value|urgency|breakup","dayOffset":0,"subject":"","body":""}]}`;
}

function linkedinArcPrompt(cd: any, icp: any): string {
  const pd = icp.data || {};
  return `Write a LinkedIn AI-SDR conversation arc (4 touches, days 0/2/5/10) that runs on the user's behalf.
Goal arc: connect → open the conversation → uncover the core problem → strategically offer a call (sell without feeling salesy).

COMPANY: ${cd.co_name || ""} — ${cd.co_pitch || ""}
ICP: ${icp.name} | buyer: ${pd.buyer || ""} | pain: ${pd.pain1 || ""} | tone: ${pd.tone || "Casual & Conversational"}
${MERGE_TAG_RULES}

Touch 1 = connection request (max 300 chars, a genuine reason to connect, NO pitch).
Touches 2-4 = conversational DMs (max 500 chars), one moving the conversation forward, one uncovering the problem, one offering the call.
Return ONLY JSON: {"steps":[{"stepNumber":1,"role":"connect|open|uncover|offer","dayOffset":0,"body":""}]}`;
}

function toSequence(parsed: any, channel: string): any[] {
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
  return steps.map((s: any, i: number) => ({
    id: uid(), stepNumber: s.stepNumber || i + 1, role: s.role || "follow_up",
    dayOffset: typeof s.dayOffset === "number" ? s.dayOffset : [0, 3, 7, 14, 21][i] || 0,
    channel, subject: channel === "email" ? (s.subject || "") : "", body: s.body || "", variants: [],
  }));
}

async function runGenerate(sb: SupabaseClient, anthropicKey: string, wsId: string, body: any): Promise<void> {
  const ws = await readWs(sb, wsId);
  const cd = ws.companyData || {};
  const icps: any[] = Array.isArray(ws.icps) ? ws.icps : [];
  const products: any[] = Array.isArray(ws.products) ? ws.products : [];
  const plan = cd._launchPlan || {};

  if (body.track === "linkedin") {
    await appendLog(sb, wsId, "Generating LinkedIn conversation arcs...");
    const assignments = Array.isArray(plan.linkedin) ? plan.linkedin : [];
    const campaigns = (await Promise.all(assignments.map(async (a: any) => {
      const icp = icps.find((i) => i.id === a.icpId);
      if (!icp) return null;
      try {
        const parsed = parseJSON(await callClaude(anthropicKey, linkedinArcPrompt(cd, icp), 2500));
        return { channel: "linkedin", personaId: icp.id, accountIndex: a.accountIndex, goalType: "start_conversation",
          name: `${icp.name} — LinkedIn (Acct ${a.accountIndex})`, goal: `AI-SDR conversation arc: connect → open → uncover → offer call`,
          sequence: toSequence(parsed, "linkedin") };
      } catch (e) { console.error("li arc failed:", e); return null; }
    }))).filter(Boolean);
    await appendLog(sb, wsId, `Generated ${campaigns.length} LinkedIn campaigns`);
    await writeJob(sb, wsId, { status: "done", phase: "Complete", mode: "generate", track: "linkedin", completedAt: new Date().toISOString(), result: { campaigns } });
    return;
  }

  // Email wave for a single ICP — all its products in parallel.
  const wave = (Array.isArray(plan.emailWaves) ? plan.emailWaves : []).find((w: any) => w.icpId === body.icpId);
  const icp = icps.find((i) => i.id === body.icpId);
  if (!wave || !icp) {
    await writeJob(sb, wsId, { status: "error", error: "Wave/ICP not found — regenerate the plan.", completedAt: new Date().toISOString() });
    return;
  }
  await appendLog(sb, wsId, `Generating email campaigns for "${icp.name}" (${wave.products.length} product(s))...`);
  const campaigns = (await Promise.all((wave.products || []).map(async (pp: any) => {
    const product = products.find((p) => p.id === pp.productId);
    if (!product) return null;
    try {
      const parsed = parseJSON(await callClaude(anthropicKey, emailSequencePrompt(cd, icp, product, wave.campaignType), 4000));
      return { channel: "email", personaId: icp.id, productId: product.id, goalType: TYPE_TO_GOAL[wave.campaignType] || "start_conversation",
        campaignType: wave.campaignType, name: `${icp.name} × ${product.name} — ${wave.campaignType}`,
        goal: `${wave.campaignType} campaign for ${icp.name}`, sequence: toSequence(parsed, "email") };
    } catch (e) { console.error("email seq failed:", e); return null; }
  }))).filter(Boolean);
  await appendLog(sb, wsId, `Generated ${campaigns.length} email campaigns`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", mode: "generate", icpId: body.icpId, completedAt: new Date().toISOString(), result: { campaigns } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const body = await req.json() as { workspaceId?: string; mode?: string; icpId?: string; track?: string };
    const { workspaceId, mode = "plan" } = body;
    if (!workspaceId) return new Response(JSON.stringify({ error: "workspaceId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!anthropicKey || !supabaseUrl || !supabaseKey) return new Response(JSON.stringify({ error: "server not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(supabaseUrl, supabaseKey);
    const jobId = uid();
    await sb.from("app_data").upsert({ key: JOB_KEY(workspaceId), value: JSON.stringify({ jobId, status: "running", phase: "Starting...", mode, log: [`Starting launch ${mode}...`], startedAt: new Date().toISOString() }) }, { onConflict: "key" });

    // @ts-ignore — EdgeRuntime is available in the Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try {
        if (mode === "generate") await runGenerate(sb, anthropicKey, workspaceId, body);
        else await runPlan(sb, anthropicKey, workspaceId);
      } catch (err) {
        console.error("launch-plan pipeline failed:", err);
        await writeJob(sb, workspaceId, { status: "error", error: String((err as Error)?.message ?? err), completedAt: new Date().toISOString() });
      }
    })());

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
