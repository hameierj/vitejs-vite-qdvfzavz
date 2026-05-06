import { useState, useEffect, useRef } from "react";
import { supabase, SUPABASE_URL } from "../../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentBorder: "#6C5CE733", accentHi: "#5A4BD6",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC0480F", amberBorder: "#FFC04830",
  red: "#FF6B6B", redLo: "#FF6B6B0F", redBorder: "#FF6B6B33",
  blue: "#54A0FF", blueLo: "#54A0FF0F",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaXVudm1qd3B3dm95cnFubWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mjg4OTksImV4cCI6MjA5MDIwNDg5OX0.bu-qwXsDDqmTJEAn5KAuriTXgEFwlqxf_eIXBVF-6-Q";

interface ScorecardEntry {
  value: number;
  score: "good" | "avg" | "poor";
  benchmark: { poor: number; avg: number; good: number; label: string; lowerIsBetter?: boolean };
}

interface Variant {
  id: string;
  metric: string;
  hypothesis: string;
  change: string;
  expectedLift: string;
  effort: "low" | "medium" | "high";
  isWinner?: boolean;
}

interface Insight {
  id: string;
  type: "win" | "issue" | "opportunity";
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
}

interface AnalysisResult {
  rowCount: number;
  overallMetrics: Record<string, number>;
  campaignMetrics: { name: string; metrics: Record<string, number> }[];
  scorecard: Record<string, ScorecardEntry>;
  overallGrade: string;
  gradeSummary: string;
  topInsights: Insight[];
  variants: Variant[];
}

const GRADE_COLORS: Record<string, string> = { A: C.green, B: "#00CEC9", C: C.amber, D: "#FF6B6B", F: C.red };
const EFFORT_COLORS: Record<string, string> = { low: C.green, medium: C.amber, high: C.red };
const INSIGHT_COLORS = { win: { bg: C.greenLo, border: C.greenBorder, text: C.green }, issue: { bg: C.redLo, border: C.redBorder, text: C.red }, opportunity: { bg: C.accentLo, border: C.accentBorder, text: C.accent } };

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

