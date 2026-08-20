"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Performance — the leadership and planner view. Full-price sell-through, fill
// rate, size-set health and markdown exposure across the estate, with the
// sell-through-to-margin chain and an editable uplift model.
//
// Benchmark: 85–90% full-price sell-through.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { STOCK, STYLES } from "@/lib/seed";
import {
  allVitals,
  brandRollups,
  categoryRollups,
  enterprise,
  regionRollups,
  trend,
  type StoreVitals,
} from "@/lib/engine";
import { sellThroughUplift } from "@/lib/rules";
import { useApp } from "@/lib/state";
import {
  BarChart,
  Callout,
  Card,
  Chip,
  ColumnChart,
  Freshness,
  Meter,
  SectionTitle,
  Stat,
  StatusDot,
  Table,
  Tabs,
  Td,
  Th,
  inr,
  pct,
} from "@/components/ui";

const BENCH_LO = 0.85;
const BENCH_HI = 0.9;
const BENCH_MID = (BENCH_LO + BENCH_HI) / 2;
/** Stated by the CEO in discovery. The demo estate below measures lower — both are shown. */
const AFL_STATED_ST = 0.74;

type ViewId = "brand" | "category" | "region";
type SortKey = "achievement" | "sellThrough" | "fillRate" | "conversion" | "atv" | "upt" | "sizeSetScore";

