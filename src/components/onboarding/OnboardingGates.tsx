import { useState } from "react";

// Gated onboarding (Flow 1). Each Track-A gate runs: AI generates → user
// reviews → chats to refine → confirms → unlocks the next. Track B (infra)
// runs in parallel, sized from the intake form alone. State lives on
// companyData._gates and is persisted by the workspace save effect.

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#B45309", amberLo: "#B453090F", amberBorder: "#B4530940",
  blue: "#54A0FF", blueLo: "#54A0FF12",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

export type StageKey = "research" | "products" | "tamicp" | "personas" | "infra";
type GateStatus = "locked" | "idle" | "generating" | "review" | "confirmed";

interface Props {
  companyData: any;
  products: any[];
  icps: any[];
  dfySetup: any;
  // stageJobs: latest job row per stage key { status, phase, log }
  stageJobs: Record<string, any>;
  researchState: "idle" | "running" | "done";
  researchLog: string[];
  onRunResearch: (domain: string) => void;
  onStartStage: (stage: StageKey) => void;
  onConfirmGate: (gateId: TrackAGate | "infra") => void;
  onRefine: (scopeLabel: string) => void;
  onNavigate: (view: string) => void;
}

type TrackAGate = "companyResearch" | "products" | "tamIcp" | "personas";

const TRACK_A: { id: TrackAGate; stage: StageKey; num: number; title: string; desc: string }[] = [
  { id: "companyResearch", stage: "research", num: 1, title: "Company Research", desc: "Deep AI research on the company — products, value props, market evidence, ICP hypotheses, and call-prep notes." },
  { id: "products",        stage: "products", num: 2, title: "Products & Services", desc: "Full profiles for each product/service: value prop, deal economics, proof, objections, messaging. Generated from the confirmed research." },
  { id: "tamIcp",          stage: "tamicp",   num: 3, title: "TAM Tree → ICPs", desc: "Company-level TAM plus TAM per product/service, with ICPs identified per branch (unique or cross-product), explained and scored." },
  { id: "personas",        stage: "personas", num: 4, title: "Personas", desc: "Complete outreach personas built from the highest-scoring ICPs — buyer, pains, triggers, channels, messaging." },
];

const STAGE_FOR_GATE: Record<TrackAGate, StageKey> = {
  companyResearch: "research", products: "products", tamIcp: "tamicp", personas: "personas",
};
const NEXT_GATE: Record<TrackAGate, TrackAGate | null> = {
  companyResearch: "products", products: "tamIcp", tamIcp: "personas", personas: null,
};

