import { useRef, useEffect } from "react";

// Connected node graph for the ICP/TAM trees. Two layouts:
//   "tree"  (default) — a tidy left→right layered/hierarchical layout with
//            deterministic positions, crossing reduction, always-on labels and
//            zoom-to-fit. Best when you want every node + label legible.
//   "force" — an Obsidian-style force simulation (repulsion + springs).
// Self-contained canvas renderer, no external graph library. Pan, zoom, node
// drag, click-to-select, hover highlight. Callers supply nodes/links + a
// selection callback.

export interface FNode {
  id: string;
  type: string;        // category key, used for the caller's selection mapping
  label: string;
  color: string;
  r: number;           // base radius
  depth?: number;      // layer hint for "tree" / radial seed for "force" (root = 0)
  dim?: boolean;       // render faded (e.g. skeleton / low-value)
  urgent?: boolean;    // render a small red flag
}
export interface FLink { source: string; target: string; }

interface SimNode { id: string; x: number; y: number; vx: number; vy: number; fx: number | null; fy: number | null; ref: FNode; }

const head = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";
const DEFAULT_THEME = { bg: "#F8F9FE", canvas: "#FFFFFF", text: "#2D3436", muted: "#8E94A7", borderHi: "#D8DEE9", border: "#EDF2F7", accent: "#6C5CE7" };

const COL_W = 340;   // horizontal gap between layers
const ROW_H = 46;    // vertical gap between nodes in a layer
const LABEL_MAX = 40;

// Layered (Sugiyama-lite) layout: assign each node to a column by depth, order
// within columns to reduce edge crossings (barycenter sweeps), then space out.
function computeTreeLayout(nodes: FNode[], links: FLink[]): Map<string, { x: number; y: number }> {
  const ids = new Set(nodes.map(n => n.id));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  nodes.forEach(n => { childrenOf.set(n.id, []); parentsOf.set(n.id, []); });
  for (const l of links) {
    if (!ids.has(l.source) || !ids.has(l.target)) continue;
    childrenOf.get(l.source)!.push(l.target);
    parentsOf.get(l.target)!.push(l.source);
  }

  // Layer = provided depth (fallback: BFS distance from roots).
  const layerOf = new Map<string, number>();
  const hasDepth = nodes.every(n => typeof n.depth === "number");
  if (hasDepth) {
    nodes.forEach(n => layerOf.set(n.id, n.depth as number));
  } else {
    const roots = nodes.filter(n => parentsOf.get(n.id)!.length === 0).map(n => n.id);
    const queue = roots.map(id => [id, 0] as [string, number]);
    const seen = new Set(roots);
    roots.forEach(id => layerOf.set(id, 0));
    while (queue.length) {
      const [id, d] = queue.shift()!;
      for (const c of childrenOf.get(id)!) if (!seen.has(c)) { seen.add(c); layerOf.set(c, d + 1); queue.push([c, d + 1]); }
    }
    nodes.forEach(n => { if (!layerOf.has(n.id)) layerOf.set(n.id, 0); });
  }

  const maxLayer = Math.max(0, ...nodes.map(n => layerOf.get(n.id)!));
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);

  // Initial order: DFS from roots so siblings cluster under their parent.
  const visited = new Set<string>();
  const dfs = (id: string) => { if (visited.has(id)) return; visited.add(id); layers[layerOf.get(id)!].push(id); for (const c of childrenOf.get(id)!) dfs(c); };
  nodes.filter(n => parentsOf.get(n.id)!.length === 0).forEach(n => dfs(n.id));
  nodes.forEach(n => { if (!visited.has(n.id)) { visited.add(n.id); layers[layerOf.get(n.id)!].push(n.id); } });

  // Barycenter sweeps to reduce crossings.
  const rank = new Map<string, number>();
  layers.forEach(layer => layer.forEach((id, i) => rank.set(id, i)));
  const bary = (id: string, rel: Map<string, string[]>): number => {
    const ns = rel.get(id)!;
    if (!ns.length) return rank.get(id)!;
    return ns.reduce((s, n) => s + (rank.get(n) ?? 0), 0) / ns.length;
  };
  for (let iter = 0; iter < 6; iter++) {
    for (let L = 1; L <= maxLayer; L++) { layers[L].sort((a, b) => bary(a, parentsOf) - bary(b, parentsOf)); layers[L].forEach((id, i) => rank.set(id, i)); }
    for (let L = maxLayer - 1; L >= 0; L--) { layers[L].sort((a, b) => bary(a, childrenOf) - bary(b, childrenOf)); layers[L].forEach((id, i) => rank.set(id, i)); }
  }

  const coords = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, L) => {
    const offset = -(layer.length - 1) / 2;
    layer.forEach((id, i) => coords.set(id, { x: L * COL_W, y: (offset + i) * ROW_H }));
  });
  return coords;
}

