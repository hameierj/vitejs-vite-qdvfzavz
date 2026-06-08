import { useState } from "react";

// Flow 2 — Launch orchestration. Drives campaign launch off the confirmed
// personas + ICP scores from Flow 1. LinkedIn-first (one campaign per LinkedIn
// account, AI-SDR arc). Email is tested ONE ICP AT A TIME (lowest unfinished
// rank); all products/services for that ICP run in parallel. The plan is a
// review gate; copy is only generated for the ICP being activated.

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7", borderHi: "#D8DEE9",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  blue: "#54A0FF", blueLo: "#54A0FF14", blueBorder: "#54A0FF33",
  amber: "#B45309", amberLo: "#B453090F",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const TYPE_LABEL: Record<string, string> = {
  intent_signal: "Intent-signal", conversation_starter: "Conversation-starter",
  free_value: "Free-value offer", meeting_booking: "Meeting-booking",
};

interface Props {
  companyData: any;
  icps: any[];
  products: any[];
  campaigns: any[];
  launchJob: any; // stageJobs.launchplan { status, phase, mode, icpId, track }
  onGeneratePlan: () => void;
  onActivateWave: (icpId: string) => void;
  onActivateLinkedIn: () => void;
  onFinalizeWave: (icpId: string) => void;
  onNavigate: (view: string) => void;
}

export function LaunchBoard({ companyData: cd, icps, products, campaigns, launchJob, onGeneratePlan, onActivateWave, onActivateLinkedIn, onFinalizeWave, onNavigate }: Props) {
  const plan = cd?._launchPlan || null;
  const scoring = cd?._icpScoringResult?.icps || [];
  const generating = launchJob?.status === "running";
  const genMode = launchJob?.mode;
  const genIcpId = launchJob?.icpId;
  const genTrack = launchJob?.track;
  const [busyTarget, setBusyTarget] = useState<string>("");

  const campaignsFor = (icpId: string, channel: string) =>
    (campaigns || []).filter((c: any) => (c.personaIds || []).includes(icpId) && c.channel === channel && c.source === "launch");
  const liCampaigns = (campaigns || []).filter((c: any) => c.channel === "linkedin" && c.source === "launch");

  // ── Empty / prerequisite states ──
  if (!scoring.length) {
    return (
      <Wrap>
        <Header />
        <EmptyCard
          title="No scored ICPs yet"
          body="Launch is driven off the confirmed personas and ICP scores from onboarding. Finish the TAM tree / ICP scoring gate first."
          cta="Go to Onboarding Hub" onClick={() => onNavigate("onboarding-hub")} />
      </Wrap>
    );
  }

  if (!plan) {
    return (
      <Wrap>
        <Header />
        <EmptyCard
          title="Generate your launch plan"
          body="AI orders your scored ICPs into a launch sequence: LinkedIn-first (one campaign per LinkedIn account) and email tested one ICP at a time, with all products/services for each ICP running in parallel."
          cta={generating ? "Planning…" : "Generate Launch Plan"} onClick={onGeneratePlan} disabled={generating}
          phase={generating ? (launchJob?.phase || "") : ""} />
      </Wrap>
    );
  }

  // Activatable email wave = lowest-rank wave not yet finalized.
  const waves = [...(plan.emailWaves || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const activatableWave = waves.find((w) => w.status !== "finalized");

  return (
    <Wrap>
      <Header />

      {/* Testing rule */}
      <div style={{ fontSize: 12, color: C.textSoft, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 20, lineHeight: 1.55 }}>
        <strong style={{ color: C.text }}>Testing rule:</strong> {plan.testingRule}
      </div>

      {/* ── LinkedIn track ── */}
      <SectionLabel>LINKEDIN — {plan.linkedinAccounts || 0} ACCOUNT{(plan.linkedinAccounts || 0) === 1 ? "" : "S"}</SectionLabel>
      {(plan.linkedin || []).length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 20 }}>No LinkedIn accounts configured (set the count in the intake form). Skipping LinkedIn track.</div>
      ) : (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 24 }}>
          {(plan.linkedin || []).map((a: any) => (
            <div key={a.accountIndex} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.faint}` }}>
              <div style={{ fontSize: 12.5, color: C.text }}>
                <span style={{ fontFamily: mono, color: C.blue, fontWeight: 700 }}>Acct {a.accountIndex}</span> → {a.icpName}
                <span style={{ color: C.muted, marginLeft: 8 }}>rank #{a.rank}</span>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            {liCampaigns.length > 0 ? (
              <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.green, background: C.greenLo, padding: "4px 9px", borderRadius: 5 }}>{liCampaigns.length} CAMPAIGN{liCampaigns.length === 1 ? "" : "S"} ACTIVE ✓</span>
            ) : (
              <Btn label={generating && genTrack === "linkedin" ? "Generating arcs…" : "Activate LinkedIn"} kind="blue"
                disabled={generating} onClick={() => { setBusyTarget("li"); onActivateLinkedIn(); }} />
            )}
            {liCampaigns.length > 0 && <LinkBtn label="View campaigns →" onClick={() => onNavigate("campaigns")} />}
          </div>
        </div>
      )}

      {/* ── Email waves ── */}
      <SectionLabel>EMAIL — ONE ICP AT A TIME (PRODUCTS IN PARALLEL)</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
        {waves.map((w: any, idx: number) => {
          const isActivatable = activatableWave && w.icpId === activatableWave.icpId && w.status !== "active";
          const isActive = w.status === "active";
          const isFinalized = w.status === "finalized";
          const isLocked = !isActivatable && !isActive && !isFinalized;
          const camps = campaignsFor(w.icpId, "email");
          const isLast = idx === waves.length - 1;
          const genHere = generating && genMode === "generate" && genIcpId === w.icpId;
          return (
            <div key={w.icpId} style={{ display: "flex", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: isFinalized ? C.green : isActive ? C.accent : C.faint, border: `2px solid ${isFinalized ? C.green : isActive || isActivatable ? C.accent : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: isFinalized || isActive ? "#fff" : isLocked ? C.muted : C.accent, fontFamily: mono }}>
                  {isFinalized ? "✓" : w.rank}
                </div>
                {!isLast && <div style={{ width: 2, flex: 1, minHeight: 12, background: isFinalized ? C.green : C.border, margin: "4px 0" }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
                <div style={{ background: C.canvas, border: `1px solid ${isActive ? C.accentBorder : isFinalized ? C.greenBorder : C.border}`, borderRadius: 10, padding: "12px 14px", opacity: isLocked ? 0.6 : 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {w.icpName}
                        <span style={{ marginLeft: 8, fontSize: 10, fontFamily: mono, color: C.accent, background: C.accentLo, padding: "2px 7px", borderRadius: 4 }}>{TYPE_LABEL[w.campaignType] || w.campaignType}</span>
                        <span style={{ marginLeft: 6, fontSize: 11, color: C.muted, fontFamily: mono }}>score {w.weightedScore}</span>
                      </div>
                      {w.typeRationale && <p style={{ fontSize: 12, color: C.textSoft, margin: "5px 0 0", lineHeight: 1.5 }}>{w.typeRationale}</p>}
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginTop: 8 }}>
                        {(w.products || []).map((p: any) => (
                          <span key={p.productId} style={{ fontSize: 11, color: C.textSoft, background: C.surface, padding: "2px 8px", borderRadius: 4 }}>{p.productName}</span>
                        ))}
                      </div>
                      {genHere && <div style={{ marginTop: 8, fontSize: 11.5, color: C.accent, fontFamily: mono }}>{launchJob?.phase || "Generating…"}</div>}
                      {camps.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 11.5, color: C.green }}>
                          {camps.length} email campaign{camps.length === 1 ? "" : "s"} generated · <LinkBtn label="view →" onClick={() => onNavigate("campaigns")} inline />
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" as const, gap: 6, alignItems: "flex-end" }}>
                      {isFinalized && <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.green, background: C.greenLo, padding: "3px 8px", borderRadius: 4 }}>FINALIZED ✓</span>}
                      {isActive && <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, padding: "3px 8px", borderRadius: 4 }}>ACTIVE</span>}
                      {isLocked && <span style={{ fontSize: 10, fontFamily: mono, color: C.muted }}>QUEUED</span>}
                      {isActivatable && <Btn label={genHere ? "Generating…" : "Activate ICP"} kind="primary" disabled={generating} onClick={() => { setBusyTarget(w.icpId); onActivateWave(w.icpId); }} />}
                      {isActive && <Btn label="Finalize & advance" kind="confirm" onClick={() => onFinalizeWave(w.icpId)} />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
        <Btn label={generating && genMode === "plan" ? "Re-planning…" : "Regenerate plan"} kind="ghost" disabled={generating} onClick={onGeneratePlan} />
      </div>
    </Wrap>
  );
}

