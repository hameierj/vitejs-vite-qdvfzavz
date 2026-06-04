import { useState } from "react";
import { callClaude, parseJSON } from "../../lib/callClaude";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#FDCB6E", amberLo: "#FDCB6E0F",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const GTM_STRATEGIES = `
Strategy 1: Storytelling/Narrative Arc — Open with a brief, real story (customer/market/relatable scenario). Structure: Situation → Complication → Resolution → Bridge. Best: email 1 or LinkedIn msg 2.
Strategy 2: Free Value First — Lead with something genuinely useful (audit, insight, data point, asset), no strings attached. Soft ask at the end. Best: any touch, especially touch 1 or re-engagement.
Strategy 3: Lead with Numbers/Data — Open with a specific, credible number that reframes the problem. Structure: Surprising number → What it means → "Is that relevant?". Best: subject line or first sentence of email 1.
Strategy 4: Challenge a Misconception — Name a belief the prospect holds, then flip it with data. Structure: "Most [role] believe X. The data says opposite." Best: email 1 or follow-up email 3.
Strategy 5: Social Proof/Peer Evidence — Reference specific named company with same problem + real result. Structure: "A [company like you] had [exact problem] and got [specific result] in [timeframe]." Best: email 1 or email 2.
Strategy 6: Pain Amplification — Walk through the full downstream consequences of inaction. Structure: Name pain → Amplify downstream effect → Position as exit. Best: email 1, call opener.
Strategy 7: Contrarian Positioning — Name what you're NOT for to build trust with good-fit prospects. Structure: "We're not right if X. But if Y, here's what we do." Best: email 1 subject line or email 4-5.
Strategy 8: Trojan Horse Resource — Send a genuinely useful asset (template, calculator, framework) as the CTA. Structure: Relevant observation → "We built something for this" → Easy CTA. Best: email 1 CTA or LinkedIn DM after connection.
Strategy 9: Calibrated Question — Lead with one well-crafted question that creates a curiosity gap. Structure: "Quick question about [specific aspect of their business]..." Best: email 2-3, LinkedIn connection message.
Strategy 10: FOMO/Scarcity/Timeliness — Real urgency tied to legitimate constraints. Structure: Real constraint → Why it matters now → The ask. Best: email 4-5, never email 1.
Strategy 11: Honest Breakup — Final email that explicitly ends the sequence with no hard feelings. Structure: "I'll take this as a no — and that's okay. If anything changes, [next step]." Always: final touch (touch 5).
Strategy 12: Before/After Frame — Paint current painful state vs desired outcome, position solution as bridge. Structure: Before (current reality) → After (desired outcome) → Bridge (your solution). Best: email 1-2, cold call opener.

5-Touch Sequence Arc:
- Touch 1: Hook (email + LinkedIn connection) — Lead with Numbers + Before/After OR Free Value
- Touch 2: Proof (email + LinkedIn msg) — Social Proof OR Storytelling
- Touch 3: Value/Reframe (email + LinkedIn msg) — Misconception Challenge OR Contrarian Positioning
- Touch 4: Urgency (email + LinkedIn msg) — Pain Amplification OR FOMO
- Touch 5: Breakup (email + LinkedIn) — Always Honest Breakup
`;

// Static system prompt: identical for every ICP, so it is sent as a cached
// block. Generating campaigns for multiple ICPs within the cache window then
// reuses this prefix instead of re-billing the framework on each call.
const CAMPAIGN_SYSTEM = `You are an expert B2B outreach copywriter. Generate a 5-touch email + LinkedIn outreach sequence for the client and ICP provided in the user message.

GTM OUTREACH STRATEGY FRAMEWORK:
${GTM_STRATEGIES}

REQUIREMENTS:
- Generate exactly 5 email touches and 5 LinkedIn touches
- Select the best GTM strategies for this specific ICP based on their characteristics
- Each email: has a compelling subject line + body (under 120 words, no filler)
- Each LinkedIn message: under 500 chars for touches 2-4, under 300 for touches 1 and 5
- Touch 5 MUST use "Honest Breakup" strategy for both email and LinkedIn
- Write actual copy — no placeholders like [Company Name] unless as personalization tokens
- Use {prospect_name}, {company}, {industry} as personalization tokens
- Focus on the ICP's specific pain, use the suggested angle if provided

