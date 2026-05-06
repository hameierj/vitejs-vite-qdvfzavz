import { useState, useEffect } from "react";
import { supabase, SUPABASE_URL } from "../../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentHi: "#5A4BD6", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC0480F", amberBorder: "#FFC04830",
  red: "#FF6B6B", redLo: "#FF6B6B0F", redBorder: "#FF6B6B33",
  blue: "#54A0FF", blueLo: "#54A0FF0F",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaXVudm1qd3B3dm95cnFubWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mjg4OTksImV4cCI6MjA5MDIwNDg5OX0.bu-qwXsDDqmTJEAn5KAuriTXgEFwlqxf_eIXBVF-6-Q";

const TOUCH_TYPES = [
  { id: "email", label: "Email", icon: "✉", color: C.accent },
  { id: "call", label: "Call", icon: "📞", color: C.green },
  { id: "meeting", label: "Meeting", icon: "🗓", color: C.blue },
  { id: "slack", label: "Slack", icon: "💬", color: C.amber },
  { id: "other", label: "Other", icon: "📝", color: C.muted },
];

interface Touchpoint {
  id: string;
  workspace_id: string;
  type: string;
  summary: string;
  flags: any[];
  logged_at: string;
  logged_by?: string;
}

interface Flag {
  id: string;
  type: "risk" | "opportunity" | "info";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  recommendedAction: string;
}

const FLAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  risk: { bg: C.redLo, border: C.redBorder, text: C.red },
  opportunity: { bg: C.greenLo, border: C.greenBorder, text: C.green },
  info: { bg: C.blueLo, border: "#54A0FF33", text: C.blue },
};

