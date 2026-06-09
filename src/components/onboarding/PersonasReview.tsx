import { useState } from "react";
import { ICP_SECTIONS } from "../../lib/schemas";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SECTION_KEYS = Object.keys(ICP_SECTIONS);
// Map every persona field id → its section + human label, so we render whatever the
// ICP's data object actually contains (grouped), not only the fields we expect.
const FIELD_META: Record<string, { section: string; label: string; order: number }> = {};
SECTION_KEYS.forEach((sk) => {
  ICP_SECTIONS[sk as keyof typeof ICP_SECTIONS].fields.forEach((f: any, i: number) => {
    FIELD_META[f.id] = { section: ICP_SECTIONS[sk as keyof typeof ICP_SECTIONS].label, label: f.label, order: i };
  });
});
// Internal/meta keys that should never be shown as content.
const HIDDEN_KEYS = new Set(["id", "name", "color", "buyer"]);
const prettyKey = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()).trim();
const toText = (v: any): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("\n");
  if (typeof v === "object") return Object.entries(v).map(([k, val]) => `${prettyKey(k)}: ${val}`).join("\n");
  return String(v);
};
// Fields that are conceptually lists — render their values as bullets when splittable.
const LIST_FIELDS = new Set(["industries", "co_sizes", "tech", "keywords", "dream_accts", "intent_topics", "goals", "fears", "objections", "sub_personas", "pain2", "gains", "triggers", "buying_signals_direct", "buying_signals_indirect", "friction_points"]);
const toItems = (value: string, isList: boolean): string[] | null => {
  const byLine = value.split(/\n|(?:^|\s)(?:\d+[.)]\s)|\s*[•\-–]\s+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine.map((s) => s.replace(/^[•\-–]\s*/, ""));
  if (isList) {
    const parts: string[] = []; let depth = 0, cur = "";
    for (const ch of value) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    if (parts.length > 1) return parts;
  }
  return null;
};

interface Props {
  icps: any[];
  onRefine: () => void;
  onEdit: () => void;
  onRegenerate?: () => void;
  generating?: boolean;
  phase?: string;
  log?: string[];
}

// Read-only, in-flow review of every generated persona — the personas analogue of
// ProductsReview. Stays inside the guided-onboarding flow (the host renders a Back
// button) instead of dropping the user into the full ICP editor.
export function PersonasReview({ icps, onRefine, onEdit, onRegenerate, generating = false, phase = "", log = [] }: Props) {
  const list = icps || [];
  // Heuristic: a healthy persona has many filled fields. If a persona is just a name
  // + a couple of seed fields, enrichment fell back — warn and offer regenerate.
  const looksThin = list.length > 0 && list.some((ic: any) => {
    const d = ic.data || {};
    const keys = Object.keys(d).filter((k) => !k.startsWith("_") && d[k] != null && String(d[k]).trim() !== "");
    return keys.length <= 3;
  });
  const reasons = (log || []).filter((l) => l.includes("⚠️"));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 24px 64px", fontFamily: head }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>STEP 4</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Personas</h1>
          <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
            {list.length} persona{list.length !== 1 ? "s" : ""} built from your highest-scoring ICPs. Review before unlocking the next step.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {onRegenerate && (
            <button onClick={onRegenerate} disabled={generating}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: generating ? C.faint : C.accent, color: generating ? C.muted : "#fff", fontSize: 12, fontWeight: 700, fontFamily: head, cursor: generating ? "default" : "pointer", whiteSpace: "nowrap" as const }}>
              {generating ? "Generating…" : "Regenerate"}
            </button>
          )}
          <button onClick={onRefine}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.canvas, color: C.textSoft, fontSize: 12, fontWeight: 600, fontFamily: head, cursor: "pointer", whiteSpace: "nowrap" as const }}>
            Refine in chat
          </button>
          <button onClick={onEdit}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.canvas, color: C.textSoft, fontSize: 12, fontWeight: 600, fontFamily: head, cursor: "pointer", whiteSpace: "nowrap" as const }}>
            Open full editor
          </button>
        </div>
      </div>

      {generating ? (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: C.accentLo, border: `1px solid ${C.accentBorder}`, fontSize: 12.5, color: C.text, fontFamily: head }}>
          <div style={{ fontWeight: 700, marginBottom: log.length ? 6 : 0 }}>{phase || "Building personas…"}</div>
          {log.slice(-4).map((l, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: mono, color: C.textSoft, lineHeight: 1.5 }}>{l}</div>
          ))}
        </div>
      ) : (looksThin || reasons.length > 0) ? (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "#FEF6E7", border: "1px solid #F4D89A", fontSize: 12.5, color: "#7a5800", fontFamily: head, lineHeight: 1.5 }}>
          <strong>Some personas came back incomplete.</strong> Click <strong>Regenerate</strong> above to rebuild them.
          {reasons.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0D38A" }}>
              {reasons.map((r, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: mono, color: "#8a6400", lineHeight: 1.5 }}>{r}</div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {list.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center" as const, color: C.muted, fontSize: 13, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          No personas generated yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          {list.map((ic: any, i: number) => (
            <PersonaCard key={ic.id || i} icp={ic} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, id }: { label: string; value: string; id?: string }) {
  const items = toItems(value, !!id && LIST_FIELDS.has(id));
  return (
    <div style={{ background: C.faint, borderRadius: 10, padding: "11px 13px", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: 0.4, fontFamily: mono }}>{label}</div>
      {items ? (
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column" as const, gap: 4 }}>
          {items.map((it, i) => <li key={i} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, wordBreak: "break-word" as const }}>{it}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const }}>{value}</div>
      )}
    </div>
  );
}

