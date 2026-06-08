// Narrative layer — always-on, human-readable view of the program: what's
// running now, what's working, where the strategy is headed, and the full
// history. Deterministic (reads live workspace state), with an optional
// AI-written summary at the top.

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", amber: "#B45309", blue: "#54A0FF",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const GATE_LABEL: Record<string, string> = {
  companyResearch: "Company Research", products: "Products & Services",
  tamIcp: "TAM Tree / ICPs", personas: "Personas", infra: "Domains & Mailboxes",
};

interface Props {
  companyData: any;
  campaigns: any[];
  icps: any[];
  products: any[];
  perfLogs: any[];
  generating: boolean;
  onGenerateSummary: () => void;
  onNavigate: (view: string) => void;
}

function replyRate(c: any): number | null {
  const m = c.performance?.metrics; if (!m || !m.sent) return null;
  const replies = (m.allReplies ?? m.humanReplies ?? 0);
  return m.sent > 0 ? Math.round((replies / m.sent) * 1000) / 10 : null;
}

export function NarrativeView({ companyData: cd, campaigns, icps, products, perfLogs, generating, onGenerateSummary, onNavigate }: Props) {
  const plan = cd?._launchPlan;
  const active = (campaigns || []).filter((c: any) => c.status === "active");
  const activeEmail = active.filter((c: any) => c.channel === "email");
  const activeLi = active.filter((c: any) => c.channel === "linkedin");

  // Working: campaigns with metrics, ranked by reply rate.
  const withPerf = (campaigns || []).map((c: any) => ({ c, rr: replyRate(c) })).filter((x) => x.rr !== null).sort((a, b) => (b.rr! - a.rr!));

  // Direction: launch waves + deferred ICPs.
  const waves = plan ? [...(plan.emailWaves || [])].sort((a: any, b: any) => (a.rank || 99) - (b.rank || 99)) : [];
  const nextWave = waves.find((w: any) => w.status !== "finalized" && w.status !== "active");
  const activeWave = waves.find((w: any) => w.status === "active");
  const scoring = cd?._icpScoringResult?.icps || [];
  const deferred = scoring.filter((s: any) => s.recommendation === "defer" || s.recommendation === "skip");

  // Timeline: confirmed gates, launch activations, campaign creation, perf logs.
  const events: { date: number; label: string; kind: string }[] = [];
  const gates = cd?._gates || {};
  Object.entries(gates).forEach(([k, v]: any) => { if (v?.confirmedAt) events.push({ date: Date.parse(v.confirmedAt), label: `Confirmed ${GATE_LABEL[k] || k}`, kind: "gate" }); });
  waves.forEach((w: any) => {
    if (w.activatedAt) events.push({ date: Date.parse(w.activatedAt), label: `Activated email for ${w.icpName}`, kind: "launch" });
    if (w.finalizedAt) events.push({ date: Date.parse(w.finalizedAt), label: `Finalized ${w.icpName}`, kind: "launch" });
  });
  if (plan?.linkedinActivatedAt) events.push({ date: Date.parse(plan.linkedinActivatedAt), label: `Activated LinkedIn campaigns`, kind: "launch" });
  (campaigns || []).forEach((c: any) => { if (c.createdAt && c.source === "launch") events.push({ date: Date.parse(c.createdAt), label: `Created campaign “${c.name}”`, kind: "campaign" }); });
  (perfLogs || []).forEach((l: any) => { const d = l.date || l.loggedAt || l.createdAt; if (d) events.push({ date: Date.parse(d), label: l.summary || l.note || "Performance logged", kind: "perf" }); });
  const timeline = events.filter((e) => !Number.isNaN(e.date)).sort((a, b) => b.date - a.date).slice(0, 30);
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 64px", fontFamily: head }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8 }}>NARRATIVE</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Program Narrative</h1>
        <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>What's running, what's working, where it's headed — and the full history. Always current.</p>
      </div>

      {/* AI summary */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: cd?._narrativeSummary ? 10 : 0 }}>
          <SectionTitle>Executive summary</SectionTitle>
          <button onClick={onGenerateSummary} disabled={generating}
            style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.canvas, color: generating ? C.muted : C.accent, fontSize: 11.5, fontWeight: 700, fontFamily: head, cursor: generating ? "default" : "pointer" }}>
            {generating ? "Writing…" : cd?._narrativeSummary ? "Refresh" : "Generate summary"}
          </button>
        </div>
        {cd?._narrativeSummary ? (
          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" as const }}>{cd._narrativeSummary}</p>
        ) : (
          <p style={{ fontSize: 12.5, color: C.muted, margin: "6px 0 0" }}>Generate an AI-written summary of the current state and trajectory.</p>
        )}
        {cd?._narrativeSummaryAt && <div style={{ fontSize: 10.5, color: C.muted, fontFamily: mono, marginTop: 8 }}>updated {fmt(Date.parse(cd._narrativeSummaryAt))}</div>}
      </Card>

      {/* Running now */}
      <Card>
        <SectionTitle>Running now</SectionTitle>
        {active.length === 0 ? <Muted>No campaigns active yet. <Link onClick={() => onNavigate("launch")}>Go to Launch →</Link></Muted> : (
          <>
            <Stat k="Active campaigns" v={`${active.length} (${activeEmail.length} email · ${activeLi.length} LinkedIn)`} />
            {activeWave && <Stat k="Current email ICP (testing)" v={activeWave.icpName} />}
            <Stat k="Infrastructure" v={cd?._gates?.infra?.status === "confirmed" ? "Confirmed" : (cd?.dfySetup?.generatedAt ? "In review" : "Not set up")} />
          </>
        )}
      </Card>

      {/* What's working */}
      <Card>
        <SectionTitle>What's working</SectionTitle>
        {withPerf.length === 0 ? <Muted>No performance data yet. Winners surface here once campaigns report metrics.</Muted> : (
          withPerf.slice(0, 5).map(({ c, rr }) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
              <span style={{ color: C.text }}>{c.name}</span>
              <span style={{ fontFamily: mono, fontWeight: 700, color: (rr || 0) >= 5 ? C.green : (rr || 0) >= 2 ? C.amber : C.muted }}>{rr}% reply</span>
            </div>
          ))
        )}
      </Card>

      {/* Direction */}
      <Card>
        <SectionTitle>Where it's headed</SectionTitle>
        {nextWave ? <Stat k="Next ICP to launch" v={`${nextWave.icpName} (rank #${nextWave.rank}, ${nextWave.campaignType})`} /> : <Muted>{plan ? "All planned ICP waves are active or finalized." : "No launch plan yet."}</Muted>}
        {deferred.length > 0 && <Stat k="Deferred / skipped ICPs" v={deferred.map((d: any) => d.icpName).join(", ")} />}
        <Stat k="Personas / Products" v={`${(icps || []).length} personas · ${(products || []).length} products`} />
      </Card>

      {/* History */}
      <Card>
        <SectionTitle>History</SectionTitle>
        {timeline.length === 0 ? <Muted>Activity will appear here as you confirm gates and launch campaigns.</Muted> : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {timeline.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontSize: 10.5, fontFamily: mono, color: C.muted, flexShrink: 0, width: 92 }}>{fmt(e.date)}</span>
                <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: e.kind === "gate" ? C.green : e.kind === "launch" ? C.accent : e.kind === "perf" ? C.amber : C.blue, marginTop: 5 }} />
                <span style={{ fontSize: 12.5, color: C.text }}>{e.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ children }: { children: any }) {
  return <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>{children}</div>;
}
function SectionTitle({ children }: { children: any }) {
  return <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" as const }}>{children}</div>;
}
function Stat({ k, v }: { k: string; v: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}><span style={{ color: C.muted }}>{k}</span><span style={{ color: C.text, fontWeight: 600, textAlign: "right" as const, maxWidth: "60%" }}>{v}</span></div>;
}
function Muted({ children }: { children: any }) {
  return <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>{children}</div>;
}
function Link({ children, onClick }: { children: any; onClick: () => void }) {
  return <button onClick={onClick} style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: head, padding: 0 }}>{children}</button>;
}
