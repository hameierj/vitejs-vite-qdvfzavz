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

export type StageKey = "research" | "products" | "tamicp" | "personas" | "infra" | "campaigns";
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
  onSetWebsite: (website: string) => void;
  onStartStage: (stage: StageKey) => void;
  onConfirmGate: (gateId: TrackAGate | "infra") => void;
  onRefine: (scopeLabel: string) => void;
  onSetGateNote: (stage: StageKey, text: string) => void;
  // Step 1 structured context + attached documents
  researchContext: { products?: string; company?: string; other?: string };
  onSetResearchContext: (patch: { products?: string; company?: string; other?: string }) => void;
  researchDocs: { id: string; name: string; type?: string; mime?: string; _loading?: boolean }[];
  onUploadResearchDocs: (files: FileList) => void;
  onRemoveResearchDoc: (id: string) => void;
  // Step 2 editable product seed list (curate which products get profiled).
  // Passing undefined clears the override and re-syncs to the research brief.
  onSetProductSeeds: (seeds: { name: string; description?: string }[] | undefined) => void;
  // Step 4 ICP selection (which scored ICPs become personas).
  onSetPersonaSelection: (ids: string[]) => void;
  infraInputs: any;
  onSetInfraInputs: (patch: any) => void;
  onNavigate: (view: string) => void;
}

type TrackAGate = "companyResearch" | "products" | "tamIcp" | "personas" | "emailCampaigns";

const TRACK_A: { id: TrackAGate; stage: StageKey; num: number; title: string; desc: string }[] = [
  { id: "companyResearch", stage: "research", num: 1, title: "Company Research", desc: "Deep AI research on the company — products, value props, market evidence, ICP hypotheses, and call-prep notes." },
  { id: "products",        stage: "products", num: 2, title: "Products & Services", desc: "Full profiles for each product/service: value prop, deal economics, proof, objections, messaging. Generated from the confirmed research." },
  { id: "tamIcp",          stage: "tamicp",   num: 3, title: "TAM Tree → ICPs", desc: "Company-level TAM plus TAM per product/service, with ICPs identified per branch (unique or cross-product), explained and scored." },
  { id: "personas",        stage: "personas", num: 4, title: "Personas", desc: "Pick which scored ICPs to build into full outreach personas — buyer, pains, triggers, channels, messaging. The top-scoring ICPs are pre-selected." },
  { id: "emailCampaigns",  stage: "campaigns", num: 5, title: "Outreach Campaigns", desc: "Pick a product, persona, and writing tone (Hormozi, Vaynerchuk, etc.), then generate one LinkedIn sequence and three email campaigns — Conversation Starter, Meeting CTA, Value-Based CTA." },
];

const STAGE_FOR_GATE: Record<TrackAGate, StageKey> = {
  companyResearch: "research", products: "products", tamIcp: "tamicp", personas: "personas", emailCampaigns: "campaigns",
};
const NEXT_GATE: Record<TrackAGate, TrackAGate | null> = {
  companyResearch: "products", products: "tamIcp", tamIcp: "personas", personas: "emailCampaigns", emailCampaigns: null,
};

