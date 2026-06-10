// icp-tree-expand — edge function (deep ICP-tree generation, server-side)
//
// The guided onboarding (tam-icp-run) produces a TAM tree + scored ICPs. The main
// ICP Tree page seeds itself from that output, then asks THIS function to deepen a
// branch on demand: Persona -> JTBD -> Trigger -> Readiness -> Play. Mirrors the
// tam-icp-run job pattern exactly:
//   - Accepts { workspaceId, action, icpId?, rsId?, hint? }
//   - Responds with { jobId }, runs under EdgeRuntime.waitUntil
//   - Writes progress + result to app_data[icptree_job_<workspaceId>]
//   - Result is the FULL updated icpTree; the client applies it (setIcpTree) and
//     persists it via the normal workspace save — this fn does not write ws_<id>.
//
// actions:
//   expand_icp        — generate the full persona->play subtree for one ICP
//   generate_play     — author the play for one readiness-state leaf
//   regenerate_play   — re-author the play for one readiness-state leaf (with hint)
//
// Required Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JOB_KEY = (wsId: string) => `icptree_job_${wsId}`;
const WS_KEY = (wsId: string) => `ws_${wsId}`;

// How many of an ICP's readiness leaves get an authored play during expand_icp.
const PLAYS_PER_ICP = 6;

const SYS = `You are a B2B go-to-market strategist. Return ONLY valid JSON — no markdown, no explanation, no preamble. Do not wrap in code fences.`;

// ─── Infra helpers (mirror tam-icp-run) ─────────────────────────────────────────
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function readWs(sb: SupabaseClient, wsId: string): Promise<any> {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", WS_KEY(wsId)).single();
    const v = data?.value;
    return typeof v === "string" ? JSON.parse(v) : (v ?? {});
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

async function callClaude(anthropicKey: string, prompt: string, tokens: number, model: "haiku" | "sonnet" = "haiku"): Promise<string> {
  const modelId = model === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: modelId, max_tokens: tokens, system: SYS, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(150000),
  });
  if (!r.ok) throw new Error(`Claude error ${r.status}`);
  const json = await r.json();
  return (json.content?.[0]?.text ?? "").trim();
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const match = (raw || "").match(/```(?:json)?\s*([\s\S]*?)```/) || (raw || "").match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    return JSON.parse(match ? match[1] : raw) as T;
  } catch { return fallback; }
}

function nodeBase(prefix: string, parentId: string | null, expansionStatus = "expandable"): any {
  return {
    id: uid(prefix),
    parent_id: parentId,
    generated_at: new Date().toISOString(),
    generation_source: "manual_expansion",
    expansion_status: expansionStatus,
    expansion_hints: [],
    version: 1,
  };
}

// ─── Company context (mirror ICPTreeGenerator.buildContext / ctxStr) ─────────────
function ctxStr(ws: any): string {
  const cd = ws.companyData || {};
  const products = (ws.products || []).map((p: any) => p.name || p.description || "").filter(Boolean).join(", ");
  const existingICPs = (ws.icps || []).map((i: any) => i.name || "").filter(Boolean).join(", ");
  return `Company: ${cd.co_name || "Unknown Company"}
Industry: ${cd.co_industry || ""}
Website: ${cd.co_website || ""}
Value proposition: ${cd.co_pitch || ""}
Key selling points: ${cd.co_ksp || ""}
Products/services: ${products}
Current customers: ${cd.co_customers || ""}
Competitors: ${cd.co_competitors || ""}
Typical deal size: ${cd.co_deal || ""}
Sales cycle: ${cd.co_cycle || ""}
Known ICPs/personas: ${existingICPs}`;
}

