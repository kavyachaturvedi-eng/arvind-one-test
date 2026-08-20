"use client";

// Replenishment — runs on its own.
//
// Tuesday and Friday, the same style comes back to fill the size gaps a store
// has opened up. Planning does not approve each line: the control is pausing a
// store, and holding a line if it is obviously wrong. Why each store qualified
// is in the Activity log, not spread across this screen.

import React, { useMemo, useState } from "react";
import { Card, Chip, SectionTitle, SortTh, Stat, StatusDot, Table, Tabs, Td, Th, fmtRunDate, useSort } from "@/components/ui";
import { applyMove, planningStores, replenRun, warehouseHeld } from "@/lib/engine";
import { NOW, storeById, styleById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { inr, lastRunAt, nextRunAt, pct } from "@/lib/rules";
import type { ReplenLine, StockMove } from "@/lib/types";

type Filter = "open" | "shipped" | "held";
type LineSort = "store" | "style" | "units" | "wh" | "value";

export default function Replen() {
  const app = useApp();
  const run = useMemo(() => replenRun(NOW, app.pausedStores, app.thresholds), [app.pausedStores, app.thresholds]);
  const [filter, setFilter] = useState<Filter>("open");

  const open = run.lines.filter((l) => !app.released.includes(l.id) && !app.dropped.includes(l.id));
  const shown = filter === "open" ? open : filter === "shipped" ? run.lines.filter((l) => app.released.includes(l.id)) : run.lines.filter((l) => app.dropped.includes(l.id));

  const sorter = useSort<LineSort>("value");
  const sorted = sorter.sort(shown, (l, key) => {
    switch (key) {
      case "store": return storeById(l.storeId).name;
      case "style": return styleById(l.styleId).name;
      case "units": return l.units;
      case "wh": return l.warehouseUnits;
      case "value": return l.valueUnlocked;
    }
  });

  const held = warehouseHeld();
  const stores = planningStores();

  function ship(lines: ReplenLine[]) {
    if (lines.length === 0) return;
    const moves: StockMove[] = [];
    lines.forEach((l) => {
      if (!l.size) return;
      const ok = applyMove({ from: "warehouse", toStoreId: l.storeId, styleId: l.styleId, size: l.size, units: l.units });
      if (ok) {
        moves.push({
          id: `MV-${l.id}`,
          at: NOW,
          by: app.actorName,
          from: "warehouse",
          toStoreId: l.storeId,
          styleId: l.styleId,
          size: l.size,
          units: l.units,
          reason: "Replenishment run",
        });
      }
    });
    app.dispatch({ type: "run:release", lineIds: lines.map((l) => l.id), by: app.actorName, label: `${lines.length} lines · ${moves.reduce((a, m) => a + m.units, 0)} units` });
    app.dispatch({
      type: "cycle:apply",
      id: run.id,
      moves,
      by: app.actorName,
    });
    app.toastNow(`${moves.reduce((a, m) => a + m.units, 0)} units on their way`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Replenishment</h1>
          <p className="text-xs text-ink2 mt-1">
            Ran {fmtRunDate(lastRunAt(NOW))} · next {fmtRunDate(nextRunAt(NOW))}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" data-go-log onClick={() => app.go("log")}>
            Run log
          </button>
          {open.length > 0 && (
            <button className="btn-primary" data-ship-all onClick={() => ship(open)}>
              Ship all {open.length} {open.length === 1 ? "line" : "lines"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Stores in this run" value={`${run.triggered.length} of ${stores.length}`} tone={run.triggered.length > 0 ? "warn" : "good"} emphasis />
        <Stat label="Units proposed" value={open.reduce((a, l) => a + l.units, 0).toLocaleString("en-IN")} />
        <Stat label="Paused stores" value={String(app.pausedStores.length)} tone={app.pausedStores.length > 0 ? "warn" : undefined} />
        <Stat label="Warehouse held" value={pct(held.share)} />
      </div>

      <Card>
        <SectionTitle
          title="Lines"
          right={
            <Tabs
              value={filter}
              onChange={setFilter}
              options={[
                { id: "open", label: "To ship", count: open.length },
                { id: "shipped", label: "Shipped", count: app.released.length },
                { id: "held", label: "Held", count: app.dropped.length },
              ]}
            />
          }
        />
        {sorted.length === 0 ? (
          <div className="text-sm text-ink2">Nothing here.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <SortTh sortKey="store" sorter={sorter}>Store</SortTh>
                <Th>SKU</Th>
                <SortTh sortKey="style" sorter={sorter}>Style</SortTh>
                <Th>Size</Th>
                <SortTh sortKey="units" sorter={sorter} align="right">Units</SortTh>
                <SortTh sortKey="wh" sorter={sorter} align="right">Warehouse</SortTh>
                <SortTh sortKey="value" sorter={sorter} align="right">Unlocks</SortTh>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((line) => {
                const store = storeById(line.storeId);
                const style = styleById(line.styleId);
                const isShipped = app.released.includes(line.id);
                const isHeld = app.dropped.includes(line.id);
                return (
                  <tr key={line.id} data-replen-line>
                    <Td className="text-ink">{store.name}</Td>
                    <Td className="num text-xs text-ink2">{style.id}</Td>
                    <Td className="text-ink">{style.name}</Td>
                    <Td className="num">{line.size ?? "—"}</Td>
                    <Td align="right" className="num">{line.units}</Td>
                    <Td align="right" className="num text-ink2">{line.warehouseUnits}</Td>
                    <Td align="right" className="num">{inr(line.valueUnlocked, { compact: true })}</Td>
                    <Td align="right">
                      {isShipped ? (
                        <Chip tone="good">Shipped</Chip>
                      ) : isHeld ? (
                        <Chip tone="neutral">Held</Chip>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button className="btn !py-1 !text-2xs" data-line-ship onClick={() => ship([line])}>
                            Ship
                          </button>
                          <button
                            className="btn !py-1 !text-2xs"
                            data-line-hold
                            onClick={() => {
                              app.dispatch({ type: "run:drop", lineIds: [line.id], by: app.actorName, label: `${store.name} · ${style.name}` });
                              app.toastNow("Line held", "warn");
                            }}
                          >
                            Hold
                          </button>
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle title="Which stores the run covers" />
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Cluster</Th>
              <Th>Grade</Th>
              <Th align="right">Lines this run</Th>
              <Th align="right">Units</Th>
              <Th align="right">Replenishment</Th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => {
              const mine = run.lines.filter((l) => l.storeId === store.id);
              const paused = app.pausedStores.includes(store.id);
              return (
                <tr key={store.id} data-replen-store={paused ? "paused" : "running"}>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <StatusDot tone={paused ? "neutral" : mine.length > 0 ? "warn" : "good"} />
                      <span className="text-ink">{store.name}</span>
                    </span>
                  </Td>
                  <Td className="text-ink2">{store.clusterId}</Td>
                  <Td>{store.grade}</Td>
                  <Td align="right" className="num">{paused ? "—" : mine.length}</Td>
                  <Td align="right" className="num">{paused ? "—" : mine.reduce((a, l) => a + l.units, 0)}</Td>
                  <Td align="right">
                    <button
                      className="btn !py-1 !text-2xs"
                      data-pause-store={paused ? "resume" : "pause"}
                      onClick={() => {
                        app.dispatch({ type: "store:pause", storeId: store.id, paused: !paused, by: app.actorName });
                        app.toastNow(paused ? `Resumed for ${store.name}` : `Paused for ${store.name}`, paused ? "good" : "warn");
                      }}
                    >
                      {paused ? "Resume" : "Pause"}
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
