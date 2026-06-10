import { useState, useEffect } from "react";
import { callClaudeProxy, parseJSON } from "../../lib/callClaude";
import { PLAYBOOKS, buildPlaybookContext, type PlaybookKey } from "../../lib/playbooks";
import { ElapsedTimer } from "./ElapsedTimer";

// STEP 5 — Outreach Campaign generation. Mirrors the original "Getting Started"
// email flow: pick a product/service → a persona → a tone (playbook) → optional
// extra instructions, then generate ONE LinkedIn sequence + THREE email campaigns
// (Conversation Starter, Meeting CTA, Value-Based CTA). Talks to Claude through
// the server-side ai-proxy (callClaudeProxy) so it works without a user API key.

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7", borderHi: "#D8DEE9",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  blue: "#54A0FF", blueLo: "#54A0FF12",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const EMAIL_DAYS = [0, 3, 7, 14, 21];
const LINKEDIN_DAYS = [0, 2, 5, 10, 17];

// The three email campaign archetypes — from the original Getting Started flow.
// offerFocus marks the Value-Based campaign, which must feature concrete, named
// free offers (lead magnets) rather than vague "value".
const EMAIL_DEFS: { label: string; short: string; ctaInstr: string; offerFocus?: boolean }[] = [
  { label: "Email 1 — Conversation Starter", short: "Conversation Starter", ctaInstr: "Lead with value (free audit, consultation, or industry insight). No hard ask. Soft CTA only — e.g. 'Worth a quick look?', 'Thoughts?'. Never ask for a meeting." },
  { label: "Email 2 — Meeting CTA", short: "Meeting CTA", ctaInstr: "Direct ask for a meeting or demo. Short, confident, clear. CTA must directly ask for a meeting — e.g. 'Open to a 15-min call?', 'Worth 20 minutes?'. No soft hedging." },
  { label: "Email 3 — Value-Based CTA", short: "Value-Based CTA", offerFocus: true, ctaInstr: "Lead with a SPECIFIC, tangible, FREE offer (a real lead magnet — not vague 'value'), then ask for the meeting. Structure: pain → the free thing they get, named concretely → meeting ask. e.g. 'Want the free lead list first?', 'Worth seeing the sample we'd build for you?'." },
];

interface Step { id: string; stepNumber: number; role: string; dayOffset: number; subject?: string; body: string; }
interface EmailCampaign { label: string; short: string; ctaInstr: string; sequence: Step[]; }
interface Result {
  productId: string; personaId: string; productName: string; personaName: string;
  playbookKey: PlaybookKey; instructions: string; generatedAt: string;
  emailStrategy: string; linkedinStrategy: string;
  linkedinSequence: Step[]; emailCampaigns: EmailCampaign[];
}

interface Props {
  companyData: any;
  products: any[];
  icps: any[];
  // Persist generator metadata (the rich plan + timestamp) onto companyData.
  onSave: (updates: { companyData?: any }) => void;
  // Write the generated set (1 LinkedIn + 3 email) into the canonical campaigns
  // store — idempotent per (product × persona). Used so the Matrix/List see them.
  onSaveCampaigns: (productId: string, personaId: string, plan: Result) => void;
  // Mark the Step 5 gate confirmed and return to the onboarding hub.
  onConfirm: () => void;
}

const SYSTEM = "You are an expert B2B cold-outreach copywriter. Write real, specific, human copy — never templates or placeholders. Follow the requested format and CTA style exactly.";

