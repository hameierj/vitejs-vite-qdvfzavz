// infra-run — edge function (Track B of the gated onboarding flow)
// Sizes and generates the sending infrastructure (domains + mailboxes) from the
// INTAKE FORM ALONE — no dependency on the TAM tree — so it runs fully parallel
// from intake submit. Accepts { workspaceId }, responds with jobId, runs under
// EdgeRuntime.waitUntil, writes progress + result to app_data[infra_job_<wsId>].
// The client merges result.dfySetup into dfySetup state.
//
// Required Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JOB_KEY = (wsId: string) => `infra_job_${wsId}`;
const WS_KEY = (wsId: string) => `ws_${wsId}`;

// Sizing assumptions for a warmed cold-email mailbox.
const PER_MAILBOX_DAILY = 30;
const WORKING_DAYS_PER_MONTH = 22;
const MAILBOXES_PER_DOMAIN = 3;
const DEFAULT_DOMAINS = 67;
const DEFAULT_MAILBOXES = 201;

function uid(): string { return crypto.randomUUID(); }

async function readWs(sb: SupabaseClient, wsId: string): Promise<any> {
  try {
    const { data } = await sb.from("app_data").select("value").eq("key", WS_KEY(wsId)).single();
    // app_data.value is jsonb; the client stores the workspace as a raw object,
    // so it comes back already parsed. Only JSON.parse legacy string values.
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

async function callClaude(anthropicKey: string, prompt: string, tokens: number): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: tokens, system: "Return only valid JSON.", messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Claude error ${r.status}`);
  const json = await r.json();
  return json.content?.[0]?.text ?? "";
}

// Generate domain stems from the brand word + prefix/suffix combos (lifted from
// the original launchpad-run domain generator).
function generateStems(brand: string, count: number): string[] {
  const prefs = ["get","try","go","my","meet","join","use","run","hello","ask","all","top","best","fast","new","pro","we","by","hey","with","hi"];
  const suffs = ["hq","app","team","co","hub","labs","pro","now","up","biz","mail","digital","online","direct","global","works","cloud","send","reach","zone","base","desk","box","line","edge","plus","one","center","corp","studio","agency","web","first","core","flow","link","key","ace","net","io"];
  const dc = new Set<string>();
  for (const p of prefs) { const s = p + brand; if (s.length >= 5 && s.length <= 22) { dc.add(s); dc.add(p + "-" + brand); } }
  for (const s of suffs) { const d = brand + s; if (d.length >= 5 && d.length <= 22) { dc.add(d); dc.add(brand + "-" + s); } }
  dc.add(brand);
  const all = [...dc].filter((d) => d.length >= 5 && d.length <= 26);
  return all.slice(0, count);
}

async function runPipeline(sb: SupabaseClient, anthropicKey: string, wsId: string, infraInputs: any = {}): Promise<void> {
  await appendLog(sb, wsId, "Reading infrastructure configuration...");
  const ws = await readWs(sb, wsId);
  const cd = ws.companyData || {};
  const intake = cd._intakeData || {};
  const existing = ws.dfySetup || {};
  const inp = infraInputs || {};

  // ── Size from explicit user answers (preferred); fall back to intake volume, then defaults ──
  const targetVolume = Number(intake.targetMonthlyVolume) || 0;
  let mailboxCount: number;
  let domainCount: number;
  let sizingBasis: string;
  if (Number(inp.domainCount) || Number(inp.mailboxCount)) {
    mailboxCount = Number(inp.mailboxCount) || (Number(inp.domainCount) || DEFAULT_DOMAINS) * MAILBOXES_PER_DOMAIN;
    domainCount = Number(inp.domainCount) || Math.ceil(mailboxCount / MAILBOXES_PER_DOMAIN);
    domainCount = Math.max(1, Math.min(300, domainCount));
    mailboxCount = Math.max(1, mailboxCount);
    sizingBasis = "user_specified";
  } else if (targetVolume > 0) {
    mailboxCount = Math.max(MAILBOXES_PER_DOMAIN, Math.ceil(targetVolume / (PER_MAILBOX_DAILY * WORKING_DAYS_PER_MONTH)));
    domainCount = Math.max(1, Math.min(200, Math.ceil(mailboxCount / MAILBOXES_PER_DOMAIN)));
    mailboxCount = domainCount * MAILBOXES_PER_DOMAIN;
    sizingBasis = "intake_target_volume";
  } else {
    mailboxCount = DEFAULT_MAILBOXES;
    domainCount = DEFAULT_DOMAINS;
    sizingBasis = "default";
  }
  await appendLog(sb, wsId, `Allocating ${domainCount} domains / ${mailboxCount} mailboxes (${sizingBasis})`);

  // ── Domains are .com only (per spec) ──
  const tlds: string[] = [".com"];
  const primaryTld = ".com";

  // ── Brand word for domain stems — derived from the primary website answer ──
  const primaryWebsite = String(inp.primaryWebsite || cd.co_website || "");
  const website = primaryWebsite.replace(/https?:\/\//i, "").replace(/\/.*/, "").replace(/^www\./, "").toLowerCase();
  const hostParts = website.split(".");
  const fwdStem = (hostParts.length >= 2 ? hostParts[hostParts.length - 2] : hostParts[0] || "").replace(/[^a-z0-9]/g, "");
  const stopW = new Set(["the","and","for","inc","llc","ltd","corp","group","company","services","solutions","consulting"]);
  const nameW = (cd.co_name || "company").toLowerCase().split(/[\s,.\-&]+/).filter((w: string) => w.length >= 2 && !stopW.has(w));
  const nameJ = nameW.join("");
  const userBrand = (inp.brandWord && String(inp.brandWord).trim()) ? String(inp.brandWord).trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    : (intake.brandWords && String(intake.brandWords).trim()) ? String(intake.brandWords).trim().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const brand = userBrand && userBrand.length >= 3 ? userBrand
    : (fwdStem && fwdStem.length >= 3 && fwdStem.length <= 18 ? fwdStem : (nameJ.length <= 18 ? nameJ : nameW[0] || "company"));

  await appendLog(sb, wsId, `Generating domains around brand "${brand}"...`);
  const stems = generateStems(brand, domainCount);

  // Top up with AI-generated stems if the deterministic generator falls short.
  if (stems.length < domainCount) {
    try {
      const raw = await callClaude(anthropicKey,
        `Generate ${(domainCount - stems.length) * 3} creative cold-email domain stems for "${cd.co_name}" (${cd.co_industry || ""}). Brand word: "${brand}". Every stem MUST contain the brand word. Stems only — no TLD. Already used: ${stems.slice(0, 40).join(",")}. Return ONLY JSON array of stems: ["name1","name2",...]`,
        1000);
      const aiD: string[] = JSON.parse((raw || "[]").replace(/```json|```/g, "").trim());
      for (const s of aiD) {
        if (stems.length >= domainCount) break;
        const cl = String(s).toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (cl.length >= 5 && cl.length <= 26 && !stems.includes(cl)) stems.push(cl);
      }
    } catch { /* non-fatal */ }
  }

  const suggestedDomains = stems.slice(0, domainCount).map((stem) => ({ domain: stem, tld: primaryTld, full: stem + primaryTld }));
  const forwardingDomain = String(inp.forwardingDomain || primaryWebsite || "");

  // ── Mailbox sender names + percent distribution → allocation counts ──
  const rawNames: any[] = Array.isArray(inp.mailboxNames) ? inp.mailboxNames.filter((n: any) => (n?.name || n?.firstName)) : [];
  const totalPct = rawNames.reduce((s, n) => s + (Number(n.percent) || 0), 0) || 0;
  const mailboxNames = rawNames.map((n: any) => {
    const full = String(n.name || `${n.firstName || ""} ${n.lastName || ""}`).trim();
    const parts = full.split(/\s+/);
    const percent = Number(n.percent) || 0;
    // If percents don't sum to 100, allocate proportionally to whatever was given.
    const share = totalPct > 0 ? percent / totalPct : (rawNames.length ? 1 / rawNames.length : 0);
    return { name: full, firstName: n.firstName || parts[0] || "", lastName: n.lastName || parts.slice(1).join(" ") || "", percent, allocation: Math.round(share * mailboxCount) };
  });

  // ── Explicit mailbox list: assign senders across domains by their allocation ──
  const senderSeq: any[] = [];
  if (mailboxNames.length) {
    for (const n of mailboxNames) for (let i = 0; i < n.allocation; i++) senderSeq.push(n);
    while (senderSeq.length < mailboxCount) senderSeq.push(mailboxNames[senderSeq.length % mailboxNames.length]);
  }
  const localPart = (sender: any, variantIdx: number): string => {
    const f = String(sender?.firstName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const l = String(sender?.lastName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const opts = l ? [f, `${f}.${l}`, `${f}${l[0]}`, `${f[0]}${l}`] : [f || "hello", `${f || "hello"}1`, `${f || "team"}`, `${f || "hi"}`];
    return opts[variantIdx % opts.length] || `mailbox${variantIdx}`;
  };
  const mailboxes: any[] = [];
  let si = 0;
  for (const d of suggestedDomains) {
    for (let m = 0; m < MAILBOXES_PER_DOMAIN && mailboxes.length < mailboxCount; m++) {
      const sender = senderSeq[si++] || mailboxNames[0] || { firstName: brand, lastName: "", name: brand };
      mailboxes.push({ address: `${localPart(sender, m)}@${d.full}`, domain: d.full, senderName: sender.name || `${sender.firstName} ${sender.lastName}`.trim() });
    }
  }

  const dfySetup = {
    ...existing,
    tlds,
    domainCount,
    mailboxCount,
    mailboxes,
    mailboxesPerDomain: MAILBOXES_PER_DOMAIN,
    customAmount: sizingBasis === "user_specified",
    primaryWebsite,
    targetMonthlyVolume: targetVolume || null,
    forwardingDomain,
    forwardingVerified: existing.forwardingVerified ?? null,
    mailboxNames,
    suggestedDomains,
    approvedDomains: suggestedDomains.map((d) => d.domain), // preselect all
    sizingBasis,
    generatedAt: new Date().toISOString(),
  };

  await appendLog(sb, wsId, `Prepared ${suggestedDomains.length} domains for review`);
  await writeJob(sb, wsId, { status: "done", phase: "Complete", completedAt: new Date().toISOString(), result: { dfySetup } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? req.headers.get("x-anthropic-key") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const { workspaceId, infraInputs } = await req.json() as { workspaceId?: string; infraInputs?: any };
    if (!workspaceId) return new Response(JSON.stringify({ error: "workspaceId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!supabaseUrl || !supabaseKey) return new Response(JSON.stringify({ error: "server not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(supabaseUrl, supabaseKey);
    const jobId = uid();
    await sb.from("app_data").upsert({ key: JOB_KEY(workspaceId), value: JSON.stringify({ jobId, status: "running", phase: "Starting...", log: ["Starting infrastructure setup..."], startedAt: new Date().toISOString() }) }, { onConflict: "key" });

    // @ts-ignore — EdgeRuntime is available in the Supabase Deno runtime
    EdgeRuntime.waitUntil((async () => {
      try { await runPipeline(sb, anthropicKey, workspaceId, infraInputs || {}); }
      catch (err) {
        console.error("infra pipeline failed:", err);
        await writeJob(sb, workspaceId, { status: "error", error: String((err as Error)?.message ?? err), completedAt: new Date().toISOString() });
      }
    })());

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