export function OnboardingGates(props: Props) {
  const { companyData: cd, products, icps, dfySetup, stageJobs, researchState, researchLog,
          onRunResearch, onStartStage, onConfirmGate, onRefine, onNavigate } = props;
  const gates = (cd?._gates || {}) as Record<string, any>;
  const [domain, setDomain] = useState<string>(cd?.co_website || "");

  // ── Artifact presence per gate ──
  const hasArtifact = (gate: TrackAGate): boolean => {
    switch (gate) {
      case "companyResearch": return !!cd?._initialResearchBrief;
      case "products": return (products || []).length > 0;
      case "tamIcp": return !!cd?._tamTree;
      case "personas": return !!cd?._personasGeneratedAt;
    }
  };

  const isGenerating = (stage: StageKey): boolean => {
    if (stage === "research") return researchState === "running";
    return stageJobs[stage]?.status === "running";
  };

  const gateState = (gate: TrackAGate, idx: number): GateStatus => {
    if (gates[gate]?.status === "confirmed") return "confirmed";
    const stage = STAGE_FOR_GATE[gate];
    if (isGenerating(stage)) return "generating";
    // locked until previous Track-A gate confirmed
    if (idx > 0) {
      const prev = TRACK_A[idx - 1].id;
      if (gates[prev]?.status !== "confirmed") return "locked";
    }
    if (hasArtifact(gate)) return "review";
    return "idle";
  };

  const infraState = ((): GateStatus => {
    if (gates.infra?.status === "confirmed") return "confirmed";
    if (isGenerating("infra")) return "generating";
    if (dfySetup?.suggestedDomains?.length || dfySetup?.generatedAt) return "review";
    return "idle";
  })();

  const confirmedCount = TRACK_A.filter((g) => gates[g.id]?.status === "confirmed").length;
  const pct = Math.round((confirmedCount / TRACK_A.length) * 100);

  // ── Compact artifact preview per gate ──
  const renderPreview = (gate: TrackAGate) => {
    if (gate === "companyResearch") {
      const b = cd?._initialResearchBrief; if (!b) return null;
      return (
        <PreviewBox>
          <Row k="Company" v={b.companyOverview?.name || cd?.co_name || "—"} />
          <Row k="Products found" v={String((b.productsServices || []).length)} />
          <Row k="ICP hypotheses" v={String((b.icpHypotheses || []).length)} />
        </PreviewBox>
      );
    }
    if (gate === "products") {
      if (!(products || []).length) return null;
      return (
        <PreviewBox>
          {products.slice(0, 5).map((p: any) => (
            <div key={p.id} style={{ fontSize: 12.5, color: C.text, padding: "2px 0" }}>• {p.name || "Untitled"}</div>
          ))}
          {products.length > 5 && <div style={{ fontSize: 11.5, color: C.muted }}>+{products.length - 5} more</div>}
        </PreviewBox>
      );
    }
    if (gate === "tamIcp") {
      const t = cd?._tamTree; const scoring = cd?._icpScoringResult?.icps || []; if (!t) return null;
      const top = [...scoring].sort((a: any, b: any) => (a.rank || 99) - (b.rank || 99)).slice(0, 3);
      return (
        <PreviewBox>
          {t.companyLevel?.tamSummary && <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 6, lineHeight: 1.5 }}>{String(t.companyLevel.tamSummary).slice(0, 220)}</div>}
          <Row k="Product branches" v={String((t.perProduct || []).length)} />
          <Row k="ICPs identified" v={String(scoring.length)} />
          {top.map((s: any) => (
            <div key={s.icpId} style={{ fontSize: 12, color: C.text, padding: "2px 0" }}>
              <span style={{ fontFamily: mono, color: C.accent, fontWeight: 700 }}>#{s.rank}</span> {s.icpName} <span style={{ color: C.muted }}>({s.weightedScore})</span>
              {s.scope === "cross_product" && <span style={{ marginLeft: 6, fontSize: 9.5, fontFamily: mono, color: C.blue, background: C.blueLo, padding: "1px 5px", borderRadius: 3 }}>CROSS-PRODUCT</span>}
            </div>
          ))}
        </PreviewBox>
      );
    }
    if (gate === "personas") {
      const enriched = (icps || []).filter((i: any) => i.data && (i.data.pain1 || i.data.buyer));
      if (!cd?._personasGeneratedAt) return null;
      return (
        <PreviewBox>
          {enriched.slice(0, 6).map((p: any) => (
            <div key={p.id} style={{ fontSize: 12.5, color: C.text, padding: "2px 0" }}>• {p.name}</div>
          ))}
        </PreviewBox>
      );
    }
    return null;
  };

  const viewActionFor = (gate: TrackAGate): { label: string; onClick: () => void } | undefined => {
    switch (gate) {
      case "companyResearch": return { label: "View full brief", onClick: () => onNavigate("research-brief") };
      case "products": return { label: "View products", onClick: () => onNavigate("products") };
      case "tamIcp": return { label: "View scoring", onClick: () => onNavigate("icp-scoring") };
      case "personas": return { label: "View personas", onClick: () => onNavigate("icp-tree") };
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 64px", fontFamily: head }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>ONBOARDING HUB</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Guided Onboarding</h1>
        <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
          AI generates each stage; you review, refine in chat, and confirm to unlock the next. Infrastructure runs in parallel.
        </p>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: C.accent, transition: "width .5s ease" }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.accent, flexShrink: 0 }}>{confirmedCount}/{TRACK_A.length}</span>
        </div>
      </div>

      {/* Track A header */}
      <SectionLabel>TRACK A · RESEARCH SEQUENCE</SectionLabel>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
        {TRACK_A.map((g, idx) => {
          const st = gateState(g.id, idx);
          const isLast = idx === TRACK_A.length - 1;
          const job = stageJobs[g.stage];
          const log = g.stage === "research" ? researchLog : (job?.log || []);
          const phase = g.stage === "research" ? (researchLog[researchLog.length - 1] || "") : (job?.phase || "");
          return (
            <GateCard
              key={g.id} num={g.num} title={g.title} desc={g.desc} status={st} isLast={isLast}
              phase={phase} jobError={job?.status === "error" ? job?.error : undefined}
              preview={renderPreview(g.id)}
              extraTop={g.id === "companyResearch" && (st === "idle" || st === "generating") ? (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com"
                    disabled={st === "generating"}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: head, color: C.text, background: C.canvas }} />
                </div>
              ) : null}
              actions={
                <GateActions
                  status={st}
                  viewAction={(st === "review" || st === "confirmed") ? viewActionFor(g.id) : undefined}
                  onGenerate={() => g.id === "companyResearch" ? onRunResearch(domain.trim()) : onStartStage(g.stage)}
                  generateLabel={g.id === "companyResearch" ? "Run Research" : `Generate`}
                  canGenerate={g.id === "companyResearch" ? !!domain.trim() : true}
                  onRefine={() => onRefine(g.title)}
                  onConfirm={() => onConfirmGate(g.id)}
                  onRegenerate={() => g.id === "companyResearch" ? onRunResearch(domain.trim()) : onStartStage(g.stage)}
                />
              }
            />
          );
        })}
      </div>

      {/* Track B — Infrastructure (parallel) */}
      <div style={{ marginTop: 28 }}>
        <SectionLabel>TRACK B · INFRASTRUCTURE (PARALLEL)</SectionLabel>
        <GateCard
          num={"∞" as any} title="Domains & Mailboxes" status={infraState} isLast
          desc="Sending infrastructure sized from your intake form alone — domains preselected and mailboxes allocated. Review, swap, then confirm. One-time setup: locked after confirm."
          phase={stageJobs.infra?.phase || ""} jobError={stageJobs.infra?.status === "error" ? stageJobs.infra?.error : undefined}
          preview={(infraState === "review" || infraState === "confirmed") && dfySetup ? (
            <PreviewBox>
              <Row k="Domains" v={String(dfySetup.domainCount ?? (dfySetup.suggestedDomains || []).length)} />
              <Row k="Mailboxes" v={String(dfySetup.mailboxCount ?? "—")} />
              {dfySetup.sizingBasis === "intake_target_volume" && dfySetup.targetMonthlyVolume && <Row k="Sized for" v={`~${dfySetup.targetMonthlyVolume}/mo`} />}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginTop: 6 }}>
                {(dfySetup.suggestedDomains || []).slice(0, 8).map((d: any, i: number) => (
                  <span key={i} style={{ fontSize: 11, fontFamily: mono, color: C.textSoft, background: C.surface, padding: "2px 7px", borderRadius: 4 }}>{d.full || d.domain}</span>
                ))}
                {(dfySetup.suggestedDomains || []).length > 8 && <span style={{ fontSize: 11, color: C.muted }}>+{(dfySetup.suggestedDomains || []).length - 8}</span>}
              </div>
            </PreviewBox>
          ) : null}
          actions={
            <GateActions
              status={infraState}
              onGenerate={() => onStartStage("infra")} generateLabel="Generate Infra" canGenerate
              onRefine={() => onRefine("Domains & Mailboxes (infrastructure)")}
              onConfirm={() => onConfirmGate("infra")}
              onRegenerate={() => onStartStage("infra")}
              confirmLabel="Confirm & Lock"
              hideRefineWhenConfirmed
            />
          }
        />
      </div>
    </div>
  );
}