export function ForceGraph({
  nodes, links, selectedId, onSelect, legend, hint, theme: themeProp, layout = "tree",
}: {
  nodes: FNode[];
  links: FLink[];
  selectedId: string | null;
  onSelect: (node: FNode) => void;
  legend?: { label: string; color: string }[];
  hint?: string;
  theme?: Partial<typeof DEFAULT_THEME>;
  layout?: "tree" | "force";
}) {
  const C = { ...DEFAULT_THEME, ...(themeProp || {}) };
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const byId = useRef<Map<string, SimNode>>(new Map());
  const linksRef = useRef<FLink[]>(links);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const alpha = useRef(1);
  const hoverId = useRef<string | null>(null);
  const selRef = useRef(selectedId);
  const fitRef = useRef<() => void>(() => {});
  selRef.current = selectedId;
  linksRef.current = links;
  const isTree = layout === "tree";

  // (Re)build whenever the set of node ids changes.
  const idSig = nodes.map(n => n.id).join("|");
  useEffect(() => {
    if (isTree) {
      const coords = computeTreeLayout(nodes, links);
      simRef.current = nodes.map(n => {
        const c = coords.get(n.id) || { x: 0, y: 0 };
        return { id: n.id, x: c.x, y: c.y, vx: 0, vy: 0, fx: null, fy: null, ref: n };
      });
      alpha.current = 0; // static layout — no physics
    } else {
      const prev = byId.current;
      const GOLDEN = 2.399963229728653;
      simRef.current = nodes.map((n, i) => {
        const old = prev.get(n.id);
        if (old) { old.ref = n; return old; }
        const ang = i * GOLDEN;
        const rad = (n.depth ?? 1) * 95 + 30;
        return { id: n.id, x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, vx: 0, vy: 0, fx: null, fy: null, ref: n };
      });
      alpha.current = 1;
    }
    byId.current = new Map(simRef.current.map(s => [s.id, s]));
    // Defer the fit until the canvas effect has wired fitRef + sized the canvas.
    requestAnimationFrame(() => fitRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSig, isTree]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
    };
    resize();

    // Fit all nodes (plus room for right-side labels) into the viewport.
    const fit = () => {
      const sim = simRef.current;
      if (!sim.length) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of sim) {
        minX = Math.min(minX, n.x - n.ref.r); maxX = Math.max(maxX, n.x + n.ref.r);
        minY = Math.min(minY, n.y - n.ref.r); maxY = Math.max(maxY, n.y + n.ref.r);
      }
      if (isTree) maxX += 230; // label allowance on the right
      const w = wrap.clientWidth, h = wrap.clientHeight;
      const pad = 48;
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      const k = Math.min((w - pad) / bw, (h - pad) / bh, 1.3);
      view.current.k = Math.max(0.08, k);
      view.current.x = w / 2 - view.current.k * (minX + maxX) / 2;
      view.current.y = h / 2 - view.current.k * (minY + maxY) / 2;
    };
    fitRef.current = fit;
    const ro = new ResizeObserver(() => { resize(); fit(); });
    ro.observe(wrap);
    fit();

    const LINK_DIST = 70, LINK_K = 0.05, REPULSE = 2800, CENTER_K = 0.018, DAMP = 0.82;
    const tick = () => {
      const sim = simRef.current;
      const a = alpha.current;
      if (!isTree && a > 0.004) {
        for (let i = 0; i < sim.length; i++) {
          const ni = sim[i];
          for (let j = i + 1; j < sim.length; j++) {
            const nj = sim[j];
            let dx = ni.x - nj.x, dy = ni.y - nj.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 0.01) { dx = (i - j) * 0.5 + 0.1; dy = 0.3; d2 = dx * dx + dy * dy; }
            const f = (REPULSE * a) / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            ni.vx += fx; ni.vy += fy; nj.vx -= fx; nj.vy -= fy;
          }
        }
        for (const link of linksRef.current) {
          const s = byId.current.get(link.source), t = byId.current.get(link.target);
          if (!s || !t) continue;
          const dx = t.x - s.x, dy = t.y - s.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const f = (d - LINK_DIST) * LINK_K * a;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          s.vx += fx; s.vy += fy; t.vx -= fx; t.vy -= fy;
        }
        for (const n of sim) {
          if (n.fx != null) { n.x = n.fx; n.y = n.fy!; n.vx = 0; n.vy = 0; continue; }
          n.vx -= n.x * CENTER_K * a;
          n.vy -= n.y * CENTER_K * a;
          n.vx *= DAMP; n.vy *= DAMP;
          n.x += n.vx; n.y += n.vy;
        }
        alpha.current = a * 0.985;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    const draw = () => {
      const w = canvas.width, h = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
      const { x: vx, y: vy, k } = view.current;
      ctx.translate(vx, vy); ctx.scale(k, k);
      const sel = selRef.current;
      const hov = hoverId.current;

      // Edges. In tree mode draw left→right elbow curves; else straight.
      ctx.lineWidth = 1 / k;
      for (const link of linksRef.current) {
        const s = byId.current.get(link.source), t = byId.current.get(link.target);
        if (!s || !t) continue;
        const active = sel && (sel === s.id || sel === t.id);
        ctx.strokeStyle = active ? C.accent + "AA" : C.borderHi + "88";
        ctx.beginPath();
        if (isTree) {
          const a = s.x <= t.x ? s : t, b = s.x <= t.x ? t : s; // left → right
          const mx = (a.x + b.x) / 2;
          ctx.moveTo(a.x, a.y);
          ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
        } else {
          ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
        }
        ctx.stroke();
      }

      ctx.font = `${12 / k}px ${head}`;
      ctx.textBaseline = "middle";
      for (const n of simRef.current) {
        const nd = n.ref;
        const isSel = sel === n.id;
        const isHov = hov === n.id;
        ctx.beginPath();
        ctx.arc(n.x, n.y, nd.r, 0, Math.PI * 2);
        ctx.globalAlpha = nd.dim ? 0.6 : 1;
        ctx.fillStyle = nd.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (isSel || isHov) {
          ctx.lineWidth = (isSel ? 3 : 2) / k;
          ctx.strokeStyle = isSel ? C.accent : nd.color;
          ctx.stroke();
        }
        if (nd.urgent) {
          ctx.beginPath();
          ctx.arc(n.x + nd.r * 0.8, n.y - nd.r * 0.8, 3 / k + 1, 0, Math.PI * 2);
          ctx.fillStyle = "#E17055"; ctx.fill();
        }
        // Labels: always in tree mode; for force, root/first-layer + hover/select.
        if (isTree || (nd.depth ?? 9) <= 1 || isSel || isHov) {
          ctx.fillStyle = C.text;
          ctx.font = `${(isSel ? 700 : 400)} ${12 / k}px ${head}`;
          ctx.fillText(nd.label.length > LABEL_MAX ? nd.label.slice(0, LABEL_MAX - 1) + "…" : nd.label, n.x + nd.r + 6, n.y);
        }
      }
    };

    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const { x, y, k } = view.current;
      return { x: (clientX - rect.left - x) / k, y: (clientY - rect.top - y) / k };
    };
    const hitTest = (clientX: number, clientY: number): SimNode | null => {
      const p = toWorld(clientX, clientY);
      const sim = simRef.current;
      for (let i = sim.length - 1; i >= 0; i--) {
        const n = sim[i];
        const dx = p.x - n.x, dy = p.y - n.y, rr = n.ref.r + 4;
        if (dx * dx + dy * dy <= rr * rr) return n;
      }
      return null;
    };

    let dragNode: SimNode | null = null;
    let panning = false;
    let last = { x: 0, y: 0 };
    let downAt = { x: 0, y: 0 };
    let moved = false;

    const onDown = (e: MouseEvent) => {
      downAt = { x: e.clientX, y: e.clientY }; moved = false;
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) { dragNode = hit; const p = toWorld(e.clientX, e.clientY); hit.fx = p.x; hit.fy = p.y; hit.x = p.x; hit.y = p.y; if (!isTree) alpha.current = Math.max(alpha.current, 0.4); }
      else { panning = true; last = { x: e.clientX, y: e.clientY }; }
    };
    const onMove = (e: MouseEvent) => {
      if (Math.abs(e.clientX - downAt.x) > 3 || Math.abs(e.clientY - downAt.y) > 3) moved = true;
      if (dragNode) {
        const p = toWorld(e.clientX, e.clientY);
        dragNode.fx = p.x; dragNode.fy = p.y; dragNode.x = p.x; dragNode.y = p.y;
        if (!isTree) alpha.current = Math.max(alpha.current, 0.3);
      } else if (panning) {
        view.current.x += e.clientX - last.x; view.current.y += e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
      } else {
        const hit = hitTest(e.clientX, e.clientY);
        const id = hit?.id ?? null;
        if (id !== hoverId.current) { hoverId.current = id; canvas.style.cursor = id ? "pointer" : "grab"; }
      }
    };
    const onUp = () => {
      if (dragNode) {
        if (!moved) onSelect(dragNode.ref);
        if (!isTree) { dragNode.fx = null; dragNode.fy = null; } // release to the sim
        dragNode = null;
      }
      panning = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const { x, y, k } = view.current;
      const nk = Math.min(4, Math.max(0.06, k * Math.exp(-e.deltaY * 0.0015)));
      view.current.x = mx - ((mx - x) / k) * nk;
      view.current.y = my - ((my - y) / k) * nk;
      view.current.k = nk;
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.style.cursor = "grab";

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect, isTree]);

  return (
    <div ref={wrapRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: C.bg, minHeight: 0 }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {legend && legend.length > 0 && (
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column", gap: 5, background: C.canvas + "EE", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
          {legend.map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontFamily: head, color: C.muted }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
              {l.label}
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => fitRef.current()}
        style={{ position: "absolute", top: 12, right: 12, padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.canvas + "EE", color: C.muted, fontSize: 11.5, fontFamily: head, fontWeight: 600, cursor: "pointer" }}
        title="Fit to view"
      >⤢ Fit</button>
      <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 10.5, fontFamily: mono, color: C.muted }}>
        {hint || "scroll to zoom · drag node to move · drag canvas to pan · click node to select"}
      </div>
    </div>
  );
}