export function EmailCampaignGenerator({ companyData, products, icps, onSave, onSaveCampaigns, onConfirm }: Props) {
  const cd = companyData as any;
  const plans: Record<string, Result> = cd?._campaignPlans || {};

  const [productId, setProductId] = useState<string>(products?.[0]?.id || "");
  // Prefer enriched personas (those with real persona data) at the top of the picker.
  const sortedPersonas = [...(icps || [])].sort((a: any, b: any) => {
    const ea = a.data && (a.data.pain1 || a.data.buyer) ? 0 : 1;
    const eb = b.data && (b.data.pain1 || b.data.buyer) ? 0 : 1;
    return ea - eb;
  });
  const [personaId, setPersonaId] = useState<string>(sortedPersonas?.[0]?.id || "");
  const [playbookKey, setPlaybookKey] = useState<PlaybookKey>("auto");
  const [instructions, setInstructions] = useState<string>("");
  const [freeOffers, setFreeOffers] = useState<string>("");

  const [generating, setGenerating] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [phase, setPhase] = useState("");
  // Load any previously-generated plan for the default product×persona combo.
  const [result, setResult] = useState<Result | null>(() => plans[`${productId}__${personaId}`] || null);
  const [emailTab, setEmailTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const product = (products || []).find((p: any) => p.id === productId) || products?.[0] || {};
  const persona = (icps || []).find((p: any) => p.id === personaId) || sortedPersonas?.[0] || {};

  // When the product/persona selection changes, surface the saved plan for that
  // combo (or clear to the empty state if none exists yet). Don't run mid-generation.
  useEffect(() => {
    if (generating) return;
    const existing = plans[`${productId}__${personaId}`] || null;
    setResult(existing);
    setEmailTab(0);
    setError(null);
    if (existing) {
      setPlaybookKey(existing.playbookKey || "auto");
      setInstructions(existing.instructions || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, personaId]);

  const addLog = (m: string) => setLog((p) => [...p, m]);

  const generate = async () => {
    if (!product?.id || !persona?.id) return;
    // Generation runs through the server-side ai-proxy (Supabase secret key), so
    // no user/localStorage key is required — same path the gated stages use.
    setGenerating(true);
    setResult(null);
    setError(null);
    setLog(["Building context…"]);

    // Capture the first real failure so we can surface it after the run.
    let firstErr = "";
    const note = (label: string, e: any) => {
      const m = e?.message || String(e);
      addLog(`${label} failed: ${m}`);
      if (!firstErr) firstErr = m;
    };

    try {
      const pd = persona?.data || {};
      const ctx = {
        company: {
          name: cd.co_name || "", pitch: cd.co_pitch || "",
          valueProposition: cd.co_diff || "", proofPoints: cd.co_proof || "",
        },
        product: {
          name: product.name || "", description: product.description || "",
          valueProposition: product.valueProposition || "", keyFeatures: product.keyFeatures || "",
          problemsSolved: product.problemsSolved || "", elevatorPitch: product.elevatorPitch || "",
        },
        icp: { ...pd, name: persona?.name },
      };
      const ctxStr = JSON.stringify(ctx).slice(0, 4000);
      const emailPbBlock = buildPlaybookContext(playbookKey, { channel: "email" });
      const liPbBlock = buildPlaybookContext(playbookKey, { channel: "linkedin" });
      const instrBlock = instructions.trim()
        ? `\nSPECIFIC INSTRUCTIONS / EXTRA CONTEXT (apply throughout — highest priority):\n${instructions.trim()}\n`
        : "";

      // ── Email strategy brief ──
      setPhase("Email strategy…"); addLog("Generating email strategy brief…");
      let emailStrategy = "";
      try {
        emailStrategy = await callClaudeProxy(
          `Generate a campaign strategy brief for EMAIL cold outreach.
Context: ${ctxStr}
${emailPbBlock}${instrBlock}
Write a focused strategy brief that the email copy will be based on. Cover:

**ICP SNAPSHOT** (2 sentences — who they are and what drives them)

**LEAD PAIN** (the sharpest pain — must stop a scroll)

**MESSAGE ARCHITECTURE**
Hook: [opening angle]
Value: [what we offer against the pain]
Proof: [credibility signal]
CTA: [low-friction ask]

**5-EMAIL SEQUENCE STRATEGY**
Email 1 (Day 0): [angle]
Email 2 (Day 3): [angle]
Email 3 (Day 7): [angle]
Email 4 (Day 14): [angle]
Email 5 (Day 21): [angle — breakup]

**PERSONALIZATION LAYERS**
1. [layer]
2. [layer]
3. [layer]

HARD RULE: No links or URLs anywhere in the email sequence. All CTAs must be reply-based only.`,
          SYSTEM, 900, "sonnet"
        );
      } catch (e: any) { note("Email strategy", e); }

      // ── LinkedIn strategy brief ──
      setPhase("LinkedIn strategy…"); addLog("Generating LinkedIn strategy brief…");
      let linkedinStrategy = "";
      try {
        linkedinStrategy = await callClaudeProxy(
          `Generate a campaign strategy brief for LINKEDIN outreach.
Context: ${ctxStr}
${liPbBlock}${instrBlock}
Write a focused LinkedIn strategy that the message sequence will be based on. Cover:

**ICP SNAPSHOT** (2 sentences)

**LINKEDIN-SPECIFIC ANGLE** (what makes this persona responsive on LinkedIn)

**5-TOUCH MESSAGE ARC**
Touch 1 (Day 0 — connection): [angle]
Touch 2 (Day 2): [angle]
Touch 3 (Day 5): [angle]
Touch 4 (Day 10): [angle]
Touch 5 (Day 17 — breakup): [angle]

**CTA APPROACH** (ultra-low-friction)

**PERSONALIZATION SIGNALS** (what to look for in their LinkedIn profile)`,
          SYSTEM, 800, "sonnet"
        );
      } catch (e: any) { note("LinkedIn strategy", e); }

      // ── LinkedIn sequence (1 campaign) ──
      setPhase("LinkedIn sequence…"); addLog("Writing LinkedIn sequence (1 campaign)…");
      let linkedinSequence: Step[] = [];
      try {
        const lr = await callClaudeProxy(
          `Write a 5-touch LinkedIn outreach sequence. Max 300 chars for connection request, 500 chars for messages.

Context: ${ctxStr}
${liPbBlock}${instrBlock}
LINKEDIN STRATEGY (follow this exactly):
${linkedinStrategy.slice(0, 1000)}

Rules:
- Touch 1 (Day 0): connection request only — personal reason to connect, NO pitch
- Touch 2-5: conversational DMs adapted for LinkedIn format
- CTAs ultra-low-friction

Return ONLY valid JSON:
{"steps":[{"stepNumber":1,"role":"connection","dayOffset":0,"body":"connection request text"},{"stepNumber":2,"role":"follow_up","dayOffset":2,"body":"message"},{"stepNumber":3,"role":"value","dayOffset":5,"body":"message"},{"stepNumber":4,"role":"proof","dayOffset":10,"body":"message"},{"stepNumber":5,"role":"breakup","dayOffset":17,"body":"message"}]}`,
          SYSTEM, 1000, "sonnet"
        );
        const lp = parseJSON<{ steps: any[] }>(lr, { steps: [] });
        linkedinSequence = (lp.steps || []).map((s: any, i: number) => ({
          id: uid(), stepNumber: s.stepNumber || i + 1, role: s.role || "follow_up",
          dayOffset: s.dayOffset ?? LINKEDIN_DAYS[i] ?? i * 3, body: s.body || "",
        }));
      } catch (e: any) { note("LinkedIn sequence", e); }

      // ── Three email campaigns ──
      const emailCampaigns: EmailCampaign[] = [];
      for (let ei = 0; ei < EMAIL_DEFS.length; ei++) {
        const def = EMAIL_DEFS[ei];
        setPhase(`Email campaign ${ei + 1}/3 — ${def.short}…`);
        addLog(`Writing email campaign ${ei + 1}/3 (${def.short})…`);
        const companyName = cd.co_name || "the client";
        const offerBlock = def.offerFocus
          ? `\nFREE-OFFER REQUIREMENT (critical for this campaign):
Every email must feature a SPECIFIC, tangible, FREE offer that ${companyName} can hand over — a real lead magnet that creates excitement. Name the exact asset; never say just "value", "insights", or "a resource".
${freeOffers.trim()
  ? `Use these real free offers the client provides — rotate/vary them across the 5 emails (don't reuse the same one every time):\n${freeOffers.trim()}`
  : `Invent concrete, plausible free offers grounded in ${companyName}'s own products/services — e.g. a free sample/starter lead list, a free month or trial of a product, a free audit or teardown, a free playbook/template pack, a free data or benchmark report. Make each one specific and enticing.`}
The meeting ask comes only AFTER the free offer is on the table, and is framed as "want the [free thing] first?".\n`
          : "";
        let sequence: Step[] = [];
        try {
          const er = await callClaudeProxy(
            `Write a 5-email cold outreach sequence. Real emails, not templates. Max 100 words each body.

Context: ${ctxStr}
${emailPbBlock}${instrBlock}
EMAIL STRATEGY (follow this exactly):
${emailStrategy.slice(0, 1200)}

CTA STYLE FOR THIS CAMPAIGN: ${def.ctaInstr}
${offerBlock}
Rules:
- Email 1 (Day 0): lead with the LEAD PAIN — hook, short, personal
- Email 2 (Day 3): different angle + trigger event
- Email 3 (Day 7): proof/social proof + objection addressed
- Email 4 (Day 14): gain angle
- Email 5 (Day 21): breakup — direct, human, low-friction
- ALL CTAs must strictly follow the CTA STYLE above.
- ZERO links or URLs in any email. CTAs must be reply-based only.

Return ONLY valid JSON:
{"steps":[{"stepNumber":1,"role":"hook","dayOffset":0,"subject":"...","body":"..."},{"stepNumber":2,"role":"proof","dayOffset":3,"subject":"...","body":"..."},{"stepNumber":3,"role":"value","dayOffset":7,"subject":"...","body":"..."},{"stepNumber":4,"role":"urgency","dayOffset":14,"subject":"...","body":"..."},{"stepNumber":5,"role":"breakup","dayOffset":21,"subject":"...","body":"..."}]}`,
            SYSTEM, 1500, "sonnet"
          );
          const ep = parseJSON<{ steps: any[] }>(er, { steps: [] });
          sequence = (ep.steps || []).map((s: any, i: number) => ({
            id: uid(), stepNumber: s.stepNumber || i + 1, role: s.role || "hook",
            dayOffset: s.dayOffset ?? EMAIL_DAYS[i] ?? i * 7, subject: s.subject || "", body: s.body || "",
          }));
        } catch (e: any) { note(`Email campaign ${ei + 1}`, e); }
        emailCampaigns.push({ label: def.label, short: def.short, ctaInstr: def.ctaInstr, sequence });
      }

      const res: Result = {
        productId: product.id, personaId: persona.id,
        productName: product.name || "", personaName: persona.name || "",
        playbookKey, instructions: instructions.trim(), generatedAt: new Date().toISOString(),
        emailStrategy, linkedinStrategy, linkedinSequence, emailCampaigns,
      };
      setResult(res);
      setEmailTab(0);
      setPhase(""); addLog("Done.");

      const anyContent = linkedinSequence.length > 0 || emailCampaigns.some((c) => c.sequence.length > 0);
      if (!anyContent) {
        setError(firstErr || "Generation returned no usable content — the model response couldn't be parsed. Try Regenerate.");
      } else if (firstErr) {
        setError(`Some parts didn't generate: ${firstErr}`);
      } else {
        setError(null);
      }

      // Persist when we produced something: keep the rich plan on companyData
      // (so the step shows "review" and the generator reloads it), AND write the
      // 4 campaigns into the canonical store so the Matrix/List include them.
      if (anyContent) {
        const key = `${product.id}__${persona.id}`;
        onSave({
          companyData: {
            ...cd,
            _campaignPlans: { ...plans, [key]: res },
            _campaignsGeneratedAt: new Date().toISOString(),
          },
        });
        onSaveCampaigns(product.id, persona.id, res);
      }
    } catch (e: any) {
      addLog(`Error: ${e.message || e}`);
      setError(e?.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  // Campaigns are auto-saved to the canonical store on generate; this just
  // re-saves defensively and marks Step 5 confirmed, then returns to the hub.
  const confirmStep = () => {
    if (!result) return;
    onSaveCampaigns(result.productId, result.personaId, result);
    onConfirm();
  };

  const copyAll = () => {
    if (!result) return;
    const L: string[] = [];
    L.push(`OUTREACH CAMPAIGNS — ${result.personaName} × ${result.productName}`);
    const pb = PLAYBOOKS[result.playbookKey];
    if (pb && pb.key !== "auto") L.push(`Tone: ${pb.label}`);
    if (result.instructions) L.push(`Instructions: ${result.instructions}`);
    L.push("=".repeat(60));
    L.push("\nLINKEDIN SEQUENCE");
    L.push("-".repeat(60));
    result.linkedinSequence.forEach((t) => {
      L.push(`\nTouch ${t.stepNumber} — Day ${t.dayOffset} [${t.role}]`);
      L.push(t.body);
    });
    result.emailCampaigns.forEach((c) => {
      L.push("\n" + "=".repeat(60));
      L.push(c.label.toUpperCase());
      L.push("-".repeat(60));
      c.sequence.forEach((t) => {
        L.push(`\nTouch ${t.stepNumber} — Day ${t.dayOffset} [${t.role}]`);
        if (t.subject) L.push(`Subject: ${t.subject}`);
        L.push(t.body);
      });
    });
    navigator.clipboard.writeText(L.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const canGenerate = !!product?.id && !!persona?.id && !generating;
  const selectStyle: any = {
    width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8,
    border: `1px solid ${C.border}`, fontSize: 13, fontFamily: head, color: C.text,
    background: C.canvas, cursor: "pointer", appearance: "auto",
  };
  const field = (label: string, el: any, hint?: string) => (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{label}</div>
      {el}
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px 48px", fontFamily: head }}>
      <ElapsedTimer running={generating} label="GENERATING" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>
            STEP 5 — OUTREACH CAMPAIGNS
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Generate Email & LinkedIn Campaigns</h1>
          <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6, maxWidth: 620 }}>
            Pick a product, a persona, and a writing tone. We generate one LinkedIn sequence and three email campaigns —
            Conversation Starter, Meeting CTA, and Value-Based CTA.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {result && (
            <button onClick={copyAll}
              style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${copied ? C.greenBorder : C.border}`, background: copied ? C.greenLo : "transparent", color: copied ? C.green : C.textSoft, fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer", transition: "all .15s" }}>
              {copied ? "✓ Copied!" : "Copy All"}
            </button>
          )}
          {result && (
            <button onClick={confirmStep}
              style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer", boxShadow: `0 2px 8px ${C.green}30` }}>
              Confirm Step ✓
            </button>
          )}
        </div>
      </div>

      {/* Configuration */}
      <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {field("Product / Service",
            <select style={selectStyle} value={productId} onChange={(e) => setProductId(e.target.value)}>
              {(products || []).length === 0 && <option value="">No products yet</option>}
              {(products || []).map((p: any) => <option key={p.id} value={p.id}>{p.name || "Untitled product"}</option>)}
            </select>
          )}
          {field("Persona",
            <select style={selectStyle} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              {sortedPersonas.length === 0 && <option value="">No personas yet</option>}
              {sortedPersonas.map((p: any) => {
                const enriched = p.data && (p.data.pain1 || p.data.buyer);
                return <option key={p.id} value={p.id}>{p.name || "Untitled persona"}{enriched ? "" : " (not enriched)"}</option>;
              })}
            </select>
          )}
        </div>

        {field("Tone — write as…",
          <select style={selectStyle} value={playbookKey} onChange={(e) => setPlaybookKey(e.target.value as PlaybookKey)}>
            {(Object.values(PLAYBOOKS)).map((pb) => (
              <option key={pb.key} value={pb.key}>
                {pb.label}{pb.figure ? ` — like ${pb.figure}` : ""}
              </option>
            ))}
          </select>,
          PLAYBOOKS[playbookKey]?.tagline
        )}

        <div style={{ marginTop: 16 }}>
          {field("Specific instructions / extra context (optional)",
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3}
              placeholder={`Steer the copy. e.g. "mention our SOC 2 cert", "they just raised a Series B", "avoid pricing talk", "focus on the integration angle, not cost savings".`}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: head, color: C.text, background: C.canvas, resize: "vertical" as const, lineHeight: 1.5 }} />,
            "Applied across the strategy briefs and every email + LinkedIn message."
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          {field("Free offers / lead magnets to feature (optional)",
            <textarea value={freeOffers} onChange={(e) => setFreeOffers(e.target.value)} rows={2}
              placeholder={`The free things you can give to excite prospects, one per line. e.g. "free RTS lead list", "free month of Bebop sales playbooks", "free deliverability audit".`}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: head, color: C.text, background: C.canvas, resize: "vertical" as const, lineHeight: 1.5 }} />,
            "Used in the Value-Based CTA campaign. Leave blank and the AI will invent plausible free offers from your products."
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={generate} disabled={!canGenerate}
            style={{ padding: "10px 22px", borderRadius: 9, border: "none",
              background: canGenerate ? C.accent : C.faint, color: canGenerate ? "#fff" : C.muted,
              fontSize: 13, fontWeight: 700, fontFamily: head, cursor: canGenerate ? "pointer" : "default",
              boxShadow: canGenerate ? `0 2px 8px ${C.accent}30` : "none" }}>
            {generating ? "Generating…" : result ? "Regenerate" : "Generate Campaigns"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && !generating && (
        <div style={{ background: "#FFF5F5", border: "1px solid #FEB2B2", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 15, lineHeight: 1.4 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#C53030", marginBottom: 2 }}>Generation problem</div>
            <div style={{ fontSize: 12.5, color: "#9B2C2C", lineHeight: 1.55 }}>{error}</div>
          </div>
        </div>
      )}

      {/* Progress */}
      {generating && (
        <div style={{ background: C.canvas, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.accent}`, borderTopColor: "transparent", animation: "spin .8s linear infinite" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{phase || "Generating campaigns…"}</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textSoft }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* Results */}
      {result && !generating && (
        <>
        <div style={{ marginBottom: 14, padding: "9px 14px", background: C.greenLo, border: `1px solid ${C.greenBorder}`, borderRadius: 9, fontSize: 12.5, color: C.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          ✓ Saved to your Campaigns (Matrix &amp; List). Regenerating replaces this combo — no duplicates. Click <strong style={{ fontWeight: 800 }}>Confirm Step</strong> to finish onboarding.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* LinkedIn (1 campaign) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                LinkedIn Sequence
              </span>
              <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.blue, background: C.blueLo, padding: "2px 7px", borderRadius: 4 }}>1 CAMPAIGN</span>
            </div>
            {result.linkedinSequence.length === 0 ? (
              <EmptySeq label="LinkedIn sequence didn't generate — try Regenerate." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                {result.linkedinSequence.map((t) => <TouchCard key={t.id} touch={t} channel="linkedin" />)}
              </div>
            )}
          </div>

          {/* Email (3 campaigns, sub-tabbed) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                Email Sequences
              </span>
              <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, padding: "2px 7px", borderRadius: 4 }}>3 CAMPAIGNS</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" as const }}>
              {result.emailCampaigns.map((c, i) => (
                <button key={i} onClick={() => setEmailTab(i)}
                  style={{ padding: "6px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, fontFamily: head, cursor: "pointer",
                    border: `1px solid ${emailTab === i ? C.accentBorder : C.border}`,
                    background: emailTab === i ? C.accentLo : "transparent",
                    color: emailTab === i ? C.accent : C.textSoft }}>
                  {c.short}
                </button>
              ))}
            </div>
            {(() => {
              const c = result.emailCampaigns[emailTab];
              if (!c) return null;
              return c.sequence.length === 0 ? (
                <EmptySeq label={`"${c.short}" didn't generate — try Regenerate.`} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {c.sequence.map((t) => <TouchCard key={t.id} touch={t} channel="email" />)}
                </div>
              );
            })()}
          </div>
        </div>
        </>
      )}

      {/* Empty initial state */}
      {!result && !generating && (
        <div style={{ background: C.canvas, border: `1px dashed ${C.borderHi}`, borderRadius: 12, padding: 36, textAlign: "center" as const }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>✉️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>Ready to generate</div>
          <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.7, maxWidth: 440, margin: "0 auto" }}>
            Choose a product, persona, and tone above, then click Generate Campaigns. We'll produce a LinkedIn sequence and three email campaigns with distinct CTA styles.
          </div>
        </div>
      )}
    </div>
  );
}

function EmptySeq({ label }: { label: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, fontSize: 12.5, color: C.muted }}>
      {label}
    </div>
  );
}

function TouchCard({ touch, channel }: { touch: Step; channel: "email" | "linkedin" }) {
  const isBreakup = (touch.role || "").includes("breakup");
  return (
    <div style={{ background: C.canvas, border: `1px solid ${isBreakup ? "#8E94A733" : C.border}`, borderRadius: 10, padding: 14, opacity: isBreakup ? 0.9 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.muted }}>
          T{touch.stepNumber} · Day {touch.dayOffset}
        </span>
        {touch.role && (
          <span style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: C.surface, color: C.textSoft, textTransform: "uppercase" as const, letterSpacing: 0.3 }}>
            {touch.role}
          </span>
        )}
      </div>
      {channel === "email" && touch.subject && (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6, lineHeight: 1.4 }}>
          Subject: {touch.subject}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
        {touch.body}
      </div>
    </div>
  );
}
