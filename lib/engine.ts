// ─────────────────────────────────────────────────────────────────────────────
// Selectors: the read model every screen is built from.
//
// This is the layer that makes "the same number everywhere" literally true —
// a store manager, an area manager, a planner and the CEO all call the same
// function and differ only in the filter they pass.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BRANDS,
  CATEGORIES,
  CLUSTERS,
  CURRENT_SEASON,
  DROPS,
  NOW,
  STOCK,
  STORES,
  STYLES,
  clusterById,
  onStoreAdded,
  rng,
  storeById,
  styleById,
} from "./seed";
import {
  FILL_HEALTHY_LOW,
  HOLDBACK_GOAL,
  HOLDBACK_SHARE,
  asp,
  coreShareTarget,
  coverDays,
  distanceKm,
  fillBand,
  growth,
  inr,
  lastRunAt,
  mixVerdict,
  qualifiesForRun,
  replenishmentDecision,
  DEFAULT_THRESHOLDS,
  type RunThresholds,
  sellThrough,
  sizeSetHealth,
  splitReplenRenew,
  studBudDud,
  styleFinished,
  trueRos,
  type FillBand,
  type MixVerdict,
  type ReplenishDecision,
  type SizeSetResult,
  type StyleGrade,
} from "./rules";
import type {
  Brand,
  Category,
  Cluster,
  Drop,
  ProductType,
  Region,
  ReplenLine,
  ReplenRun,
  Scope,
  Size,
  StockRow,
  Store,
  Style,
} from "./types";

// ── Indexes (built once) ─────────────────────────────────────────────────────

const byStore = new Map<string, StockRow[]>();
const byStyle = new Map<string, StockRow[]>();
const bySku = new Map<string, StockRow>();


// A store opened at runtime has to land in these indexes, and every cache built
// over them has to be dropped, or the new door reads as empty everywhere.
for (const row of STOCK) indexRow(row);

onStoreAdded((_store, rows) => {
  for (const row of rows) indexRow(row);
  vitalsCache = null;
});

function indexRow(row: StockRow) {
  if (!byStore.has(row.storeId)) byStore.set(row.storeId, []);
  byStore.get(row.storeId)!.push(row);
  const styleKey = `${row.storeId}|${row.styleId}`;
  if (!byStyle.has(styleKey)) byStyle.set(styleKey, []);
  byStyle.get(styleKey)!.push(row);
  bySku.set(`${row.storeId}|${row.styleId}|${row.size}`, row);
}

export const stockForStore = (storeId: string) => byStore.get(storeId) ?? [];
export const stockForStyleAtStore = (storeId: string, styleId: string) => byStyle.get(`${storeId}|${styleId}`) ?? [];
export const skuRow = (storeId: string, styleId: string, size: Size) => bySku.get(`${storeId}|${styleId}|${size}`);

export const sellable = (r: Pick<StockRow, "onHand" | "reserved">) => Math.max(0, r.onHand - r.reserved);

/** Every style a store actually carries. */
export function stylesAtStore(storeId: string): Style[] {
  const ids = new Set(stockForStore(storeId).map((r) => r.styleId));
  return STYLES.filter((s) => ids.has(s.id));
}

// ── Warehouse (RPC) stock ────────────────────────────────────────────────────
// Deterministic: ~20% of the buy is held back at the warehouse, exactly as the
// planning team described it.

const dcStock = new Map<string, number>();
for (const style of STYLES) {
  // Roughly a third of the range sits at the warehouse as a complete size run:
  // freshly received, not yet picked over. Those are the styles that can be
  // allocated as whole sets. The rest have been drawn down unevenly and some of
  // their sizes are genuinely exhausted — which is what forces an inter-store
  // transfer instead of a simple replenishment.
  const fullRun = hash(style.id) % 3 === 0;
  style.sizes.forEach((size, i) => {
    const r = rng(hash(style.id) + i * 7);
    const held = Math.round((style.bought * 0.2) / style.sizes.length);
    if (fullRun) {
      dcStock.set(`${style.id}|${size}`, Math.round(held * (0.6 + r() * 0.5)));
      return;
    }
    dcStock.set(`${style.id}|${size}`, r() < 0.34 ? 0 : Math.round(held * (0.15 + r() * 0.5)));
  });
}
export const dcAvailable = (styleId: string, size: Size) => dcStock.get(`${styleId}|${size}`) ?? 0;

/** Take units out of the warehouse pool when a move or a run line ships. */
export function drawFromWarehouse(styleId: string, size: Size, units: number) {
  const key = `${styleId}|${size}`;
  dcStock.set(key, Math.max(0, (dcStock.get(key) ?? 0) - units));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Store-level rollups ──────────────────────────────────────────────────────

export interface StoreVitals {
  store: Store;
  sellableUnits: number;
  inTransit: number;
  fillRate: number;
  mtdSales: number;
  mtdTargetToDate: number;
  achievement: number;
  lySameDay: number;
  todaySales: number;
  footfall: number;
  bills: number;
  conversion: number;
  atv: number;
  upt: number;
  sizeSetScore: number;
  brokenStyles: number;
  atRiskStyles: number;
  valueAtRisk: number;
  sellThrough: number;
}

const DAY_OF_MONTH = 13;
const DAYS_IN_MONTH = 31;

export function storeVitals(storeId: string): StoreVitals {
  const store = storeById(storeId);
  const rows = stockForStore(storeId);
  const r = rng(hash(storeId));

  const sellableUnits = rows.reduce((a, x) => a + sellable(x), 0);
  const inTransit = rows.reduce((a, x) => a + x.inTransit, 0);
  const fillRate = sellableUnits / Math.max(1, store.norm);

  const styles = stylesAtStore(storeId);
  let broken = 0;
  let atRisk = 0;
  let valueAtRisk = 0;
  for (const style of styles) {
    const h = sizeSetHealth(style, stockForStyleAtStore(storeId, style.id));
    if (h.status === "broken") broken += 1;
    if (h.status === "at_risk") atRisk += 1;
    if (h.status !== "healthy") {
      const ros = styleTrueRos(storeId, style.id);
      valueAtRisk += ros * 7 * style.mrp * (h.status === "broken" ? 1 : 0.5);
    }
  }
  const sizeSetScore = styles.length ? (styles.length - broken - atRisk) / styles.length : 1;

  const mtdSales = Math.round(store.targetMonth * (DAY_OF_MONTH / DAYS_IN_MONTH) * (0.78 + r() * 0.42));
  const mtdTargetToDate = Math.round(store.targetMonth * (DAY_OF_MONTH / DAYS_IN_MONTH));
  const todaySales = Math.round((store.targetMonth / DAYS_IN_MONTH) * (0.32 + r() * 0.5));
  const bills = Math.max(3, Math.round(todaySales / (2400 + r() * 2600)));
  const footfall = Math.round(bills / (store.format === "Mall" ? 0.11 + r() * 0.06 : 0.2 + r() * 0.1));
  const qty = Math.round(bills * (1.3 + r() * 0.8));

  // Sell-through is a SEASON metric, not a 28-day one. Measuring it over a
  // four-week window would understate it badly and produce a headline number
  // the business would not recognise. We scale the observed 28-day rate over
  // the days each style has actually been on sale, capped at the full-price
  // window, then compare full-price units against units received.
  let soldFullPrice = 0;
  let received = 0;
  for (const x of rows) {
    const style = styleById(x.styleId);
    // Use the same season lengths as daysLeftInWindow — one definition, not two.
    const daysOnSale = Math.min(style.launchedDaysAgo, style.isNOS ? 240 : 140);
    const scale = Math.max(1, daysOnSale / 28);
    const soldSeason = x.sold28 * scale;
    const markdownSeason = x.soldOnMarkdown28 * scale;
    soldFullPrice += Math.max(0, soldSeason - markdownSeason);
    received += soldSeason + sellable(x);
  }

  return {
    store,
    sellableUnits,
    inTransit,
    fillRate,
    mtdSales,
    mtdTargetToDate,
    achievement: mtdSales / Math.max(1, mtdTargetToDate),
    lySameDay: Math.round(todaySales * (0.76 + r() * 0.4)),
    todaySales,
    footfall,
    bills,
    conversion: bills / Math.max(1, footfall),
    atv: todaySales / Math.max(1, bills),
    upt: qty / Math.max(1, bills),
    sizeSetScore,
    brokenStyles: broken,
    atRiskStyles: atRisk,
    valueAtRisk,
    sellThrough: received ? soldFullPrice / received : 0,
  };
}

let vitalsCache: Map<string, StoreVitals> | null = null;
export function allVitals(): StoreVitals[] {
  if (!vitalsCache) {
    vitalsCache = new Map();
    for (const s of STORES) vitalsCache.set(s.id, storeVitals(s.id));
  }
  return [...vitalsCache.values()];
}
export function vitalsFor(storeId: string): StoreVitals {
  allVitals();
  return vitalsCache!.get(storeId)!;
}

// ── Style-level intelligence ─────────────────────────────────────────────────

export function styleTrueRos(storeId: string, styleId: string): number {
  return stockForStyleAtStore(storeId, styleId).reduce((a, r) => a + trueRos(r), 0);
}

export interface StyleSignal {
  style: Style;
  storeId: string;
  sellable: number;
  ros: number;
  naiveRos: number;
  cover: number;
  health: SizeSetResult;
  decision: ReplenishDecision;
  valueAtRisk: number;
  daysLeftInWindow: number;
  regionalRank: number;
  regionalRos: number;
  dcUnits: number;
  donorUnits: number;
}

/** Days left in the full-price window before end-of-season logic starts. */
export function daysLeftInWindow(style: Style): number {
  const seasonLength = style.isNOS ? 240 : 140;
  return Math.max(0, seasonLength - style.launchedDaysAgo);
}

export function styleSignal(storeId: string, styleId: string): StyleSignal {
  const style = styleById(styleId);
  const rows = stockForStyleAtStore(storeId, styleId);
  const sellableUnits = rows.reduce((a, r) => a + sellable(r), 0);
  const ros = styleTrueRos(storeId, styleId);
  const naive = rows.reduce((a, r) => a + r.sold28 / 28, 0);
  const health = sizeSetHealth(style, rows);
  const dLeft = daysLeftInWindow(style);

  const missing = health.missingCore[0];
  const dcUnits = missing ? dcAvailable(styleId, missing) : rows.reduce((a, r) => a + dcAvailable(styleId, r.size), 0);
  const donors = missing ? findDonors(storeId, styleId, missing) : [];
  const donorUnits = donors.reduce((a, d) => a + d.excess, 0);

  const decision = replenishmentDecision({
    sellable: sellableUnits,
    ros,
    dcAvailable: dcUnits,
    peerExcess: donorUnits,
    daysLeftInWindow: dLeft,
    sizeSet: health.status,
    isNOS: style.isNOS,
  });

  const store = storeById(storeId);
  const peers = STORES.filter((s) => s.region === store.region && s.brand === store.brand);
  const peerRos = peers.map((s) => ({ id: s.id, ros: styleTrueRos(s.id, styleId) })).sort((a, b) => b.ros - a.ros);
  const regionalRank = Math.max(1, peerRos.findIndex((p) => p.id === storeId) + 1);
  const regionalRos = peerRos.length ? peerRos.reduce((a, p) => a + p.ros, 0) / peerRos.length : 0;

  return {
    style,
    storeId,
    sellable: sellableUnits,
    ros,
    naiveRos: naive,
    cover: coverDays(sellableUnits, ros),
    health,
    decision,
    valueAtRisk: health.status === "healthy" ? 0 : ros * Math.min(7, dLeft) * style.mrp * (health.status === "broken" ? 1 : 0.5),
    daysLeftInWindow: dLeft,
    regionalRank,
    regionalRos,
    dcUnits,
    donorUnits,
  };
}

/** The size-set exception queue — the tile nobody in the market puts on a home screen. */
export function sizeSetExceptions(storeId: string, limit = 40): StyleSignal[] {
  return stylesAtStore(storeId)
    .map((s) => styleSignal(storeId, s.id))
    .filter((s) => s.health.status !== "healthy")
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk)
    .slice(0, limit);
}

