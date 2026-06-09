import { useState, useMemo } from "react";
import { callClaude, parseJSON } from "../../lib/callClaude";
import { ElapsedTimer } from "./ElapsedTimer";
import { ForceGraph, type FNode, type FLink } from "../stages/ForceGraph";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#FDCB6E", amberLo: "#FDCB6E0F", amberBorder: "#FDCB6E40",
  red: "#E17055", redLo: "#E170550F",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// Static scoring rubric + output schema — sent as a cached system prompt so
// re-scoring reuses the prefix instead of re-sending it each run.
const SCORING_SYSTEM = `You are a B2B go-to-market expert. Score each ICP provided in the user message for a B2B outreach program.

Score each ICP on 5 dimensions (1-10 each). Apply these weights:
- marketSize (20%): TAM segment size, ease of list-building, intent signal availability
- productFit (25%): How well the value proposition maps to this ICP's pains and gains
- proof (20%): Whether existing case studies / proof points match this ICP's industry/size
- accessibility (20%): LinkedIn activity, best channel signals, trigger event detectability
- competitive (15%): Strength of competitive displacement messaging for this ICP

Return only valid JSON in this exact shape:
{
  "generatedAt": "<ISO timestamp>",
  "scores": [
    {
      "icpId": "<id>",
      "icpName": "<name>",
      "dimensions": {
        "marketSize":    { "score": 0-10, "rationale": "one sentence" },
        "productFit":    { "score": 0-10, "rationale": "one sentence" },
        "proof":         { "score": 0-10, "rationale": "one sentence" },
        "accessibility": { "score": 0-10, "rationale": "one sentence" },
        "competitive":   { "score": 0-10, "rationale": "one sentence" }
      },
      "weightedScore": <0-10 float, 2 decimals>,
      "rank": <1-N>,
      "recommendation": "launch_first|launch_second|test_small|defer|skip",
      "topStrengths": ["strength1", "strength2"],
      "topGaps": ["gap1", "gap2"],
      "suggestedAngle": "One sentence describing the best outbound angle for this ICP"
    }
  ]
}`;

interface Props {
  ws: { companyData: any; icps: any[]; products: any[]; icpTree: any };
  scoringResult: any | null;
  onSave: (updates: { companyData: any }) => void;
  onPlanCampaign: (icp: any, scoreRow: any) => void;
}

const DIMENSIONS = [
  { key: "marketSize",   label: "Market Size & Accessibility", weight: 0.20 },
  { key: "productFit",   label: "Product-Market Fit",          weight: 0.25 },
  { key: "proof",        label: "Proof Availability",           weight: 0.20 },
  { key: "accessibility",label: "Outreach Accessibility",       weight: 0.20 },
  { key: "competitive",  label: "Competitive Advantage",        weight: 0.15 },
] as const;

type DimensionKey = typeof DIMENSIONS[number]["key"];

interface ScoreRow {
  icpId: string;
  icpName: string;
  dimensions: Record<DimensionKey, { score: number; rationale: string }>;
  weightedScore: number;
  rank: number;
  recommendation: "launch_first" | "launch_second" | "test_small" | "defer" | "skip";
  topStrengths: string[];
  topGaps: string[];
  suggestedAngle: string;
}

function rec(r: ScoreRow["recommendation"]): { label: string; color: string; bg: string } {
  switch (r) {
    case "launch_first":  return { label: "Launch First",  color: C.green,  bg: C.greenLo };
    case "launch_second": return { label: "Launch Second", color: C.accent, bg: C.accentLo };
    case "test_small":    return { label: "Test Small",    color: C.amber,  bg: C.amberLo };
    case "defer":         return { label: "Defer",         color: C.muted,  bg: C.faint };
    case "skip":          return { label: "Skip",          color: C.red,    bg: C.redLo };
  }
}

function scoreColor(s: number): string {
  if (s >= 7.5) return C.green;
  if (s >= 5)   return C.amber;
  return C.red;
}

