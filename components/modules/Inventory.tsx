"use client";

// Inventory — where the units are, and what they are doing.
//
// This replaces Stock Position in the planning IA. A single-style reconciliation
// view belongs inside a store, not in the estate menu: a planner asks "where is
// my stock sitting and what is it worth", then goes to a store for the detail.

import React, { useMemo, useState } from "react";
import { BarChart, Card, Chip, ColumnChart, SectionTitle, Stat, StatusDot, Swatch, Table, Tabs, Td, Th } from "@/components/ui";
import {
  PLANNING_BRAND,
  estateSummary,
  filterStores,
  inventoryByCategory,
  inventoryByCluster,
  inventoryByType,
  styleInventory,
  trend,
  warehouseHeld,
  type InventoryLine,
} from "@/lib/engine";
import { useApp } from "@/lib/state";
import { HOLDBACK_GOAL, inr, pct } from "@/lib/rules";

type Cut = "category" | "cluster" | "type";
type StyleCut = "all" | "risk" | "thin" | "heavy";

export default function Inventory() {
  const app = useApp();
  const stores = useMemo(() => filterStores(app.estate.filters), [app.estate.filters]);
  const summary = useMemo(() => estateSummary(stores, app.estate.period), [stores, app.estate.period]);
  const [cut, setCut] = useState<Cut>("category");
  const [styleCut, setStyleCut] = useState<StyleCut>("all");

  const byCategory = useMemo(() => inventoryByCategory(stores), [stores]);
  const byCluster = useMemo(() => inventoryByCluster(stores), [stores]);
  const byType = useMemo(() => inventoryByType(stores), [stores]);
  const styles = useMemo(() => styleInventory(stores), [stores]);

  const lines: InventoryLine[] = cut === "category" ? byCategory : cut === "cluster" ? byCluster : byType;
  const held = warehouseHeld();
  const floorValue = byCategory.reduce((a, l) => a + l.floorValue, 0);
  const totalRos = byCategory.reduce((a, l) => a + l.ros, 0);
  const estateCover = totalRos > 0 ? summary.sellableUnits / totalRos : 0;

  // Fourteen days of estate sellable units, so the trend is visible rather than
  // implied. Deterministic, like everything else on these screens.
  const unitsTrend = useMemo(() => trend(`inv-${stores.length}`, 14, Math.max(1, summary.sellableUnits), 0.015), [stores.length, summary.sellableUnits]);

  const shownStyles =
    styleCut === "all"
      ? styles
      : styleCut === "risk"
      ? styles.filter((s) => s.valueAtRisk > 0)
      : styleCut === "thin"
      ? styles.filter((s) => s.cover < 21)
      : styles.filter((s) => s.cover > 120);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Inventory</h1>
          <p className="text-xs text-ink2 mt-1">
            {PLANNING_BRAND} · {stores.length} stores · {styles.length} styles carried
          </p>
        </div>
        <Chip tone="brand">{pct(held.share)} held at warehouse · goal {pct(HOLDBACK_GOAL)}</Chip>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat
          label="On floor"
          value={summary.sellableUnits.toLocaleString("en-IN")}
          sub={`${pct(summary.fillRate)} of norm`}
          tone={summary.band === "healthy" ? "good" : summary.band === "thin" ? "critical" : "warn"}
          emphasis
          spark={unitsTrend}
        />
        <Stat label="Floor value at MRP" value={inr(floorValue, { compact: true })} sub="Units tied up in stores" />
        <Stat label="In transit" value={summary.inTransit.toLocaleString("en-IN")} sub="Inbound, not yet countable" />
        <Stat
          label="Estate cover"
          value={`${Math.round(estateCover)} days`}
          sub="At today's true rate of sale"
          tone={estateCover < 21 ? "warn" : estateCover > 120 ? "warn" : "good"}
        />
        <Stat
          label="At risk this week"
          value={inr(summary.valueAtRisk, { compact: true })}
          sub={`${summary.brokenStyles} broken size sets`}
          tone={summary.valueAtRisk > 0 ? "critical" : "good"}
        />
      </div>

      <Card>
        <SectionTitle
          title="Where the units are"
          right={
            <Tabs
              value={cut}
              onChange={setCut}
              options={[
                { id: "category", label: "By category" },
                { id: "cluster", label: "By cluster" },
                { id: "type", label: "Core / fashion" },
              ]}
            />
          }
        />
        <div className="mb-4">
          <BarChart
            data={lines.map((l) => ({
              label: l.label,
              value: l.sellable,
              tone: l.valueAtRisk > 0 ? "var(--status-warning)" : "var(--series-1)",
              note: `${inr(l.floorValue, { compact: true })} at MRP`,
            }))}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>{cut === "category" ? "Category" : cut === "cluster" ? "Cluster" : "Type"}</Th>
              <Th align="right">On floor</Th>
              <Th align="right">Reserved</Th>
              <Th align="right">In transit</Th>
              <Th align="right">Warehouse</Th>
              <Th align="right">Cover</Th>
              <Th align="right">Sell-through</Th>
              <Th align="right">Floor value</Th>
              <Th align="right">At risk</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} data-inv-line={cut}>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <StatusDot tone={l.valueAtRisk > 0 ? "warn" : "good"} />
                    <span className="text-ink">{l.label}</span>
                  </span>
                </Td>
                <Td align="right" className="num">{l.sellable.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num text-ink2">{l.reserved.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num text-ink2">{l.inTransit.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{l.warehouse.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{l.cover > 900 ? "—" : `${Math.round(l.cover)}d`}</Td>
                <Td align="right" className="num">{pct(l.sellThrough)}</Td>
                <Td align="right" className="num">{inr(l.floorValue, { compact: true })}</Td>
                <Td align="right" className="num">{l.valueAtRisk > 0 ? inr(l.valueAtRisk, { compact: true }) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <SectionTitle
          title="Every style carried"
          right={
            <Tabs
              value={styleCut}
              onChange={setStyleCut}
              options={[
                { id: "all", label: "All", count: styles.length },
                { id: "risk", label: "At risk", count: styles.filter((s) => s.valueAtRisk > 0).length },
                { id: "thin", label: "Under 3 weeks", count: styles.filter((s) => s.cover < 21).length },
                { id: "heavy", label: "Over 4 months", count: styles.filter((s) => s.cover > 120).length },
              ]}
            />
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Style</Th>
              <Th>Type</Th>
              <Th align="right">Stores</Th>
              <Th align="right">On floor</Th>
              <Th align="right">Warehouse</Th>
              <Th align="right">True ROS</Th>
              <Th align="right">Cover</Th>
              <Th align="right">Sell-through</Th>
              <Th align="right">Broken in</Th>
              <Th align="right">At risk</Th>
            </tr>
          </thead>
          <tbody>
            {shownStyles.map((r) => (
              <tr key={r.style.id} data-inv-style>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch hex={r.style.colourHex} label={r.style.colour} />
                    <span className="text-ink">{r.style.name}</span>
                  </span>
                </Td>
                <Td>{r.style.productType === "core" ? "Core" : "Fashion"}</Td>
                <Td align="right" className="num">{r.storesCarrying}</Td>
                <Td align="right" className="num">{r.sellable.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{r.warehouse.toLocaleString("en-IN")}</Td>
                <Td align="right" className="num">{r.ros.toFixed(2)}</Td>
                <Td align="right" className="num" style={r.cover < 21 ? { color: "var(--status-warning)" } : undefined}>
                  {r.cover > 900 ? "—" : `${Math.round(r.cover)}d`}
                </Td>
                <Td align="right" className="num">{pct(r.sellThrough)}</Td>
                <Td align="right" className="num">{r.unhealthyStores > 0 ? `${r.unhealthyStores} stores` : "—"}</Td>
                <Td align="right" className="num">{r.valueAtRisk > 0 ? inr(r.valueAtRisk, { compact: true }) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
