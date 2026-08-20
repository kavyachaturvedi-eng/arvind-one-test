"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Strategic Moves — network-wide inter-store transfers, ranked by the money
// they unlock: cross-region rebalances and capsule consolidation, as a queue
// with an approve button that writes real pick and receipt tasks.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { DAY, NOW, STORES, styleById } from "@/lib/seed";
import { strategicMoves, vitalsFor, type StrategicMove } from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  BeforeAfter,
  Callout,
  Card,
  Chip,
  Empty,
  SectionTitle,
  Stat,
  StatusDot,
  Swatch,
  Tabs,
  inr,
  pct,
} from "@/components/ui";

const MOVES = strategicMoves(14);

/** Same-day courier lane, straight out of the IST policy. */
const SAME_DAY_KM = 40;

type MoveType = "repair" | "chase";
type TabId = MoveType | "all";

/**
 * Move type. A move that restores a missing core size inside its own region is
 * a size-set repair — a local fix. The same signal with the units crossing a
 * region boundary is chasing demand: a seasonal, cross-region rebalance.
 */
function moveType(m: StrategicMove): MoveType {
  const repairsSize = /missing size/i.test(m.rationale);
  const crossRegion = m.from.region !== m.to.region;
  return repairsSize && !crossRegion ? "repair" : "chase";
}

const REJECT_REASONS = [
  "Donor needs it",
  "Customer promise",
  "Logistics cost",
  "Seasonally wrong",
] as const;

interface Decision {
  status: "approved" | "rejected";
  reason?: string;
}