// ── Small presentational helpers ──
function SectionLabel({ children }: { children: any }) {
  return <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.muted, letterSpacing: 0.8, margin: "0 0 12px 4px" }}>{children}</div>;
}
function PreviewBox({ children }: { children: any }) {
  return <div style={{ marginTop: 10, padding: "10px 12px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}><span style={{ color: C.muted }}>{k}</span><span style={{ color: C.text, fontWeight: 600 }}>{v}</span></div>;
}
function LinkBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ marginTop: 8, background: "none", border: "none", color: C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: head, padding: 0 }}>{label}</button>;
}

function GateActions({ status, viewAction, onGenerate, generateLabel, canGenerate, onRefine, onConfirm, onRegenerate, confirmLabel = "Confirm & Continue", hideRefineWhenConfirmed = false }: {
  status: GateStatus; viewAction?: { label: string; onClick: () => void }; onGenerate: () => void; generateLabel: string; canGenerate: boolean;
  onRefine: () => void; onConfirm: () => void; onRegenerate: () => void; confirmLabel?: string; hideRefineWhenConfirmed?: boolean;
}) {
  // Full-width button so the right-hand stack aligns top-to-bottom.
  const btn = (label: string, onClick: () => void, kind: "primary" | "ghost" | "confirm", disabled = false) => (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: "100%", padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: head, whiteSpace: "nowrap" as const,
        cursor: disabled ? "default" : "pointer",
        border: kind === "ghost" ? `1px solid ${C.border}` : "none",
        background: kind === "primary" ? (disabled ? C.faint : C.accent) : kind === "confirm" ? (disabled ? C.faint : C.green) : C.canvas,
        color: kind === "ghost" ? C.textSoft : disabled ? C.muted : "#fff",
        boxShadow: !disabled && kind !== "ghost" ? `0 2px 8px ${(kind === "confirm" ? C.green : C.accent)}30` : "none",
      }}>{label}</button>
  );
  const Stack = ({ children }: { children: any }) => (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, alignItems: "stretch", width: 184 }}>{children}</div>
  );
  if (status === "locked") return <span style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>Locked</span>;
  if (status === "generating") return <span style={{ fontSize: 11.5, color: C.accent, fontFamily: mono, fontWeight: 700 }}>Generating…</span>;
  if (status === "idle") return <Stack>{btn(generateLabel, onGenerate, "primary", !canGenerate)}</Stack>;
  // Order top→bottom: View · Refine · Regenerate · Confirm
  if (status === "review") return (
    <Stack>
      {viewAction && btn(viewAction.label, viewAction.onClick, "ghost")}
      {btn("Refine in chat", onRefine, "ghost")}
      {btn("Regenerate", onRegenerate, "ghost")}
      {btn(confirmLabel, onConfirm, "confirm")}
    </Stack>
  );
  // confirmed
  return (
    <Stack>
      {viewAction && btn(viewAction.label, viewAction.onClick, "ghost")}
      {!hideRefineWhenConfirmed && btn("Refine in chat", onRefine, "ghost")}
      <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.green, background: C.greenLo, padding: "5px 8px", borderRadius: 4, textAlign: "center" as const }}>CONFIRMED ✓</span>
    </Stack>
  );
}

