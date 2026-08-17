"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Reallocation — a ranked, conserved, explainable re-cut of units already
// bought, using the freshest store signals, that writes allocation
// instructions back to D365.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { DAY, NOW, STOCK, STYLES, styleById } from "@/lib/seed";
import { daysLeftInWindow, reallocationPlan, styleTrueRos, vitalsFor } from "@/lib/engine";
import { sellThroughUplift } from "@/lib/rules";
import { useApp } from "@/lib/state";
import {
  BeforeAfter,
  Callout,
  Card,
  Chip,
  Delta,
  Empty,
  SectionTitle,
  Stat,
  Swatch,
  Table,
  Td,
  Th,
  inr,
  pct,
} from "@/components/ui";
import type { Store } from "@/lib/types";

// ── Model constants (stated on screen, never hidden) ─────────────────────────

/** AW26 drop 1 lands in 21 days — selling days start after that. */
const LANDING_DAYS = 21;
/** Typical EOSS depth on residual units, same factor the markdown model uses. */
const MARKDOWN_DEPTH = 0.38;
/** Gross margin on apparel at MRP. */
const GROSS_MARGIN = 0.55;
/** Weighting on True ROS runs 35% → 85%; 60% is the governed default. */
const W_MIN = 0.35;
const W_SPAN = 0.5;

const PRESETS = [
  { id: "protect", label: "Protect the plan", w: 0 },
  { id: "balanced", label: "Balanced", w: 50 },
  { id: "demand", label: "Follow demand", w: 100 },
] as const;

const UNIT_PRESETS = [3000, 6000, 12000];

/** Widest-distribution Tommy Hilfiger style — computed, not hard-coded. */
const DEFAULT_STYLE_ID = (() => {
  const reach = new Map<string, Set<string>>();
  for (const r of STOCK) {
    if (!reach.has(r.styleId)) reach.set(r.styleId, new Set());
    reach.get(r.styleId)!.add(r.storeId);
  }
  return STYLES.filter((s) => s.brand === "Tommy Hilfiger").sort(
    (a, b) => (reach.get(b.id)?.size ?? 0) - (reach.get(a.id)?.size ?? 0) || b.bought - a.bought
  )[0].id;
})();

interface Row {
  store: Store;
  planned: number;
  recommended: number;
  delta: number;
  reason: string;
  confidence: number;
  ros: number;
  achievement: number;
  fillRate: number;
  lowFill: boolean;
}

