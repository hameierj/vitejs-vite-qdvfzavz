import { useState, useEffect, useRef } from "react";
import { supabase, SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722", accentHi: "#5A4BD6",
  accentBorder: "#6C5CE733", green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC0480F", amberBorder: "#FFC04833", red: "#FF6B6B",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const LP_STEPS = [
  "Fetching website content",
  "Building company profile",
  "Researching products & personas",
  "Building full product profiles",
  "Building full persona profiles",
  "Building intelligence & offers",
  "Generating 67 domains",
  "Generating campaign strategies",
  "Generating sequences",
];

function DocSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, fontFamily: mono, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      </div>
      <div style={{ padding: "20px", background: C.canvas }}>{children}</div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, letterSpacing: 0.8, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, fontFamily: body }}>{value}</div>
    </div>
  );
}

const PLAYBOOKS = [
  { key: "auto",                label: "Auto (follow persona tone)" },
  { key: "value_stack",         label: "Value-Stack Operator — e.g. Alex Hormozi" },
  { key: "high_energy",         label: "High-Energy Hustler — e.g. Gary Vaynerchuk" },
  { key: "analytical",          label: "Analytical Challenger — e.g. McKinsey partner" },
  { key: "challenger",          label: "Challenger Sale — e.g. Matthew Dixon" },
  { key: "relationship",        label: "Relationship Builder — e.g. Zig Ziglar" },
  { key: "executive",           label: "Executive Brief — e.g. Board memo" },
  { key: "trust_patient",       label: "Trust-Led Analyst — e.g. Warren Buffett" },
  { key: "tactical_negotiator", label: "Tactical Negotiator — e.g. Chris Voss" },
  { key: "craft_copywriter",    label: "Classic Craft Copywriter — e.g. David Ogilvy" },
  { key: "concise_idea",        label: "Idea-Forward Minimalist — e.g. Seth Godin" },
  { key: "data_story",          label: "Data Storyteller — e.g. Andrew Chen" },
  { key: "permission_challenger",label: "Permission Challenger — e.g. Josh Braun" },
  { key: "technical_founder",   label: "Technical Founder Essayist — e.g. Paul Graham" },
  { key: "plainspoken_trade",   label: "Plainspoken Trade Voice — e.g. Mike Rowe" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.borderHi}`,
  fontSize: 13.5, fontFamily: body, color: C.text, background: C.bg, outline: "none",
  boxSizing: "border-box",
};
const taStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical" as const, lineHeight: 1.6,
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textSoft, fontFamily: mono, letterSpacing: 0.6, marginBottom: 6, textTransform: "uppercase" as const }}>
      {children}
    </label>
  );
}

export function Stage2_Research({ workspaceId, onApprove }: { workspaceId: string; onApprove: () => void }) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [url, setUrl] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [extraUrls, setExtraUrls] = useState("");
  const [offerings, setOfferings] = useState("");
  const [extraText, setExtraText] = useState("");
  const [salesContext, setSalesContext] = useState("");
  const [playbookKey, setPlaybookKey] = useState("auto");
  const [step, setStep] = useState(0);
  const [stepPhase, setStepPhase] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing job or result on mount
  useEffect(() => {
    async function init() {
      if (!supabase) return;

      // Check for existing LP job
      const { data } = await supabase
        .from("app_data")
        .select("value")
        .eq("key", `lp_job_${workspaceId}`)
        .maybeSingle();

      if (data?.value) {
        const job = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        if (job.status === "done" && job.result) {
          setResult(job.result);
          setPhase("done");
          return;
        }
        if (job.status === "running") {
          setStep(job.step || 0);
          setStepPhase(job.phase || "");
          setPhase("running");
          startPolling();
          return;
        }
        if (job.status === "error") {
          setError(job.error || "Pipeline failed");
          setPhase("error");
          return;
        }
      }

      // Try to pre-fill URL from Stage 1 handoff
      const { data: doc } = await supabase
        .from("documents")
        .select("content")
        .eq("workspace_id", workspaceId)
        .eq("type", "handoff")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (doc?.content?.companyDomain) {
        const domain = doc.content.companyDomain;
        setUrl(domain.startsWith("http") ? domain : `https://${domain}`);
      }
    }
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [workspaceId]);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from("app_data")
        .select("value")
        .eq("key", `lp_job_${workspaceId}`)
        .maybeSingle();

      if (!data?.value) return;
      const job = typeof data.value === "string" ? JSON.parse(data.value) : data.value;

      setStep(job.step || 0);
      setStepPhase(job.briefError
        ? `Step 3 error: ${job.briefError} — re-run to retry`
        : job.phase || "");

      if (job.status === "done") {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        if (job.result) {
          setResult(job.result);
          setPhase("done");
        } else {
          setError("Pipeline completed but returned no data. Re-run to try again.");
          setPhase("error");
        }
      } else if (job.status === "error") {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setError(job.error || "Pipeline failed");
        setPhase("error");
      }
    }, 3000);
  }

  async function runResearch() {
    if (!url.trim()) return;
    setPhase("running");
    setStep(0);
    setStepPhase("Starting...");

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/launchpad-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          workspaceId,
          params: {
            url: url.trim(),
            linkedin: linkedin.trim(),
            extraUrls: extraUrls.trim(),
            offerings: offerings.trim(),
            extraText: extraText.trim(),
            salesContext: salesContext.trim(),
            playbookKey,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `HTTP ${res.status}`);
        setPhase("error");
        return;
      }

      startPolling();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  async function approve() {
    if (!supabase || approving) return;
    setApproving(true);
    try {
      const { data: ws } = await supabase.from("workspaces").select("stage, stage_statuses").eq("id", workspaceId).single();
      const statuses = { ...(ws?.stage_statuses || {}), "2": "approved" };
      await supabase.from("workspaces").update({
        stage: Math.max(ws?.stage || 1, 3),
        stage_statuses: statuses,
      }).eq("id", workspaceId);
      onApprove();
    } finally {
      setApproving(false);
    }
  }

  // ── Idle: input form ────────────────────────────────────────────────────────
  if (phase === "idle") {
    const canRun = url.trim().length > 0;
    return (
      <div>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 2</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>Client Research</h2>
        <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.6, marginBottom: 28 }}>
          Enter the client's website to generate a full company profile, buyer personas, 67 email domains, and campaign sequences.
        </p>

        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>

          <div>
            <FieldLabel>Company Website *</FieldLabel>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yourcompany.com"
              autoFocus
              style={{ ...inputStyle, border: `1.5px solid ${url.trim() ? C.accent : C.borderHi}`, transition: "border-color .15s" }} />
          </div>

          <div>
            <FieldLabel>LinkedIn Company Page</FieldLabel>
            <input value={linkedin} onChange={e => setLinkedin(e.target.value)}
              placeholder="https://linkedin.com/company/yourco" style={inputStyle} />
          </div>

          <div>
            <FieldLabel>Additional URLs</FieldLabel>
            <textarea value={extraUrls} onChange={e => setExtraUrls(e.target.value)}
              placeholder="One URL per line — product pages, case studies, etc." rows={2} style={taStyle} />
          </div>

          <div>
            <FieldLabel>Products & Services Override</FieldLabel>
            <textarea value={offerings} onChange={e => setOfferings(e.target.value)}
              placeholder="Paste product/service descriptions if the site is hard to scrape — takes priority over scraped content." rows={3} style={taStyle} />
          </div>

          <div>
            <FieldLabel>Sales Context</FieldLabel>
            <textarea value={salesContext} onChange={e => setSalesContext(e.target.value)}
              placeholder="Paste sales call transcripts, notes, or any relevant pre-sales context. You can include multiple calls — just paste them one after another." rows={5} style={taStyle} />
          </div>

          <div>
            <FieldLabel>Additional Notes</FieldLabel>
            <textarea value={extraText} onChange={e => setExtraText(e.target.value)}
              placeholder="Target market, existing messaging, ICP hints, etc." rows={2} style={taStyle} />
          </div>

          <div>
            <FieldLabel>Voice & Strategy Profile</FieldLabel>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: body, marginBottom: 8 }}>
              Locks voice + strategy across every AI generation in this campaign
            </div>
            <select value={playbookKey} onChange={e => setPlaybookKey(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}>
              {PLAYBOOKS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          <button onClick={runResearch} disabled={!canRun}
            style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: canRun ? C.accent : C.surface, color: canRun ? "#fff" : C.muted,
              fontSize: 14, fontWeight: 800, fontFamily: head, letterSpacing: 0.4,
              cursor: canRun ? "pointer" : "default", transition: "all .15s",
              boxShadow: canRun ? `0 4px 20px ${C.accent}40` : "none",
            }}>
            GO →
          </button>

          <div style={{ fontSize: 11, color: C.muted, fontFamily: body, textAlign: "center", marginTop: -8 }}>
            Builds: company profile · products · personas · 67 domains · campaigns with email + LinkedIn sequences
          </div>
        </div>
      </div>
    );
  }

  // ── Running: progress view ──────────────────────────────────────────────────
  if (phase === "running") {
    const pct = Math.round((step / LP_STEPS.length) * 100);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 2</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, margin: 0 }}>Client Research</h2>
          </div>
          <button
            onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setPhase("idle"); setStep(0); setStepPhase(""); }}
            style={{
              marginTop: 4, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.borderHi}`,
              background: C.canvas, color: C.textSoft, fontSize: 12, fontWeight: 600,
              fontFamily: head, cursor: "pointer",
            }}
          >
            Re-run
          </button>
        </div>

        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
          {/* Spinner row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              border: `3px solid ${C.accentMid}`, borderTopColor: C.accent,
              animation: "spin 0.8s linear infinite",
            }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: head }}>Running pipeline…</div>
              <div style={{ fontSize: 12, color: C.textSoft, fontFamily: mono, marginTop: 2 }}>{stepPhase}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ background: C.surface, borderRadius: 6, height: 6, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, width: `${pct}%`, transition: "width .6s ease", borderRadius: 6 }} />
          </div>

          {/* Step checklist */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {LP_STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, opacity: done || active ? 1 : 0.4 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? C.green : active ? C.accent : C.surface,
                    border: `2px solid ${done ? C.green : active ? C.accent : C.border}`,
                  }}>
                    {done && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                    {!done && <span style={{ fontSize: 8, color: active ? "#fff" : C.muted, fontFamily: mono, fontWeight: 700 }}>{i + 1}</span>}
                  </div>
                  <span style={{ fontSize: 12.5, fontFamily: body, color: active ? C.accent : done ? C.text : C.muted, fontWeight: active ? 700 : 400 }}>{s}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 20, fontSize: 12, color: C.muted, fontFamily: mono }}>This typically takes 2–3 minutes. You can leave and come back.</div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 2</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 24 }}>Client Research</h2>
        <div style={{ background: "#FFF5F5", border: `1px solid #FFD6D6`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, fontFamily: head, marginBottom: 6 }}>Research failed</div>
          <div style={{ fontSize: 12, color: C.textSoft, fontFamily: mono, marginBottom: 16 }}>{error}</div>
          <button onClick={() => { setPhase("idle"); setError(""); }} style={{
            padding: "9px 20px", borderRadius: 8, background: C.accent, color: "#fff",
            border: "none", fontSize: 12.5, fontWeight: 700, fontFamily: head, cursor: "pointer",
          }}>Try Again</button>
        </div>
      </div>
    );
  }

  // ── Done: read-only document ─────────────────────────────────────────────────
  const co = result?.company || {};
  const products: any[] = result?.products || [];
  const personas: any[] = result?.personas || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 2</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, margin: 0 }}>Client Research</h2>
        </div>
        <button
          onClick={() => { setPhase("idle"); setResult(null); setStep(0); setStepPhase(""); }}
          style={{
            marginTop: 4, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.borderHi}`,
            background: C.canvas, color: C.textSoft, fontSize: 12, fontWeight: 600,
            fontFamily: head, cursor: "pointer", transition: "all .15s",
          }}
        >
          Re-run
        </button>
      </div>
      <p style={{ fontSize: 13, color: C.textSoft, fontFamily: body, marginBottom: 24, marginTop: 6 }}>
        {products.length} product{products.length !== 1 ? "s" : ""} · {personas.length} persona{personas.length !== 1 ? "s" : ""} · {(result?.domains || []).length} domains · {(result?.campaignGroups || []).length} campaign group{(result?.campaignGroups?.length || 0) !== 1 ? "s" : ""} generated
      </p>

      {/* Header strip */}
      <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 24px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: head }}>{co.co_name || "—"}</div>
          <div style={{ fontSize: 13, color: C.textSoft, fontFamily: body, marginTop: 2 }}>{co.co_industry || ""}{co.co_website ? ` · ${co.co_website}` : ""}</div>
        </div>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: mono, textAlign: "right", marginTop: 2 }}>
          {co.co_size && <div>{co.co_size}</div>}
          {co.co_revenue && <div>{co.co_revenue}</div>}
        </div>
      </div>

      {/* Company Profile */}
      <DocSection label="Company Profile">
        <div style={{ display: "grid", gap: 12 }}>
          <Tile label="Value Proposition" value={co.co_pitch} />
          <Tile label="We Help" value={co.co_we_help} />
          <Tile label="Core Problem Solved" value={co.co_core_problem} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Tile label="Key Selling Points" value={co.co_ksp} />
            <Tile label="Differentiators" value={co.co_diff} />
          </div>
          <Tile label="Proof & Customers" value={co.co_proof || co.co_customers} />
          {co.co_competitors && <Tile label="Competitors" value={co.co_competitors} />}
        </div>
      </DocSection>

      {/* Products */}
      {products.length > 0 && (
        <DocSection label={`Products (${products.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {products.map((p: any, i: number) => (
              <div key={p.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: head }}>{p.name}</div>
                  {p.category && <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6 }}>{p.category}</div>}
                </div>
                <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                  {p.description && <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6, fontFamily: body }}>{p.description}</div>}
                  {p.valueProposition && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, letterSpacing: 0.8, marginBottom: 3, textTransform: "uppercase" }}>Value Prop</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, fontFamily: body }}>{p.valueProposition}</div>
                    </div>
                  )}
                  {p.idealCustomer && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, letterSpacing: 0.8, marginBottom: 3, textTransform: "uppercase" }}>Ideal Customer</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, fontFamily: body }}>{p.idealCustomer}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DocSection>
      )}

      {/* Personas */}
      {personas.length > 0 && (
        <DocSection label={`Buyer Personas (${personas.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {personas.map((pe: any, i: number) => {
              const d = pe.data || pe.fields || {};
              return (
                <div key={pe.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: head }}>{pe.name}</div>
                    {d.buyer && <div style={{ fontSize: 11, color: C.textSoft, fontFamily: mono }}>{d.buyer}</div>}
                  </div>
                  <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {d.industries && <div><div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, letterSpacing: 0.8, marginBottom: 3, textTransform: "uppercase" }}>Industries</div><div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, fontFamily: body }}>{d.industries}</div></div>}
                    {d.pain1 && <div><div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, letterSpacing: 0.8, marginBottom: 3, textTransform: "uppercase" }}>Primary Pain</div><div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, fontFamily: body }}>{d.pain1}</div></div>}
                    {d.goals && <div><div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, letterSpacing: 0.8, marginBottom: 3, textTransform: "uppercase" }}>Goals</div><div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, fontFamily: body }}>{d.goals}</div></div>}
                    {d.hook && <div><div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: mono, letterSpacing: 0.8, marginBottom: 3, textTransform: "uppercase" }}>Hook</div><div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, fontFamily: body }}>{d.hook}</div></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </DocSection>
      )}

      {/* Approve */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
        <button
          onClick={approve}
          disabled={approving}
          style={{
            padding: "12px 32px", borderRadius: 10, background: C.green, color: "#fff",
            border: "none", fontSize: 13.5, fontWeight: 700, fontFamily: head, cursor: "pointer",
            boxShadow: `0 2px 12px ${C.green}40`, opacity: approving ? 0.6 : 1, transition: "all .15s",
          }}
        >
          {approving ? "Saving…" : "Approve & Continue to Stage 3"}
        </button>
      </div>
    </div>
  );
}
