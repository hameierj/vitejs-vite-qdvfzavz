// Client-facing portal for CX v2 workspaces
// Reads from workspaces + documents + analytics_uploads tables
// Polished, branded, read-only

const ACCENT = "#6C5CE7";
const ACCENT_LO = "#6C5CE70D";
const ACCENT_BORDER = "#6C5CE733";
const GREEN = "#00D68F";
const GREEN_LO = "#00D68F0F";
const GREEN_BORDER = "#00D68F33";
const AMBER = "#FFC048";
const RED = "#FF6B6B";
const TEXT = "#1A1D2E";
const TEXT_SOFT = "#4A5568";
const MUTED = "#8E94A7";
const BORDER = "#EDF2F7";
const SURFACE = "#F8F9FE";
const CANVAS = "#FFFFFF";
const f = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const STAGE_LABELS = ["Sales Handoff", "Client Research", "Domain Targeting", "Campaign Strategy", "Onboarding", "Comm Log", "Analytics"];

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

interface Props {
  ws: {
    id: string;
    name: string;
    stage: number;
    stage_statuses: Record<string, string>;
    share_token: string;
    docs: { type: string; content: any; version: number; approved_at: string | null }[];
    analytics: { scorecard: any; parsed: any; filename: string; uploaded_at: string } | null;
    commsCount: number;
  };
}