export default function Reallocation() {
  const app = useApp();
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);
  const [unitsText, setUnitsText] = useState("6000");
  const [weight, setWeight] = useState(50);
  const [acceptedKey, setAcceptedKey] = useState<string | null>(null);

  const units = Math.max(0, Math.floor(Number(unitsText) || 0));
  const style = styleById(styleId);
  const rosWeight = W_MIN + (weight / 100) * W_SPAN;
  const key = `${styleId}|${units}|${weight}`;
  const accepted = acceptedKey === key;

  // ── The re-cut ─────────────────────────────────────────────────────────────
  const rows = useMemo<Row[]>(() => {
    if (units <= 0) return [];
    const base = reallocationPlan(styleId, units);
    const plannedTotal = base.reduce((a, r) => a + r.plannedUnits, 0);

    const scored = base.map((b) => {
      const v = vitalsFor(b.store.id);
      const ros = styleTrueRos(b.store.id, styleId) || v.sellThrough * 0.6;
      const perf = Math.max(0.15, ros * rosWeight + v.achievement * (1 - rosWeight));
      return { b, v, ros, perf };
    });
    const perfTotal = scored.reduce((a, s) => a + s.perf, 0) || 1;

    // Largest-remainder allocation, so the recommendation sums to the planned
    // total exactly. A planner checks conservation first; rounding drift there
    // would cost the whole screen its credibility.
    const exact = scored.map((s) => (s.perf / perfTotal) * plannedTotal);
    const floors = exact.map((e) => Math.floor(e));
    let residual = plannedTotal - floors.reduce((a, f) => a + f, 0);
    const order = exact
      .map((e, i) => ({ i, frac: e - Math.floor(e) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const o of order) {
      if (residual <= 0) break;
      floors[o.i] += 1;
      residual -= 1;
    }

    const out = scored.map((s, i) => {
      const recommended = floors[i];
      const delta = recommended - s.b.plannedUnits;
      const sameDirection = Math.sign(delta) === Math.sign(s.b.delta);
      const reason = sameDirection
        ? s.b.reason
        : delta > 0
        ? `True ROS ${s.ros.toFixed(2)}/day and ${(s.v.achievement * 100).toFixed(0)}% of target — running ahead of its grade.`
        : delta < 0
        ? `${(s.v.achievement * 100).toFixed(0)}% of target with ${(s.v.fillRate * 100).toFixed(0)}% fill. Grade-based plan over-allocates here.`
        : "In line with the original plan.";
      return {
        store: s.b.store,
        planned: s.b.plannedUnits,
        recommended,
        delta,
        reason,
        confidence: Math.min(0.95, 0.6 + Math.abs(delta) / Math.max(1, s.b.plannedUnits) / 2),
        ros: s.ros,
        achievement: s.v.achievement,
        fillRate: s.v.fillRate,
        lowFill: false,
      };
    });

    // A store already running thin that the model wants to raid: flag it here
    // rather than let the planner discover it after the units have shipped.
    const fills = out.map((r) => r.fillRate).sort((a, b) => a - b);
    const medianFill = fills[Math.floor((fills.length - 1) / 2)] ?? 0;
    for (const r of out) {
      r.lowFill = r.delta < 0 && r.fillRate <= medianFill && Math.abs(r.delta) > Math.max(1, r.planned) * 0.25;
    }
    return out.sort((a, b) => b.delta - a.delta || a.store.name.localeCompare(b.store.name));
  }, [styleId, units, rosWeight]);

  const plannedTotal = rows.reduce((a, r) => a + r.planned, 0);
  const recommendedTotal = rows.reduce((a, r) => a + r.recommended, 0);
  const movers = rows.filter((r) => r.delta !== 0);
  const singleStore = rows.length === 1;
  const flagged = rows.filter((r) => r.lowFill);

  // ── Simulation ─────────────────────────────────────────────────────────────
  const sim = useMemo(() => {
    const gainers = rows.filter((r) => r.delta > 0);
    const losers = rows.filter((r) => r.delta < 0);
    const unitsMoved = gainers.reduce((a, r) => a + r.delta, 0);
    const lostUnits = losers.reduce((a, r) => a + Math.abs(r.delta), 0) || 1;
    const donorRos = losers.reduce((a, r) => a + r.ros * Math.abs(r.delta), 0) / lostUnits;
    const sellDays = Math.max(0, daysLeftInWindow(style) - LANDING_DAYS);

    const incremental = Math.round(
      gainers.reduce((a, r) => a + Math.min(r.delta, Math.max(0, r.ros - donorRos) * sellDays), 0)
    );
    const currentSellThrough = plannedTotal
      ? rows.reduce((a, r) => a + vitalsFor(r.store.id).sellThrough * r.planned, 0) / plannedTotal
      : 0;
    const uplift = sellThroughUplift({
      currentSellThrough,
      targetSellThrough: Math.min(0.95, currentSellThrough + incremental / Math.max(1, plannedTotal)),
      seasonUnits: plannedTotal,
      averageMrp: style.mrp,
      markdownDepth: MARKDOWN_DEPTH,
      grossMargin: GROSS_MARGIN,
    });
    return { unitsMoved, donorRos, sellDays, incremental, currentSellThrough, uplift };
  }, [rows, style, plannedTotal]);

  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.delta)));

  // ── Actions ────────────────────────────────────────────────────────────────
  function accept() {
    if (!movers.length) {
      app.toastNow("Nothing to write back — the recommendation matches the plan.", "info");
      return;
    }
    for (const r of movers) {
      const inbound = r.delta > 0;
      app.dispatch({
        type: "task:create",
        task: {
          id: `AL-${style.id}-${r.store.code}`,
          storeId: r.store.id,
          title: `${inbound ? "Receive" : "Release"} ${Math.abs(r.delta)} units — ${style.name}`,
          detail: `AW26 drop 1 re-cut: planned ${r.planned} units, now ${r.recommended}. ${r.reason}`,
          origin: "replenishment",
          assignedTo: inbound ? `${r.store.name} team` : "Allocation desk",
          dueAt: NOW + 2 * DAY,
          priority: Math.abs(r.delta) > plannedTotal * 0.08 ? 1 : 2,
          status: "todo",
          requiresPhoto: false,
          photoAttached: false,
          valueAtRisk: Math.abs(r.delta) * style.mrp,
          slaHours: 48,
        },
      });
    }
    setAcceptedKey(key);
    app.toastNow(`${movers.length} allocation instructions written back to D365`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reallocation</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            Re-point units already bought at the stores that are actually selling them.
          </p>
        </div>
      </div>

      <Callout tone="brand">
        AW26 drop 1 lands in 21 days · inventory already bought.
      </Callout>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle
          title="What are we re-cutting?"
          sub="Pick the style, the quantity already bought, and how hard the model should follow live demand. Everything below recomputes on change."
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          <label className="block">
            <span className="label">Style</span>
            <select
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-raised text-ink text-sm px-3 py-2"
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.brand} — {s.name} ({s.colour})
                </option>
              ))}
            </select>
            <span className="mt-1.5 inline-flex items-center gap-2 text-2xs text-muted">
              <Swatch hex={style.colourHex} label={`${style.category} · MRP ${inr(style.mrp)}`} />
            </span>
          </label>

          <label className="block">
            <span className="label">Units to allocate</span>
            <input
              type="number"
              min={0}
              step={500}
              value={unitsText}
              onChange={(e) => setUnitsText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-raised text-ink text-sm px-3 py-2 num"
            />
            <span className="mt-1.5 flex gap-1.5">
              {UNIT_PRESETS.map((u) => (
                <button key={u} className="btn-ghost !px-2 !py-1 text-2xs" onClick={() => setUnitsText(String(u))}>
                  {u.toLocaleString("en-IN")}
                </button>
              ))}
            </span>
          </label>

          <div>
            <span className="label">Weighting</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="mt-2 w-full"
              aria-label="Shift emphasis between achievement against target and True rate of sale"
            />
            <div className="flex items-center justify-between text-2xs text-muted mt-0.5">
              <span>Protect the plan</span>
              <span>Follow demand</span>
            </div>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setWeight(p.w)}
                  className={`px-2.5 py-1 rounded-md text-2xs font-medium border ${
                    weight === p.w ? "border-[color:var(--brand)] text-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line text-ink2"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-2xs text-muted mt-1.5 num">
              {pct(rosWeight)} True rate of sale · {pct(1 - rosWeight)} achievement against target
            </div>
          </div>
        </div>
      </Card>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Units in this drop" value={plannedTotal.toLocaleString("en-IN")} sub={`${rows.length} stores carry ${style.brand}`} freshness={18} />
        <Stat label="Units re-cut" value={sim.unitsMoved.toLocaleString("en-IN")} sub={`${plannedTotal ? pct(sim.unitsMoved / plannedTotal) : "0%"} of the drop changes destination`} />
        <Stat label="Stores gaining" value={String(rows.filter((r) => r.delta > 0).length)} sub={`${rows.filter((r) => r.delta < 0).length} stores give units up`} />
        <Stat
          label="Margin unlocked"
          value={inr(sim.uplift.marginUnlocked, { compact: true })}
          sub={`${sim.incremental.toLocaleString("en-IN")} incremental full-price units`}
          tone={sim.uplift.marginUnlocked > 0 ? "good" : undefined}
        />
      </div>

      {/* ── Main table ───────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle
          title="Recommended re-cut"
          sub="Sorted by the size of the change, biggest re-cut first. Planned is the grade-weighted split; recommended is the same units against the latest numbers."
          right={<Chip tone={recommendedTotal === plannedTotal ? "good" : "critical"}>{recommendedTotal === plannedTotal ? "Units conserved" : "Conservation error"}</Chip>}
        />

        {units <= 0 ? (
          <Empty
            title="Enter a quantity to re-cut"
            body="There is nothing to allocate at zero units. Type the quantity already bought for this style, or use one of the presets above."
          />
        ) : singleStore ? (
          <>
            <Callout tone="warn" title="Only one store carries this style">
              {rows[0].store.name} is the single {style.brand} door holding {style.name}. With one destination the
              recommendation is trivially the plan — all {plannedTotal.toLocaleString("en-IN")} units go there, and there
              is no re-cut to make.
            </Callout>
            <div className="text-xs text-ink2 mt-3">
              True ROS {rows[0].ros.toFixed(2)}/day · {pct(rows[0].achievement)} of target · {pct(rows[0].fillRate)} of norm.
            </div>
          </>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th align="right">Planned</Th>
                  <Th align="right">Recommended</Th>
                  <Th align="right">Change</Th>
                  <Th>Why</Th>
                  <Th align="right">Confidence</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.store.id} className={r.lowFill ? "bg-[#fdf3dc]" : undefined}>
                    <Td>
                      <div className="text-sm text-ink font-medium">{r.store.name}</div>
                      <div className="text-2xs text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {r.store.city} · {r.store.format}
                        <Chip tone={r.store.grade === "A" ? "good" : r.store.grade === "B" ? "neutral" : "warn"}>
                          Grade {r.store.grade}
                        </Chip>
                        {r.lowFill && <Chip tone="warn">Thin floor — {pct(r.fillRate)} of norm</Chip>}
                      </div>
                    </Td>
                    <Td align="right" className="num text-ink2">{r.planned.toLocaleString("en-IN")}</Td>
                    <Td align="right" className="num text-ink font-semibold">{r.recommended.toLocaleString("en-IN")}</Td>
                    <Td align="right">
                      {r.delta === 0 ? <span className="text-2xs text-muted">no change</span> : <Delta value={r.delta} suffix=" u" />}
                    </Td>
                    <Td>
                      <div className="text-xs text-ink2 leading-snug max-w-md">{r.reason}</div>
                    </Td>
                    <Td align="right" className="num text-ink2 text-xs">{pct(r.confidence)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td>
                    <span className="text-sm font-semibold text-ink">Total</span>
                    <div className="text-2xs text-muted mt-0.5">Nothing is created or destroyed — only the destination changes.</div>
                  </Td>
                  <Td align="right" className="num font-semibold text-ink">{plannedTotal.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num font-semibold text-ink">{recommendedTotal.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num font-semibold text-ink">{recommendedTotal - plannedTotal}</Td>
                  <Td>
                    <span className="text-2xs text-muted">
                      {units !== plannedTotal
                        ? `${units.toLocaleString("en-IN")} entered; the grade split rounds to ${plannedTotal.toLocaleString("en-IN")}, and the residual stays at the warehouse.`
                        : "Grade split and re-cut both sum to the entered quantity."}
                    </span>
                  </Td>
                  <Td />
                </tr>
              </tbody>
            </Table>

            {flagged.length > 0 && (
              <div className="mt-3">
                <Callout tone="warn" title="Check before you sign: units are being taken from a thin floor">
                  {flagged.map((r) => `${r.store.name} (${pct(r.fillRate)} of norm, giving up ${Math.abs(r.delta)} units)`).join("; ")}.
                  These stores are at or below the median fill rate for this style and lose more than a quarter of their
                  planned units. The model is right about the rate of sale and may still be wrong about the floor — a
                  half-empty store converts worse than the arithmetic suggests. Trim the cut here, or accept it knowingly.
                </Callout>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Diverging bars ───────────────────────────────────────────────── */}
      {units > 0 && !singleStore && (
        <Card>
          <SectionTitle title="Units in and out, by store" sub="One axis, zero in the middle. Blue takes units in, red gives units up." />
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.store.id} className="grid grid-cols-[minmax(96px,26%)_1fr_auto] gap-3 items-center">
                <div className="text-xs text-ink2 truncate" title={r.store.name}>{r.store.name}</div>
                <div className="relative h-3.5 rounded bg-[color:var(--plane)]">
                  <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--baseline)" }} />
                  {r.delta !== 0 && (
                    <div
                      className="absolute top-0 bottom-0 rounded-sm"
                      style={
                        r.delta > 0
                          ? { left: "50%", width: `${(r.delta / maxAbs) * 50}%`, background: "var(--series-1)" }
                          : { right: "50%", width: `${(Math.abs(r.delta) / maxAbs) * 50}%`, background: "var(--status-critical)" }
                      }
                    />
                  )}
                </div>
                <div className="text-xs font-semibold text-ink num w-16 text-right">
                  {r.delta > 0 ? "+" : ""}
                  {r.delta}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-2xs text-muted mt-2 num">
            <span>− {maxAbs} units out</span>
            <span>0</span>
            <span>+ {maxAbs} units in</span>
          </div>
          <div className="text-2xs text-muted mt-1">Axis: units moved relative to the original grade-weighted plan.</div>
        </Card>
      )}

      {/* ── Simulation ───────────────────────────────────────────────────── */}
      {units > 0 && !singleStore && (
        <Card>
          <SectionTitle title="If you accept this re-cut" sub="The estimated effect of the change, with the model written out underneath it." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Units moved" value={sim.unitsMoved.toLocaleString("en-IN")} note={`across ${movers.length} stores, ${sim.sellDays} selling days after landing`} />
            <MiniStat label="Incremental full-price units" value={sim.incremental.toLocaleString("en-IN")} note={`receiving stores sell this ${(sim.donorRos > 0 ? "faster than" : "where donors sell")} the donors`} />
            <MiniStat label="Markdown avoided" value={inr(sim.uplift.markdownAvoided, { compact: true })} note={`${pct(MARKDOWN_DEPTH)} depth on units that would have gone to EOSS`} />
            <MiniStat label="Margin unlocked" value={inr(sim.uplift.marginUnlocked, { compact: true })} note={`${pct(GROSS_MARGIN)} gross margin on the markdown avoided`} />
          </div>

          <div className="mt-3 rounded-lg border border-line p-3">
            <div className="label mb-1.5">What this model assumes</div>
            <ul className="text-xs text-ink2 space-y-1 leading-relaxed list-disc pl-4">
              <li>
                Each receiving store sells its extra units at its own True rate of sale less the units-weighted True ROS
                of the donor stores ({sim.donorRos.toFixed(2)}/day) — so the sale the donor gives up is already netted off.
              </li>
              <li>
                {sim.sellDays} selling days: {daysLeftInWindow(style)} days of full-price window left, less the {LANDING_DAYS} days
                until drop 1 lands.
              </li>
              <li>
                The claim is capped at the units actually moved — the model never says you sell more than you shipped.
                {sim.unitsMoved > 0 && sim.incremental / sim.unitsMoved > 0.9
                  ? " Here the cap binds, because the donor stores have sold almost none of this style in 28 days."
                  : ""}
              </li>
              <li>
                Markdown depth {pct(MARKDOWN_DEPTH)} and gross margin {pct(GROSS_MARGIN)} are the planning defaults; sell-through
                today is {pct(sim.currentSellThrough)} across these stores.
              </li>
              <li>No price elasticity, no cannibalisation of adjacent styles, and no change in footfall is assumed.</li>
            </ul>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end mt-3">
            <button className="btn" onClick={() => setWeight(0)}>Reset to plan</button>
            <button
              className="btn"
              onClick={() => app.toastNow(`Re-cut for ${style.name} exported for review — ${movers.length} lines`, "info")}
            >
              Export for review
            </button>
            <button className="btn-primary" disabled={accepted || !movers.length} onClick={accept}>
              {accepted ? `${movers.length} instructions created` : "Accept and create allocation instructions"}
            </button>
          </div>
          {accepted && (
            <div className="text-2xs text-muted mt-2 text-right">
              Written back to D365 as allocation tasks, due in 2 days, visible to each store on its own task list.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="label">{label}</div>
      <div className="text-lg font-semibold text-ink num mt-1">{value}</div>
      <div className="text-2xs text-muted mt-1 leading-snug">{note}</div>
    </div>
  );
}
