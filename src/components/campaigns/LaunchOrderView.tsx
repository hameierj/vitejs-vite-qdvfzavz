import { useRef } from "react";

// ─── Per-channel launch-order view ──────────────────────────────────────────────
// Email and LinkedIn campaigns are launched under different constraints, so this
// view ranks the persona×product *segments* that have campaigns of one channel:
//   • LinkedIn — capacity-bound priority. Users have only K LinkedIn accounts, so
//     the top K segments "run now" and the rest queue. Reorder to choose which.
//   • Email — a launch sequence (1,2,3…). Ramp in this order as deliverability allows.
// Order seeds from the ICP weighted score (best-fit first) and is overridable by
// drag / up-down; the explicit order persists in companyData._launchOrder[channel].

const C = {
  canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7", borderHi: "#D8DEE9",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7", faint: "#F3F4FB",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", red: "#FF6B6B", blue: "#54A0FF",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', 'Source Sans 3', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

const STATUS_META: Record<string, { label: string; color: string }> = {
  planned:   { label: "Planning",  color: "#8E94A7" },
  active:    { label: "Live",      color: "#00D68F" },
  reviewing: { label: "Reviewing", color: "#FFC048" },
  completed: { label: "Completed", color: "#6C5CE7" },
  paused:    { label: "Paused",    color: "#FF6B6B" },
};
// Pick the "furthest along" status across a segment's campaigns for the row badge.
const STATUS_RANK = ["planned", "paused", "active", "reviewing", "completed"];

const RECO_META: Record<string, { label: string; color: string }> = {
  launch_first:  { label: "Launch first",  color: "#00D68F" },
  launch_second: { label: "Launch second", color: "#6C5CE7" },
  test_small:    { label: "Test small",    color: "#FFC048" },
  defer:         { label: "Defer",         color: "#8E94A7" },
  skip:          { label: "Skip",          color: "#FF6B6B" },
};

interface Props {
  channel: "email" | "linkedin";
  campaigns: any[];
  personas: any[];
  products: any[];
  companyData: any;
  capacity?: { linkedinAccounts?: number; mailboxCount?: number; domainCount?: number };
  onReorder: (channel: "email" | "linkedin", orderMap: Record<string, number>) => void;
  onViewCampaign: (campaignId: string) => void;
}

interface Segment {
  segKey: string;
  personaId: string;
  productId: string;
  persona: any;
  product: any;
  label: string;
  items: any[];
  score: number;
  recommendation: string;
}

export function LaunchOrderView({ channel, campaigns, personas, products, companyData, capacity, onReorder, onViewCampaign }: Props) {
  const isLinkedIn = channel === "linkedin";
  const dragIndexRef = useRef<number | null>(null);

  // ICP score lookup (seeds the default order, shown as context on each row).
  const scoreRows: any[] = companyData?._icpScoringResult?.icps || [];
  const scoreById = new Map<string, any>();
  for (const r of scoreRows) if (r?.icpId) scoreById.set(r.icpId, r);

  // Build one segment per persona×product combo that has ≥1 campaign of this channel.
  const segMap = new Map<string, Segment>();
  for (const c of campaigns) {
    if (c.channel !== channel) continue;
    const personaId = (c.personaIds || [])[0] || "";
    const productId = c.productId || "";
    const segKey = `${personaId}__${productId}`;
    if (!segMap.has(segKey)) {
      const persona = personas.find((p: any) => p.id === personaId);
      const product = products.find((p: any) => p.id === productId);
      const sc = scoreById.get(personaId);
      segMap.set(segKey, {
        segKey, personaId, productId, persona, product,
        label: `${persona ? persona.name : "Unassigned"} × ${product ? product.name : "No product"}`,
        items: [],
        score: Number(sc?.weightedScore) || 0,
        recommendation: sc?.recommendation || "",
      });
    }
    segMap.get(segKey)!.items.push(c);
  }
  const segments = Array.from(segMap.values());

  // Derived order: explicitly-ranked segments first (by their stored number), then
  // any unranked appended by descending ICP score. Mutations go through onReorder.
  const lo: Record<string, number> = companyData?._launchOrder?.[channel] || {};
  const ranked = segments.filter((s) => lo[s.segKey] != null).sort((a, b) => lo[a.segKey] - lo[b.segKey]);
  const unranked = segments.filter((s) => lo[s.segKey] == null).sort((a, b) => (b.score - a.score) || a.label.localeCompare(b.label));
  const ordered = [...ranked, ...unranked];

  const commit = (segKeys: string[]) => onReorder(channel, Object.fromEntries(segKeys.map((k, i) => [k, i + 1])));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ordered.length || from === to) return;
    const keys = ordered.map((s) => s.segKey);
    const [k] = keys.splice(from, 1);
    keys.splice(to, 0, k);
    commit(keys);
  };

  // Capacity: LinkedIn has a hard concurrent cut (account count); email is a soft ramp.
  const liAccounts = Number(capacity?.linkedinAccounts) || Number(companyData?.linkedinAccounts) || Number(companyData?._launchPlan?.linkedinAccounts) || 2;
  const mailboxes = Number(capacity?.mailboxCount) || 0;
  const domains = Number(capacity?.domainCount) || 0;

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (ordered.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, fontFamily: body }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>{isLinkedIn ? "in" : "✉"}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>
            No {isLinkedIn ? "LinkedIn" : "email"} campaigns yet
          </div>
          <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6 }}>
            Generate {isLinkedIn ? "LinkedIn" : "email"} campaigns in the guided onboarding (Step 5) or from the Matrix tab. They'll appear here ranked by ICP fit so you can set the launch order.
          </div>
        </div>
      </div>
    );
  }

  const headerText = isLinkedIn
    ? `${liAccounts} LinkedIn account${liAccounts !== 1 ? "s" : ""} — the top ${liAccounts} run concurrently. Reorder to choose which segments go first; the rest queue.`
    : `Launch in this order, ramping as deliverability allows${mailboxes ? ` · ${mailboxes} mailbox${mailboxes !== 1 ? "es" : ""}${domains ? ` across ${domains} domain${domains !== 1 ? "s" : ""}` : ""}` : ""}.`;

  return (
    <div style={{ padding: "4px 32px 28px", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Capacity header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: C.canvas, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: isLinkedIn ? C.blue : C.accent, textTransform: "uppercase", letterSpacing: .5 }}>
            {isLinkedIn ? "LinkedIn priority" : "Email launch order"}
          </span>
          <span style={{ fontSize: 12, fontFamily: body, color: C.textSoft }}>{headerText}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: body, color: C.muted }}>{ordered.length} segment{ordered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Ranked list */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "8px 8px 12px" }}>
          {ordered.map((seg, i) => {
            const runningNow = isLinkedIn && i < liAccounts;
            const showCutline = isLinkedIn && i === liAccounts && ordered.length > liAccounts;
            const maxSteps = seg.items.reduce((m: number, c: any) => Math.max(m, c.sequence?.length || 0), 0);
            const statusId = seg.items.map((c: any) => c.status).sort((a: string, b: string) => STATUS_RANK.indexOf(b) - STATUS_RANK.indexOf(a))[0] || "planned";
            const st = STATUS_META[statusId] || STATUS_META.planned;
            const reco = RECO_META[seg.recommendation];
            return (
              <div key={seg.segKey}>
                {showCutline && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 4px" }}>
                    <div style={{ flex: 1, height: 1, background: C.borderHi }} />
                    <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .5 }}>Queued · no free account</span>
                    <div style={{ flex: 1, height: 1, background: C.borderHi }} />
                  </div>
                )}
                <div
                  draggable
                  onDragStart={() => { dragIndexRef.current = i; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndexRef.current != null) move(dragIndexRef.current, i); dragIndexRef.current = null; }}
                  onClick={() => onViewCampaign(seg.items[0]?.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", margin: "3px 4px", borderRadius: 9,
                    border: `1px solid ${runningNow ? C.greenBorder : C.border}`,
                    background: runningNow ? C.greenLo : C.canvas,
                    cursor: "pointer", transition: "background .12s, border-color .12s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.surface; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = runningNow ? C.greenLo : C.canvas; }}>
                  {/* drag handle */}
                  <span title="Drag to reorder" style={{ color: C.muted, fontSize: 14, cursor: "grab", flexShrink: 0, lineHeight: 1 }}>⠿</span>
                  {/* rank badge */}
                  <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: runningNow ? C.green : C.accentMid, color: runningNow ? "#fff" : C.accent, fontSize: 12, fontFamily: mono, fontWeight: 700 }}>
                    {i + 1}
                  </span>
                  {/* label + variants */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: head, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {seg.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontFamily: mono, color: C.textSoft }}>
                        {seg.items.length} {isLinkedIn ? `LinkedIn sequence${seg.items.length !== 1 ? "s" : ""}` : `email campaign${seg.items.length !== 1 ? "s" : ""}`}
                        {maxSteps ? ` · ${maxSteps} steps` : ""}
                      </span>
                      {!isLinkedIn && seg.items.map((c: any) => (
                        <button key={c.id} onClick={(e) => { e.stopPropagation(); onViewCampaign(c.id); }}
                          title={c.name || "Campaign"}
                          style={{ maxWidth: 180, padding: "2px 8px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.faint, color: C.textSoft,
                            fontSize: 10.5, fontFamily: body, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name || "Untitled"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* ICP reco chip */}
                  {reco && (
                    <span style={{ flexShrink: 0, fontSize: 10, fontFamily: mono, fontWeight: 600, color: reco.color, background: `${reco.color}14`, padding: "2px 8px", borderRadius: 20 }}>
                      {reco.label}{seg.score ? ` · ${seg.score.toFixed(1)}` : ""}
                    </span>
                  )}
                  {/* status */}
                  <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 78 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />
                    <span style={{ fontSize: 11, fontFamily: body, fontWeight: 600, color: st.color }}>{st.label}</span>
                  </span>
                  {/* up / down */}
                  <span style={{ flexShrink: 0, display: "inline-flex", flexDirection: "column", gap: 1 }}>
                    <button onClick={(e) => { e.stopPropagation(); move(i, i - 1); }} disabled={i === 0} title="Move up"
                      style={{ width: 20, height: 16, border: "none", background: "transparent", color: i === 0 ? C.border : C.muted, cursor: i === 0 ? "default" : "pointer", fontSize: 10, lineHeight: 1, padding: 0 }}>▲</button>
                    <button onClick={(e) => { e.stopPropagation(); move(i, i + 1); }} disabled={i === ordered.length - 1} title="Move down"
                      style={{ width: 20, height: 16, border: "none", background: "transparent", color: i === ordered.length - 1 ? C.border : C.muted, cursor: i === ordered.length - 1 ? "default" : "pointer", fontSize: 10, lineHeight: 1, padding: 0 }}>▼</button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