export default function StrategicMoves() {
  const app = useApp();
  const [tab, setTab] = useState<TabId>("all");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(60000);

  const counts = useMemo(
    () => ({
      repair: MOVES.filter((m) => moveType(m) === "repair").length,
      chase: MOVES.filter((m) => moveType(m) === "chase").length,
    }),
    []
  );

  const visible = useMemo(() => (tab === "all" ? MOVES : MOVES.filter((m) => moveType(m) === tab)), [tab]);

  const totals = useMemo(() => {
    const units = MOVES.reduce((a, m) => a + m.units, 0);
    const value = MOVES.reduce((a, m) => a + m.valueUnlocked, 0);
    const dist = MOVES.reduce((a, m) => a + m.distanceKm, 0) / Math.max(1, MOVES.length);
    const sameDay = MOVES.filter((m) => m.distanceKm <= SAME_DAY_KM).length;
    return { units, value, dist, sameDay, sameDayShare: sameDay / Math.max(1, MOVES.length) };
  }, []);

  const bulkTargets = useMemo(
    () => visible.filter((m) => !decisions[m.id] && m.valueUnlocked >= threshold),
    [visible, decisions, threshold]
  );
  const maxValue = Math.max(...MOVES.map((m) => m.valueUnlocked));

  // ── Actions ────────────────────────────────────────────────────────────────
  function createTasks(m: StrategicMove) {
    app.dispatch({
      type: "task:create",
      task: {
        id: `SM-PICK-${m.id}`,
        storeId: m.from.id,
        title: `Pick ${m.units} × ${m.styleName} (size ${m.size}) for transfer`,
        detail: `Strategic move ${m.id} to ${m.to.name}, ${m.distanceKm.toFixed(0)} km. ${m.rationale}`,
        origin: "ist",
        assignedTo: `${m.from.name} team`,
        dueAt: NOW + DAY,
        priority: 2,
        status: "todo",
        requiresPhoto: false,
        photoAttached: false,
        valueAtRisk: m.valueUnlocked,
        slaHours: 24,
      },
    });
    app.dispatch({
      type: "task:create",
      task: {
        id: `SM-RECV-${m.id}`,
        storeId: m.to.id,
        title: `Receive and floor ${m.units} × ${m.styleName} (size ${m.size})`,
        detail: `Strategic move ${m.id} from ${m.from.name}. Restores the size run — put it on the faceout, not in the back room.`,
        origin: "ist",
        assignedTo: `${m.to.name} team`,
        dueAt: NOW + 2 * DAY,
        priority: 2,
        status: "todo",
        requiresPhoto: true,
        photoAttached: false,
        valueAtRisk: m.valueUnlocked,
        slaHours: 48,
      },
    });
  }

  function approve(m: StrategicMove) {
    createTasks(m);
    setDecisions((d) => ({ ...d, [m.id]: { status: "approved" } }));
    setRejecting(null);
    app.toastNow(`Approved — ${inr(m.valueUnlocked, { compact: true })} unlocked, pick and receipt tasks created`, "good");
  }

  function reject(m: StrategicMove, reason: string) {
    setDecisions((d) => ({ ...d, [m.id]: { status: "rejected", reason } }));
    setRejecting(null);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `Rejected strategic move — ${reason}`, object: m.id, system: "Arvind One" },
    });
    app.toastNow(`Rejected: ${reason.toLowerCase()} — reason recorded and fed back into the next run`, "warn");
  }

  function approveBulk() {
    if (!bulkTargets.length) {
      app.toastNow("No undecided moves above that value.", "info");
      return;
    }
    const value = bulkTargets.reduce((a, m) => a + m.valueUnlocked, 0);
    const next: Record<string, Decision> = {};
    for (const m of bulkTargets) {
      createTasks(m);
      next[m.id] = { status: "approved" };
    }
    setDecisions((d) => ({ ...d, ...next }));
    app.toastNow(`${bulkTargets.length} moves approved — ${inr(value, { compact: true })} unlocked, ${bulkTargets.length * 2} tasks created`, "good");
  }

  const decidedCount = Object.keys(decisions).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Strategic Moves</h1>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Moves proposed" value={String(MOVES.length)} sub={`${decidedCount} decided this session`} freshness={18} />
        <Stat label="Units involved" value={totals.units.toLocaleString("en-IN")} sub="all above a week's cover at the donor" />
        <Stat label="Value unlocked" value={inr(totals.value, { compact: true })} sub="at MRP, if every move is approved" emphasis />
        <Stat label="Average distance" value={`${totals.dist.toFixed(0)} km`} sub="donor store to receiving store" />
        <Stat
          label="Inside 40 km lane"
          value={pct(totals.sameDayShare)}
          tone={totals.sameDayShare >= 0.5 ? "good" : "warn"}
        />
      </div>

      {/* ── Queue ────────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle
          title="Ranked queue"
          right={
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { id: "repair", label: "Size-set repair", count: counts.repair },
                { id: "chase", label: "Chase demand", count: counts.chase },
                { id: "all", label: "All", count: MOVES.length },
              ]}
            />
          }
        />

        <div className="flex items-end gap-3 flex-wrap mb-3 pb-3 border-b border-line">
          <label className="block grow max-w-xs">
            <span className="label">Bulk approve threshold</span>
            <input
              type="range"
              min={0}
              max={Math.ceil(maxValue / 5000) * 5000}
              step={5000}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-2 w-full"
              aria-label="Minimum value unlocked for bulk approval"
            />
            <span className="text-2xs text-muted num">
              {inr(threshold)} and above · covers {bulkTargets.length} undecided move{bulkTargets.length === 1 ? "" : "s"} worth{" "}
              {inr(bulkTargets.reduce((a, m) => a + m.valueUnlocked, 0), { compact: true })}
            </span>
          </label>
          <button className="btn" disabled={!bulkTargets.length} onClick={approveBulk}>
            Approve all above {inr(threshold, { compact: true })}
          </button>
        </div>

        {visible.length === 0 ? (
          <Empty title="No moves in this group" body="Switch to All to see the rest of the queue." />
        ) : (
          <div className="space-y-2.5">
            {visible.map((m) => (
              <MoveRow
                key={m.id}
                m={m}
                decision={decisions[m.id]}
                rejecting={rejecting === m.id}
                onHover={setHover}
                onApprove={() => approve(m)}
                onStartReject={() => setRejecting(rejecting === m.id ? null : m.id)}
                onReject={(reason) => reject(m, reason)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ── Network map ──────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle
          title="The network, and what moves across it"
        />
        <NetworkMap moves={visible} hover={hover} onHover={setHover} decisions={decisions} />
      </Card>

      {/* ── Constraints ──────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle title="Rules the engine respected" />
        <ul className="space-y-2">
          {[
            ["Donor stays above its norm floor", "A store is never asked to give up stock it is selling at least as fast as the receiver. Moving the problem is not solving it."],
            [`Inside the ${SAME_DAY_KM} km same-day lane, or flagged`, `Moves under ${SAME_DAY_KM} km go on the same-day courier lane. Longer lanes are still proposed — they are simply marked, and they carry the sign-off.`],
            ["Unit must be saleable", "Defective units and units already staged for outward are excluded before ranking, so an approved move cannot fail at the pick."],
            ["No duplicate lane in flight", "One open request per SKU per lane. The queue will not propose the same transfer twice while the first is moving."],
          ].map(([title, body]) => (
            <li key={title} className="flex items-start gap-2.5">
              <span className="mt-1.5"><StatusDot tone="good" /></span>
              <div>
                <div className="text-xs font-semibold text-ink">{title}</div>
                <div className="text-xs text-ink2 leading-relaxed mt-0.5">{body}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Callout tone="brand" title="Rejections feed the next run">
            Every rejection is stored with its reason. A move turned down because the donor needed it is a different
            signal from one turned down on logistics cost — the first tunes the norm floor, the second tunes the lane
            radius.
          </Callout>
        </div>
      </Card>
    </div>
  );
}

// ── Move row ─────────────────────────────────────────────────────────────────

function MoveRow({
  m,
  decision,
  rejecting,
  onHover,
  onApprove,
  onStartReject,
  onReject,
}: {
  m: StrategicMove;
  decision?: Decision;
  rejecting: boolean;
  onHover: (id: string | null) => void;
  onApprove: () => void;
  onStartReject: () => void;
  onReject: (reason: string) => void;
}) {
  const style = styleById(m.styleId);
  const type = moveType(m);
  const rejected = decision?.status === "rejected";
  const approved = decision?.status === "approved";

  return (
    <div
      onMouseEnter={() => onHover(m.id)}
      onMouseLeave={() => onHover(null)}
      className={`rounded-lg border p-3 transition-opacity ${rejected ? "opacity-55 border-line" : "border-line"}`}
      style={approved ? { borderColor: "var(--status-good)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm text-ink font-medium flex items-center gap-1.5 flex-wrap">
            <span>{m.from.name}</span>
            <span className="text-muted">→</span>
            <span>{m.to.name}</span>
            <span className="text-2xs text-muted num">{m.distanceKm.toFixed(0)} km</span>
            {m.distanceKm <= SAME_DAY_KM ? <Chip tone="good">Same-day lane</Chip> : <Chip tone="warn">Needs sign-off</Chip>}
            <Chip tone={type === "repair" ? "brand" : "neutral"}>{type === "repair" ? "Size-set repair" : "Chase demand"}</Chip>
          </div>
          <div className="text-2xs text-muted mt-1 flex items-center gap-1.5 flex-wrap">
            <Swatch hex={style.colourHex} label={`${m.styleName} · size ${m.size} · ${m.units} units`} />
            <span>· {m.from.region} → {m.to.region}</span>
          </div>
          <div className="text-xs text-ink2 leading-snug mt-1.5 max-w-2xl">{m.rationale}</div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-lg font-semibold text-ink num leading-none">{inr(m.valueUnlocked, { compact: true })}</div>
          <div className="text-2xs text-muted mt-1">value unlocked · {pct(m.confidence)} confidence</div>
        </div>
      </div>

      {rejected ? (
        <div className="mt-2.5 text-2xs text-ink2 flex items-center gap-1.5">
          <StatusDot tone="neutral" />
          Rejected — {decision?.reason}. Recorded against this lane and fed into the next run.
        </div>
      ) : approved ? (
        <div className="mt-2.5 text-2xs flex items-center gap-1.5" style={{ color: "var(--success-text)" }}>
          <StatusDot tone="good" />
          Approved — pick task at {m.from.name}, receipt task at {m.to.name}.
        </div>
      ) : rejecting ? (
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-2xs text-muted mr-1">Why not?</span>
          {REJECT_REASONS.map((r) => (
            <button key={r} className="btn-ghost !px-2 !py-1 text-2xs border border-line" onClick={() => onReject(r)}>
              {r}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2 justify-end">
          <button className="btn !py-1.5 !px-2.5 text-xs" onClick={onStartReject}>
            Reject
          </button>
          <button className="btn-primary !py-1.5 !px-3 text-xs" onClick={onApprove}>
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

// ── Network map ──────────────────────────────────────────────────────────────

const W = 300;
const H = 340;
const PAD = 22;
const XS = STORES.map((s) => s.x);
const YS = STORES.map((s) => s.y);
const X0 = Math.min(...XS);
const X1 = Math.max(...XS);
const Y0 = Math.min(...YS);
const Y1 = Math.max(...YS);
const MAX_UNITS = Math.max(...STORES.map((s) => vitalsFor(s.id).sellableUnits));

const px = (x: number) => PAD + ((x - X0) / (X1 - X0)) * (W - 2 * PAD);
/** y is south→north on the grid, so it is inverted to put north at the top. */
const py = (y: number) => PAD + (1 - (y - Y0) / (Y1 - Y0)) * (H - 2 * PAD);
const radius = (units: number) => 2.5 + Math.sqrt(units / MAX_UNITS) * 7;

function NetworkMap({
  moves,
  hover,
  onHover,
  decisions,
}: {
  moves: StrategicMove[];
  hover: string | null;
  onHover: (id: string | null) => void;
  decisions: Record<string, Decision>;
}) {
  const live = moves.filter((m) => decisions[m.id]?.status !== "rejected");
  const donors = new Set(live.map((m) => m.from.id));
  const receivers = new Set(live.map((m) => m.to.id));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Store network with proposed transfers">
        {live.map((m) => {
          const active = hover === m.id;
          const x1 = px(m.from.x);
          const y1 = py(m.from.y);
          const x2 = px(m.to.x);
          const y2 = py(m.to.y);
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const back = radius(vitalsFor(m.to.id).sellableUnits) + 3;
          const hx = x2 - ux * back;
          const hy = y2 - uy * back;
          const colour = active ? "var(--series-1)" : "var(--baseline)";
          return (
            <g
              key={m.id}
              onMouseEnter={() => onHover(m.id)}
              onMouseLeave={() => onHover(null)}
              opacity={active ? 1 : hover ? 0.25 : 0.55}
            >
              <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={colour} strokeWidth={active ? 2 : 1} strokeLinecap="round" />
              <polygon
                points={`${hx},${hy} ${hx - ux * 7 - uy * 3.2},${hy - uy * 7 + ux * 3.2} ${hx - ux * 7 + uy * 3.2},${hy - uy * 7 - ux * 3.2}`}
                fill={colour}
              />
            </g>
          );
        })}

        {STORES.map((s) => {
          const v = vitalsFor(s.id);
          const isReceiver = receivers.has(s.id);
          const isDonor = donors.has(s.id);
          const fill = isReceiver ? "var(--series-1)" : isDonor ? "var(--series-2)" : "var(--surface-2)";
          const involved = isReceiver || isDonor;
          return (
            <g key={s.id}>
              <circle
                cx={px(s.x)}
                cy={py(s.y)}
                r={radius(v.sellableUnits)}
                fill={fill}
                stroke={involved ? "none" : "var(--baseline)"}
                strokeWidth={1}
                opacity={involved ? 0.9 : 0.5}
              >
                <title>{`${s.name} · ${s.city} · ${v.sellableUnits} sellable units`}</title>
              </circle>
              {involved && (
                <text x={px(s.x) + radius(v.sellableUnits) + 3} y={py(s.y) + 3} fontSize={8} fill="var(--text-muted)">
                  {s.city}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-4 mt-2">
        <LegendDot colour="var(--series-1)" label="Receiving store" />
        <LegendDot colour="var(--series-2)" label="Donor store" />
        <LegendDot colour="var(--surface-2)" label="Not in this list" outline />
        <span className="text-2xs text-muted">Dot size = sellable units · north is up · arrows point donor → receiver</span>
      </div>
    </div>
  );
}

function LegendDot({ colour, label, outline }: { colour: string; label: string; outline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-ink2">
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ background: colour, border: outline ? "1px solid var(--baseline)" : "none" }}
      />
      {label}
    </span>
  );
}
