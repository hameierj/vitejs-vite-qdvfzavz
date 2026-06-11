import { useState } from "react";
import { PRODUCT_SECTIONS } from "../../lib/schemas";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  amber: "#B45309", amberLo: "#FDF3E2", amberBorder: "#F4D89A",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SECTION_KEYS = Object.keys(PRODUCT_SECTIONS);
// Map every product field id → its section + label + type/opts, so we can render whatever the
// product object contains (grouped) AND drive editable controls from the same schema.
const FIELD_META: Record<string, { section: string; sectionKey: string; label: string; order: number; type: string; opts?: string[]; rows?: number; showWhen?: string }> = {};
SECTION_KEYS.forEach((sk) => {
  PRODUCT_SECTIONS[sk as keyof typeof PRODUCT_SECTIONS].fields.forEach((f: any, i: number) => {
    FIELD_META[f.id] = { section: PRODUCT_SECTIONS[sk as keyof typeof PRODUCT_SECTIONS].label, sectionKey: sk, label: f.label, order: i, type: f.type, opts: f.opts, rows: f.rows, showWhen: f.showWhen };
  });
});
// Internal/meta keys that should never be shown as content.
const HIDDEN_KEYS = new Set(["id", "createdAt", "updatedAt", "sourceUrl", "name", "category"]);
const prettyKey = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()).trim();
const toText = (v: any): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("\n");
  if (typeof v === "object") return Object.entries(v).map(([k, val]) => `${prettyKey(k)}: ${val}`).join("\n");
  return String(v);
};
// Fields that are conceptually lists — render their values as bullets when splittable.
const LIST_FIELDS = new Set(["useCases", "keyFeatures", "problemsSolved", "competitors", "buyerObjections", "switchTriggers", "proofPoints", "roiMetrics", "caseStudies", "industryProof", "socialProof", "objectionRebuttals", "messagingDos", "messagingDonts", "dealStakeholders", "unsolvedImpact"]);

// Evidence / commercial fields the AI is told NOT to fabricate — when blank they're the user's to
// fill, so we flag them. Pricing fields are filtered by the product's deal type below.
const EVIDENCE_FIELDS = ["proofPoints", "roiMetrics", "caseStudies", "industryProof", "socialProof"];
const dealCategory = (p: any): "recurring" | "onetime" | "both" | "" => {
  const d = String(p?.dealType || "").toLowerCase();
  if (d.includes("both")) return "both";
  if (d.includes("recurring")) return "recurring";
  if (d.includes("one")) return "onetime";
  return "";
};
const pricingFieldsFor = (p: any): string[] => {
  const cat = dealCategory(p);
  if (cat === "recurring") return ["acv", "mrr"];
  if (cat === "onetime") return ["avgDealSize"];
  if (cat === "both") return ["acv", "mrr", "avgDealSize"];
  return ["acv", "avgDealSize"];
};
const filledVal = (v: any) => v !== undefined && v !== null && toText(v).trim() !== "";
// Evidence/pricing fields left blank for this product — the "needs your input" list.
const needsInputFields = (p: any): string[] =>
  [...EVIDENCE_FIELDS, ...pricingFieldsFor(p)].filter((id, i, a) => a.indexOf(id) === i && !filledVal(p[id]));

// Whether a commercial field with a showWhen tag applies to this product's deal type.
const fieldAppliesToDeal = (showWhen: string | undefined, p: any): boolean => {
  if (!showWhen) return true;
  const cat = dealCategory(p);
  if (cat === "both" || cat === "") return true;
  return showWhen === cat;
};

