import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Stage1_Handoff } from "./stages/Stage1_Handoff";
import { Stage5_Onboarding } from "./stages/Stage5_Onboarding";
import { Stage6_CommLog } from "./stages/Stage6_CommLog";
import { Stage7_Analytics } from "./stages/Stage7_Analytics";

const C = {
  bg: "#F8F9FE", canvas: "#FFFFFF", surface: "#F3F4FB", border: "#EDF2F7",
  borderHi: "#D8DEE9", text: "#2D3436", textSoft: "#636E82", muted: "#8E94A7",
  accent: "#6C5CE7", accentLo: "#6C5CE70D", accentMid: "#6C5CE722",
  accentHi: "#5A4BD6", accentBorder: "#6C5CE733",
  green: "#00D68F", greenLo: "#00D68F0F", greenBorder: "#00D68F33",
  amber: "#FFC048", amberLo: "#FFC0480F",
  red: "#FF6B6B",
};
const head = "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";

interface Workspace {
  id: string;
  name: string;
  stage: number;
  stage_statuses: Record<string, "approved" | "in_progress" | "pending">;
  share_token: string;
  client_id: string | null;
}

const STAGES = [
  { num: 1, label: "Sales Handoff", icon: "📞", description: "Transcript → structured handoff doc" },
  { num: 2, label: "Client Research", icon: "🔍", description: "Website → company profile + ICP" },
  { num: 3, label: "Domain Targeting", icon: "🎯", description: "67 domains → review & lock" },
  { num: 4, label: "Campaign Strategy", icon: "📋", description: "Sequences → review & approve" },
  { num: 5, label: "Onboarding", icon: "✅", description: "Onboarding call → doc updates" },
  { num: 6, label: "Comm Log", icon: "💬", description: "Touchpoints → AI flags" },
  { num: 7, label: "Analytics", icon: "📊", description: "B2B Rocket CSV → scorecard" },
];

function stageStatus(ws: Workspace, stageNum: number): "approved" | "active" | "locked" | "pending" {
  const status = ws.stage_statuses?.[String(stageNum)];
  if (status === "approved") return "approved";
  if (stageNum === ws.stage) return "active";
  if (stageNum < ws.stage) return "approved";
  return "locked";
}