export function OnboardingGates(props: Props) {
  const { companyData: cd, products, icps, dfySetup, stageJobs, researchState, researchLog,
          onRunResearch, onSetWebsite, onStartStage, onConfirmGate, onRefine, onSetGateNote,
          researchContext, onSetResearchContext, researchDocs, onUploadResearchDocs, onRemoveResearchDoc,
          onSetProductSeeds, onSetPersonaSelection, infraInputs, onSetInfraInputs, onNavigate } = props;
  const noteFor = (stage: StageKey): string => ((cd?._gateNotes || {})[stage]) || "";
  const gates = (cd?._gates || {}) as Record<string, any>;
  // Website is the persisted source of truth (companyData.co_website) so it
  // survives reload and feeds Track-B infra defaults — not local-only state.
  const domain = (cd?.co_website || "") as string;
  const setDomain = (v: string) => onSetWebsite(v);
  const [showInfraAll, setShowInfraAll] = useState(false);

  // ── Artifact presence per gate ──
  const hasArtifact = (gate: TrackAGate): boolean => {
    switch (gate) {
      case "companyResearch": return !!cd?._initialResearchBrief;
      case "products": return (products || []).length > 0;
      case "tamIcp": return !!cd?._tamTree;
      case "personas": return !!cd?._personasGeneratedAt;
      case "emailCampaigns": return !!cd?._campaignsGeneratedAt;
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
    if (gate === "emailCampaigns") {
      const cp = (cd?._campaignPlans || {}) as Record<string, any>;
      const entries = Object.values(cp);
      if (!cd?._campaignsGeneratedAt || entries.length === 0) return null;
      return (
        <PreviewBox>
          <Row k="Campaign sets generated" v={String(entries.length)} />
          {entries.slice(0, 4).map((p: any, i: number) => (
            <div key={i} style={{ fontSize: 12.5, color: C.text, padding: "2px 0" }}>
              • {p.personaName || "Persona"} <span style={{ color: C.muted }}>×</span> {p.productName || "Product"}
              <span style={{ marginLeft: 6, fontSize: 10, fontFamily: mono, color: C.accent }}>1 LinkedIn · 3 email</span>
            </div>
          ))}
        </PreviewBox>
      );
    }
    return null;
  };

  const viewActionFor = (gate: TrackAGate): { label: string; onClick: () => void } | undefined => {
    switch (gate) {
      case "companyResearch": return { label: "View full brief", onClick: () => onNavigate("research-brief") };
      case "products": return { label: "View products", onClick: () => onNavigate("products-review") };
      case "tamIcp": return { label: "View scoring", onClick: () => onNavigate("icp-scoring") };
      case "personas": return { label: "View personas", onClick: () => onNavigate("personas-review") };
      case "emailCampaigns": return { label: "Open generator", onClick: () => onNavigate("campaign-generator") };
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
          // Personas can only generate once at least one ICP is picked (effective
          // selection = explicit picks, or the default top-6 when untouched).
          const personaSelCount = g.id !== "personas" ? 1
            : (Array.isArray(cd?._personaIcpSelection) ? cd._personaIcpSelection.length
               : Math.min(6, (cd?._icpScoringResult?.icps || []).length));
          return (
            <GateCard
              key={g.id} num={g.num} title={g.title} desc={g.desc} status={st} isLast={isLast}
              phase={phase} jobError={job?.status === "error" ? job?.error : undefined}
              preview={renderPreview(g.id)}
              extraTop={(st === "idle" || st === "generating" || st === "review") ? (
                <>
                  {g.id === "companyResearch" && (st === "idle" || st === "generating" || st === "review") && (
                    <>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>
                          Company website <span style={{ color: "#E11D48" }}>*</span> <span style={{ fontWeight: 500 }}>required</span>
                        </div>
                        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com"
                          disabled={st === "generating"}
                          style={{ width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 7, border: `1px solid ${domain.trim() ? C.border : "#F6C9D4"}`, fontSize: 12.5, fontFamily: head, color: C.text, background: C.canvas }} />
                        {!domain.trim() && <div style={{ fontSize: 10.5, color: "#E11D48", marginTop: 4 }}>Enter the company website to run research.</div>}
                      </div>
                      <ResearchContextPanel
                        ctx={researchContext} onChange={onSetResearchContext}
                        docs={researchDocs} onUpload={onUploadResearchDocs} onRemove={onRemoveResearchDoc}
                        disabled={st === "generating"} />
                    </>
                  )}
                  {g.id === "products" && (st === "idle" || st === "review") && (
                    <ProductSeedEditor
                      seeds={Array.isArray(cd?._productSeeds) ? cd._productSeeds : (cd?._initialResearchBrief?.productsServices || [])}
                      hasOverride={Array.isArray(cd?._productSeeds)}
                      onChange={onSetProductSeeds} />
                  )}
                  {g.id === "personas" && (st === "idle" || st === "review") && (
                    <IcpSelectEditor
                      scoredIcps={(cd?._icpScoringResult?.icps || [])}
                      selection={Array.isArray(cd?._personaIcpSelection) ? cd._personaIcpSelection : null}
                      onChange={onSetPersonaSelection} />
                  )}
                  {(st === "idle" || st === "review") && g.id !== "emailCampaigns" && g.id !== "companyResearch" && (
                    <GuidanceBox value={noteFor(g.stage)} onChange={(v) => onSetGateNote(g.stage, v)}
                      hint={st === "review" ? "Add guidance, then Regenerate to apply it" : "Steer the AI before it generates this step"} />
                  )}
                </>
              ) : null}
              actions={
                <GateActions
                  status={st}
                  viewAction={(st === "review" || st === "confirmed") ? viewActionFor(g.id) : undefined}
                  onGenerate={() => g.id === "companyResearch" ? onRunResearch(domain.trim()) : g.id === "emailCampaigns" ? onNavigate("campaign-generator") : onStartStage(g.stage)}
                  generateLabel={g.id === "companyResearch" ? "Run Research" : g.id === "emailCampaigns" ? "Open Generator" : g.id === "personas" ? `Generate ${personaSelCount} persona${personaSelCount !== 1 ? "s" : ""}` : `Generate`}
                  canGenerate={g.id === "companyResearch" ? !!domain.trim() : g.id === "personas" ? personaSelCount > 0 : true}
                  onRefine={() => onRefine(g.title)}
                  onConfirm={() => onConfirmGate(g.id)}
                  onRegenerate={() => g.id === "companyResearch" ? onRunResearch(domain.trim()) : g.id === "emailCampaigns" ? onNavigate("campaign-generator") : onStartStage(g.stage)}
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
          desc="Answer a few questions, then we generate the .com sending domains and allocate mailboxes. Review, then confirm. One-time setup: locked after confirm."
          phase={stageJobs.infra?.phase || ""} jobError={stageJobs.infra?.status === "error" ? stageJobs.infra?.error : undefined}
          extraTop={infraState === "idle" ? (
            <InfraConfigForm inputs={infraInputs} defaultWebsite={cd?.co_website || ""} onChange={onSetInfraInputs} />
          ) : null}
          preview={(infraState === "review" || infraState === "confirmed") && dfySetup ? (
            <PreviewBox>
              <Row k="Primary website" v={dfySetup.primaryWebsite || cd?.co_website || "—"} />
              <Row k="Forwarding domain" v={dfySetup.forwardingDomain || "—"} />
              <Row k="Domains (.com)" v={String(dfySetup.domainCount ?? (dfySetup.suggestedDomains || []).length)} />
              <Row k="Mailboxes" v={String(dfySetup.mailboxCount ?? "—")} />
              {(dfySetup.mailboxNames || []).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Sender distribution</div>
                  {(dfySetup.mailboxNames || []).map((n: any, i: number) => (
                    <div key={i} style={{ fontSize: 11.5, color: C.text, display: "flex", justifyContent: "space-between" }}>
                      <span>{n.name || `${n.firstName} ${n.lastName}`}</span><span style={{ color: C.muted, fontFamily: mono }}>{n.percent}% · {n.allocation} mbx</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginTop: 8 }}>
                {(dfySetup.suggestedDomains || []).slice(0, 8).map((d: any, i: number) => (
                  <span key={i} style={{ fontSize: 11, fontFamily: mono, color: C.textSoft, background: C.surface, padding: "2px 7px", borderRadius: 4 }}>{d.full || d.domain}</span>
                ))}
                {(dfySetup.suggestedDomains || []).length > 8 && <span style={{ fontSize: 11, color: C.muted }}>+{(dfySetup.suggestedDomains || []).length - 8}</span>}
              </div>
              <LinkBtn label={`View all ${(dfySetup.suggestedDomains || []).length} domains · ${(dfySetup.mailboxes || []).length || dfySetup.mailboxCount || 0} mailboxes →`} onClick={() => setShowInfraAll(true)} />
            </PreviewBox>
          ) : null}
          actions={
            <GateActions
              status={infraState}
              onGenerate={() => onStartStage("infra")} generateLabel="Generate Infra"
              canGenerate={!!(infraInputs.primaryWebsite || cd?.co_website)}
              onRefine={() => onRefine("Domains & Mailboxes (infrastructure)")}
              onConfirm={() => onConfirmGate("infra")}
              onRegenerate={() => onStartStage("infra")}
              confirmLabel="Confirm & Lock"
              hideRefineWhenConfirmed
            />
          }
        />
      </div>

      {showInfraAll && <InfraAllModal dfySetup={dfySetup} onClose={() => setShowInfraAll(false)} />}
    </div>
  );
}

// Full list of every generated domain and mailbox.
function InfraAllModal({ dfySetup, onClose }: { dfySetup: any; onClose: () => void }) {
  const domains: any[] = dfySetup?.suggestedDomains || [];
  const mailboxes: any[] = dfySetup?.mailboxes || [];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,15,26,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.canvas, borderRadius: 14, width: "min(900px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column" as const, fontFamily: head, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Domains & Mailboxes</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{domains.length} domains · {mailboxes.length} mailboxes</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: C.surface, color: C.textSoft, fontSize: 18, lineHeight: 1, cursor: "pointer", borderRadius: 7, padding: "6px 11px" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 0, overflow: "hidden", minHeight: 0, flex: 1 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, overflow: "auto", padding: "12px 16px" }}>
            <div style={{ fontSize: 10.5, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 8 }}>DOMAINS ({domains.length})</div>
            {domains.map((d: any, i: number) => (
              <div key={i} style={{ fontSize: 12, fontFamily: mono, color: C.text, padding: "3px 0", borderBottom: `1px solid ${C.faint}` }}>{d.full || d.domain}</div>
            ))}
          </div>
          <div style={{ overflow: "auto", padding: "12px 16px" }}>
            <div style={{ fontSize: 10.5, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 8 }}>MAILBOXES ({mailboxes.length})</div>
            {mailboxes.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted }}>No explicit mailboxes — regenerate to produce the full list.</div>
            ) : mailboxes.map((m: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "3px 0", borderBottom: `1px solid ${C.faint}` }}>
                <span style={{ fontFamily: mono, color: C.text }}>{m.address}</span>
                {m.senderName && <span style={{ color: C.muted, flexShrink: 0 }}>{m.senderName}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Domains & Mailboxes configuration form (asked before generation).
function InfraConfigForm({ inputs, defaultWebsite, onChange }: { inputs: any; defaultWebsite: string; onChange: (patch: any) => void }) {
  const names: any[] = Array.isArray(inputs.mailboxNames) ? inputs.mailboxNames : [];
  const pctTotal = names.reduce((s, n) => s + (Number(n.percent) || 0), 0);
  const setName = (i: number, patch: any) => onChange({ mailboxNames: names.map((n, j) => j === i ? { ...n, ...patch } : n) });
  const addName = () => onChange({ mailboxNames: [...names, { name: "", percent: 0 }] });
  const removeName = (i: number) => onChange({ mailboxNames: names.filter((_, j) => j !== i) });
  const inputStyle: any = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: head, color: C.text, background: C.canvas };
  const field = (label: string, el: any) => <div><div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>{label}</div>{el}</div>;
  const dCount = Number(inputs.domainCount) || 67;
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", background: C.surface, borderRadius: 9, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 10 }}>CONFIGURE · DOMAINS ARE .COM ONLY</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {field("Primary website", <input style={inputStyle} value={inputs.primaryWebsite || ""} placeholder={defaultWebsite || "company.com"} onChange={(e) => onChange({ primaryWebsite: e.target.value })} />)}
        {field("Forwarding domain", <input style={inputStyle} value={inputs.forwardingDomain || ""} placeholder="where domains redirect" onChange={(e) => onChange({ forwardingDomain: e.target.value })} />)}
        {field("Number of domains", <input style={inputStyle} type="number" value={inputs.domainCount ?? ""} placeholder="67" onChange={(e) => onChange({ domainCount: e.target.value ? Number(e.target.value) : undefined })} />)}
        {field("Number of mailboxes", <input style={inputStyle} type="number" value={inputs.mailboxCount ?? ""} placeholder={String(dCount * 3)} onChange={(e) => onChange({ mailboxCount: e.target.value ? Number(e.target.value) : undefined })} />)}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Mailbox sender names & % distribution</div>
      {names.map((n, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <input style={{ ...inputStyle, flex: 1 }} value={n.name || ""} placeholder="Full name (e.g. Jane Smith)" onChange={(e) => setName(i, { name: e.target.value })} />
          <input style={{ ...inputStyle, width: 72 }} type="number" value={n.percent ?? ""} placeholder="%" onChange={(e) => setName(i, { percent: e.target.value ? Number(e.target.value) : 0 })} />
          <button onClick={() => removeName(i)} style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 17, padding: "0 4px", lineHeight: 1 }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
        <button onClick={addName} style={{ background: "none", border: `1px dashed ${C.borderHi}`, color: C.accent, fontSize: 11.5, fontWeight: 700, fontFamily: head, cursor: "pointer", padding: "5px 10px", borderRadius: 7 }}>+ Add name</button>
        {names.length > 0 && <span style={{ fontSize: 11, fontFamily: mono, color: pctTotal === 100 ? C.green : C.amber }}>{pctTotal}%{pctTotal !== 100 ? " — should total 100" : " ✓"}</span>}
      </div>
    </div>
  );
}

// Step 2 editable seed checklist. Pre-fills from the research brief's products;
// the user can rename, remove, or add rows before generation, and exactly these
// are profiled (no silent cap-at-4). Editing creates an override on companyData;
// "Reset to research" clears it so the list re-syncs to the latest brief.
function ProductSeedEditor({ seeds, hasOverride, onChange }: {
  seeds: { name?: string; description?: string }[];
  hasOverride: boolean;
  onChange: (seeds: { name: string; description?: string }[] | undefined) => void;
}) {
  // Normalize to a plain {name, description} list we own and rewrite on every edit.
  const list = (seeds || []).map((s) => ({ name: s?.name || "", description: s?.description || "" }));
  const commit = (next: { name: string; description?: string }[]) => onChange(next);
  const setName = (i: number, name: string) => commit(list.map((s, j) => j === i ? { ...s, name } : s));
  const remove = (i: number) => commit(list.filter((_, j) => j !== i));
  const add = () => commit([...list, { name: "", description: "" }]);
  const named = list.filter((s) => s.name.trim()).length;
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", background: C.surface, borderRadius: 9, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted }}>PRODUCTS TO PROFILE</div>
        {hasOverride && (
          <button onClick={() => onChange(undefined)} style={{ background: "none", border: "none", color: C.accent, fontSize: 11, fontWeight: 700, fontFamily: head, cursor: "pointer", padding: 0 }}>Reset to research</button>
        )}
      </div>
      {list.length === 0 && (
        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>No products yet — add the ones to profile, or run Step 1 research first.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
        {list.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontFamily: mono, color: C.muted, width: 16, flexShrink: 0 }}>{i + 1}</span>
            <input value={s.name} onChange={(e) => setName(i, e.target.value)} placeholder="Product / service name"
              style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: head, color: C.text, background: C.canvas, boxSizing: "border-box" as const }} />
            <button onClick={() => remove(i)} title="Remove" style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <button onClick={add} style={{ background: C.canvas, border: `1px dashed ${C.borderHi}`, color: C.accent, fontSize: 11.5, fontWeight: 700, fontFamily: head, cursor: "pointer", padding: "5px 10px", borderRadius: 7 }}>+ Add product</button>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>{named} to profile{named > 5 ? " · 5–6 per run" : ""}</span>
      </div>
    </div>
  );
}

// Step 4 ICP picker. After TAM/ICP is confirmed, the user chooses which scored ICPs become full
// personas (instead of a silent top-6). Defaults to the top 6 by rank; selection persists to
// companyData._personaIcpSelection. Capped at 8 (parallel persona generation).
const MAX_PERSONA_PICKS = 8;
const DEFAULT_PERSONA_PICKS = 6;
const RECO_LABEL: Record<string, string> = {
  launch_first: "Launch first", launch_second: "Launch second", test_small: "Test small", defer: "Defer", skip: "Skip",
};
function IcpSelectEditor({ scoredIcps, selection, onChange }: {
  scoredIcps: { icpId: string; icpName: string; rank?: number; weightedScore?: number; recommendation?: string; scope?: string }[];
  selection: string[] | null;
  onChange: (ids: string[]) => void;
}) {
  const rows = [...(scoredIcps || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 12, padding: "12px 14px", background: C.surface, borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 11.5, color: C.muted }}>
        No scored ICPs yet — confirm Step 3 (TAM Tree → ICPs) first.
      </div>
    );
  }
  // Default selection = top N by rank when the user hasn't chosen yet.
  const defaultSel = rows.slice(0, DEFAULT_PERSONA_PICKS).map((r) => r.icpId);
  const sel = selection ?? defaultSel;
  const selSet = new Set(sel);
  const atCap = sel.length >= MAX_PERSONA_PICKS;
  const toggle = (id: string) => {
    if (selSet.has(id)) onChange(sel.filter((x) => x !== id));
    else if (!atCap) onChange([...sel, id]);
  };
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", background: C.surface, borderRadius: 9, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 4 }}>PICK ICPs TO BUILD PERSONAS FOR</div>
      <div style={{ fontSize: 11.5, color: C.textSoft, marginBottom: 10, lineHeight: 1.5 }}>The highest-scoring ICPs are pre-selected. Adjust, then Generate — only the checked ICPs become full personas.</div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
        {rows.map((r) => {
          const checked = selSet.has(r.icpId);
          const disabled = !checked && atCap;
          return (
            <label key={r.icpId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 7, border: `1px solid ${checked ? C.accentBorder : C.border}`, background: checked ? C.accentLo : C.canvas, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(r.icpId)} style={{ accentColor: C.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontFamily: mono, color: C.accent, fontWeight: 700, flexShrink: 0 }}>#{r.rank ?? "—"}</span>
              <span style={{ flex: 1, fontSize: 12.5, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.icpName}</span>
              {r.scope === "cross_product" && <span style={{ fontSize: 9, fontFamily: mono, color: C.blue, background: C.blueLo, padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>CROSS</span>}
              {r.recommendation && <span style={{ fontSize: 9.5, fontFamily: mono, color: C.muted, flexShrink: 0 }}>{RECO_LABEL[r.recommendation] || r.recommendation}</span>}
              <span style={{ fontSize: 11, fontFamily: mono, color: C.muted, flexShrink: 0 }}>{typeof r.weightedScore === "number" ? r.weightedScore.toFixed(1) : "—"}</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <button onClick={() => onChange(rows.map((r) => r.icpId).slice(0, MAX_PERSONA_PICKS))}
          style={{ background: "none", border: "none", color: C.accent, fontSize: 11, fontWeight: 700, fontFamily: head, cursor: "pointer", padding: 0 }}>
          Select all{rows.length > MAX_PERSONA_PICKS ? ` (max ${MAX_PERSONA_PICKS})` : ""}
        </button>
        <span style={{ fontSize: 11, fontFamily: mono, color: atCap ? C.amber : C.muted }}>{sel.length} selected{atCap ? ` · max ${MAX_PERSONA_PICKS}` : ""}</span>
      </div>
    </div>
  );
}

// Step 1 structured context: separate fields for products/services, company
// background, free-form instructions, plus document attachments (PDFs/decks).
// Everything here is optional but steers the research heavily.
function ResearchContextPanel({ ctx, onChange, docs, onUpload, onRemove, disabled }: {
  ctx: { products?: string; company?: string; other?: string };
  onChange: (patch: { products?: string; company?: string; other?: string }) => void;
  docs: { id: string; name: string; type?: string; mime?: string; _loading?: boolean }[];
  onUpload: (files: FileList) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const ta = (label: string, hint: string, value: string, key: "products" | "company" | "other") => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 4, fontWeight: 600 }}>{label} <span style={{ color: C.muted, fontWeight: 500 }}>(optional)</span></div>
      <textarea value={value || ""} onChange={(e) => onChange({ [key]: e.target.value })} rows={3} disabled={disabled}
        placeholder={hint}
        style={{ width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: head, color: C.text, background: C.canvas, resize: "vertical" as const, lineHeight: 1.5 }} />
    </div>
  );
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", background: C.surface, borderRadius: 9, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 10 }}>CONTEXT FOR THE AI · ALL OPTIONAL</div>
      {ta("Products & services", "What the company sells. Paste text or links — e.g. product pages, pricing, feature lists.", ctx.products || "", "products")}
      {ta("About the company", "Company background, positioning, customers. Paste text or links — e.g. about page, press, case studies.", ctx.company || "", "company")}
      {ta("Special instructions", `Steer the research. e.g. "focus on the enterprise product", "main competitor is X", "target manufacturing, not retail".`, ctx.other || "", "other")}
      <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 6, fontWeight: 600 }}>Documents <span style={{ color: C.muted, fontWeight: 500 }}>(optional — PDFs &amp; decks are read directly)</span></div>
      {docs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, marginBottom: 8 }}>
          {docs.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 9px", background: C.canvas, borderRadius: 7, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                <span style={{ color: C.muted, marginRight: 6 }}>{docIcon(f)}</span>{f.name}{f._loading ? <span style={{ color: C.muted, marginLeft: 6 }}>loading…</span> : null}
              </span>
              <button onClick={() => onRemove(f.id)} disabled={disabled} title="Remove"
                style={{ border: "none", background: "none", color: C.muted, cursor: disabled ? "default" : "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 7, border: `1px dashed ${C.borderHi}`, color: disabled ? C.muted : C.accent, fontSize: 11.5, fontWeight: 700, fontFamily: head, cursor: disabled ? "default" : "pointer", background: C.canvas }}>
        + Upload documents
        <input type="file" multiple accept=".pdf,.doc,.docx,.txt,.csv,.json,image/*" disabled={disabled}
          onChange={(e) => { if (e.target.files?.length) onUpload(e.target.files); e.currentTarget.value = ""; }}
          style={{ display: "none" }} />
      </label>
    </div>
  );
}
function docIcon(f: { name: string; type?: string; mime?: string }): string {
  const mt = f.mime || f.type || "";
  if (mt === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf")) return "▣";
  if (mt.startsWith("image/")) return "▤";
  return "▢";
}

// ── Small presentational helpers ──
function GuidanceBox({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <details open={!!value} style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer", fontSize: 11.5, color: C.accent, fontWeight: 700, fontFamily: head, listStyle: "none" as const, userSelect: "none" as const }}>
        + Add context for the AI <span style={{ color: C.muted, fontWeight: 500 }}>(optional)</span>
      </summary>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        placeholder={`${hint}. e.g. "focus on the enterprise product", "their main competitor is X", "target manufacturing, not retail".`}
        style={{ marginTop: 8, width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: head, color: C.text, background: C.canvas, resize: "vertical" as const, lineHeight: 1.5 }} />
    </details>
  );
}
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
  if (status === "generating") return (
    <Stack>
      <span style={{ fontSize: 11.5, color: C.accent, fontFamily: mono, fontWeight: 700, textAlign: "center" as const }}>Generating…</span>
      {/* Escape hatch: if a run stalls (e.g. the server was killed mid-job), let the user re-kick it. */}
      <button onClick={onRegenerate}
        style={{ width: "100%", padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: head,
          border: `1px solid ${C.border}`, background: C.canvas, color: C.textSoft, cursor: "pointer" }}>
        Restart
      </button>
    </Stack>
  );
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
