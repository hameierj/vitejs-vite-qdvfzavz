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

interface Props {
  products: any[];
  onRefine: () => void;
  onEdit: () => void;
}

// Read-only, in-flow review of every generated product profile — the products analogue of
// InitialResearchBrief. Stays inside the guided-onboarding flow (the host renders a Back button)
// instead of dropping the user into the full Products editor.
export function ProductsReview({ products, onRefine, onEdit }: Props) {
  const list = products || [];

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
  const filled = (v: any) => v !== undefined && v !== null && String(v).trim() !== "";
  return (
    <div data-copilot-id={product.id} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,.03)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: C.accentLo, color: C.accent, fontSize: 12, fontWeight: 800, fontFamily: mono, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: 0, flex: 1 }}>{product.name || "Untitled product"}</h2>
        {filled(product.category) && (
          <span style={{ fontSize: 10.5, fontFamily: mono, fontWeight: 700, color: C.accent, background: C.accentLo, border: `1px solid ${C.accentBorder}`, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" as const }}>{product.category}</span>
        )}
      </div>

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {SECTION_KEYS.map((key) => {
          const sec = PRODUCT_SECTIONS[key as keyof typeof PRODUCT_SECTIONS];
          // Only fields with a value, and skip the name (already in the header).
          const fields = sec.fields.filter((f: any) => f.id !== "name" && f.id !== "category" && filled(product[f.id]));
          if (fields.length === 0) return null;
          return (
            <div key={key}>
              <div style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 8 }}>{sec.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {fields.map((f: any) => (
                  <div key={f.id} style={{ background: C.faint, borderRadius: 9, padding: "9px 11px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: C.textSoft, marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const }}>{String(product[f.id])}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
