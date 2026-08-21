"use client";

// Renewal — a finished style makes way for a new one.
//
// Unlike replenishment, this does not run on its own. A renewal is per SKU per
// store, so a cycle is built (or accepted from a suggestion), and someone has to
// approve it before any unit moves. Total available for the SKU is on screen
// while you allocate, because that is the number that constrains the decision.

import React, { useMemo, useState } from "react";
import { Callout, Card, Chip, Modal, SectionTitle, Stat, StatusDot, Swatch, Table, Tabs, Td, Th, relTime } from "@/components/ui";
import { applyMove, applyPullback, dcAvailable, gradedStyles, planningStores, replenRun, unitsAt, warehouseBySize, warehouseTotal } from "@/lib/engine";
import { NOW, STYLES, storeById, styleById } from "@/lib/seed";
import { CYCLE_LABEL, useApp } from "@/lib/state";
import { PLANNING_BRAND } from "@/lib/engine";
import { inr, maxSets, pct, setsToUnits, sizeCurve, unitsPerSet, unitsToSets } from "@/lib/rules";
import SizeAllocator, { type SizeMap } from "@/components/SizeAllocator";
import type { Cycle, CycleLine, Size, StockMove } from "@/lib/types";

export default function Renewal() {
  const app = useApp();
  const [build, setBuild] = useState(false);

  const cycles = app.cycles.filter((c) => c.kind === "renewal");
  const waiting = cycles.filter((c) => c.status === "awaiting_approval");
  const applied = cycles.filter((c) => c.status === "applied");

  // What the run thinks is worth renewing. A suggestion, not a decision.
  const suggestions = useMemo(() => replenRun(NOW, app.pausedStores, app.thresholds).lines.filter((l) => l.kind === "renew"), [app.pausedStores, app.thresholds]);
  const alreadyProposed = new Set(cycles.flatMap((c) => c.lines.map((l) => `${l.storeId}|${l.styleId}`)));
  const [dismissed, setDismissed] = useState<string[]>([]);
  const shownSuggestions = suggestions.filter((sg) => !alreadyProposed.has(`${sg.storeId}|${sg.styleId}`) && !dismissed.includes(sg.id));

  function acceptSuggestions(picked: typeof suggestions) {
    if (picked.length === 0) return;
    const cycle: Cycle = {
      id: `CY-RN-${app.cycles.length + 1}`,
      kind: "renewal",
      status: "awaiting_approval",
      createdAt: NOW,
      createdBy: app.actorName,
      source: "warehouse",
      note: "From the run's suggestions",
      lines: picked.map((sg, i) => ({
        id: `CL-${i}`,
        storeId: sg.storeId,
        styleId: sg.styleId,
        size: styleById(sg.styleId).coreSizes[0],
        units: sg.units,
        reason: sg.reason,
      })),
    };
    app.dispatch({ type: "cycle:create", cycle });
    app.toastNow(`${cycle.lines.length} sent for approval`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Renewal</h1>
                  </div>
        <button className="btn-primary" data-new-cycle onClick={() => setBuild(true)}>
          Create a cycle
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Awaiting approval" value={String(waiting.length)} tone={waiting.length > 0 ? "warn" : "good"} emphasis />
        <Stat label="Suggested" value={String(shownSuggestions.length)} />
        <Stat label="Applied" value={String(applied.length)} />
        <Stat label="Units moved" value={app.moves.filter((m) => m.reason.startsWith("Renewal")).reduce((a, m) => a + m.units, 0).toLocaleString("en-IN")} />
      </div>

      {shownSuggestions.length > 0 && (
        <Card>
          <SectionTitle
            title="Suggested"
            right={
              <button className="btn !py-1 !text-2xs" data-accept-suggested onClick={() => acceptSuggestions(shownSuggestions)}>
                Take all {shownSuggestions.length}
              </button>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>SKU</Th>
                <Th>New style</Th>
                <Th>Replacing</Th>
                <Th align="right">Units</Th>
                <Th align="right">Decide</Th>
              </tr>
            </thead>
            <tbody>
              {shownSuggestions.map((sg) => (
                <tr key={sg.id} data-renew-suggestion>
                  <Td className="text-ink">{storeById(sg.storeId).name}</Td>
                  <Td className="num text-xs text-ink2">{sg.styleId}</Td>
                  <Td className="text-ink">{styleById(sg.styleId).name}</Td>
                  <Td className="text-xs text-ink2">{sg.reason.split(" is finished")[0]}</Td>
                  <Td align="right" className="num">{sg.units}</Td>
                  <Td align="right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button className="btn !py-1 !text-2xs" data-suggest-take onClick={() => acceptSuggestions([sg])}>
                        Take
                      </button>
                      <button className="btn !py-1 !text-2xs" data-suggest-drop onClick={() => setDismissed([...dismissed, sg.id])}>
                        Dismiss
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <SectionTitle title="Cycles" />
        {cycles.length === 0 ? (
          <div className="text-sm text-ink2">No renewal cycle yet.</div>
        ) : (
          <div className="space-y-3">
            {cycles.map((c) => (
              <CycleCard key={c.id} cycle={c} />
            ))}
          </div>
        )}
      </Card>

      <CycleBuilder open={build} onClose={() => setBuild(false)} kind="renewal" />
    </div>
  );
}

// ── One cycle, and the decision on it ───────────────────────────────────────

export function CycleCard({ cycle }: { cycle: Cycle }) {
  const app = useApp();
  const units = cycle.lines.reduce((a, l) => a + l.units, 0);

  function decide(status: "approved" | "rejected") {
    app.dispatch({ type: "cycle:decide", id: cycle.id, status, by: app.actorName });
    app.toastNow(`${CYCLE_LABEL[cycle.kind]} cycle ${status}`, status === "approved" ? "good" : "warn");
  }

  function apply() {
    const moves: StockMove[] = [];
    cycle.lines.forEach((l) => {
      const size = l.size ?? styleById(l.styleId).coreSizes[0];
      // A pull-back runs the other way: off the floor, back to the warehouse.
      const ok =
        cycle.kind === "pullback"
          ? applyPullback({ fromStoreId: l.storeId, styleId: l.styleId, size, units: l.units })
          : applyMove({ from: cycle.source, toStoreId: l.storeId, styleId: l.styleId, size, units: l.units });
      if (ok) {
        moves.push({
          id: `MV-${cycle.id}-${l.id}`,
          at: NOW,
          by: app.actorName,
          from: cycle.kind === "pullback" ? l.storeId : cycle.source,
          toStoreId: cycle.kind === "pullback" ? "warehouse" : l.storeId,
          styleId: l.styleId,
          size,
          units: l.units,
          reason: `${CYCLE_LABEL[cycle.kind]} cycle ${cycle.id}`,
          cycleId: cycle.id,
        });
      }
    });
    app.dispatch({ type: "cycle:apply", id: cycle.id, moves, by: app.actorName });
    app.toastNow(`${moves.reduce((a, m) => a + m.units, 0)} units moved`, "good");
  }

  return (
    <div className="border border-line p-3" data-cycle={cycle.status}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot tone={cycle.status === "applied" ? "good" : cycle.status === "rejected" ? "neutral" : "warn"} />
            <span className="num text-xs text-ink2">{cycle.id}</span>
            <span className="text-sm text-ink">
              {cycle.lines.length} {cycle.lines.length === 1 ? "line" : "lines"} · {units} units
            </span>
            <Chip tone={cycle.status === "applied" ? "good" : cycle.status === "approved" ? "brand" : cycle.status === "rejected" ? "neutral" : "warn"}>
              {STATUS_LABEL[cycle.status]}
            </Chip>
          </div>
          <div className="text-2xs text-muted mt-1">
            {cycle.createdBy} · {relTime(cycle.createdAt, NOW)}
            {cycle.note ? ` · ${cycle.note}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {cycle.status === "awaiting_approval" && (
            <>
              <button className="btn !py-1 !text-2xs" data-cycle-reject onClick={() => decide("rejected")}>
                Reject
              </button>
              <button className="btn-primary !py-1 !text-2xs" data-cycle-approve onClick={() => decide("approved")}>
                Approve
              </button>
            </>
          )}
          {cycle.status === "approved" && (
            <button className="btn-primary !py-1 !text-2xs" data-cycle-apply onClick={apply}>
              Move the stock
            </button>
          )}
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Store</Th>
            <Th>SKU</Th>
            <Th>Style</Th>
            <Th>Size</Th>
            <Th align="right">Units</Th>
          </tr>
        </thead>
        <tbody>
          {cycle.lines.map((l) => (
            <tr key={l.id}>
              <Td className="text-ink">{storeById(l.storeId).name}</Td>
              <Td className="num text-xs text-ink2">{l.styleId}</Td>
              <Td>{styleById(l.styleId).name}</Td>
              <Td className="num">{l.size ?? "—"}</Td>
              <Td align="right" className="num">{l.units}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

const STATUS_LABEL: Record<Cycle["status"], string> = {
  running: "Running",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
};

// ── Building a cycle: one SKU, many stores, a quantity each ─────────────────

export function CycleBuilder({ open, onClose, kind }: { open: boolean; onClose: () => void; kind: "renewal" | "allocation" }) {
  const app = useApp();
  const stores = planningStores();
  const styles = useMemo(() => STYLES.filter((s) => s.brand === PLANNING_BRAND), []);

  // Two ways in, because planners think both ways: "where does this unit go?"
  // and "what does this store need?".
  const [mode, setMode] = useState<"unit" | "store">("unit");

  // By unit: one SKU, allocated store by store and size by size. Size is not a
  // filter — a store needs a size breakdown, not one size at a time.
  // Open on a unit the warehouse can ship as whole sets, otherwise the first
  // thing on screen is "0 sets available" and a clamped input.
  const bestForSets = useMemo(() => {
    const scored = styles.map((st) => {
      const c = sizeCurve(st.sizes, st.coreSizes);
      const avail = Object.fromEntries(warehouseBySize(st.id).map((b) => [b.size, b.units])) as Partial<Record<Size, number>>;
      return { id: st.id, sets: maxSets(c, avail) };
    });
    return [...scored].sort((a, b) => b.sets - a.sets)[0]?.id ?? styles[0]?.id ?? "";
  }, [styles]);
  const [styleId, setStyleId] = useState(bestForSets);
  const [byStore, setByStore] = useState<Record<string, Partial<Record<Size, number>>>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  // By store: one store, several SKUs.
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [byStyleSizes, setByStyleSizes] = useState<Record<string, SizeMap>>({});
  const [openStyleRow, setOpenStyleRow] = useState<string | null>(null);

  const style = styleById(styleId);
  const bySize = useMemo(() => warehouseBySize(styleId), [styleId]);
  const total = useMemo(() => warehouseTotal(styleId), [styleId]);
  // A set is how stock is actually allocated from scratch: a shaped ratio across
  // the run, not one size at a time.
  const curve = useMemo(() => sizeCurve(style.sizes, style.coreSizes), [style.sizes, style.coreSizes]);
  const perSet = unitsPerSet(curve);
  const available = useMemo(() => Object.fromEntries(bySize.map((b) => [b.size, b.units])) as Partial<Record<Size, number>>, [bySize]);
  const setsAvailable = useMemo(() => maxSets(curve, available), [curve, available]);

  // What has been asked for, size by size, across every store.
  const perSize = useMemo(() => {
    const t: Partial<Record<Size, number>> = {};
    Object.values(byStore).forEach((m) =>
      Object.entries(m ?? {}).forEach(([sz, n]) => {
        t[sz as Size] = (t[sz as Size] ?? 0) + (n ?? 0);
      }),
    );
    return t;
  }, [byStore]);

  const overSizes = bySize.filter((b) => (perSize[b.size] ?? 0) > b.units);
  const unitAllocated = Object.values(perSize).reduce((a, n) => a + (n ?? 0), 0);
  const storeAllocated = Object.values(byStyleSizes).reduce((a, m) => a + Object.values(m).reduce((b, n) => b + (n ?? 0), 0), 0);
  const allocated = mode === "unit" ? unitAllocated : storeAllocated;
  const over = mode === "unit" && overSizes.length > 0;

  const storesTouched = mode === "unit" ? Object.values(byStore).filter((m) => Object.values(m ?? {}).some((n) => (n ?? 0) > 0)).length : 1;

  function setQty(sid: string, sz: Size, units: number) {
    setByStore({ ...byStore, [sid]: { ...(byStore[sid] ?? {}), [sz]: Math.max(0, units) } });
  }

  function storeTotal(sid: string) {
    return Object.values(byStore[sid] ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  }

  /** Whole sets a store's current size breakdown amounts to. */
  function setsFor(sid: string) {
    return unitsToSets(curve, byStore[sid] ?? {}).sets;
  }

  /** Typing sets fills the sizes; the planner can then adjust any of them. */
  function applySets(sid: string, sets: number) {
    setByStore({ ...byStore, [sid]: setsToUnits(curve, sets) });
  }

  function submit() {
    const lines: CycleLine[] =
      mode === "unit"
        ? Object.entries(byStore).flatMap(([sid, sizes]) =>
            Object.entries(sizes ?? {})
              .filter(([, n]) => (n ?? 0) > 0)
              .map(([sz, n], i) => ({ id: `CL-${sid}-${sz}-${i}`, storeId: sid, styleId, size: sz as Size, units: n as number })),
          )
        : Object.entries(byStyleSizes).flatMap(([sty, sizeMap]) =>
            Object.entries(sizeMap)
              .filter(([, n]) => (n ?? 0) > 0)
              .map(([sz, n], i) => ({ id: `CL-${sty}-${sz}-${i}`, storeId, styleId: sty, size: sz as Size, units: n as number })),
          );

    if (lines.length === 0 || over) return;
    const cycle: Cycle = {
      id: `CY-${kind === "renewal" ? "RN" : "AL"}-${app.cycles.length + 1}`,
      kind,
      status: "awaiting_approval",
      createdAt: NOW,
      createdBy: app.actorName,
      source: "warehouse",
      lines,
      note: mode === "unit" ? `${style.name} · ${lines.length} store-size lines` : `${storeById(storeId).name} · ${lines.length} styles`,
    };
    app.dispatch({ type: "cycle:create", cycle });
    app.toastNow(`${CYCLE_LABEL[kind]} cycle created · ${allocated} units`, "good");
    setByStore({});
    setByStyleSizes({});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={kind === "renewal" ? "Create a renewal cycle" : "Allocate"}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-xs num" style={{ color: over ? "var(--status-critical)" : "var(--text-secondary)" }}>
            {mode === "unit"
              ? `${allocated} units across ${storesTouched} ${storesTouched === 1 ? "store" : "stores"} · ${total} in the warehouse`
              : `${allocated} units across ${Object.keys(byStyleSizes).filter((k) => Object.values(byStyleSizes[k]).some((n) => (n ?? 0) > 0)).length} styles`}
          </span>
          <button className="btn-primary" data-cycle-submit disabled={allocated === 0 || over} onClick={submit}>
            Send for approval
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <Tabs
          value={mode}
          onChange={(m: "unit" | "store") => setMode(m)}
          options={[
            { id: "unit", label: "By unit" },
            { id: "store", label: "By store" },
          ]}
        />

        {mode === "unit" ? (
          <>
            <div>
              <div className="label mb-1">Unit</div>
              <select
                value={styleId}
                data-cycle-style
                onChange={(e) => {
                  setStyleId(e.target.value);
                  setByStore({});
                  setOpenRow(null);
                }}
                className={inputCls}
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.name} · {s.colour}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs">
              <Swatch hex={style.colourHex} label={style.colour} />
              <span className="text-ink2">{style.category}</span>
              <span className="num text-ink2">MRP {inr(style.mrp)}</span>
            </div>

            <div className="border border-line">
              <div className="px-3 pt-2.5 flex items-center justify-between gap-3 flex-wrap">
                <span className="label">One set = {perSet} units</span>
                <span className="text-2xs text-muted num">
                  {curve.map((c) => `${c.ratio}${c.size}`).join(" · ")} · {setsAvailable} sets in the warehouse
                </span>
              </div>
              <div className="px-3 pt-2.5 label">In the warehouse</div>
              <div className="p-3 pt-2 flex gap-2 flex-wrap">
                {bySize.map((b) => {
                  const asked = perSize[b.size] ?? 0;
                  const short = asked > b.units;
                  return (
                    <div
                      key={b.size}
                      data-size-chip={short ? "over" : "ok"}
                      className="border px-2.5 py-1.5 min-w-[86px]"
                      style={{ borderColor: short ? "var(--status-critical)" : "var(--line)" }}
                    >
                      <div className="text-xs num text-ink">
                        {b.size}
                        {style.coreSizes.includes(b.size) ? " ·pivotal" : ""}
                      </div>
                      <div className="text-2xs num" style={{ color: short ? "var(--status-critical)" : "var(--text-muted)" }}>
                        {asked > 0 ? `${asked} of ${b.units}` : `${b.units} free`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {over && (
              <Callout
                tone="critical"
                title={`Over the warehouse in ${overSizes.map((b) => `size ${b.size}`).join(", ")}`}
              />
            )}

            <Table>
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th>Grade</Th>
                  <Th align="right">Has this style</Th>
                  <Th>Set</Th>
                  <Th align="right">Fill rate</Th>
                  <Th align="right">Sets</Th>
                  <Th align="right">Allocating</Th>
                  <Th align="right">Sizes</Th>
                </tr>
              </thead>
              <tbody>
                {stores.map((st) => {
                  const carried = gradedStyles(st.id, 80).find((g) => g.signal.style.id === styleId);
                  const mine = storeTotal(st.id);
                  const expanded = openRow === st.id;
                  return (
                    <React.Fragment key={st.id}>
                      <tr data-cycle-store-row>
                        <Td className="text-ink">{st.name}</Td>
                        <Td>{st.grade}</Td>
                        <Td align="right" className="num">{carried ? carried.signal.sellable : 0}</Td>
                        <Td>
                          {carried ? (
                            <span className="inline-flex items-center gap-1.5">
                              <StatusDot tone={carried.signal.health.status === "healthy" ? "good" : carried.signal.health.status === "broken" ? "critical" : "warn"} />
                              <span className="text-xs text-ink2">
                                {carried.signal.health.status === "healthy" ? "Healthy" : carried.signal.health.status === "broken" ? "Broken" : "At risk"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted">Not carried</span>
                          )}
                        </Td>
                        <Td align="right" className="num">{pct(app.normFor(st.id) > 0 ? (carried?.signal.sellable ?? 0) / app.normFor(st.id) : 0)}</Td>
                        <Td align="right">
                          <input
                            type="number"
                            min={0}
                            value={setsFor(st.id)}
                            data-cycle-sets
                            onChange={(e) => applySets(st.id, Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                            className="w-14 border border-line bg-raised px-2 py-1 text-sm text-ink text-right num"
                          />
                        </Td>
                        <Td align="right" className="num" style={mine > 0 ? { color: "var(--brand)" } : undefined}>
                          {mine || "—"}
                        </Td>
                        <Td align="right">
                          <button className="btn !py-1 !text-2xs" data-open-sizes onClick={() => setOpenRow(expanded ? null : st.id)}>
                            {expanded ? "Hide" : "Sizes"}
                          </button>
                        </Td>
                      </tr>
                      {expanded && (
                        <tr data-size-panel>
                          <Td colSpan={8}>
                            <div className="flex gap-2 flex-wrap py-1">
                              {style.sizes.map((sz) => {
                                const wh = bySize.find((b) => b.size === sz)?.units ?? 0;
                                const here = unitsAt(st.id, styleId, sz);
                                return (
                                  <div key={sz} className="border border-line px-2 py-1.5">
                                    <div className="text-2xs num text-ink2 mb-1">
                                      {sz}
                                      {style.coreSizes.includes(sz) ? " ·piv" : ""} · has {here}
                                    </div>
                                    <input
                                      type="number"
                                      min={0}
                                      max={wh}
                                      value={byStore[st.id]?.[sz] ?? 0}
                                      data-cycle-qty
                                      onChange={(e) => setQty(st.id, sz, Math.min(wh, Number(e.target.value) || 0))}
                                      className="w-14 border border-line bg-raised px-1.5 py-1 text-sm text-ink text-right num"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </Td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </Table>
          </>
        ) : (
          <>
            <div>
              <div className="label mb-1">Store</div>
              <select
                value={storeId}
                data-cycle-store
                onChange={(e) => {
                  setStoreId(e.target.value);
                  setByStyleSizes({});
                }}
                className={inputCls}
              >
                {stores.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} · {st.grade}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              {styles.slice(0, 16).map((sty) => {
                const expanded = openStyleRow === sty.id;
                const mine = Object.values(byStyleSizes[sty.id] ?? {}).reduce((a, n) => a + (n ?? 0), 0);
                const carried = gradedStyles(storeId, 90).find((g) => g.signal.style.id === sty.id);
                return (
                  <div key={sty.id} className="border border-line" data-cycle-style-row>
                    <button
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 flex-wrap hover:bg-[color:var(--plane)]"
                      data-cycle-expand
                      onClick={() => setOpenStyleRow(expanded ? null : sty.id)}
                    >
                      <Swatch hex={sty.colourHex} />
                      <span className="num text-xs text-ink2">{sty.id}</span>
                      <span className="text-sm text-ink">{sty.name}</span>
                      <span className="text-2xs text-muted">{sty.colour}</span>
                      {carried ? (
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot
                            tone={carried.signal.health.status === "healthy" ? "good" : carried.signal.health.status === "broken" ? "critical" : "warn"}
                          />
                          <span className="text-2xs text-ink2">
                            {carried.signal.health.status === "healthy"
                              ? `Healthy · ${carried.signal.sellable} here`
                              : `${carried.signal.health.status === "broken" ? "Broken" : "At risk"}: ${carried.signal.health.missingCore.join(", ") || "—"} gone`}
                          </span>
                        </span>
                      ) : (
                        <span className="text-2xs text-muted">Not carried</span>
                      )}
                      <span className="flex-1" />
                      {mine > 0 && <Chip tone="brand">{mine} units</Chip>}
                      <span className="text-2xs text-muted">{expanded ? "Hide" : "Sizes"}</span>
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3">
                        <SizeAllocator
                          styleId={sty.id}
                          toStoreId={storeId}
                          value={byStyleSizes[sty.id] ?? {}}
                          onChange={(next) => setByStyleSizes({ ...byStyleSizes, [sty.id]: next })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const inputCls = "w-full border border-line bg-raised px-3 py-2 text-sm text-ink";