// ─── Generation (ported from ICPTreeGenerator.tsx) ──────────────────────────────
async function genPersonas(key: string, ctx: string, icp: any, maxPersonas: number): Promise<any[]> {
  const raw = await callClaude(key,
    `${ctx}

ICP: ${icp.name}
Motion: ${icp.motion}
Firmographics: ${JSON.stringify(icp.firmographics)}
Pain profile: ${icp.pain_profile}

Generate all distinct buyer personas for this ICP. Include both decision makers and champions/influencers. Typically 1-3 personas. Max: ${maxPersonas}.

Return JSON array:
[{
  "title": "exact job title",
  "seniority": "C-suite|VP|Director|Manager|Individual Contributor",
  "department": "Sales|Marketing|Engineering|Finance|Operations|HR|etc",
  "goals": ["goal1", "goal2", "goal3"],
  "fears": ["fear1", "fear2"],
  "objections": ["typical objection 1", "typical objection 2"],
  "channels": ["email", "linkedin", "phone"],
  "expansion_status": "complete|expandable",
  "expansion_hints": []
}]`, 1500);
  const arr = parseJSON<any[]>(raw, []);
  return arr.slice(0, maxPersonas).map((d: any) => ({
    ...nodeBase("persona", icp.id, d.expansion_status || "expandable"),
    title: d.title || "Unknown Title",
    seniority: d.seniority || "Director",
    department: d.department || "Operations",
    goals: d.goals || [],
    fears: d.fears || [],
    objections: d.objections || [],
    channels: d.channels || ["email", "linkedin"],
    expansion_hints: d.expansion_hints || [],
    jtbds: [],
  }));
}

async function genJTBDs(key: string, ctx: string, icp: any, persona: any, maxJTBDs: number): Promise<any[]> {
  const raw = await callClaude(key,
    `${ctx}

ICP: ${icp.name} — ${icp.pain_profile}
Persona: ${persona.title} (${persona.seniority})
Goals: ${(persona.goals || []).join(", ")}
Fears: ${(persona.fears || []).join(", ")}

Generate the Jobs to be Done for this persona in this ICP context. Each JTBD is a specific situation+motivation+outcome. Max: ${maxJTBDs}.

Return JSON array:
[{
  "job_statement": "When [situation], I want to [motivation], so I can [outcome]",
  "functional_outcome": "concrete measurable result",
  "emotional_outcome": "how they feel when job is done well",
  "success_metrics": ["metric1", "metric2"],
  "expansion_status": "complete|expandable",
  "expansion_hints": []
}]`, 1200);
  const arr = parseJSON<any[]>(raw, []);
  return arr.slice(0, maxJTBDs).map((d: any) => ({
    ...nodeBase("jtbd", persona.id, d.expansion_status || "expandable"),
    job_statement: d.job_statement || "",
    functional_outcome: d.functional_outcome || "",
    emotional_outcome: d.emotional_outcome || "",
    success_metrics: d.success_metrics || [],
    expansion_hints: d.expansion_hints || [],
    triggers: [],
  }));
}

async function genTriggers(key: string, ctx: string, icp: any, persona: any, jtbd: any, maxTriggers: number): Promise<any[]> {
  const raw = await callClaude(key,
    `${ctx}

ICP: ${icp.name}
Persona: ${persona.title}
JTBD: ${jtbd.job_statement}

Generate the observable trigger events that indicate this persona is actively experiencing this job-to-be-done. Triggers should be detectable via LinkedIn, job postings, news, or data signals. Max: ${maxTriggers}.

Return JSON array:
[{
  "name": "short trigger name",
  "description": "what happened and why it matters",
  "detection_method": "how to find this signal (LinkedIn post, job posting, news, etc.)",
  "detection_difficulty": "easy|medium|hard",
  "urgency": "low|medium|high|critical",
  "example_signals": ["specific signal example 1", "specific signal example 2"],
  "expansion_status": "complete|expandable",
  "expansion_hints": []
}]`, 1200);
  const arr = parseJSON<any[]>(raw, []);
  return arr.slice(0, maxTriggers).map((d: any) => ({
    ...nodeBase("trigger", jtbd.id, d.expansion_status || "expandable"),
    name: d.name || "Unknown Trigger",
    description: d.description || "",
    detection_method: d.detection_method || "",
    detection_difficulty: d.detection_difficulty || "medium",
    urgency: d.urgency || "medium",
    example_signals: d.example_signals || [],
    expansion_hints: d.expansion_hints || [],
    readiness_states: [],
  }));
}