export function topSellers(storeId: string, limit = 8): StyleSignal[] {
  return stylesAtStore(storeId)
    .map((s) => styleSignal(storeId, s.id))
    .sort((a, b) => b.ros - a.ros)
    .slice(0, limit);
}

/** Styles selling well elsewhere in the region but under-exposed here. */
export function missedOpportunities(storeId: string, limit = 6): StyleSignal[] {
  return stylesAtStore(storeId)
    .map((s) => styleSignal(storeId, s.id))
    .filter((s) => s.regionalRos > 0 && s.ros < s.regionalRos * 0.62 && s.sellable > 0)
    .sort((a, b) => b.regionalRos - a.regionalRos)
    .slice(0, limit);
}

// ── Donor search (powers Save the Sale) ──────────────────────────────────────

export interface Donor {
  store: Store;
  sellable: number;
  excess: number;
  distanceKm: number;
  fillRate: number;
  ros: number;
  saleable: boolean;
  score: number;
}

/**
 * Ranking is the product. Nearest is not always right: a donor selling the SKU
 * faster than the requester should keep it.
 */
export function findDonors(storeId: string, styleId: string, size: Size, minUnits = 1): Donor[] {
  const me = storeById(storeId);
  const myRos = trueRos(skuRow(storeId, styleId, size) ?? { sold28: 0, soldOnMarkdown28: 0, inStockDays: 28 });
  const out: Donor[] = [];

  for (const s of STORES) {
    if (s.id === storeId) continue;
    const row = skuRow(s.id, styleId, size);
    if (!row) continue;
    const avail = sellable(row);
    if (avail < minUnits) continue;

    const v = vitalsFor(s.id);
    const ros = trueRos(row);
    const d = distanceKm(me, s);
    // Deterministic saleability flag — some units are genuinely defective.
    const saleable = rng(hash(`${s.id}${styleId}${size}`))() > 0.12;
    const excess = Math.max(0, avail - Math.ceil(ros * 7));

    // Ranking, in the order a good regional planner would actually weigh it:
    //
    //  1. Can it get here today? The 40 km same-day lane is a step change, not
    //     a gradient — a 5 km donor and a 107 km donor are different products
    //     to the customer standing at the till, so proximity is scored with an
    //     explicit lane bonus rather than a smooth decay.
    //  2. Does the donor genuinely have spare? A donor holding stock it will
    //     sell itself this week is not a donor. Zero surplus is penalised hard
    //     rather than merely scoring low.
    //  3. Do we sell it faster than they do? Only a tiebreak.
    const sameDayLane = d <= 40;
    const proximity = sameDayLane ? 0.75 + 0.25 * (1 - d / 40) : Math.max(0, 0.45 - d / 400);
    const surplus = Math.min(1, excess / 6);
    const relativeDemand = myRos > 0 ? Math.min(1, myRos / Math.max(0.05, ros)) / 2 : 0.2;

    let score = proximity * 0.45 + surplus * 0.35 + relativeDemand * 0.2;
    // A donor with nothing spare, or a unit that cannot be sold, should never
    // sit at the top of the list — the store will stop trusting the ranking.
    if (excess <= 0) score *= 0.45;
    if (!saleable) score *= 0.3;

    out.push({ store: s, sellable: avail, excess, distanceKm: d, fillRate: v.fillRate, ros, saleable, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ── The lineage panel: what each source system would have told you ───────────

export interface LineageEntry {
  system: string;
  value: number;
  asOf: string;
  note: string;
  status: "match" | "stale" | "divergent";
}

/**
 * The demo's single most persuasive screen. Four systems, four answers, one
 * reconciliation — and the reconciliation is explainable line by line.
 */
export function inventoryLineage(storeId: string, styleId: string): {
  reconciled: number;
  entries: LineageEntry[];
  adjustments: { label: string; units: number }[];
} {
  const rows = stockForStyleAtStore(storeId, styleId);
  const onHand = rows.reduce((a, r) => a + r.onHand, 0);
  const reservedRaw = rows.reduce((a, r) => a + r.reserved, 0);
  const inTransitRaw = rows.reduce((a, r) => a + r.inTransit, 0);
  const r = rng(hash(storeId + styleId));

  // Every store carries some defective stock and some units already committed
  // elsewhere. If those adjustments were usually zero the reconciliation would
  // look like an accounting formality instead of the argument it actually is,
  // so the demo guarantees each line has something in it on a real assortment.
  const reserved = reservedRaw > 0 ? reservedRaw : onHand > 6 ? 1 + Math.floor(r() * 2) : 0;
  const inTransit = inTransitRaw > 0 ? inTransitRaw : Math.floor(r() * 9);
  const defective = onHand > 4 ? 1 + Math.round(r() * 2) : Math.round(r() * 1);
  const outwardStaged = r() < 0.55 ? 1 + Math.round(r() * 4) : 0;
  const unpostedSales = 1 + Math.round(r() * 4);

  const reconciled = Math.max(0, onHand - reserved - defective - outwardStaged);

  const entries: LineageEntry[] = [
    {
      system: "SAP",
      value: onHand + unpostedSales,
      asOf: "Yesterday 21:00",
      note: `Batch posting. ${unpostedSales} units sold today are not yet reflected.`,
      status: "stale",
    },
    {
      system: "D365 / POS",
      value: onHand,
      asOf: "Live",
      note: "Physical on-hand. Does not net off omni reservations or defectives.",
      status: "divergent",
    },
    {
      system: "Power BI",
      value: onHand + unpostedSales + inTransit,
      asOf: "Yesterday 21:00",
      note:
        inTransit > 0
          ? `Adds ${inTransit} in-transit unit${inTransit === 1 ? "" : "s"} into the same column as on-hand. This is where the store's number and the planner's number split.`
          : "Reports on-hand plus in-transit in a single column. Nothing is in transit on this style today, so it happens to agree with SAP — on the next style it will not.",
      status: inTransit > 0 ? "divergent" : "stale",
    },
    {
      system: "Vector",
      value: onHand - reserved,
      asOf: "Today 06:00",
      note: "Nets reservations but runs on the 06:00 extract.",
      status: "stale",
    },
    {
      system: "Arvind One",
      value: reconciled,
      asOf: "Today 11:42",
      note: "Sellable stock: on-hand less reserved, less defective, less staged for outward. In-transit reported separately, never added.",
      status: "match",
    },
  ];

  return {
    reconciled,
    entries,
    adjustments: [
      { label: "Physical on-hand (D365)", units: onHand },
      { label: "Less: reserved against omni orders", units: -reserved },
      { label: "Less: flagged defective", units: -defective },
      { label: "Less: staged for outward", units: -outwardStaged },
      { label: "Sellable today", units: reconciled },
      { label: "Reported separately: in transit", units: inTransit },
    ],
  };
}

// ── Enterprise rollups (leadership) ──────────────────────────────────────────

export interface BrandRollup {
  brand: Brand;
  sellThrough: number;
  units: number;
  valueAtRisk: number;
  markdownExposure: number;
  stores: number;
  fillRate: number;
  sizeSetScore: number;
}

export function brandRollups(): BrandRollup[] {
  const out: BrandRollup[] = [];
  const brands = Array.from(new Set(STORES.map((s) => s.brand)));
  for (const brand of brands) {
    const stores = STORES.filter((s) => s.brand === brand);
    const v = stores.map((s) => vitalsFor(s.id));
    const units = v.reduce((a, x) => a + x.sellableUnits, 0);
    const valueAtRisk = v.reduce((a, x) => a + x.valueAtRisk, 0);
    const sellThroughAvg = v.reduce((a, x) => a + x.sellThrough, 0) / Math.max(1, v.length);
    const styles = STYLES.filter((s) => s.brand === brand);
    const avgMrp = styles.reduce((a, s) => a + s.mrp, 0) / Math.max(1, styles.length);
    out.push({
      brand,
      sellThrough: sellThroughAvg,
      units,
      valueAtRisk,
      markdownExposure: units * avgMrp * (1 - sellThroughAvg) * 0.38,
      stores: stores.length,
      fillRate: v.reduce((a, x) => a + x.fillRate, 0) / Math.max(1, v.length),
      sizeSetScore: v.reduce((a, x) => a + x.sizeSetScore, 0) / Math.max(1, v.length),
    });
  }
  return out.sort((a, b) => b.units - a.units);
}

export interface CategoryRollup {
  category: Category;
  ros: number;
  units: number;
  sellThrough: number;
  brokenPct: number;
}

export function categoryRollups(): CategoryRollup[] {
  return CATEGORIES.map((category) => {
    const styles = STYLES.filter((s) => s.category === category);
    const ids = new Set(styles.map((s) => s.id));
    const rows = STOCK.filter((r) => ids.has(r.styleId));
    const units = rows.reduce((a, r) => a + sellable(r), 0);
    const full = rows.reduce((a, r) => a + Math.max(0, r.sold28 - r.soldOnMarkdown28), 0);
    const received = rows.reduce((a, r) => a + r.sold28 + sellable(r), 0);
    let broken = 0;
    let total = 0;
    for (const store of STORES) {
      for (const style of styles) {
        const sr = stockForStyleAtStore(store.id, style.id);
        if (!sr.length) continue;
        total += 1;
        if (sizeSetHealth(style, sr).status === "broken") broken += 1;
      }
    }
    return {
      category,
      ros: rows.reduce((a, r) => a + trueRos(r), 0),
      units,
      sellThrough: received ? full / received : 0,
      brokenPct: total ? broken / total : 0,
    };
  }).sort((a, b) => b.units - a.units);
}

export function regionRollups(): { region: Region; sellThrough: number; fillRate: number; stores: number; valueAtRisk: number }[] {
  const regions: Region[] = ["North", "South", "East", "West"];
  return regions.map((region) => {
    const v = STORES.filter((s) => s.region === region).map((s) => vitalsFor(s.id));
    return {
      region,
      sellThrough: v.reduce((a, x) => a + x.sellThrough, 0) / Math.max(1, v.length),
      fillRate: v.reduce((a, x) => a + x.fillRate, 0) / Math.max(1, v.length),
      stores: v.length,
      valueAtRisk: v.reduce((a, x) => a + x.valueAtRisk, 0),
    };
  });
}

// ── Pre-season reallocation (planner) ────────────────────────────────────────

export interface ReallocationRow {
  store: Store;
  plannedUnits: number;
  recommendedUnits: number;
  delta: number;
  reason: string;
  performanceIndex: number;
  confidence: number;
}

/**
 * The planner's hardest problem, in their own words: "given what we already
 * bought, how do we reallocate it using the freshest store signals?"
 */
export function reallocationPlan(styleId: string, totalUnits: number): ReallocationRow[] {
  const style = styleById(styleId);
  const stores = STORES.filter((s) => s.brand === style.brand);
  const signals = stores.map((s) => {
    const v = vitalsFor(s.id);
    const ros = styleTrueRos(s.id, styleId) || v.sellThrough * 0.6;
    return { store: s, v, ros };
  });

  // Planned = the original grade-weighted split made months ago.
  const gradeWeight = (g: Store["grade"]) => (g === "A" ? 3 : g === "B" ? 2 : 1);
  const plannedTotal = signals.reduce((a, s) => a + gradeWeight(s.store.grade), 0);

  // Recommended = weighted by True ROS and achievement against target.
  const perfIndex = signals.map((s) => ({
    ...s,
    perf: Math.max(0.15, s.ros * 0.6 + s.v.achievement * 0.4),
  }));
  const perfTotal = perfIndex.reduce((a, s) => a + s.perf, 0);

  return perfIndex
    .map(({ store, perf, v, ros }) => {
      const planned = Math.round((gradeWeight(store.grade) / plannedTotal) * totalUnits);
      const recommended = Math.round((perf / perfTotal) * totalUnits);
      const delta = recommended - planned;
      const reason =
        delta > 0
          ? `True ROS ${ros.toFixed(2)}/day and ${(v.achievement * 100).toFixed(0)}% of target — running ahead of its grade.`
          : delta < 0
          ? `${(v.achievement * 100).toFixed(0)}% of target with ${(v.fillRate * 100).toFixed(0)}% fill. Grade-based plan over-allocates here.`
          : "In line with the original plan.";
      return {
        store,
        plannedUnits: planned,
        recommendedUnits: recommended,
        delta,
        reason,
        performanceIndex: perf,
        confidence: Math.min(0.95, 0.6 + Math.abs(delta) / Math.max(1, planned) / 2),
      };
    })
    .sort((a, b) => b.delta - a.delta);
}

// ── Strategic IST (planner) ──────────────────────────────────────────────────

export interface StrategicMove {
  id: string;
  styleId: string;
  styleName: string;
  size: Size;
  from: Store;
  to: Store;
  units: number;
  distanceKm: number;
  rationale: string;
  valueUnlocked: number;
  confidence: number;
}

export function strategicMoves(limit = 12): StrategicMove[] {
  const moves: StrategicMove[] = [];
  for (const store of STORES) {
    const exceptions = sizeSetExceptions(store.id, 4);
    for (const ex of exceptions) {
      const missing = ex.health.missingCore[0];
      if (!missing) continue;
      const donors = findDonors(store.id, ex.style.id, missing, 2).filter((d) => d.saleable && d.excess > 0);
      const donor = donors[0];
      if (!donor) continue;
      const units = Math.min(donor.excess, Math.max(2, Math.ceil(ex.ros * 7)));
      moves.push({
        id: `SM-${store.code}-${ex.style.id}-${missing}`,
        styleId: ex.style.id,
        styleName: ex.style.name,
        size: missing,
        from: donor.store,
        to: store,
        units,
        distanceKm: donor.distanceKm,
        rationale: `${store.name} sells this ${(ex.ros / Math.max(0.02, donor.ros)).toFixed(1)}× faster and is missing size ${missing}. ${donor.store.name} holds ${donor.excess} above a week's cover.`,
        valueUnlocked: units * ex.style.mrp,
        confidence: Math.min(0.95, 0.62 + donor.score / 3),
      });
    }
  }
  return moves.sort((a, b) => b.valueUnlocked - a.valueUnlocked).slice(0, limit);
}

// ── Customer catchment (the pin-code gap) ────────────────────────────────────

export interface CatchmentCell {
  pincode: string;
  area: string;
  customers: number;
  spend: number;
  distanceKm: number;
  nearestStore: string;
}

export function catchment(storeId: string): CatchmentCell[] {
  const store = storeById(storeId);
  const areas = [
    "Lower Parel", "Worli", "Bandra West", "Andheri West", "Powai",
    "Juhu", "Khar", "Dadar", "Colaba", "Malad West", "Thane West", "Vashi",
  ];
  return areas.map((area, i) => {
    const r = rng(hash(storeId + area));
    return {
      pincode: `4000${String(10 + i * 3).padStart(2, "0")}`,
      area,
      customers: Math.round(180 + r() * 2400),
      spend: Math.round((8000 + r() * 34000) * (1 + r())),
      distanceKm: Math.round((1 + r() * 26) * 10) / 10,
      nearestStore: store.name,
    };
  }).sort((a, b) => b.customers - a.customers);
}

// ── Enterprise headline ──────────────────────────────────────────────────────

export function enterprise() {
  const v = allVitals();
  const brands = brandRollups();
  const totalUnits = v.reduce((a, x) => a + x.sellableUnits, 0);
  const sellThrough = v.reduce((a, x) => a + x.sellThrough, 0) / v.length;
  return {
    stores: STORES.length,
    styles: STYLES.length,
    totalUnits,
    sellThrough,
    valueAtRisk: v.reduce((a, x) => a + x.valueAtRisk, 0),
    markdownExposure: brands.reduce((a, x) => a + x.markdownExposure, 0),
    fillRate: v.reduce((a, x) => a + x.fillRate, 0) / v.length,
    sizeSetScore: v.reduce((a, x) => a + x.sizeSetScore, 0) / v.length,
    brokenStyles: v.reduce((a, x) => a + x.brokenStyles, 0),
    mtdSales: v.reduce((a, x) => a + x.mtdSales, 0),
    mtdTarget: v.reduce((a, x) => a + x.mtdTargetToDate, 0),
  };
}

// ── Execution status — what the hierarchy watches ────────────────────────────
//
// Every field here is produced by the store DOING something in the app. This is
// the inversion that matters: the hierarchy's view is not a report pulled from a
// warehouse, it is the live residue of execution. Deterministic per store.

export interface ExecutionStatus {
  store: Store;
  trading: boolean;
  openedAt: string;
  briefingDone: boolean;
  briefingAt?: string;
  floorWalkPct: number;
  tasksDone: number;
  tasksTotal: number;
  sizeSetOpen: number;
  omniPending: number;
  ticketsBreaching: number;
  cashCleared: boolean;
  achievement: number;
  lastActivity: string;
  lastActivityAt: number;
  /** Overall execution health, so a grid can be scanned at a glance. */
  health: "on_track" | "attention" | "behind";
}

const CHANNEL_ACTIONS: Record<string, string[]> = {
  briefing: ["Morning briefing submitted", "Targets confirmed with the team"],
  floor_walk: ["Floor walk section {n} closed with photo", "VM check passed on the window bay"],
  scan: ["Inward GRN completed — {n} units", "Cycle count closed, 0 variance", "Bay {n} recount raised"],
  transfer: ["Transfer {id} created to save a sale", "Transfer {id} received and put away"],
  omni: ["Omni order packed, digital POD captured", "Order located in {n} min", "Order auto-reassigned to a peer store"],
  outward: ["Outward batch packed under camera", "RTV dispatch cleared the gate"],
  ticket: ["Lift ticket escalated to Regional Manager", "Tag reprint applied and closed", "Spot lights fixed, closed with photo"],
  cash: ["Cash and card day-close reconciled", "UPI mismatch cleared with the deposit slip"],
  replenishment: ["Pulled {n} from the warehouse to repair a size set", "Replenishment task actioned"],
};

export function executionStatus(storeId: string): ExecutionStatus {
  const store = storeById(storeId);
  const v = vitalsFor(storeId);
  const r = rng(hash("exec" + storeId));

  const briefingDone = r() > 0.18;
  const floorWalkPct = Math.min(1, 0.35 + r() * 0.75);
  const tasksTotal = 5 + Math.floor(r() * 6);
  const tasksDone = Math.floor(tasksTotal * (0.3 + r() * 0.65));
  const sizeSetOpen = v.brokenStyles + v.atRiskStyles;
  const omniPending = Math.floor(r() * 5);
  const ticketsBreaching = r() < 0.28 ? 1 + Math.floor(r() * 2) : 0;
  const cashCleared = false; // it is 11:42, day-close has not happened

  const openHour = 10 + Math.floor(r() * 2);
  const lastMinsAgo = 3 + Math.floor(r() * 55);

  // Compose a believable "most recent thing this store did".
  const channels = Object.keys(CHANNEL_ACTIONS);
  const ch = channels[Math.floor(r() * channels.length)];
  const opts = CHANNEL_ACTIONS[ch];
  const label = opts[Math.floor(r() * opts.length)]
    .replace("{n}", String(1 + Math.floor(r() * 40)))
    .replace("{id}", `IST-${100 + Math.floor(r() * 80)}`);

  const behindSignals = (briefingDone ? 0 : 1) + (floorWalkPct < 0.6 ? 1 : 0) + (ticketsBreaching > 0 ? 1 : 0) + (v.achievement < 0.9 ? 1 : 0) + (sizeSetOpen > 6 ? 1 : 0);
  const health: ExecutionStatus["health"] = behindSignals >= 3 ? "behind" : behindSignals >= 1 ? "attention" : "on_track";

  return {
    store,
    trading: true,
    openedAt: `${openHour}:0${Math.floor(r() * 6)}`,
    briefingDone,
    briefingAt: briefingDone ? `${openHour}:${20 + Math.floor(r() * 39)}` : undefined,
    floorWalkPct,
    tasksDone,
    tasksTotal,
    sizeSetOpen,
    omniPending,
    ticketsBreaching,
    cashCleared,
    achievement: v.achievement,
    lastActivity: label,
    lastActivityAt: NOW - lastMinsAgo * 60_000,
    health,
  };
}

let execCache: ExecutionStatus[] | null = null;
export function allExecutionStatus(): ExecutionStatus[] {
  if (!execCache) execCache = STORES.map((s) => executionStatus(s.id));
  return execCache;
}

/** The estate-wide live feed — a stream of execution events, newest first. */
export function liveFeed(limit = 40): import("./types").ExecutionEvent[] {
  const events: import("./types").ExecutionEvent[] = [];
  const channels = Object.keys(CHANNEL_ACTIONS) as Array<keyof typeof CHANNEL_ACTIONS>;

  STORES.forEach((store, si) => {
    const r = rng(hash("feed" + store.id));
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const ch = channels[Math.floor(r() * channels.length)];
      const opts = CHANNEL_ACTIONS[ch];
      const raw = opts[Math.floor(r() * opts.length)];
      const label = raw
        .replace("{n}", String(1 + Math.floor(r() * 40)))
        .replace("{id}", `IST-${100 + Math.floor(r() * 80)}`);
      const minsAgo = 2 + Math.floor(r() * 175);
      const sev: import("./types").ExecutionEvent["severity"] =
        ch === "ticket" && /escalated/.test(label) ? "critical" : ch === "transfer" || ch === "omni" || ch === "cash" || /closed|passed|reconciled|received/.test(label) ? "good" : /recount|raised/.test(label) ? "warn" : "info";
      events.push({
        id: `EV-${si}-${i}`,
        at: NOW - minsAgo * 60_000,
        storeId: store.id,
        actor: store.managerName,
        channel: ch as import("./types").ExecutionEvent["channel"],
        label,
        severity: sev,
      });
    }
  });
  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}

export interface EstateExecution {
  storesTrading: number;
  storesTotal: number;
  briefingsDone: number;
  floorWalksComplete: number;
  tasksDone: number;
  tasksTotal: number;
  exceptionsOpen: number;
  ticketsBreaching: number;
  onTrack: number;
  attention: number;
  behind: number;
}

export function estateExecution(): EstateExecution {
  const all = allExecutionStatus();
  return {
    storesTrading: all.filter((s) => s.trading).length,
    storesTotal: all.length,
    briefingsDone: all.filter((s) => s.briefingDone).length,
    floorWalksComplete: all.filter((s) => s.floorWalkPct >= 0.99).length,
    tasksDone: all.reduce((a, s) => a + s.tasksDone, 0),
    tasksTotal: all.reduce((a, s) => a + s.tasksTotal, 0),
    exceptionsOpen: all.reduce((a, s) => a + s.sizeSetOpen, 0),
    ticketsBreaching: all.reduce((a, s) => a + s.ticketsBreaching, 0),
    onTrack: all.filter((s) => s.health === "on_track").length,
    attention: all.filter((s) => s.health === "attention").length,
    behind: all.filter((s) => s.health === "behind").length,
  };
}

// ── Trend series (deterministic, for sparklines) ─────────────────────────────

export function trend(seedKey: string, points = 14, base = 100, drift = 0.02): number[] {
  const r = rng(hash(seedKey));
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < points; i++) {
    v = v * (1 + drift * (r() - 0.35)) + (r() - 0.5) * base * 0.06;
    out.push(Math.max(base * 0.4, v));
  }
  return out;
}

export { NOW };

// ─────────────────────────────────────────────────────────────────────────────
// Planning read model
//
// One payload shape for all four levels of the hierarchy, so Store 360 renders
// a brand, a region, a cluster and a store with the same component — and a
// planner can act at whichever level they are standing on.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScopeSummary {
  scope: Scope;
  storeCount: number;

  // Trading — mirrors AFL's own daily KPI sheet (Sales, Bills, Qty, ATV, UPT, ASP)
  todaySales: number;
  lySameDay: number;
  salesGrowth: number;
  bills: number;
  qty: number;
  atv: number;
  upt: number;
  asp: number;
  conversion: number;
  footfall: number;
  mtdSales: number;
  mtdTarget: number;
  lyMtd: number;
  achievement: number;

  // Inventory
  sellableUnits: number;
  inTransit: number;
  norm: number;
  fillRate: number;
  band: FillBand;
  sellThrough: number;

  // Mix
  coreUnits: number;
  fashionUnits: number;
  corePct: number;
  coreTarget: number;
  mix: MixVerdict;

  // Health
  sizeSetScore: number;
  brokenStyles: number;
  atRiskStyles: number;
  valueAtRisk: number;

  /** The next level down, ready to drill into. */
  children: Scope[];
}

const coreIds = new Set(STYLES.filter((s) => s.productType === "core").map((s) => s.id));

/** Core vs fashion split of sellable units, from the product-master attribute. */
export function mixForStore(storeId: string): { core: number; fashion: number } {
  let core = 0;
  let fashion = 0;
  stockForStore(storeId).forEach((r) => {
    const units = sellable(r);
    if (coreIds.has(r.styleId)) core += units;
    else fashion += units;
  });
  return { core, fashion };
}

export function storesInScope(scope: Scope): Store[] {
  switch (scope.level) {
    case "brand":
      return scope.id === "all" ? STORES : STORES.filter((s) => s.brand === scope.id);
    case "region":
      return STORES.filter((s) => s.region === scope.id);
    case "cluster":
      return STORES.filter((s) => s.clusterId === scope.id);
    case "store":
      return STORES.filter((s) => s.id === scope.id);
  }
}

/** The scopes one level below this one, in display order. */
export function childScopes(scope: Scope): Scope[] {
  const inScope = storesInScope(scope);
  switch (scope.level) {
    case "brand": {
      const regions = [...new Set(inScope.map((s) => s.region))].sort();
      return regions.map((r) => ({ level: "region" as const, id: r, label: r }));
    }
    case "region": {
      const ids = [...new Set(inScope.map((s) => s.clusterId))];
      return CLUSTERS.filter((c) => ids.includes(c.id)).map((c) => ({ level: "cluster" as const, id: c.id, label: c.name }));
    }
    case "cluster":
      return inScope.map((s) => ({ level: "store" as const, id: s.id, label: s.name }));
    case "store":
      return [];
  }
}

/**
 * The uniform summary. Aggregates are unit- or footfall-weighted where a plain
 * average would lie: fill rate is units over norm, conversion is bills over
 * footfall, ASP is value over units.
 */
export function scopeSummary(scope: Scope): ScopeSummary {
  const stores = storesInScope(scope);
  const vitals = stores.map((s) => vitalsFor(s.id));

  const sum = (f: (v: StoreVitals) => number) => vitals.reduce((a, v) => a + f(v), 0);

  const todaySales = sum((v) => v.todaySales);
  const lySameDay = sum((v) => v.lySameDay);
  const bills = sum((v) => v.bills);
  const footfall = sum((v) => v.footfall);
  const qty = vitals.reduce((a, v) => a + v.bills * v.upt, 0);
  const mtdSales = sum((v) => v.mtdSales);
  const mtdTarget = sum((v) => v.mtdTargetToDate);
  // Last year MTD carries the same growth ratio as today, so the two comparisons
  // never contradict each other on screen.
  const lyMtd = vitals.reduce((a, v) => a + (v.todaySales > 0 ? v.mtdSales * (v.lySameDay / v.todaySales) : v.mtdSales), 0);

  const sellableUnits = sum((v) => v.sellableUnits);
  const norm = stores.reduce((a, s) => a + s.norm, 0);
  const fillRate = norm > 0 ? sellableUnits / norm : 0;

  const mixes = stores.map((s) => mixForStore(s.id));
  const coreUnits = mixes.reduce((a, m) => a + m.core, 0);
  const fashionUnits = mixes.reduce((a, m) => a + m.fashion, 0);
  const mixTotal = coreUnits + fashionUnits;
  const corePct = mixTotal > 0 ? coreUnits / mixTotal : 0;
  // Weight each door's target by its norm, so a big A door is not outvoted by
  // two small C doors.
  const coreTarget = norm > 0 ? stores.reduce((a, s) => a + coreShareTarget(s.grade) * s.norm, 0) / norm : 0;

  const sellThroughUnits = stores.reduce((a, s) => a + s.norm, 0);
  const sellThrough = sellThroughUnits > 0 ? vitals.reduce((a, v) => a + v.sellThrough * v.store.norm, 0) / sellThroughUnits : 0;
  const sizeSetScore = stores.length ? vitals.reduce((a, v) => a + v.sizeSetScore, 0) / stores.length : 0;

  return {
    scope,
    storeCount: stores.length,
    todaySales,
    lySameDay,
    salesGrowth: growth(todaySales, lySameDay),
    bills,
    qty,
    atv: bills > 0 ? todaySales / bills : 0,
    upt: bills > 0 ? qty / bills : 0,
    asp: asp(todaySales, qty),
    conversion: footfall > 0 ? bills / footfall : 0,
    footfall,
    mtdSales,
    mtdTarget,
    lyMtd,
    achievement: mtdTarget > 0 ? mtdSales / mtdTarget : 0,
    sellableUnits,
    inTransit: sum((v) => v.inTransit),
    norm,
    fillRate,
    band: fillBand(fillRate),
    sellThrough,
    coreUnits,
    fashionUnits,
    corePct,
    coreTarget,
    mix: mixVerdict(corePct, coreTarget),
    sizeSetScore,
    brokenStyles: sum((v) => v.brokenStyles),
    atRiskStyles: sum((v) => v.atRiskStyles),
    valueAtRisk: sum((v) => v.valueAtRisk),
    children: childScopes(scope),
  };
}

export const BRAND_SCOPE: Scope = { level: "brand", id: "all", label: "All brands" };

export function brandScopes(): Scope[] {
  return [BRAND_SCOPE, ...BRANDS.map((b) => ({ level: "brand" as const, id: b, label: b }))];
}

/** Studs, buds and duds for a store, using Tarun's own vocabulary. */
export interface GradedStyle {
  signal: StyleSignal;
  grade: StyleGrade;
  productType: ProductType;
  /** This style's own full-price sell-through at this store. */
  sellThrough: number;
}

export function gradedStyles(storeId: string, limit = 60): GradedStyle[] {
  const store = storeById(storeId);
  return stylesAtStore(storeId)
    // Own brand only. The seed lets a door hold a little cross-brand stock, but
    // a planner who owns one brand should never see another brand's styles.
    .filter((st) => st.brand === store.brand)
    .slice(0, limit)
    .map((style) => {
      const signal = styleSignal(storeId, style.id);
      const st = sellThrough(
        stockForStyleAtStore(storeId, style.id).reduce((a, r) => a + Math.max(0, r.sold28 - r.soldOnMarkdown28), 0),
        Math.max(1, stockForStyleAtStore(storeId, style.id).reduce((a, r) => a + r.sold28 + sellable(r), 0)),
      );
      return {
        signal,
        grade: studBudDud({ ros: signal.ros, regionalRos: signal.regionalRos, sellThrough: st }),
        productType: style.productType,
        sellThrough: st,
      };
    })
    .sort((a, b) => b.signal.ros - a.signal.ros);
}

// ── The Tuesday/Friday replenishment and renewal run ─────────────────────────

/** Units held back at the warehouse to fund the run. */
export function warehouseHeld(): { units: number; share: number; goalUnits: number } {
  const bought = STYLES.reduce((a, s) => a + s.bought, 0);
  return {
    units: Math.round(bought * HOLDBACK_SHARE),
    share: HOLDBACK_SHARE,
    goalUnits: Math.round(bought * HOLDBACK_GOAL),
  };
}

/**
 * Build the run. Deterministic: same clock in, same run out. A store qualifies
 * on fill rate or brokenness; its gap to norm is then split between the same
 * style returning and a new style arriving, per that store's replenish share.
 */
export function replenRun(at: number, pausedStores: string[] = [], thresholds: RunThresholds = DEFAULT_THRESHOLDS): ReplenRun {
  const triggered: ReplenRun["triggered"] = [];
  const lines: ReplenLine[] = [];
  const paused = new Set(pausedStores);

  // The run covers the brand planning owns, minus any store it is paused for.
  planningStores().forEach((store) => {
    if (paused.has(store.id)) return;
    const v = vitalsFor(store.id);
    const carried = stylesAtStore(store.id).length;
    const brokenShare = carried > 0 ? (v.brokenStyles + v.atRiskStyles) / carried : 0;
    const check = qualifiesForRun({ fillRate: v.fillRate, brokenShare }, thresholds);
    if (!check.qualifies) return;
    triggered.push({ storeId: store.id, reason: check.reason });

    // The gap to the healthy floor of the band, never the whole norm.
    const gap = Math.max(0, Math.round(store.norm * FILL_HEALTHY_LOW - v.sellableUnits));
    if (gap <= 0) return;
    const split = splitReplenRenew(gap, store.replenShare);

    // Replenishment: the exceptions the store is already losing money on, in
    // value-at-risk order, filled from the warehouse.
    let replenLeft = split.replenish;
    sizeSetExceptions(store.id, 8).forEach((sig, i) => {
      if (replenLeft <= 0) return;
      const missing = sig.health.missingCore[0] ?? sig.style.coreSizes[0];
      const wh = dcAvailable(sig.style.id, missing);
      const want = Math.min(replenLeft, Math.max(6, Math.ceil(sig.ros * 14)));
      const units = Math.min(want, wh);
      if (units <= 0) return;
      replenLeft -= units;
      lines.push({
        id: `RL-${store.code}-R${i}`,
        storeId: store.id,
        styleId: sig.style.id,
        size: missing,
        kind: "replenish",
        units,
        reason: `${sig.health.status === "broken" ? "Broken" : "At-risk"} size set on ${sig.style.name} — ${missing} gone, ${inr(sig.valueAtRisk, { compact: true })} at risk`,
        confidence: sig.decision.confidence,
        warehouseUnits: wh,
        valueUnlocked: Math.round(units * sig.style.mrp * 0.55),
      });
    });

    // Renewal: a finished style frees wall space, and something fresher takes it.
    //
    // Candidates are the brand's fashion styles that are working in this store's
    // region and that this door is *under-weighted* on — not only styles it has
    // never carried. With a 47-style assortment, "never carried" is almost empty,
    // and under-weighted is the more useful signal anyway: it is how a capsule
    // gets consolidated into the doors that can sell it.
    let renewLeft = split.renew;
    const graded = gradedStyles(store.id, 40);
    const finished = graded.filter((g) =>
      styleFinished({ sellThrough: g.sellThrough, daysLeftInWindow: g.signal.daysLeftInWindow }),
    );
    if (finished.length === 0) return;

    const carriedUnits = new Map(graded.map((g) => [g.signal.style.id, g.signal.sellable]));
    const finishedIds = new Set(finished.map((f) => f.signal.style.id));
    const candidates = STYLES.filter((st) => st.brand === store.brand && st.productType === "fashion" && !finishedIds.has(st.id))
      .map((st) => ({ style: st, held: carriedUnits.get(st.id) ?? 0, regionalRos: styleTrueRos(store.id, st.id) }))
      .sort((a, b) => a.held - b.held)
      .slice(0, 4);

    if (candidates.length === 0) return;
    // Spread the renewal budget across the candidates rather than starving the tail.
    const per = Math.max(6, Math.floor(split.renew / candidates.length));

    candidates.forEach((cand, i) => {
      if (renewLeft <= 0 || i >= finished.length) return;
      const outgoing = finished[i];
      const wh = Math.round(cand.style.bought * HOLDBACK_SHARE);
      const units = Math.min(renewLeft, per, wh);
      if (units <= 0) return;
      renewLeft -= units;
      lines.push({
        id: `RL-${store.code}-N${i}`,
        storeId: store.id,
        styleId: cand.style.id,
        kind: "renew",
        units,
        reason: `${outgoing.signal.style.name} is finished (${outgoing.grade}) — replace with ${cand.style.name} from ${cand.style.story}, ${cand.held === 0 ? "not carried here" : `only ${cand.held} on floor`}`,
        confidence: 0.74,
        warehouseUnits: wh,
        valueUnlocked: Math.round(units * cand.style.mrp * 0.4),
      });
    });
  });

  return { id: `RUN-${lastRunAt(at)}`, ranAt: lastRunAt(at), status: "proposed", lines, triggered };
}

/** Cluster-level rollup for the hierarchy tree and the cluster league. */
export function clusterRollups(): Array<{ cluster: Cluster; summary: ScopeSummary }> {
  return CLUSTERS.map((cluster) => ({
    cluster,
    summary: scopeSummary({ level: "cluster", id: cluster.id, label: cluster.name }),
  })).sort((a, b) => b.summary.mtdSales - a.summary.mtdSales);
}

// ── Drop allocation and pre-season reallocation ──────────────────────────────
//
// Praveen's hardest problem, in his words: "given what we already bought, how do
// we most efficiently reallocate it using the freshest store signals?" The plan
// was cut a year ago on norms; the recommendation re-cuts it on how each door is
// trading now. The diff between the two is the whole point of the screen.

export interface DropAllocationRow {
  store: Store;
  /** What the plan says, cut on norm share when the buy was committed. */
  planned: number;
  /** What the freshest signals say, cut on achievement and rate of sale. */
  recommended: number;
  delta: number;
  achievement: number;
  fillRate: number;
  reason: string;
}

export function dropAllocation(dropId: string, brand?: Brand): DropAllocationRow[] {
  const drop = DROPS.find((d) => d.id === dropId);
  if (!drop) return [];

  const stores = brand ? STORES.filter((s) => s.brand === brand) : STORES;
  if (stores.length === 0) return [];

  const bought = STYLES.filter((s) => !brand || s.brand === brand).reduce((a, s) => a + s.bought, 0);
  const dropUnits = Math.round(bought * drop.pctOfBuy);

  const normTotal = stores.reduce((a, s) => a + s.norm, 0);
  // Performance index: how the door is trading against target, tempered by
  // whether it is holding its size sets. A door that cannot keep a size set
  // whole does not earn more units by selling fast.
  const indexed = stores.map((store) => {
    const v = vitalsFor(store.id);
    const index = Math.max(0.2, v.achievement * 0.7 + v.sizeSetScore * 0.3);
    return { store, v, index };
  });
  const indexTotal = indexed.reduce((a, r) => a + r.index * r.store.norm, 0);

  return indexed
    .map(({ store, v, index }) => {
      const planned = Math.round((dropUnits * store.norm) / normTotal);
      const recommended = indexTotal > 0 ? Math.round((dropUnits * index * store.norm) / indexTotal) : planned;
      const delta = recommended - planned;
      const reason =
        delta > 0
          ? `Trading at ${Math.round(v.achievement * 100)}% of target — earns ${delta} more than the plan`
          : delta < 0
          ? `At ${Math.round(v.achievement * 100)}% of target — ${Math.abs(delta)} better placed elsewhere`
          : "Plan and current performance agree";
      return { store, planned, recommended, delta, achievement: v.achievement, fillRate: v.fillRate, reason };
    })
    .sort((a, b) => b.delta - a.delta);
}

export function dropUnitsFor(dropId: string, brand?: Brand): number {
  const drop = DROPS.find((d) => d.id === dropId);
  if (!drop) return 0;
  const bought = STYLES.filter((s) => !brand || s.brand === brand).reduce((a, s) => a + s.bought, 0);
  return Math.round(bought * drop.pctOfBuy);
}

// ─────────────────────────────────────────────────────────────────────────────
// The estate, as retail planning reads it
//
// One brand. Planning does not switch brands mid-thought — a category planner
// owns Tommy, and a different person owns Arrow — so there is no brand filter
// anywhere in the planning screens.
//
// The information architecture is flat on purpose: every store, and filters
// that narrow it. The earlier drill-down replaced the numbers above you as you
// went, which made it impossible to tell what you were looking at.
// ─────────────────────────────────────────────────────────────────────────────

export const PLANNING_BRAND: Brand = "Tommy Hilfiger";

export function planningStores(): Store[] {
  return STORES.filter((s) => s.brand === PLANNING_BRAND);
}

export type Period = "today" | "week" | "month" | "quarter" | "drop" | "season" | "year" | "three_years";

export const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  quarter: "3 months",
  drop: "This drop",
  season: "Season",
  year: "Year",
  three_years: "3 years",
};

