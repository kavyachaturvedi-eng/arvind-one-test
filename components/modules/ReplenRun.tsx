"use client";

// The Tuesday/Friday replenishment and renewal run.
//
// A store qualifies on fill rate or brokenness. Its gap to the healthy floor is
// then split between the same style returning (replenishment, mostly core) and a
// new style arriving (renewal, mostly fashion), per that store's own share.
// Planning releases the lines; nothing moves until it does.

import React, { useMemo, useState } from "react";
import { Callout, Card, Chip, SectionTitle, Stat, StatusDot, Table, Tabs, Td, Th, fmtRunDate } from "@/components/ui";
import { PLANNING_BRAND, planningStores, replenRun, warehouseHeld } from "@/lib/engine";
import { NOW, storeById, styleById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { BROKEN_TRIGGER, FILL_TRIGGER, HOLDBACK_GOAL, inr, lastRunAt, nextRunAt, pct, splitReplenRenew } from "@/lib/rules";
import type { ReplenLine } from "@/lib/types";

type Filter = "all" | "replenish" | "renew" | "released";

export default function ReplenRunView() {
  const app = useApp();
  const run = useMemo(() => replenRun(NOW), []);
  const [filter, setFilter] = useState<Filter>("all");

  const open = run.lines.filter((l) => !app.released.includes(l.id) && !app.dropped.includes(l.id));
  const replenUnits = open.filter((l) => l.kind === "replenish").reduce((a, l) => a + l.units, 0);
  const renewUnits = open.filter((l) => l.kind === "renew").reduce((a, l) => a + l.units, 0);
  const held = warehouseHeld();

  const shown =
    filter === "all"
      ? open
      : filter === "released"
      ? run.lines.filter((l) => app.released.includes(l.id))
      : open.filter((l) => l.kind === filter);

  function release(lines: ReplenLine[]) {
    if (lines.length === 0) return;
    const units = lines.reduce((a, l) => a + l.units, 0);
    app.dispatch({
      type: "run:release",
      lineIds: lines.map((l) => l.id),
      by: app.actorName,
      label: `${lines.length} lines · ${units} units`,
    });
    app.toastNow(`${lines.length} lines released · ${units} units to pick`, "good");
  }

  function drop(line: ReplenLine) {
    app.dispatch({
      type: "run:drop",
      lineIds: [line.id],
      by: app.actorName,
      label: `${storeById(line.storeId).name} · ${styleById(line.styleId).name}`,
    });
    app.toastNow("Line dropped from this run", "warn");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Replenishment &amp; renewal</h1>
          <p className="text-xs text-ink2 mt-1">
            {PLANNING_BRAND} · ran {fmtRunDate(lastRunAt(NOW))} · next {fmtRunDate(nextRunAt(NOW))}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="brand">Tuesday &amp; Friday</Chip>
          {open.length > 0 && (
            <button className="btn-primary" data-release-all onClick={() => release(open)}>
              Release all {open.length} {open.length === 1 ? "line" : "lines"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Stores triggered"
          value={String(run.triggered.length)}
          sub={`Below ${pct(FILL_TRIGGER)} of norm, or over ${pct(BROKEN_TRIGGER)} unhealthy`}
          tone={run.triggered.length > 0 ? "warn" : "good"}
          emphasis
        />
        <Stat label="Replenishment" value={replenUnits.toLocaleString("en-IN")} sub="Same style back, size gaps first" />
        <Stat label="Renewal" value={renewUnits.toLocaleString("en-IN")} sub="New style replacing a finished one" />
        <Stat
          label="Warehouse held"
          value={held.units.toLocaleString("en-IN")}
          sub={`${pct(held.share)} of the buy · goal ${pct(HOLDBACK_GOAL)}`}
        />
      </div>

      {app.released.length > 0 && (
        <Callout tone="good" title={`${app.released.length} ${app.released.length === 1 ? "line" : "lines"} released this session`}>
          Picking advice is with the warehouse. Released lines stay on this run so the trail is readable.
        </Callout>
      )}

      <Card>
        <SectionTitle
          title="Why these stores qualified"
          right={<Chip>{run.triggered.length} of {planningStores().length}</Chip>}
        />
        <div className="space-y-1.5">
          {run.triggered.map((t) => (
            <div key={t.storeId} className="flex items-start gap-2.5 text-sm">
              <StatusDot tone="warn" />
              <span className="text-ink shrink-0">{storeById(t.storeId).name}</span>
              <span className="text-ink2">{t.reason}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle
          title="Run lines"
          right={
            <Tabs
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "All", count: open.length },
                { id: "replenish", label: "Replenish", count: open.filter((l) => l.kind === "replenish").length },
                { id: "renew", label: "Renew", count: open.filter((l) => l.kind === "renew").length },
                { id: "released", label: "Released", count: app.released.length },
              ]}
            />
          }
        />
        {shown.length === 0 ? (
          <div className="text-sm text-ink2">Nothing in this cut.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>Style</Th>
                <Th>Kind</Th>
                <Th align="right">Units</Th>
                <Th align="right">Warehouse</Th>
                <Th align="right">Unlocks</Th>
                <Th>Why</Th>
                <Th align="right">Decide</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((line) => {
                const store = storeById(line.storeId);
                const style = styleById(line.styleId);
                const isReleased = app.released.includes(line.id);
                return (
                  <tr key={line.id} data-run-line={line.kind}>
                    <Td>
                      <span className="text-ink">{store.name}</span>
                      <span className="text-2xs text-muted ml-1.5">{store.grade}</span>
                    </Td>
                    <Td>
                      {style.name}
                      {line.size ? <span className="text-2xs text-muted ml-1.5">{line.size}</span> : null}
                    </Td>
                    <Td>
                      <Chip tone={line.kind === "replenish" ? "brand" : "warn"}>
                        {line.kind === "replenish" ? "Replenish" : "Renew"}
                      </Chip>
                    </Td>
                    <Td align="right" className="num">{line.units}</Td>
                    <Td align="right" className="num text-ink2">{line.warehouseUnits}</Td>
                    <Td align="right" className="num">{inr(line.valueUnlocked, { compact: true })}</Td>
                    <Td>
                      <span className="text-xs text-ink2">{line.reason}</span>
                    </Td>
                    <Td align="right">
                      {isReleased ? (
                        <Chip tone="good">Released</Chip>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button className="btn !py-1 !text-2xs" data-line-release onClick={() => release([line])}>
                            Release
                          </button>
                          <button className="btn !py-1 !text-2xs" data-line-drop onClick={() => drop(line)}>
                            Drop
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
        <SectionTitle title="Replenish and renew split, by store" />
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Grade</Th>
              <Th align="right">Replenish share</Th>
              <Th align="right">Of 100 units</Th>
              <Th align="right">Lines this run</Th>
            </tr>
          </thead>
          <tbody>
            {run.triggered.map((t) => {
              const store = storeById(t.storeId);
              const split = splitReplenRenew(100, store.replenShare);
              const lines = run.lines.filter((l) => l.storeId === store.id);
              return (
                <tr key={store.id} data-split-row>
                  <Td>{store.name}</Td>
                  <Td>{store.grade}</Td>
                  <Td align="right" className="num">{pct(store.replenShare)}</Td>
                  <Td align="right" className="num">
                    {split.replenish} back · {split.renew} new
                  </Td>
                  <Td align="right" className="num">{lines.length}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