export function Stage7_Analytics({ workspaceId }: { workspaceId: string }) {
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [savingWinner, setSavingWinner] = useState<string | null>(null);
  const [savedWinner, setSavedWinner] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const anthropicKey = (() => { try { return localStorage.getItem("b2br_api_key") || ""; } catch { return ""; } })();

  useEffect(() => {
    loadHistory();
  }, [workspaceId]);

  async function loadHistory() {
    if (!supabase || !workspaceId) return;
    const { data } = await supabase
      .from("analytics_uploads")
      .select("id, filename, uploaded_at, scorecard, parsed")
      .eq("workspace_id", workspaceId)
      .order("uploaded_at", { ascending: false })
      .limit(5);
    setHistory(data || []);
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setCsvContent(text);
    setFileName(file.name);
    if (!campaignName) setCampaignName(file.name.replace(/\.[^.]+$/, ""));
  }

  async function runAnalysis() {
    if (!csvContent.trim()) { setError("Upload a CSV file first."); return; }
    setLoading(true);
    setResult(null);
    setVariants([]);
    setSavedWinner(null);
    setError("");

    const msgs = ["Parsing CSV data…", "Scoring against benchmarks…", "Identifying patterns…", "Generating recommendations…"];
    let mi = 0;
    setLoadingMsg(msgs[mi]);
    const interval = setInterval(() => { mi = (mi + 1) % msgs.length; setLoadingMsg(msgs[mi]); }, 4000);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analytics-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "x-anthropic-key": anthropicKey,
        },
        body: JSON.stringify({ step: 1, workspaceId, csvContent, campaignName }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data);
      setVariants(data.variants || []);
      loadHistory();
    } catch (e: any) {
      setError(e.message);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }

  async function markWinner(variant: Variant) {
    setSavingWinner(variant.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analytics-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({
          step: 2, workspaceId,
          variantData: { ...variant, campaignName, isWinner: true },
        }),
      });
      const data = await res.json();
      if (!data.error) {
        setSavedWinner(variant.id);
        setVariants(vs => vs.map(v => ({ ...v, isWinner: v.id === variant.id })));
      }
    } finally {
      setSavingWinner(null);
    }
  }

  const scoreColor = (score: "good" | "avg" | "poor") =>
    score === "good" ? C.green : score === "avg" ? C.amber : C.red;

  return (
    <div style={{ fontFamily: body }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 7</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>Analytics & Optimization</h2>
        <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.6 }}>
          Upload a B2B Rocket CSV export. AI scores performance against benchmarks and generates variant recommendations.
        </p>
      </div>

      {/* Upload area */}
      {!result && (
        <>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{ border: `2px dashed ${csvContent ? C.accent : C.border}`, borderRadius: 12,
              padding: "28px 20px", textAlign: "center", cursor: "pointer",
              background: csvContent ? C.accentLo : C.surface, transition: "all .2s", marginBottom: 16 }}
            onMouseEnter={e => !csvContent && ((e.currentTarget as HTMLDivElement).style.borderColor = C.accent)}
            onMouseLeave={e => !csvContent && ((e.currentTarget as HTMLDivElement).style.borderColor = C.border)}>
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {csvContent ? (
              <>
                <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: head, marginBottom: 4 }}>{fileName}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>{csvContent.split("\n").length.toLocaleString()} rows · click to replace</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: head, marginBottom: 4 }}>Drop B2B Rocket CSV here</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>or click to browse · .csv files only</div>
              </>
            )}
          </div>

          {csvContent && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginBottom: 5 }}>CAMPAIGN NAME (optional)</div>
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
                placeholder="e.g. SaaS VP Sales — May 2026"
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px",
                  fontSize: 13, color: C.text, background: C.canvas, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{error}</div>}

          <button onClick={runAnalysis} disabled={loading || !csvContent}
            style={{ padding: "11px 24px", background: loading || !csvContent ? C.muted : C.accent,
              color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
              fontFamily: head, cursor: loading || !csvContent ? "default" : "pointer",
              boxShadow: csvContent && !loading ? `0 2px 10px ${C.accent}40` : "none" }}>
            {loading ? loadingMsg || "Analyzing…" : "Analyze Performance"}
          </button>
        </>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Grade + summary */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: GRADE_COLORS[result.overallGrade] || C.muted, fontFamily: mono, lineHeight: 1 }}>
                {result.overallGrade}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 4 }}>
                  {result.rowCount?.toLocaleString()} prospects
                </div>
                <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>{result.gradeSummary}</div>
              </div>
            </div>
            <button onClick={() => { setResult(null); setCsvContent(""); setFileName(""); }}
              style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: "transparent", color: C.muted,
                fontSize: 12, fontFamily: head, cursor: "pointer" }}>
              New Upload
            </button>
          </div>

          {/* Scorecard */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>SCORECARD</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {Object.entries(result.scorecard || {}).map(([key, entry]) => {
                const sc = entry as ScorecardEntry;
                const color = scoreColor(sc.score);
                const pctVal = pct(sc.value);
                const goodVal = pct(sc.benchmark.good);
                const barPct = sc.benchmark.lowerIsBetter
                  ? Math.max(0, Math.min(100, (1 - sc.value / 0.15) * 100))
                  : Math.max(0, Math.min(100, (sc.value / sc.benchmark.good) * 100));
                return (
                  <div key={key} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginBottom: 6 }}>
                      {sc.benchmark.label?.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: mono, marginBottom: 6 }}>
                      {pctVal}
                    </div>
                    {/* Bar */}
                    <div style={{ background: C.surface, borderRadius: 3, height: 4, marginBottom: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: color, width: `${barPct}%`, borderRadius: 3, transition: "width .6s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: mono,
                        background: `${color}15`, padding: "2px 5px", borderRadius: 3 }}>
                        {sc.score.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: mono }}>goal {goodVal}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Campaign breakdown */}
          {result.campaignMetrics?.length > 1 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
                BY CAMPAIGN
              </div>
              <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "8px 16px",
                  borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                  {["Campaign", "Open", "Reply", "Interested", "Meetings"].map(h => (
                    <div key={h} style={{ fontSize: 9, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5 }}>{h}</div>
                  ))}
                </div>
                {result.campaignMetrics.map((cm, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                    padding: "10px 16px", borderBottom: i < result.campaignMetrics.length - 1 ? `1px solid ${C.border}` : "none",
                    alignItems: "center" }}>
                    <div style={{ fontSize: 12.5, color: C.text, fontWeight: 500, fontFamily: head,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                      {cm.name}
                    </div>
                    {["openRate", "replyRate", "interestedRate", "meetingRate"].map(k => (
                      <div key={k} style={{ fontSize: 12, fontFamily: mono, color: C.textSoft }}>
                        {pct(cm.metrics[k] || 0)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insights */}
          {result.topInsights?.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
                KEY INSIGHTS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.topInsights.map(ins => {
                  const ic = INSIGHT_COLORS[ins.type] || INSIGHT_COLORS.opportunity;
                  return (
                    <div key={ins.id} style={{ background: ic.bg, border: `1px solid ${ic.border}`, borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ic.text, fontFamily: mono,
                          background: "rgba(255,255,255,0.5)", padding: "2px 6px", borderRadius: 4 }}>
                          {ins.type.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: head }}>{ins.title}</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.5 }}>{ins.body}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Variant recommendations */}
          {variants.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
                VARIANT RECOMMENDATIONS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {variants.map(v => (
                  <div key={v.id} style={{ background: v.isWinner ? C.greenLo : C.canvas,
                    border: `1px solid ${v.isWinner ? C.greenBorder : C.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.accentHi, fontFamily: mono,
                            background: C.accentLo, padding: "2px 6px", borderRadius: 4 }}>
                            {v.metric?.toUpperCase().replace(/_/g, " ")}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: EFFORT_COLORS[v.effort],
                            fontFamily: mono, background: `${EFFORT_COLORS[v.effort]}15`,
                            padding: "2px 6px", borderRadius: 4 }}>
                            {v.effort?.toUpperCase()} EFFORT
                          </span>
                          {v.isWinner && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.green, fontFamily: mono,
                              background: C.greenLo, padding: "2px 6px", borderRadius: 4 }}>
                              ★ WINNER
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: C.text, fontStyle: "italic", marginBottom: 6, lineHeight: 1.5 }}>
                          "{v.hypothesis}"
                        </div>
                        <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5, marginBottom: 6 }}>
                          <strong style={{ color: C.text }}>Change:</strong> {v.change}
                        </div>
                        <div style={{ fontSize: 12, color: C.green, fontFamily: mono }}>Expected: {v.expectedLift}</div>
                      </div>
                      {!v.isWinner && (
                        <button onClick={() => markWinner(v)} disabled={savingWinner === v.id}
                          style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 7,
                            border: `1px solid ${C.greenBorder}`, background: C.greenLo,
                            color: C.green, fontSize: 11, fontWeight: 700, fontFamily: head,
                            cursor: savingWinner === v.id ? "default" : "pointer", whiteSpace: "nowrap" }}>
                          {savingWinner === v.id ? "Saving…" : "Mark Winner"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload history */}
      {history.length > 0 && !result && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
            RECENT UPLOADS
          </div>
          <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {history.map((h, i) => {
              const date = new Date(h.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const grade = "—";
              return (
                <div key={h.id} style={{ padding: "11px 16px", borderBottom: i < history.length - 1 ? `1px solid ${C.border}` : "none",
                  display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 13, color: C.text, fontFamily: head, flex: 1 }}>{h.filename}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>{date}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>
                    {h.parsed?.rowCount?.toLocaleString() || "—"} rows
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
