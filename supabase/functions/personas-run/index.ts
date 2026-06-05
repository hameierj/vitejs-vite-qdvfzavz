// personas-run — edge function (Gate 4 of the gated onboarding flow)
// Enriches the highest-scoring ICPs (from Gate 3) into COMPLETE B2B personas,
// filling every persona field for cold outreach. Accepts { workspaceId },
// responds with jobId, runs under EdgeRuntime.waitUntil, writes progress +
// result to app_data[personas_job_<workspaceId>]. The client merges the
// enriched persona `fields` into the matching icps[] entries by id.
//
// Required Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JOB_KEY = (wsId: string) => `personas_job_${wsId}`;
const WS_KEY = (wsId: string) => `ws_${wsId}`;
const MAX_PERSONAS = 6;

const PERSONA_NAMING = `PERSONA NAMING RULES (strict):
- Format: "[Industry/Vertical] — [Buyer Role]"
- Keep under 40 characters. No marketing fluff, no full sentences.`;

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

async function callClaude(anthropicKey: string, prompt: string, tokens: number): Promise<{ text: string; stopReason: string }> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: tokens, system: "Return only valid JSON. Be specific and actionable.", messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(150000),
  });
  if (!r.ok) throw new Error(`Claude error ${r.status}`);
  const json = await r.json();
  return { text: json.content?.[0]?.text ?? "", stopReason: json.stop_reason ?? "end_turn" };
}

function parseJSON(raw: string): any {
  return JSON.parse((raw || "").replace(/```json|```/g, "").trim());
}

async function runPipeline(sb: SupabaseClient, anthropicKey: string, wsId: string): Promise<void> {
  await appendLog(sb, wsId, "Reading scored ICPs...");
  const ws = await readWs(sb, wsId);
  const cd = ws.companyData || {};
  const allIcps: any[] = Array.isArray(ws.icps) ? ws.icps : [];
  const scoring = cd._icpScoringResult?.icps || [];

  // Order ICPs by their weighted score (highest first); fall back to array order.
  const scoreById = new Map<string, number>();
  scoring.forEach((s: any) => scoreById.set(s.icpId, s.weightedScore || 0));
  const ordered = [...allIcps].sort((a, b) => (scoreById.get(b.id) || 0) - (scoreById.get(a.id) || 0));
  const targets = ordered.slice(0, MAX_PERSONAS);

  if (targets.length === 0) {
    await writeJob(sb, wsId, { status: "done", phase: "Complete", completedAt: new Date().toISOString(), result: { personas: [] } });
    return;
  }

  await appendLog(sb, wsId, `Building ${targets.length} full personas from top-scored ICPs...`);
  const dedup = targets.map((p: any) => `${p.name}: ${p.data?.buyer || ""}, ${p.data?.industries || ""}, pain=${p.data?.pain1 || ""}`).join("\n");

  const personas = await Promise.all(targets.map(async (icp: any) => {
    const personaPrompt = `Draft a COMPLETE B2B persona for cold outreach. Fill EVERY field — no empty values.

${PERSONA_NAMING}

Company: ${cd.co_name || ""} (${cd.co_industry || ""})
Value Prop: ${cd.co_pitch || ""}
Competitors: ${cd.co_competitors || ""}
Persona: ${icp.name} — ${icp.data?.buyer || ""}
Industries: ${icp.data?.industries || ""}
Primary pain: ${icp.data?.pain1 || ""}
Why this is an ICP: ${icp.data?._tamExplanation || ""}

ALL PERSONAS being created (ensure yours is DISTINCT — different industries, titles, pains, messaging):
${dedup}

Return ONLY JSON with ALL these fields filled:
{"name":"","fields":{"industries":"","co_sizes":["SMB 1–50","Mid-Market 51–500","Enterprise 500+"],"geo":"","revenue":"","tech":"","keywords":"","dream_accts":"","neg":"","intent_topics":"","real_filters":"","buyer":"","champ":"","goals":"","fears":"","metrics":"","objections":"","sub_personas":"","pain1":"","pain2":"","gains":"","triggers":"","buying_signals_direct":"","buying_signals_indirect":"","sq_cost":"","friction_points":"","tone":"","hook":"","cta":"","why_client_wins":"","icp_proof":"","seq_strategy":"","seq_cta_style":"","current_solutions":"","incumbent_strengths":"","switching_triggers":"","displacement_messaging":"","win_loss_patterns":"","best_channel":"","best_time":"","linkedin_activity":"","phone_accessibility":"","email_preference":"","interested_criteria":"","warm_criteria":"","meeting_ready_criteria":"","not_now_criteria":"","dead_criteria":""},"confidence":{}}
co_sizes: array from ["SMB 1–50","Mid-Market 51–500","Enterprise 500+"]
tone: one of "Consultative & Educational"|"Direct & Punchy"|"Casual & Conversational"|"Formal & Executive"|"Data-driven & Analytical"|"Blue Collar & Human"|"Blunt & Edgy"|"Confrontational"
cta: one of "15-min call ask"|"Soft permission ('worth a chat?')"|"Video/resource share"|"Direct demo ask"|"Open-ended question"|"Easy yes/no reply"|"Direct callback ask"
best_channel: one of "Email"|"LinkedIn"|"Phone"|"Multi-channel (Email + LinkedIn)"|"Multi-channel (All)"
linkedin_activity: one of "Very Active (posts/comments weekly)"|"Moderate (engages occasionally)"|"Low (profile exists, rarely active)"
phone_accessibility: one of "Direct dial available"|"Gatekeeper (assistant)"|"Voicemail only"
email_preference: one of "Responds to short punchy emails"|"Prefers detailed/professional"|"Responds to personalization"|"Responds to data/stats"`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { text, stopReason } = await callClaude(anthropicKey, personaPrompt, attempt === 1 ? 6000 : 8000);
        if (stopReason === "max_tokens" && attempt < 2) continue;
        const parsed = parseJSON(text);
        return { id: icp.id, name: parsed.name || icp.name, fields: parsed.fields || {}, confidence: parsed.confidence || {} };
      } catch (err) {
        console.error(`persona "${icp.name}" attempt ${attempt} failed:`, err);
      }
    }
    return { id: icp.id, name: icp.name, fields: {}, confidence: {} };
  }));

  await appendLog(sb, wsId, `Enriched ${personas.length} personas`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", completedAt: new Date().toISOString(), result: { personas } });
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
    await sb.from("app_data").upsert({ key: JOB_KEY(workspaceId), value: JSON.stringify({ jobId, status: "running", phase: "Starting...", log: ["Starting persona generation..."], startedAt: new Date().toISOString() }) }, { onConflict: "key" });

    // @ts-ignore — EdgeRuntime is available in the Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try { await runPipeline(sb, anthropicKey, workspaceId); }
      catch (err) {
        console.error("personas pipeline failed:", err);
        await writeJob(sb, workspaceId, { status: "error", error: String((err as Error)?.message ?? err), completedAt: new Date().toISOString() });
      }
    })());

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