export const PERIODS: Period[] = ["today", "week", "month", "quarter", "drop", "season", "year", "three_years"];

// Window boundaries on the frozen clock, as arithmetic rather than clock reads.
const MONTH_START = Date.UTC(2026, 7, 1, 4, 0, 0);
const YEAR_START = Date.UTC(2026, 0, 1, 4, 0, 0);
const ONE_DAY_MS = 86_400_000;

/** Trading days the window covers. A drop that has not landed covers none. */
export function periodDays(period: Period, dropId?: string): number {
  switch (period) {
    case "today":
      return 1;
    case "week":
      return 7;
    case "month":
      return Math.max(1, Math.round((NOW - MONTH_START) / ONE_DAY_MS));
    case "quarter":
      return 90;
    case "drop": {
      const d = DROPS.find((x) => x.id === dropId);
      if (!d) return 0;
      return Math.max(0, Math.round((NOW - d.landsAt) / ONE_DAY_MS));
    }
    case "season":
      return Math.max(0, Math.round((NOW - CURRENT_SEASON.startsAt) / ONE_DAY_MS));
    case "year":
      return Math.max(1, Math.round((NOW - YEAR_START) / ONE_DAY_MS));
    case "three_years":
      return 1095;
  }
}

export interface PeriodFigures {
  days: number;
  sales: number;
  bills: number;
  qty: number;
  footfall: number;
  target: number;
  lySales: number;
  growth: number;
}

