"use client";
import type { AuditEvent, Decision, NodeId } from "@/lib/types";
import { DECISION_RANK } from "@/lib/labels";

/*
  The agent architecture laid out after Fig. 4 of Kim et al., "The Attack and
  Defense Landscape of Agentic AI" (the user, the agent's interface, LLM,
  workflow and memory, other agents, tools, and the outside world), with the
  payment rail Sudibran adds. Each run draws its path across it.
*/

type Box = { x: number; y: number; w: number; h: number };
type Zone = Box & { label: string; sub: string; shield: boolean };

const Z: Record<NodeId, Zone> = {
  maya: { x: 235, y: 6, w: 170, h: 50, label: "User", sub: "Maya · AP clerk", shield: false },
  gate: { x: 175, y: 98, w: 420, h: 72, label: "User interface", sub: "Sudibran gate · intent + input checks", shield: true },
  parser: { x: 175, y: 214, w: 135, h: 132, label: "LLM", sub: "Parser · no tools", shield: true },
  planner: { x: 345, y: 250, w: 115, h: 82, label: "Planner", sub: "Proposes actions", shield: false },
  policy: { x: 470, y: 250, w: 115, h: 82, label: "Policy", sub: "Sudibran rules", shield: true },
  memory: { x: 175, y: 372, w: 420, h: 70, label: "Memory", sub: "Session trace · long-term · RAG", shield: true },
  broker: { x: 175, y: 460, w: 420, h: 60, label: "Credentials", sub: "Broker · one-time payment tokens", shield: true },
  seller: { x: 0, y: 226, w: 142, h: 116, label: "Other agents", sub: "Acme's AI", shield: true },
  proxy: { x: 645, y: 150, w: 100, h: 300, label: "Tool", sub: "MCP proxy", shield: true },
  invoice_reader: { x: 785, y: 98, w: 190, h: 110, label: "External data", sub: "Invoices · web", shield: true },
  crs: { x: 795, y: 270, w: 82, h: 96, label: "CRS", sub: "Fraud check", shield: true },
  nessie: { x: 885, y: 270, w: 82, h: 96, label: "Bank", sub: "Nessie", shield: false },
  supplier_db: { x: 785, y: 410, w: 190, h: 110, label: "Private data", sub: "Supplier records", shield: true },
};

const FRAMES: (Box & { label: string; strong?: boolean; bottom?: boolean })[] = [
  { x: 152, y: 66, w: 466, h: 476, label: "Maya's AI agent", strong: true },
  { x: 332, y: 214, w: 266, h: 132, label: "Agent workflow", bottom: true },
  { x: 768, y: 66, w: 224, h: 476, label: "External environment", strong: true },
  { x: 785, y: 238, w: 190, h: 140, label: "Payment rail" },
];

const COLOR: Record<Decision, { fg: string; bg: string }> = {
  allow: { fg: "#0f6a5a", bg: "#e6f1ee" },
  flag: { fg: "#b86e00", bg: "#fdf1dc" },
  deny: { fg: "#b42318", bg: "#fbecea" },
  ask: { fg: "#8d6f00", bg: "#f9f0c8" },
  hold: { fg: "#626a78", bg: "#e9ebef" },
};

const center = (n: NodeId) => ({ x: Z[n].x + Z[n].w / 2, y: Z[n].y + Z[n].h / 2 });

function curve(a: NodeId, b: NodeId) {
  const p = center(a);
  const q = center(b);
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(60, len * 0.18);
  return `M${p.x},${p.y} Q${mx - (dy / len) * bend},${my + (dx / len) * bend} ${q.x},${q.y}`;
}

function Shield({ x, y, fill }: { x: number; y: number; fill: string }) {
  return <path transform={`translate(${x},${y})`} d="M8 0 15 3v5.2c0 4.3-3 7.6-7 8.8C4 15.8 1 12.5 1 8.2V3l7-3Z" fill={fill} />;
}

export type EndState = { text: string; tone: Decision } | null;

