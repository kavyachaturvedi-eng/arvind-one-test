"use client";

// Allocation — the pre-season re-cut.
//
// The buy was committed a year ago against norms. Store performance has moved
// since. This screen shows the plan, the re-cut on today's signals, and the
// difference between them — which is the decision, not the data.

import React, { useMemo, useState } from "react";
import { Callout, Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th } from "@/components/ui";
import { fmtRunDate } from "@/components/ui";
import { PLANNING_BRAND, dropAllocation, dropUnitsFor } from "@/lib/engine";
import { CURRENT_SEASON, DROPS, NOW, clusterById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { HOLDBACK_SHARE, inr, pct } from "@/lib/rules";

export default function Allocation() {
  const app = useApp();
  const [dropId, setDropId] = useState(DROPS[0].id);
  const [applied, setApplied] = useState<string[]>([]);

  // One brand: planning owns Tommy, so there is nothing to switch between.
  const rows = useMemo(() => dropAllocation(dropId, PLANNING_BRAND), [dropId]);
  const drop = DROPS.find((d) => d.id === dropId)!;
  const units = dropUnitsFor(dropId, PLANNING_BRAND);

  const moved = rows.filter((r) => r.delta > 0).reduce((a, r) => a + r.delta, 0);
  const daysOut = Math.round((drop.landsAt - NOW) / 86_400_000);

  function applyRecut() {
    const pushes = rows
      .filter((r) => r.delta !== 0)
      .map((r, i) => ({
        id: `AP-RC-${r.store.id}-${i}`,
        at: NOW,
        by: app.actorName,
        storeId: r.store.id,
        styleId: "",
        units: r.recommended,
        origin: "drop" as const,
      }));
    app.dispatch({
      type: "alloc:push",
      pushes,
      by: app.actorName,
      label: `${drop.label} re-cut · ${moved} units moved across ${rows.filter((r) => r.delta !== 0).length} stores`,
    });
    setApplied([...applied, dropId]);
    app.toastNow(`${drop.label} re-cut applied · ${moved} units moved`, "good");
  }

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
          {!applied.includes(dropId) && moved > 0 && (
            <button className="btn-primary" data-apply-recut onClick={applyRecut}>
              Apply the re-cut
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {DROPS.map((d) => (
          <button
            key={d.id}
            data-drop={d.id}
            onClick={() => setDropId(d.id)}
            className={`px-2.5 py-1.5 text-xs font-medium border ${
              dropId === d.id
                ? "border-[color:var(--brand)] text-[color:var(--brand)] bg-[color:var(--brand-soft)]"
                : "border-line text-ink2 hover:text-ink"
            }`}
          >
            {d.label} · {pct(d.pctOfBuy)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Units in this drop" value={units.toLocaleString("en-IN")} sub={pct(drop.pctOfBuy)} emphasis />
        <Stat label="Units moved by the re-cut" value={moved.toLocaleString("en-IN")} sub={`${rows.filter((r) => r.delta !== 0).length} stores`} tone="warn" />
        <Stat label="Stores" value={String(rows.length)} />
        <Stat label="Held at warehouse" value={pct(HOLDBACK_SHARE)} />
      </div>

      {applied.includes(dropId) && (
        <Callout tone="good" title={`${drop.label} re-cut applied`} />
      )}

      <Card>
        <SectionTitle title="Plan against today's signals" />
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Cluster</Th>
              <Th align="right">MTD vs target</Th>
              <Th align="right">Fill rate</Th>
              <Th align="right">Plan</Th>
              <Th align="right">Re-cut</Th>
              <Th align="right">Change</Th>
              <Th>Why</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.store.id} data-alloc-row>
                <Td>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={r.delta > 0 ? "good" : r.delta < 0 ? "warn" : "neutral"} />
                    <span className="text-ink">{r.store.name}</span>
                    <span className="text-2xs text-muted">{r.store.grade}</span>
                  </div>
                </Td>
                <Td className="text-ink2">{clusterById(r.store.clusterId).name}</Td>
                <Td align="right" className="num">{pct(r.achievement)}</Td>
                <Td align="right" className="num">{pct(r.fillRate)}</Td>
                <Td align="right" className="num text-ink2">{r.planned.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{r.recommended.toLocaleString("en-IN")}</Td>
                <Td align="right">
                  <span
                    className="num"
                    style={{ color: r.delta > 0 ? "var(--status-good)" : r.delta < 0 ? "var(--status-serious)" : "var(--text-muted)" }}
                  >
                    {r.delta > 0 ? "+" : ""}
                    {r.delta}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs text-ink2">{r.reason}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <SectionTitle title="Drop calendar" />
        <Table>
          <thead>
            <tr>
              <Th>Drop</Th>
              <Th>Lands</Th>
              <Th align="right">Share of buy</Th>
              <Th align="right">Units</Th>
            </tr>
          </thead>
          <tbody>
            {DROPS.map((d) => (
              <tr key={d.id}>
                <Td>{d.label}</Td>
                <Td>{fmtRunDate(d.landsAt)}</Td>
                <Td align="right" className="num">{pct(d.pctOfBuy)}</Td>
                <Td align="right" className="num">{dropUnitsFor(d.id, PLANNING_BRAND).toLocaleString("en-IN")}</Td>
              </tr>
            ))}
            <tr>
              <Td className="text-ink2">Held at warehouse</Td>
              <Td className="text-ink2">—</Td>
              <Td align="right" className="num text-ink2">{pct(HOLDBACK_SHARE)}</Td>
              <Td align="right" className="num text-ink2">
                {Math.round((dropUnitsFor("AW26-D1", PLANNING_BRAND) / 0.45) * HOLDBACK_SHARE).toLocaleString("en-IN")}
              </Td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
