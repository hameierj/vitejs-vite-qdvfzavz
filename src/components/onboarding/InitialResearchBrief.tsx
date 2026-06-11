import { useState } from "react";
import { ElapsedTimer } from "./ElapsedTimer";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#FDCB6E", amberLo: "#FDCB6E18", amberBorder: "#FDCB6E60",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

interface Props {
  brief: any | null;
  generating: boolean;
  genLog: string[];
  onGenerate: (domain: string) => void;
  onMarkReviewed: () => void;
  reviewed: boolean;
  startedAt?: number | null;
}

export function InitialResearchBrief({ brief, generating, genLog, onGenerate, onMarkReviewed, reviewed, startedAt }: Props) {
  const [domain, setDomain] = useState("");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 48px", fontFamily: head }}>
      <ElapsedTimer running={generating} startedAt={startedAt} label="RESEARCHING" />
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>
          STEP 1
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Initial Research Brief</h1>
        <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
          AI-generated company brief to prepare for the onboarding call. Review before speaking with the client.
        </p>
      </div>

      {/* Generate section */}
      {!brief && !generating && (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Run AI Research</div>
          <p style={{ fontSize: 13, color: C.textSoft, marginBottom: 16, lineHeight: 1.6 }}>
            Enter the client's website URL. AI will scrape their site, map their products and services, identify their target market, and generate a call prep brief.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && domain.trim()) onGenerate(domain.trim()); }}
              placeholder="e.g. acmecorp.com or https://acmecorp.com"
              style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
                fontSize: 13, fontFamily: head, color: C.text, outline: "none", background: C.bg }}
            />
            <button
              onClick={() => domain.trim() && onGenerate(domain.trim())}
              disabled={!domain.trim()}
              style={{ padding: "10px 20px", borderRadius: 8, border: "none",
                background: domain.trim() ? C.accent : C.faint,
                color: domain.trim() ? "#fff" : C.muted,
                fontSize: 13, fontWeight: 700, fontFamily: head, cursor: domain.trim() ? "pointer" : "default",
                boxShadow: domain.trim() ? `0 2px 8px ${C.accent}30` : "none" }}>
              Generate Brief
            </button>
          </div>
        </div>
      )}

      {/* Progress log */}
      {generating && (
        <div style={{ background: C.canvas, border: `1px solid ${C.accentBorder}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${C.accent}`, borderTopColor: "transparent",
              animation: "spin .8s linear infinite" }} />
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Researching client...</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: C.textSoft, lineHeight: 1.8 }}>
            {genLog.map((line, i) => (
              <div key={i} style={{ color: i === genLog.length - 1 ? C.accent : C.textSoft }}>
                {i === genLog.length - 1 ? "→ " : "✓ "}{line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brief display */}
      {brief && !generating && (
        <>
          {/* Review banner */}
          {!reviewed ? (
            <div style={{ background: C.accentLo, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: "12px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
                Review this brief before your onboarding call
              </div>
              <button onClick={onMarkReviewed}
                style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: C.accent,
                  color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: head, cursor: "pointer" }}>
                Mark as Reviewed ✓
              </button>
            </div>
          ) : (
            <div style={{ background: C.greenLo, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "10px 16px",
              display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 14, color: C.green }}>✓</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Brief reviewed — ready for the onboarding call</div>
              <button onClick={() => onGenerate(brief.domain || "")}
                style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.greenBorder}`,
                  background: "transparent", color: C.green, fontSize: 11, fontWeight: 600, fontFamily: head, cursor: "pointer" }}>
                Regenerate
              </button>
            </div>
          )}

          {/* Overview row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            {/* Company overview */}
            <Card title="Company Overview" anchor="companyOverview">
              {brief.companyOverview && (
                <>
                  {brief.companyOverview.businessModel && <Field label="Business Model" value={brief.companyOverview.businessModel} />}
                  {brief.companyOverview.size && <Field label="Company Size" value={brief.companyOverview.size} />}
                  {brief.companyOverview.stage && <Field label="Stage" value={brief.companyOverview.stage} />}
                </>
              )}
            </Card>

            {/* Products */}
            <Card title="Products / Services" anchor="productsServices">
              {(brief.productsServices || []).map((p: any, i: number) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5 }}>{p.description}</div>
                  {p.differentiator && <div style={{ fontSize: 11, color: C.accent, marginTop: 2 }}>↗ {p.differentiator}</div>}
                </div>
              ))}
            </Card>

            {/* Competitive */}
            <Card title="Competitive Position" anchor="competitivePositioning">
              {brief.competitivePositioning && (
                <>
                  {brief.competitivePositioning.category && <Field label="Category" value={brief.competitivePositioning.category} />}
                  {(brief.competitivePositioning.mainCompetitors || []).length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>Competitors</div>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                        {brief.competitivePositioning.mainCompetitors.slice(0, 5).map((c: string, i: number) => (
                          <span key={i} style={{ fontSize: 11, background: C.faint, border: `1px solid ${C.border}`, padding: "2px 7px", borderRadius: 4, color: C.textSoft }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(brief.competitivePositioning.differentiators || []).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>Key Differentiators</div>
                      {brief.competitivePositioning.differentiators.slice(0, 3).map((d: string, i: number) => (
                        <div key={i} style={{ fontSize: 11.5, color: C.textSoft, marginBottom: 2 }}>• {d}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          {/* Value props */}
          {(brief.valuePropositions || []).length > 0 && (
            <div data-copilot-id="valuePropositions" style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: 0.5, fontFamily: mono }}>Value Propositions</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {brief.valuePropositions.map((v: any, i: number) => (
                  <div key={i} style={{ padding: "10px 12px", background: C.faint, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 4 }}>{v.claim}</div>
                    {v.evidence && <div style={{ fontSize: 11.5, color: C.textSoft }}>{v.evidence}</div>}
                    {v.quantified && <div style={{ fontSize: 10.5, color: C.green, marginTop: 4, fontWeight: 600 }}>Quantified ✓</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ICP hypotheses + angles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {(brief.icpHypotheses || []).length > 0 && (
              <Card title="ICP Hypotheses" anchor="icpHypotheses">
                {brief.icpHypotheses.map((h: any, i: number) => (
                  <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < brief.icpHypotheses.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{h.name}</div>
                      <ConfidenceBadge level={h.confidence} />
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5, marginBottom: 4 }}>{h.rationale}</div>
                    {(h.signals || []).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3 }}>
                        {h.signals.slice(0, 3).map((s: string, j: number) => (
                          <span key={j} style={{ fontSize: 10.5, background: C.accentLo, color: C.accent, padding: "1px 6px", borderRadius: 3 }}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}

            {(brief.recommendedAngles || []).length > 0 && (
              <Card title="Recommended Outbound Angles" anchor="recommendedAngles">
                {brief.recommendedAngles.map((a: any, i: number) => (
                  <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < brief.recommendedAngles.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{a.angle}</div>
                      {a.bestChannel && <span style={{ fontSize: 10, background: C.faint, border: `1px solid ${C.border}`, color: C.textSoft, padding: "1px 6px", borderRadius: 3 }}>{a.bestChannel}</span>}
                    </div>
                    {a.why && <div style={{ fontSize: 11.5, color: C.textSoft, marginBottom: 3 }}>{a.why}</div>}
                    {a.suggestedHook && <div style={{ fontSize: 11.5, color: C.accent, fontStyle: "italic" as const }}>"{a.suggestedHook}"</div>}
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Call prep notes — prominent */}
          {brief.callPrepNotes && (
            <div style={{ background: C.amberLo, border: `1px solid ${C.amberBorder}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#92681A" }}>Call Prep Notes</div>
                <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: mono, fontWeight: 700, color: "#92681A", background: "#FDCB6E30", padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5 }}>
                  REVIEW BEFORE CALL
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#7A5716", lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
                {brief.callPrepNotes}
              </div>
            </div>
          )}

          {brief.confidenceNotes && (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" as const, padding: "8px 12px", background: C.faint, borderRadius: 8 }}>
              ℹ️ {brief.confidenceNotes}
            </div>
          )}

          {/* Regen */}
          {reviewed && (
            <div style={{ marginTop: 16, textAlign: "center" as const }}>
              <button onClick={() => onGenerate(brief.domain || "")}
                style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent",
                  color: C.muted, fontSize: 12, fontFamily: head, cursor: "pointer" }}>
                ↺ Regenerate Brief
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, children, anchor }: { title: string; children: React.ReactNode; anchor?: string }) {
  return (
    <div data-copilot-id={anchor} style={{ background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.text }}>{value}</div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    high: { bg: "#00B8941A", color: "#00B894" },
    medium: { bg: "#FDCB6E1A", color: "#92681A" },
    low: { bg: "#E170551A", color: "#E17055" },
  };
  const s = colors[level] || colors.medium;
  return (
    <span style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: s.bg, color: s.color, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
      {level}
    </span>
  );
}