// ── helpers ──
function Wrap({ children }: { children: any }) {
  return <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 64px", fontFamily: head }}>{children}</div>;
}
function Header() {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8 }}>FLOW 2 · LAUNCH</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Campaign Launch</h1>
      <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>Activate campaigns off your confirmed personas and ICP scores. LinkedIn first; email one ICP at a time.</p>
    </div>
  );
}
function SectionLabel({ children }: { children: any }) {
  return <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.muted, letterSpacing: 0.8, margin: "0 0 10px 2px" }}>{children}</div>;
}
function EmptyCard({ title, body, cta, onClick, disabled, phase }: { title: string; body: string; cta: string; onClick: () => void; disabled?: boolean; phase?: string }) {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, textAlign: "center" as const }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>{title}</div>
      <p style={{ fontSize: 13, color: C.textSoft, margin: "0 auto 18px", maxWidth: 440, lineHeight: 1.6 }}>{body}</p>
      <Btn label={cta} kind="primary" disabled={disabled} onClick={onClick} />
      {phase && <div style={{ marginTop: 10, fontSize: 11.5, color: C.accent, fontFamily: mono }}>{phase}</div>}
    </div>
  );
}
function Btn({ label, kind, onClick, disabled }: { label: string; kind: "primary" | "confirm" | "ghost" | "blue"; onClick: () => void; disabled?: boolean }) {
  const bg = kind === "ghost" ? C.canvas : kind === "confirm" ? C.green : kind === "blue" ? C.blue : C.accent;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, fontFamily: head, whiteSpace: "nowrap" as const,
        cursor: disabled ? "default" : "pointer", border: kind === "ghost" ? `1px solid ${C.border}` : "none",
        background: disabled && kind !== "ghost" ? C.faint : bg, color: kind === "ghost" ? C.textSoft : disabled ? C.muted : "#fff",
        boxShadow: !disabled && kind !== "ghost" ? `0 2px 8px ${bg}30` : "none" }}>{label}</button>
  );
}
function LinkBtn({ label, onClick, inline }: { label: string; onClick: () => void; inline?: boolean }) {
  return <button onClick={onClick} style={{ background: "none", border: "none", color: C.accent, fontSize: inline ? 11.5 : 12, fontWeight: 700, cursor: "pointer", fontFamily: head, padding: 0 }}>{label}</button>;
}
