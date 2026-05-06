import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentHi: "#5A4BD6", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", red: "#FF6B6B",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

const STAGE_LABELS = ["Handoff", "Research", "Domains", "Campaigns", "Onboarding", "Comm Log", "Analytics"];

interface Workspace {
  id: string;
  name: string;
  stage: number;
  stage_statuses: Record<string, string>;
  share_token: string;
  created_at: string;
  updated_at: string;
}

function stagesComplete(ws: Workspace): number {
  const fromStatuses = Object.values(ws.stage_statuses || {}).filter(v => v === "approved").length;
  return Math.max(fromStatuses, ws.stage - 1);
}

function stageBadgeColor(ws: Workspace): string {
  const done = stagesComplete(ws);
  if (done >= 6) return C.green;
  if (done >= 3) return C.accent;
  return C.amber;
}

export function WorkspaceList() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  async function loadWorkspaces() {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase
      .from("workspaces")
      .select("id, name, stage, stage_statuses, share_token, created_at, updated_at")
      .order("updated_at", { ascending: false });
    setWorkspaces((data as Workspace[]) || []);
    setLoading(false);
  }

  async function createWorkspace() {
    if (!supabase || !newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name: newName.trim(), stage: 1, stage_statuses: {} })
      .select("id")
      .single();
    setCreating(false);
    if (!error && data) {
      setShowCreate(false);
      setNewName("");
      navigate(`/workspace/${data.id}`);
    }
  }

  function copyLink(ws: Workspace) {
    const url = `${window.location.origin}${window.location.pathname}#/portal/${ws.share_token}`;
    navigator.clipboard.writeText(url);
    setCopyToast(ws.id);
    setTimeout(() => setCopyToast(null), 2000);
  }

  const filtered = workspaces.filter(ws =>
    ws.name.toLowerCase().includes(search.toLowerCase())
  );

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return "Today";
    if (d === 1) return "Yesterday";
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    return `${Math.floor(d / 30)}mo ago`;
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: body }}>
      {/* Top nav */}
      <div style={{ background: C.canvas, borderBottom: `1px solid ${C.border}`, padding: "0 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", height: 56, gap: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.accent, fontFamily: head, letterSpacing: "-0.01em" }}>
            B2B Rocket
          </div>
          <div style={{ width: 1, height: 18, background: C.border }} />
          <div style={{ fontSize: 12, color: C.text, fontFamily: head, fontWeight: 600 }}>CX Workspaces</div>
          <div style={{ flex: 1 }} />
          <a href="/" style={{ fontSize: 12, color: C.muted, textDecoration: "none", fontFamily: head }}>
            ← LaunchPad
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
              CX v2
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, fontFamily: head, marginBottom: 6, letterSpacing: "-0.02em" }}>
              Client Workspaces
            </h1>
            <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.5 }}>
              {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} · 7-stage client lifecycle
            </p>
          </div>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: C.accent, color: "#fff",
              fontSize: 12.5, fontWeight: 700, fontFamily: head, cursor: "pointer",
              boxShadow: `0 2px 12px ${C.accent}40`, transition: "all .2s" }}
            onMouseEnter={e => (e.currentTarget.style.background = C.accentHi)}
            onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>
            + New Workspace
          </button>
        </div>

        {/* Search */}
        {workspaces.length > 3 && (
          <div style={{ position: "relative", marginBottom: 20 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.muted, pointerEvents: "none" }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search workspaces…"
              style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 9,
                border: `1px solid ${C.border}`, background: C.canvas, color: C.text,
                fontSize: 13.5, fontFamily: body, outline: "none", boxSizing: "border-box" as const }} />
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowCreate(false); setNewName(""); } }}>
            <div style={{ background: C.canvas, borderRadius: 16, padding: 32, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: head, marginBottom: 6 }}>
                New Workspace
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
                Creates a new 7-stage client lifecycle workspace.
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginBottom: 6 }}>CLIENT / WORKSPACE NAME</div>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createWorkspace(); if (e.key === "Escape") { setShowCreate(false); setNewName(""); } }}
                placeholder="e.g. Acme Corp — 2026"
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 9,
                  padding: "11px 14px", fontSize: 14, color: C.text, fontFamily: body,
                  outline: "none", boxSizing: "border-box" as const, marginBottom: 20 }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowCreate(false); setNewName(""); }}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "transparent", color: C.muted, fontSize: 13, fontFamily: head, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={createWorkspace} disabled={creating || !newName.trim()}
                  style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none",
                    background: creating || !newName.trim() ? C.muted : C.accent, color: "#fff",
                    fontSize: 13, fontWeight: 700, fontFamily: head,
                    cursor: creating || !newName.trim() ? "default" : "pointer" }}>
                  {creating ? "Creating…" : "Create & Open"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workspace grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: 13, fontFamily: mono }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🗂</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 8 }}>
              {workspaces.length === 0 ? "No workspaces yet" : "No results"}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
              {workspaces.length === 0 ? "Create a workspace to start the 7-stage client lifecycle." : "Try a different search."}
            </div>
            {workspaces.length === 0 && (
              <button onClick={() => setShowCreate(true)}
                style={{ padding: "10px 24px", borderRadius: 9, border: "none", background: C.accent, color: "#fff",
                  fontSize: 13, fontWeight: 700, fontFamily: head, cursor: "pointer" }}>
                + New Workspace
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {filtered.map(ws => {
              const done = stagesComplete(ws);
              const pct = Math.round((done / 7) * 100);
              const badgeColor = stageBadgeColor(ws);
              const isCopied = copyToast === ws.id;

              return (
                <div key={ws.id}
                  style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14,
                    padding: 20, cursor: "pointer", transition: "all .18s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                  onClick={() => navigate(`/workspace/${ws.id}`)}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.accentBorder; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px ${C.accent}15`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}>

                  {/* Name + stage badge */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, fontFamily: head, lineHeight: 1.3, flex: 1, paddingRight: 8 }}>
                      {ws.name}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: badgeColor, fontFamily: mono,
                      background: `${badgeColor}15`, padding: "3px 8px", borderRadius: 5, flexShrink: 0, whiteSpace: "nowrap" }}>
                      {done === 7 ? "COMPLETE" : `STAGE ${ws.stage}`}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ background: C.surface, borderRadius: 4, height: 5, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${badgeColor})`,
                      width: `${pct}%`, borderRadius: 4, transition: "width .4s" }} />
                  </div>

                  {/* Stage pills */}
                  <div style={{ display: "flex", gap: 3, marginBottom: 14, flexWrap: "wrap" }}>
                    {STAGE_LABELS.map((label, i) => {
                      const num = i + 1;
                      const approved = Object.values(ws.stage_statuses || {}).filter(v => v === "approved").length;
                      const isDone = num <= Math.max(ws.stage - 1, approved);
                      const isActive = num === ws.stage;
                      return (
                        <div key={num} style={{ fontSize: 9.5, fontFamily: mono, fontWeight: 600,
                          padding: "2px 6px", borderRadius: 4,
                          background: isDone ? C.greenLo : isActive ? C.accentLo : C.surface,
                          color: isDone ? C.green : isActive ? C.accent : C.muted,
                          border: `1px solid ${isDone ? C.greenBorder : isActive ? C.accentBorder : "transparent"}` }}>
                          {label}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>
                      {timeAgo(ws.updated_at)}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); copyLink(ws); }}
                      style={{ fontSize: 11, color: isCopied ? C.green : C.muted,
                        background: "none", border: `1px solid ${isCopied ? C.greenBorder : C.border}`,
                        borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                        fontFamily: head, fontWeight: 600, transition: "all .15s" }}>
                      {isCopied ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
