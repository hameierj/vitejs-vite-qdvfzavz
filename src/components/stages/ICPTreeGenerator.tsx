import { useState, useRef, useCallback } from "react";

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentHi: "#5A4BD6", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#FDCB6E", amberLo: "#FDCB6E0F", amberBorder: "#FDCB6E40",
  red: "#E17055", redLo: "#E170550F",
  skeleton: "#F0F0F8",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NodeBase {
  id: string;
  parent_id: string | null;
  generated_at: string;
  generation_source: "initial" | "manual_expansion" | "user_edit";
  expansion_status: "complete" | "expandable" | "needs_expansion";
  expansion_hints: string[];
  version: number;
}

export interface Play extends NodeBase {
  name: string;
  channel: string;
  playbook_voice: string;
  hook: string;
  value_prop: string;
  proof_point: string;
  primary_cta: string;
  objection_handler: string;
  sequence_strategy: string;
  messaging_angles: string[];
  personalization_tokens: string[];
  disqualifiers: string[];
}

export interface ReadinessState extends NodeBase {
  state: string;
  description: string;
  timing_window: string;
  behavioral_signals: string[];
  play_status: "authored" | "skeleton_only";
  play: Play | null;
  estimated_play_value: number | null;
  estimated_audience_size: string | null;
}

export interface Trigger extends NodeBase {
  name: string;
  description: string;
  detection_method: string;
  detection_difficulty: "easy" | "medium" | "hard";
  urgency: "low" | "medium" | "high" | "critical";
  example_signals: string[];
  readiness_states: ReadinessState[];
}

export interface JTBD extends NodeBase {
  job_statement: string;
  functional_outcome: string;
  emotional_outcome: string;
  success_metrics: string[];
  triggers: Trigger[];
}

export interface Persona extends NodeBase {
  title: string;
  seniority: string;
  department: string;
  goals: string[];
  fears: string[];
  objections: string[];
  channels: string[];
  jtbds: JTBD[];
}

export interface ICP extends NodeBase {
  name: string;
  motion: string;
  description: string;
  firmographics: {
    company_size: string;
    industries: string[];
    revenue: string;
    geography: string;
    business_model: string;
  };
  pain_profile: string;
  revenue_potential: string;
  personas: Persona[];
}

export interface TAM extends NodeBase {
  total_market: string;
  addressable_market: string;
  serviceable_market: string;
  key_segments: string[];
  icps: ICP[];
}

export interface ICPTree {
  id: string;
  generated_at: string;
  company_name: string;
  generation_config: GenerationConfig;
  stats: TreeStats;
  tam: TAM;
  expansion_suggestions: ExpansionSuggestion[];
}

interface GenerationConfig {
  max_icps: number;
  max_personas_per_icp: number;
  max_jtbds_per_persona: number;
  max_triggers_per_jtbd: number;
  max_total_plays: number;
}

interface TreeStats {
  total_icps: number;
  total_personas: number;
  total_jtbds: number;
  total_triggers: number;
  total_readiness_states: number;
  total_plays_authored: number;
  total_plays_skeleton: number;
}

interface ExpansionSuggestion {
  node_id: string;
  node_type: string;
  node_name: string;
  reason: string;
  suggested_action: string;
  priority: "low" | "medium" | "high";
}

// ─── AI helper ───────────────────────────────────────────────────────────────
async function callClaude(
  prompt: string,
  system: string,
  maxTokens: number,
  model: "haiku" | "sonnet" = "haiku"
): Promise<string> {
  const apiKey = (() => { try { return localStorage.getItem("b2br_api_key") || ""; } catch { return ""; } })();
  if (!apiKey) throw new Error("No Anthropic API key found. Add it in the API Keys settings.");
  const modelId = model === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as any).error?.message || `Claude error ${resp.status}`);
  }
  const data = await resp.json();
  return (data.content?.[0]?.text || "").trim();
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    return JSON.parse(match ? match[1] : raw) as T;
  } catch {
    return fallback;
  }
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nodeBase(prefix: string, parentId: string | null, expansionStatus: NodeBase["expansion_status"] = "expandable"): NodeBase {
  return {
    id: uid(prefix),
    parent_id: parentId,
    generated_at: new Date().toISOString(),
    generation_source: "initial",
    expansion_status: expansionStatus,
    expansion_hints: [],
    version: 1,
  };
}

// ─── Generation pipeline ──────────────────────────────────────────────────────
const SYS = `You are a B2B go-to-market strategist. Return ONLY valid JSON — no markdown, no explanation, no preamble. Do not wrap in code fences.`;

interface CompanyContext {
  name: string; industry: string; website: string; pitch: string;
  ksp: string; competitors: string; customers: string;
  deal: string; cycle: string; products: string;
  existing_icps: string;
}

function buildContext(ws: any): CompanyContext {
  const cd = ws.companyData || {};
  const products = (ws.products || []).map((p: any) => p.name || p.description || "").filter(Boolean).join(", ");
  const existingICPs = (ws.icps || []).map((i: any) => i.name || "").filter(Boolean).join(", ");
  return {
    name: cd.co_name || "Unknown Company",
    industry: cd.co_industry || "",
    website: cd.co_website || "",
    pitch: cd.co_pitch || "",
    ksp: cd.co_ksp || "",
    competitors: cd.co_competitors || "",
    customers: cd.co_customers || "",
    deal: cd.co_deal || "",
    cycle: cd.co_cycle || "",
    products,
    existing_icps: existingICPs,
  };
}

function ctxStr(ctx: CompanyContext) {
  return `Company: ${ctx.name}
Industry: ${ctx.industry}
Website: ${ctx.website}
Value proposition: ${ctx.pitch}
Key selling points: ${ctx.ksp}
Products/services: ${ctx.products}
Current customers: ${ctx.customers}
Competitors: ${ctx.competitors}
Typical deal size: ${ctx.deal}
Sales cycle: ${ctx.cycle}
Known ICPs/personas: ${ctx.existing_icps}`;
}

async function genTAM(ctx: CompanyContext, tamId: string): Promise<TAM> {
  const raw = await callClaude(
    `${ctxStr(ctx)}

Generate the Total Addressable Market analysis. Return JSON:
{
  "total_market": "dollar or account count estimate of the full TAM",
  "addressable_market": "SAM — realistic portion this company can serve",
  "serviceable_market": "SOM — realistic 3-year capture target",
  "key_segments": ["segment1", "segment2", ...],
  "expansion_hints": ["one hint about where TAM could expand"]
}`,
    SYS, 600
  );
  const d = parseJSON(raw, {} as any);
  return {
    ...nodeBase("tam", null, "complete"),
    id: tamId,
    total_market: d.total_market || "Unknown",
    addressable_market: d.addressable_market || "Unknown",
    serviceable_market: d.serviceable_market || "Unknown",
    key_segments: d.key_segments || [],
    expansion_hints: d.expansion_hints || [],
    icps: [],
  };
}