const SEV_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function Stage6_CommLog({ workspaceId }: { workspaceId: string }) {
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [healthSummary, setHealthSummary] = useState("");
  const [momentum, setMomentum] = useState<"positive" | "neutral" | "declining" | "">("");
  const [showForm, setShowForm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingTps, setLoadingTps] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [form, setForm] = useState({ type: "call", summary: "", logged_by: "", logged_at: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);

  const anthropicKey = (() => { try { return localStorage.getItem("b2br_api_key") || ""; } catch { return ""; } })();

  useEffect(() => {
    loadTouchpoints();
  }, [workspaceId]);

  async function loadTouchpoints() {
    if (!supabase || !workspaceId) { setLoadingTps(false); return; }
    setLoadingTps(true);
    const { data } = await supabase
      .from("communications")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("logged_at", { ascending: false });
    setTouchpoints((data as Touchpoint[]) || []);
    setLoadingTps(false);
  }

  async function logTouchpoint() {
    if (!supabase || !form.summary.trim()) return;
    setSaving(true);
    const { data, error: err } = await supabase
      .from("communications")
      .insert({
        workspace_id: workspaceId,
        type: form.type,
        summary: form.summary.trim(),
        flags: [],
        logged_at: new Date(form.logged_at).toISOString(),
        logged_by: form.logged_by.trim() || null,
      })
      .select()
      .single();
    setSaving(false);
    if (!err && data) {
      setTouchpoints(prev => [data as Touchpoint, ...prev]);
      setForm({ type: "call", summary: "", logged_by: "", logged_at: new Date().toISOString().slice(0, 10) });
      setShowForm(false);
    }
  }

  async function deleteTouchpoint(id: string) {
    if (!supabase) return;
    await supabase.from("communications").delete().eq("id", id);
    setTouchpoints(prev => prev.filter(t => t.id !== id));
  }

  async function analyzeLog() {
    if (touchpoints.length === 0) { setError("Log some touchpoints first."); return; }
    setAnalyzing(true);
    setError("");
    setFlags([]);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/comms-analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "x-anthropic-key": anthropicKey,
        },
        body: JSON.stringify({
          workspaceId,
          touchpoints: touchpoints.map(t => ({
            id: t.id,
            type: t.type,
            summary: t.summary,
            logged_at: t.logged_at,
            logged_by: t.logged_by,
          })),
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setFlags((data.flags || []).sort((a: Flag, b: Flag) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]));
      setHealthScore(data.healthScore ?? null);
      setHealthSummary(data.healthSummary || "");
      setMomentum(data.momentum || "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const momentumColor = momentum === "positive" ? C.green : momentum === "declining" ? C.red : C.amber;
  const momentumIcon = momentum === "positive" ? "↑" : momentum === "declining" ? "↓" : "→";

  return (
    <div style={{ fontFamily: body }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 6</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>Communication Log</h2>
          <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.6 }}>
            Track every client touchpoint. Run AI analysis to surface risks and opportunities.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 4 }}>
          {touchpoints.length > 0 && (
            <button onClick={analyzeLog} disabled={analyzing}
              style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${C.accentBorder}`,
                background: C.accentLo, color: C.accent, fontSize: 12, fontWeight: 700,
                fontFamily: head, cursor: analyzing ? "default" : "pointer" }}>
              {analyzing ? "Analyzing…" : "Run AI Analysis"}
            </button>
          )}
          <button onClick={() => setShowForm(true)}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none",
              background: C.accent, color: "#fff", fontSize: 12, fontWeight: 700,
              fontFamily: head, cursor: "pointer", boxShadow: `0 2px 8px ${C.accent}40` }}>
            + Log Touchpoint
          </button>
        </div>
      </div>

      {/* Health banner */}
      {healthScore !== null && (
        <div style={{ background: C.surface, borderRadius: 12, padding: "16px 20px", marginBottom: 24,
          border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: healthScore >= 7 ? C.green : healthScore >= 5 ? C.amber : C.red, fontFamily: mono }}>
              {healthScore}/10
            </div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginTop: 2 }}>HEALTH</div>
          </div>
          {momentum && (
            <div style={{ textAlign: "center", flexShrink: 0, paddingLeft: 16, borderLeft: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: momentumColor, fontFamily: mono }}>{momentumIcon}</div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginTop: 2 }}>{momentum.toUpperCase()}</div>
            </div>
          )}
          {healthSummary && (
            <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6, paddingLeft: 16, borderLeft: `1px solid ${C.border}` }}>
              {healthSummary}
            </div>
          )}
        </div>
      )}

      {/* AI Flags */}
      {flags.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
            AI FLAGS ({flags.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {flags.map(flag => {
              const fc = FLAG_COLORS[flag.type] || FLAG_COLORS.info;
              return (
                <div key={flag.id} style={{ background: fc.bg, border: `1px solid ${fc.border}`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: fc.text, fontFamily: mono,
                      background: "rgba(255,255,255,0.6)", padding: "2px 6px", borderRadius: 4 }}>
                      {flag.type.toUpperCase()} · {flag.severity.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: head }}>{flag.title}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.5, marginBottom: 6 }}>{flag.description}</div>
                  <div style={{ fontSize: 12, color: C.text, fontFamily: head, fontWeight: 600 }}>
                    → {flag.recommendedAction}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: C.red, marginBottom: 16 }}>{error}</div>}

      {/* Log touchpoint form */}
      {showForm && (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 20, marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 16 }}>Log Touchpoint</div>

          {/* Type selector */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {TOUCH_TYPES.map(t => (
              <button key={t.id} onClick={() => setForm(f => ({ ...f, type: t.id }))}
                style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${form.type === t.id ? t.color : C.border}`,
                  background: form.type === t.id ? `${t.color}10` : "transparent", color: form.type === t.id ? t.color : C.muted,
                  fontSize: 12, fontWeight: 600, fontFamily: head, cursor: "pointer", transition: "all .12s" }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Summary */}
          <textarea
            value={form.summary}
            onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
            placeholder="What happened? Include key points, tone, any commitments or concerns…"
            rows={3}
            style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}`, padding: "10px 12px",
              fontSize: 13, color: C.text, fontFamily: body, lineHeight: 1.6, resize: "vertical",
              outline: "none", boxSizing: "border-box" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginBottom: 4 }}>DATE</div>
              <input type="date" value={form.logged_at} onChange={e => setForm(f => ({ ...f, logged_at: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px",
                  fontSize: 12.5, color: C.text, background: C.canvas, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginBottom: 4 }}>LOGGED BY</div>
              <input value={form.logged_by} onChange={e => setForm(f => ({ ...f, logged_by: e.target.value }))}
                placeholder="Your name"
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px",
                  fontSize: 12.5, color: C.text, background: C.canvas, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => setShowForm(false)}
              style={{ padding: "8px 14px", borderRadius: 7, border: `1px solid ${C.border}`,
                background: "transparent", color: C.muted, fontSize: 12, fontFamily: head, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={logTouchpoint} disabled={saving || !form.summary.trim()}
              style={{ padding: "8px 18px", borderRadius: 7, border: "none",
                background: saving || !form.summary.trim() ? C.muted : C.accent,
                color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: head,
                cursor: saving || !form.summary.trim() ? "default" : "pointer" }}>
              {saving ? "Saving…" : "Save Touchpoint"}
            </button>
          </div>
        </div>
      )}

      {/* Touchpoint list */}
      {loadingTps ? (
        <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "40px 0" }}>Loading…</div>
      ) : touchpoints.length === 0 ? (
        <div style={{ background: C.surface, borderRadius: 12, padding: "40px 24px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: head, marginBottom: 6 }}>No touchpoints yet</div>
          <div style={{ fontSize: 13, color: C.muted }}>Log your first client interaction above.</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
            TOUCHPOINTS ({touchpoints.length})
          </div>
          <div style={{ position: "relative" }}>
            {/* Timeline line */}
            <div style={{ position: "absolute", left: 19, top: 0, bottom: 0, width: 2, background: C.border }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {touchpoints.map((tp, i) => {
                const tt = TOUCH_TYPES.find(t => t.id === tp.type) || TOUCH_TYPES[4];
                const date = new Date(tp.logged_at);
                const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return (
                  <div key={tp.id} style={{ display: "flex", gap: 16, paddingBottom: i < touchpoints.length - 1 ? 16 : 0 }}>
                    {/* Icon */}
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${tt.color}15`,
                      border: `2px solid ${tt.color}40`, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, flexShrink: 0, position: "relative", zIndex: 1, background: C.canvas }}>
                      {tt.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10,
                      padding: "12px 14px", marginBottom: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tt.color, fontFamily: mono,
                          background: `${tt.color}12`, padding: "2px 7px", borderRadius: 4 }}>
                          {tt.label.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>{dateStr}</span>
                        {tp.logged_by && <span style={{ fontSize: 11, color: C.muted }}>{tp.logged_by}</span>}
                        <button onClick={() => deleteTouchpoint(tp.id)}
                          style={{ marginLeft: "auto", fontSize: 12, color: C.muted, background: "none",
                            border: "none", cursor: "pointer", padding: "0 4px", opacity: 0.6 }}>×</button>
                      </div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{tp.summary}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