// Split a value into list items: prefer newlines/numbered/bulleted; fall back to commas for list fields.
const toItems = (value: string, isList: boolean): string[] | null => {
  const byLine = value.split(/\n|(?:^|\s)(?:\d+[.)]\s)|\s*[•\-–]\s+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine.map((s) => s.replace(/^[•\-–]\s*/, ""));
  if (isList) {
    // Split on commas that are NOT inside parentheses, so "(email, call, daily tasks)" stays intact.
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

function newBlankProduct(): any {
  const id = (crypto as any)?.randomUUID ? crypto.randomUUID() : `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const fields = Object.fromEntries(Object.keys(FIELD_META).map((k) => [k, ""]));
  return { id, name: "", category: "", ...fields, sourceUrl: "", createdAt: new Date().toISOString() };
}

interface Props {
  products: any[];
  onProductsChange?: (products: any[]) => void;
  onRefine: () => void;
  onEdit: () => void;
  onRegenerate?: () => void;
  generating?: boolean;
  phase?: string;
  log?: string[];
}

// In-flow review of every generated product profile — the products analogue of InitialResearchBrief.
// Read-only by default; an Edit toggle turns fields editable in place (fill flagged blanks, fix copy,
// add/delete products) without dropping the user into the full Products editor.
export function ProductsReview({ products, onProductsChange, onRefine, onEdit, onRegenerate, generating = false, phase = "", log = [] }: Props) {
  const list = products || [];
  const canEdit = !!onProductsChange;
  const [editing, setEditing] = useState(false);
  // Heuristic: a healthy profile has many fields. If every product is just name+description+Other,
  // generation fell back — warn and offer a one-click regenerate right here.
  const looksThin = list.length > 0 && list.some((p: any) => {
    const keys = Object.keys(p).filter((k) => !HIDDEN_KEYS.has(k) && !k.startsWith("_") && p[k] != null && String(p[k]).trim() !== "");
    return keys.length <= 2; // only description (category "Other" is in HIDDEN_KEYS)
  });
  // Surface the exact per-product failure reasons the server logged (persisted in the job log).
  const reasons = (log || []).filter((l) => l.includes("⚠️"));

  const updateProduct = (id: string, patch: any) => onProductsChange?.(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const deleteProduct = (id: string) => { if (confirm("Delete this product?")) onProductsChange?.(list.filter((p) => p.id !== id)); };
  const addProduct = () => onProductsChange?.([...list, newBlankProduct()]);

  const btn = (label: string, onClick: () => void, primary = false) => (
    <button onClick={onClick}
      style={{ padding: "8px 14px", borderRadius: 8, border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.accent : C.canvas, color: primary ? "#fff" : C.textSoft, fontSize: 12, fontWeight: primary ? 700 : 600, fontFamily: head, cursor: "pointer", whiteSpace: "nowrap" as const }}>
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 24px 64px", fontFamily: head }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>STEP 2</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Products &amp; Services</h1>
          <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
            {list.length} product{list.length !== 1 ? "s" : ""} profiled from your confirmed research. {editing ? "Editing — fill any flagged blanks, then turn off Edit." : "Review before unlocking the next step."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
          {onRegenerate && !editing && (
            <button onClick={onRegenerate} disabled={generating}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: generating ? C.faint : C.accent, color: generating ? C.muted : "#fff", fontSize: 12, fontWeight: 700, fontFamily: head, cursor: generating ? "default" : "pointer", whiteSpace: "nowrap" as const }}>
              {generating ? "Generating…" : "Regenerate"}
            </button>
          )}
          {canEdit && btn(editing ? "Done editing ✓" : "Edit", () => setEditing((e) => !e), editing)}
          {!editing && btn("Refine in chat", onRefine)}
          {!editing && btn("Open full editor", onEdit)}
        </div>
      </div>

      {/* Live generation status / thin-data warning */}
      {generating ? (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: C.accentLo, border: `1px solid ${C.accentBorder}`, fontSize: 12.5, color: C.text, fontFamily: head }}>
          <div style={{ fontWeight: 700, marginBottom: log.length ? 6 : 0 }}>{phase || "Generating product profiles…"}</div>
          {log.slice(-4).map((l, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: mono, color: C.textSoft, lineHeight: 1.5 }}>{l}</div>
          ))}
        </div>
      ) : (looksThin || reasons.length > 0) ? (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: C.amberLo, border: `1px solid ${C.amberBorder}`, fontSize: 12.5, color: "#7a5800", fontFamily: head, lineHeight: 1.5 }}>
          <strong>Some profiles came back incomplete.</strong> Click <strong>Regenerate</strong> above to rebuild them from your research.
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
          No products generated yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          {list.map((p: any, i: number) => (
            <ProductCard key={p.id || i} product={p} index={i} editing={editing}
              onChange={(patch) => updateProduct(p.id, patch)} onDelete={() => deleteProduct(p.id)} />
          ))}
        </div>
      )}

      {editing && (
        <button onClick={addProduct}
          style={{ marginTop: 16, width: "100%", padding: "12px", borderRadius: 12, border: `1px dashed ${C.accentBorder}`, background: C.accentLo, color: C.accent, fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer" }}>
          + Add product
        </button>
      )}
    </div>
  );
}

// Read-only display tile.
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

// Editable field tile (used in edit mode).
function EditTile({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const meta = FIELD_META[id];
  const ctrlStyle: any = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: head, color: C.text, background: C.canvas };
  const flagged = needsInputId(id) && !value.trim();
  return (
    <div style={{ background: C.canvas, borderRadius: 10, padding: "11px 13px", border: `1px solid ${flagged ? C.amberBorder : C.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: flagged ? C.amber : C.muted, marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: 0.4, fontFamily: mono }}>
        {label}{flagged ? " · needs input" : ""}
      </div>
      {meta?.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={ctrlStyle}>
          <option value="">—</option>
          {(meta.opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : meta?.type === "text" ? (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={ctrlStyle} />
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={meta?.rows || 3}
          style={{ ...ctrlStyle, resize: "vertical" as const, lineHeight: 1.5 }} />
      )}
    </div>
  );
}
const NEEDS_SET = new Set([...EVIDENCE_FIELDS, "acv", "mrr", "avgDealSize"]);
const needsInputId = (id: string) => NEEDS_SET.has(id);

function ProductCard({ product, index, editing, onChange, onDelete }: {
  product: any; index: number; editing: boolean; onChange: (patch: any) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(index === 0); // first product expanded by default
  const isOpen = editing || open; // always expanded while editing

  // Build groups from EVERY populated key on the product object (not just expected fields), so the
  // review always mirrors what's actually stored — anything the editor shows, this shows.
  const groups: Record<string, { label: string; value: string; order: number; id: string }[]> = {};
  const extras: { label: string; value: string; id: string }[] = [];
  for (const [k, v] of Object.entries(product)) {
    if (HIDDEN_KEYS.has(k) || k.startsWith("_")) continue;
    if (!filledVal(v)) continue;
    const meta = FIELD_META[k];
    if (meta) {
      (groups[meta.section] = groups[meta.section] || []).push({ label: meta.label, value: toText(v), order: meta.order, id: k });
    } else {
      extras.push({ label: prettyKey(k), value: toText(v), id: k });
    }
  }
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a.order - b.order));

  // Section tabs. In edit mode show every schema section (so empty fields are fillable);
  // in read mode show only sections that have populated fields.
  const allSectionLabels = SECTION_KEYS.map((sk) => PRODUCT_SECTIONS[sk as keyof typeof PRODUCT_SECTIONS].label).filter((l, i, a) => a.indexOf(l) === i);
  const populatedLabels = allSectionLabels.filter((label) => groups[label]?.length);
  const sectionLabels = editing ? allSectionLabels : populatedLabels;
  const tabs = [...sectionLabels, ...(!editing && extras.length ? ["Other Details"] : [])];
  const [tab, setTab] = useState(tabs[0] || "");
  const activeTab = tabs.includes(tab) ? tab : (tabs[0] || "");

  const fieldCount = Object.values(groups).reduce((n, a) => n + a.length, 0) + extras.length;
  const preview = toText(product.description || "").slice(0, 120);
  const needs = needsInputFields(product);

  // Schema fields for the active section in edit mode (filtered by deal type), so empties show.
  const activeSectionKey = SECTION_KEYS.find((sk) => PRODUCT_SECTIONS[sk as keyof typeof PRODUCT_SECTIONS].label === activeTab);
  const editFields = (activeSectionKey ? PRODUCT_SECTIONS[activeSectionKey as keyof typeof PRODUCT_SECTIONS].fields : [])
    .filter((f: any) => f.id !== "name" && f.id !== "category" && fieldAppliesToDeal(f.showWhen, product));
  const activeFields = activeTab === "Other Details" ? extras : (groups[activeTab] || []);

  return (
    <div data-copilot-id={product.id} style={{ background: C.canvas, border: `1px solid ${isOpen ? C.accentBorder : C.border}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,.03)", overflow: "hidden", transition: "border-color .15s" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px" }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: C.accentLo, color: C.accent, fontSize: 12, fontWeight: 800, fontFamily: mono, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
        {editing ? (
          <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
            <input value={product.name || ""} onChange={(e) => onChange({ name: e.target.value })} placeholder="Product name"
              style={{ flex: 1, minWidth: 160, padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 15, fontWeight: 700, fontFamily: head, color: C.text, background: C.canvas }} />
            <select value={product.category || ""} onChange={(e) => onChange({ category: e.target.value })}
              style={{ padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: head, color: C.text, background: C.canvas }}>
              <option value="">Category…</option>
              {(FIELD_META.category?.opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button onClick={onDelete} title="Delete product"
              style={{ border: `1px solid ${C.border}`, background: C.canvas, color: "#E11D48", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: head, padding: "7px 11px", borderRadius: 7 }}>Delete</button>
          </div>
        ) : (
          <button onClick={() => setOpen((o) => !o)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const, padding: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{product.name || "Untitled product"}</span>
                {filledVal(product.category) && (
                  <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, border: `1px solid ${C.accentBorder}`, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" as const }}>{toText(product.category)}</span>
                )}
                {needs.length > 0 && (
                  <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.amber, background: C.amberLo, border: `1px solid ${C.amberBorder}`, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" as const }}>{needs.length} need input</span>
                )}
              </div>
              {!open && preview && (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{preview}…</div>
              )}
            </div>
            <span style={{ fontSize: 11, fontFamily: mono, color: C.muted, flexShrink: 0 }}>{fieldCount} fields</span>
            <span style={{ fontSize: 14, color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>›</span>
          </button>
        )}
      </div>

      {/* "Needs your input" flag (read mode) */}
      {!editing && isOpen && needs.length > 0 && (
        <div style={{ margin: "0 20px 4px", padding: "9px 12px", background: C.amberLo, border: `1px solid ${C.amberBorder}`, borderRadius: 9 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 4, fontFamily: mono }}>NEEDS YOUR INPUT — not invented by AI</div>
          <div style={{ fontSize: 12, color: "#7a5800", lineHeight: 1.5 }}>
            {needs.map((id) => FIELD_META[id]?.label || prettyKey(id)).join(" · ")}
          </div>
          <div style={{ fontSize: 11, color: "#8a6400", marginTop: 4 }}>Click <strong>Edit</strong> above to fill these in.</div>
        </div>
      )}

      {/* Body */}
      {isOpen && (
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
            {editing
              ? editFields.map((f: any) => (
                  <EditTile key={f.id} id={f.id} label={f.label} value={toText(product[f.id] ?? "")} onChange={(v) => onChange({ [f.id]: v })} />
                ))
              : activeFields.map((f, i) => <Tile key={i} label={f.label} value={f.value} id={f.id} />)}
          </div>
        </div>
      )}
    </div>
  );
}