async function genICPs(ctx: CompanyContext, tamId: string, maxICPs: number): Promise<ICP[]> {
  const raw = await callClaude(
    `${ctxStr(ctx)}

Detect all distinct Ideal Customer Profiles. Each ICP must be firmographically distinct (size, industry, motion, or business model). Generate as many as the evidence supports — typically 2-5 for focused companies, up to 8 for multi-product enterprises. Max: ${maxICPs}.

Return a JSON array of ICP objects:
[{
  "name": "short descriptive name",
  "motion": "self-serve|sales-led|product-led|partner-led|enterprise|hybrid",
  "description": "2-sentence description",
  "firmographics": {
    "company_size": "e.g. 10-50 employees",
    "industries": ["industry1", "industry2"],
    "revenue": "e.g. $1M-$10M ARR",
    "geography": "e.g. North America",
    "business_model": "e.g. B2B SaaS"
  },
  "pain_profile": "primary pain this ICP experiences that your product solves",
  "revenue_potential": "estimated ACV or deal value range",
  "expansion_status": "complete|expandable|needs_expansion",
  "expansion_hints": ["hint about sub-segments worth exploring"]
}]`,
    SYS, 2000
  );
  const arr = parseJSON<any[]>(raw, []);
  return arr.slice(0, maxICPs).map((d: any) => ({
    ...nodeBase("icp", tamId, d.expansion_status || "expandable"),
    name: d.name || "Unnamed ICP",
    motion: d.motion || "sales-led",
    description: d.description || "",
    firmographics: d.firmographics || { company_size: "", industries: [], revenue: "", geography: "", business_model: "" },
    pain_profile: d.pain_profile || "",
    revenue_potential: d.revenue_potential || "",
    expansion_hints: d.expansion_hints || [],
    personas: [],
  }));
}