function genReadinessStates(trigger: any): any[] {
  const urgencyToStates: Record<string, Array<{ state: string; desc: string; window: string; signals: string[] }>> = {
    critical: [
      { state: "acute", desc: "Trigger just fired — immediate pain, decision imminent", window: "0-7 days", signals: ["Public announcement", "Job posted urgently", "Direct signal observed"] },
      { state: "active", desc: "Actively evaluating solutions", window: "1-4 weeks", signals: ["Researching vendors", "Demo requests", "Budget discussions"] },
      { state: "aware", desc: "Aware of problem, not yet in buying mode", window: "1-3 months", signals: ["Engaged with content", "Attended webinar", "Liked relevant post"] },
    ],
    high: [
      { state: "hot", desc: "Strong signal, high intent, short timeline", window: "0-14 days", signals: (trigger.example_signals || []).slice(0, 2) },
      { state: "warm", desc: "Signal detected, moderate intent", window: "2-6 weeks", signals: ["Related activity visible", "Role suggests fit"] },
      { state: "cold", desc: "Trigger likely relevant but no active signal", window: "2-6 months", signals: ["Firmographic fit only", "Industry signal"] },
    ],
    medium: [
      { state: "hot", desc: "Signal directly observed, timely outreach window", window: "0-21 days", signals: (trigger.example_signals || []).slice(0, 1) },
      { state: "warm", desc: "Indirect signal, likely fit", window: "1-2 months", signals: ["Inferred from context"] },
      { state: "cold", desc: "No active signal, nurture play", window: "3-9 months", signals: ["Firmographic match only"] },
    ],
    low: [
      { state: "warm", desc: "Mild signal, long-cycle nurture", window: "1-3 months", signals: ["Low-intent signal observed"] },
      { state: "cold", desc: "No active signal, awareness-only play", window: "3-12 months", signals: ["Firmographic fit"] },
    ],
  };
  const states = (urgencyToStates[trigger.urgency] || urgencyToStates.medium);
  return states.map((s, i) => ({
    ...nodeBase("rs", trigger.id, "expandable"),
    state: s.state,
    description: s.desc,
    timing_window: s.window,
    behavioral_signals: s.signals,
    play_status: "skeleton_only",
    play: null,
    estimated_play_value: Math.max(10, 90 - i * 25),
    estimated_audience_size: i === 0 ? "5-20/month" : i === 1 ? "20-80/month" : "50-200/month",
  }));
}

const PLAYBOOKS = [
  "Value-Stack Operator (Alex Hormozi) — dollar-denominated pain, value stack, hard CTA",
  "High-Energy Hustler (Gary Vaynerchuk) — informal, urgent, low-friction ask",
  "Trust-Led Analyst (Warren Buffett) — credibility first, folksy precision, zero pressure",
  "Tactical Negotiator (Chris Voss) — calibrated questions, labels, tactical empathy, pull don't push",
  "Classic Craft Copywriter (David Ogilvy) — facts as persuasion, one big idea, elegant structure",
  "Idea-Forward Minimalist (Seth Godin) — one idea, three sentences, permission-based",
  "Data Storyteller (Andrew Chen) — metric → hypothesis → peer result → framework offer",
  "Permission Challenger (Josh Braun) — pattern interrupt, takeaway selling, permission-based",
  "Technical Founder Essayist (Paul Graham) — first principles, short declaratives, peer-to-peer",
  "Plainspoken Trade Voice (Mike Rowe) — plain English, dignity-of-work, concrete help",
];

