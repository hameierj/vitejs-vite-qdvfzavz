import { useEffect, useRef, useState } from "react";

const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";
const ACCENT = "#6C5CE7";

interface Props {
  // While true, the clock ticks. When it flips false the badge disappears.
  running: boolean;
  // Optional anchor (epoch ms) so the clock survives reloads / navigation and
  // reflects the true server-side start. Falls back to when `running` turned on.
  startedAt?: number | null;
  // Optional label shown above the time (defaults to "ELAPSED").
  label?: string;
}

// Fixed top-right elapsed-time clock shown while a Getting Started step runs
// (research, ICP scoring, campaign generation).
export function ElapsedTimer({ running, startedAt, label = "ELAPSED" }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) { startRef.current = null; return; }
    startRef.current = startedAt ?? Date.now();
    const tick = () => {
      if (startRef.current != null) {
        setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  if (!running) return null;

  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const time = `${mm}:${String(ss).padStart(2, "0")}`;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 24,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderRadius: 10,
        background: "#FFFFFF",
        border: `1px solid ${ACCENT}33`,
        boxShadow: "0 6px 20px rgba(108,92,231,0.18)",
        fontFamily: head,
        animation: "elapsedIn .25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <style>{`
        @keyframes elapsedIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        @keyframes elapsedSpin { to { transform: rotate(360deg); } }
      `}</style>
      <div
        style={{
          width: 13,
          height: 13,
          borderRadius: "50%",
          border: `2px solid ${ACCENT}`,
          borderTopColor: "transparent",
          animation: "elapsedSpin .8s linear infinite",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span style={{ fontSize: 8.5, fontFamily: mono, fontWeight: 700, letterSpacing: 0.6, color: "#8E94A7" }}>
          {label}
        </span>
        <span style={{ fontSize: 14, fontFamily: mono, fontWeight: 700, color: ACCENT, fontVariantNumeric: "tabular-nums" }}>
          {time}
        </span>
      </div>
    </div>
  );
}