/**
 * One store's trading over a window, and the same window last year.
 *
 * Today is the store's actual figure; longer windows are its daily average
 * multiplied out, with a seeded drift so a year does not read as 365 identical
 * days. Last year carries a per-period drift too, so growth varies by window
 * the way a real comparison does — deterministic, so it never moves on reload.
 */
export function periodFigures(storeId: string, period: Period, dropId?: string): PeriodFigures {
  const v = vitalsFor(storeId);
  const days = periodDays(period, dropId);
  if (days === 0) {
    return { days: 0, sales: 0, bills: 0, qty: 0, footfall: 0, target: 0, lySales: 0, growth: 0 };
  }

  const monthDays = periodDays("month");
  const dailySales = v.mtdSales / Math.max(1, monthDays);
  const dailyBills = v.bills;
  const dailyFootfall = v.footfall;

  const r = rng(hash(`${storeId}-${period}`));
  const drift = 0.94 + r() * 0.12;

  const sales = period === "today" ? v.todaySales : Math.round(dailySales * days * drift);
  const scale = period === "today" ? 1 : (dailySales * days * drift) / Math.max(1, v.todaySales);
  const bills = Math.round(dailyBills * (period === "today" ? 1 : scale));
  const qty = Math.round(bills * v.upt);
  const footfall = Math.round(dailyFootfall * (period === "today" ? 1 : scale));

  // Target scales with the window so achievement means the same thing in each.
  const dailyTarget = v.mtdTargetToDate / Math.max(1, monthDays);
  const target = Math.round(dailyTarget * days);

  // Last year: the store's own same-day ratio, nudged per window.
  const baseRatio = v.todaySales > 0 ? v.lySameDay / v.todaySales : 1;
  const lyDrift = 0.9 + rng(hash(`ly-${storeId}-${period}`))() * 0.2;
  const lySales = Math.round(sales * Math.min(1.4, Math.max(0.6, baseRatio * lyDrift)));

  return { days, sales, bills, qty, footfall, target, lySales, growth: growth(sales, lySales) };
}

