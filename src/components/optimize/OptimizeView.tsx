import { useState } from "react";

// Flow 3 — ongoing auto-optimization loop. Evaluate performance → generate a
// challenger variant → test → identify winner → ONE-TAP promote winner to
// baseline → repeat. Underperformers can be killed and replaced from the
// branching ICP tree. Human-in-the-loop: promotion requires a tap.

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#B45309", amberLo: "#B453090F", red: "#FF6B6B", redLo: "#FF6B6B12",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

interface Props {
  campaigns: any[];
  companyData: any;
  icps: any[];
  onGenerateChallenger: (campaignId: string) => Promise<void>;
  onPromoteWinner: (campaignId: string, variantId: string) => void;
  onKeepBaseline: (campaignId: string, variantId: string) => void;
  onKillReplace: (campaignId: string) => void;
  onNavigate: (view: string) => void;
}

type Verdict = "winning" | "onTrack" | "watch" | "underperforming" | "needsData";

function evaluate(c: any): { verdict: Verdict; replyRate: number | null } {
  const m = c.performance?.metrics;
  if (!m || !m.sent) return { verdict: "needsData", replyRate: null };
  const replies = m.allReplies ?? m.humanReplies ?? 0;
  const rr = Math.round((replies / m.sent) * 1000) / 10;
  const b = c.benchmarks?.replyRate;
  const good = b?.good ?? 5, warn = b?.warning ?? 3, action = b?.action ?? 1.5;
  let verdict: Verdict = "underperforming";
  if (rr >= good) verdict = "winning"; else if (rr >= warn) verdict = "onTrack"; else if (rr >= action) verdict = "watch";
  return { verdict, replyRate: rr };
}

const VERDICT_META: Record<Verdict, { label: string; color: string; bg: string }> = {
  winning: { label: "WINNING", color: C.green, bg: C.greenLo },
  onTrack: { label: "ON TRACK", color: C.green, bg: C.greenLo },
  watch: { label: "WATCH", color: C.amber, bg: C.amberLo },
  underperforming: { label: "UNDERPERFORMING", color: C.red, bg: C.redLo },
  needsData: { label: "NEEDS DATA", color: C.muted, bg: C.faint },
};

export function OptimizeView({ campaigns, companyData, icps, onGenerateChallenger, onPromoteWinner, onKeepBaseline, onKillReplace, onNavigate }: Props) {
  const [busyId, setBusyId] = useState<string>("");
  const list = (campaigns || []).filter((c: any) => Array.isArray(c.sequence) && c.sequence.length && c.status !== "completed");
  // Order: underperforming first, then watch, then the rest.
  const order: Record<Verdict, number> = { underperforming: 0, watch: 1, needsData: 2, onTrack: 3, winning: 4 };
  const ranked = list.map((c: any) => ({ c, ...evaluate(c) })).sort((a, b) => order[a.verdict] - order[b.verdict]);

  const personaName = (c: any) => (icps || []).find((p: any) => (c.personaIds || []).includes(p.id))?.name || "";

  const gen = async (id: string) => { setBusyId(id); try { await onGenerateChallenger(id); } catch (e) { /* toast handled upstream */ } finally { setBusyId(""); } };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 64px", fontFamily: head }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8 }}>FLOW 3 · OPTIMIZATION</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Auto-Optimization Loop</h1>
        <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>Evaluate → generate a challenger → test → promote the winner to baseline (one tap). Underperformers get retired and replaced from your ICP tree.</p>
      </div>

      {ranked.length === 0 && (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, textAlign: "center" as const }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>No campaigns to optimize yet</div>
          <p style={{ fontSize: 13, color: C.textSoft, margin: "0 auto 16px", maxWidth: 420, lineHeight: 1.6 }}>Activate campaigns from the Launch board first. Once they report metrics, winners and underperformers surface here.</p>
          <button onClick={() => onNavigate("launch")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, fontFamily: head, cursor: "pointer" }}>Go to Launch →</button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
        {ranked.map(({ c, verdict, replyRate }) => {
          const meta = VERDICT_META[verdict];
          const liveVariant = (c.sequence?.[0]?.variants || [])[0];
          const liveIter = (c.iterations || []).find((it: any) => it.status === "live");
          const isBusy = busyId === c.id;
          const promotedCount = (c.iterations || []).filter((it: any) => it.outcome === "winner").length;
          return (
            <div key={c.id} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{c.channel} · {personaName(c)}{promotedCount > 0 ? ` · ${promotedCount} winner${promotedCount === 1 ? "" : "s"} promoted` : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {replyRate !== null && <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 700, color: meta.color }}>{replyRate}% reply</span>}
                  <span style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 700, color: meta.color, background: meta.bg, padding: "3px 8px", borderRadius: 4 }}>{meta.label}</span>
                </div>
              </div>

              {/* Live test (baseline vs challenger) */}
              {liveVariant ? (
                <div style={{ marginTop: 12, padding: "10px 12px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10.5, fontFamily: mono, fontWeight: 700, color: C.accent, marginBottom: 8 }}>LIVE TEST · {liveIter?.variable || "variant"}{liveVariant.angle ? ` — ${liveVariant.angle}` : ""}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <VariantCol label="Baseline" subject={c.sequence[0].subject} body={c.sequence[0].body} channel={c.channel} />
                    <VariantCol label="Challenger" subject={liveVariant.subject} body={liveVariant.body} channel={c.channel} accent />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => onPromoteWinner(c.id, liveVariant.id)} style={btn(C.green)}>Promote challenger ✓</button>
                    <button onClick={() => onKeepBaseline(c.id, liveVariant.id)} style={ghost()}>Keep baseline</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => gen(c.id)} disabled={isBusy} style={btn(isBusy ? C.muted : C.accent)}>{isBusy ? "Generating…" : "Generate challenger"}</button>
                  {verdict === "underperforming" && <button onClick={() => onKillReplace(c.id)} style={ghost(C.red)}>Kill &amp; replace</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VariantCol({ label, subject, body, channel, accent }: { label: string; subject?: string; body?: string; channel: string; accent?: boolean }) {
  return (
    <div style={{ borderLeft: `2px solid ${accent ? C.accent : C.border}`, paddingLeft: 8 }}>
      <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: accent ? C.accent : C.muted, marginBottom: 4 }}>{label}</div>
      {channel === "email" && <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text, marginBottom: 3 }}>{subject || "(no subject)"}</div>}
      <div style={{ fontSize: 11.5, color: C.textSoft, lineHeight: 1.5, whiteSpace: "pre-wrap" as const, maxHeight: 120, overflow: "hidden" }}>{(body || "").slice(0, 280)}</div>
    </div>
  );
}
function btn(bg: string): any {
  return { padding: "7px 14px", borderRadius: 7, border: "none", background: bg, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: head, cursor: "pointer" };
}
function ghost(color = C.textSoft): any {
  return { padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.canvas, color, fontSize: 12, fontWeight: 700, fontFamily: head, cursor: "pointer" };
}