async function genPersonas(ctx: CompanyContext, icp: ICP, maxPersonas: number): Promise<Persona[]> {
  const raw = await callClaude(
    `${ctxStr(ctx)}

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
}]`,
    SYS, 1500
  );
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

async function genJTBDs(ctx: CompanyContext, icp: ICP, persona: Persona, maxJTBDs: number): Promise<JTBD[]> {
  const raw = await callClaude(
    `${ctxStr(ctx)}

ICP: ${icp.name} — ${icp.pain_profile}
Persona: ${persona.title} (${persona.seniority})
Goals: ${persona.goals.join(", ")}
Fears: ${persona.fears.join(", ")}

Generate the Jobs to be Done for this persona in this ICP context. Each JTBD is a specific situation+motivation+outcome. Max: ${maxJTBDs}.

Return JSON array:
[{
  "job_statement": "When [situation], I want to [motivation], so I can [outcome]",
  "functional_outcome": "concrete measurable result",
  "emotional_outcome": "how they feel when job is done well",
  "success_metrics": ["metric1", "metric2"],
  "expansion_status": "complete|expandable",
  "expansion_hints": []
}]`,
    SYS, 1200
  );
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

async function genTriggers(ctx: CompanyContext, icp: ICP, persona: Persona, jtbd: JTBD, maxTriggers: number): Promise<Trigger[]> {
  const raw = await callClaude(
    `${ctxStr(ctx)}

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
}]`,
    SYS, 1200
  );
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

function genReadinessStates(trigger: Trigger): ReadinessState[] {
  const urgencyToStates: Record<string, Array<{ state: string; desc: string; window: string; signals: string[] }>> = {
    critical: [
      { state: "acute", desc: "Trigger just fired — immediate pain, decision imminent", window: "0-7 days", signals: ["Public announcement", "Job posted urgently", "Direct signal observed"] },
      { state: "active", desc: "Actively evaluating solutions", window: "1-4 weeks", signals: ["Researching vendors", "Demo requests", "Budget discussions"] },
      { state: "aware", desc: "Aware of problem, not yet in buying mode", window: "1-3 months", signals: ["Engaged with content", "Attended webinar", "Liked relevant post"] },
    ],
    high: [
      { state: "hot", desc: "Strong signal, high intent, short timeline", window: "0-14 days", signals: trigger.example_signals.slice(0, 2) },
      { state: "warm", desc: "Signal detected, moderate intent", window: "2-6 weeks", signals: ["Related activity visible", "Role suggests fit"] },
      { state: "cold", desc: "Trigger likely relevant but no active signal", window: "2-6 months", signals: ["Firmographic fit only", "Industry signal"] },
    ],
    medium: [
      { state: "hot", desc: "Signal directly observed, timely outreach window", window: "0-21 days", signals: trigger.example_signals.slice(0, 1) },
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
    play_status: "skeleton_only" as const,
    play: null,
    estimated_play_value: Math.max(10, 90 - i * 25),
    estimated_audience_size: i === 0 ? "5-20/month" : i === 1 ? "20-80/month" : "50-200/month",
  }));
}

async function genPlay(
  ctx: CompanyContext,
  icp: ICP,
  persona: Persona,
  jtbd: JTBD,
  trigger: Trigger,
  rs: ReadinessState,
  rsId: string
): Promise<Play> {
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

  const raw = await callClaude(
    `${ctxStr(ctx)}

ICP: ${icp.name} — ${icp.firmographics.company_size}, ${icp.firmographics.industries.join("/")}
Persona: ${persona.title} (${persona.seniority}, ${persona.department})
JTBD: ${jtbd.job_statement}
Trigger: ${trigger.name} — ${trigger.description}
Readiness: ${rs.state} — ${rs.description} (${rs.timing_window})
Detection method: ${trigger.detection_method}

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
}`,
    SYS, 1200, "sonnet"
  );
  const d = parseJSON(raw, {} as any);
  return {
    ...nodeBase("play", rsId, "expandable"),
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

function rankLeaves(tree: ICPTree): Array<{ rs: ReadinessState; trigger: Trigger; jtbd: JTBD; persona: Persona; icp: ICP }> {
  const leaves: Array<{ rs: ReadinessState; trigger: Trigger; jtbd: JTBD; persona: Persona; icp: ICP; score: number }> = [];
  for (const icp of tree.tam.icps) {
    for (const persona of icp.personas) {
      for (const jtbd of persona.jtbds) {
        for (const trigger of jtbd.triggers) {
          for (const rs of trigger.readiness_states) {
            const stateScore: Record<string, number> = { acute: 1.6, hot: 1.5, active: 1.3, warm: 1.0, considering: 1.0, aware: 0.7, cold: 0.5 };
            const urgScore: Record<string, number> = { critical: 1.4, high: 1.2, medium: 1.0, low: 0.7 };
            const diffScore: Record<string, number> = { easy: 1.3, medium: 1.0, hard: 0.7 };
            const score = (rs.estimated_play_value || 50)
              * (stateScore[rs.state] || 1.0)
              * (urgScore[trigger.urgency] || 1.0)
              * (diffScore[trigger.detection_difficulty] || 1.0);
            leaves.push({ rs, trigger, jtbd, persona, icp, score });
          }
        }
      }
    }
  }
  return leaves.sort((a, b) => b.score - a.score).map(({ rs, trigger, jtbd, persona, icp }) => ({ rs, trigger, jtbd, persona, icp }));
}

function computeStats(tree: ICPTree): TreeStats {
  let personas = 0, jtbds = 0, triggers = 0, rs = 0, authored = 0, skeleton = 0;
  for (const icp of tree.tam.icps) {
    personas += icp.personas.length;
    for (const p of icp.personas) {
      jtbds += p.jtbds.length;
      for (const j of p.jtbds) {
        triggers += j.triggers.length;
        for (const t of j.triggers) {
          rs += t.readiness_states.length;
          for (const r of t.readiness_states) {
            if (r.play_status === "authored") authored++;
            else skeleton++;
          }
        }
      }
    }
  }
  return { total_icps: tree.tam.icps.length, total_personas: personas, total_jtbds: jtbds, total_triggers: triggers, total_readiness_states: rs, total_plays_authored: authored, total_plays_skeleton: skeleton };
}

// ─── Main generation orchestrator ─────────────────────────────────────────────
async function generateTree(
  ws: any,
  config: GenerationConfig,
  onLog: (msg: string) => void,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<ICPTree> {
  const ctx = buildContext(ws);
  const tamId = uid("tam");
  const treeId = uid("tree");

  const check = () => { if (signal.aborted) throw new Error("Generation cancelled"); };

  onLog(`Analyzing company profile for ${ctx.name}…`);
  onProgress(2);
  check();

  // Step 1: TAM
  onLog("Generating TAM analysis…");
  const tam = await genTAM(ctx, tamId);
  onProgress(8);
  check();

  // Step 2: ICPs
  onLog("Detecting ICPs from go-to-market motions…");
  const icps = await genICPs(ctx, tamId, config.max_icps);
  tam.icps = icps;
  onLog(`Detected ${icps.length} ICP${icps.length !== 1 ? "s" : ""}: ${icps.map(i => i.name).join(", ")}`);
  onProgress(15);
  check();

  let progress = 15;
  const icpProgressSlice = 45 / icps.length;

  // Step 3-6: Personas, JTBDs, Triggers, Readiness per ICP
  for (let ii = 0; ii < icps.length; ii++) {
    const icp = icps[ii];
    check();
    onLog(`[${icp.name}] Generating personas…`);
    icp.personas = await genPersonas(ctx, icp, config.max_personas_per_icp);
    progress += icpProgressSlice * 0.2;
    onProgress(Math.round(progress));

    for (const persona of icp.personas) {
      check();
      onLog(`[${icp.name} → ${persona.title}] Generating JTBDs…`);
      persona.jtbds = await genJTBDs(ctx, icp, persona, config.max_jtbds_per_persona);
      progress += icpProgressSlice * 0.2 / icp.personas.length;
      onProgress(Math.round(progress));

      for (const jtbd of persona.jtbds) {
        check();
        onLog(`[${persona.title}] Generating triggers for: ${jtbd.job_statement.slice(0, 60)}…`);
        jtbd.triggers = await genTriggers(ctx, icp, persona, jtbd, config.max_triggers_per_jtbd);

        for (const trigger of jtbd.triggers) {
          trigger.readiness_states = genReadinessStates(trigger);
        }
        progress += icpProgressSlice * 0.6 / (icp.personas.length * persona.jtbds.length);
        onProgress(Math.round(progress));
      }
    }
  }

  const partialTree: ICPTree = {
    id: treeId,
    generated_at: new Date().toISOString(),
    company_name: ctx.name,
    generation_config: config,
    stats: computeStats({ id: treeId, generated_at: "", company_name: ctx.name, generation_config: config, stats: {} as TreeStats, tam, expansion_suggestions: [] }),
    tam,
    expansion_suggestions: [],
  };

  // Step 7: Rank leaves and generate plays for top N
  onLog(`Ranking ${partialTree.stats.total_readiness_states} leaves by value…`);
  onProgress(62);
  const rankedLeaves = rankLeaves(partialTree);
  const toAuthor = rankedLeaves.slice(0, config.max_total_plays);
  const authoredIds = new Set(toAuthor.map(l => l.rs.id));

  onLog(`Generating ${toAuthor.length} plays (${rankedLeaves.length - toAuthor.length} marked skeleton)…`);

  let playsDone = 0;
  for (const { rs, trigger, jtbd, persona, icp } of toAuthor) {
    check();
    onLog(`[Play ${playsDone + 1}/${toAuthor.length}] ${icp.name} → ${persona.title} → ${rs.state.toUpperCase()}…`);
    try {
      rs.play = await genPlay(ctx, icp, persona, jtbd, trigger, rs, rs.id);
      rs.play_status = "authored";
    } catch (e) {
      onLog(`  ⚠ Play generation failed: ${(e as Error).message}. Marked as skeleton.`);
    }
    playsDone++;
    onProgress(62 + Math.round(35 * playsDone / toAuthor.length));
  }

  // Mark non-authored as skeleton (already skeleton_only by default, just ensure non-top leaves stay that way)
  for (const icp of tam.icps) {
    for (const persona of icp.personas) {
      for (const jtbd of persona.jtbds) {
        for (const trigger of jtbd.triggers) {
          for (const rs of trigger.readiness_states) {
            if (!authoredIds.has(rs.id)) {
              rs.play_status = "skeleton_only";
              rs.play = null;
            }
          }
        }
      }
    }
  }

  // Step 8: Auto-suggest expansions
  const suggestions: ExpansionSuggestion[] = [];
  for (const icp of tam.icps) {
    if (icp.expansion_status === "needs_expansion") {
      suggestions.push({ node_id: icp.id, node_type: "icp", node_name: icp.name, reason: icp.expansion_hints[0] || "System flagged for expansion", suggested_action: "expand_node", priority: "high" });
    }
    for (const persona of icp.personas) {
      for (const jtbd of persona.jtbds) {
        for (const trigger of jtbd.triggers) {
          if (trigger.detection_difficulty === "easy" && trigger.urgency === "critical") {
            const skeletonCount = trigger.readiness_states.filter(r => r.play_status === "skeleton_only").length;
            if (skeletonCount > 0) {
              suggestions.push({ node_id: trigger.id, node_type: "trigger", node_name: trigger.name, reason: `High-value trigger with ${skeletonCount} ungenerated plays`, suggested_action: "generate_plays", priority: "high" });
            }
          }
        }
      }
    }
  }

  const finalTree: ICPTree = { ...partialTree, tam, expansion_suggestions: suggestions };
  finalTree.stats = computeStats(finalTree);
  onProgress(100);
  onLog(`✓ Tree complete: ${finalTree.stats.total_icps} ICPs, ${finalTree.stats.total_personas} personas, ${finalTree.stats.total_plays_authored} plays authored, ${finalTree.stats.total_plays_skeleton} skeleton.`);
  return finalTree;
}

// ─── Expansion functions ──────────────────────────────────────────────────────
async function expandNode(
  tree: ICPTree,
  nodeId: string,
  hint: string,
  onLog: (msg: string) => void
): Promise<ICPTree> {
  const ctx = buildContext({});
  const newTree = JSON.parse(JSON.stringify(tree)) as ICPTree;

  // Find node and expand
  for (const icp of newTree.tam.icps) {
    if (icp.id === nodeId) {
      onLog(`Expanding ICP: ${icp.name} — ${hint || "adding sub-segments"}`);
      const extra = await genPersonas(ctx, icp, 2);
      icp.personas.push(...extra);
      icp.expansion_hints.push(`Expanded with ${extra.length} new personas`);
      newTree.stats = computeStats(newTree);
      return newTree;
    }
    for (const persona of icp.personas) {
      if (persona.id === nodeId) {
        onLog(`Expanding persona: ${persona.title} — ${hint || "adding JTBDs"}`);
        const extra = await genJTBDs(ctx, icp, persona, 2);
        for (const j of extra) {
          j.triggers = await genTriggers(ctx, icp, persona, j, 3);
          for (const t of j.triggers) t.readiness_states = genReadinessStates(t);
        }
        persona.jtbds.push(...extra);
        newTree.stats = computeStats(newTree);
        return newTree;
      }
    }
  }
  return newTree;
}

async function regeneratePlay(
  tree: ICPTree,
  rsId: string,
  hint: string,
  onLog: (msg: string) => void
): Promise<ICPTree> {
  const ctx = buildContext({});
  const newTree = JSON.parse(JSON.stringify(tree)) as ICPTree;

  for (const icp of newTree.tam.icps) {
    for (const persona of icp.personas) {
      for (const jtbd of persona.jtbds) {
        for (const trigger of jtbd.triggers) {
          for (const rs of trigger.readiness_states) {
            if (rs.id === rsId) {
              onLog(`Regenerating play for ${icp.name} → ${persona.title} → ${rs.state} (hint: ${hint || "none"})`);
              rs.play = await genPlay(ctx, icp, persona, jtbd, trigger, rs, rs.id);
              rs.play_status = "authored";
              if (hint) rs.expansion_hints.push(`Regenerated with hint: ${hint}`);
              newTree.stats = computeStats(newTree);
              return newTree;
            }
          }
        }
      }
    }
  }
  return newTree;
}

// ─── Export functions ─────────────────────────────────────────────────────────
function exportMarkdown(tree: ICPTree): string {
  const statusIcon = (n: NodeBase) => n.expansion_status === "complete" ? "✓" : n.expansion_status === "needs_expansion" ? "⚠" : "⊕";
  let md = `# ICP Tree — ${tree.company_name}\n_Generated ${new Date(tree.generated_at).toLocaleDateString()}_\n\n`;
  md += `**Stats:** ${tree.stats.total_icps} ICPs · ${tree.stats.total_personas} personas · ${tree.stats.total_jtbds} JTBDs · ${tree.stats.total_triggers} triggers · ${tree.stats.total_plays_authored} plays authored · ${tree.stats.total_plays_skeleton} skeleton\n\n`;
  md += `## TAM\n- **Total:** ${tree.tam.total_market}\n- **Addressable:** ${tree.tam.addressable_market}\n- **Serviceable:** ${tree.tam.serviceable_market}\n- **Key segments:** ${tree.tam.key_segments.join(", ")}\n\n`;
  for (const icp of tree.tam.icps) {
    md += `## ICP: ${icp.name} ${statusIcon(icp)}\n`;
    md += `**Motion:** ${icp.motion} · **Revenue:** ${icp.revenue_potential}\n`;
    md += `**Firmographics:** ${icp.firmographics.company_size} · ${icp.firmographics.industries.join("/")} · ${icp.firmographics.geography}\n`;
    md += `**Pain:** ${icp.pain_profile}\n\n`;
    for (const p of icp.personas) {
      md += `### Persona: ${p.title} ${statusIcon(p)}\n`;
      md += `**Seniority:** ${p.seniority} · **Dept:** ${p.department}\n`;
      md += `**Channels:** ${p.channels.join(", ")}\n\n`;
      for (const j of p.jtbds) {
        md += `#### JTBD: ${j.job_statement.slice(0, 80)}… ${statusIcon(j)}\n`;
        for (const t of j.triggers) {
          md += `##### Trigger: ${t.name} ${statusIcon(t)} [${t.urgency}/${t.detection_difficulty}]\n`;
          md += `_${t.detection_method}_\n\n`;
          for (const rs of t.readiness_states) {
            const playIcon = rs.play_status === "authored" ? "✓" : `⊝ skeleton (value ${rs.estimated_play_value}/100)`;
            md += `- **${rs.state.toUpperCase()}** (${rs.timing_window}) — play: ${playIcon}\n`;
            if (rs.play) {
              md += `  - Voice: ${rs.play.playbook_voice}\n`;
              md += `  - Hook: ${rs.play.hook}\n`;
              md += `  - CTA: ${rs.play.primary_cta}\n`;
            }
          }
          md += "\n";
        }
      }
    }
  }
  return md;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
const urgencyColor = (u: string) => ({ critical: C.red, high: C.accent, medium: C.amber, low: C.muted }[u] || C.muted);
const expansionIcon = (s: NodeBase["expansion_status"]) => s === "complete" ? "✓" : s === "needs_expansion" ? "⚠" : "⊕";
const expansionColor = (s: NodeBase["expansion_status"]) => s === "complete" ? C.green : s === "needs_expansion" ? C.red : C.muted;

// ─── Node Detail Panel ────────────────────────────────────────────────────────
function NodeDetail({
  selected, tree, onGeneratePlay, onRegenPlay, onExpand, generating
}: {
  selected: { type: string; id: string } | null;
  tree: ICPTree;
  onGeneratePlay: (rsId: string) => void;
  onRegenPlay: (rsId: string) => void;
  onExpand: (nodeId: string) => void;
  generating: boolean;
}) {
  if (!selected) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: head, fontSize: 13 }}>
        Select a node in the tree to view details
      </div>
    );
  }

  // Find the node
  let node: any = null;
  let context: { icp?: ICP; persona?: Persona; jtbd?: JTBD; trigger?: Trigger } = {};

  if (selected.type === "tam") { node = tree.tam; }
  for (const icp of tree.tam.icps) {
    if (icp.id === selected.id) { node = icp; break; }
    for (const p of icp.personas) {
      if (p.id === selected.id) { node = p; context = { icp }; break; }
      for (const j of p.jtbds) {
        if (j.id === selected.id) { node = j; context = { icp, persona: p }; break; }
        for (const t of j.triggers) {
          if (t.id === selected.id) { node = t; context = { icp, persona: p, jtbd: j }; break; }
          for (const rs of t.readiness_states) {
            if (rs.id === selected.id) { node = rs; context = { icp, persona: p, jtbd: j, trigger: t }; break; }
            if (rs.play?.id === selected.id) { node = rs.play; context = { icp, persona: p, jtbd: j, trigger: t }; break; }
          }
          if (node) break;
        }
        if (node) break;
      }
      if (node) break;
    }
    if (node) break;
  }

  if (!node) return <div style={{ padding: 24, color: C.muted, fontFamily: head, fontSize: 13 }}>Node not found</div>;

  const Pill = ({ label, color = C.muted }: { label: string; color?: string }) => (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, background: `${color}18`, color, fontSize: 11, fontFamily: mono, fontWeight: 600, marginRight: 6, marginBottom: 4 }}>{label}</span>
  );

  const Field = ({ label, value }: { label: string; value: string | string[] | undefined }) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: head, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
        {Array.isArray(value)
          ? <ul style={{ margin: 0, paddingLeft: 16 }}>{value.map((v, i) => <li key={i} style={{ fontSize: 12.5, color: C.text, fontFamily: head, lineHeight: 1.6 }}>{v}</li>)}</ul>
          : <p style={{ margin: 0, fontSize: 13, color: C.text, fontFamily: head, lineHeight: 1.6 }}>{value}</p>}
      </div>
    );
  };

  const btn = (label: string, onClick: () => void, accent = false) => (
    <button onClick={onClick} disabled={generating}
      style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${accent ? C.accent : C.border}`, background: accent ? C.accent : C.canvas, color: accent ? "#fff" : C.text, fontSize: 12, fontFamily: head, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer", opacity: generating ? 0.6 : 1, marginRight: 8 }}>
      {label}
    </button>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      {/* Breadcrumb */}
      {(context.icp || context.persona || context.jtbd || context.trigger) && (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginBottom: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {context.icp && <span>{context.icp.name}</span>}
          {context.persona && <><span style={{ opacity: 0.4 }}>›</span><span>{context.persona.title}</span></>}
          {context.jtbd && <><span style={{ opacity: 0.4 }}>›</span><span>{context.jtbd.job_statement.slice(0, 40)}…</span></>}
          {context.trigger && <><span style={{ opacity: 0.4 }}>›</span><span>{context.trigger.name}</span></>}
        </div>
      )}

      {/* Node type badge + expansion status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.08em", background: C.accentLo, padding: "2px 8px", borderRadius: 20 }}>{selected.type}</span>
        {node.expansion_status && (
          <span style={{ fontSize: 10, color: expansionColor(node.expansion_status), fontFamily: mono }}>
            {expansionIcon(node.expansion_status)} {node.expansion_status.replace("_", " ")}
          </span>
        )}
      </div>

      {/* Title */}
      <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, fontFamily: head, color: C.text, lineHeight: 1.3 }}>
        {node.name || node.title || node.job_statement || node.state?.toUpperCase() || "Node"}
      </h2>

      {/* ICP fields */}
      {selected.type === "icp" && (<>
        <div style={{ marginBottom: 12 }}>
          <Pill label={node.motion} color={C.accent} />
          <Pill label={node.firmographics?.company_size} />
          <Pill label={node.firmographics?.geography} />
          <Pill label={node.revenue_potential} color={C.green} />
        </div>
        <Field label="Industries" value={node.firmographics?.industries} />
        <Field label="Pain Profile" value={node.pain_profile} />
        <Field label="Description" value={node.description} />
        {node.expansion_hints?.length > 0 && <Field label="Expansion Hints" value={node.expansion_hints} />}
        <div style={{ marginTop: 16 }}>{btn("Expand ICP", () => onExpand(node.id))}</div>
      </>)}

      {/* Persona fields */}
      {selected.type === "persona" && (<>
        <div style={{ marginBottom: 12 }}>
          <Pill label={node.seniority} color={C.accent} />
          <Pill label={node.department} />
          {node.channels?.map((c: string) => <Pill key={c} label={c} />)}
        </div>
        <Field label="Goals" value={node.goals} />
        <Field label="Fears" value={node.fears} />
        <Field label="Common Objections" value={node.objections} />
      </>)}

      {/* JTBD fields */}
      {selected.type === "jtbd" && (<>
        <Field label="Job Statement" value={node.job_statement} />
        <Field label="Functional Outcome" value={node.functional_outcome} />
        <Field label="Emotional Outcome" value={node.emotional_outcome} />
        <Field label="Success Metrics" value={node.success_metrics} />
      </>)}

      {/* Trigger fields */}
      {selected.type === "trigger" && (<>
        <div style={{ marginBottom: 12 }}>
          <Pill label={node.urgency} color={urgencyColor(node.urgency)} />
          <Pill label={`${node.detection_difficulty} to detect`} />
        </div>
        <Field label="Description" value={node.description} />
        <Field label="Detection Method" value={node.detection_method} />
        <Field label="Example Signals" value={node.example_signals} />
        {node.expansion_hints?.length > 0 && <Field label="Expansion Hints" value={node.expansion_hints} />}
      </>)}

      {/* Readiness State */}
      {selected.type === "readiness" && (<>
        <div style={{ marginBottom: 12 }}>
          <Pill label={node.timing_window} color={C.accent} />
          {node.play_status === "authored" ? <Pill label="Play authored" color={C.green} /> : <Pill label={`Skeleton · value ${node.estimated_play_value}/100`} color={C.amber} />}
        </div>
        <Field label="Description" value={node.description} />
        <Field label="Behavioral Signals" value={node.behavioral_signals} />
        <Field label="Estimated Audience" value={node.estimated_audience_size} />
        {node.play_status === "skeleton_only" && (
          <div style={{ marginTop: 16, padding: 14, background: C.amberLo, borderRadius: 10, border: `1px solid ${C.amberBorder}` }}>
            <div style={{ fontSize: 12.5, color: C.text, fontFamily: head, marginBottom: 10 }}>
              Play not yet generated. Click below to author this play.
            </div>
            {btn("Generate Play", () => onGeneratePlay(node.id), true)}
          </div>
        )}
        {node.play_status === "authored" && node.play && (<>
          <div style={{ marginTop: 16, padding: 14, background: C.greenLo, borderRadius: 10, border: `1px solid ${C.greenBorder}`, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.green, fontFamily: mono, textTransform: "uppercase", marginBottom: 8 }}>Play Brief</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, marginBottom: 4 }}>Voice</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: head, marginBottom: 10 }}>{node.play.playbook_voice}</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, marginBottom: 4 }}>Hook</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: head, marginBottom: 10, lineHeight: 1.6 }}>{node.play.hook}</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, marginBottom: 4 }}>Value Prop</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: head, marginBottom: 10, lineHeight: 1.6 }}>{node.play.value_prop}</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, marginBottom: 4 }}>CTA</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: head, fontWeight: 600, marginBottom: 10 }}>{node.play.primary_cta}</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, marginBottom: 4 }}>Sequence Strategy</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: head, lineHeight: 1.6, marginBottom: 10 }}>{node.play.sequence_strategy}</div>
            {node.play.messaging_angles?.length > 0 && <>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, marginBottom: 4 }}>Messaging Angles to A/B Test</div>
              <ul style={{ margin: "0 0 10px", paddingLeft: 16 }}>
                {node.play.messaging_angles.map((a: string, i: number) => <li key={i} style={{ fontSize: 12.5, color: C.text, fontFamily: head, lineHeight: 1.6 }}>{a}</li>)}
              </ul>
            </>}
            {node.play.disqualifiers?.length > 0 && <>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, marginBottom: 4 }}>Disqualifiers (do not send to)</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {node.play.disqualifiers.map((d: string, i: number) => <li key={i} style={{ fontSize: 12.5, color: C.red, fontFamily: head, lineHeight: 1.6 }}>{d}</li>)}
              </ul>
            </>}
          </div>
          {btn("Regenerate Play", () => onRegenPlay(node.id))}
        </>)}
      </>)}

      {/* TAM */}
      {selected.type === "tam" && (<>
        <Field label="Total Market" value={node.total_market} />
        <Field label="Addressable Market" value={node.addressable_market} />
        <Field label="Serviceable Market" value={node.serviceable_market} />
        <Field label="Key Segments" value={node.key_segments} />
      </>)}
    </div>
  );
}

// ─── Tree Node Row ─────────────────────────────────────────────────────────────
function TreeRow({
  label, type, id, depth, status, urgent, skeleton, authoredCount, skeletonCount,
  selected, expanded, onSelect, onToggle, hasChildren
}: {
  label: string; type: string; id: string; depth: number;
  status?: NodeBase["expansion_status"]; urgent?: boolean; skeleton?: boolean;
  authoredCount?: number; skeletonCount?: number;
  selected: boolean; expanded: boolean; onSelect: () => void; onToggle: () => void; hasChildren: boolean;
}) {
  const isSelected = selected;
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: `5px 10px 5px ${10 + depth * 14}px`,
        background: isSelected ? C.accentMid : "transparent",
        borderRadius: 6, cursor: "pointer", marginBottom: 1,
        borderLeft: isSelected ? `2px solid ${C.accent}` : "2px solid transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = C.surface; }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {hasChildren ? (
        <button onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{ width: 16, height: 16, border: "none", background: "transparent", cursor: "pointer", color: C.muted, fontSize: 10, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {expanded ? "▾" : "▸"}
        </button>
      ) : <span style={{ width: 16, flexShrink: 0 }} />}

      <span style={{ flex: 1, fontSize: 12, fontFamily: head, fontWeight: isSelected ? 600 : 400, color: skeleton ? C.muted : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {skeleton && <span style={{ color: C.amber, marginRight: 4 }}>⊝</span>}
        {label}
      </span>

      {status && <span style={{ fontSize: 9, color: expansionColor(status), flexShrink: 0 }}>{expansionIcon(status)}</span>}
      {urgent && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, flexShrink: 0 }} title="Critical urgency" />}
      {typeof authoredCount === "number" && (
        <span style={{ fontSize: 9, fontFamily: mono, color: authoredCount > 0 ? C.green : C.amber, flexShrink: 0 }}>
          {authoredCount}/{(authoredCount || 0) + (skeletonCount || 0)}
        </span>
      )}
    </div>
  );
}

// ─── Tree Panel ───────────────────────────────────────────────────────────────
function TreePanel({ tree, selected, onSelect }: {
  tree: ICPTree;
  selected: { type: string; id: string } | null;
  onSelect: (type: string, id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add(tree.tam.id);
    tree.tam.icps.forEach(i => s.add(i.id));
    return s;
  });

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const isSelected = (type: string, id: string) => selected?.type === type && selected?.id === id;

  return (
    <div style={{ width: 280, borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: "10px 8px", flexShrink: 0, background: C.bg }}>
      {/* TAM */}
      <TreeRow label={`TAM — ${tree.tam.total_market}`} type="tam" id={tree.tam.id} depth={0}
        status={tree.tam.expansion_status} selected={isSelected("tam", tree.tam.id)} expanded={expanded.has(tree.tam.id)}
        onSelect={() => onSelect("tam", tree.tam.id)} onToggle={() => toggle(tree.tam.id)} hasChildren={tree.tam.icps.length > 0} />

      {expanded.has(tree.tam.id) && tree.tam.icps.map(icp => {
        const icpAuthored = icp.personas.flatMap(p => p.jtbds.flatMap(j => j.triggers.flatMap(t => t.readiness_states))).filter(r => r.play_status === "authored").length;
        const icpSkeleton = icp.personas.flatMap(p => p.jtbds.flatMap(j => j.triggers.flatMap(t => t.readiness_states))).filter(r => r.play_status === "skeleton_only").length;
        return (
          <div key={icp.id}>
            <TreeRow label={icp.name} type="icp" id={icp.id} depth={1} status={icp.expansion_status}
              authoredCount={icpAuthored} skeletonCount={icpSkeleton}
              selected={isSelected("icp", icp.id)} expanded={expanded.has(icp.id)}
              onSelect={() => onSelect("icp", icp.id)} onToggle={() => toggle(icp.id)} hasChildren={icp.personas.length > 0} />

            {expanded.has(icp.id) && icp.personas.map(persona => (
              <div key={persona.id}>
                <TreeRow label={persona.title} type="persona" id={persona.id} depth={2} status={persona.expansion_status}
                  selected={isSelected("persona", persona.id)} expanded={expanded.has(persona.id)}
                  onSelect={() => onSelect("persona", persona.id)} onToggle={() => toggle(persona.id)} hasChildren={persona.jtbds.length > 0} />

                {expanded.has(persona.id) && persona.jtbds.map(jtbd => (
                  <div key={jtbd.id}>
                    <TreeRow label={jtbd.job_statement.slice(0, 45) + "…"} type="jtbd" id={jtbd.id} depth={3} status={jtbd.expansion_status}
                      selected={isSelected("jtbd", jtbd.id)} expanded={expanded.has(jtbd.id)}
                      onSelect={() => onSelect("jtbd", jtbd.id)} onToggle={() => toggle(jtbd.id)} hasChildren={jtbd.triggers.length > 0} />

                    {expanded.has(jtbd.id) && jtbd.triggers.map(trigger => (
                      <div key={trigger.id}>
                        <TreeRow label={trigger.name} type="trigger" id={trigger.id} depth={4} status={trigger.expansion_status}
                          urgent={trigger.urgency === "critical"}
                          selected={isSelected("trigger", trigger.id)} expanded={expanded.has(trigger.id)}
                          onSelect={() => onSelect("trigger", trigger.id)} onToggle={() => toggle(trigger.id)} hasChildren={trigger.readiness_states.length > 0} />

                        {expanded.has(trigger.id) && trigger.readiness_states.map(rs => (
                          <TreeRow key={rs.id} label={rs.state.toUpperCase()} type="readiness" id={rs.id} depth={5}
                            skeleton={rs.play_status === "skeleton_only"}
                            selected={isSelected("readiness", rs.id)} expanded={false}
                            onSelect={() => onSelect("readiness", rs.id)} onToggle={() => {}} hasChildren={false} />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  ws: any;
  onSave: (updates: Partial<{ icpTree: ICPTree }>) => void;
}

export function ICPTreeGenerator({ ws, onSave }: Props) {
  const [tree, setTree] = useState<ICPTree | null>(() => ws.icpTree || null);
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState<string[]>([]);
  const [genProgress, setGenProgress] = useState(0);
  const [selected, setSelected] = useState<{ type: string; id: string } | null>(null);
  const [expandHint, setExpandHint] = useState("");
  const [regenHint, setRegenHint] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const config: GenerationConfig = {
    max_icps: 6,
    max_personas_per_icp: 3,
    max_jtbds_per_persona: 3,
    max_triggers_per_jtbd: 3,
    max_total_plays: 20,
  };

  const addLog = useCallback((msg: string) => {
    setGenLog(prev => [...prev, msg]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleGenerate = async () => {
    if (!ws.companyData?.co_name && !ws.companyData?.co_pitch) {
      setError("Please complete the Getting Started flow first so the tree has company data to work with.");
      return;
    }
    setError("");
    setGenerating(true);
    setGenLog([]);
    setGenProgress(0);
    setSelected(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await generateTree(ws, config, addLog, setGenProgress, ctrl.signal);
      setTree(result);
      onSave({ icpTree: result });
    } catch (e: any) {
      if (e.message !== "Generation cancelled") setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePlay = async (rsId: string) => {
    if (!tree) return;
    setGenerating(true);
    setError("");
    try {
      const newTree = await regeneratePlay(tree, rsId, "", addLog);
      setTree(newTree);
      onSave({ icpTree: newTree });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenPlay = async (rsId: string) => {
    if (!tree) return;
    setGenerating(true);
    setError("");
    try {
      const newTree = await regeneratePlay(tree, rsId, regenHint, addLog);
      setTree(newTree);
      onSave({ icpTree: newTree });
      setRegenHint("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleExpand = async (nodeId: string) => {
    if (!tree) return;
    setGenerating(true);
    setError("");
    try {
      const newTree = await expandNode(tree, nodeId, expandHint, addLog);
      setTree(newTree);
      onSave({ icpTree: newTree });
      setExpandHint("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportMD = () => {
    if (!tree) return;
    const blob = new Blob([exportMarkdown(tree)], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `icp-tree-${tree.company_name.toLowerCase().replace(/\s+/g, "-")}.md`; a.click();
  };

  const handleExportJSON = () => {
    if (!tree) return;
    const blob = new Blob([JSON.stringify(tree, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `icp-tree-${tree.company_name.toLowerCase().replace(/\s+/g, "-")}.json`; a.click();
  };

  // ── Landing ──────────────────────────────────────────────────────────────
  if (!tree && !generating) {
    const hasData = !!(ws.companyData?.co_name || ws.companyData?.co_pitch);
    return (
      <div style={{ minHeight: "100%", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, fontFamily: head }}>
        <div style={{ maxWidth: 540, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.accentMid, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 26 }}>⎇</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 10px" }}>ICP Tree Generator</h1>
          <p style={{ fontSize: 14, color: C.textSoft, lineHeight: 1.7, margin: "0 0 28px" }}>
            Builds a living TAM → ICP → Persona → JTBD → Trigger → Readiness → Play tree from your company profile. Runs after Getting Started so it can use your research, ICPs, and product data as the seed.
          </p>

          {!hasData && (
            <div style={{ padding: "12px 16px", background: C.amberLo, borderRadius: 10, border: `1px solid ${C.amberBorder}`, marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>Complete Getting Started first</div>
              <div style={{ fontSize: 12.5, color: C.textSoft }}>The ICP Tree uses your company profile, products, and existing personas as seed data. Run the Getting Started flow to populate this before generating.</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28, textAlign: "left" }}>
            {[
              ["⎇", "Auto-detect ICPs", "Identifies distinct go-to-market motions from your profile"],
              ["◑", "Full persona hierarchy", "Persona → JTBD → Trigger → Readiness for each ICP"],
              ["▶", "Play briefs", `Top ${config.max_total_plays} leaves get authored plays with voice, hook, CTA`],
              ["⊕", "Expandable", "Any node can be expanded or regenerated on demand"],
            ].map(([icon, title, desc]) => (
              <div key={title as string} style={{ padding: 14, background: C.canvas, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 16, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>

          {error && <div style={{ padding: "10px 14px", background: C.redLo, borderRadius: 8, border: `1px solid ${C.red}33`, color: C.red, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <button onClick={handleGenerate} disabled={!hasData}
            style={{ padding: "12px 32px", borderRadius: 10, border: "none", background: hasData ? C.accent : C.border, color: hasData ? "#fff" : C.muted, fontSize: 14, fontWeight: 700, fontFamily: head, cursor: hasData ? "pointer" : "not-allowed" }}>
            Generate ICP Tree
          </button>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>
            Uses Claude Haiku for structure, Sonnet for plays. Typical cost: $0.10–0.40
          </div>
        </div>
      </div>
    );
  }

  // ── Generating ─────────────────────────────────────────────────────────────
  if (generating && !tree) {
    return (
      <div style={{ minHeight: "100%", background: C.bg, display: "flex", flexDirection: "column", padding: 40, fontFamily: head }}>
        <div style={{ maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}>Generating ICP Tree</h2>
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: C.accent, width: `${genProgress}%`, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginTop: 4 }}>{genProgress}% complete</div>
          </div>
          <div style={{ background: C.canvas, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, fontFamily: mono, fontSize: 11.5, color: C.textSoft, lineHeight: 1.8, maxHeight: 380, overflowY: "auto" }}>
            {genLog.map((line, i) => (
              <div key={i} style={{ color: line.startsWith("✓") ? C.green : line.startsWith("⚠") ? C.amber : C.textSoft }}>{line}</div>
            ))}
            {generating && <div style={{ animation: "blink 1s step-end infinite" }}>▊</div>}
            <div ref={logEndRef} />
          </div>
          <button onClick={() => { abortRef.current?.abort(); setGenerating(false); }}
            style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12, fontFamily: head, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
        <style>{`@keyframes blink{50%{opacity:0}}`}</style>
      </div>
    );
  }

  // ── Tree view ──────────────────────────────────────────────────────────────
  const stats = tree!.stats;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, fontFamily: head }}>
      {/* Header bar */}
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: C.canvas, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginRight: 8 }}>{tree!.company_name} — ICP Tree</div>
        {[
          [`${stats.total_icps} ICPs`, C.accent],
          [`${stats.total_personas} personas`, C.textSoft],
          [`${stats.total_jtbds} JTBDs`, C.textSoft],
          [`${stats.total_plays_authored} plays`, C.green],
          [`${stats.total_plays_skeleton} skeleton`, C.amber],
        ].map(([label, color]) => (
          <span key={label as string} style={{ fontSize: 11.5, color: color as string, fontFamily: mono, background: `${color as string}12`, padding: "2px 8px", borderRadius: 20 }}>{label}</span>
        ))}
        <div style={{ flex: 1 }} />
        {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
        {generating && <span style={{ fontSize: 12, color: C.accent, fontFamily: mono }}>Working…</span>}
        <button onClick={handleExportMD} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", fontSize: 12, color: C.textSoft, cursor: "pointer", fontFamily: head }}>↓ Markdown</button>
        <button onClick={handleExportJSON} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", fontSize: 12, color: C.textSoft, cursor: "pointer", fontFamily: head }}>↓ JSON</button>
        <button onClick={() => { setTree(null); setGenLog([]); setGenProgress(0); setSelected(null); setError(""); }} disabled={generating}
          style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.accentBorder}`, background: C.accentLo, fontSize: 12, color: C.accent, cursor: "pointer", fontFamily: head, fontWeight: 600 }}>
          Regenerate
        </button>
      </div>

      {/* Expansion suggestions */}
      {tree!.expansion_suggestions.length > 0 && (
        <div style={{ padding: "8px 20px", borderBottom: `1px solid ${C.border}`, background: C.amberLo, display: "flex", gap: 12, alignItems: "center", overflowX: "auto" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, fontFamily: mono, flexShrink: 0 }}>⚠ SUGGESTIONS</span>
          {tree!.expansion_suggestions.slice(0, 4).map(s => (
            <button key={s.node_id} onClick={() => setSelected({ type: s.node_type, id: s.node_id })}
              style={{ padding: "3px 10px", borderRadius: 20, border: `1px solid ${C.amberBorder}`, background: "transparent", fontSize: 11.5, color: C.text, cursor: "pointer", fontFamily: head, flexShrink: 0 }}>
              {s.node_name}: {s.reason.slice(0, 50)}
            </button>
          ))}
        </div>
      )}

      {/* Main two-panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <TreePanel tree={tree!} selected={selected} onSelect={(type, id) => setSelected({ type, id })} />
        <NodeDetail
          selected={selected}
          tree={tree!}
          onGeneratePlay={handleGeneratePlay}
          onRegenPlay={handleRegenPlay}
          onExpand={handleExpand}
          generating={generating}
        />
      </div>

      {/* Generating overlay log (when regenerating/expanding with tree visible) */}
      {generating && tree && genLog.length > 0 && (
        <div style={{ position: "absolute" as const, bottom: 20, right: 20, width: 340, background: C.canvas, borderRadius: 10, border: `1px solid ${C.border}`, boxShadow: "0 4px 20px rgba(0,0,0,.12)", padding: 14, fontFamily: mono, fontSize: 11, color: C.textSoft, maxHeight: 180, overflowY: "auto", zIndex: 100 }}>
          {genLog.slice(-8).map((line, i) => <div key={i}>{line}</div>)}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
