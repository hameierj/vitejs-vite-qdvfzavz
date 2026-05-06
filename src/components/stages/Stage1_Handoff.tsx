import { useState, useEffect } from "react";
import { supabase, SUPABASE_URL } from "../../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentHi: "#5A4BD6", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC0480F", red: "#FF6B6B", redLo: "#FF6B6B0F",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaXVudm1qd3B3dm95cnFubWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mjg4OTksImV4cCI6MjA5MDIwNDg5OX0.bu-qwXsDDqmTJEAn5KAuriTXgEFwlqxf_eIXBVF-6-Q";

interface HandoffDoc {
  companyName?: string;
  companyContext?: string;
  painPoints?: string[];
  useCase?: string;
  keyContacts?: { name: string; title: string; email?: string; phone?: string; notes?: string }[];
  dealDetails?: { budget?: string; timeline?: string; decisionMakers?: string; competitors?: string; currentStack?: string };
  nextSteps?: string[];
  callSummary?: string;
  fitScore?: number;
  fitReason?: string;
  generatedAt?: string;
}

interface FirefliesCall {
  id: string;
  title: string;
  date: number;
  duration: number;
  organizer_email?: string;
  summary?: { action_items?: string[]; overview?: string };
  transcript_url?: string;
}

export function Stage1_Handoff({ workspaceId, onApprove }: { workspaceId: string; onApprove?: () => void }) {
  const [mode, setMode] = useState<"fireflies" | "paste">("paste");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [handoff, setHandoff] = useState<HandoffDoc | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");

  // Fireflies state
  const [ffCalls, setFfCalls] = useState<FirefliesCall[]>([]);
  const [ffLoading, setFfLoading] = useState(false);
  const [ffError, setFfError] = useState("");
  const [selectedCall, setSelectedCall] = useState<string>("");

  // Editable handoff fields
  const [editHandoff, setEditHandoff] = useState<HandoffDoc | null>(null);

  const firefliesKey = (() => { try { return localStorage.getItem("b2br_fireflies_token") || ""; } catch { return ""; } })();
  const anthropicKey = (() => { try { return localStorage.getItem("b2br_api_key") || ""; } catch { return ""; } })();

  // Load existing approved handoff
  useEffect(() => {
    if (!supabase || !workspaceId) return;
    supabase
      .from("documents")
      .select("content, approved_at, version")
      .eq("workspace_id", workspaceId)
      .eq("type", "handoff")
      .order("version", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.content) {
          setHandoff(data.content as HandoffDoc);
          setEditHandoff(data.content as HandoffDoc);
          if (data.approved_at) setApproved(true);
        }
      });
  }, [workspaceId]);

  async function fetchFirefliesCalls() {
    if (!firefliesKey) { setFfError("No Fireflies token configured. Add it in Settings."); return; }
    setFfLoading(true);
    setFfError("");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fireflies-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "x-fireflies-token": firefliesKey,
        },
        body: JSON.stringify({
          query: `query { transcripts(limit: 20) { id title date duration organizer_email summary { action_items overview } } }`,
        }),
      });
      const data = await res.json();
      if (data.errors) { setFfError(data.errors[0]?.message || "Fireflies error"); return; }
      setFfCalls(data.data?.transcripts ?? []);
    } catch (e: any) {
      setFfError(e.message);
    } finally {
      setFfLoading(false);
    }
  }

  async function fetchCallTranscript(callId: string) {
    if (!firefliesKey) return;
    setFfLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fireflies-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "x-fireflies-token": firefliesKey,
        },
        body: JSON.stringify({
          query: `query($id: String!) { transcript(id: $id) { sentences { text speaker_name start_time } summary { overview action_items } } }`,
          variables: { id: callId },
        }),
      });
      const data = await res.json();
      const t = data.data?.transcript;
      if (!t) return;
      const text = (t.sentences || []).map((s: any) => `${s.speaker_name}: ${s.text}`).join("\n");
      setTranscript(text || t.summary?.overview || "");
    } catch (e: any) {
      setFfError(e.message);
    } finally {
      setFfLoading(false);
    }
  }

  async function runHandoff() {
    if (!transcript.trim() || transcript.trim().length < 50) {
      setError("Paste a transcript first (at least 50 characters).");
      return;
    }
    setLoading(true);
    setError("");
    setHandoff(null);
    setEditHandoff(null);

    const messages = ["Reading transcript…", "Identifying key contacts…", "Extracting pain points…", "Structuring handoff document…"];
    let mi = 0;
    setLoadingMsg(messages[mi]);
    const interval = setInterval(() => {
      mi = (mi + 1) % messages.length;
      setLoadingMsg(messages[mi]);
    }, 4000);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handoff-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "x-anthropic-key": anthropicKey,
        },
        body: JSON.stringify({ transcript, workspaceId }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setHandoff(data.handoff);
      setEditHandoff(data.handoff);
    } catch (e: any) {
      setError(e.message);
    } finally {
      clearInterval(interval);
      setLoading(false);
      setLoadingMsg("");
    }
  }

  async function approveHandoff() {
    if (!supabase || !editHandoff) return;
    // Update the latest handoff doc to mark approved
    const { data: latest } = await supabase
      .from("documents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("type", "handoff")
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (latest?.id) {
      await supabase
        .from("documents")
        .update({ content: editHandoff, approved_at: new Date().toISOString(), approved_by: "CX Team" })
        .eq("id", latest.id);
    }

    // Advance workspace stage
    await supabase
      .from("workspaces")
      .update({ stage: 2, stage_statuses: { "1": "approved" } })
      .eq("id", workspaceId);

    setApproved(true);
    onApprove?.();
  }

  const fitColor = (score?: number) => {
    if (!score) return C.muted;
    if (score >= 8) return C.green;
    if (score >= 5) return C.amber;
    return C.red;
  };

  return (
    <div style={{ fontFamily: body }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
          STAGE 1
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>
          Sales Handoff
        </h2>
        <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.6 }}>
          Pull from Fireflies or paste a transcript. AI extracts a structured handoff document for the CS team.
        </p>
      </div>

      {/* If already approved */}
      {approved && (
        <div style={{ background: C.greenLo, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Handoff approved — Stage 1 complete</span>
          <button onClick={() => setApproved(false)} style={{ marginLeft: "auto", fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>
            Edit
          </button>
        </div>
      )}

      {!handoff && (
        <>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.surface, borderRadius: 8, padding: 4, width: "fit-content" }}>
            {(["paste", "fireflies"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); if (m === "fireflies" && !ffCalls.length) fetchFirefliesCalls(); }}
                style={{ padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: head, fontSize: 12, fontWeight: 600,
                  background: mode === m ? C.canvas : "transparent", color: mode === m ? C.text : C.muted,
                  boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all .15s" }}>
                {m === "paste" ? "Paste Transcript" : "Fireflies"}
              </button>
            ))}
          </div>

          {/* Fireflies mode */}
          {mode === "fireflies" && (
            <div>
              {ffLoading && <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Loading calls…</div>}
              {ffError && <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{ffError}</div>}
              {!ffLoading && !ffError && ffCalls.length === 0 && (
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>No calls found.</div>
              )}
              {ffCalls.length > 0 && (
                <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 16 }}>
                  {ffCalls.map((call, i) => {
                    const date = new Date(call.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    const mins = Math.round((call.duration || 0) / 60);
                    const sel = selectedCall === call.id;
                    return (
                      <div key={call.id} onClick={() => { setSelectedCall(call.id); fetchCallTranscript(call.id); }}
                        style={{ padding: "12px 16px", borderBottom: i < ffCalls.length - 1 ? `1px solid ${C.border}` : "none",
                          cursor: "pointer", background: sel ? C.accentLo : C.canvas,
                          borderLeft: sel ? `3px solid ${C.accent}` : "3px solid transparent", transition: "all .1s" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: head, marginBottom: 3 }}>{call.title}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>
                          {date} · {mins > 0 ? `${mins} min` : "—"}
                          {call.organizer_email ? ` · ${call.organizer_email}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {transcript && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginBottom: 6 }}>TRANSCRIPT PREVIEW</div>
                  <div style={{ background: C.surface, borderRadius: 8, padding: 12, fontSize: 12, color: C.textSoft, maxHeight: 140, overflow: "hidden", lineHeight: 1.6 }}>
                    {transcript.slice(0, 400)}…
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Paste mode */}
          {mode === "paste" && (
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste the full sales call transcript here…"
              style={{ width: "100%", minHeight: 220, borderRadius: 10, border: `1px solid ${C.border}`,
                padding: 14, fontSize: 13, color: C.text, fontFamily: body, lineHeight: 1.6,
                resize: "vertical", outline: "none", background: C.canvas, boxSizing: "border-box" }}
            />
          )}

          {error && <div style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{error}</div>}

          <button onClick={runHandoff} disabled={loading || !transcript.trim()}
            style={{ marginTop: 16, padding: "11px 24px", background: loading ? C.muted : C.accent,
              color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
              fontFamily: head, cursor: loading ? "default" : "pointer",
              boxShadow: loading ? "none" : `0 2px 10px ${C.accent}40`, transition: "all .2s" }}>
            {loading ? loadingMsg || "Generating…" : "Generate Handoff Document"}
          </button>
        </>
      )}

      {/* Handoff document output */}
      {editHandoff && (
        <div style={{ marginTop: handoff && !transcript ? 0 : 28 }}>
          {/* Fit score */}
          {editHandoff.fitScore !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
              background: C.surface, borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: fitColor(editHandoff.fitScore), fontFamily: mono }}>
                {editHandoff.fitScore}/10
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: head }}>Fit Score</div>
                <div style={{ fontSize: 12, color: C.textSoft }}>{editHandoff.fitReason}</div>
              </div>
            </div>
          )}

          {/* Call summary */}
          {editHandoff.callSummary && (
            <Section title="Call Summary">
              <EditableText value={editHandoff.callSummary || ""}
                onChange={v => setEditHandoff(p => ({ ...p!, callSummary: v }))} multiline />
            </Section>
          )}

          {/* Company context */}
          <Section title="Company Context">
            <EditableText value={editHandoff.companyContext || ""}
              onChange={v => setEditHandoff(p => ({ ...p!, companyContext: v }))} multiline />
          </Section>

          {/* Pain points */}
          <Section title="Pain Points">
            <EditableList items={editHandoff.painPoints || []}
              onChange={v => setEditHandoff(p => ({ ...p!, painPoints: v }))} />
          </Section>

          {/* Use case */}
          <Section title="Use Case">
            <EditableText value={editHandoff.useCase || ""}
              onChange={v => setEditHandoff(p => ({ ...p!, useCase: v }))} multiline />
          </Section>

          {/* Key contacts */}
          <Section title="Key Contacts">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(editHandoff.keyContacts || []).map((c, i) => (
                <div key={i} style={{ background: C.surface, borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <ContactField label="Name" value={c.name}
                      onChange={v => { const k = [...(editHandoff.keyContacts || [])]; k[i] = { ...k[i], name: v }; setEditHandoff(p => ({ ...p!, keyContacts: k })); }} />
                    <ContactField label="Title" value={c.title}
                      onChange={v => { const k = [...(editHandoff.keyContacts || [])]; k[i] = { ...k[i], title: v }; setEditHandoff(p => ({ ...p!, keyContacts: k })); }} />
                    <ContactField label="Email" value={c.email || ""}
                      onChange={v => { const k = [...(editHandoff.keyContacts || [])]; k[i] = { ...k[i], email: v }; setEditHandoff(p => ({ ...p!, keyContacts: k })); }} />
                  </div>
                  {c.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{c.notes}</div>}
                </div>
              ))}
            </div>
          </Section>

          {/* Deal details */}
          {editHandoff.dealDetails && (
            <Section title="Deal Details">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {Object.entries(editHandoff.dealDetails).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
                      {k.replace(/([A-Z])/g, " $1").toUpperCase()}
                    </div>
                    <input value={v || ""} onChange={e => setEditHandoff(p => ({ ...p!, dealDetails: { ...p!.dealDetails!, [k]: e.target.value } }))}
                      style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px",
                        fontSize: 12.5, color: C.text, background: C.canvas, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Next steps */}
          <Section title="Agreed Next Steps">
            <EditableList items={editHandoff.nextSteps || []}
              onChange={v => setEditHandoff(p => ({ ...p!, nextSteps: v }))} />
          </Section>

          {/* Actions */}
          {!approved && (
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => { setHandoff(null); setEditHandoff(null); setTranscript(""); }}
                style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                  background: "transparent", color: C.textSoft, fontSize: 12, fontWeight: 600,
                  fontFamily: head, cursor: "pointer" }}>
                Re-run
              </button>
              <button onClick={approveHandoff}
                style={{ padding: "10px 24px", borderRadius: 8, border: "none",
                  background: C.green, color: "#fff", fontSize: 13, fontWeight: 700,
                  fontFamily: head, cursor: "pointer", boxShadow: `0 2px 10px ${C.green}40` }}>
                Approve & Continue →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function EditableText({ value, onChange, multiline }: { value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const st: React.CSSProperties = {
    width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px",
    fontSize: 13, color: C.text, background: C.canvas, outline: "none",
    fontFamily: body, lineHeight: 1.6, boxSizing: "border-box",
  };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={{ ...st, resize: "vertical" }} />
    : <input value={value} onChange={e => onChange(e.target.value)} style={st} />;
}

function EditableList({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.accent, minWidth: 14 }}>•</span>
          <input value={item} onChange={e => { const n = [...items]; n[i] = e.target.value; onChange(n); }}
            style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px",
              fontSize: 12.5, color: C.text, background: C.canvas, outline: "none" }} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))}
            style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 14, padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])}
        style={{ alignSelf: "flex-start", fontSize: 11, color: C.accent, background: "none", border: `1px dashed ${C.accentBorder}`,
          borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: head, fontWeight: 600 }}>
        + Add
      </button>
    </div>
  );
}

function ContactField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, letterSpacing: 0.4, marginBottom: 3 }}>{label.toUpperCase()}</div>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 9px",
          fontSize: 12, color: C.text, background: C.canvas, outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}