export default function Performance() {
  const app = useApp();
  // Super Admin gets the short version: KPIs, the causal chain, and the rollups —
  // no model sliders, no store league.
  const admin = app.role === "leadership";
  const e = useMemo(() => enterprise(), []);
  const vitals = useMemo(() => allVitals(), []);
  const brands = useMemo(() => brandRollups(), []);
  const cats = useMemo(() => categoryRollups(), []);
  const regions = useMemo(() => regionRollups(), []);

  const [view, setView] = useState<ViewId>("brand");
  const [sort, setSort] = useState<SortKey>("achievement");
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [threshold, setThreshold] = useState(0.9);

  // ── Uplift model inputs (drive both the bridge and the funding number) ──────
  const seasonUnitsDefault = useMemo(() => STYLES.reduce((a, s) => a + s.bought, 0), []);
  const avgMrpDefault = useMemo(
    () => Math.round(STYLES.reduce((a, s) => a + s.mrp * s.bought, 0) / STYLES.reduce((a, s) => a + s.bought, 0)),
    []
  );
  const [currentST, setCurrentST] = useState(AFL_STATED_ST);
  const [targetST, setTargetST] = useState(0.82);
  const [seasonUnits, setSeasonUnits] = useState(seasonUnitsDefault);
  const [avgMrp, setAvgMrp] = useState(avgMrpDefault);
  const [depth, setDepth] = useState(0.35);
  const [margin, setMargin] = useState(0.52);

  const uplift = sellThroughUplift({
    currentSellThrough: currentST,
    targetSellThrough: targetST,
    seasonUnits,
    averageMrp: avgMrp,
    markdownDepth: depth,
    grossMargin: margin,
  });

  // ── Causal-chain numbers, all derived from the dataset ──────────────────────
  const totalNorm = vitals.reduce((a, v) => a + v.store.norm, 0);
  const estateFill = e.totalUnits / Math.max(1, totalNorm);
  const misplacedUnits = Math.round(
    vitals.reduce((a, v) => a + Math.max(0, v.sellableUnits - v.store.norm * estateFill), 0)
  );
  const oosDayShare = useMemo(
    () => STOCK.reduce((a, r) => a + (28 - r.inStockDays), 0) / (28 * STOCK.length),
    []
  );
  const carriedCombos = 132; // store × style combinations actually carried, from the assortment rules
  const brokenShare = e.brokenStyles / carriedCombos;
  const weakCats = cats.filter((c) => c.sellThrough < e.sellThrough);
  const overbuyShare = weakCats.reduce((a, c) => a + c.units, 0) / Math.max(1, e.totalUnits);
  const marginLost = e.markdownExposure * margin;
  const annualSales = (e.mtdSales / 13) * 365;
  const marketingAtFourPct = annualSales * 0.04;

  // ── Sell-through bridge ─────────────────────────────────────────────────────
  const gapPts = Math.max(0, BENCH_MID - currentST) * 100;
  const signals = [
    { label: "Broken size sets", raw: brokenShare, basis: `${e.brokenStyles} broken of ${carriedCombos} store × style combinations carried` },
    { label: "Stock in the wrong store", raw: misplacedUnits / Math.max(1, e.totalUnits), basis: `${misplacedUnits.toLocaleString("en-IN")} units held above an even split against norm` },
    { label: "Late replenishment", raw: oosDayShare, basis: `${pct(oosDayShare)} of SKU-days in the last 28 had nothing on the floor to sell` },
    { label: "Over-buy on weak options", raw: overbuyShare, basis: `${weakCats.map((c) => c.category).join(", ")} sit below the estate average sell-through` },
  ];
  const signalSum = signals.reduce((a, s) => a + s.raw, 0) || 1;
  const steps = signals.map((s) => ({ ...s, pts: (s.raw / signalSum) * gapPts }));

  // ── Store league ────────────────────────────────────────────────────────────
  const league = useMemo(() => {
    const rows = exceptionsOnly ? vitals.filter((v) => v.achievement < threshold) : [...vitals];
    const key = sort;
    return rows.sort((a, b) => (b[key] as number) - (a[key] as number));
  }, [vitals, sort, exceptionsOnly, threshold]);

  function openStore(v: StoreVitals) {
    app.setStore(v.store.id);
    app.toastNow(`Scoped to ${v.store.name} — ${pct(v.achievement)} of target, size-set health ${pct(v.sizeSetScore)}`, "info");
    app.go("storeday");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Performance</h1>
        </div>
        <div className="flex items-center gap-2">
          <Freshness minutes={18} />
        </div>
      </div>

      {/* ── Hero row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat
          label="Full-price sell-through"
          value={pct(e.sellThrough, 1)}
          emphasis
          tone="critical"
          spark={trend("estate-st", 14, 100, 0.012)}
        />
        <Stat
          label="Markdown exposure"
          value={inr(e.markdownExposure, { compact: true })}
          tone="warn"
        />
        <Stat
          label="Fill rate vs norm"
          value={pct(e.fillRate)}
          sub={
            <>
              <div className="mb-1.5">Best-in-class band 97–105%</div>
              <Meter value={e.fillRate} target={1} />
            </>
          }
          tone="critical"
        />
        <Stat
          label="Size-set health"
          value={pct(e.sizeSetScore)}
          tone="warn"
        />
        <Stat
          label="Value at risk"
          value={inr(e.valueAtRisk, { compact: true })}
          tone="critical"
        />
      </div>

      {/* ── Causal chain ── */}
      <Card>
        <SectionTitle
          title="Why the gap exists"
        />
        <div className="grid grid-cols-1 md:grid-cols-9 gap-2 items-stretch">
          <ChainNode
            n={1}
            title="Forecasting & allocation"
            value={pct(oosDayShare)}
            note="of SKU-days had nothing to sell — so naive ROS learns to under-buy the winners"
          />
          <ChainArrow />
          <ChainNode
            n={2}
            title="Wrong store, wrong size"
            value={`${misplacedUnits.toLocaleString("en-IN")} u`}
            note={`held above an even split against norm, while ${e.brokenStyles} size sets sit broken`}
          />
          <ChainArrow />
          <ChainNode
            n={3}
            title="Markdown"
            value={inr(e.markdownExposure, { compact: true })}
            note={`exposure at ${pct(depth)} expected depth on residual stock`}
            tone="warn"
          />
          <ChainArrow />
          <ChainNode
            n={4}
            title="Margin compression"
            value={inr(marginLost, { compact: true })}
            note={`gross margin foregone at ${pct(margin)} margin`}
            tone="critical"
          />
          <ChainArrow />
          <ChainNode
            n={5}
            title="Less marketing"
            value={pct(marginLost / Math.max(1, marketingAtFourPct))}
            note="of a full year's marketing budget at 4% of net sales"
            tone="critical"
          />
        </div>
        <p className="text-2xs text-muted mt-3 leading-relaxed">
          Assumptions on this row: markdown depth {pct(depth)} and gross margin {pct(margin)} are the model inputs below,
          so moving the sliders moves this chain. Annualised sales extrapolated from MTD ({inr(e.mtdSales, { compact: true })} over
          13 trading days). Marketing benchmarked at 4% of net sales.
        </p>
      </Card>

      {!admin && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Bridge ── */}
        <Card>
          <SectionTitle
            title="Where the gap to benchmark goes"
          />
          <div className="space-y-2">
            <BridgeRow label="Today" from={0} to={currentST * 100} max={BENCH_MID * 100} colour="var(--baseline)" value={pct(currentST, 1)} />
            {steps.map((s, i) => {
              const cum = currentST * 100 + steps.slice(0, i).reduce((a, x) => a + x.pts, 0);
              return (
                <BridgeRow
                  key={s.label}
                  label={s.label}
                  from={cum}
                  to={cum + s.pts}
                  max={BENCH_MID * 100}
                  colour="var(--series-1)"
                  value={`+${s.pts.toFixed(1)} pts`}
                  note={s.basis}
                />
              );
            })}
            <BridgeRow label="Benchmark 85–90%" from={0} to={BENCH_MID * 100} max={BENCH_MID * 100} colour="var(--brand)" value={pct(BENCH_MID, 1)} />
          </div>
          <p className="text-2xs text-muted mt-3 leading-relaxed">
            Stated assumption: the four levers are weighted by their observed share in this dataset
            ({pct(brokenShare, 1)} broken sets, {pct(misplacedUnits / Math.max(1, e.totalUnits), 1)} misplaced units,{" "}
            {pct(oosDayShare, 1)} out-of-stock days, {pct(overbuyShare, 1)} units in below-average categories), normalised to
            fill the {gapPts.toFixed(1)}-point gap. It is an attribution, not a measurement — the shares are arguable, the
            signals underneath are not.
          </p>
        </Card>

        {/* ── Uplift model ── */}
        <Card>
          <SectionTitle
            title="What closing the gap is worth"
          />
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="label">Target</span>
            {[0.78, 0.82, 0.86].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTargetST(t);
                  app.toastNow(`Target set to ${pct(t)} full-price sell-through`, "info");
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  Math.abs(targetST - t) < 0.001 ? "bg-[color:var(--brand)] text-white border-transparent" : "border-line text-ink2 hover:bg-[color:var(--plane)]"
                }`}
              >
                {pct(t)}
              </button>
            ))}
            <button
              className="btn-ghost text-xs"
              onClick={() => {
                setCurrentST(e.sellThrough);
                app.toastNow(`Baseline switched to the measured estate figure, ${pct(e.sellThrough, 1)}`, "warn");
              }}
            >
              Use measured estate baseline
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Slider label="Current sell-through" value={currentST} min={0.4} max={0.9} step={0.01} onChange={setCurrentST} fmt={(v) => pct(v)} />
            <Slider label="Target sell-through" value={targetST} min={0.5} max={0.95} step={0.01} onChange={setTargetST} fmt={(v) => pct(v)} />
            <Slider label="Season units" value={seasonUnits} min={50000} max={600000} step={5000} onChange={setSeasonUnits} fmt={(v) => `${(v / 1000).toFixed(0)}k u`} />
            <Slider label="Average MRP" value={avgMrp} min={1500} max={8000} step={50} onChange={setAvgMrp} fmt={(v) => inr(v)} />
            <Slider label="Markdown depth" value={depth} min={0.1} max={0.6} step={0.01} onChange={setDepth} fmt={(v) => pct(v)} />
            <Slider label="Gross margin" value={margin} min={0.3} max={0.7} step={0.01} onChange={setMargin} fmt={(v) => pct(v)} />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <Stat label="Units moved at full price" value={`${(uplift.unitsMoved / 1000).toFixed(1)}k`} sub={`${uplift.unitsMoved.toLocaleString("en-IN")} units`} />
            <Stat label="Markdown avoided" value={inr(uplift.markdownAvoided, { compact: true })} />
            <Stat label="Margin unlocked" value={inr(uplift.marginUnlocked, { compact: true })} tone="good" emphasis />
          </div>

          <div className="mt-3 rounded-lg border border-line bg-[color:var(--plane)] p-3">
            <div className="label mb-1.5">Assumptions</div>
            <ul className="text-2xs text-ink2 space-y-1 leading-relaxed">
              <li>
                Baseline {pct(currentST)} — {Math.abs(currentST - AFL_STATED_ST) < 0.005 ? "the stated AFL figure (72–75%)" : "manually set"}.
                The 15-store estate below measures {pct(e.sellThrough, 1)}; use the button above to model on that instead.
              </li>
              <li>Benchmark 85–90% full-price sell-through.</li>
              <li>Season units {seasonUnits.toLocaleString("en-IN")} (dataset buy: {seasonUnitsDefault.toLocaleString("en-IN")}), average MRP {inr(avgMrp)} (buy-weighted: {inr(avgMrpDefault)}).</li>
              <li className="font-mono">units_moved = (target − current) × season_units</li>
              <li className="font-mono">markdown_avoided = units_moved × mrp × depth</li>
              <li className="font-mono">margin_unlocked = units_moved × mrp × margin × depth</li>
              <li>Not modelled: price elasticity, cannibalisation across brands, and the cost of the transfers that deliver the uplift.</li>
            </ul>
          </div>
        </Card>
      </div>
      )}

      {/* ── Brand / category / region ── */}
      <Card>
        <SectionTitle
          title="Brand, category and region"
          sub="Same definitions, three lenses."
          right={
            <Tabs
              value={view}
              onChange={setView}
              options={[
                { id: "brand", label: "Brand", count: brands.length },
                { id: "category", label: "Category", count: cats.length },
                { id: "region", label: "Region", count: regions.length },
              ]}
            />
          }
        />

        {view === "brand" && (
          <Table>
            <thead>
              <tr>
                <Th>Brand</Th>
                <Th align="right">Stores</Th>
                <Th align="right">Full-price sell-through</Th>
                <Th align="right">Sellable units</Th>
                <Th align="right">Fill rate</Th>
                <Th align="right">Size-set health</Th>
                <Th align="right">Markdown exposure</Th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.brand}>
                  <Td>{b.brand}</Td>
                  <Td align="right" className="num">{b.stores}</Td>
                  <Td align="right" className="num">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={b.sellThrough >= BENCH_LO ? "good" : b.sellThrough >= 0.6 ? "warn" : "critical"} />
                      {pct(b.sellThrough, 1)}
                    </span>
                  </Td>
                  <Td align="right" className="num">{b.units.toLocaleString("en-IN")}</Td>
                  <Td align="right" className="num">{pct(b.fillRate)}</Td>
                  <Td align="right" className="num">{pct(b.sizeSetScore)}</Td>
                  <Td align="right" className="num">{inr(b.markdownExposure, { compact: true })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {view === "category" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <div className="label mb-2">Full-price sell-through against the benchmark midpoint</div>
              <ColumnChart
                categories={cats.map((c) => c.category)}
                series={[
                  { name: "Full-price sell-through", color: "var(--series-1)", values: cats.map((c) => c.sellThrough * 100) },
                  { name: "Benchmark midpoint (87.5%)", color: "var(--series-2)", values: cats.map(() => BENCH_MID * 100) },
                ]}
                format={(n) => `${n.toFixed(1)}%`}
                height={170}
              />
            </div>
            <div>
              <div className="label mb-2">Sellable units, with broken-set rate</div>
              <BarChart
                data={cats.map((c) => ({ label: `${c.category} · ${pct(c.brokenPct)} broken`, value: c.units }))}
                format={(n) => n.toLocaleString("en-IN")}
              />
            </div>
          </div>
        )}

        {view === "region" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <div className="label mb-2">Full-price sell-through by region</div>
              <BarChart data={regions.map((r) => ({ label: r.region, value: r.sellThrough * 100 }))} format={(n) => `${n.toFixed(1)}%`} max={100} />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Region</Th>
                  <Th align="right">Stores</Th>
                  <Th align="right">Fill rate</Th>
                  <Th align="right">Value at risk</Th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.region}>
                    <Td>{r.region}</Td>
                    <Td align="right" className="num">{r.stores}</Td>
                    <Td align="right" className="num">{pct(r.fillRate)}</Td>
                    <Td align="right" className="num">{inr(r.valueAtRisk, { compact: true })}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* ── Store league ── */}
      {!admin && (
      <Card>
        <SectionTitle
          title="Store league"
          right={
            <label className="inline-flex items-center gap-2 text-xs text-ink2">
              <input type="checkbox" checked={exceptionsOnly} onChange={(ev) => setExceptionsOnly(ev.target.checked)} />
              Below {pct(threshold)} of target only
              <select
                className="rounded-md border border-line bg-raised px-1.5 py-1 text-xs"
                value={threshold}
                onChange={(ev) => setThreshold(Number(ev.target.value))}
              >
                {[0.85, 0.9, 0.95, 1].map((t) => (
                  <option key={t} value={t}>{pct(t)}</option>
                ))}
              </select>
            </label>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <SortTh k="achievement" sort={sort} setSort={setSort}>Achievement</SortTh>
              <SortTh k="sellThrough" sort={sort} setSort={setSort}>Sell-through</SortTh>
              <SortTh k="fillRate" sort={sort} setSort={setSort}>Fill rate</SortTh>
              <SortTh k="conversion" sort={sort} setSort={setSort}>Conversion</SortTh>
              <SortTh k="atv" sort={sort} setSort={setSort}>ATV</SortTh>
              <SortTh k="upt" sort={sort} setSort={setSort}>UPT</SortTh>
              <SortTh k="sizeSetScore" sort={sort} setSort={setSort}>Size-set health</SortTh>
            </tr>
          </thead>
          <tbody>
            {league.map((v) => (
              <tr key={v.store.id} className="hover:bg-[color:var(--plane)] cursor-pointer" onClick={() => openStore(v)}>
                <Td>
                  <div className="text-ink font-medium">{v.store.name}</div>
                  <div className="text-2xs text-muted">{v.store.brand} · {v.store.city} · grade {v.store.grade}</div>
                </Td>
                <Td align="right" className="num">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={v.achievement >= 1 ? "good" : v.achievement >= threshold ? "warn" : "critical"} />
                    {pct(v.achievement)}
                  </span>
                </Td>
                <Td align="right" className="num">{pct(v.sellThrough, 1)}</Td>
                <Td align="right" className="num">{pct(v.fillRate)}</Td>
                <Td align="right" className="num">{pct(v.conversion, 1)}</Td>
                <Td align="right" className="num">{inr(v.atv)}</Td>
                <Td align="right" className="num">{v.upt.toFixed(2)}</Td>
                <Td align="right" className="num">{pct(v.sizeSetScore)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {league.length === 0 && <p className="text-xs text-ink2 mt-3">No store is below {pct(threshold)} of target. Nothing to manage.</p>}
        <p className="text-2xs text-muted mt-3">
          Showing {league.length} of {vitals.length} stores. Clicking a row scopes the whole app to that store and opens its day.
        </p>
      </Card>
      )}
    </div>
  );
}

// ── Local sub-components ─────────────────────────────────────────────────────

function ChainNode({ n, title, value, note, tone }: { n: number; title: string; value: string; note: string; tone?: "warn" | "critical" }) {
  return (
    <div className="md:col-span-1 rounded-lg border border-line bg-[color:var(--plane)] p-2.5 flex flex-col">
      <div className="flex items-center gap-1.5 mb-1">
        {tone && <StatusDot tone={tone} />}
        <span className="label">Step {n}</span>
      </div>
      <div className="text-xs font-semibold text-ink leading-snug">{title}</div>
      <div className="text-lg font-semibold text-ink num mt-1 leading-none">{value}</div>
      <div className="text-2xs text-ink2 mt-1 leading-snug">{note}</div>
    </div>
  );
}

function ChainArrow() {
  return <div className="hidden md:flex items-center justify-center text-muted text-sm">→</div>;
}

function BridgeRow({
  label,
  from,
  to,
  max,
  colour,
  value,
  note,
}: {
  label: string;
  from: number;
  to: number;
  max: number;
  colour: string;
  value: string;
  note?: string;
}) {
  const left = (from / max) * 100;
  const width = Math.max(0.6, ((to - from) / max) * 100);
  return (
    <div className="grid grid-cols-[minmax(110px,30%)_1fr_auto] gap-3 items-center">
      <div>
        <div className="text-xs text-ink2 truncate" title={label}>{label}</div>
        {note && <div className="text-2xs text-muted truncate" title={note}>{note}</div>}
      </div>
      <div className="relative h-2.5 rounded-full bg-[color:var(--plane)]">
        <div className="absolute top-0 h-2.5 rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: colour }} />
      </div>
      <div className="text-xs font-semibold text-ink num w-20 text-right">{value}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="text-xs font-semibold text-ink num">{fmt(value)}</span>
      </span>
      <input
        type="range"
        className="w-full mt-1 accent-[color:var(--brand)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(ev) => onChange(Number(ev.target.value))}
      />
    </label>
  );
}

function SortTh({
  k,
  sort,
  setSort,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  setSort: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <Th align="right">
      <button className="label hover:text-ink" onClick={() => setSort(k)}>
        {children} {sort === k ? "▼" : ""}
      </button>
    </Th>
  );
}