export function Fig4Map({
  events,
  focus,
  target,
  end,
  quarantined,
  onZone,
  selectable = false,
  selected = null,
}: {
  events: AuditEvent[];
  focus: number;
  target: NodeId | null;
  end: EndState;
  quarantined: NodeId[];
  onZone: (n: NodeId) => void;
  /** Every layer is clickable, for exploring the architecture. */
  selectable?: boolean;
  selected?: NodeId | null;
}) {
  // Worst decision per zone so far, and where the numbered markers stack.
  const worst = new Map<NodeId, Decision>();
  const offCheck = new Set<NodeId>();
  const rule = new Map<NodeId, { r: string; d: Decision }>();
  events.forEach((e) => {
    if (e.off) {
      offCheck.add(e.node);
      return;
    }
    const w = worst.get(e.node);
    if (!w || DECISION_RANK[e.decision] > DECISION_RANK[w]) worst.set(e.node, e.decision);
    if (e.rule && e.decision !== "allow") rule.set(e.node, { r: e.rule, d: e.decision });
  });
  const focusNode = events[focus]?.node;
  const stackCount = new Map<NodeId, number>();

  return (
    <svg viewBox="0 0 1000 600" className="h-full w-full" role="img" aria-label="Agent architecture after Fig. 4, with this run's path">
      <defs>
        <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#cfd8d4" />
        </pattern>
        {(Object.keys(COLOR) as Decision[]).map((d) => (
          <marker key={d} id={`arrow-${d}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLOR[d].fg} />
          </marker>
        ))}
      </defs>
      <rect width="1000" height="600" fill="url(#dots)" />

      {FRAMES.map((f) => (
        <g key={f.label}>
          <rect
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={f.strong ? 18 : 12}
            fill={f.strong ? "rgba(255,255,255,0.7)" : "rgba(237,240,237,0.8)"}
            stroke={f.strong ? "#b7c2be" : "#cbd3d0"}
            strokeWidth={f.strong ? 1.5 : 1}
            strokeDasharray={f.strong ? undefined : "4 4"}
          />
          <text x={f.x + 14} y={f.bottom ? f.y + f.h - 5 : f.y + (f.strong ? 22 : 16)} className="fill-ink-2" fontSize={f.strong ? 13 : 11} fontWeight={600}>
            {f.label}
          </text>
        </g>
      ))}

      {/* This run's path, drawn under the layers like wiring */}
      {events.map((e, i) => {
        if (i === 0) return null;
        const prev = events[i - 1];
        if (prev.node === e.node) return null;
        const d = e.off ? "hold" : e.decision;
        const newest = i === events.length - 1;
        return (
          <path
            key={e.seq}
            d={curve(prev.node, e.node)}
            fill="none"
            stroke={COLOR[d].fg}
            strokeWidth={newest ? 4 : 3}
            strokeLinecap="round"
            markerEnd={`url(#arrow-${d})`}
            pathLength={1}
            className={newest ? "trace-draw" : undefined}
            opacity={newest ? 1 : 0.75}
          />
        );
      })}

      {(Object.keys(Z) as NodeId[]).map((n) => {
        const z = Z[n];
        const d = worst.get(n);
        const c = d ? COLOR[d] : null;
        const isFocus = focusNode === n;
        const isTarget = target === n;
        const isQ = quarantined.includes(n);
        const isBank = n === "nessie";
        const r = rule.get(n);
        const touched = Boolean(d) || offCheck.has(n);
        return (
          <g key={n} onClick={() => (touched || selectable) && onZone(n)} style={{ cursor: touched || selectable ? "pointer" : "default" }}>
            {selected === n && <rect x={z.x - 6} y={z.y - 6} width={z.w + 12} height={z.h + 12} rx={15} fill="none" stroke="#15233f" strokeWidth={2.5} />}
            {isTarget && (
              <rect x={z.x - 7} y={z.y - 7} width={z.w + 14} height={z.h + 14} rx={16} fill="none" stroke="#b42318" strokeWidth={2} strokeDasharray="6 5" className="target-ring" />
            )}
            <rect
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              rx={12}
              fill={isBank && end ? COLOR[end.tone].bg : c ? c.bg : selected === n ? "#eef2fb" : "#ffffff"}
              stroke={isBank && end ? COLOR[end.tone].fg : offCheck.has(n) && !d ? "#77819a" : c ? c.fg : "#c9d2ce"}
              strokeWidth={c || (isBank && end) ? 2.5 : 1.5}
              strokeDasharray={(offCheck.has(n) && !d) || isQ ? "6 4" : undefined}
              className={isFocus ? "zone-focus" : undefined}
              style={{ transition: "fill 300ms, stroke 300ms", ["--zc" as string]: c?.fg ?? "#15233f" }}
            />
            <text x={z.x + 12} y={z.y + 24} fontSize={15} fontWeight={700} className={touched || isBank ? "fill-ink" : "fill-ink-2"}>
              {z.label}
            </text>
            <text x={z.x + 12} y={z.y + 41} fontSize={11.5} className="fill-ink-3">
              {isQ ? "Quarantined" : offCheck.has(n) && !d ? "Check switched off" : z.sub}
            </text>
            {isBank && (
              <>
                <text x={z.x + z.w / 2} y={z.y + 70} textAnchor="middle" fontSize={24} fontWeight={800} fill={end ? COLOR[end.tone].fg : "#9aa4b5"}>
                  $
                </text>
                {end && (
                  <text x={z.x + z.w / 2} y={z.y + z.h + 16} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={COLOR[end.tone].fg}>
                    {end.text}
                  </text>
                )}
              </>
            )}
            {z.shield && <Shield x={z.x + z.w - 24} y={z.y + 9} fill={c ? c.fg : selectable ? "#15233f" : "#b4bdca"} />}
            {r && (
              <g className="stamp-in">
                <rect x={z.x + z.w - 8 - Math.max(36, r.r.length * 8 + 10)} y={z.y + z.h - 26} width={Math.max(36, r.r.length * 8 + 10)} height={19} rx={5} fill={COLOR[r.d].fg} />
                <text x={z.x + z.w - 8 - Math.max(36, r.r.length * 8 + 10) / 2} y={z.y + z.h - 12} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">
                  {r.r}
                </text>
              </g>
            )}
            {isTarget && (
              <g>
                <rect x={z.x - 4} y={z.y - 22} width={92} height={18} rx={9} fill="#b42318" />
                <text x={z.x + 42} y={z.y - 9} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">
                  Threat targets
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Step numbers sit on top so the order always reads */}
      {events.map((e, i) => {
        const z = Z[e.node];
        const k = stackCount.get(e.node) ?? 0;
        stackCount.set(e.node, k + 1);
        const d = e.off ? "hold" : e.decision;
        const cx = z.x + 14 + k * 24;
        const cy = z.y + z.h - 14;
        return (
          <g key={`n-${e.seq}`} className={i === events.length - 1 ? "stamp-in" : undefined}>
            <circle cx={cx} cy={cy} r={11} fill={COLOR[d].fg} stroke="#fff" strokeWidth={2} />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#fff">
              {i + 1}
            </text>
          </g>
        );
      })}

      <g transform="translate(152,566)" fontSize={12} className="fill-ink-2">
        {(["allow", "flag", "ask", "deny", "hold"] as Decision[]).map((d, i) => (
          <g key={d} transform={`translate(${i * 92},0)`}>
            <rect width={12} height={12} rx={3} fill={COLOR[d].fg} />
            <text x={18} y={10.5}>
              {{ allow: "Allowed", flag: "Flagged", ask: "Asks Maya", deny: "Blocked", hold: "On hold" }[d]}
            </text>
          </g>
        ))}
        <g transform="translate(470,-2)">
          <Shield x={0} y={0} fill="#46526c" />
          <text x={22} y={12.5}>Sudibran check on this layer</text>
        </g>
      </g>
    </svg>
  );
}
