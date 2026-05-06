import { useState, useEffect, useRef } from "react";
import { supabase, SUPABASE_URL } from "../../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentHi: "#5A4BD6", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC0480F", amberBorder: "#FFC04830",
  red: "#FF6B6B", redLo: "#FF6B6B0F",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaXVudm1qd3B3dm95cnFubWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mjg4OTksImV4cCI6MjA5MDIwNDg5OX0.bu-qwXsDDqmTJEAn5KAuriTXgEFwlqxf_eIXBVF-6-Q";

interface ProposedChange {
  id: string;
  category: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  quote: string;
  accepted?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  contact_info: "Contact Info",
  pain_points: "Pain Points",
  use_case: "Use Case",
  deal_details: "Deal Details",
  next_steps: "Next Steps",
  goals: "Goals",
  icp: "ICP",
  company_context: "Company Context",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: C.green,
  medium: C.amber,
  low: C.muted,
};

export function Stage5_Onboarding({ workspaceId, onApprove }: { workspaceId: string; onApprove?: () => void }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [step, setStep] = useState<"input" | "review" | "done">("input");
  const [changes, setChanges] = useState<ProposedChange[]>([]);
  const [summary, setSummary] = useState("");
  const [newInfo, setNewInfo] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const anthropicKey = (() => { try { return localStorage.getItem("b2br_api_key") || ""; } catch { return ""; } })();

  // Load existing approved onboarding
  useEffect(() => {
    if (!supabase || !workspaceId) return;
    supabase
      .from("documents")
      .select("content, approved_at")
      .eq("workspace_id", workspaceId)
      .eq("type", "onboarding")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.approved_at) setStep("done");
      });
  }, [workspaceId]);

  async function handleFile(file: File) {
    const text = await file.text();
    setContent(prev => prev ? `${prev}\n\n--- ${file.name} ---\n${text}` : `--- ${file.name} ---\n${text}`);
  }

  async function runAnalysis() {
    if (!content.trim() || content.trim().length < 50) {
      setError("Add onboarding content first (transcript or form).");
      return;
    }
    setLoading(true);
    setError("");

    const msgs = ["Loading existing documents…", "Comparing against handoff…", "Identifying changes…", "Generating recommendations…"];
    let mi = 0;
    setLoadingMsg(msgs[mi]);
    const interval = setInterval(() => {
      mi = (mi + 1) % msgs.length;
      setLoadingMsg(msgs[mi]);
    }, 4000);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/onboarding-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "x-anthropic-key": anthropicKey,
        },
        body: JSON.stringify({ step: 1, workspaceId, onboardingContent: content }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      const allChanges: ProposedChange[] = (data.proposedChanges || []).map((c: any) => ({ ...c, accepted: c.confidence === "high" }));
      setChanges(allChanges);
      setSummary(data.summary || "");
      setNewInfo(data.newInfo || []);
      setStep("review");
    } catch (e: any) {
      setError(e.message);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }

  async function applyChanges() {
    const approved = changes.filter(c => c.accepted);
    if (approved.length === 0) { setError("Select at least one change to apply."); return; }

    setApplying(true);
    setError("");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/onboarding-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "x-anthropic-key": anthropicKey,
        },
        body: JSON.stringify({ step: 2, workspaceId, approvedChanges: approved }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setStep("done");
      onApprove?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  }

  // Group changes by category
  const grouped = changes.reduce<Record<string, ProposedChange[]>>((acc, c) => {
    const cat = c.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {});

  const acceptedCount = changes.filter(c => c.accepted).length;

  if (step === "done") {
    return (
      <div style={{ fontFamily: body }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 5</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>Onboarding Finalization</h2>
        </div>
        <div style={{ background: C.greenLo, border: `1px solid ${C.greenBorder}`, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.green, fontFamily: head, marginBottom: 6 }}>Onboarding Complete</div>
          <div style={{ fontSize: 13, color: C.textSoft }}>Documents have been updated and Stage 5 is approved.</div>
          <button onClick={() => setStep("input")}
            style={{ marginTop: 16, fontSize: 12, color: C.accent, background: "none", border: `1px solid ${C.accentBorder}`,
              borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontFamily: head, fontWeight: 600 }}>
            Run Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: body }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>STAGE 5</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>Onboarding Finalization</h2>
        <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.6 }}>
          Upload or paste the onboarding call transcript and/or implementation form. AI compares against the handoff doc and flags what changed.
        </p>
      </div>

      {step === "input" && (
        <>
          {/* File drop area */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach(handleFile); }}
            style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: "24px 20px",
              textAlign: "center", cursor: "pointer", marginBottom: 16, transition: "border-color .2s",
              background: C.surface }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.accent}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}>
            <input ref={fileRef} type="file" multiple accept=".txt,.pdf,.docx,.md" hidden onChange={e => Array.from(e.target.files || []).forEach(handleFile)} />
            <div style={{ fontSize: 22, marginBottom: 8 }}>📎</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: head, marginBottom: 4 }}>
              Drop files or click to upload
            </div>
            <div style={{ fontSize: 11.5, color: C.muted }}>Onboarding transcript, implementation form (.txt, .md, .pdf)</div>
          </div>

          <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginBottom: 8, textAlign: "center" }}>OR PASTE BELOW</div>

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Paste onboarding transcript, implementation form, or any onboarding notes here…"
            style={{ width: "100%", minHeight: 200, borderRadius: 10, border: `1px solid ${C.border}`,
              padding: 14, fontSize: 13, color: C.text, fontFamily: body, lineHeight: 1.6,
              resize: "vertical", outline: "none", background: C.canvas, boxSizing: "border-box" }}
          />

          {content && (
            <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginTop: 6, textAlign: "right" }}>
              {content.length.toLocaleString()} chars
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{error}</div>}

          <button onClick={runAnalysis} disabled={loading || !content.trim()}
            style={{ marginTop: 16, padding: "11px 24px", background: loading ? C.muted : C.accent,
              color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
              fontFamily: head, cursor: loading ? "default" : "pointer",
              boxShadow: loading ? "none" : `0 2px 10px ${C.accent}40`, transition: "all .2s" }}>
            {loading ? loadingMsg || "Analyzing…" : "Run Onboarding Analysis"}
          </button>
        </>
      )}

      {step === "review" && (
        <>
          {/* Summary */}
          {summary && (
            <div style={{ background: C.accentLo, border: `1px solid ${C.accentBorder}`, borderRadius: 10,
              padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              {summary}
            </div>
          )}

          {/* New info */}
          {newInfo.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
                NEW INFORMATION (no existing field)
              </div>
              <div style={{ background: C.surface, borderRadius: 8, padding: "10px 14px" }}>
                {newInfo.map((item, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.6, paddingBottom: i < newInfo.length - 1 ? 6 : 0 }}>
                    • {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accept all / reject all */}
          {changes.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: C.text, fontFamily: head, fontWeight: 600 }}>
                {changes.length} proposed change{changes.length !== 1 ? "s" : ""}
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 400, marginLeft: 8 }}>
                  {acceptedCount} selected
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setChanges(cs => cs.map(c => ({ ...c, accepted: true })))}
                  style={{ fontSize: 11, color: C.green, background: "none", border: `1px solid ${C.greenBorder}`,
                    borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: head, fontWeight: 600 }}>
                  Accept All
                </button>
                <button onClick={() => setChanges(cs => cs.map(c => ({ ...c, accepted: false })))}
                  style={{ fontSize: 11, color: C.muted, background: "none", border: `1px solid ${C.border}`,
                    borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: head, fontWeight: 600 }}>
                  Reject All
                </button>
              </div>
            </div>
          )}

          {/* Changes by category */}
          {Object.entries(grouped).map(([cat, catChanges]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
                {(CATEGORY_LABELS[cat] || cat).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {catChanges.map(change => (
                  <ChangeCard key={change.id} change={change}
                    onToggle={() => setChanges(cs => cs.map(c => c.id === change.id ? { ...c, accepted: !c.accepted } : c))} />
                ))}
              </div>
            </div>
          ))}

          {changes.length === 0 && (
            <div style={{ background: C.surface, borderRadius: 10, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: C.muted }}>No changes detected — existing docs look complete.</div>
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button onClick={() => { setStep("input"); setChanges([]); }}
              style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.textSoft, fontSize: 12, fontWeight: 600,
                fontFamily: head, cursor: "pointer" }}>
              Back
            </button>
            <button onClick={applyChanges} disabled={applying || acceptedCount === 0}
              style={{ padding: "10px 24px", borderRadius: 8, border: "none",
                background: applying || acceptedCount === 0 ? C.muted : C.green,
                color: "#fff", fontSize: 13, fontWeight: 700,
                fontFamily: head, cursor: applying || acceptedCount === 0 ? "default" : "pointer",
                boxShadow: acceptedCount > 0 ? `0 2px 10px ${C.green}40` : "none" }}>
              {applying ? "Applying…" : `Apply ${acceptedCount} Change${acceptedCount !== 1 ? "s" : ""} & Approve`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChangeCard({ change, onToggle }: { change: ProposedChange; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ border: `1px solid ${change.accepted ? C.greenBorder : C.border}`,
      borderRadius: 10, overflow: "hidden", transition: "border-color .15s",
      background: change.accepted ? C.greenLo : C.canvas }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px" }}>
        {/* Checkbox */}
        <div onClick={onToggle} style={{ marginTop: 2, width: 18, height: 18, borderRadius: 5,
          border: `2px solid ${change.accepted ? C.green : C.border}`,
          background: change.accepted ? C.green : "transparent", flexShrink: 0,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .15s" }}>
          {change.accepted && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: head }}>{change.field}</span>
            <span style={{ fontSize: 10, color: CONFIDENCE_COLORS[change.confidence], fontFamily: mono, fontWeight: 700,
              background: change.confidence === "high" ? C.greenLo : change.confidence === "medium" ? C.amberLo : C.surface,
              padding: "2px 6px", borderRadius: 4 }}>
              {change.confidence.toUpperCase()}
            </span>
          </div>

          {/* Diff view */}
          {change.currentValue && (
            <div style={{ fontSize: 12, color: C.red, background: C.redLo, borderRadius: 6, padding: "5px 9px", marginBottom: 5, fontFamily: body, lineHeight: 1.5 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginRight: 6 }}>WAS</span>
              {change.currentValue}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.text, background: C.greenLo, borderRadius: 6, padding: "5px 9px", fontFamily: body, lineHeight: 1.5 }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.green, marginRight: 6 }}>NOW</span>
            {change.proposedValue}
          </div>

          <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{change.reason}</div>

          {change.quote && (
            <button onClick={() => setExpanded(e => !e)}
              style={{ fontSize: 11, color: C.accent, background: "none", border: "none", cursor: "pointer",
                padding: 0, marginTop: 4, fontFamily: head, fontWeight: 600 }}>
              {expanded ? "Hide quote ↑" : "Show quote ↓"}
            </button>
          )}
          {expanded && change.quote && (
            <div style={{ fontSize: 11.5, color: C.textSoft, fontStyle: "italic", background: C.surface,
              borderRadius: 6, padding: "6px 10px", marginTop: 6, borderLeft: `3px solid ${C.accentBorder}` }}>
              "{change.quote}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