function PersonaCard({ icp, index }: { icp: any; index: number }) {
  const [open, setOpen] = useState(index === 0); // first persona expanded by default
  const data = icp.data || {};
  const filled = (v: any) => v !== undefined && v !== null && toText(v).trim() !== "";

  // Build groups from EVERY populated key on the persona's data object, so the review
  // always mirrors what's actually stored.
  const groups: Record<string, { label: string; value: string; order: number; id: string }[]> = {};
  const extras: { label: string; value: string; id: string }[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (HIDDEN_KEYS.has(k) || k.startsWith("_")) continue;
    if (!filled(v)) continue;
    const meta = FIELD_META[k];
    if (meta) {
      (groups[meta.section] = groups[meta.section] || []).push({ label: meta.label, value: toText(v), order: meta.order, id: k });
    } else {
      extras.push({ label: prettyKey(k), value: toText(v), id: k });
    }
  }
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a.order - b.order));
  const sectionLabels = SECTION_KEYS.map((sk) => ICP_SECTIONS[sk as keyof typeof ICP_SECTIONS].label)
    .filter((label, i, a) => a.indexOf(label) === i && groups[label]?.length);
  const tabs = [...sectionLabels, ...(extras.length ? ["Other Details"] : [])];
  const [tab, setTab] = useState(tabs[0] || "");
  const activeTab = tabs.includes(tab) ? tab : (tabs[0] || "");
  const activeFields = activeTab === "Other Details" ? extras : (groups[activeTab] || []);
  const fieldCount = Object.values(groups).reduce((n, a) => n + a.length, 0) + extras.length;
  const buyer = toText(data.buyer || "").split(/\n|,/)[0]?.trim();
  const preview = toText(data.pain1 || data._tamExplanation || "").slice(0, 120);
  const dot = icp.color || C.accent;

  return (
    <div data-copilot-id={icp.id} style={{ background: C.canvas, border: `1px solid ${open ? C.accentBorder : C.border}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,.03)", overflow: "hidden", transition: "border-color .15s" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: `${dot}1A`, color: dot, fontSize: 12, fontWeight: 800, fontFamily: mono, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{icp.name || "Untitled persona"}</span>
            {buyer && (
              <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, border: `1px solid ${C.accentBorder}`, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{buyer}</span>
            )}
          </div>
          {!open && preview && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{preview}…</div>
          )}
        </div>
        <span style={{ fontSize: 11, fontFamily: mono, color: C.muted, flexShrink: 0 }}>{fieldCount} fields</span>
        <span style={{ fontSize: 14, color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>›</span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "5px 12px", borderRadius: 999, border: `1px solid ${activeTab === t ? C.accent : C.border}`, background: activeTab === t ? C.accent : C.canvas, color: activeTab === t ? "#fff" : C.textSoft, fontSize: 11.5, fontWeight: 600, fontFamily: head, cursor: "pointer" }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {activeFields.map((f, i) => <Tile key={i} label={f.label} value={f.value} id={f.id} />)}
          </div>
        </div>
      )}
    </div>
  );
}