Return only valid JSON in this exact shape (use the icpId and icpName given in the user message):
{
  "icpId": "<the icpId from the user message>",
  "icpName": "<the icpName from the user message>",
  "generatedAt": "<ISO timestamp>",
  "strategyRationale": "2-3 sentences explaining why these strategies were chosen for this ICP",
  "sequenceArc": "1 sentence describing the narrative arc across all 5 touches",
  "selectedStrategies": ["Strategy X", "Strategy Y", "..."],
  "emailSequence": [
    {
      "touch": 1,
      "dayOffset": 0,
      "gtmStrategy": "Strategy name",
      "role": "hook|proof|value|urgency|breakup",
      "subject": "Email subject line",
      "body": "Full email body"
    }
  ],
  "linkedinSequence": [
    {
      "touch": 1,
      "dayOffset": 0,
      "gtmStrategy": "Strategy name",
      "role": "connection|follow_up|value|proof|breakup",
      "body": "LinkedIn message body"
    }
  ]
}`;

interface Touch {
  touch: number;
  dayOffset: number;
  gtmStrategy: string;
  subject?: string;
  body: string;
  role: string;
}

interface CampaignPlan {
  icpId: string;
  icpName: string;
  generatedAt: string;
  strategyRationale: string;
  emailSequence: Touch[];
  linkedinSequence: Touch[];
  selectedStrategies: string[];
  sequenceArc: string;
}

interface Props {
  icp: any;
  scoreRow: any;
  companyData: any;
  products: any[];
  campaigns: any[];
  onSave: (updates: { companyData: any; campaigns: any[] }) => void;
  onClose: () => void;
}

const LINKEDIN_DAYS = [0, 2, 5, 10, 17];
const EMAIL_DAYS    = [0, 3, 7, 14, 21];

function stratBadgeColor(strategy: string): { bg: string; color: string } {
  if (strategy.includes("Storytell")) return { bg: "#6C5CE715", color: "#6C5CE7" };
  if (strategy.includes("Value") || strategy.includes("Trojan")) return { bg: "#00B89415", color: "#00B894" };
  if (strategy.includes("Number") || strategy.includes("Data")) return { bg: "#54A0FF15", color: "#2980B9" };
  if (strategy.includes("Social") || strategy.includes("Proof")) return { bg: "#00CEC915", color: "#00CEC9" };
  if (strategy.includes("Pain") || strategy.includes("Amplif")) return { bg: "#E1705515", color: "#E17055" };
  if (strategy.includes("Contrarian") || strategy.includes("Misconception")) return { bg: "#FFC04815", color: "#92681A" };
  if (strategy.includes("Question") || strategy.includes("Calibrated")) return { bg: "#9B59B615", color: "#9B59B6" };
  if (strategy.includes("FOMO") || strategy.includes("Scarcity")) return { bg: "#FDCB6E20", color: "#92681A" };
  if (strategy.includes("Breakup")) return { bg: "#8E94A715", color: "#636E82" };
  if (strategy.includes("Before") || strategy.includes("After")) return { bg: "#00D68F15", color: "#00B060" };
  return { bg: "#F3F4FB", color: "#636E82" };
}

export function CampaignPlanningBoard({ icp, scoreRow, companyData, products, campaigns, onSave, onClose }: Props) {
  const [generating, setGenerating] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    if (!plan) return;
    const lines: string[] = [];

    lines.push(`CAMPAIGN PLAN — ${plan.icpName}`);
    lines.push("=".repeat(60));

    if (plan.sequenceArc) {
      lines.push(`\nSEQUENCE ARC\n${plan.sequenceArc}`);
    }
    if (plan.strategyRationale) {
      lines.push(`\nSTRATEGY RATIONALE\n${plan.strategyRationale}`);
    }
    if (plan.selectedStrategies?.length) {
      lines.push(`\nSTRATEGIES USED\n${plan.selectedStrategies.join(", ")}`);
    }

    lines.push("\n" + "=".repeat(60));
    lines.push("EMAIL SEQUENCE");
    lines.push("=".repeat(60));
    (plan.emailSequence || []).forEach(t => {
      lines.push(`\nTouch ${t.touch} — Day ${t.dayOffset} [${t.gtmStrategy}]`);
      if (t.subject) lines.push(`Subject: ${t.subject}`);
      lines.push(t.body);
    });

    lines.push("\n" + "=".repeat(60));
    lines.push("LINKEDIN SEQUENCE");
    lines.push("=".repeat(60));
    (plan.linkedinSequence || []).forEach(t => {
      lines.push(`\nTouch ${t.touch} — Day ${t.dayOffset} [${t.gtmStrategy}]`);
      lines.push(t.body);
    });

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const cd = companyData as any;

  const generate = async () => {
    setGenerating(true);
    setLog(["Building context..."]);
    setSaved(false);

    const addLog = (m: string) => setLog(p => [...p, m]);

    try {
      const icpData = icp?.data || {};
      const topProduct = products?.[0] || {};

      const context = {
        company: {
          name: cd.co_name || "",
          pitch: cd.co_pitch || "",
          valueProposition: cd.co_diff || "",
          proofPoints: cd.co_proof || "",
          topProduct: {
            name: topProduct.name || "",
            description: topProduct.description || cd.co_product || "",
            valueProposition: topProduct.valueProposition || "",
          },
        },
        icp: {
          name: icp?.name || "",
          industries: icpData.industries || "",
          companySizes: icpData.co_sizes || "",
          buyerTitles: icpData.buyer || "",
          championRoles: icpData.champ || "",
          mainPain: icpData.pain1 || "",
          gains: icpData.gains || "",
          triggers: icpData.triggers || "",
          tone: icpData.tone || "professional",
          whyClientWins: icpData.why_client_wins || "",
          proofForThisIcp: icpData.icp_proof || "",
          bestChannel: icpData.best_channel || "",
          suggestedAngle: scoreRow?.suggestedAngle || "",
        },
      };

      addLog("Generating sequences with Claude Sonnet...");

      // Only the per-ICP context varies; the framework, requirements and schema
      // live in the cached CAMPAIGN_SYSTEM prompt above.
      const prompt = `icpId: ${icp?.id || ""}