async function genPlay(key: string, ctx: string, icp: any, persona: any, jtbd: any, trigger: any, rs: any, hint = ""): Promise<any> {
  const raw = await callClaude(key,
    `${ctx}

ICP: ${icp.name} — ${icp.firmographics?.company_size || ""}, ${(icp.firmographics?.industries || []).join("/")}
Persona: ${persona.title} (${persona.seniority}, ${persona.department})
JTBD: ${jtbd.job_statement}
Trigger: ${trigger.name} — ${trigger.description}
Readiness: ${rs.state} — ${rs.description} (${rs.timing_window})
Detection method: ${trigger.detection_method}
${hint ? `\nEXTRA GUIDANCE (weight heavily): ${hint}\n` : ""}
Available playbook voices:
${PLAYBOOKS.join("\n")}

Generate a complete outreach play brief for this exact leaf. Choose the best playbook voice for this persona+readiness combination.

Return JSON:
{
  "name": "short play name",
  "channel": "email|linkedin|email+linkedin|multi",
  "playbook_voice": "exact playbook name from the list above",
  "hook": "1-2 sentence opening hook that references the trigger",
  "value_prop": "specific value proposition for this persona+JTBD combination",
  "proof_point": "specific proof — customer story, stat, or social proof",
  "primary_cta": "exact CTA text",
  "objection_handler": "how to handle the most likely objection",
  "sequence_strategy": "3-5 sentence description of the full sequence arc (touch 1 → 5)",
  "messaging_angles": ["angle1 to test", "angle2 to test", "angle3 to test"],
  "personalization_tokens": ["{trigger_event}", "{company_name}", "other tokens to personalize"],
  "disqualifiers": ["who NOT to send this to"],
  "expansion_hints": ["A/B variant worth testing", "channel variant to add"]
}`, 1200, "sonnet");
  const d = parseJSON<any>(raw, {});
  return {
    ...nodeBase("play", rs.id, "expandable"),
    name: d.name || "Untitled Play",
    channel: d.channel || "email",
    playbook_voice: d.playbook_voice || "Permission Challenger (Josh Braun)",
    hook: d.hook || "",
    value_prop: d.value_prop || "",
    proof_point: d.proof_point || "",
    primary_cta: d.primary_cta || "",
    objection_handler: d.objection_handler || "",
    sequence_strategy: d.sequence_strategy || "",
    messaging_angles: d.messaging_angles || [],
    personalization_tokens: d.personalization_tokens || [],
    disqualifiers: d.disqualifiers || [],
    expansion_hints: d.expansion_hints || [],
  };
}

// ─── Stats + ranking (ported) ───────────────────────────────────────────────────
function computeStats(tree: any) {
  let personas = 0, jtbds = 0, triggers = 0, rs = 0, authored = 0, skeleton = 0;
  for (const icp of tree.tam.icps) {
    personas += (icp.personas || []).length;
    for (const p of (icp.personas || [])) {
      jtbds += (p.jtbds || []).length;
      for (const j of (p.jtbds || [])) {
        triggers += (j.triggers || []).length;
        for (const t of (j.triggers || [])) {
          rs += (t.readiness_states || []).length;
          for (const r of (t.readiness_states || [])) {
            if (r.play_status === "authored") authored++; else skeleton++;
          }
        }
      }
    }
  }
  return { total_icps: tree.tam.icps.length, total_personas: personas, total_jtbds: jtbds, total_triggers: triggers, total_readiness_states: rs, total_plays_authored: authored, total_plays_skeleton: skeleton };
}

function rankIcpLeaves(icp: any): Array<{ rs: any; trigger: any; jtbd: any; persona: any }> {
  const leaves: Array<{ rs: any; trigger: any; jtbd: any; persona: any; score: number }> = [];
  const stateScore: Record<string, number> = { acute: 1.6, hot: 1.5, active: 1.3, warm: 1.0, considering: 1.0, aware: 0.7, cold: 0.5 };
  const urgScore: Record<string, number> = { critical: 1.4, high: 1.2, medium: 1.0, low: 0.7 };
  const diffScore: Record<string, number> = { easy: 1.3, medium: 1.0, hard: 0.7 };
  for (const persona of (icp.personas || [])) {
    for (const jtbd of (persona.jtbds || [])) {
      for (const trigger of (jtbd.triggers || [])) {
        for (const rs of (trigger.readiness_states || [])) {
          const score = (rs.estimated_play_value || 50) * (stateScore[rs.state] || 1.0) * (urgScore[trigger.urgency] || 1.0) * (diffScore[trigger.detection_difficulty] || 1.0);
          leaves.push({ rs, trigger, jtbd, persona, score });
        }
      }
    }
  }
  return leaves.sort((a, b) => b.score - a.score).map(({ rs, trigger, jtbd, persona }) => ({ rs, trigger, jtbd, persona }));
}

