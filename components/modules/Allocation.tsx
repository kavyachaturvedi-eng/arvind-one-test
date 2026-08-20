"use client";

// Allocation — the plan, then what today's signals would do to it.
//
// It opens on the plan alone, because that is what was committed. Running the
// re-allocation is a deliberate act, and what comes back is a recommendation per
// store that a planner takes or leaves, line by line. Any number can be typed
// over — the algorithm does not get the last word.

import React, { useMemo, useState } from "react";
import { Card, Chip, SectionTitle, SortTh, Stat, StatusDot, Table, Td, Th, fmtRunDate, useSort } from "@/components/ui";
import DropBar from "@/components/DropBar";
import EstateFilterBar from "@/components/EstateFilterBar";
import { PLANNING_BRAND, dropAllocation, dropPerformance, dropUnitsFor, filterStores } from "@/lib/engine";
import { CURRENT_SEASON, DROPS, NOW, clusterById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { HOLDBACK_SHARE, pct } from "@/lib/rules";

type Sort = "store" | "cluster" | "ach" | "fill" | "plan" | "rec" | "delta";

export default function Allocation() {
  const app = useApp();
  const dropId = app.estate.dropId;
  const drop = DROPS.find((d) => d.id === dropId) ?? DROPS[0];

  const stores = useMemo(() => filterStores(app.estate.filters), [app.estate.filters]);
  const rows = useMemo(
    () => dropAllocation(dropId, PLANNING_BRAND).filter((r) => stores.some((s) => s.id === r.store.id)),
    [dropId, stores],
  );
  const perf = useMemo(() => dropPerformance(dropId, stores), [dropId, stores]);

  // Nothing is recommended until someone asks for it.
  const [ran, setRan] = useState(false);
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [override, setOverride] = useState<Record<string, number>>({});
  const [applied, setApplied] = useState<string[]>([]);

  const units = dropUnitsFor(dropId, PLANNING_BRAND);
  const changed = rows.filter((r) => r.delta !== 0);
  const selected = rows.filter((r) => taken[r.store.id]);
  const movedUnits = selected.reduce((a, r) => a + Math.abs(r.delta), 0);
  const pending = rows.filter((r) => taken[r.store.id] || override[r.store.id] !== undefined).length;

  function finalFor(storeId: string, planned: number, recommended: number) {
    if (override[storeId] !== undefined) return override[storeId];
    return taken[storeId] ? recommended : planned;
  }

  function apply() {
    const lines = rows.filter((r) => taken[r.store.id] || override[r.store.id] !== undefined);
    if (lines.length === 0) return;
    app.dispatch({
      type: "alloc:push",
      pushes: lines.map((r, i) => ({
        id: `AP-RC-${r.store.id}-${i}`,
        at: NOW,
        by: app.actorName,
        storeId: r.store.id,
        styleId: "",
        units: finalFor(r.store.id, r.planned, r.recommended),
        origin: "drop" as const,
      })),
      by: app.actorName,
      label: `${drop.label} · ${lines.length} stores re-cut`,
    });
    setApplied([...applied, dropId]);
    app.toastNow(`${lines.length} stores re-cut`, "good");
  }

  const sorter = useSort<Sort>("delta");
  const sorted = sorter.sort(rows, (r, key) => {
    switch (key) {
      case "store": return r.store.name;
      case "cluster": return clusterById(r.store.clusterId).name;
      case "ach": return r.achievement;
      case "fill": return r.fillRate;
      case "plan": return r.planned;
      case "rec": return r.recommended;
      case "delta": return r.delta;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Allocation</h1>
          <p className="text-xs text-ink2 mt-1">
            {CURRENT_SEASON.name} · {drop.label} lands {fmtRunDate(drop.landsAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!ran ? (
            <button className="btn" data-run-realloc onClick={() => setRan(true)}>
              Run the re-allocation
            </button>
          ) : (
            <>
              <button className="btn" data-take-all onClick={() => setTaken(Object.fromEntries(changed.map((r) => [r.store.id, true])))}>
                Take all {changed.length}
              </button>
              <button className={pending > 0 ? "btn-primary" : "btn"} data-apply-recut disabled={pending === 0} onClick={apply}>
                Apply {pending > 0 ? `${pending} stores` : ""}
              </button>
            </>
          )}
        </div>
      </div>

      <EstateFilterBar />
      <DropBar />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Units in this drop" value={units.toLocaleString("en-IN")} sub={pct(drop.pctOfBuy)} emphasis />
        <Stat label="Styles in this drop" value={String(perf?.styles ?? 0)} sub={`${perf?.coreStyles ?? 0} core`} />
        <Stat label="Stores" value={String(rows.length)} />
        <Stat label="Held at warehouse" value={pct(HOLDBACK_SHARE)} />
      </div>

      <Card>
        <SectionTitle
          title={ran ? "Plan against today's signals" : "The plan as committed"}
          right={ran ? <Chip tone="warn">{changed.length} would change</Chip> : <Chip>Not re-run</Chip>}
        />
        <Table>
          <thead>
            <tr>
              <SortTh sortKey="store" sorter={sorter}>Store</SortTh>
              <SortTh sortKey="cluster" sorter={sorter}>Cluster</SortTh>
              <SortTh sortKey="ach" sorter={sorter} align="right">vs target</SortTh>
              <SortTh sortKey="fill" sorter={sorter} align="right">Fill rate</SortTh>
              <SortTh sortKey="plan" sorter={sorter} align="right">Plan</SortTh>
              {ran && <SortTh sortKey="rec" sorter={sorter} align="right">Recommended</SortTh>}
              {ran && <SortTh sortKey="delta" sorter={sorter} align="right">Change</SortTh>}
              <Th align="right">Final</Th>
              {ran && <Th align="right">Take</Th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const final = finalFor(r.store.id, r.planned, r.recommended);
              const edited = override[r.store.id] !== undefined;
              return (
                <tr key={r.store.id} data-alloc-row={taken[r.store.id] ? "taken" : "plan"}>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <StatusDot tone={r.delta > 0 ? "good" : r.delta < 0 ? "warn" : "neutral"} />
                      <span className="text-ink">{r.store.name}</span>
                      <span className="text-2xs text-muted">{r.store.grade}</span>
                    </span>
                  </Td>
                  <Td className="text-ink2">{clusterById(r.store.clusterId).name}</Td>
                  <Td align="right" className="num">{pct(r.achievement)}</Td>
                  <Td align="right" className="num">{pct(r.fillRate)}</Td>
                  <Td align="right" className="num text-ink2">{r.planned.toLocaleString("en-IN")}</Td>
                  {ran && <Td align="right" className="num">{r.recommended.toLocaleString("en-IN")}</Td>}
                  {ran && (
                    <Td align="right">
                      <span
                        className="num"
                        style={{ color: r.delta > 0 ? "var(--status-good)" : r.delta < 0 ? "var(--status-serious)" : "var(--text-muted)" }}
                      >
                        {r.delta > 0 ? "+" : ""}
                        {r.delta}
                      </span>
                    </Td>
                  )}
                  <Td align="right">
                    <input
                      type="number"
                      min={0}
                      value={final}
                      data-alloc-final
                      onChange={(e) => setOverride({ ...override, [r.store.id]: Math.max(0, Number(e.target.value) || 0) })}
                      className={`w-20 border px-2 py-1 text-sm text-right num bg-raised ${
                        edited ? "border-[color:var(--brand)] text-[color:var(--brand)]" : "border-line text-ink"
                      }`}
                    />
                  </Td>
                  {ran && (
                    <Td align="right">
                      <input
                        type="checkbox"
                        checked={!!taken[r.store.id]}
                        data-alloc-take
                        disabled={r.delta === 0}
                        onChange={(e) => setTaken({ ...taken, [r.store.id]: e.target.checked })}
                      />
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
        {ran && (
          <div className="mt-3 text-xs text-ink2 num">
            {selected.length} taken · {movedUnits} units moved · {Object.keys(override).length} typed over
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Drops" />
        <Table>
          <thead>
            <tr>
              <Th>Drop</Th>
              <Th>Lands</Th>
              <Th align="right">Share</Th>
              <Th align="right">Units</Th>
              <Th align="right">Applied</Th>
            </tr>
          </thead>
          <tbody>
            {DROPS.map((d) => (
              <tr key={d.id} data-drop-row>
                <Td className={d.id === dropId ? "text-ink" : "text-ink2"}>{d.label}</Td>
                <Td className="num text-xs">{fmtRunDate(d.landsAt)}</Td>
                <Td align="right" className="num">{pct(d.pctOfBuy)}</Td>
                <Td align="right" className="num">{dropUnitsFor(d.id, PLANNING_BRAND).toLocaleString("en-IN")}</Td>
                <Td align="right">{applied.includes(d.id) ? <Chip tone="good">Re-cut</Chip> : <span className="text-muted">—</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