export interface EstateFilters {
  region: string;   // "all" | Region
  cluster: string;  // "all" | cluster id
  grade: string;    // "all" | "A" | "B" | "C"
  band: string;     // "all" | "thin" | "healthy" | "heavy"
}

export const NO_FILTERS: EstateFilters = { region: "all", cluster: "all", grade: "all", band: "all" };

export function filterStores(filters: EstateFilters): Store[] {
  return planningStores().filter((s) => {
    if (filters.region !== "all" && s.region !== filters.region) return false;
    if (filters.cluster !== "all" && s.clusterId !== filters.cluster) return false;
    if (filters.grade !== "all" && s.grade !== filters.grade) return false;
    if (filters.band !== "all" && fillBand(vitalsFor(s.id).fillRate) !== filters.band) return false;
    return true;
  });
}

export function filtersActive(f: EstateFilters): number {
  return [f.region, f.cluster, f.grade, f.band].filter((v) => v !== "all").length;
}

/**
 * How much bigger the period is than today, per store. Deterministic: a seeded
 * seven-day series whose last point is today, so "this week" and "today" can
 * never contradict each other.
 */
/**
 * A stud with a broken size set — a style that is selling and cannot be bought
 * in the sizes people want. The most expensive failure in the estate, and the
 * one worth counting on its own rather than hiding inside "broken styles".
 */
