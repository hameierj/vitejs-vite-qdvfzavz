import { PRODUCT_SECTIONS } from "../../lib/schemas";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentBorder: "#6C5CE733",
  green: "#00B894", greenLo: "#00B8940F", greenBorder: "#00B89433",
  faint: "#F3F4FB",
};
const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SECTION_KEYS = Object.keys(PRODUCT_SECTIONS);
// Map every product field id → its section + human label, so we can render whatever the product
// object actually contains (and group it), rather than only the fields we expect.
const FIELD_META: Record<string, { section: string; label: string; order: number }> = {};
SECTION_KEYS.forEach((sk) => {
  PRODUCT_SECTIONS[sk as keyof typeof PRODUCT_SECTIONS].fields.forEach((f: any, i: number) => {
    FIELD_META[f.id] = { section: PRODUCT_SECTIONS[sk as keyof typeof PRODUCT_SECTIONS].label, label: f.label, order: i };
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

interface Props {
  products: any[];
  onRefine: () => void;
  onEdit: () => void;
  onRegenerate?: () => void;
  generating?: boolean;
  phase?: string;
  log?: string[];
}

// Read-only, in-flow review of every generated product profile — the products analogue of
// InitialResearchBrief. Stays inside the guided-onboarding flow (the host renders a Back button)
// instead of dropping the user into the full Products editor.
export function ProductsReview({ products, onRefine, onEdit, onRegenerate, generating = false, phase = "", log = [] }: Props) {
  const list = products || [];
  // Heuristic: a healthy profile has many fields. If every product is just name+description+Other,
  // generation fell back — warn and offer a one-click regenerate right here.
  const looksThin = list.length > 0 && list.some((p: any) => {
    const keys = Object.keys(p).filter((k) => !HIDDEN_KEYS.has(k) && !k.startsWith("_") && p[k] != null && String(p[k]).trim() !== "");
    return keys.length <= 2; // only description (category "Other" is in HIDDEN_KEYS)
  });
  // Surface the exact per-product failure reasons the server logged (persisted in the job log).
  const reasons = (log || []).filter((l) => l.includes("⚠️"));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 24px 64px", fontFamily: head }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: C.accent, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" as const }}>STEP 2</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Products &amp; Services</h1>
          <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.6 }}>
            {list.length} product{list.length !== 1 ? "s" : ""} profiled from your confirmed research. Review before unlocking the next step.
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

      {/* Live generation status / thin-data warning */}
      {generating ? (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: C.accentLo, border: `1px solid ${C.accentBorder}`, fontSize: 12.5, color: C.text, fontFamily: head }}>
          <div style={{ fontWeight: 700, marginBottom: log.length ? 6 : 0 }}>{phase || "Generating product profiles…"}</div>
          {log.slice(-4).map((l, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: mono, color: C.textSoft, lineHeight: 1.5 }}>{l}</div>
          ))}
        </div>
      ) : (looksThin || reasons.length > 0) ? (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "#FEF6E7", border: "1px solid #F4D89A", fontSize: 12.5, color: "#7a5800", fontFamily: head, lineHeight: 1.5 }}>
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
            <ProductCard key={p.id || i} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, index }: { product: any; index: number }) {
  const filled = (v: any) => v !== undefined && v !== null && toText(v).trim() !== "";

  // Build groups from EVERY populated key on the product object (not just expected fields), so the
  // review always mirrors what's actually stored — anything the editor shows, this shows.
  const groups: Record<string, { label: string; value: string; order: number }[]> = {};
  const extras: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(product)) {
    if (HIDDEN_KEYS.has(k) || k.startsWith("_")) continue;
    if (!filled(v)) continue;
    const meta = FIELD_META[k];
    if (meta) {
      (groups[meta.section] = groups[meta.section] || []).push({ label: meta.label, value: toText(v), order: meta.order });
    } else {
      extras.push({ label: prettyKey(k), value: toText(v) });
    }
  }
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a.order - b.order));
  // Preserve the canonical section order, then any leftover sections.
  const orderedSections = [
    ...SECTION_KEYS.map((sk) => PRODUCT_SECTIONS[sk as keyof typeof PRODUCT_SECTIONS].label),
  ].filter((label, i, a) => a.indexOf(label) === i && groups[label]?.length);

  const Tile = ({ label, value }: { label: string; value: string }) => (
    <div style={{ background: C.faint, borderRadius: 9, padding: "9px 11px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.textSoft, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const }}>{value}</div>
    </div>
  );

  return (
    <div data-copilot-id={product.id} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,.03)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: C.accentLo, color: C.accent, fontSize: 12, fontWeight: 800, fontFamily: mono, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: 0, flex: 1 }}>{product.name || "Untitled product"}</h2>
        {filled(product.category) && (
          <span style={{ fontSize: 10.5, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, border: `1px solid ${C.accentBorder}`, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" as const }}>{toText(product.category)}</span>
        )}
      </div>

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {orderedSections.map((label) => (
          <div key={label}>
            <div style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 8 }}>{label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {groups[label].map((f, i) => <Tile key={i} label={f.label} value={f.value} />)}
            </div>
          </div>
        ))}
        {extras.length > 0 && (
          <div>
            <div style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 8 }}>Other Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {extras.map((f, i) => <Tile key={i} label={f.label} value={f.value} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
