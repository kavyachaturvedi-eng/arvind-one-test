// ─────────────────────────────────────────────────────────────────────────────
// Selectors: the read model every screen is built from.
//
// This is the layer that makes "the same number everywhere" literally true —
// a store manager, an area manager, a planner and the CEO all call the same
// function and differ only in the filter they pass.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CATEGORIES,
  NOW,
  STOCK,
  STORES,
  STYLES,
  rng,
  storeById,
  styleById,
} from "./seed";
import {
  coverDays,
  distanceKm,
  replenishmentDecision,
  sizeSetHealth,
  trueRos,
  type ReplenishDecision,
  type SizeSetResult,
} from "./rules";
import type { Brand, Category, Region, Size, StockRow, Store, Style } from "./types";

// ── Indexes (built once) ─────────────────────────────────────────────────────

const byStore = new Map<string, StockRow[]>();
const byStyle = new Map<string, StockRow[]>();
const bySku = new Map<string, StockRow>();

for (const row of STOCK) {
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
  style.sizes.forEach((size, i) => {
    const r = rng(hash(style.id) + i * 7);
    const held = Math.round((style.bought * 0.2) / style.sizes.length);
    // Some SKUs are genuinely exhausted at the warehouse — that is what forces
    // an inter-store transfer instead of a simple replenishment.
    dcStock.set(`${style.id}|${size}`, r() < 0.34 ? 0 : Math.round(held * (0.15 + r() * 0.5)));
  });
}
export const dcAvailable = (styleId: string, size: Size) => dcStock.get(`${styleId}|${size}`) ?? 0;

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