icpName: ${icp?.name || ""}

COMPANY & PRODUCT:
${JSON.stringify(context.company, null, 2)}

TARGET ICP:
${JSON.stringify(context.icp, null, 2)}`;

      const raw = await callClaude(prompt, CAMPAIGN_SYSTEM, 4000, "sonnet", { cacheSystem: true });
      const result = parseJSON<CampaignPlan>(raw, {
        icpId: icp?.id || "",
        icpName: icp?.name || "",
        generatedAt: new Date().toISOString(),
        strategyRationale: "",
        emailSequence: [],
        linkedinSequence: [],
        selectedStrategies: [],
        sequenceArc: "",
      });

      // Fill day offsets if missing
      (result.emailSequence || []).forEach((t, i) => { if (!t.dayOffset) t.dayOffset = EMAIL_DAYS[i] || i * 3; });
      (result.linkedinSequence || []).forEach((t, i) => { if (!t.dayOffset) t.dayOffset = LINKEDIN_DAYS[i] || i * 2; });

      setPlan(result);
      addLog("Sequences ready");

      // Auto-save to companyData._campaignPlans
      const existingPlans = cd._campaignPlans || {};
      onSave({
        companyData: {
          ...cd,
          _campaignPlans: { ...existingPlans, [icp?.id || "icp"]: result },
        },
        campaigns,
      });

    } catch (e: any) {
      addLog(`Error: ${e.message || e}`);
    } finally {
      setGenerating(false);
    }
  };

  const saveToCampaigns = () => {
    if (!plan) return;

    // Build email campaign
    const emailCampaign = {
      id: `${Date.now()}-email`,
      name: `${plan.icpName} — Email`,
      status: "planning",
      channel: "email",
      type: "cold_email",
      source: "onboarding_plan",
      intentTier: "cold",
      playbook: "auto",
      goal: "",
      goalType: "book_meetings",
      personaIds: [icp?.id].filter(Boolean),
      productId: products?.[0]?.id || "",
      targeting: {
        titles: icp?.data?.buyer || "",
        industries: icp?.data?.industries || "",
        companySizes: icp?.data?.co_sizes || "",
      },
      sequence: plan.emailSequence.map(t => ({
        id: `${Date.now()}-e${t.touch}`,
        type: "email",
        dayOffset: t.dayOffset,
        subject: t.subject || "",
        body: t.body,
        gtmStrategy: t.gtmStrategy,
      })),
      createdAt: new Date().toISOString(),
    };

    // Build LinkedIn campaign
    const linkedinCampaign = {
      id: `${Date.now()}-li`,
      name: `${plan.icpName} — LinkedIn`,
      status: "planning",
      channel: "linkedin",
      type: "linkedin_message",
      source: "onboarding_plan",
      intentTier: "cold",
      playbook: "auto",
      goal: "",
      goalType: "book_meetings",
      personaIds: [icp?.id].filter(Boolean),
      productId: products?.[0]?.id || "",
      targeting: {
        titles: icp?.data?.buyer || "",
        industries: icp?.data?.industries || "",
        companySizes: icp?.data?.co_sizes || "",
      },
      sequence: plan.linkedinSequence.map(t => ({
        id: `${Date.now()}-l${t.touch}`,
        type: "linkedin",
        dayOffset: t.dayOffset,
        body: t.body,
        gtmStrategy: t.gtmStrategy,
      })),
      createdAt: new Date().toISOString(),
    };

    const updatedCampaigns = [...campaigns, emailCampaign, linkedinCampaign];
    onSave({ companyData: cd, campaigns: updatedCampaigns });
    setSaved(true);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 48px", fontFamily: head }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>
            STEP 8 — CAMPAIGN PLANNING
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
            {icp?.name || "ICP"} Campaign
          </h1>
          {scoreRow?.suggestedAngle && (
            <div style={{ fontSize: 13, color: C.textSoft, fontStyle: "italic" as const }}>
              Angle: "{scoreRow.suggestedAngle}"
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {plan && !saved && (
            <button onClick={saveToCampaigns}
              style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: C.green,
                color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer",
                boxShadow: `0 2px 8px ${C.green}30` }}>
              Save to Campaigns
            </button>
          )}
          {saved && (
            <div style={{ padding: "9px 18px", borderRadius: 8, background: C.greenLo, border: `1px solid ${C.greenBorder}`,
              color: C.green, fontSize: 13, fontWeight: 700 }}>✓ Saved</div>
          )}
          {plan && (
            <button onClick={copyAll}
              style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${copied ? C.greenBorder : C.border}`,
                background: copied ? C.greenLo : "transparent", color: copied ? C.green : C.textSoft,
                fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer", transition: "all .15s" }}>
              {copied ? "✓ Copied!" : "Copy All"}
            </button>
          )}
          <button onClick={generate} disabled={generating}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none",
              background: generating ? C.faint : C.accent, color: generating ? C.muted : "#fff",
              fontSize: 13, fontWeight: 700, fontFamily: head, cursor: generating ? "wait" : "pointer" }}>
            {generating ? "Generating…" : plan ? "Regenerate" : "Generate Sequences"}
          </button>
          <button onClick={onClose}
            style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: "transparent", color: C.muted, fontSize: 13, fontFamily: head, cursor: "pointer" }}>
            ← Back
          </button>
        </div>
      </div>

      {/* Progress log */}
      {generating && (
        <div style={{ background: C.canvas, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.accent}`, borderTopColor: "transparent",
              animation: "spin .8s linear infinite" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Generating sequences...</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textSoft }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!plan && !generating && (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, textAlign: "center" as const }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>✉️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>Ready to generate campaigns</div>
          <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 20px" }}>
            Click "Generate Sequences" to create 5-touch email + LinkedIn campaigns for {icp?.name}, grounded in the GTM Outreach Strategy framework.
          </div>
          <button onClick={generate}
            style={{ padding: "10px 24px", borderRadius: 9, border: "none", background: C.accent, color: "#fff",
              fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer", boxShadow: `0 2px 8px ${C.accent}30` }}>
            Generate Sequences
          </button>
        </div>
      )}

      {/* Plan display */}
      {plan && !generating && (
        <>
          {/* Strategy rationale */}
          {(plan.strategyRationale || plan.sequenceArc) && (
            <div style={{ background: C.accentLo, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
              {plan.sequenceArc && <div style={{ fontSize: 13, fontWeight: 600, color: C.accent, marginBottom: plan.strategyRationale ? 4 : 0 }}>{plan.sequenceArc}</div>}
              {plan.strategyRationale && <div style={{ fontSize: 12.5, color: C.textSoft }}>{plan.strategyRationale}</div>}
              {(plan.selectedStrategies || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 8 }}>
                  {plan.selectedStrategies.map((s, i) => {
                    const bc = stratBadgeColor(s);
                    return (
                      <span key={i} style={{ fontSize: 10.5, fontFamily: mono, padding: "2px 7px", borderRadius: 4,
                        background: bc.bg, color: bc.color, fontWeight: 600 }}>{s}</span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Two-column sequences */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Email */}
            <div>
              <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                Email Sequence (5 touches)
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                {(plan.emailSequence || []).map((t, i) => (
                  <TouchCard key={i} touch={t} channel="email" />
                ))}
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                LinkedIn Sequence (5 touches)
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                {(plan.linkedinSequence || []).map((t, i) => (
                  <TouchCard key={i} touch={t} channel="linkedin" />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TouchCard({ touch, channel }: { touch: Touch; channel: "email" | "linkedin" }) {
  const bc = stratBadgeColor(touch.gtmStrategy || "");
  const isBreakup = (touch.role || "").includes("breakup");

  return (
    <div style={{ background: C.canvas, border: `1px solid ${isBreakup ? "#8E94A733" : C.border}`, borderRadius: 10, padding: 14, opacity: isBreakup ? 0.85 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.muted, flexShrink: 0 }}>
          T{touch.touch} · Day {touch.dayOffset}
        </span>
        {touch.gtmStrategy && (
          <span style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
            background: bc.bg, color: bc.color, textTransform: "uppercase" as const, letterSpacing: 0.3 }}>
            {touch.gtmStrategy.replace("Strategy ", "")}
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