export function CxV2Portal({ ws }: Props) {
  const handoff = ws.docs.filter(d => d.type === "handoff").sort((a, b) => b.version - a.version)[0];
  const onboarding = ws.docs.find(d => d.type === "onboarding");
  const hc = handoff?.content as any;

  const approvedStages = Object.entries(ws.stage_statuses || {})
    .filter(([, v]) => v === "approved")
    .map(([k]) => parseInt(k))
    .concat(Array.from({ length: ws.stage - 1 }, (_, i) => i + 1))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  const stagesComplete = Math.max(ws.stage - 1, approvedStages.length);
  const progressPct = Math.round((stagesComplete / 7) * 100);

  const scorecard = ws.analytics?.scorecard as Record<string, { value: number; score: string; benchmark: { label: string; lowerIsBetter?: boolean } }> | null;
  const scoreColor = (s: string) => s === "good" ? GREEN : s === "avg" ? AMBER : RED;

  return (
    <div style={{ fontFamily: f, background: SURFACE, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
      `}</style>

      {/* Header */}
      <div style={{ background: TEXT, color: "#fff", padding: "0 0 0 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 40px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: mono, letterSpacing: 1, marginBottom: 10 }}>
                B2B ROCKET · CLIENT PORTAL
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: "#fff" }}>
                {ws.name}
              </h1>
              {hc?.companyContext && (
                <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.6)", margin: "8px 0 0", lineHeight: 1.6, maxWidth: 520 }}>
                  {hc.companyContext.slice(0, 180)}{hc.companyContext.length > 180 ? "…" : ""}
                </p>
              )}
            </div>
            {hc?.fitScore && (
              <div style={{ textAlign: "center", background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 20px", flexShrink: 0 }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: hc.fitScore >= 8 ? GREEN : hc.fitScore >= 5 ? AMBER : RED, fontFamily: mono }}>
                  {hc.fitScore}/10
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: mono, marginTop: 3 }}>FIT SCORE</div>
              </div>
            )}
          </div>

          {/* Stage progress tabs */}
          <div style={{ display: "flex", gap: 0, marginTop: 4, overflowX: "auto" }}>
            {STAGE_LABELS.map((label, i) => {
              const num = i + 1;
              const isApproved = approvedStages.includes(num) || num < ws.stage;
              const isActive = num === ws.stage;
              const isLocked = !isApproved && !isActive;
              return (
                <div key={num} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
                  borderBottom: isActive ? `3px solid ${ACCENT}` : "3px solid transparent",
                  opacity: isLocked ? 0.35 : 1, flexShrink: 0,
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                    background: isApproved ? GREEN : isActive ? ACCENT : "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>
                    {isApproved ? <span style={{ color: "#fff" }}>✓</span> : <span style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.5)", fontFamily: mono }}>{num}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: isActive ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: isActive ? 700 : 400, whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: TEXT, height: 3 }}>
        <div style={{ height: "100%", background: `linear-gradient(90deg, ${ACCENT}, ${GREEN})`, width: `${progressPct}%`, transition: "width .5s" }} />
      </div>

      {/* Body */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 40px 60px" }}>

        {/* Call summary */}
        {hc?.callSummary && (
          <Card title="Executive Summary" accent={ACCENT}>
            <p style={{ fontSize: 14, color: TEXT_SOFT, lineHeight: 1.7, margin: 0 }}>{hc.callSummary}</p>
          </Card>
        )}

        {/* Pain points + use case */}
        {(hc?.painPoints?.length || hc?.useCase) && (
          <div style={{ display: "grid", gridTemplateColumns: hc?.useCase ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 20 }}>
            {hc?.painPoints?.length > 0 && (
              <Card title="Key Challenges" accent={RED} compact>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {hc.painPoints.slice(0, 6).map((p: string, i: number) => (
                    <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: RED, marginTop: 1, flexShrink: 0 }}>→</span>
                      <span style={{ color: TEXT_SOFT, lineHeight: 1.5 }}>{p}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {hc?.useCase && (
              <Card title="Our Solution" accent={GREEN} compact>
                <p style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 1.65, margin: 0 }}>{hc.useCase}</p>
              </Card>
            )}
          </div>
        )}

        {/* Deal details */}
        {hc?.dealDetails && Object.values(hc.dealDetails).some(Boolean) && (
          <Card title="Engagement Details" accent={ACCENT}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {Object.entries(hc.dealDetails).filter(([, v]) => v && String(v) !== "Not discussed").map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: MUTED, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
                    {k.replace(/([A-Z])/g, " $1").toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{String(v)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Key contacts */}
        {hc?.keyContacts?.length > 0 && (
          <Card title="Key Contacts" accent={ACCENT}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {hc.keyContacts.map((c: any, i: number) => (
                <div key={i} style={{ background: SURFACE, borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginBottom: c.email ? 4 : 0 }}>{c.title}</div>
                  {c.email && <div style={{ fontSize: 11.5, color: ACCENT }}>{c.email}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Next steps */}
        {hc?.nextSteps?.length > 0 && (
          <Card title="Agreed Next Steps" accent={GREEN}>
            <ol style={{ margin: 0, padding: "0 0 0 18px" }}>
              {hc.nextSteps.map((step: string, i: number) => (
                <li key={i} style={{ fontSize: 13.5, color: TEXT_SOFT, lineHeight: 1.6, marginBottom: 6 }}>{step}</li>
              ))}
            </ol>
          </Card>
        )}

        {/* Analytics scorecard */}
        {scorecard && Object.keys(scorecard).length > 0 && (
          <Card title="Campaign Performance" accent={ACCENT} subtitle={ws.analytics?.filename}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {Object.entries(scorecard).map(([key, entry]) => {
                const color = scoreColor(entry.score);
                return (
                  <div key={key} style={{ background: SURFACE, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: MUTED, fontFamily: mono, marginBottom: 6 }}>
                      {entry.benchmark?.label?.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: mono, marginBottom: 4 }}>
                      {pct(entry.value)}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: mono,
                      background: `${color}15`, padding: "2px 5px", borderRadius: 3 }}>
                      {entry.score?.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Onboarding updates */}
        {onboarding?.content?.approvedChanges?.length > 0 && (
          <Card title="Onboarding Updates Applied" accent={GREEN} compact>
            <div style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 1.6 }}>
              {onboarding.content.approvedChanges.length} updates applied after onboarding call
              {onboarding.approved_at ? ` on ${new Date(onboarding.approved_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}.
            </div>
          </Card>
        )}

        {/* Activity summary */}
        <Card title="Engagement Overview" accent={ACCENT}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Stat label="Stages Complete" value={`${stagesComplete} / 7`} />
            <Stat label="Documents" value={String(ws.docs.length)} />
            {ws.commsCount > 0 && <Stat label="Touchpoints Logged" value={String(ws.commsCount)} />}
            {ws.analytics && <Stat label="Analytics Runs" value="1" />}
          </div>
        </Card>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 24, marginTop: 8,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11.5, color: MUTED }}>Prepared by B2B Rocket · Confidential</div>
          <img src="/b2brocket-logo.png" alt="B2B Rocket" style={{ height: 28, objectFit: "contain", opacity: 0.5 }} />
        </div>
      </div>
    </div>
  );
}

function Card({ title, accent, subtitle, compact, children }: {
  title: string; accent: string; subtitle?: string; compact?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ background: CANVAS, border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: compact ? "16px 20px" : "20px 24px", marginBottom: 16,
      animation: "fadeUp .3s ease both", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: compact ? 12 : 16 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, letterSpacing: 0.4, fontFamily: mono }}>
          {title.toUpperCase()}
        </div>
        {subtitle && <div style={{ fontSize: 10.5, color: MUTED, marginLeft: 4 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, fontFamily: mono, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{label}</div>
    </div>
  );
}