export function brokenStuds(stores: Store[]): Array<{ store: Store; graded: GradedStyle }> {
  const out: Array<{ store: Store; graded: GradedStyle }> = [];
  stores.forEach((store) => {
    gradedStyles(store.id, 60).forEach((g) => {
      if (g.grade === "stud" && g.signal.health.status !== "healthy") out.push({ store, graded: g });
    });
  });
  return out.sort((a, b) => b.graded.signal.valueAtRisk - a.graded.signal.valueAtRisk);
}

export interface EstateSummary {
  storeCount: number;
  period: Period;
  /** Trading days the window covers. Zero when a drop has not landed. */
  days: number;
  /** The same window last year, and the movement between them. */
  lySales: number;
  growth: number;

  // Trading — AFL's own daily KPI set, for the chosen period
  sales: number;
  bills: number;
  qty: number;
  atv: number;
  upt: number;
  asp: number;
  conversion: number;
  footfall: number;
  target: number;
  achievement: number;

  // Inventory
  sellableUnits: number;
  inTransit: number;
  norm: number;
  fillRate: number;
  band: FillBand;
  sellThrough: number;

  // Mix
  coreUnits: number;
  fashionUnits: number;
  corePct: number;
  coreTarget: number;
  mix: MixVerdict;

  // Health
  sizeSetScore: number;
  brokenStyles: number;
  atRiskStyles: number;
  valueAtRisk: number;
  /** Styles that are selling well and cannot be bought in a pivotal size. */
  brokenStuds: number;
  brokenStudValue: number;
}

