"use client";

// Activity log — what happened, who did it, and when.
//
// Two sources, one stream. Every mutation in the app already appends an audit
// entry, and the replenishment run is reconstructed from the run itself, so the
// questions "when did the algorithm fire" and "what did it move" have an answer
// on screen rather than in someone's memory.

import React, { useMemo, useState } from "react";
import { Card, SectionTitle, SortTh, Stat, StatusDot, Table, Tabs, Td, Th, fmtDateTime, relTime, useSort } from "@/components/ui";
import { planningStores, replenRun } from "@/lib/engine";
import { NOW, storeById, styleById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { inr, lastRunAt } from "@/lib/rules";
import type { AuditEntry } from "@/lib/types";

type Source = "all" | "run" | "people";
type LogSort = "at" | "actor" | "action" | "object";

interface LogRow extends AuditEntry {
  source: "run" | "people";
}

export default function ActivityLog() {
  const app = useApp();
  const [source, setSource] = useState<Source>("all");
  const [q, setQ] = useState("");

  // The run does not write to the audit trail when it fires — nobody is sitting
  // at a keyboard at 06:00 on a Tuesday — so it is reconstructed from the run.
  const runRows = useMemo<LogRow[]>(() => {
    const run = replenRun(NOW);
    const at = lastRunAt(NOW);
    const replen = run.lines.filter((l) => l.kind === "replenish");
    const renew = run.lines.filter((l) => l.kind === "renew");
    const units = run.lines.reduce((a, l) => a + l.units, 0);

    const rows: LogRow[] = [
      {
        at,
        actor: "Replenishment Agent",
        action: "Run fired",
        object: `${run.triggered.length} of ${planningStores().length} stores qualified · ${run.lines.length} lines · ${units} units proposed`,
        system: "Arvind One" as const,
        source: "run" as const,
      },
      {
        at: at + 60_000,
        actor: "Replenishment Agent",
        action: "Split applied",
        object: `${replen.reduce((a, l) => a + l.units, 0)} units to replenish · ${renew.reduce((a, l) => a + l.units, 0)} units to renew`,
        system: "Arvind One" as const,
        source: "run" as const,
      },
      ...run.triggered.map((t, i) => ({
        at: at + 120_000 + i * 1_000,
        actor: "Replenishment Agent",
        action: "Store qualified",
        object: `${storeById(t.storeId).name} — ${t.reason}`,
        system: "Arvind One" as const,
        source: "run" as const,
      })),
      ...run.lines.map((l, i) => ({
        at: at + 300_000 + i * 1_000,
        actor: "Replenishment Agent",
        action: l.kind === "replenish" ? "Replenishment proposed" : "Renewal proposed",
        object: `${l.units} × ${styleById(l.styleId).name}${l.size ? ` (${l.size})` : ""} → ${storeById(l.storeId).name} · unlocks ${inr(l.valueUnlocked, { compact: true })}`,
        system: "Arvind One" as const,
        source: "run" as const,
      })),
    ];
    return rows;
  }, []);

  const peopleRows = useMemo<LogRow[]>(() => app.audit.map((e) => ({ ...e, source: "people" as const })), [app.audit]);

  const all = useMemo(() => {
    const rows = source === "run" ? runRows : source === "people" ? peopleRows : [...runRows, ...peopleRows];
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) => !needle || r.actor.toLowerCase().includes(needle) || r.action.toLowerCase().includes(needle) || r.object.toLowerCase().includes(needle),
    );
  }, [source, runRows, peopleRows, q]);

  const sorter = useSort<LogSort>("at");
  const sorted = sorter.sort(all, (r, key) => {
    switch (key) {
      case "at": return r.at;
      case "actor": return r.actor;
      case "action": return r.action;
      case "object": return r.object;
    }
  });

  const actors = new Set(all.map((r) => r.actor)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Activity log</h1>
        <Tabs
          value={source}
          onChange={setSource}
          options={[
            { id: "all", label: "Everything", count: runRows.length + peopleRows.length },
            { id: "run", label: "Replenishment run", count: runRows.length },
            { id: "people", label: "People", count: peopleRows.length },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Entries" value={String(all.length)} emphasis />
        <Stat label="Actors" value={String(actors)} />
        <Stat label="Run entries" value={String(runRows.length)} />
        <Stat label="Last run" value={relTime(lastRunAt(NOW), NOW)} />
      </div>

      <Card>
        <SectionTitle title="Every action, newest first" />
        <div className="mb-3">
          <input
            value={q}
            data-log-search
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a person, a store, a style or an action"
            className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
          />
        </div>
        {sorted.length === 0 ? (
          <div className="text-sm text-ink2">Nothing matches.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <SortTh sortKey="at" sorter={sorter}>When</SortTh>
                <SortTh sortKey="actor" sorter={sorter}>Who</SortTh>
                <SortTh sortKey="action" sorter={sorter}>Action</SortTh>
                <SortTh sortKey="object" sorter={sorter}>What</SortTh>
                <Th>System</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 120).map((r, i) => (
                <tr key={`${r.at}-${i}`} data-log-row={r.source}>
                  <Td className="num text-xs whitespace-nowrap">{fmtDateTime(r.at)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={r.source === "run" ? "warn" : "good"} />
                      <span className="text-ink">{r.actor}</span>
                    </span>
                  </Td>
                  <Td className="text-ink">{r.action}</Td>
                  <Td className="text-xs text-ink2">{r.object}</Td>
                  <Td className="text-xs text-ink2">{r.system}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
