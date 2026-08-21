"use client";

// Allocation — the plan, then what today's signals would do to it.
//
// It opens on the plan alone, because that is what was committed. Running the
// re-allocation is a deliberate act, and what comes back is a recommendation per
// store that a planner takes or leaves, line by line. Any number can be typed
// over — the algorithm does not get the last word.

import React, { useMemo, useState } from "react";
import { Card, Chip, SectionTitle, SortTh, Stat, StatusDot, Table, Td, Th, fmtRunDate, relTime, useSort } from "@/components/ui";
import DropBar from "@/components/DropBar";
import EstateFilterBar from "@/components/EstateFilterBar";
import { PLANNING_BRAND, allocationSplit, dropAllocation, dropPerformance, dropUnitsFor, filterStores } from "@/lib/engine";
import { CURRENT_SEASON, DROPS, NOW, clusterById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import StoreLink from "@/components/StoreLink";
import { HOLDBACK_SHARE, pct } from "@/lib/rules";

type Sort = "store" | "cluster" | "ach" | "fill" | "plan" | "rec" | "delta";

export default function Allocation() {
  const [split, setSplit] = useState<string | null>(null);
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
  // Only a change worth shipping counts. Below this, re-cutting moves stock
  // around the estate for no gain, which is how a re-run habit starts.
  const MATERIAL_UNITS = 15;
  const MATERIAL_SHARE = 0.08;
  const material = rows.filter((r) => Math.abs(r.delta) >= MATERIAL_UNITS && Math.abs(r.delta) / Math.max(1, r.planned) >= MATERIAL_SHARE);
  const isMaterial = (r: (typeof rows)[number]) =>
    Math.abs(r.delta) >= MATERIAL_UNITS && Math.abs(r.delta) / Math.max(1, r.planned) >= MATERIAL_SHARE;

  const lastPush = app.pushes.find((x) => x.origin === "drop");
  const lastRunLabel = applied.includes(dropId)
    ? "just now"
    : lastPush
    ? relTime(lastPush.at, NOW)
    : "not yet this drop";
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
        {ran && (
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn" data-take-all onClick={() => setTaken(Object.fromEntries(material.map((r) => [r.store.id, true])))}>
              Take the {material.length} material
            </button>
            <button className={pending > 0 ? "btn-primary" : "btn"} data-apply-recut disabled={pending === 0} onClick={apply}>
              Apply {pending > 0 ? `${pending} stores` : ""}
            </button>
          </div>
        )}
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
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs text-muted num">
                Last re-cut {lastRunLabel}
              </span>
              {!ran &&
                (material.length > 0 ? (
                  <button className="btn !py-1 !text-2xs" data-run-realloc onClick={() => setRan(true)}>
                    {material.length} stores have moved — see the re-cut
                  </button>
                ) : (
                  <Chip tone="good">Nothing material has moved</Chip>
                ))}
              {ran && <Chip tone="warn">{material.length} material · {changed.length - material.length} minor</Chip>}
            </div>
          }
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
              {ran && <Th>Why</Th>}
              <Th align="right">Final</Th>
              {ran && <Th align="right">Take</Th>}
              <Th align="right">Split</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const final = finalFor(r.store.id, r.planned, r.recommended);
              const edited = override[r.store.id] !== undefined;
              return (
                <React.Fragment key={r.store.id}>
                <tr data-alloc-row={taken[r.store.id] ? "taken" : "plan"}>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <StatusDot tone={r.delta > 0 ? "good" : r.delta < 0 ? "warn" : "neutral"} />
                      <StoreLink storeId={r.store.id} />
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
                  {ran && (
                    <Td>
                      <span className="text-xs text-ink2">{isMaterial(r) ? r.reason : "Too small to be worth moving"}</span>
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
                        disabled={!isMaterial(r)}
                        onChange={(e) => setTaken({ ...taken, [r.store.id]: e.target.checked })}
                      />
                    </Td>
                  )}
                  <Td align="right">
                    <button
                      className="btn !py-1 !text-2xs"
                      data-alloc-split
                      onClick={() => setSplit(split === r.store.id ? null : r.store.id)}
                    >
                      {split === r.store.id ? "Hide" : "Of what"}
                    </button>
                  </Td>
                </tr>
                {split === r.store.id && (
                  <tr data-alloc-split-row>
                    <Td colSpan={ran ? 11 : 7}>
                      <AllocationOfWhat storeId={r.store.id} units={final} />
                    </Td>
                  </tr>
                )}
                </React.Fragment>
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

/**
 * A number of units is not a decision until it says units of what. The split
 * follows what the door sells, not what it already holds — allocating to the
 * standing stock mix is how a store ends up deeper in the wrong category.
 */
function AllocationOfWhat({ storeId, units }: { storeId: string; units: number }) {
  const split = useMemo(() => allocationSplit(storeId, units), [storeId, units]);
  if (units <= 0) return <div className="text-xs text-ink2 py-1">Nothing allocated to this door.</div>;
  return (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 py-1">
      <div>
        <div className="label mb-1">By category</div>
        {split.byCategory.map((r) => (
          <div key={r.key} className="flex items-baseline gap-2 text-xs py-0.5" data-of-what-cat>
            <span className="text-ink flex-1 truncate">{r.label}</span>
            <span className="num text-ink2">{pct(r.share)}</span>
            <span className="num text-ink font-medium w-12 text-right">{r.units}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="label mb-1">By price point</div>
        {split.byBand.map((r) => (
          <div key={r.key} className="flex items-baseline gap-2 text-xs py-0.5" data-of-what-band>
            <span className="text-ink flex-1 truncate">{r.label}</span>
            <span className="num text-ink2">{pct(r.share)}</span>
            <span className="num text-ink font-medium w-12 text-right">{r.units}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
