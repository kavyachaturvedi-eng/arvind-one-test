"use client";

// Store 360 — every store, and filters that narrow it.
//
// Flat on purpose. The earlier version drilled brand → region → cluster → store
// and replaced the numbers above you as you went, so you could never tell what
// the figures on screen described. Now there is one list of the estate, filters
// that say plainly what has been narrowed, and one store you can open.
//
// One brand: planning owns Tommy. There is no brand switch anywhere here.

import React, { useMemo } from "react";
import { Card, Chip, Meter, SectionTitle, SortTh, Stat, StatusDot, Table, Tabs, Td, Th, useSort } from "@/components/ui";
import {
  NO_FILTERS,
  PERIOD_LABEL,
  PLANNING_BRAND,
  estateSummary,
  estateTrend,
  filterStores,
  filtersActive,
  planningStores,
  storeRows,
  type Period,
} from "@/lib/engine";
import { CLUSTERS } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { inr, pct } from "@/lib/rules";

type StoreSort = "name" | "cluster" | "grade" | "sales" | "ach" | "fill" | "st" | "core" | "risk" | "asks";

export default function Store360() {
  const app = useApp();
  const { filters, period } = app.estate;

  const stores = useMemo(() => filterStores(filters), [filters]);
  const summary = useMemo(() => estateSummary(stores, period), [stores, period]);
  const rows = useMemo(() => storeRows(stores, period, app.requests), [stores, period, app.requests]);
  const spark = useMemo(() => (stores.length ? estateTrend(stores) : []), [stores]);

  const narrowed = filtersActive(filters);

  const sorter = useSort<StoreSort>("risk");
  const sorted = sorter.sort(rows, (r, key) => {
    switch (key) {
      case "name": return r.store.name;
      case "cluster": return r.cluster.name;
      case "grade": return r.store.grade;
      case "sales": return r.sales;
      case "ach": return r.achievement;
      case "fill": return r.fillRate;
      case "st": return r.sellThrough;
      case "core": return r.corePct;
      case "risk": return r.valueAtRisk;
      case "asks": return r.openAsks;
    }
  });
  const bandTone = summary.band === "healthy" ? "good" : summary.band === "thin" ? "critical" : "warn";
  const clusters = CLUSTERS.filter((c) => planningStores().some((s) => s.clusterId === c.id));
  const regions = [...new Set(planningStores().map((s) => s.region))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Store 360</h1>
          <p className="text-xs text-ink2 mt-1">
            {stores.length} of {planningStores().length} stores
          </p>
        </div>
        <Tabs
          value={period}
          onChange={(p: Period) => app.setPeriod(p)}
          options={[
            { id: "today", label: PERIOD_LABEL.today },
            { id: "week", label: PERIOD_LABEL.week },
            { id: "mtd", label: PERIOD_LABEL.mtd },
          ]}
        />
      </div>

      <Card pad={false}>
        <div className="p-3 flex items-end gap-3 flex-wrap">
          <Filter label="Region" value={filters.region} onChange={(v) => app.setFilter({ region: v })} options={regions.map((r) => [r, r])} name="region" />
          <Filter label="Cluster" value={filters.cluster} onChange={(v) => app.setFilter({ cluster: v })} options={clusters.map((c) => [c.id, c.name])} name="cluster" />
          <Filter label="Grade" value={filters.grade} onChange={(v) => app.setFilter({ grade: v })} options={[["A", "A"], ["B", "B"], ["C", "C"]]} name="grade" />
          <Filter
            label="Fill rate"
            value={filters.band}
            onChange={(v) => app.setFilter({ band: v })}
            options={[["thin", "Below band"], ["healthy", "In band"], ["heavy", "Above band"]]}
            name="band"
          />
          {narrowed > 0 && (
            <button className="btn !py-1.5 !text-xs" data-clear-filters onClick={() => app.setFilter(NO_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {stores.length === 0 ? (
        <Card>
          <div className="text-sm text-ink2">No store matches these filters.</div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Fill rate"
              value={pct(summary.fillRate)}
              sub={`${summary.sellableUnits.toLocaleString("en-IN")} of ${summary.norm.toLocaleString("en-IN")} norm`}
              tone={bandTone}
              emphasis
            />
            <Stat
              label={`Sales · ${PERIOD_LABEL[period].toLowerCase()}`}
              value={inr(summary.sales, { compact: true })}
              sub={`${pct(summary.achievement)} of target`}
              tone={summary.achievement >= 1 ? "good" : summary.achievement >= 0.92 ? "warn" : "critical"}
              spark={spark}
            />
            <Stat
              label="Full-price sell-through"
              value={pct(summary.sellThrough)}
              tone={summary.sellThrough >= 0.85 ? "good" : summary.sellThrough >= 0.7 ? "warn" : "critical"}
            />
            <Stat
              label="At risk this week"
              value={inr(summary.valueAtRisk, { compact: true })}
              sub={`${summary.brokenStyles} broken · ${summary.atRiskStyles} at risk`}
              tone={summary.valueAtRisk > 0 ? "critical" : "good"}
            />
          </div>

          <div className="grid lg:grid-cols-[1.35fr_1fr] gap-3 items-start">
            <Card>
              <SectionTitle title={`KPIs · ${PERIOD_LABEL[period].toLowerCase()}`} />
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Sales</Th>
                    <Th align="right">Bills</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">ATV</Th>
                    <Th align="right">UPT</Th>
                    <Th align="right">ASP</Th>
                    <Th align="right">Conversion</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td align="right" className="num">{inr(summary.sales, { compact: true })}</Td>
                    <Td align="right" className="num">{Math.round(summary.bills).toLocaleString("en-IN")}</Td>
                    <Td align="right" className="num">{Math.round(summary.qty).toLocaleString("en-IN")}</Td>
                    <Td align="right" className="num">{inr(summary.atv)}</Td>
                    <Td align="right" className="num">{summary.upt.toFixed(2)}</Td>
                    <Td align="right" className="num">{inr(summary.asp)}</Td>
                    <Td align="right" className="num">{pct(summary.conversion)}</Td>
                  </tr>
                </tbody>
              </Table>
            </Card>

            <Card>
              <SectionTitle title="Core and fashion" />
              <div className="space-y-3">
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink2">Core</span>
                    <span className="num text-ink">{pct(summary.corePct)}</span>
                  </div>
                  <Meter
                    value={summary.corePct}
                    target={summary.coreTarget}
                    tone={summary.mix === "on_plan" ? "var(--status-good)" : "var(--status-warning)"}
                  />
                  <div className="text-2xs text-muted mt-1">
                    Target {pct(summary.coreTarget)} · {summary.coreUnits.toLocaleString("en-IN")} units
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink2">Fashion</span>
                    <span className="num text-ink">{pct(1 - summary.corePct)}</span>
                  </div>
                  <Meter value={1 - summary.corePct} target={1 - summary.coreTarget} tone="var(--series-2)" />
                  <div className="text-2xs text-muted mt-1">{summary.fashionUnits.toLocaleString("en-IN")} units</div>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle title="Stores" />
            <Table>
              <thead>
                <tr>
                  <SortTh sortKey="name" sorter={sorter}>Store</SortTh>
                  <SortTh sortKey="cluster" sorter={sorter}>Cluster</SortTh>
                  <SortTh sortKey="grade" sorter={sorter}>Grade</SortTh>
                  <SortTh sortKey="sales" sorter={sorter} align="right">Sales</SortTh>
                  <SortTh sortKey="ach" sorter={sorter} align="right">vs target</SortTh>
                  <SortTh sortKey="fill" sorter={sorter} align="right">Fill rate</SortTh>
                  <SortTh sortKey="st" sorter={sorter} align="right">Sell-through</SortTh>
                  <SortTh sortKey="core" sorter={sorter} align="right">Core</SortTh>
                  <SortTh sortKey="risk" sorter={sorter} align="right">At risk</SortTh>
                  <SortTh sortKey="asks" sorter={sorter} align="right">Asks</SortTh>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.store.id}
                    className="hover:bg-[color:var(--plane)] cursor-pointer"
                    data-store-row={r.store.id}
                    onClick={() => app.openStore(r.store.id)}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <StatusDot tone={r.band === "healthy" ? "good" : r.band === "thin" ? "critical" : "warn"} />
                        <span className="text-ink">{r.store.name}</span>
                      </div>
                    </Td>
                    <Td className="text-ink2">{r.cluster.name}</Td>
                    <Td>{r.store.grade}</Td>
                    <Td align="right" className="num">{inr(r.sales, { compact: true })}</Td>
                    <Td align="right" className="num">{pct(r.achievement)}</Td>
                    <Td align="right" className="num">{pct(r.fillRate)}</Td>
                    <Td align="right" className="num">{pct(r.sellThrough)}</Td>
                    <Td align="right" className="num">{pct(r.corePct)}</Td>
                    <Td align="right" className="num">{r.valueAtRisk > 0 ? inr(r.valueAtRisk, { compact: true }) : "—"}</Td>
                    <Td align="right">{r.openAsks > 0 ? <Chip tone="warn">{r.openAsks}</Chip> : <span className="text-muted">—</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  name: string;
}) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <select
        value={value}
        data-filter={name}
        onChange={(e) => onChange(e.target.value)}
        className={`border bg-raised px-2 py-1.5 text-xs text-ink ${
          value === "all" ? "border-line" : "border-[color:var(--brand)] text-[color:var(--brand)]"
        }`}
      >
        <option value="all">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