// Locate a readiness state + its ancestors anywhere in the tree.
function findRs(tree: any, rsId: string): { icp: any; persona: any; jtbd: any; trigger: any; rs: any } | null {
  for (const icp of tree.tam.icps) {
    for (const persona of (icp.personas || [])) {
      for (const jtbd of (persona.jtbds || [])) {
        for (const trigger of (jtbd.triggers || [])) {
          for (const rs of (trigger.readiness_states || [])) {
            if (rs.id === rsId) return { icp, persona, jtbd, trigger, rs };
          }
        }
      }
    }
  }
  return null;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────────
async function runPipeline(sb: SupabaseClient, key: string, wsId: string, body: any): Promise<void> {
  const { action, icpId, rsId, hint } = body as { action: string; icpId?: string; rsId?: string; hint?: string };
  await appendLog(sb, wsId, "Loading ICP tree...");
  const ws = await readWs(sb, wsId);
  const tree = ws.icpTree;
  if (!tree || !tree.tam) throw new Error("No ICP tree found in workspace — seed it from onboarding first.");
  const ctx = ctxStr(ws);

  if (action === "expand_icp") {
    const icp = tree.tam.icps.find((c: any) => c.id === icpId);
    if (!icp) throw new Error("ICP not found in tree");
    await appendLog(sb, wsId, `[${icp.name}] Generating personas...`);
    icp.personas = await genPersonas(key, ctx, icp, 3);

    for (const persona of icp.personas) {
      await appendLog(sb, wsId, `[${icp.name} → ${persona.title}] Generating JTBDs...`);
      persona.jtbds = await genJTBDs(key, ctx, icp, persona, 3);
      for (const jtbd of persona.jtbds) {
        jtbd.triggers = await genTriggers(key, ctx, icp, persona, jtbd, 3);
        for (const trigger of jtbd.triggers) {
          trigger.readiness_states = genReadinessStates(trigger);
        }
      }
    }

    // Author plays for this ICP's top readiness leaves.
    const ranked = rankIcpLeaves(icp);
    const toAuthor = ranked.slice(0, PLAYS_PER_ICP);
    let i = 0;
    for (const { rs, trigger, jtbd, persona } of toAuthor) {
      i++;
      await appendLog(sb, wsId, `[Play ${i}/${toAuthor.length}] ${icp.name} → ${persona.title} → ${rs.state.toUpperCase()}...`);
      try {
        rs.play = await genPlay(key, ctx, icp, persona, jtbd, trigger, rs);
        rs.play_status = "authored";
      } catch (e) {
        await appendLog(sb, wsId, `  ⚠ Play failed: ${(e as Error).message}. Left as skeleton.`);
      }
    }
    icp.expansion_status = "complete";
  } else if (action === "generate_play" || action === "regenerate_play") {
    const found = rsId ? findRs(tree, rsId) : null;
    if (!found) throw new Error("Readiness state not found in tree");
    const { icp, persona, jtbd, trigger, rs } = found;
    await appendLog(sb, wsId, `Authoring play: ${icp.name} → ${persona.title} → ${rs.state.toUpperCase()}...`);
    rs.play = await genPlay(key, ctx, icp, persona, jtbd, trigger, rs, action === "regenerate_play" ? (hint || "") : "");
    rs.play_status = "authored";
    if (action === "regenerate_play" && hint) rs.expansion_hints = [...(rs.expansion_hints || []), `Regenerated with hint: ${hint}`];
  } else {
    throw new Error(`Unknown action: ${action}`);
  }

  tree.stats = computeStats(tree);
  await appendLog(sb, wsId, `✓ Done — ${tree.stats.total_personas} personas, ${tree.stats.total_plays_authored} plays authored.`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", completedAt: new Date().toISOString(), result: { icpTree: tree } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const body = await req.json() as { workspaceId?: string; action?: string; icpId?: string; rsId?: string; hint?: string };
    const { workspaceId } = body;
    if (!workspaceId) return new Response(JSON.stringify({ error: "workspaceId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!body.action) return new Response(JSON.stringify({ error: "action required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!anthropicKey || !supabaseUrl || !supabaseKey) return new Response(JSON.stringify({ error: "server not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(supabaseUrl, supabaseKey);
    const jobId = crypto.randomUUID();
    await sb.from("app_data").upsert({ key: JOB_KEY(workspaceId), value: JSON.stringify({ jobId, status: "running", phase: "Starting...", log: ["Starting ICP tree expansion..."], startedAt: new Date().toISOString() }) }, { onConflict: "key" });

    // @ts-ignore — EdgeRuntime is available in the Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try { await runPipeline(sb, anthropicKey, workspaceId, body); }
      catch (err) {
        console.error("icp-tree-expand pipeline failed:", err);
        await writeJob(sb, workspaceId, { status: "error", error: String((err as Error)?.message ?? err), completedAt: new Date().toISOString() });
      }
    })());

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
