"use client";

// Open To Buy — deliberately light.
//
// Budget, committed and received per brand × category, which yields what is
// left to spend. The full season-planning workbench is out of scope; this is
// the consumption view a category planner needs before backing a winner deeper.

import React, { useMemo } from "react";
import { Card, Chip, Meter, SectionTitle, Stat, StatusDot, Table, Td, Th } from "@/components/ui";
import { CURRENT_SEASON, OTB, STYLES } from "@/lib/seed";
import { PLANNING_BRAND } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { HOLDBACK_SHARE, inr, otbRemaining, pct } from "@/lib/rules";

export default function Otb() {
  const app = useApp();
  // One brand: planning owns Tommy.
  const lines = useMemo(() => OTB.filter((l) => l.brand === PLANNING_BRAND), []);

  const budget = lines.reduce((a, l) => a + l.budgetUnits, 0);
  const committed = lines.reduce((a, l) => a + l.committedUnits, 0);
  const received = lines.reduce((a, l) => a + l.receivedUnits, 0);
  const value = lines.reduce((a, l) => a + l.budgetValue, 0);
  const remaining = budget - committed;

  // Core carries across seasons and is never discounted, so its share of the
  // buy is the part of the budget that is not exposed to markdown.
  const coreUnits = STYLES.filter((s) => s.productType === "core" && s.brand === PLANNING_BRAND).reduce((a, s) => a + s.bought, 0);
  const allUnits = STYLES.filter((s) => s.brand === PLANNING_BRAND).reduce((a, s) => a + s.bought, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Open To Buy</h1>
          <p className="text-xs text-ink2 mt-1">{PLANNING_BRAND} · {CURRENT_SEASON.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" data-otb-alloc onClick={() => app.go("alloc")}>
            Cut it across stores
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="OTB remaining"
          value={remaining.toLocaleString("en-IN")}
          sub={`${pct(committed / Math.max(1, budget))} of budget committed`}
          tone={remaining > 0 ? "good" : "critical"}
          emphasis
        />
        <Stat label="Budget" value={budget.toLocaleString("en-IN")} sub={inr(value, { compact: true })} />
        <Stat label="Received" value={received.toLocaleString("en-IN")} sub={`${pct(received / Math.max(1, committed))} of the committed buy`} />
        <Stat label="Core share of buy" value={pct(coreUnits / Math.max(1, allUnits))} sub="Not exposed to markdown" />
      </div>

      <Card>
        <SectionTitle
          title="By category"
          right={<Chip tone="brand">{pct(HOLDBACK_SHARE)} held at warehouse</Chip>}
        />
        <Table>
          <thead>
            <tr>
              <Th>Category</Th>
              <Th align="right">Budget</Th>
              <Th align="right">Committed</Th>
              <Th align="right">Received</Th>
              <Th align="right">Left to spend</Th>
              <Th>Consumed</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const r = otbRemaining(line);
              const tight = r.pctConsumed > 0.92;
              return (
                <tr key={`${line.brand}-${line.category}`} data-otb-row>
                  <Td>
                    <div className="flex items-center gap-2">
                      <StatusDot tone={tight ? "warn" : "good"} />
                      <span className="text-ink">{line.category}</span>
                    </div>
                  </Td>
                  <Td align="right" className="num">{line.budgetUnits.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{line.committedUnits.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num text-ink2">{line.receivedUnits.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{r.units.toLocaleString("en-IN")}</Td>
                  <Td style={{ minWidth: 120 }}>
                    <Meter value={r.pctConsumed} target={1} tone={tight ? "var(--status-warning)" : "var(--status-good)"} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <SectionTitle title="Core and fashion in the buy" />
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th align="right">Styles</Th>
              <Th align="right">Units bought</Th>
              <Th align="right">Share</Th>
            </tr>
          </thead>
          <tbody>
            {(["core", "fashion"] as const).map((type) => {
              const styles = STYLES.filter((s) => s.productType === type && s.brand === PLANNING_BRAND);
              const units = styles.reduce((a, s) => a + s.bought, 0);
              return (
                <tr key={type} data-otb-type={type}>
                  <Td>{type === "core" ? "Core" : "Fashion"}</Td>
                  <Td align="right" className="num">{styles.length}</Td>
                  <Td align="right" className="num">{units.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{pct(units / Math.max(1, allUnits))}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