export function estateSummary(stores: Store[], period: Period, dropId?: string): EstateSummary {
  const vitals = stores.map((s) => vitalsFor(s.id));
  const studs = brokenStuds(stores);
  const figs = stores.map((s) => periodFigures(s.id, period, dropId));

  const sales = figs.reduce((a, f) => a + f.sales, 0);
  const bills = figs.reduce((a, f) => a + f.bills, 0);
  const qty = figs.reduce((a, f) => a + f.qty, 0);
  const footfall = figs.reduce((a, f) => a + f.footfall, 0);
  const target = figs.reduce((a, f) => a + f.target, 0);
  const lySales = figs.reduce((a, f) => a + f.lySales, 0);
  const days = figs[0]?.days ?? 0;

  const sellableUnits = vitals.reduce((a, v) => a + v.sellableUnits, 0);
  const norm = stores.reduce((a, s) => a + s.norm, 0);
  const fillRate = norm > 0 ? sellableUnits / norm : 0;

  const mixes = stores.map((s) => mixForStore(s.id));
  const coreUnits = mixes.reduce((a, m) => a + m.core, 0);
  const fashionUnits = mixes.reduce((a, m) => a + m.fashion, 0);
  const mixTotal = coreUnits + fashionUnits;
  const corePct = mixTotal > 0 ? coreUnits / mixTotal : 0;
  const coreTarget = norm > 0 ? stores.reduce((a, s) => a + coreShareTarget(s.grade) * s.norm, 0) / norm : 0;

  const sellThrough = norm > 0 ? vitals.reduce((a, v) => a + v.sellThrough * v.store.norm, 0) / norm : 0;

  return {
    storeCount: stores.length,
    period,
    days,
    lySales,
    growth: growth(sales, lySales),
    sales,
    bills,
    qty,
    atv: bills > 0 ? sales / bills : 0,
    upt: bills > 0 ? qty / bills : 0,
    asp: asp(sales, qty),
    conversion: footfall > 0 ? bills / footfall : 0,
    footfall,
    target,
    achievement: target > 0 ? sales / target : 0,
    sellableUnits,
    inTransit: vitals.reduce((a, v) => a + v.inTransit, 0),
    norm,
    fillRate,
    band: fillBand(fillRate),
    sellThrough,
    coreUnits,
    fashionUnits,
    corePct,
    coreTarget,
    mix: mixVerdict(corePct, coreTarget),
    sizeSetScore: stores.length ? vitals.reduce((a, v) => a + v.sizeSetScore, 0) / stores.length : 0,
    brokenStyles: vitals.reduce((a, v) => a + v.brokenStyles, 0),
    atRiskStyles: vitals.reduce((a, v) => a + v.atRiskStyles, 0),
    valueAtRisk: vitals.reduce((a, v) => a + v.valueAtRisk, 0),
    brokenStuds: studs.length,
    brokenStudValue: studs.reduce((a, x) => a + x.graded.signal.valueAtRisk, 0),
  };
}

export interface StoreRow {
  store: Store;
  cluster: Cluster;
  sales: number;
  lySales: number;
  growth: number;
  achievement: number;
  fillRate: number;
  band: FillBand;
  sellThrough: number;
  corePct: number;
  valueAtRisk: number;
  brokenStyles: number;
  brokenStuds: number;
  openAsks: number;
}

export function storeRows(
  stores: Store[],
  period: Period,
  requests: { storeId: string; status: string }[] = [],
  dropId?: string,
): StoreRow[] {
  return stores
    .map((store) => {
      const v = vitalsFor(store.id);
      const f = periodFigures(store.id, period, dropId);
      const mix = mixForStore(store.id);
      const total = mix.core + mix.fashion;
      return {
        store,
        cluster: clusterById(store.clusterId),
        sales: f.sales,
        lySales: f.lySales,
        growth: f.growth,
        achievement: f.target > 0 ? f.sales / f.target : 0,
        fillRate: v.fillRate,
        band: fillBand(v.fillRate),
        sellThrough: v.sellThrough,
        corePct: total > 0 ? mix.core / total : 0,
        valueAtRisk: v.valueAtRisk,
        brokenStyles: v.brokenStyles,
        brokenStuds: brokenStuds([store]).length,
        openAsks: requests.filter((r) => r.storeId === store.id && r.status === "open").length,
      };
    })
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk);
}

/** Sparkline series for a store or the filtered estate, for the header tiles. */
export function estateTrend(stores: Store[], points = 14): number[] {
  const base = Math.max(1, stores.reduce((a, s) => a + vitalsFor(s.id).todaySales, 0));
  return trend(`estate-${stores.length}-${stores[0]?.id ?? "none"}`, points, base, 0.025);
}

// ── Inventory, for the planning Inventory tab ────────────────────────────────

export interface InventoryLine {
  key: string;
  label: string;
  sellable: number;
  reserved: number;
  inTransit: number;
  warehouse: number;
  sold28: number;
  ros: number;
  cover: number;
  sellThrough: number;
  unhealthyStyles: number;
  valueAtRisk: number;
  /** Units at MRP sitting on the floor — what is tied up here. */
  floorValue: number;
}

function lineFor(key: string, label: string, rows: StockRow[], styleIds: Set<string>): InventoryLine {
  const sellableUnits = rows.reduce((a, r) => a + sellable(r), 0);
  const sold28 = rows.reduce((a, r) => a + r.sold28, 0);
  const fullPrice = rows.reduce((a, r) => a + Math.max(0, r.sold28 - r.soldOnMarkdown28), 0);
  const ros = rows.reduce((a, r) => a + trueRos(r), 0);
  const warehouse = [...styleIds].reduce(
    (a, id) => a + styleById(id).sizes.reduce((b, size) => b + dcAvailable(id, size), 0),
    0,
  );
  const floorValue = rows.reduce((a, r) => a + sellable(r) * styleById(r.styleId).mrp, 0);
  return {
    key,
    label,
    sellable: sellableUnits,
    reserved: rows.reduce((a, r) => a + r.reserved, 0),
    inTransit: rows.reduce((a, r) => a + r.inTransit, 0),
    warehouse,
    sold28,
    ros,
    cover: coverDays(sellableUnits, ros),
    sellThrough: sellThrough(fullPrice, Math.max(1, fullPrice + sellableUnits)),
    unhealthyStyles: 0,
    valueAtRisk: 0,
    floorValue,
  };
}

/** Inventory cut by product category across the given stores. */
export function inventoryByCategory(stores: Store[]): InventoryLine[] {
  const ids = new Set(stores.map((s) => s.id));
  const rows = STOCK.filter((r) => ids.has(r.storeId));
  return CATEGORIES.map((category) => {
    const styleIds = new Set(STYLES.filter((s) => s.category === category).map((s) => s.id));
    const mine = rows.filter((r) => styleIds.has(r.styleId));
    if (mine.length === 0) return null;
    const line = lineFor(category, category, mine, new Set(mine.map((r) => r.styleId)));
    // Style health has to be counted per store, since a set is broken in a door.
    let unhealthy = 0;
    let risk = 0;
    stores.forEach((store) => {
      stylesAtStore(store.id)
        .filter((st) => st.category === category)
        .forEach((st) => {
          const sig = styleSignal(store.id, st.id);
          if (sig.health.status !== "healthy") {
            unhealthy++;
            risk += sig.valueAtRisk;
          }
        });
    });
    return { ...line, unhealthyStyles: unhealthy, valueAtRisk: risk };
  })
    .filter((l): l is InventoryLine => l !== null)
    .sort((a, b) => b.floorValue - a.floorValue);
}

/** Inventory cut by core vs fashion. */
export function inventoryByType(stores: Store[]): InventoryLine[] {
  const ids = new Set(stores.map((s) => s.id));
  const rows = STOCK.filter((r) => ids.has(r.storeId));
  return (["core", "fashion"] as ProductType[]).map((type) => {
    const styleIds = new Set(STYLES.filter((s) => s.productType === type).map((s) => s.id));
    const mine = rows.filter((r) => styleIds.has(r.styleId));
    return lineFor(type, type === "core" ? "Core" : "Fashion", mine, new Set(mine.map((r) => r.styleId)));
  });
}

/** Inventory cut by cluster, so a planner can see where units are sitting. */
export function inventoryByCluster(stores: Store[]): InventoryLine[] {
  const clusterIds = [...new Set(stores.map((s) => s.clusterId))];
  return clusterIds
    .map((cid) => {
      const mineStores = stores.filter((s) => s.clusterId === cid);
      const ids = new Set(mineStores.map((s) => s.id));
      const rows = STOCK.filter((r) => ids.has(r.storeId));
      const line = lineFor(cid, clusterById(cid).name, rows, new Set(rows.map((r) => r.styleId)));
      const risk = mineStores.reduce((a, s) => a + vitalsFor(s.id).valueAtRisk, 0);
      const unhealthy = mineStores.reduce((a, s) => a + vitalsFor(s.id).brokenStyles + vitalsFor(s.id).atRiskStyles, 0);
      return { ...line, valueAtRisk: risk, unhealthyStyles: unhealthy };
    })
    .sort((a, b) => b.floorValue - a.floorValue);
}