// The TAM gate (tam-icp-run) and this component's own re-score write two
// different shapes into companyData._icpScoringResult:
//   gate:   { icps:  [{ icpId, icpName, dimensions: [{key,label,weight,score,rationale}], ... }] }
//           with dimension keys market_size | pmf | proof | outreach | advantage
//   re-score: { scores: [{ icpId, icpName, dimensions: { marketSize: {...}, ... }, ... }] }
// Normalize both into the ScoreRow shape this UI renders so "View scoring"
// shows the already-generated result instead of an empty "Score ICPs" state.
const GATE_DIM_KEY: Record<string, DimensionKey> = {
  market_size: "marketSize", pmf: "productFit", proof: "proof", outreach: "accessibility", advantage: "competitive",
};
function normalizeScores(sr: any): ScoreRow[] {
  if (!sr) return [];
  if (Array.isArray(sr.scores) && sr.scores.length) return sr.scores as ScoreRow[];
  const rows = Array.isArray(sr.icps) ? sr.icps : [];
  return rows.map((r: any): ScoreRow => {
    const dims = {} as Record<DimensionKey, { score: number; rationale: string }>;
    if (Array.isArray(r.dimensions)) {
      for (const d of r.dimensions) {
        const k = GATE_DIM_KEY[d.key] || (d.key as DimensionKey);
        dims[k] = { score: Number(d.score) || 0, rationale: String(d.rationale || "") };
      }
    } else if (r.dimensions && typeof r.dimensions === "object") {
      for (const [rawKey, v] of Object.entries<any>(r.dimensions)) {
        const k = GATE_DIM_KEY[rawKey] || (rawKey as DimensionKey);
        dims[k] = { score: Number(v?.score ?? v) || 0, rationale: String(v?.rationale || "") };
      }
    }
    return {
      icpId: r.icpId || r.id || r.icpName,
      icpName: r.icpName || r.name || "ICP",
      dimensions: dims,
      weightedScore: Number(r.weightedScore) || 0,
      rank: Number(r.rank) || 0,
      recommendation: r.recommendation || "test_small",
      topStrengths: Array.isArray(r.topStrengths) ? r.topStrengths : [],
      topGaps: Array.isArray(r.topGaps) ? r.topGaps : [],
      suggestedAngle: r.suggestedAngle || "",
    };
  });
}

const GRAPH_COLORS = { company: C.accent, product: C.green, icp: C.amber };
const GRAPH_LEGEND = [
  { label: "Company", color: GRAPH_COLORS.company },
  { label: "Product / service", color: GRAPH_COLORS.product },
  { label: "ICP", color: GRAPH_COLORS.icp },
];

// Flatten the TAM tree into a clean hierarchy: Company → Products/Services →
// ICPs. Market segments are company-level TAM context (the AI doesn't map them
// to specific products), so they're surfaced as a summary above the graph
// rather than as disconnected nodes. Cross-product ICPs (deduped by name) link
// to every product they fit, so the result is still a graph, not a strict tree.
// ICP node ids reuse the scoring row id so selecting one opens its scorecard.
function buildTamGraph(tamTree: any, scores: ScoreRow[], companyName: string): { nodes: FNode[]; links: FLink[] } {
  const nodes: FNode[] = [];
  const links: FLink[] = [];
  const ROOT = "company";
  nodes.push({ id: ROOT, type: "company", label: companyName || "Company", color: GRAPH_COLORS.company, r: 18, depth: 0 });

  const scoreByName = new Map(scores.map(s => [String(s.icpName || "").trim().toLowerCase(), s]));

  const icpIdByName = new Map<string, string>();
  let synth = 0;
  (tamTree?.perProduct || []).forEach((branch: any, pi: number) => {
    const pid = `prod-${pi}`;
    nodes.push({ id: pid, type: "product", label: branch.productName || `Product ${pi + 1}`, color: GRAPH_COLORS.product, r: 13, depth: 1 });
    links.push({ source: ROOT, target: pid });
    (branch.icps || []).forEach((icp: any) => {
      const key = String(icp.name || "").trim().toLowerCase();
      let id = icpIdByName.get(key);
      if (!id) {
        const sc = scoreByName.get(key);
        id = sc?.icpId || `icp-${synth++}`;
        icpIdByName.set(key, id);
        // ICPs are always the ICP color (amber) so they're distinct from green
        // products. Score lives in the matrix view, not on the node.
        nodes.push({ id, type: "icp", label: icp.name || "ICP", color: GRAPH_COLORS.icp, r: 9, depth: 2 });
      }
      links.push({ source: pid, target: id });
    });
  });

  // Fallback: no tamTree branches — connect scored ICPs straight to the company.
  if (nodes.length === 1 && scores.length) {
    for (const s of scores) {
      nodes.push({ id: s.icpId, type: "icp", label: s.icpName, color: GRAPH_COLORS.icp, r: 9, depth: 1 });
      links.push({ source: ROOT, target: s.icpId });
    }
  }
  return { nodes, links };
}

