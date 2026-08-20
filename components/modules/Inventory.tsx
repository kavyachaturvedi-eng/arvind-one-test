"use client";

// Inventory — where the units are, and what they are doing.
//
// This replaces Stock Position in the planning IA. A single-style reconciliation
// view belongs inside a store, not in the estate menu: a planner asks "where is
// my stock sitting and what is it worth", then goes to a store for the detail.

import React, { useMemo, useState } from "react";
import { BarChart, Card, SectionTitle, SortTh, Stat, StatusDot, Swatch, Table, Tabs, Td, Th, useSort } from "@/components/ui";
import {
  estateSummary,
  filterStores,
  planningStores,
  inventoryByCategory,
  inventoryByCluster,
  inventoryByType,
  styleInventory,
  trend,
  warehouseHeld,
  type InventoryLine,
} from "@/lib/engine";
import { useApp } from "@/lib/state";
import EstateFilterBar from "@/components/EstateFilterBar";
import { HOLDBACK_GOAL, inr, pct } from "@/lib/rules";

type Cut = "category" | "cluster" | "type";
type StyleCut = "all" | "risk" | "thin" | "heavy";
type StyleSort = "code" | "name" | "colour" | "type" | "stores" | "floor" | "wh" | "ros" | "cover" | "st" | "broken" | "risk";

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

  const sorter = useSort<StyleSort>("risk");
  const shownStyles =
    styleCut === "all"
      ? styles
      : styleCut === "risk"
      ? styles.filter((s) => s.valueAtRisk > 0)
      : styleCut === "thin"
      ? styles.filter((s) => s.cover < 21)
      : styles.filter((s) => s.cover > 120);

  const sortedStyles = sorter.sort(shownStyles, (r, key) => {
    switch (key) {
      case "code": return r.style.id;
      case "name": return r.style.name;
      case "colour": return r.style.colour;
      case "type": return r.style.productType;
      case "stores": return r.storesCarrying;
      case "floor": return r.sellable;
      case "wh": return r.warehouse;
      case "ros": return r.ros;
      case "cover": return Math.min(r.cover, 999);
      case "st": return r.sellThrough;
      case "broken": return r.unhealthyStores;
      case "risk": return r.valueAtRisk;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Inventory</h1>
          <p className="text-xs text-ink2 mt-1">
            {stores.length} of {planningStores().length} stores · {styles.length} styles
          </p>
        </div>
      </div>

      <EstateFilterBar />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat
          label="On floor"
          value={summary.sellableUnits.toLocaleString("en-IN")}
          sub={`${pct(summary.fillRate)} of norm`}
          tone={summary.band === "healthy" ? "good" : summary.band === "thin" ? "critical" : "warn"}
          emphasis
          spark={unitsTrend}
        />
        <Stat label="Floor value at MRP" value={inr(floorValue, { compact: true })} />
        <Stat label="In transit" value={summary.inTransit.toLocaleString("en-IN")} />
        <Stat label="Warehouse held" value={held.units.toLocaleString("en-IN")} sub={pct(held.share)} />
        <Stat
          label="Estate cover"
          value={`${Math.round(estateCover)} days`}
          tone={estateCover < 21 || estateCover > 120 ? "warn" : "good"}
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
              <SortTh sortKey="code" sorter={sorter}>SKU</SortTh>
              <SortTh sortKey="name" sorter={sorter}>Style</SortTh>
              <SortTh sortKey="colour" sorter={sorter}>Colour</SortTh>
              <SortTh sortKey="type" sorter={sorter}>Type</SortTh>
              <SortTh sortKey="stores" sorter={sorter} align="right">Stores</SortTh>
              <SortTh sortKey="floor" sorter={sorter} align="right">On floor</SortTh>
              <SortTh sortKey="wh" sorter={sorter} align="right">Warehouse</SortTh>
              <SortTh sortKey="ros" sorter={sorter} align="right">True ROS</SortTh>
              <SortTh sortKey="cover" sorter={sorter} align="right">Cover</SortTh>
              <SortTh sortKey="st" sorter={sorter} align="right">Sell-through</SortTh>
              <SortTh sortKey="broken" sorter={sorter} align="right">Broken in</SortTh>
              <SortTh sortKey="risk" sorter={sorter} align="right">At risk</SortTh>
            </tr>
          </thead>
          <tbody>
            {sortedStyles.map((r) => (
              <tr key={r.style.id} data-inv-style>
                <Td className="num text-xs text-ink2">{r.style.id}</Td>
                <Td className="text-ink">{r.style.name}</Td>
                <Td>
                  <Swatch hex={r.style.colourHex} label={r.style.colour} />
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