export function WorkspaceShell() {
  const { id } = useParams<{ id: string }>();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeStage, setActiveStage] = useState(1);

  useEffect(() => {
    if (!id || !supabase) { setNotFound(true); setLoading(false); return; }
    supabase
      .from("workspaces")
      .select("id, name, stage, stage_statuses, share_token, client_id")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); }
        else {
          setWs(data as Workspace);
          setActiveStage(data.stage || 1);
        }
        setLoading(false);
      });
  }, [id]);

  function refreshWs() {
    if (!id || !supabase) return;
    supabase
      .from("workspaces")
      .select("id, name, stage, stage_statuses, share_token, client_id")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (data) setWs(data as Workspace); });
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>
        <div style={{ fontSize: 13, color: C.muted, fontFamily: mono }}>Loading workspace…</div>
      </div>
    );
  }

  if (notFound || !ws) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 8 }}>Workspace not found</div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: body, marginBottom: 20 }}>
            This workspace ID doesn't exist or hasn't been migrated to CX v2 yet.
          </div>
          <a href="/" style={{ fontSize: 13, color: C.accent, textDecoration: "none", fontFamily: head, fontWeight: 600 }}>
            ← Back to accounts
          </a>
        </div>
      </div>
    );
  }

  const stage = STAGES.find(s => s.num === activeStage)!;

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: body }}>
      {/* Sidebar */}
      <div style={{ width: 240, flexShrink: 0, background: C.canvas, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {/* Workspace header */}
        <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${C.border}` }}>
          <a href="/" style={{ fontSize: 11, color: C.muted, textDecoration: "none", fontFamily: mono,
            display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
            ← Accounts
          </a>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: head, lineHeight: 1.3 }}>
            {ws.name}
          </div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginTop: 4 }}>
            Stage {ws.stage} of 7
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 10, background: C.surface, borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", background: C.accent, borderRadius: 4,
              width: `${Math.round((ws.stage / 7) * 100)}%`, transition: "width .4s" }} />
          </div>
        </div>

        {/* Stage list */}
        <div style={{ padding: "8px 0", flex: 1 }}>
          {STAGES.map(s => {
            const status = stageStatus(ws, s.num);
            const isActive = activeStage === s.num;
            const isLocked = status === "locked";

            return (
              <div key={s.num}
                onClick={() => { if (!isLocked) setActiveStage(s.num); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                  cursor: isLocked ? "default" : "pointer", opacity: isLocked ? 0.45 : 1,
                  background: isActive ? C.accentLo : "transparent",
                  borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent",
                  transition: "all .12s" }}>

                {/* Status dot */}
                <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: status === "approved" ? C.green : status === "active" ? C.accent : C.surface,
                  border: `2px solid ${status === "approved" ? C.green : status === "active" ? C.accent : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                  {status === "approved" && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                  {status !== "approved" && <span style={{ fontSize: 8.5, color: status === "active" ? "#fff" : C.muted, fontFamily: mono, fontWeight: 700 }}>{s.num}</span>}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: isActive ? 700 : 500, color: isActive ? C.accent : C.text,
                    fontFamily: head, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.icon} {s.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Share link */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/portal/${ws.share_token}`); }}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: `1px solid ${C.accentBorder}`,
              background: C.accentLo, color: C.accent, fontSize: 11, fontWeight: 700,
              fontFamily: head, cursor: "pointer", transition: "all .15s" }}>
            Copy Client Link
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px" }}>
          {activeStage === 1 && (
            <Stage1_Handoff workspaceId={ws.id} onApprove={() => { refreshWs(); setActiveStage(2); }} />
          )}
          {activeStage === 2 && <LaunchPadStub stageNum={2} label="Client Research" workspaceId={ws.id} />}
          {activeStage === 3 && <LaunchPadStub stageNum={3} label="Domain Targeting" workspaceId={ws.id} />}
          {activeStage === 4 && <LaunchPadStub stageNum={4} label="Campaign Strategy & Content" workspaceId={ws.id} />}
          {activeStage === 5 && (
            <Stage5_Onboarding workspaceId={ws.id} onApprove={() => { refreshWs(); setActiveStage(6); }} />
          )}
          {activeStage === 6 && <Stage6_CommLog workspaceId={ws.id} />}
          {activeStage === 7 && <Stage7_Analytics workspaceId={ws.id} />}
        </div>
      </div>
    </div>
  );
}

function LaunchPadStub({ stageNum, label, workspaceId }: { stageNum: number; label: string; workspaceId: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
        STAGE {stageNum}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>{label}</h2>
      <p style={{ fontSize: 13.5, color: C.textSoft, lineHeight: 1.6, marginBottom: 24 }}>
        This stage runs in the existing LaunchPad workspace.
      </p>
      <div style={{ background: C.surface, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, color: C.text, fontFamily: head, fontWeight: 600, marginBottom: 8 }}>
          Open in LaunchPad
        </div>
        <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6, marginBottom: 16 }}>
          Stage {stageNum} is powered by the existing LaunchPad pipeline. Open the account from the main dashboard to run it.
        </div>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
          borderRadius: 8, background: C.accent, color: "#fff", textDecoration: "none",
          fontSize: 12.5, fontWeight: 700, fontFamily: head, boxShadow: `0 2px 8px ${C.accent}40` }}>
          ← Back to Accounts
        </a>
      </div>
    </div>
  );
}

function ComingSoon({ stageNum, label }: { stageNum: number; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.accent, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
        STAGE {stageNum}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: head, marginBottom: 6 }}>{label}</h2>
      <div style={{ background: C.surface, borderRadius: 12, padding: 32, border: `1px solid ${C.border}`, textAlign: "center", marginTop: 20 }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🚧</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: head, marginBottom: 6 }}>Coming in Phase 3</div>
        <div style={{ fontSize: 13, color: C.muted }}>This stage is on the roadmap and will be available soon.</div>
      </div>
    </div>
  );
}