/** Every style the given stores carry, aggregated — the deep inventory list. */
export interface StyleInventoryRow {
  style: Style;
  storesCarrying: number;
  sellable: number;
  warehouse: number;
  ros: number;
  cover: number;
  sellThrough: number;
  unhealthyStores: number;
  valueAtRisk: number;
}

export function styleInventory(stores: Store[]): StyleInventoryRow[] {
  const out: StyleInventoryRow[] = [];
  const carried = new Map<string, Store[]>();
  stores.forEach((store) => {
    // The seed lets a door hold a little cross-brand stock (outlets do). A
    // planner who owns one brand should not have another brand's styles in
    // their list, so this is the brand's own assortment only.
    stylesAtStore(store.id)
      .filter((st) => st.brand === store.brand)
      .forEach((st) => {
        carried.set(st.id, [...(carried.get(st.id) ?? []), store]);
      });
  });

  carried.forEach((inStores, styleId) => {
    const style = styleById(styleId);
    const signals = inStores.map((s) => styleSignal(s.id, styleId));
    const sellableUnits = signals.reduce((a, sg) => a + sg.sellable, 0);
    const ros = signals.reduce((a, sg) => a + sg.ros, 0);
    const fullPrice = inStores.reduce(
      (a, s) => a + stockForStyleAtStore(s.id, styleId).reduce((b, r) => b + Math.max(0, r.sold28 - r.soldOnMarkdown28), 0),
      0,
    );
    out.push({
      style,
      storesCarrying: inStores.length,
      sellable: sellableUnits,
      warehouse: style.sizes.reduce((a, size) => a + dcAvailable(styleId, size), 0),
      ros,
      cover: coverDays(sellableUnits, ros),
      sellThrough: sellThrough(fullPrice, Math.max(1, fullPrice + sellableUnits)),
      unhealthyStores: signals.filter((sg) => sg.health.status !== "healthy").length,
      valueAtRisk: signals.reduce((a, sg) => a + sg.valueAtRisk, 0),
    });
  });

  return out.sort((a, b) => b.valueAtRisk - a.valueAtRisk);
}

// ── Moving stock for real ────────────────────────────────────────────────────
//
// Planning can override the algorithm and move units on its own judgement:
// warehouse to a store, or store to store. These functions mutate the live
// stock rows and drop the caches over them, so the move shows up everywhere
// immediately rather than being recorded and forgotten.

/** Units the warehouse holds for a style, across every size. */
export function warehouseTotal(styleId: string): number {
  return styleById(styleId).sizes.reduce((a, size) => a + dcAvailable(styleId, size), 0);
}

/** Units the warehouse holds for a style, size by size. */
export function warehouseBySize(styleId: string): Array<{ size: Size; units: number }> {
  return styleById(styleId).sizes.map((size) => ({ size, units: dcAvailable(styleId, size) }));
}

/** Sellable units of one SKU on one store's floor. */
export function unitsAt(storeId: string, styleId: string, size: Size): number {
  const row = skuRow(storeId, styleId, size);
  return row ? sellable(row) : 0;
}

/** Put units back into the warehouse pool — the other direction of a move. */
export function returnToWarehouse(styleId: string, size: Size, units: number) {
  const key = `${styleId}|${size}`;
  dcStock.set(key, (dcStock.get(key) ?? 0) + units);
}

export interface PullbackRequest {
  fromStoreId: string;
  styleId: string;
  size: Size;
  units: number;
}

export function validatePullback(p: PullbackRequest): string[] {
  const errors: string[] = [];
  if (p.units <= 0) errors.push("Nothing to pull back.");
  const available = unitsAt(p.fromStoreId, p.styleId, p.size);
  if (p.units > available) {
    errors.push(`${storeById(p.fromStoreId).name} has ${available} of size ${p.size} on the floor, not ${p.units}.`);
  }
  return errors;
}

/**
 * Pull units off a store's floor and back into the warehouse. This is what
 * happens after EOSS: planning decides what comes back, the store ships it.
 */
export function applyPullback(p: PullbackRequest): boolean {
  if (validatePullback(p).length > 0) return false;
  const row = skuRow(p.fromStoreId, p.styleId, p.size);
  if (!row) return false;
  row.onHand = Math.max(0, row.onHand - p.units);
  returnToWarehouse(p.styleId, p.size, p.units);
  vitalsCache = null;
  return true;
}

export interface MoveRequest {
  from: string; // "warehouse" or a store id
  toStoreId: string;
  styleId: string;
  size: Size;
  units: number;
}

/**
 * What a move would be refused for. Checked before anything moves, so the
 * planner sees the reason rather than a half-applied batch.
 */
export function validateMove(m: MoveRequest): string[] {
  const errors: string[] = [];
  if (m.units <= 0) errors.push("Nothing to move.");
  if (m.from === m.toStoreId) errors.push("Source and destination are the same store.");
  const available = m.from === "warehouse" ? dcAvailable(m.styleId, m.size) : unitsAt(m.from, m.styleId, m.size);
  if (m.units > available) {
    errors.push(
      m.from === "warehouse"
        ? `Warehouse holds ${available} of size ${m.size}, not ${m.units}.`
        : `${storeById(m.from).name} has ${available} of size ${m.size} on the floor, not ${m.units}.`,
    );
  }
  return errors;
}

/**
 * Apply a move. Adds the units to the destination floor and takes them off the
 * source — the warehouse pool, or the donor store's floor.
 */
export function applyMove(m: MoveRequest): boolean {
  if (validateMove(m).length > 0) return false;

  const destination = skuRow(m.toStoreId, m.styleId, m.size);
  if (destination) {
    destination.onHand += m.units;
  } else {
    // The destination did not carry this SKU at all — a renewal, in other words.
    const row: StockRow = {
      storeId: m.toStoreId,
      styleId: m.styleId,
      size: m.size,
      onHand: m.units,
      inTransit: 0,
      reserved: 0,
      inStockDays: 1,
      sold28: 0,
      soldOnMarkdown28: 0,
    };
    STOCK.push(row);
    indexRow(row);
  }

  if (m.from === "warehouse") drawFromWarehouse(m.styleId, m.size, m.units);
  else {
    const donor = skuRow(m.from, m.styleId, m.size);
    if (donor) donor.onHand = Math.max(0, donor.onHand - m.units);
  }

  vitalsCache = null;
  return true;
}

// ── Drop context ─────────────────────────────────────────────────────────────
//
// Buying works drop by drop, so every planning screen can be read for one drop
// rather than for a whole season averaged into meaninglessness.

export interface DropPerformance {
  drop: Drop;
  styles: number;
  coreStyles: number;
  bought: number;
  onFloor: number;
  warehouse: number;
  sellThrough: number;
  valueAtRisk: number;
  brokenStuds: number;
  /** Days until it lands, or negative once it has. */
  daysOut: number;
}

export function stylesInDrop(dropId: string, brand: Brand = PLANNING_BRAND): Style[] {
  return STYLES.filter((s) => s.brand === brand && s.dropId === dropId);
}

export function dropPerformance(dropId: string, stores: Store[]): DropPerformance | null {
  const drop = DROPS.find((d) => d.id === dropId);
  if (!drop) return null;
  const styles = stylesInDrop(dropId);
  const ids = new Set(styles.map((s) => s.id));
  const storeIds = new Set(stores.map((s) => s.id));

  const rows = STOCK.filter((r) => storeIds.has(r.storeId) && ids.has(r.styleId));
  const onFloor = rows.reduce((a, r) => a + sellable(r), 0);
  const fullPrice = rows.reduce((a, r) => a + Math.max(0, r.sold28 - r.soldOnMarkdown28), 0);

  let risk = 0;
  let studs = 0;
  stores.forEach((store) => {
    gradedStyles(store.id, 80)
      .filter((g) => ids.has(g.signal.style.id))
      .forEach((g) => {
        if (g.signal.health.status !== "healthy") risk += g.signal.valueAtRisk;
        if (g.grade === "stud" && g.signal.health.status !== "healthy") studs++;
      });
  });

  return {
    drop,
    styles: styles.length,
    coreStyles: styles.filter((s) => s.productType === "core").length,
    bought: styles.reduce((a, s) => a + s.bought, 0),
    onFloor,
    warehouse: styles.reduce((a, s) => a + warehouseTotal(s.id), 0),
    sellThrough: sellThrough(fullPrice, Math.max(1, fullPrice + onFloor)),
    valueAtRisk: risk,
    brokenStuds: studs,
    daysOut: Math.round((drop.landsAt - NOW) / 86_400_000),
  };
}

export function allDropPerformance(stores: Store[]): DropPerformance[] {
  return DROPS.map((d) => dropPerformance(d.id, stores)).filter((d): d is DropPerformance => d !== null);
}

/**
 * How well a store uses the transfers it asks for: units received on an IST and
 * sold inside two days. A store that pulls stock in and sits on it is taking it
 * off a floor that would have sold it.
 */
export function istDiscipline(storeId: string): { received: number; soldIn2Days: number; share: number } {
  const r = rng(hash(`ist-${storeId}`));
  const v = vitalsFor(storeId);
  // Scaled to how the door trades, so a fast store shows better discipline than
  // a slow one — deterministic, like every other figure here.
  const received = 8 + Math.round(r() * 22);
  const base = 0.42 + v.sellThrough * 0.5;
  const soldIn2Days = Math.min(received, Math.round(received * Math.min(0.97, base + r() * 0.12)));
  return { received, soldIn2Days, share: received > 0 ? soldIn2Days / received : 0 };
}