function GateCard({ num, title, desc, status, isLast, preview, actions, extraTop, phase, jobError }: {
  num: number | string; title: string; desc: string; status: GateStatus; isLast: boolean;
  preview?: any; actions?: any; extraTop?: any; phase?: string; jobError?: string;
}) {
  const isConfirmed = status === "confirmed";
  const isReview = status === "review";
  const isLocked = status === "locked";
  const isGen = status === "generating";
  const borderColor = isConfirmed ? C.green : isReview ? C.accent : isGen ? C.accentBorder : C.border;
  const numBg = isConfirmed ? C.green : (isReview || isGen) ? C.accent : C.muted;
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: isConfirmed ? C.green : isLocked ? C.faint : C.accentLo, border: `2px solid ${isConfirmed ? C.green : isReview || isGen ? C.accent : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isConfirmed ? 14 : 12, fontWeight: 700, color: isConfirmed ? "#fff" : isLocked ? C.muted : C.accent, fontFamily: mono, transition: "all .3s" }}>
          {isConfirmed ? "✓" : num}
        </div>
        {!isLast && <div style={{ width: 2, flex: 1, minHeight: 16, background: isConfirmed ? C.green : C.border, margin: "4px 0" }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20, paddingTop: 2 }}>
        <div style={{ background: C.canvas, border: `1px solid ${isReview ? C.accentBorder : isConfirmed ? C.greenBorder : C.border}`, borderRadius: 10, padding: "14px 16px", opacity: isLocked ? 0.55 : 1, transition: "all .3s" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                {title}
                {isReview && <span style={{ marginLeft: 8, fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, padding: "2px 7px", borderRadius: 4 }}>REVIEW</span>}
              </div>
              <p style={{ fontSize: 12.5, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>{desc}</p>
              {extraTop}
              {isGen && phase && <div style={{ marginTop: 8, fontSize: 11.5, color: C.accent, fontFamily: mono }}>{phase}</div>}
              {jobError && <div style={{ marginTop: 8, fontSize: 11.5, color: "#CC2626", fontFamily: mono }}>Error: {String(jobError).slice(0, 160)}</div>}
              {preview}
            </div>
            {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
