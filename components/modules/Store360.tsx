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
import { Card, Chip, Meter, SectionTitle, SortTh, Sparkline, Stat, StatusDot, Table, Tabs, Td, Th, useSort } from "@/components/ui";
import EstateFilterBar from "@/components/EstateFilterBar";
import {
  PERIODS,
  PERIOD_LABEL,
  PLANNING_BRAND,
  estateSummary,
  filterStores,
  istDiscipline,
  planningStores,
  markdownTrend,
  storeRows,
  type Period,
} from "@/lib/engine";
import { useApp } from "@/lib/state";
import type { Store } from "@/lib/types";
import StoreLink from "@/components/StoreLink";
import { inr, pct } from "@/lib/rules";

type StoreSort = "name" | "cluster" | "grade" | "sales" | "growth" | "ach" | "fill" | "st" | "core" | "broken" | "risk" | "ist" | "asks";

export default function Store360() {
  const app = useApp();
  const { filters, period } = app.estate;

  const stores = useMemo(() => filterStores(filters), [filters]);
  const summary = useMemo(() => estateSummary(stores, period, app.estate.dropId), [stores, period, app.estate.dropId]);
  const rows = useMemo(() => storeRows(stores, period, app.requests, app.estate.dropId), [stores, period, app.requests, app.estate.dropId]);


  const sorter = useSort<StoreSort>("risk");
  const sorted = sorter.sort(rows, (r, key) => {
    switch (key) {
      case "name": return r.store.name;
      case "cluster": return r.cluster.name;
      case "grade": return r.store.grade;
      case "sales": return r.sales;
      case "growth": return r.growth;
      case "ach": return r.achievement;
      case "fill": return r.fillRate;
      case "st": return r.sellThrough;
      case "core": return r.corePct;
      case "broken": return r.brokenStuds;
      case "risk": return r.valueAtRisk;
      case "ist": return istDiscipline(r.store.id).share;
      case "asks": return r.openAsks;
    }
  });
  const bandTone = summary.band === "healthy" ? "good" : summary.band === "thin" ? "critical" : "warn";

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
          options={PERIODS.map((pd) => ({ id: pd, label: PERIOD_LABEL[pd] }))}
        />
      </div>

      <EstateFilterBar />

      {stores.length === 0 ? (
        <Card>
          <div className="text-sm text-ink2">No store matches these filters.</div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat
              label="Fill rate"
              value={pct(summary.fillRate)}
              sub={`${summary.sellableUnits.toLocaleString("en-IN")} of ${summary.norm.toLocaleString("en-IN")} norm`}
              tone={bandTone}
              emphasis
            />
            <Stat
              label={PERIOD_LABEL[period]}
              value={inr(summary.sales, { compact: true })}
              sub={
                summary.days === 0 ? (
                  "Not landed yet"
                ) : (
                  <span>
                    {pct(summary.achievement)} of target ·{" "}
                    <span style={{ color: summary.growth >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                      {summary.growth >= 0 ? "+" : ""}
                      {pct(summary.growth)} vs LY
                    </span>
                  </span>
                )
              }
              tone={summary.achievement >= 1 ? "good" : summary.achievement >= 0.92 ? "warn" : "critical"}
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
            <Stat
              label="Broken studs"
              value={String(summary.brokenStuds)}
              sub={summary.brokenStuds > 0 ? inr(summary.brokenStudValue, { compact: true }) : undefined}
              tone={summary.brokenStuds > 0 ? "critical" : "good"}
            />
          </div>

          <div className="grid lg:grid-cols-[1.35fr_1fr] gap-3 items-start">
            <Card>
              <SectionTitle title="Markdown exposure" right={<Chip tone={summary.sellThrough >= 0.85 ? "good" : "warn"}>{pct(summary.sellThrough)} full price</Chip>} />
              <MarkdownTrend stores={stores} period={period} />
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
                  <SortTh sortKey="grade" sorter={sorter}>Store grade</SortTh>
                  <SortTh sortKey="sales" sorter={sorter} align="right">Sales</SortTh>
                  <SortTh sortKey="growth" sorter={sorter} align="right">vs LY</SortTh>
                  <SortTh sortKey="ach" sorter={sorter} align="right">vs target</SortTh>
                  <SortTh sortKey="fill" sorter={sorter} align="right">Fill rate</SortTh>
                  <SortTh sortKey="st" sorter={sorter} align="right">Sell-through</SortTh>
                  <SortTh sortKey="core" sorter={sorter} align="right">Core</SortTh>
                  <SortTh sortKey="broken" sorter={sorter} align="right">Broken studs</SortTh>
                  <SortTh sortKey="risk" sorter={sorter} align="right">At risk</SortTh>
                  <SortTh sortKey="ist" sorter={sorter} align="right">IST sold in 2d</SortTh>
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
                        <StoreLink storeId={r.store.id} />
                      </div>
                    </Td>
                    <Td className="text-ink2">{r.cluster.name}</Td>
                    <Td>{r.store.grade}</Td>
                    <Td align="right" className="num">{inr(r.sales, { compact: true })}</Td>
                    <Td align="right" className="num">
                      <span style={{ color: r.growth >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                        {r.growth >= 0 ? "+" : ""}
                        {pct(r.growth)}
                      </span>
                    </Td>
                    <Td align="right" className="num">{pct(r.achievement)}</Td>
                    <Td align="right" className="num">{pct(r.fillRate)}</Td>
                    <Td align="right" className="num">{pct(r.sellThrough)}</Td>
                    <Td align="right" className="num">{pct(r.corePct)}</Td>
                    <Td align="right" className="num">
                      {r.brokenStuds > 0 ? (
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <StatusDot tone="critical" />
                          {r.brokenStuds}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td align="right" className="num">{r.valueAtRisk > 0 ? inr(r.valueAtRisk, { compact: true }) : "—"}</Td>
                    <Td align="right" className="num">{pct(istDiscipline(r.store.id).share)}</Td>
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

// ── Markdown exposure over the chosen window ────────────────────────────────
//
// The number that matters upstream of everything else: what is still unsold as
// the full-price window closes, and what discounting it would cost. Follows the
// filters and the period above it.

function MarkdownTrend({ stores, period }: { stores: Store[]; period: Period }) {
  const series = useMemo(() => markdownTrend(stores, period), [stores, period]);
  const latest = series[series.length - 1] ?? 0;
  const first = series[0] ?? 0;
  const move = first > 0 ? (latest - first) / first : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[26px] font-semibold text-ink leading-none num">{inr(latest, { compact: true })}</div>
          <div className="text-2xs text-muted mt-1.5 num">
            {move >= 0 ? "+" : ""}
            {pct(move)} over the window
          </div>
        </div>
        <span className="num text-2xs" style={{ color: move > 0 ? "var(--status-critical)" : "var(--status-good)" }}>
          {move > 0 ? "building" : "clearing"}
        </span>
      </div>
      <Sparkline data={series} height={54} color={move > 0 ? "var(--flag-red)" : "var(--status-good)"} />
    </div>
  );
}
