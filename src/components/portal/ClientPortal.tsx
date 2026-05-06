import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { PRODUCT_SECTIONS, ICP_SECTIONS } from "../../lib/schemas";
import { CxV2Portal } from "./CxV2Portal";

export function ClientPortal({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [v2Workspace, setV2Workspace] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("research");
  const [activeSidebarItem, setActiveSidebarItem] = useState<string>("");

  useEffect(() => {
    if (!supabase) { setNotFound(true); setLoading(false); return; }

    // Try CX v2 workspace first (share_token lookup)
    supabase.from("workspaces").select("id, name, stage, stage_statuses, share_token, client_id").eq("share_token", id).single()
      .then(async ({ data: ws }) => {
        if (ws) {
          // Load all documents for this workspace
          const { data: docs } = await supabase!.from("documents").select("type, content, version, approved_at").eq("workspace_id", ws.id).order("version", { ascending: false });
          // Load latest analytics upload
          const { data: analytics } = await supabase!.from("analytics_uploads").select("scorecard, parsed, filename, uploaded_at").eq("workspace_id", ws.id).order("uploaded_at", { ascending: false }).limit(1);
          // Load communications count
          const { count: commsCount } = await supabase!.from("communications").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
          setV2Workspace({ ...ws, docs: docs || [], analytics: analytics?.[0] || null, commsCount: commsCount || 0 });
          setLoading(false);
          return;
        }

        // Fall back to legacy app_data export
        supabase!.from("app_data").select("value").eq("key", `export_${id}`).single().then(({ data: row }) => {
          if (!row?.value) { setNotFound(true); setLoading(false); return; }
          const val = row.value;
          try {
            setData(typeof val === "string" ? JSON.parse(val) : val);
          } catch { setNotFound(true); }
          setLoading(false);
        });
      });
  }, [id]);

  // CX v2 branch
  if (!loading && v2Workspace) return <CxV2Portal ws={v2Workspace} />;

  const A   = "#5761fe";
  const H   = "#050c46";
  const B   = "#475467";
  const M   = "#8891a8";
  const S   = "#f5f5f7";
  const BT  = "#ece9f5";
  const BF  = "#f4f3fb";
  const BD  = "rgba(5,12,70,0.08)";
  const BDS = "rgba(5,12,70,0.16)";
  const f   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:f, background:"#fff" }}>
      <div style={{ textAlign:"center" as const }}>
        <div style={{ width:40, height:40, border:`3px solid ${BT}`, borderTopColor:A, borderRadius:"50%",
          animation:"spin 1s linear infinite", margin:"0 auto 16px" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize:14, color:M, letterSpacing:"-0.008em" }}>Loading…</div>
      </div>
    </div>
  );
  if (notFound) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:f, gap:12, background:"#fff" }}>
      <div style={{ fontSize:40 }}>🔗</div>
      <div style={{ fontSize:18, fontWeight:600, color:H, letterSpacing:"-0.012em" }}>Link not found</div>
      <div style={{ fontSize:14, color:M }}>This export may have expired or been removed.</div>
    </div>
  );

  const co = data.company || {};
  const name = co.name || data.companyName || "Client";
  const pitch = co.pitch || data.companyData?.co_pitch || "";
  const industry = co.industry || data.companyData?.co_industry || "";
  const website = co.website || data.companyData?.co_website || "";
  const kspRaw: string = co.ksp || data.companyData?.co_ksp || "";
  const ksps: string[] = (() => {
    if (!kspRaw) return [];
    const raw = kspRaw.trim();
    const parts = raw.includes("\n") ? raw.split("\n") : raw.split(/;\s*/);
    return parts
      .map((s: string) => s.replace(/^[\s]*\d+[.)]\s*/, "").replace(/^[•\-*]\s*/, "").trim())
      .filter(Boolean);
  })();
  const products: any[] = data.products || [];
  const personas: any[] = data.personas || [];
  const campaignGroups: any[] = data.campaignGroups || data.campaigns || [];
  const domains: any[] = data.domains || [];
  const strat: any = data.strategy || null;
  const dateStr = data.generatedAt
    ? new Date(data.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";
  const coFields: any = { ...(data.company || {}), ...(data.companyData || {}) };

  const coDisplaySections: Array<{ title: string; color: string; fields: Array<{ id: string; label: string }> }> = [
    { title: "Value Proposition", color: A, fields: [
      { id: "co_we_help",      label: "We Help" },
      { id: "co_who_struggle", label: "Who Struggle With" },
      { id: "co_by_providing", label: "By Providing" },
      { id: "co_unlike",       label: "Unlike (Competitors)" },
      { id: "co_we_uniquely",  label: "We Uniquely" },
    ]},
    { title: "Core Problem & Solution", color: "#5a9a6e", fields: [
      { id: "co_core_problem",   label: "Core Problem You Solve" },
      { id: "co_product",        label: "What We Sell" },
      { id: "co_prod_breakdown", label: "Product Breakdown" },
    ]},
    { title: "Market Position", color: "#5b8db8", fields: [
      { id: "co_category",      label: "Market Category" },
      { id: "co_competitors",   label: "Competitors" },
      { id: "co_buying_motion", label: "Buying Motion" },
      { id: "co_trust_risks",   label: "Trust / Risk Factors" },
    ]},
    { title: "Proof & Pipeline", color: "#c76a42", fields: [
      { id: "co_diff",      label: "Real Differentiators" },
      { id: "co_proof",     label: "Proof That Works" },
      { id: "co_customers", label: "Current Customers" },
      { id: "co_dream",     label: "Dream Customers" },
    ]},
    { title: "Outreach Readiness", color: "#8b6fc0", fields: [
      { id: "co_outbound_maturity",  label: "Outbound Maturity" },
      { id: "co_months_running",     label: "Months Running Outbound" },
      { id: "co_monthly_volume",     label: "Monthly Outreach Volume" },
      { id: "co_prev_tools",         label: "Previous Tools" },
      { id: "co_existing_leads",     label: "Existing Lead List" },
      { id: "co_biggest_challenge",  label: "Biggest Challenge" },
      { id: "co_90day_goal",         label: "90-Day Goal" },
    ]},
    { title: "Notes & Context", color: M, fields: [
      { id: "co_notes", label: "Notes" },
    ]},
  ];

  const catColors: Record<string, [string, string]> = {
    "Software":  [A, BT],
    "Service":   ["#5a9a6e", "#eaf5ee"],
    "Platform":  ["#5b8db8", "#ebf2f8"],
    "Data":      ["#c76a42", "#fdf0ea"],
    "Agency":    ["#8b6fc0", "#f0ecf8"],
  };
  const catIcon: Record<string, string> = { Software: "◈", Service: "◎", Platform: "⬡", Data: "◇", Agency: "◉" };
  const personaAccents = ["#5761fe", "#5a9a6e", "#5b8db8", "#c76a42", "#8b6fc0"];

  const scrollTo = (itemId: string) => {
    setActiveSidebarItem(itemId);
    const el = document.getElementById(itemId);
    if (el) {
      const offset = el.getBoundingClientRect().top + window.scrollY - 124;
      window.scrollTo({ top: offset, behavior: "smooth" });
    }
  };

  const sidebarItems: Array<{ id: string; label: string; sub?: string; color: string }> =
    activeTab === "products"
      ? products.map((p: any, i: number) => ({
          id: `ep-product-${i}`,
          label: p.name || `Product ${i + 1}`,
          sub: p.category,
          color: (catColors[p.category || "Software"] || [A, BT])[0],
        }))
    : activeTab === "personas"
      ? personas.map((pe: any, i: number) => ({
          id: `ep-persona-${i}`,
          label: pe.buyer || pe.name || `Persona ${i + 1}`,
          sub: (typeof pe.industries === "string" ? pe.industries : (pe.industries || []).join(", ")).split(",")[0]?.trim(),
          color: personaAccents[i % personaAccents.length],
        }))
    : activeTab === "email"
      ? campaignGroups.filter((g: any) => (g.emailSequence || []).length > 0).map((g: any, i: number) => ({
          id: `ep-email-${i}`,
          label: [g.productName, g.personaName].filter(Boolean).join(" × ") || `Sequence ${i + 1}`,
          sub: `${(g.emailSequence || []).length} steps`,
          color: A,
        }))
    : activeTab === "linkedin"
      ? campaignGroups.filter((g: any) => (g.linkedinSequence || []).length > 0).map((g: any, i: number) => ({
          id: `ep-linkedin-${i}`,
          label: [g.productName, g.personaName].filter(Boolean).join(" × ") || `Sequence ${i + 1}`,
          sub: `${(g.linkedinSequence || []).length} steps`,
          color: "#0a66c2",
        }))
    : [];

  const hasSidebar =
    (activeTab === "products" && products.length > 0) ||
    (activeTab === "personas" && personas.length > 0) ||
    (activeTab === "email" && campaignGroups.some((g: any) => (g.emailSequence || []).length > 0)) ||
    (activeTab === "linkedin" && campaignGroups.some((g: any) => (g.linkedinSequence || []).length > 0));

  const tabs = [
    { id: "research",       label: "Company Research" },
    { id: "strategy",       label: "Strategy",            show: campaignGroups.length > 0 },
    { id: "products",       label: "Products & Services", show: products.length > 0 },
    { id: "personas",       label: "Personas",            show: personas.length > 0 },
    { id: "email",          label: "Email Sequences",     show: campaignGroups.some((g: any) => (g.emailSequence || []).length > 0) },
    { id: "linkedin",       label: "LinkedIn Sequences",  show: campaignGroups.some((g: any) => (g.linkedinSequence || []).length > 0) },
    { id: "infrastructure", label: "Infrastructure",      show: domains.length > 0 },
  ].filter((t: any) => t.show !== false);

  const SecBlock = ({ title, fields, obj, accentColor }: { title: string; fields: any[]; obj: any; accentColor?: string }) => {
    const filled = fields.filter((f: any) => {
      const v = obj[f.id];
      return v && (Array.isArray(v) ? v.length > 0 : String(v).trim());
    });
    if (!filled.length) return null;
    return (
      <div style={{ padding: "20px 24px", borderTop: `1px solid ${BD}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: accentColor || A, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 14 }}>{title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
          {filled.map((f: any) => {
            const raw = obj[f.id];
            const val = Array.isArray(raw) ? raw.join(" · ") : String(raw);
            const isLong = val.length > 100 || val.includes("\n");
            return (
              <div key={f.id} style={{ gridColumn: isLong ? "1 / -1" : "auto" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: M, letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: 5 }}>{f.label}</div>
                <div style={{ fontSize: 13, color: B, lineHeight: 1.65, letterSpacing: "-0.008em", whiteSpace: val.includes("\n") ? "pre-wrap" as const : "normal" as const }}>{val}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const SeqSteps = ({ steps, color, lineColor }: { steps: any[]; color: string; lineColor: string }) => (
    <div style={{ position: "relative" as const }}>
      <div style={{ position: "absolute", left: 14, top: 28, bottom: 0, width: 1, background: lineColor }} />
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 24 }}>
        {steps.map((step: any, si: number) => (
          <div key={si} style={{ display: "flex", gap: 14, alignItems: "flex-start", position: "relative" as const }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#fff", border: `2px solid ${lineColor}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color, zIndex: 1, boxShadow: "0 1px 4px rgba(5,12,70,0.06)" }}>
              {si + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {step.dayOffset !== undefined && (
                <span style={{ fontSize: 10, fontWeight: 600, color: M, marginBottom: 4, display: "block", letterSpacing: "0.04em" }}>Day {step.dayOffset}</span>
              )}
              {step.subject && (
                <div style={{ fontSize: 14, fontWeight: 600, color: H, marginBottom: 8, lineHeight: 1.3, letterSpacing: "-0.008em" }}>{step.subject}</div>
              )}
              {step.body && (
                <div style={{ fontSize: 13, color: B, lineHeight: 1.65, letterSpacing: "-0.008em", background: S, padding: "14px 16px", borderRadius: 8, border: `1px solid ${BD}`, whiteSpace: "pre-wrap" as const }}>{step.body}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const PersonaCard = ({ pe, i }: { pe: any; i: number }) => {
    const d = pe.data || pe.fields || {};
    const palette: [string, string][] = [[A, BT], ["#5a9a6e", "#eaf5ee"], ["#5b8db8", "#ebf2f8"], ["#c76a42", "#fdf0ea"], ["#8b6fc0", "#f0ecf8"]];
    const [pfg] = palette[i % palette.length];
    const industryPills: string[] = d.industries ? (d.industries as string).split(/[,;]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 4) : [];
    const coSizes: string[] = Array.isArray(d.co_sizes) ? d.co_sizes : [];
    const goalItems: string[] = d.goals ? (d.goals as string).split(/[;\n]/).map((s: string) => s.trim()).filter(Boolean) : [];
    const pain = d.pain1 || d.pain2 || d.challenge;
    const hook = d.hook;
    const icpSectionColors: Record<string, string> = {
      targeting: "#5b8db8", persona: A, pains: "#c76a42",
      messaging: "#5a9a6e", competitorIntel: "#8b6fc0", channelBehavior: "#5b8db8", leadScoring: "#c76a42",
    };
    return (
      <div className="ep-card" style={{ overflow: "hidden", display: "flex" }}>
        <div style={{ width: 4, background: pfg, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BD}` }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: H, letterSpacing: "-0.010em", lineHeight: 1.3, marginBottom: 8 }}>{pe.name}</div>
            {(industryPills.length > 0 || coSizes.length > 0) && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                {industryPills.map((ind: string, j: number) => (
                  <span key={j} style={{ fontSize: 11, fontWeight: 500, color: M, background: S, border: `1px solid ${BD}`, padding: "2px 9px", borderRadius: 980 }}>{ind}</span>
                ))}
                {coSizes.map((s: string, j: number) => (
                  <span key={`cs-${j}`} style={{ fontSize: 11, fontWeight: 500, color: M, background: S, border: `1px solid ${BD}`, padding: "2px 9px", borderRadius: 980 }}>{s}</span>
                ))}
              </div>
            )}
          </div>
          {(pain || goalItems.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${BDS}` }}>
              <div style={{ padding: "18px 24px", borderRight: `1px solid ${BDS}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#c76a42", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 10 }}>Primary Pain</div>
                <p style={{ fontSize: 13, color: B, lineHeight: 1.65, letterSpacing: "-0.008em", margin: 0 }}>{pain || "—"}</p>
              </div>
              <div style={{ padding: "18px 24px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#5a9a6e", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 10 }}>Goals</div>
                {goalItems.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 7 }}>
                    {goalItems.map((g: string, gi: number) => (
                      <li key={gi} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#5a9a6e", flexShrink: 0, marginTop: 6 }} />
                        <span style={{ fontSize: 13, color: B, lineHeight: 1.55, letterSpacing: "-0.008em" }}>{g}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span style={{ fontSize: 13, color: M }}>—</span>}
              </div>
            </div>
          )}
          {hook && (
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${BDS}`, background: S }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: pfg, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 8 }}>Outreach Hook</div>
              <p style={{ fontSize: 13, color: B, lineHeight: 1.65, letterSpacing: "-0.008em", fontStyle: "italic" as const, margin: 0 }}>"{hook}"</p>
            </div>
          )}
          {Object.entries(ICP_SECTIONS).filter(([key]) => key !== "notes").map(([key, sec]: any) => {
            const remainingFields = sec.fields.filter((f: any) =>
              !["industries", "co_sizes", "pain1", "pain2", "challenge", "goals", "hook"].includes(f.id)
            );
            return <SecBlock key={key} title={sec.label} fields={remainingFields} obj={d} accentColor={icpSectionColors[key] || A} />;
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: "#fff", minHeight: "100vh", fontFamily: f, color: B, WebkitFontSmoothing: "antialiased" as any }}>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
        .ep-card { background:#fff; border-radius:12px; border:1px solid rgba(5,12,70,0.08); box-shadow:3px 5px 30px rgba(5,12,70,0.06); }
        .ep-tab { background:none; border:none; cursor:pointer; font-family:inherit; transition:color 150ms; }
        .ep-tab:hover { color:#050c46; }
        .ep-nav-item { display:block; width:100%; background:none; border:none; cursor:pointer; font-family:inherit;
          text-align:left; padding:7px 12px 7px 14px; border-radius:7px; border-left:2px solid transparent;
          transition:background 120ms,color 120ms; }
        .ep-nav-item:hover { background:rgba(5,12,70,0.04); }
        .ep-nav-item.active { border-left-color:currentColor; background:rgba(87,97,254,0.06); }
      `}</style>

      {/* STICKY HEADER + TABS */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: `1px solid ${BD}`, boxShadow: "0 2px 12px rgba(5,12,70,0.06)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 48px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, borderBottom: `1px solid ${BD}` }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: H, letterSpacing: "-0.012em", lineHeight: 1 }}>{name}</div>
          {website && (
            <a href={website} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 500, color: A, textDecoration: "none", letterSpacing: "-0.005em" }}>
              {website.replace(/^https?:\/\//, "")} ↗
            </a>
          )}
        </div>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 48px", display: "flex", overflowX: "auto" as const }}>
          {tabs.map((tab: any) => (
            <button key={tab.id} className="ep-tab" onClick={() => setActiveTab(tab.id)}
              style={{ padding: "16px 20px", fontSize: 14, fontWeight: activeTab === tab.id ? 600 : 500, color: activeTab === tab.id ? A : M, letterSpacing: "-0.008em", whiteSpace: "nowrap" as const, borderBottom: activeTab === tab.id ? `3px solid ${A}` : "3px solid transparent", marginBottom: -1 }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div style={{ maxWidth: hasSidebar ? 1200 : 960, margin: "0 auto", padding: "0 48px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 48 }}>

          {/* SIDEBAR */}
          {hasSidebar && (
            <div style={{ width: 200, flexShrink: 0, position: "sticky", top: 116, alignSelf: "flex-start", marginTop: 48 }}>
              <div style={{ background: BF, borderRadius: 10, border: `1px solid ${BT}`, paddingTop: 14, paddingBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: A, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 10, paddingLeft: 16 }}>On this page</div>
                {sidebarItems.map((item, idx) => {
                  const isActive = activeSidebarItem === item.id || (activeSidebarItem === "" && idx === 0);
                  return (
                    <button key={item.id} className={`ep-nav-item${isActive ? " active" : ""}`}
                      style={{ color: isActive ? item.color : B, borderLeftColor: isActive ? item.color : "transparent" }}
                      onClick={() => scrollTo(item.id)}>
                      <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, letterSpacing: "-0.008em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.35 }}>{item.label}</div>
                      {item.sub && <div style={{ fontSize: 11, color: M, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{item.sub}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* MAIN CONTENT */}
          <div style={{ flex: 1, minWidth: 0, padding: "48px 0 96px" }}>

            {/* COMPANY RESEARCH */}
            {activeTab === "research" && (
              <div>
                <div className="ep-card" style={{ overflow: "hidden", display: "flex", marginBottom: 24 }}>
                  <div style={{ width: 4, background: A, flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: "24px 28px" }}>
                    <div style={{ fontSize: 21, fontWeight: 600, color: H, letterSpacing: "-0.012em", marginBottom: 8 }}>{name}</div>
                    {pitch && <p style={{ fontSize: 14, color: B, lineHeight: 1.65, letterSpacing: "-0.008em", margin: "0 0 16px" }}>{pitch}</p>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      {industry && <span style={{ fontSize: 12, color: M, background: S, border: `1px solid ${BD}`, padding: "3px 10px", borderRadius: 980 }}>{industry}</span>}
                      {co.size && <span style={{ fontSize: 12, color: M, background: S, border: `1px solid ${BD}`, padding: "3px 10px", borderRadius: 980 }}>{co.size}</span>}
                      {co.revenue && <span style={{ fontSize: 12, color: M, background: S, border: `1px solid ${BD}`, padding: "3px 10px", borderRadius: 980 }}>{co.revenue}</span>}
                      {website && <a href={website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: A, background: BF, border: `1px solid ${BT}`, padding: "3px 10px", borderRadius: 980, textDecoration: "none" }}>{website.replace(/^https?:\/\//, "")} ↗</a>}
                    </div>
                  </div>
                </div>

                {ksps.length > 0 && (() => {
                  const half = Math.ceil(ksps.length / 2);
                  const left = ksps.slice(0, half);
                  const right = ksps.slice(half);
                  const KRow = ({ k, i }: { k: string; i: number }) => (
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "18px 0", borderBottom: `1px solid ${BD}` }}>
                      <div style={{ fontSize: 24, fontWeight: 600, color: `${A}30`, letterSpacing: "-0.018em", lineHeight: 1, flexShrink: 0, width: 32, textAlign: "right" as const, marginTop: 1 }}>
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: H, lineHeight: 1.5, letterSpacing: "-0.008em", margin: 0, flex: 1 }}>{k}</p>
                    </div>
                  );
                  return (
                    <div style={{ marginBottom: 36 }}>
                      <div style={{ marginBottom: 28 }}>
                        <div style={{ fontSize: 21, fontWeight: 600, color: H, letterSpacing: "-0.012em", marginBottom: 4 }}>What Makes {name} Different</div>
                        <div style={{ fontSize: 14, color: M, letterSpacing: "-0.008em" }}>Key differentiators for this outbound program</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 48px", alignItems: "start" }}>
                        <div>{left.map((k, i) => <KRow key={i} k={k} i={i} />)}</div>
                        <div>{right.map((k, i) => <KRow key={i} k={k} i={half + i} />)}</div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                  {coDisplaySections.map((section: any, si: number) => {
                    const filledFields = section.fields.filter((f: any) => {
                      const v = coFields[f.id];
                      return v && (Array.isArray(v) ? v.length > 0 : String(v).trim());
                    });
                    if (!filledFields.length) return null;
                    return (
                      <div key={si} className="ep-card" style={{ overflow: "hidden", display: "flex" }}>
                        <div style={{ width: 4, background: section.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ padding: "16px 24px 0" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: section.color, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{section.title}</div>
                          </div>
                          <div style={{ padding: "14px 24px 24px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
                              {filledFields.map((f: any) => {
                                const raw = coFields[f.id];
                                const val = Array.isArray(raw) ? raw.join(" · ") : String(raw);
                                const isLong = val.length > 100 || val.includes("\n");
                                return (
                                  <div key={f.id} style={{ gridColumn: isLong ? "1 / -1" : "auto" }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: M, letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: 5 }}>{f.label}</div>
                                    <div style={{ fontSize: 13, color: B, lineHeight: 1.65, letterSpacing: "-0.008em", whiteSpace: val.includes("\n") ? "pre-wrap" as const : "normal" as const }}>{val}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STRATEGY */}
            {activeTab === "strategy" && (() => {
              const ns = strat?.northStar || null;
              const bets: any[] = strat?.bets || [];
              const phases: any[] = strat?.phases || [];
              const allProductNames: string[] = Array.from(new Set(campaignGroups.map((g: any) => g.productName).filter(Boolean)));
              const allPersonaNames: string[] = Array.from(new Set(campaignGroups.map((g: any) => g.personaName).filter(Boolean)));
              const groupMap: Record<string, any> = {};
              campaignGroups.forEach((g: any) => { groupMap[`${g.productName}||${g.personaName}`] = g; });
              const phaseAccents = [A, "#5a9a6e", "#5b8db8", "#c76a42", "#8b6fc0", "#e0913a", "#3a9ae0", "#9a5a6e"];
              const betStatusColor: Record<string, string> = { proving: "#c76a42", confirmed_hypothesis: "#5a9a6e", disconfirmed_hypothesis: M };
              const betStatusLabel: Record<string, string> = { proving: "Testing", confirmed_hypothesis: "Confirmed", disconfirmed_hypothesis: "Disproved" };
              return (
                <div style={{ paddingTop: 48 }}>
                  {ns && (
                    <div style={{ marginBottom: 40 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: A, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>North Star</div>
                      <div className="ep-card" style={{ overflow: "hidden" }}>
                        <div style={{ height: 4, background: `linear-gradient(90deg,${A},#9aa3ff)` }} />
                        <div style={{ padding: "28px 32px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 40px", marginBottom: 28 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: M, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 8 }}>Ideal Customer Profile</div>
                              <div style={{ fontSize: 15, color: H, lineHeight: 1.6, letterSpacing: "-0.008em" }}>{ns.icp}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: M, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 8 }}>Core Pain We Solve</div>
                              <div style={{ fontSize: 15, color: H, lineHeight: 1.6, letterSpacing: "-0.008em" }}>{ns.corePain}</div>
                            </div>
                          </div>
                          <div style={{ borderTop: `1px solid ${BD}`, paddingTop: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 40px" }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: M, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 8 }}>Primary Channel</div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: A, background: BF, border: `1px solid ${BT}`, padding: "4px 12px", borderRadius: 980 }}>{ns.primaryChannel}</span>
                              {ns.channelReason && <div style={{ fontSize: 13, color: B, marginTop: 8, lineHeight: 1.55, letterSpacing: "-0.008em" }}>{ns.channelReason}</div>}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: M, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 8 }}>90-Day Goal</div>
                              <div style={{ fontSize: 14, fontWeight: 500, color: H, lineHeight: 1.55, letterSpacing: "-0.008em" }}>{ns.goal90Days}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {phases.length > 0 && (
                    <div style={{ marginBottom: 40 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: A, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>12-Month Roadmap</div>
                      <div style={{ fontSize: 13, color: M, letterSpacing: "-0.008em", marginBottom: 16 }}>Where we start, what we prove, and where we scale</div>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                        {phases.map((ph: any, pi: number) => {
                          const accent = phaseAccents[pi % phaseAccents.length];
                          const campCount = (ph.campaigns || []).length;
                          return (
                            <div key={pi} className="ep-card" style={{ overflow: "hidden", display: "flex" }}>
                              <div style={{ width: 4, background: accent, flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ padding: "16px 24px", display: "flex", alignItems: "flex-start", gap: 20, borderBottom: `1px solid ${BD}` }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                                      <div style={{ fontSize: 15, fontWeight: 600, color: H, letterSpacing: "-0.010em" }}>{ph.name}</div>
                                      {ph.monthRange && <span style={{ fontSize: 11, fontWeight: 600, color: accent, background: `${accent}14`, padding: "2px 8px", borderRadius: 980 }}>{ph.monthRange}</span>}
                                      {ph.status && ph.status !== "pending" && (
                                        <span style={{ fontSize: 11, fontWeight: 600, color: ph.status === "completed" ? "#5a9a6e" : ph.status === "in_progress" ? A : M, background: ph.status === "completed" ? "#eaf5ee" : ph.status === "in_progress" ? BF : S, padding: "2px 8px", borderRadius: 980 }}>
                                          {ph.status === "completed" ? "✓ Done" : ph.status === "in_progress" ? "In Progress" : "Pending"}
                                        </span>
                                      )}
                                    </div>
                                    {ph.focus && <div style={{ fontSize: 13, color: B, letterSpacing: "-0.008em" }}>{ph.focus}</div>}
                                  </div>
                                  {campCount > 0 && <div style={{ fontSize: 12, fontWeight: 500, color: M, flexShrink: 0 }}>{campCount} campaign{campCount !== 1 ? "s" : ""}</div>}
                                </div>
                                {ph.goal && (
                                  <div style={{ padding: "12px 24px", background: S }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: M, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginRight: 10 }}>Goal</span>
                                    <span style={{ fontSize: 13, color: H, letterSpacing: "-0.008em" }}>{ph.goal}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {bets.length > 0 && (
                    <div style={{ marginBottom: 40 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: A, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>Hypotheses We're Testing</div>
                      <div style={{ fontSize: 13, color: M, letterSpacing: "-0.008em", marginBottom: 16 }}>Bets on what will work — each backed by a campaign</div>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                        {bets.map((bet: any, bi: number) => {
                          const sc = betStatusColor[bet.status] || M;
                          const sl = betStatusLabel[bet.status] || bet.status;
                          return (
                            <div key={bi} className="ep-card" style={{ padding: "18px 24px" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, color: H, lineHeight: 1.6, letterSpacing: "-0.008em", marginBottom: bet.evidence ? 10 : 0 }}>{bet.hypothesis}</div>
                                  {bet.evidence && <div style={{ fontSize: 13, color: B, fontStyle: "italic" as const, lineHeight: 1.5, letterSpacing: "-0.008em" }}>"{bet.evidence}"</div>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: sc, background: `${sc}14`, padding: "3px 10px", borderRadius: 980 }}>{sl}</span>
                                  {bet.channel && <span style={{ fontSize: 11, color: M, background: S, border: `1px solid ${BD}`, padding: "2px 8px", borderRadius: 980 }}>{bet.channel}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {allProductNames.length > 0 && allPersonaNames.length > 0 && (
                    <div style={{ marginBottom: 40 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: A, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>Outreach Matrix</div>
                      <div style={{ fontSize: 13, color: M, letterSpacing: "-0.008em", marginBottom: 16 }}>Active sequences by product × persona — ✉ email touches, in LinkedIn touches</div>
                      <div className="ep-card" style={{ overflow: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: `180px repeat(${allPersonaNames.length},1fr)`, padding: "10px 16px", background: S, borderBottom: `1px solid ${BD}`, minWidth: 480 }}>
                          <div />
                          {allPersonaNames.map((pn: string, pi: number) => (
                            <div key={pi} style={{ fontSize: 11, fontWeight: 600, color: H, letterSpacing: "-0.005em", paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{pn}</div>
                          ))}
                        </div>
                        {allProductNames.map((prod: string, ri: number) => (
                          <div key={ri} style={{ display: "grid", gridTemplateColumns: `180px repeat(${allPersonaNames.length},1fr)`, padding: "14px 16px", borderBottom: ri < allProductNames.length - 1 ? `1px solid ${BD}` : "none", minWidth: 480, alignItems: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: H, letterSpacing: "-0.008em", paddingRight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{prod}</div>
                            {allPersonaNames.map((pn: string, ci: number) => {
                              const g = groupMap[`${prod}||${pn}`];
                              const eLen = g ? (g.emailSequence || []).length : 0;
                              const lLen = g ? (g.linkedinSequence || []).length : 0;
                              return (
                                <div key={ci} style={{ paddingLeft: 12, display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                                  {eLen > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: A, background: BF, border: `1px solid ${BT}`, padding: "2px 7px", borderRadius: 980, whiteSpace: "nowrap" as const }}>✉ {eLen}</span>}
                                  {lLen > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: "#0a66c2", background: "#ebf2f8", border: "1px solid #c5d9f7", padding: "2px 7px", borderRadius: 980, whiteSpace: "nowrap" as const }}>in {lLen}</span>}
                                  {!eLen && !lLen && <span style={{ fontSize: 12, color: M }}>—</span>}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {campaignGroups.some((g: any) => g.angle) && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: A, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>Messaging Angles</div>
                      <div style={{ fontSize: 13, color: M, letterSpacing: "-0.008em", marginBottom: 16 }}>The strategic hook driving each combination's outreach</div>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                        {campaignGroups.filter((g: any) => g.angle).map((g: any, gi: number) => {
                          const eLen = (g.emailSequence || []).length;
                          const lLen = (g.linkedinSequence || []).length;
                          return (
                            <div key={gi} className="ep-card" style={{ overflow: "hidden", display: "flex" }}>
                              <div style={{ width: 4, background: A, flexShrink: 0 }} />
                              <div style={{ flex: 1, padding: "16px 20px" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" as const }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: M, letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: 6 }}>
                                      {[g.productName, g.personaName].filter(Boolean).join("  ×  ")}
                                    </div>
                                    <div style={{ fontSize: 14, color: H, lineHeight: 1.6, letterSpacing: "-0.008em" }}>{g.angle}</div>
                                  </div>
                                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                    {eLen > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: A, background: BF, border: `1px solid ${BT}`, padding: "3px 10px", borderRadius: 980 }}>✉ {eLen} email</span>}
                                    {lLen > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#0a66c2", background: "#ebf2f8", border: "1px solid #c5d9f7", padding: "3px 10px", borderRadius: 980 }}>in {lLen} LinkedIn</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* PRODUCTS */}
            {activeTab === "products" && (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 24 }}>
                {products.map((p: any, i: number) => {
                  const cat = p.category || "Software";
                  const [fg, bg] = catColors[cat] || [A, BT];
                  const icon = catIcon[cat] || "◈";
                  const prodSectionColors: Record<string, string> = { core: A, market: "#5a9a6e", commercials: "#c76a42", proof: "#5b8db8", positioning: "#8b6fc0" };
                  return (
                    <div key={i} id={`ep-product-${i}`} className="ep-card" style={{ scrollMarginTop: 124, overflow: "hidden", display: "flex" }}>
                      <div style={{ width: 4, background: fg, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: fg, fontWeight: 700 }}>{icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: H, letterSpacing: "-0.010em" }}>{p.name}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" as const }}>
                              {p.category && <span style={{ fontSize: 11, fontWeight: 600, color: fg, background: bg, padding: "2px 9px", borderRadius: 980 }}>{p.category}</span>}
                              {p.dealType && <span style={{ fontSize: 11, fontWeight: 500, color: M, background: S, border: `1px solid ${BD}`, padding: "2px 9px", borderRadius: 980 }}>{p.dealType}</span>}
                              {(p.acv || p.avgDealSize) && <span style={{ fontSize: 11, fontWeight: 500, color: M, background: S, border: `1px solid ${BD}`, padding: "2px 9px", borderRadius: 980 }}>{p.acv || p.avgDealSize}</span>}
                            </div>
                          </div>
                        </div>
                        {Object.entries(PRODUCT_SECTIONS).filter(([key]) => key !== "notes").map(([key, sec]: any) => (
                          <SecBlock key={key} title={sec.label} fields={sec.fields} obj={p} accentColor={prodSectionColors[key] || A} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* PERSONAS */}
            {activeTab === "personas" && (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 30 }}>
                {personas.map((pe: any, i: number) => (
                  <div key={i} id={`ep-persona-${i}`} style={{ scrollMarginTop: 124 }}>
                    <PersonaCard pe={pe} i={i} />
                  </div>
                ))}
              </div>
            )}

            {/* EMAIL SEQUENCES */}
            {activeTab === "email" && (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 24 }}>
                {campaignGroups.filter((g: any) => (g.emailSequence || []).length > 0).map((g: any, gi: number) => (
                  <div key={gi} id={`ep-email-${gi}`} className="ep-card" style={{ scrollMarginTop: 124, overflow: "hidden" }}>
                    <div style={{ padding: "14px 24px", background: S, borderBottom: `1px solid ${BD}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: A, flexShrink: 0 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: H, letterSpacing: "-0.008em", flex: 1 }}>{[g.productName, g.personaName].filter(Boolean).join(" × ")}</div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: A, background: BF, border: `1px solid ${BT}`, padding: "3px 10px", borderRadius: 980 }}>{(g.emailSequence || []).length}-touch sequence</span>
                    </div>
                    <div style={{ padding: 28 }}>
                      <SeqSteps steps={g.emailSequence || []} color={A} lineColor={BD} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* LINKEDIN SEQUENCES */}
            {activeTab === "linkedin" && (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 24 }}>
                {campaignGroups.filter((g: any) => (g.linkedinSequence || []).length > 0).map((g: any, gi: number) => (
                  <div key={gi} id={`ep-linkedin-${gi}`} className="ep-card" style={{ scrollMarginTop: 124, overflow: "hidden" }}>
                    <div style={{ padding: "14px 24px", background: "#ebf2f8", borderBottom: "1px solid #c5d9f7", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0a66c2", flexShrink: 0 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: H, letterSpacing: "-0.008em", flex: 1 }}>{[g.productName, g.personaName].filter(Boolean).join(" × ")}</div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#0a66c2", background: "#fff", border: "1px solid #c5d9f7", padding: "3px 10px", borderRadius: 980 }}>{(g.linkedinSequence || []).length}-touch sequence</span>
                    </div>
                    <div style={{ padding: 28 }}>
                      <SeqSteps steps={g.linkedinSequence || []} color="#0a66c2" lineColor="#c5d9f7" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* INFRASTRUCTURE */}
            {activeTab === "infrastructure" && (
              <div style={{ paddingTop: 48 }}>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 21, fontWeight: 600, color: H, letterSpacing: "-0.012em", marginBottom: 4 }}>Sending Infrastructure</div>
                  <div style={{ fontSize: 14, color: M, letterSpacing: "-0.008em" }}>{domains.length} domain{domains.length !== 1 ? "s" : ""} configured</div>
                </div>
                <div className="ep-card" style={{ overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 0, padding: "10px 24px", background: S, borderBottom: `1px solid ${BD}` }}>
                    {["Domain", "Mailboxes", "Provider", "Status"].map((h) => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, color: M, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{h}</div>
                    ))}
                  </div>
                  {domains.map((d: any, i: number) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 0, padding: "14px 24px", borderBottom: i < domains.length - 1 ? `1px solid ${BD}` : "none", alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: H, letterSpacing: "-0.005em", fontFamily: "'Fira Code','Fira Mono','Consolas',monospace" }}>
                        {d.full || `${d.domain}.${d.tld || "com"}`}
                      </div>
                      <div style={{ fontSize: 13, color: B }}>{d.mailboxCount ?? 3}</div>
                      <div style={{ fontSize: 13, color: B }}>{d.provider || "—"}</div>
                      <div style={{ fontSize: 12 }}>
                        {d.status ? (
                          <span style={{ background: d.status.toLowerCase().includes("active") ? "#eaf5ee" : S, color: d.status.toLowerCase().includes("active") ? "#5a9a6e" : M, padding: "2px 8px", borderRadius: 980, fontWeight: 500 }}>{d.status}</span>
                        ) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>{/* end MAIN CONTENT */}
        </div>{/* end flex row */}
      </div>{/* end outer wrapper */}

      {/* FOOTER */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 48px 48px" }}>
        <div style={{ borderTop: `1px solid ${BD}`, paddingTop: 32, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: M, letterSpacing: "-0.005em" }}>{dateStr ? `Prepared ${dateStr}` : ""}</div>
          <img src="/b2brocket-logo.png" alt="B2B Rocket" style={{ height: 32, objectFit: "contain" as const, opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
}