export function ICPScoringMatrix({ ws, scoringResult, onSave, onPlanCampaign }: Props) {
  const [scoring, setScoring] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [gview, setGview] = useState<"matrix" | "graph">("graph");

  const icpTree = ws?.icpTree;
  const icps: any[] = ws?.icps || [];
  const companyData: any = ws?.companyData || {};

  const scores: ScoreRow[] = useMemo(() => normalizeScores(scoringResult), [scoringResult]);
  const tamTree = companyData?._tamTree || null;

  const graph = useMemo(
    () => buildTamGraph(tamTree, scores, companyData?.co_name || ""),
    [tamTree, scores, companyData?.co_name]
  );

  const runScoring = async () => {
    setScoring(true);
    setLog(["Building ICP profiles..."]);

    const addLog = (m: string) => setLog(p => [...p, m]);

    try {
      // Build ICP context
      const icpContext = icps.slice(0, 8).map(icp => {
        const d = icp.data || {};
        return {
          id: icp.id,
          name: icp.name,
          industries: d.industries || "",
          companySizes: d.co_sizes || "",
          buyerTitles: d.buyer || "",
          pain: d.pain1 || "",
          gains: d.gains || "",
          triggerEvents: d.triggers || "",
          whyClientWins: d.why_client_wins || "",
          proofAvailable: d.icp_proof || "",
          linkedinActivity: d.linkedin_activity || "",
          bestChannel: d.best_channel || "",
          competitiveAdvantage: d.displacement_messaging || "",
        };
      });

      const treeIcps = icpTree?.icps?.slice(0, 8).map((icp: any) => ({
        id: icp.id,
        name: icp.name,
        firmographics: icp.firmographics,
        pain_profile: icp.pain_profile,
        revenue_potential: icp.revenue_potential,
        personas: (icp.personas || []).map((p: any) => ({
          title: p.title,
          department: p.department,
          goals: p.goals,
          fears: p.fears,
        })),
      })) || [];

      const coData = {
        pitch: companyData.co_pitch || "",
        proof: companyData.co_proof || "",
        product: companyData.co_product || "",
        valueProposition: companyData.co_diff || "",
        competitors: companyData.co_competitors || "",
      };

      addLog("Scoring ICPs with Claude...");

      // Static rubric + schema (identical across runs) goes in the cached
      // system prompt; only the company/ICP data varies in the user message.
      const prompt = `COMPANY:
${JSON.stringify(coData, null, 2)}

ICP PROFILES (from company data):
${JSON.stringify(icpContext, null, 2)}

ICP TREE (structural hierarchy):
${JSON.stringify(treeIcps, null, 2)}

Score ALL ICPs provided.`;

      const raw = await callClaude(prompt, SCORING_SYSTEM, 4000, "sonnet", { cacheSystem: true });
      const result = parseJSON(raw, { generatedAt: new Date().toISOString(), scores: [] });

      // Sort by weighted score and assign ranks
      if (result.scores?.length) {
        result.scores.sort((a: ScoreRow, b: ScoreRow) => b.weightedScore - a.weightedScore);
        result.scores.forEach((s: ScoreRow, i: number) => { s.rank = i + 1; });
      }

      addLog(`Scored ${result.scores?.length || 0} ICPs`);

      onSave({
        companyData: {
          ...companyData,
          _icpScoringResult: result,
        },
      });

    } catch (e: any) {
      addLog(`Error: ${e.message || e}`);
    } finally {
      setScoring(false);
    }
  };

  if (!icpTree && icps.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: "80px auto", padding: 32, textAlign: "center" as const, fontFamily: head }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🌳</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8 }}>No ICP Tree yet</div>
        <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.7 }}>
          Generate the ICP Tree (Step 6) before scoring. The tree provides the detailed persona and firmographic data needed to score each ICP accurately.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 48px", fontFamily: head }}>
      <ElapsedTimer running={scoring} label="SCORING" />
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>
          STEP 3 · TAM TREE → ICPs
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>ICP Scoring Matrix</h1>
            <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
              AI scores each ICP on 5 dimensions to identify which to launch first, test small, or defer.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {scores.length > 0 && !scoring && (
              <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                {(["graph", "matrix"] as const).map(v => (
                  <button key={v} onClick={() => setGview(v)}
                    style={{ padding: "8px 14px", border: "none", background: gview === v ? `${C.accent}22` : "transparent", color: gview === v ? C.accent : C.textSoft, fontSize: 12.5, fontWeight: gview === v ? 700 : 500, cursor: "pointer", fontFamily: head }}>
                    {v === "graph" ? "◉ Graph" : "≣ Matrix"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={runScoring} disabled={scoring}
              style={{ padding: "10px 20px", borderRadius: 9, border: "none",
                background: scoring ? C.faint : C.accent, color: scoring ? C.muted : "#fff",
                fontSize: 13, fontWeight: 700, fontFamily: head, cursor: scoring ? "wait" : "pointer",
                boxShadow: scoring ? "none" : `0 2px 8px ${C.accent}30` }}>
              {scoring ? "Scoring…" : scores.length > 0 ? "Re-Score" : "Score ICPs"}
            </button>
          </div>
        </div>
      </div>

      {/* Progress log */}
      {scoring && (
        <div style={{ background: C.canvas, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.accent}`, borderTopColor: "transparent",
              animation: "spin .8s linear infinite" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Scoring in progress...</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textSoft, lineHeight: 1.8 }}>
            {log.map((l, i) => <div key={i}>{i === log.length - 1 ? "→ " : "✓ "}{l}</div>)}
          </div>
        </div>
      )}

      {/* Graph view — Company → Products → ICPs hierarchy */}
      {scores.length > 0 && !scoring && gview === "graph" && (
        <div>
          {(tamTree?.companyLevel?.tamSummary || (tamTree?.companyLevel?.segments || []).length > 0) && (
            <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
              {tamTree?.companyLevel?.tamSummary && (
                <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.6, marginBottom: (tamTree?.companyLevel?.segments || []).length ? 8 : 0 }}>{tamTree.companyLevel.tamSummary}</div>
              )}
              {(tamTree?.companyLevel?.segments || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>Market segments</span>
                  {(tamTree.companyLevel.segments as any[]).map((s, i) => (
                    <span key={i} title={s.sizeEstimate || ""} style={{ fontSize: 11.5, fontFamily: head, color: C.text, background: C.faint, border: `1px solid ${C.border}`, borderRadius: 20, padding: "2px 10px" }}>
                      {s.name}{s.sizeEstimate ? ` · ${s.sizeEstimate}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ height: "70vh", minHeight: 420, display: "flex", flexDirection: "column", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.bg }}>
          <ForceGraph
            nodes={graph.nodes}
            links={graph.links}
            selectedId={expanded}
            legend={GRAPH_LEGEND}
            hint="scroll to zoom · drag node to move · drag canvas to pan · click an ICP to open its scorecard"
            onSelect={(n) => {
              // Clicking an ICP node jumps to the matrix with its row expanded.
              if (n.type === "icp") { setExpanded(n.id); setGview("matrix"); }
            }}
            theme={{ bg: C.bg, canvas: C.canvas, text: C.text, muted: C.muted, borderHi: C.borderHi, border: C.border, accent: C.accent }}
          />
          </div>
        </div>
      )}

      {/* Scores table */}
      {scores.length > 0 && !scoring && gview === "matrix" && (
        <div>
          <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr repeat(5, 80px) 100px 120px", gap: 0,
              background: C.faint, borderBottom: `1px solid ${C.border}`,
              padding: "10px 16px", fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
              <div>#</div>
              <div>ICP</div>
              {DIMENSIONS.map(d => (
                <div key={d.key} style={{ textAlign: "center" as const }}>{d.label.split(" ")[0].slice(0, 6)}</div>
              ))}
              <div style={{ textAlign: "center" as const }}>Score</div>
              <div style={{ textAlign: "right" as const }}>Action</div>
            </div>

            {scores.map((row, idx) => {
              const isExp = expanded === row.icpId;
              const r = rec(row.recommendation);

              return (
                <div key={row.icpId}>
                  {/* Row */}
                  <div onClick={() => setExpanded(isExp ? null : row.icpId)}
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr repeat(5, 80px) 100px 120px", gap: 0,
                      padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer", background: isExp ? C.accentLo : "transparent",
                      transition: "background .2s",
                    }}
                    onMouseEnter={e => { if (!isExp) (e.currentTarget as HTMLDivElement).style.background = C.faint; }}
                    onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>

                    {/* Rank */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 700, color: idx === 0 ? C.green : C.muted }}>
                        {idx === 0 ? "★" : row.rank}
                      </span>
                    </div>

                    {/* ICP name */}
                    <div style={{ display: "flex", flexDirection: "column" as const, justifyContent: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{row.icpName}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
                          background: r.bg, color: r.color }}>{r.label}</span>
                      </div>
                    </div>

                    {/* Dimension scores */}
                    {DIMENSIONS.map(d => {
                      const ds = row.dimensions?.[d.key];
                      const s = ds?.score || 0;
                      return (
                        <div key={d.key} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(s) }}>{s.toFixed(0)}</span>
                          <span style={{ fontSize: 10, color: C.muted }}>/10</span>
                        </div>
                      );
                    })}

                    {/* Weighted score */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 17, fontWeight: 800, color: scoreColor(row.weightedScore), fontFamily: mono }}>
                        {row.weightedScore.toFixed(1)}
                      </span>
                    </div>

                    {/* Action */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <button
                        onClick={e => { e.stopPropagation(); onPlanCampaign(icps.find(i => i.id === row.icpId) || { id: row.icpId, name: row.icpName }, row); }}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "none",
                          background: C.accent, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: head, cursor: "pointer" }}>
                        Plan
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ padding: "16px 56px 20px", borderBottom: `1px solid ${C.border}`, background: C.accentLo }}>
                      {/* Dimension breakdown */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.muted, marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Dimension Breakdown</div>
                        {DIMENSIONS.map(d => {
                          const ds = row.dimensions?.[d.key];
                          const s = ds?.score || 0;
                          return (
                            <div key={d.key} style={{ marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, width: 200, flexShrink: 0 }}>{d.label}</div>
                                <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${s * 10}%`, borderRadius: 3, background: scoreColor(s), transition: "width .4s" }} />
                                </div>
                                <div style={{ fontSize: 12, fontFamily: mono, fontWeight: 700, color: scoreColor(s), width: 32, textAlign: "right" as const }}>{s}</div>
                                <div style={{ fontSize: 10, color: C.muted, width: 28 }}>{(d.weight * 100).toFixed(0)}%</div>
                              </div>
                              {ds?.rationale && <div style={{ fontSize: 11.5, color: C.textSoft, paddingLeft: 208 }}>{ds.rationale}</div>}
                            </div>
                          );
                        })}
                      </div>

                      {/* Strengths + gaps */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
                        {(row.topStrengths || []).length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.green, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Strengths</div>
                            {row.topStrengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 3 }}>✓ {s}</div>)}
                          </div>
                        )}
                        {(row.topGaps || []).length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: C.amber, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Gaps to Address</div>
                            {row.topGaps.map((g, i) => <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 3 }}>△ {g}</div>)}
                          </div>
                        )}
                      </div>

                      {row.suggestedAngle && (
                        <div style={{ background: C.canvas, border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: 10.5, fontFamily: mono, fontWeight: 700, color: C.accent, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Suggested Outbound Angle</div>
                          <div style={{ fontSize: 13, color: C.text, fontStyle: "italic" as const }}>"{row.suggestedAngle}"</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 11.5, color: C.muted, textAlign: "center" as const }}>
            Click any row to expand dimension breakdown · Click Plan to generate email + LinkedIn sequences
          </div>
        </div>
      )}

      {/* Empty state */}
      {scores.length === 0 && !scoring && (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, textAlign: "center" as const }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⊛</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>Ready to score your ICPs</div>
          <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.7, maxWidth: 440, margin: "0 auto" }}>
            Click "Score ICPs" to evaluate all {icps.length || (icpTree?.icps?.length || 0)} ICPs across 5 dimensions and get a prioritized launch order.
          </div>
        </div>
      )}
    </div>
  );
}
