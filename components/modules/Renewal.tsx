"use client";

// Renewal — a finished style makes way for a new one.
//
// Unlike replenishment, this does not run on its own. A renewal is per SKU per
// store, so a cycle is built (or accepted from a suggestion), and someone has to
// approve it before any unit moves. Total available for the SKU is on screen
// while you allocate, because that is the number that constrains the decision.

import React, { useMemo, useState } from "react";
import { Callout, Card, Chip, Modal, SectionTitle, Stat, StatusDot, Swatch, Table, Td, Th, relTime } from "@/components/ui";
import { applyMove, gradedStyles, planningStores, replenRun, warehouseBySize, warehouseTotal } from "@/lib/engine";
import { NOW, STYLES, storeById, styleById } from "@/lib/seed";
import { CYCLE_LABEL, useApp } from "@/lib/state";
import { PLANNING_BRAND } from "@/lib/engine";
import { inr, pct } from "@/lib/rules";
import type { Cycle, CycleLine, Size, StockMove } from "@/lib/types";

export default function Renewal() {
  const app = useApp();
  const [build, setBuild] = useState(false);

  const cycles = app.cycles.filter((c) => c.kind === "renewal");
  const waiting = cycles.filter((c) => c.status === "awaiting_approval");
  const applied = cycles.filter((c) => c.status === "applied");

  // What the run thinks is worth renewing. A suggestion, not a decision.
  const suggestions = useMemo(() => replenRun(NOW, app.pausedStores).lines.filter((l) => l.kind === "renew"), [app.pausedStores]);
  const alreadyProposed = new Set(cycles.flatMap((c) => c.lines.map((l) => `${l.storeId}|${l.styleId}`)));
  const freshSuggestions = suggestions.filter((s) => !alreadyProposed.has(`${s.storeId}|${s.styleId}`));

  function acceptSuggestions() {
    if (freshSuggestions.length === 0) return;
    const cycle: Cycle = {
      id: `CY-RN-${app.cycles.length + 1}`,
      kind: "renewal",
      status: "awaiting_approval",
      createdAt: NOW,
      createdBy: app.actorName,
      source: "warehouse",
      note: "Built from the run's suggestions",
      lines: freshSuggestions.map((s, i) => ({
        id: `CL-${i}`,
        storeId: s.storeId,
        styleId: s.styleId,
        size: styleById(s.styleId).coreSizes[0],
        units: s.units,
        reason: s.reason,
      })),
    };
    app.dispatch({ type: "cycle:create", cycle });
    app.toastNow(`${cycle.lines.length} suggested renewals sent for approval`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Renewal</h1>
          <p className="text-xs text-ink2 mt-1">Created per SKU per store · needs approval before anything ships</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {freshSuggestions.length > 0 && (
            <button className="btn" data-accept-suggested onClick={acceptSuggestions}>
              Take the {freshSuggestions.length} suggested
            </button>
          )}
          <button className="btn-primary" data-new-cycle onClick={() => setBuild(true)}>
            Create a cycle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Awaiting approval" value={String(waiting.length)} tone={waiting.length > 0 ? "warn" : "good"} emphasis />
        <Stat label="Suggested by the run" value={String(freshSuggestions.length)} />
        <Stat label="Applied" value={String(applied.length)} />
        <Stat label="Units moved" value={app.moves.filter((m) => m.reason.startsWith("Renewal")).reduce((a, m) => a + m.units, 0).toLocaleString("en-IN")} />
      </div>

      {freshSuggestions.length > 0 && (
        <Card>
          <SectionTitle title="Suggested" />
          <Table>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>SKU</Th>
                <Th>New style</Th>
                <Th align="right">Units</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody>
              {freshSuggestions.map((s) => (
                <tr key={s.id} data-renew-suggestion>
                  <Td className="text-ink">{storeById(s.storeId).name}</Td>
                  <Td className="num text-xs text-ink2">{s.styleId}</Td>
                  <Td className="text-ink">{styleById(s.styleId).name}</Td>
                  <Td align="right" className="num">{s.units}</Td>
                  <Td className="text-xs text-ink2">{s.reason}</Td>
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
      const ok = applyMove({ from: cycle.source, toStoreId: l.storeId, styleId: l.styleId, size, units: l.units });
      if (ok) {
        moves.push({
          id: `MV-${cycle.id}-${l.id}`,
          at: NOW,
          by: app.actorName,
          from: cycle.source,
          toStoreId: l.storeId,
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
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const [size, setSize] = useState<Size | "">("");
  const [qty, setQty] = useState<Record<string, number>>({});

  const style = styleById(styleId);
  const bySize = useMemo(() => warehouseBySize(styleId), [styleId]);
  const total = useMemo(() => warehouseTotal(styleId), [styleId]);
  // Open on a size the warehouse can actually ship, otherwise the first thing a
  // planner sees is a dead end.
  const deepest = useMemo(() => [...bySize].sort((a, b) => b.units - a.units)[0]?.size ?? style.coreSizes[0], [bySize, style.coreSizes]);
  const chosenSize = (size || deepest) as Size;
  const availableInSize = bySize.find((b) => b.size === chosenSize)?.units ?? 0;

  const allocated = Object.values(qty).reduce((a, n) => a + n, 0);
  const over = allocated > availableInSize;

  function submit() {
    const lines: CycleLine[] = Object.entries(qty)
      .filter(([, units]) => units > 0)
      .map(([storeId, units], i) => ({ id: `CL-${i}`, storeId, styleId, size: chosenSize, units }));
    if (lines.length === 0 || over) return;
    const cycle: Cycle = {
      id: `CY-${kind === "renewal" ? "RN" : "AL"}-${app.cycles.length + 1}`,
      kind,
      status: "awaiting_approval",
      createdAt: NOW,
      createdBy: app.actorName,
      source: "warehouse",
      lines,
      note: `${style.name} · size ${chosenSize}`,
    };
    app.dispatch({ type: "cycle:create", cycle });
    app.toastNow(`${CYCLE_LABEL[kind]} cycle created · ${allocated} units across ${lines.length} stores`, "good");
    setQty({});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Create a ${kind} cycle`}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-xs num" style={{ color: over ? "var(--status-critical)" : "var(--text-secondary)" }}>
            {allocated} of {availableInSize} available in size {chosenSize}
          </span>
          <button className="btn-primary" data-cycle-submit disabled={allocated === 0 || over} onClick={submit}>
            Send for approval
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="label mb-1">Unit</div>
            <select
              value={styleId}
              data-cycle-style
              onChange={(e) => {
                setStyleId(e.target.value);
                setSize("");
                setQty({});
              }}
              className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink"
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.name} · {s.colour}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label mb-1">Size</div>
            <select
              value={chosenSize}
              data-cycle-size
              onChange={(e) => {
                setSize(e.target.value as Size);
                setQty({});
              }}
              className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink"
            >
              {bySize.map((b) => (
                <option key={b.size} value={b.size}>
                  {b.size} — {b.units} available
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs">
          <Swatch hex={style.colourHex} label={style.colour} />
          <span className="text-ink2">{style.category}</span>
          <span className="num text-ink2">MRP {inr(style.mrp)}</span>
          <span className="num text-ink">
            Warehouse total {total.toLocaleString("en-IN")} · size {chosenSize}: {availableInSize}
          </span>
        </div>

        {over && <Callout tone="critical" title={`Over the warehouse by ${allocated - availableInSize} units in size ${chosenSize}`} />}

        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Grade</Th>
              <Th align="right">On floor now</Th>
              <Th align="right">Fill rate</Th>
              <Th align="right">Allocate</Th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const carried = gradedStyles(s.id, 60).find((g) => g.signal.style.id === styleId);
              return (
                <tr key={s.id}>
                  <Td className="text-ink">{s.name}</Td>
                  <Td>{s.grade}</Td>
                  <Td align="right" className="num">{carried ? carried.signal.sellable : 0}</Td>
                  <Td align="right" className="num">{pct(app.normFor(s.id) > 0 ? (carried?.signal.sellable ?? 0) / app.normFor(s.id) : 0)}</Td>
                  <Td align="right">
                    <input
                      type="number"
                      min={0}
                      value={qty[s.id] ?? 0}
                      data-cycle-qty
                      onChange={(e) => setQty({ ...qty, [s.id]: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-16 border border-line bg-raised px-2 py-1 text-sm text-ink text-right num"
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </Modal>
  );
}
