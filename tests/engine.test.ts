import { describe, expect, it } from "vitest";
import { CLUSTERS, CURRENT_SEASON, METRICS, NOW, OTB, ROLES, STOCK, STORES, STYLES, createStore, dropsForSeason, rng } from "../lib/seed";
import { dayOfWeekIST, fillBand, lastRunAt, mixVerdict, otbRemaining, qualifiesForRun } from "../lib/rules";
import {
  allVitals,
  brandRollups,
  catchment,
  categoryRollups,
  daysLeftInWindow,
  dcAvailable,
  enterprise,
  findDonors,
  inventoryLineage,
  missedOpportunities,
  reallocationPlan,
  regionRollups,
  sizeSetExceptions,
  stockForStore,
  strategicMoves,
  styleSignal,
  stylesAtStore,
  topSellers,
  trend,
  vitalsFor,
  BRAND_SCOPE,
  childScopes,
  clusterRollups,
  gradedStyles,
  mixForStore,
  replenRun,
  scopeSummary,
  storesInScope,
  warehouseHeld,
  dropAllocation,
  dropUnitsFor,
  applyMove,
  brokenStuds,
  unitsAt,
  validateMove,
  NO_FILTERS,
  PLANNING_BRAND,
  estateSummary,
  filterStores,
  filtersActive,
  inventoryByCategory,
  inventoryByCluster,
  inventoryByType,
  planningStores,
  storeRows,
  styleInventory,
} from "../lib/engine";

const finite = (n: number) => Number.isFinite(n) && !Number.isNaN(n);

// ─────────────────────────────────────────────────────────────────────────────
// Determinism — the property the whole demo depends on
// ─────────────────────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("the seeded PRNG produces the same sequence every run", () => {
    const a = Array.from({ length: 8 }, rng(42));
    const b = Array.from({ length: 8 }, rng(42));
    expect(a).toEqual(b);
    expect(a).not.toEqual(Array.from({ length: 8 }, rng(43)));
  });

  it("the demo clock is a fixed constant, not a live read", () => {
    expect(NOW).toBe(Date.UTC(2026, 7, 13, 6, 12, 0));
  });

  it("no source file calls Date.now, Math.random or a bare new Date", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(p) && !p.includes("/tests/")) {
          // Strip comments first — several files legitimately *mention* these
          // calls in a comment explaining why they are banned.
          const src = readFileSync(p, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .split("\n")
            .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
            .join("\n");
          if (/Date\.now\(\)/.test(src)) offenders.push(`${p}: Date.now()`);
          if (/Math\.random\(\)/.test(src)) offenders.push(`${p}: Math.random()`);
          if (/new Date\(\s*\)/.test(src)) offenders.push(`${p}: new Date()`);
        }
      }
    };
    walk(join(process.cwd(), "lib"));
    walk(join(process.cwd(), "app"));
    walk(join(process.cwd(), "components"));
    expect(offenders).toEqual([]);
  });

  it("selectors return identical results when called twice", () => {
    const a = JSON.stringify(sizeSetExceptions(STORES[0].id, 5).map((s) => [s.style.id, s.valueAtRisk]));
    const b = JSON.stringify(sizeSetExceptions(STORES[0].id, 5).map((s) => [s.style.id, s.valueAtRisk]));
    expect(a).toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dataset shape
// ─────────────────────────────────────────────────────────────────────────────

describe("dataset", () => {
  it("has the store side (manager + staff) executing and the hierarchy observing", () => {
    expect(ROLES).toHaveLength(5);
    expect(ROLES.map((r) => r.id).sort()).toEqual(["catplan", "leadership", "planner", "staff", "store"]);
    expect(ROLES.filter((r) => r.mode === "execute").map((r) => r.id).sort()).toEqual(["staff", "store"]);
    expect(ROLES.filter((r) => r.mode === "observe")).toHaveLength(3);
  });

  it("has a real estate of stores and a real assortment", () => {
    expect(STORES.length).toBeGreaterThanOrEqual(12);
    expect(STYLES.length).toBeGreaterThanOrEqual(25);
    expect(STOCK.length).toBeGreaterThan(1000);
  });

  it("gives every store a unique id and a non-zero norm", () => {
    expect(new Set(STORES.map((s) => s.id)).size).toBe(STORES.length);
    for (const s of STORES) {
      expect(s.norm).toBeGreaterThan(0);
      expect(s.targetMonth).toBeGreaterThan(0);
      expect(s.pincode).toMatch(/^\d{6}$/);
    }
  });

  it("gives every style a unique id, core sizes drawn from its size run, and a sane MRP", () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    for (const s of STYLES) {
      expect(s.mrp).toBeGreaterThan(0);
      expect(s.coreSizes.length).toBeGreaterThan(0);
      for (const c of s.coreSizes) expect(s.sizes).toContain(c);
    }
  });

  it("never produces negative stock, sales or reservations", () => {
    for (const r of STOCK) {
      expect(r.onHand).toBeGreaterThanOrEqual(0);
      expect(r.reserved).toBeGreaterThanOrEqual(0);
      expect(r.sold28).toBeGreaterThanOrEqual(0);
      expect(r.inStockDays).toBeGreaterThan(0);
      expect(r.inStockDays).toBeLessThanOrEqual(28);
      expect(r.soldOnMarkdown28).toBeLessThanOrEqual(r.sold28);
    }
  });

  it("contains genuine broken size sets — otherwise the whole demo is vacuous", () => {
    const broken = STORES.flatMap((s) => sizeSetExceptions(s.id, 100)).filter((e) => e.health.status === "broken");
    expect(broken.length).toBeGreaterThan(10);
  });

  it("contains SKUs the warehouse has genuinely run out of, forcing a transfer", () => {
    const exhausted = STYLES.flatMap((s) => s.sizes.map((z) => dcAvailable(s.id, z))).filter((n) => n === 0);
    expect(exhausted.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store vitals
// ─────────────────────────────────────────────────────────────────────────────

describe("storeVitals", () => {
  it("produces finite, non-negative figures for every store", () => {
    for (const v of allVitals()) {
      for (const key of ["sellableUnits", "fillRate", "mtdSales", "achievement", "conversion", "atv", "upt", "sizeSetScore", "valueAtRisk", "sellThrough"] as const) {
        expect(finite(v[key]), `${v.store.name}.${key}`).toBe(true);
        expect(v[key], `${v.store.name}.${key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps ratios inside their natural range", () => {
    for (const v of allVitals()) {
      expect(v.sizeSetScore).toBeLessThanOrEqual(1);
      expect(v.sellThrough).toBeLessThanOrEqual(1);
      expect(v.conversion).toBeLessThanOrEqual(1);
    }
  });

  it("counts broken and at-risk styles within the styles actually carried", () => {
    for (const v of allVitals()) {
      const carried = stylesAtStore(v.store.id).length;
      expect(v.brokenStyles + v.atRiskStyles).toBeLessThanOrEqual(carried);
    }
  });

  it("is cached, so two roles reading the same store cannot see different numbers", () => {
    expect(vitalsFor(STORES[0].id)).toBe(vitalsFor(STORES[0].id));
  });

  it("gives every store an assortment deep enough for its screens to mean anything", () => {
    for (const s of STORES) {
      expect(stockForStore(s.id).length, s.name).toBeGreaterThan(20);
      // A store carrying two styles would render a convincing-looking but
      // meaningless dashboard — guard the floor explicitly.
      expect(stylesAtStore(s.id).length, s.name).toBeGreaterThanOrEqual(5);
    }
  });

  it("carries each style in more than one store, so a transfer is ever possible", () => {
    const multiStore = STYLES.filter((st) => STORES.filter((s) => stockForStore(s.id).some((r) => r.styleId === st.id)).length > 1);
    expect(multiStore.length / STYLES.length).toBeGreaterThan(0.8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Style signals
// ─────────────────────────────────────────────────────────────────────────────

describe("styleSignal", () => {
  it("is finite and internally consistent for every carried style in every store", () => {
    for (const store of STORES) {
      for (const style of stylesAtStore(store.id)) {
        const s = styleSignal(store.id, style.id);
        expect(finite(s.ros)).toBe(true);
        expect(finite(s.naiveRos)).toBe(true);
        expect(finite(s.cover)).toBe(true);
        expect(finite(s.valueAtRisk)).toBe(true);
        expect(s.sellable).toBeGreaterThanOrEqual(0);
        expect(s.regionalRank).toBeGreaterThanOrEqual(1);
        expect(s.daysLeftInWindow).toBeGreaterThanOrEqual(0);
        expect(["replenish_from_dc", "transfer_in", "hold", "stop_sell", "pull_back"]).toContain(s.decision.action);
      }
    }
  });

  it("only attaches value at risk to a style whose size set is not healthy", () => {
    for (const store of STORES.slice(0, 5)) {
      for (const style of stylesAtStore(store.id)) {
        const s = styleSignal(store.id, style.id);
        if (s.health.status === "healthy") expect(s.valueAtRisk).toBe(0);
      }
    }
  });

  it("ranks exceptions by value at risk, descending", () => {
    const e = sizeSetExceptions(STORES[0].id, 20);
    for (let i = 1; i < e.length; i++) expect(e[i - 1].valueAtRisk).toBeGreaterThanOrEqual(e[i].valueAtRisk);
  });

  it("ranks top sellers by true rate of sale, descending", () => {
    const t = topSellers(STORES[0].id, 8);
    for (let i = 1; i < t.length; i++) expect(t[i - 1].ros).toBeGreaterThanOrEqual(t[i].ros);
  });

  it("only surfaces a missed opportunity where the store genuinely lags its region and holds stock", () => {
    for (const m of missedOpportunities(STORES[0].id, 10)) {
      expect(m.ros).toBeLessThan(m.regionalRos);
      expect(m.sellable).toBeGreaterThan(0);
    }
  });

  it("gives a never-out-of-stock style a longer full-price window", () => {
    const nos = STYLES.find((s) => s.isNOS)!;
    const fashion = STYLES.find((s) => !s.isNOS && s.launchedDaysAgo === nos.launchedDaysAgo);
    if (fashion) expect(daysLeftInWindow(nos)).toBeGreaterThan(daysLeftInWindow(fashion));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Donors
// ─────────────────────────────────────────────────────────────────────────────

describe("findDonors", () => {
  const style = STYLES[0];

  it("never returns the requesting store as its own donor", () => {
    for (const size of style.sizes) {
      for (const d of findDonors(STORES[0].id, style.id, size)) expect(d.store.id).not.toBe(STORES[0].id);
    }
  });

  it("never returns a donor with less stock than the minimum asked for", () => {
    for (const d of findDonors(STORES[0].id, style.id, "L", 3)) expect(d.sellable).toBeGreaterThanOrEqual(3);
  });

  it("returns donors ranked by score, descending", () => {
    const d = findDonors(STORES[0].id, style.id, "M");
    for (let i = 1; i < d.length; i++) expect(d[i - 1].score).toBeGreaterThanOrEqual(d[i].score);
  });

  it("produces finite, bounded scores and never negative surplus", () => {
    for (const store of STORES.slice(0, 4)) {
      for (const d of findDonors(store.id, style.id, "L")) {
        expect(finite(d.score)).toBe(true);
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.excess).toBeGreaterThanOrEqual(0);
        expect(d.distanceKm).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("returns an empty list rather than throwing when nothing is available", () => {
    expect(() => findDonors(STORES[0].id, style.id, "XXL", 9999)).not.toThrow();
    expect(findDonors(STORES[0].id, style.id, "XXL", 9999)).toEqual([]);
  });

  it("ranks a same-day donor with surplus above a distant donor with the same surplus", () => {
    // Scan the estate for a case where both exist, then assert the order. This
    // is the judgement a regional planner would make, so the engine must agree.
    let checked = 0;
    for (const store of STORES) {
      for (const st of STYLES.slice(0, 12)) {
        for (const size of st.sizes) {
          const d = findDonors(store.id, st.id, size, 1).filter((x) => x.saleable && x.excess > 0);
          const near = d.find((x) => x.distanceKm <= 40);
          const far = d.find((x) => x.distanceKm > 100 && Math.abs(x.excess - (near?.excess ?? 0)) <= 2);
          if (near && far) {
            expect(d.indexOf(near), `${store.name} ${st.name} ${size}`).toBeLessThan(d.indexOf(far));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("never puts a donor with no surplus, or a defective unit, at the top of the list", () => {
    for (const store of STORES.slice(0, 8)) {
      for (const st of STYLES.slice(0, 10)) {
        for (const size of st.sizes) {
          const d = findDonors(store.id, st.id, size, 1);
          if (d.length < 2) continue;
          const top = d[0];
          const anyBetter = d.some((x) => x.saleable && x.excess > 0);
          if (anyBetter) {
            expect(top.saleable, `${store.name}/${st.name}/${size}: defective unit ranked first`).toBe(true);
            expect(top.excess, `${store.name}/${st.name}/${size}: zero-surplus donor ranked first`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("marks some donor units as non-saleable, so the blocking rule has something to fire on", () => {
    const all = STORES.flatMap((s) => style.sizes.flatMap((z) => findDonors(s.id, style.id, z)));
    expect(all.some((d) => !d.saleable)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lineage — the reconciliation screen
// ─────────────────────────────────────────────────────────────────────────────

describe("inventoryLineage", () => {
  it("always names Arvind One as the reconciled figure", () => {
    const l = inventoryLineage(STORES[0].id, stylesAtStore(STORES[0].id)[0].id);
    const truth = l.entries.find((e) => e.system === "Arvind One")!;
    expect(truth.status).toBe("match");
    expect(truth.value).toBe(l.reconciled);
  });

  it("reconciles to a non-negative figure no greater than physical on-hand", () => {
    for (const store of STORES.slice(0, 6)) {
      for (const style of stylesAtStore(store.id).slice(0, 6)) {
        const l = inventoryLineage(store.id, style.id);
        const onHand = l.entries.find((e) => e.system === "D365 / POS")!.value;
        expect(l.reconciled).toBeGreaterThanOrEqual(0);
        expect(l.reconciled).toBeLessThanOrEqual(onHand);
      }
    }
  });

  it("shows the adjustments arithmetic actually adding up", () => {
    for (const store of STORES.slice(0, 6)) {
      for (const style of stylesAtStore(store.id).slice(0, 4)) {
        const { adjustments, reconciled } = inventoryLineage(store.id, style.id);
        const upTo = adjustments.slice(0, adjustments.findIndex((a) => a.label === "Sellable today"));
        expect(upTo.reduce((a, x) => a + x.units, 0)).toBe(reconciled);
      }
    }
  });

  it("produces a genuine divergence to talk about", () => {
    const spreads = STORES.slice(0, 8).flatMap((store) =>
      stylesAtStore(store.id).slice(0, 6).map((style) => {
        const vals = inventoryLineage(store.id, style.id).entries.map((e) => e.value);
        return Math.max(...vals) - Math.min(...vals);
      })
    );
    expect(spreads.some((s) => s > 2)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rollups
// ─────────────────────────────────────────────────────────────────────────────

describe("rollups", () => {
  it("produces one row per brand present in the estate, with sane ratios", () => {
    const b = brandRollups();
    expect(b.length).toBe(new Set(STORES.map((s) => s.brand)).size);
    for (const r of b) {
      expect(r.sellThrough).toBeGreaterThanOrEqual(0);
      expect(r.sellThrough).toBeLessThanOrEqual(1);
      expect(r.sizeSetScore).toBeLessThanOrEqual(1);
      expect(finite(r.markdownExposure)).toBe(true);
      expect(r.stores).toBeGreaterThan(0);
    }
  });

  it("covers every category and every region without NaN", () => {
    for (const c of categoryRollups()) {
      expect(finite(c.ros)).toBe(true);
      expect(c.brokenPct).toBeGreaterThanOrEqual(0);
      expect(c.brokenPct).toBeLessThanOrEqual(1);
    }
    const regions = regionRollups();
    expect(regions).toHaveLength(4);
    for (const r of regions) expect(finite(r.sellThrough)).toBe(true);
  });

  it("reconciles the enterprise unit total against the sum of stores", () => {
    const e = enterprise();
    expect(e.totalUnits).toBe(allVitals().reduce((a, v) => a + v.sellableUnits, 0));
    expect(e.stores).toBe(STORES.length);
    expect(e.sellThrough).toBeGreaterThan(0);
    expect(e.sellThrough).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Planner surfaces
// ─────────────────────────────────────────────────────────────────────────────

describe("reallocationPlan", () => {
  it("conserves units to within rounding, which is the first thing a planner checks", () => {
    for (const style of STYLES.slice(0, 8)) {
      const rows = reallocationPlan(style.id, 6000);
      if (!rows.length) continue;
      const planned = rows.reduce((a, r) => a + r.plannedUnits, 0);
      const recommended = rows.reduce((a, r) => a + r.recommendedUnits, 0);
      expect(Math.abs(planned - recommended)).toBeLessThanOrEqual(rows.length);
    }
  });

  it("never recommends negative units and always explains itself", () => {
    for (const r of reallocationPlan(STYLES[0].id, 6000)) {
      expect(r.recommendedUnits).toBeGreaterThanOrEqual(0);
      expect(r.reason.length).toBeGreaterThan(10);
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("sorts by delta so the biggest re-cuts are at the top", () => {
    const rows = reallocationPlan(STYLES[0].id, 6000);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].delta).toBeGreaterThanOrEqual(rows[i].delta);
  });

  it("handles zero units without dividing by zero", () => {
    expect(() => reallocationPlan(STYLES[0].id, 0)).not.toThrow();
    for (const r of reallocationPlan(STYLES[0].id, 0)) expect(finite(r.recommendedUnits)).toBe(true);
  });
});

describe("strategicMoves", () => {
  const moves = strategicMoves(20);

  it("proposes real, distinct, value-ranked moves", () => {
    expect(moves.length).toBeGreaterThan(3);
    expect(new Set(moves.map((m) => m.id)).size).toBe(moves.length);
    for (let i = 1; i < moves.length; i++) expect(moves[i - 1].valueUnlocked).toBeGreaterThanOrEqual(moves[i].valueUnlocked);
  });

  it("never moves stock from a store to itself, and never moves zero units", () => {
    for (const m of moves) {
      expect(m.from.id).not.toBe(m.to.id);
      expect(m.units).toBeGreaterThan(0);
      expect(m.valueUnlocked).toBeGreaterThan(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
      expect(m.rationale.length).toBeGreaterThan(20);
    }
  });

  it("respects the limit it is given", () => {
    expect(strategicMoves(5).length).toBeLessThanOrEqual(5);
  });
});

describe("catchment", () => {
  it("returns ranked, finite cells for every store", () => {
    for (const s of STORES.slice(0, 5)) {
      const cells = catchment(s.id);
      expect(cells.length).toBeGreaterThan(4);
      for (let i = 1; i < cells.length; i++) expect(cells[i - 1].customers).toBeGreaterThanOrEqual(cells[i].customers);
      for (const c of cells) {
        expect(c.customers).toBeGreaterThan(0);
        expect(c.spend).toBeGreaterThan(0);
        expect(c.distanceKm).toBeGreaterThan(0);
        expect(c.pincode).toMatch(/^\d{6}$/);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Metric registry
// ─────────────────────────────────────────────────────────────────────────────

describe("metric registry", () => {
  it("gives every metric an owner, a definition, a formula and a freshness contract", () => {
    for (const m of METRICS) {
      expect(m.owner.length).toBeGreaterThan(2);
      expect(m.definition.length).toBeGreaterThan(30);
      expect(m.formula.length).toBeGreaterThan(5);
      expect(["live", "hourly", "daily"]).toContain(m.freshness);
      expect(m.sources.length).toBeGreaterThan(0);
      expect(m.version).toMatch(/^v\d/);
    }
  });

  it("uses unique ids", () => {
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(METRICS.length);
  });

  it("keeps at least one metric unverified, so the adoption gate has something to demonstrate", () => {
    expect(METRICS.some((m) => !m.verified)).toBe(true);
  });

  it("claims to have retired legacy definitions", () => {
    expect(METRICS.reduce((a, m) => a + m.replaces, 0)).toBeGreaterThan(5);
  });

  it("keeps the freshest metrics the ones the store depends on", () => {
    expect(METRICS.find((m) => m.id === "sellable_stock")!.freshness).toBe("live");
    expect(METRICS.find((m) => m.id === "size_set_health")!.freshness).toBe("live");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trend series
// ─────────────────────────────────────────────────────────────────────────────

describe("trend", () => {
  it("is deterministic for a given key and finite throughout", () => {
    expect(trend("x", 10)).toEqual(trend("x", 10));
    expect(trend("x", 10)).not.toEqual(trend("y", 10));
    for (const v of trend("x", 20)) expect(finite(v)).toBe(true);
  });

  it("returns the requested number of points and never goes to zero", () => {
    expect(trend("z", 14)).toHaveLength(14);
    for (const v of trend("z", 14, 100)) expect(v).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Execution status — the data the hierarchy watches (store executes, HQ observes)
// ─────────────────────────────────────────────────────────────────────────────

import { allExecutionStatus, estateExecution, executionStatus, liveFeed } from "../lib/engine";

describe("execution status", () => {
  it("produces a coherent, finite snapshot for every store", () => {
    for (const s of allExecutionStatus()) {
      expect(s.floorWalkPct).toBeGreaterThanOrEqual(0);
      expect(s.floorWalkPct).toBeLessThanOrEqual(1);
      expect(s.tasksDone).toBeGreaterThanOrEqual(0);
      expect(s.tasksDone).toBeLessThanOrEqual(s.tasksTotal);
      expect(s.tasksTotal).toBeGreaterThan(0);
      expect(s.sizeSetOpen).toBeGreaterThanOrEqual(0);
      expect(["on_track", "attention", "behind"]).toContain(s.health);
      expect(finite(s.achievement)).toBe(true);
      expect(s.lastActivity.length).toBeGreaterThan(3);
    }
  });

  it("is deterministic — the hierarchy and the store never see different states", () => {
    const a = JSON.stringify(executionStatus(STORES[0].id));
    const b = JSON.stringify(executionStatus(STORES[0].id));
    expect(a).toBe(b);
  });

  it("size-set exceptions in the status match the exception engine", () => {
    for (const s of allExecutionStatus().slice(0, 6)) {
      const v = vitalsFor(s.store.id);
      expect(s.sizeSetOpen).toBe(v.brokenStyles + v.atRiskStyles);
    }
  });

  it("rolls the estate up consistently with the per-store snapshots", () => {
    const e = estateExecution();
    const all = allExecutionStatus();
    expect(e.storesTotal).toBe(all.length);
    expect(e.onTrack + e.attention + e.behind).toBe(all.length);
    expect(e.briefingsDone).toBe(all.filter((s) => s.briefingDone).length);
    expect(e.tasksDone).toBe(all.reduce((a, s) => a + s.tasksDone, 0));
  });

  it("produces a live feed that is newest-first, real, and bounded", () => {
    const feed = liveFeed(30);
    expect(feed.length).toBeGreaterThan(5);
    expect(feed.length).toBeLessThanOrEqual(30);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1].at).toBeGreaterThanOrEqual(feed[i].at);
    for (const ev of feed) {
      expect(ev.at).toBeLessThanOrEqual(NOW);
      expect(ev.label.length).toBeGreaterThan(3);
      expect(ev.label).not.toContain("{n}");
      expect(ev.label).not.toContain("{id}");
      expect(STORES.some((s) => s.id === ev.storeId)).toBe(true);
    }
  });

  it("the feed is deterministic", () => {
    expect(JSON.stringify(liveFeed(20))).toBe(JSON.stringify(liveFeed(20)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Planning read model
// ─────────────────────────────────────────────────────────────────────────────

describe("the hierarchy", () => {
  it("puts every store in exactly one cluster, and every cluster in its region", () => {
    STORES.forEach((s) => {
      const cluster = CLUSTERS.filter((c) => c.id === s.clusterId);
      expect(cluster).toHaveLength(1);
      expect(cluster[0].region).toBe(s.region);
      expect(cluster[0].cities).toContain(s.city);
    });
  });

  it("leaves no cluster empty — an empty level is a broken drill-down", () => {
    CLUSTERS.forEach((c) => {
      expect(STORES.filter((s) => s.clusterId === c.id).length).toBeGreaterThan(0);
    });
  });

  it("drills brand → region → cluster → store and bottoms out", () => {
    const brand = BRAND_SCOPE;
    const regions = childScopes(brand);
    expect(regions.length).toBeGreaterThan(1);
    expect(regions.every((r) => r.level === "region")).toBe(true);

    const clusters = childScopes(regions[0]);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.every((c) => c.level === "cluster")).toBe(true);

    const stores = childScopes(clusters[0]);
    expect(stores.length).toBeGreaterThan(0);
    expect(stores.every((s) => s.level === "store")).toBe(true);

    expect(childScopes(stores[0])).toEqual([]);
  });

  it("keeps the whole estate accounted for at every level", () => {
    const total = STORES.length;
    const viaRegions = childScopes(BRAND_SCOPE).reduce((a, r) => a + storesInScope(r).length, 0);
    expect(viaRegions).toBe(total);

    const viaClusters = CLUSTERS.reduce((a, c) => a + storesInScope({ level: "cluster", id: c.id, label: c.name }).length, 0);
    expect(viaClusters).toBe(total);
  });
});

describe("scope summary", () => {
  it("reports the same estate figures from the top as the stores add up to", () => {
    const all = scopeSummary(BRAND_SCOPE);
    expect(all.storeCount).toBe(STORES.length);
    const perStore = STORES.reduce((a, s) => a + vitalsFor(s.id).sellableUnits, 0);
    expect(all.sellableUnits).toBe(perStore);
  });

  it("weights fill rate by norm rather than averaging ratios", () => {
    const all = scopeSummary(BRAND_SCOPE);
    const norm = STORES.reduce((a, s) => a + s.norm, 0);
    expect(all.fillRate).toBeCloseTo(all.sellableUnits / norm, 6);
    expect(all.band).toBe(fillBand(all.fillRate));
  });

  it("produces finite, sane figures at every level of the tree", () => {
    const scopes = [
      BRAND_SCOPE,
      ...childScopes(BRAND_SCOPE),
      ...CLUSTERS.map((c) => ({ level: "cluster" as const, id: c.id, label: c.name })),
      ...STORES.slice(0, 5).map((s) => ({ level: "store" as const, id: s.id, label: s.name })),
    ];
    scopes.forEach((scope) => {
      const s = scopeSummary(scope);
      [s.todaySales, s.mtdSales, s.sellableUnits, s.norm, s.fillRate, s.asp, s.atv, s.upt, s.valueAtRisk].forEach((n) => {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      });
      expect(s.conversion).toBeLessThanOrEqual(1);
      expect(s.corePct).toBeGreaterThanOrEqual(0);
      expect(s.corePct).toBeLessThanOrEqual(1);
      expect(s.storeCount).toBeGreaterThan(0);
    });
  });

  it("keeps ASP consistent with ATV and UPT", () => {
    const s = scopeSummary(BRAND_SCOPE);
    expect(s.asp).toBeCloseTo(s.atv / s.upt, 4);
  });

  it("splits every sellable unit into either core or fashion, never both", () => {
    STORES.slice(0, 6).forEach((store) => {
      const mix = mixForStore(store.id);
      expect(mix.core + mix.fashion).toBe(vitalsFor(store.id).sellableUnits);
    });
  });

  it("holds the core target inside the invented band and judges the mix against it", () => {
    const s = scopeSummary(BRAND_SCOPE);
    expect(s.coreTarget).toBeGreaterThanOrEqual(0.42);
    expect(s.coreTarget).toBeLessThanOrEqual(0.58);
    expect(s.mix).toBe(mixVerdict(s.corePct, s.coreTarget));
  });

  it("does not contradict itself between today and last year", () => {
    const s = scopeSummary(BRAND_SCOPE);
    // Growth today and growth MTD must point the same way.
    expect(Math.sign(s.todaySales - s.lySameDay)).toBe(Math.sign(s.mtdSales - s.lyMtd));
  });
});

describe("the replenishment and renewal run", () => {
  it("is deterministic — the same clock produces the same run", () => {
    const a = replenRun(NOW);
    const b = replenRun(NOW);
    expect(a.id).toBe(b.id);
    expect(a.lines.map((l) => `${l.id}:${l.units}`)).toEqual(b.lines.map((l) => `${l.id}:${l.units}`));
  });

  it("dates itself to the last run day, not to right now", () => {
    const run = replenRun(NOW);
    expect(run.ranAt).toBe(lastRunAt(NOW));
    expect(dayOfWeekIST(run.ranAt)).toBe(2);
  });

  it("only triggers stores that actually failed a threshold", () => {
    const run = replenRun(NOW);
    expect(run.triggered.length).toBeGreaterThan(0);
    run.triggered.forEach((t) => {
      const v = vitalsFor(t.storeId);
      const carried = stylesAtStore(t.storeId).length;
      const brokenShare = carried > 0 ? (v.brokenStyles + v.atRiskStyles) / carried : 0;
      expect(qualifiesForRun({ fillRate: v.fillRate, brokenShare }).qualifies).toBe(true);
      expect(t.reason.length).toBeGreaterThan(10);
    });
  });

  it("raises both kinds of line, and every line carries a readable reason", () => {
    const run = replenRun(NOW);
    expect(run.lines.length).toBeGreaterThan(0);
    const kinds = new Set(run.lines.map((l) => l.kind));
    expect(kinds.has("replenish")).toBe(true);
    run.lines.forEach((l) => {
      expect(l.units).toBeGreaterThan(0);
      expect(l.reason.length).toBeGreaterThan(15);
      expect(l.confidence).toBeGreaterThan(0);
      expect(l.confidence).toBeLessThanOrEqual(1);
      expect(STORES.some((s) => s.id === l.storeId)).toBe(true);
      expect(STYLES.some((s) => s.id === l.styleId)).toBe(true);
    });
  });

  it("never promises more units than the warehouse holds on a replenishment line", () => {
    replenRun(NOW)
      .lines.filter((l) => l.kind === "replenish")
      .forEach((l) => {
        expect(l.units).toBeLessThanOrEqual(l.warehouseUnits);
      });
  });

  it("gives a replenishment line a size and a renewal line none", () => {
    const run = replenRun(NOW);
    run.lines.forEach((l) => {
      if (l.kind === "replenish") expect(l.size).toBeDefined();
      else expect(l.size).toBeUndefined();
    });
  });

  it("only ever fills a store towards the healthy floor, never past its norm", () => {
    const run = replenRun(NOW);
    const byStore = new Map<string, number>();
    run.lines.forEach((l) => byStore.set(l.storeId, (byStore.get(l.storeId) ?? 0) + l.units));
    byStore.forEach((units, storeId) => {
      const v = vitalsFor(storeId);
      expect(v.sellableUnits + units).toBeLessThanOrEqual(v.store.norm * 1.05);
    });
  });
});

describe("the warehouse holdback", () => {
  it("holds back the confirmed 25%, and knows the 40% goal is not today", () => {
    const held = warehouseHeld();
    const bought = STYLES.reduce((a, s) => a + s.bought, 0);
    expect(held.share).toBe(0.25);
    expect(held.units).toBe(Math.round(bought * 0.25));
    expect(held.goalUnits).toBeGreaterThan(held.units);
  });
});

describe("studs, buds and duds", () => {
  it("grades a store's assortment and ranks it by rate of sale", () => {
    const graded = gradedStyles(STORES[0].id, 20);
    expect(graded.length).toBeGreaterThan(0);
    graded.forEach((g) => {
      expect(["stud", "bud", "dud"]).toContain(g.grade);
      expect(["core", "fashion"]).toContain(g.productType);
    });
    for (let i = 1; i < graded.length; i++) {
      expect(graded[i - 1].signal.ros).toBeGreaterThanOrEqual(graded[i].signal.ros);
    }
  });
});

describe("clusters and OTB", () => {
  it("ranks clusters by sales and covers the whole estate", () => {
    const rolls = clusterRollups();
    expect(rolls).toHaveLength(CLUSTERS.length);
    expect(rolls.reduce((a, r) => a + r.summary.storeCount, 0)).toBe(STORES.length);
    for (let i = 1; i < rolls.length; i++) {
      expect(rolls[i - 1].summary.mtdSales).toBeGreaterThanOrEqual(rolls[i].summary.mtdSales);
    }
  });

  it("leaves real OTB headroom on every line, so a mid-season bet is possible", () => {
    expect(OTB.length).toBeGreaterThan(0);
    OTB.forEach((line) => {
      const r = otbRemaining(line);
      expect(r.units).toBeGreaterThan(0);
      expect(r.pctConsumed).toBeGreaterThan(0);
      expect(r.pctConsumed).toBeLessThan(1);
      expect(line.receivedUnits).toBeLessThanOrEqual(line.committedUnits);
    });
  });

  it("schedules three drops that leave the holdback at the warehouse", () => {
    const drops = dropsForSeason(CURRENT_SEASON.id);
    expect(drops).toHaveLength(3);
    const scheduled = drops.reduce((a, d) => a + d.pctOfBuy, 0);
    expect(scheduled).toBeCloseTo(1 - 0.25, 5);
    for (let i = 1; i < drops.length; i++) {
      expect(drops[i].landsAt).toBeGreaterThan(drops[i - 1].landsAt);
    }
  });

  it("splits the assortment into core and fashion from the product master", () => {
    const core = STYLES.filter((s) => s.productType === "core");
    expect(core.length).toBeGreaterThan(4);
    expect(core.length).toBeLessThan(STYLES.length);
    // Every NOS style is core by definition.
    STYLES.filter((s) => s.isNOS).forEach((s) => expect(s.productType).toBe("core"));
  });
});

describe("drop allocation", () => {
  it("hands out the whole drop, and no more", () => {
    const rows = dropAllocation("AW26-D1");
    expect(rows).toHaveLength(STORES.length);
    const units = dropUnitsFor("AW26-D1");
    const planned = rows.reduce((a, r) => a + r.planned, 0);
    const recommended = rows.reduce((a, r) => a + r.recommended, 0);
    // Rounding per store, so allow a unit of drift per door.
    expect(Math.abs(planned - units)).toBeLessThanOrEqual(STORES.length);
    expect(Math.abs(recommended - units)).toBeLessThanOrEqual(STORES.length);
  });

  it("moves units towards the doors that are trading ahead", () => {
    const rows = dropAllocation("AW26-D1");
    const winners = rows.filter((r) => r.delta > 0);
    const losers = rows.filter((r) => r.delta < 0);
    expect(winners.length).toBeGreaterThan(0);
    expect(losers.length).toBeGreaterThan(0);
    // Best-performing door must not be losing units to a worse one.
    const best = [...rows].sort((a, b) => b.achievement - a.achievement)[0];
    const worst = [...rows].sort((a, b) => a.achievement - b.achievement)[0];
    expect(best.recommended / Math.max(1, best.store.norm)).toBeGreaterThan(worst.recommended / Math.max(1, worst.store.norm));
  });

  it("ranks by the size of the change and explains each one", () => {
    const rows = dropAllocation("AW26-D1");
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].delta).toBeGreaterThanOrEqual(rows[i].delta);
    rows.forEach((r) => expect(r.reason.length).toBeGreaterThan(10));
  });

  it("filters to one brand without leaking another brand's doors", () => {
    const rows = dropAllocation("AW26-D1", "Arrow");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.store.brand).toBe("Arrow"));
  });

  it("returns nothing for a drop that does not exist", () => {
    expect(dropAllocation("NOPE")).toEqual([]);
    expect(dropUnitsFor("NOPE")).toBe(0);
  });
});

describe("style-level grading feeds the run", () => {
  it("grades each style on its own sell-through, not the store's", () => {
    const graded = gradedStyles(STORES[0].id, 20);
    const spread = new Set(graded.map((g) => g.sellThrough.toFixed(4)));
    // If the store's own figure were being used, every style would be identical.
    expect(spread.size).toBeGreaterThan(1);
    graded.forEach((g) => {
      expect(g.sellThrough).toBeGreaterThanOrEqual(0);
      expect(g.sellThrough).toBeLessThanOrEqual(1);
    });
  });

  it("produces both replenishment and renewal volume, not just one", () => {
    const run = replenRun(NOW);
    const replen = run.lines.filter((l) => l.kind === "replenish").reduce((a, l) => a + l.units, 0);
    const renew = run.lines.filter((l) => l.kind === "renew").reduce((a, l) => a + l.units, 0);
    expect(replen).toBeGreaterThan(0);
    expect(renew).toBeGreaterThan(0);
    // Replenishment leads, but renewal must not be a rounding error.
    expect(renew / (replen + renew)).toBeGreaterThan(0.05);
  });

  it("leaves some stores alone — a trigger that fires everywhere is not a trigger", () => {
    const run = replenRun(NOW);
    expect(run.triggered.length).toBeLessThan(STORES.length);
    expect(run.triggered.length).toBeGreaterThan(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The flat estate model — one brand, filters instead of a drill-down
// ─────────────────────────────────────────────────────────────────────────────

describe("one brand", () => {
  it("scopes the planning estate to a single brand", () => {
    const stores = planningStores();
    expect(stores.length).toBeGreaterThan(2);
    stores.forEach((s) => expect(s.brand).toBe(PLANNING_BRAND));
    expect(stores.length).toBeLessThan(STORES.length);
  });

  it("runs replenishment over that estate only", () => {
    const ids = new Set(planningStores().map((s) => s.id));
    const run = replenRun(NOW);
    run.triggered.forEach((t) => expect(ids.has(t.storeId)).toBe(true));
    run.lines.forEach((l) => expect(ids.has(l.storeId)).toBe(true));
  });
});

describe("estate filters", () => {
  it("returns the whole estate with nothing applied", () => {
    expect(filterStores(NO_FILTERS).length).toBe(planningStores().length);
    expect(filtersActive(NO_FILTERS)).toBe(0);
  });

  it("narrows by region, cluster, grade and band, and counts what is on", () => {
    const region = planningStores()[0].region;
    const byRegion = filterStores({ ...NO_FILTERS, region });
    expect(byRegion.length).toBeGreaterThan(0);
    byRegion.forEach((s) => expect(s.region).toBe(region));

    const cluster = planningStores()[0].clusterId;
    filterStores({ ...NO_FILTERS, cluster }).forEach((s) => expect(s.clusterId).toBe(cluster));

    filterStores({ ...NO_FILTERS, grade: "A" }).forEach((s) => expect(s.grade).toBe("A"));
    filterStores({ ...NO_FILTERS, band: "thin" }).forEach((s) => expect(fillBand(vitalsFor(s.id).fillRate)).toBe("thin"));

    expect(filtersActive({ ...NO_FILTERS, region, grade: "A" })).toBe(2);
  });

  it("combines filters rather than replacing them", () => {
    const s = planningStores()[0];
    const both = filterStores({ ...NO_FILTERS, region: s.region, grade: s.grade });
    both.forEach((x) => {
      expect(x.region).toBe(s.region);
      expect(x.grade).toBe(s.grade);
    });
    expect(both.length).toBeLessThanOrEqual(filterStores({ ...NO_FILTERS, region: s.region }).length);
  });

  it("can filter down to nothing without throwing", () => {
    const impossible = filterStores({ region: "North", cluster: "CL-EST", grade: "all", band: "all" });
    expect(impossible).toEqual([]);
    const summary = estateSummary(impossible, "week");
    expect(summary.storeCount).toBe(0);
    expect(Number.isFinite(summary.fillRate)).toBe(true);
    expect(summary.asp).toBe(0);
  });
});

describe("periods", () => {
  it("grows with the window and never shrinks", () => {
    const stores = planningStores();
    const today = estateSummary(stores, "today");
    const week = estateSummary(stores, "week");
    const mtd = estateSummary(stores, "mtd");
    expect(week.sales).toBeGreaterThan(today.sales);
    expect(mtd.sales).toBeGreaterThan(week.sales);
  });

  it("keeps a single store's per-bill ratios identical across periods", () => {
    const store = planningStores()[0];
    const today = estateSummary([store], "today");
    const week = estateSummary([store], "week");
    // Sales and bills scale by the same multiple, so the rate cannot move.
    expect(week.atv).toBeCloseTo(today.atv, 6);
    expect(week.upt).toBeCloseTo(today.upt, 6);
    expect(week.asp).toBeCloseTo(today.asp, 6);
  });

  it("lets the estate's blended ATV drift only slightly, from the store mix", () => {
    const stores = planningStores();
    const today = estateSummary(stores, "today");
    const week = estateSummary(stores, "week");
    // Doors grow at different rates over a week, so the blend shifts — but a
    // big move would mean the period maths is wrong, not that the mix changed.
    expect(Math.abs(week.atv - today.atv) / today.atv).toBeLessThan(0.05);
    expect(Math.abs(week.upt - today.upt) / today.upt).toBeLessThan(0.05);
  });

  it("leaves stock figures alone — inventory is a position, not a flow", () => {
    const stores = planningStores();
    const today = estateSummary(stores, "today");
    const mtd = estateSummary(stores, "mtd");
    expect(mtd.sellableUnits).toBe(today.sellableUnits);
    expect(mtd.fillRate).toBeCloseTo(today.fillRate, 6);
    expect(mtd.valueAtRisk).toBe(today.valueAtRisk);
  });

  it("is deterministic — the same period twice gives the same number", () => {
    expect(estateSummary(planningStores(), "week").sales).toBe(estateSummary(planningStores(), "week").sales);
  });
});

describe("store rows", () => {
  it("gives one row per store in scope, worst value at risk first", () => {
    const stores = planningStores();
    const rows = storeRows(stores, "week");
    expect(rows).toHaveLength(stores.length);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].valueAtRisk).toBeGreaterThanOrEqual(rows[i].valueAtRisk);
    }
  });

  it("adds up to the estate summary it sits under", () => {
    const stores = planningStores();
    const rows = storeRows(stores, "week");
    const summary = estateSummary(stores, "week");
    expect(rows.reduce((a, r) => a + r.sales, 0)).toBeCloseTo(summary.sales, 4);
    expect(rows.reduce((a, r) => a + r.valueAtRisk, 0)).toBeCloseTo(summary.valueAtRisk, 4);
  });

  it("counts each store's open asks and ignores decided ones", () => {
    const store = planningStores()[0];
    const rows = storeRows([store], "week", [
      { storeId: store.id, status: "open" },
      { storeId: store.id, status: "approved" },
      { storeId: "somewhere-else", status: "open" },
    ]);
    expect(rows[0].openAsks).toBe(1);
  });
});

describe("inventory", () => {
  it("cuts the same units three ways and agrees with the estate on all of them", () => {
    const stores = planningStores();
    const sellableTotal = estateSummary(stores, "week").sellableUnits;
    expect(inventoryByType(stores).reduce((a, l) => a + l.sellable, 0)).toBe(sellableTotal);
    expect(inventoryByCluster(stores).reduce((a, l) => a + l.sellable, 0)).toBe(sellableTotal);
    expect(inventoryByCategory(stores).reduce((a, l) => a + l.sellable, 0)).toBe(sellableTotal);
  });

  it("produces finite, non-negative lines with a label on every cut", () => {
    const stores = planningStores();
    [...inventoryByCategory(stores), ...inventoryByCluster(stores), ...inventoryByType(stores)].forEach((l) => {
      expect(l.label.length).toBeGreaterThan(0);
      [l.sellable, l.reserved, l.inTransit, l.warehouse, l.floorValue, l.valueAtRisk].forEach((n) => {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      });
      expect(l.sellThrough).toBeGreaterThanOrEqual(0);
      expect(l.sellThrough).toBeLessThanOrEqual(1);
    });
  });

  it("lists every style carried, with the stores that carry it", () => {
    const stores = planningStores();
    const rows = styleInventory(stores);
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach((r) => {
      expect(r.storesCarrying).toBeGreaterThan(0);
      expect(r.storesCarrying).toBeLessThanOrEqual(stores.length);
      expect(r.unhealthyStores).toBeLessThanOrEqual(r.storesCarrying);
      expect(r.style.brand).toBe(PLANNING_BRAND);
    });
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].valueAtRisk).toBeGreaterThanOrEqual(rows[i].valueAtRisk);
  });

  it("accounts for nearly all estate units, the remainder being cross-brand stock", () => {
    const stores = planningStores();
    const viaStyles = styleInventory(stores).reduce((a, r) => a + r.sellable, 0);
    const estate = estateSummary(stores, "week").sellableUnits;
    // Own-brand styles only, so this must be a subset — but a large one.
    expect(viaStyles).toBeLessThanOrEqual(estate);
    expect(viaStyles / estate).toBeGreaterThan(0.6);
  });
});

describe("own-brand assortment", () => {
  it("never shows another brand's styles in a store's assortment", () => {
    planningStores()
      .slice(0, 4)
      .forEach((store) => {
        const graded = gradedStyles(store.id, 60);
        expect(graded.length).toBeGreaterThan(0);
        graded.forEach((g) => expect(g.signal.style.brand).toBe(store.brand));
      });
  });

  it("keeps the run's renewal candidates on the brand too", () => {
    replenRun(NOW)
      .lines.filter((l) => l.kind === "renew")
      .forEach((l) => {
        expect(STYLES.find((s) => s.id === l.styleId)!.brand).toBe(PLANNING_BRAND);
      });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Opening a store at runtime
//
// Runs last on purpose: it mutates the shared dataset, exactly as the app does.
// ─────────────────────────────────────────────────────────────────────────────

describe("adding a store", () => {
  it("appears everywhere planning looks, with a real assortment", () => {
    const beforeStores = planningStores().length;
    const beforeUnits = estateSummary(planningStores(), "week").sellableUnits;

    const store = createStore({
      name: "Test Door Andheri",
      city: "Mumbai",
      brand: "Tommy Hilfiger",
      region: "West",
      format: "Mall",
      model: "COCO",
      grade: "B",
      clusterId: "CL-MUM",
      pincode: "400053",
      headcount: 9,
      managerName: "Test Manager",
    });

    // In the estate list…
    expect(planningStores().length).toBe(beforeStores + 1);
    expect(planningStores().some((s) => s.id === store.id)).toBe(true);
    // …behind the filters it belongs to…
    expect(filterStores({ ...NO_FILTERS, cluster: "CL-MUM" }).some((s) => s.id === store.id)).toBe(true);
    expect(filterStores({ ...NO_FILTERS, grade: "B" }).some((s) => s.id === store.id)).toBe(true);
    // …with stock indexed, so it is not an empty shell…
    expect(stockForStore(store.id).length).toBeGreaterThan(0);
    expect(stylesAtStore(store.id).length).toBeGreaterThan(0);
    // …counted in the estate totals…
    expect(estateSummary(planningStores(), "week").sellableUnits).toBeGreaterThan(beforeUnits);
    // …and in the buy's cut across stores.
    expect(dropAllocation("AW26-D1", "Tommy Hilfiger").some((r) => r.store.id === store.id)).toBe(true);
  });

  it("gives the new door a norm, a cluster and a replenish share", () => {
    const store = STORES[STORES.length - 1];
    expect(store.norm).toBeGreaterThan(0);
    expect(CLUSTERS.some((c) => c.id === store.clusterId)).toBe(true);
    expect(store.replenShare).toBeGreaterThan(0);
    expect(store.replenShare).toBeLessThanOrEqual(1);
  });

  it("opens with no trading history, so its rate of sale is honestly zero", () => {
    const store = STORES[STORES.length - 1];
    const rows = stockForStore(store.id);
    expect(rows.every((r) => r.sold28 === 0)).toBe(true);
    const v = vitalsFor(store.id);
    expect(Number.isFinite(v.fillRate)).toBe(true);
    expect(v.fillRate).toBeGreaterThan(0);
    expect(Number.isFinite(v.sellThrough)).toBe(true);
  });

  it("produces finite figures on every planning surface for the new door", () => {
    const store = STORES[STORES.length - 1];
    const s = estateSummary([store], "week");
    [s.sales, s.fillRate, s.sellableUnits, s.valueAtRisk, s.corePct].forEach((n) => expect(Number.isFinite(n)).toBe(true));
    const rows = storeRows([store], "week");
    expect(rows).toHaveLength(1);
    expect(Number.isFinite(rows[0].achievement)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pausing a store, and moving stock by hand
//
// Also runs late: applyMove mutates the live rows, exactly as the app does.
// ─────────────────────────────────────────────────────────────────────────────

describe("pausing replenishment", () => {
  it("leaves a paused store out of the run entirely", () => {
    const full = replenRun(NOW);
    const target = full.triggered[0].storeId;
    const paused = replenRun(NOW, [target]);
    expect(paused.triggered.some((t) => t.storeId === target)).toBe(false);
    expect(paused.lines.some((l) => l.storeId === target)).toBe(false);
    // Everyone else is untouched.
    expect(paused.triggered.length).toBe(full.triggered.length - 1);
  });

  it("still runs for every store that is not paused", () => {
    const full = replenRun(NOW);
    const paused = replenRun(NOW, [full.triggered[0].storeId]);
    full.triggered.slice(1).forEach((t) => {
      expect(paused.triggered.some((p) => p.storeId === t.storeId)).toBe(true);
    });
  });

  it("produces an empty run when every store is paused", () => {
    const all = planningStores().map((s) => s.id);
    const none = replenRun(NOW, all);
    expect(none.triggered).toEqual([]);
    expect(none.lines).toEqual([]);
  });
});

describe("moving stock by hand", () => {
  const store = () => planningStores()[0];

  it("refuses more units than the source holds, and says how many there are", () => {
    const st = store();
    const style = stylesAtStore(st.id).find((x) => x.brand === st.brand)!;
    const size = style.coreSizes[0];
    const errs = validateMove({ from: "warehouse", toStoreId: st.id, styleId: style.id, size, units: 99_999 });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toMatch(/holds \d+/);
  });

  it("refuses a move to the store it came from, and a move of nothing", () => {
    const st = store();
    const style = stylesAtStore(st.id)[0];
    const size = style.coreSizes[0];
    expect(validateMove({ from: st.id, toStoreId: st.id, styleId: style.id, size, units: 1 })).toContain(
      "Source and destination are the same store.",
    );
    expect(validateMove({ from: "warehouse", toStoreId: st.id, styleId: style.id, size, units: 0 })).toContain("Nothing to move.");
  });

  it("moves units off the warehouse and onto the floor, and both numbers change", () => {
    const st = store();
    const style = stylesAtStore(st.id).find((x) => x.brand === st.brand && dcAvailable(x.id, x.coreSizes[0]) > 4)!;
    const size = style.coreSizes[0];
    const whBefore = dcAvailable(style.id, size);
    const floorBefore = unitsAt(st.id, style.id, size);

    expect(applyMove({ from: "warehouse", toStoreId: st.id, styleId: style.id, size, units: 3 })).toBe(true);

    expect(dcAvailable(style.id, size)).toBe(whBefore - 3);
    expect(unitsAt(st.id, style.id, size)).toBe(floorBefore + 3);
  });

  it("conserves units on a store-to-store move — nothing is created or lost", () => {
    const [a, b] = planningStores();
    const style = stylesAtStore(a.id).find((x) => x.brand === a.brand && unitsAt(a.id, x.id, x.coreSizes[0]) > 2)!;
    const size = style.coreSizes[0];
    const before = unitsAt(a.id, style.id, size) + unitsAt(b.id, style.id, size);

    expect(applyMove({ from: a.id, toStoreId: b.id, styleId: style.id, size, units: 2 })).toBe(true);

    expect(unitsAt(a.id, style.id, size) + unitsAt(b.id, style.id, size)).toBe(before);
  });

  it("puts a SKU on a floor that never carried it — which is what a renewal is", () => {
    const st = planningStores()[1];
    const notCarried = STYLES.find(
      (x) => x.brand === st.brand && !stylesAtStore(st.id).some((c) => c.id === x.id) && dcAvailable(x.id, x.coreSizes[0]) > 2,
    );
    if (!notCarried) return; // the demo assortment is small; skip rather than assert nothing
    const size = notCarried.coreSizes[0];
    expect(unitsAt(st.id, notCarried.id, size)).toBe(0);
    expect(applyMove({ from: "warehouse", toStoreId: st.id, styleId: notCarried.id, size, units: 2 })).toBe(true);
    expect(unitsAt(st.id, notCarried.id, size)).toBe(2);
    expect(stylesAtStore(st.id).some((c) => c.id === notCarried.id)).toBe(true);
  });

  it("shows the estate the new units immediately, cache and all", () => {
    const st = store();
    const style = stylesAtStore(st.id).find((x) => x.brand === st.brand && dcAvailable(x.id, x.coreSizes[0]) > 6)!;
    const size = style.coreSizes[0];
    const before = estateSummary([st], "week").sellableUnits;
    applyMove({ from: "warehouse", toStoreId: st.id, styleId: style.id, size, units: 5 });
    expect(estateSummary([st], "week").sellableUnits).toBe(before + 5);
  });

  it("never lets the warehouse go negative", () => {
    const st = store();
    const style = stylesAtStore(st.id).find((x) => x.brand === st.brand)!;
    const size = style.coreSizes[0];
    const wh = dcAvailable(style.id, size);
    // Asking for everything is fine; asking for more than everything is refused.
    if (wh > 0) expect(applyMove({ from: "warehouse", toStoreId: st.id, styleId: style.id, size, units: wh })).toBe(true);
    expect(dcAvailable(style.id, size)).toBe(0);
    expect(applyMove({ from: "warehouse", toStoreId: st.id, styleId: style.id, size, units: 1 })).toBe(false);
    expect(dcAvailable(style.id, size)).toBe(0);
  });
});

describe("broken studs", () => {
  it("counts only styles that are both selling and short a pivotal size", () => {
    const stores = planningStores();
    const studs = brokenStuds(stores);
    studs.forEach((x) => {
      expect(x.graded.grade).toBe("stud");
      expect(x.graded.signal.health.status).not.toBe("healthy");
    });
  });

  it("is a subset of the unhealthy styles, never larger", () => {
    const stores = planningStores();
    const s = estateSummary(stores, "week");
    expect(s.brokenStuds).toBeLessThanOrEqual(s.brokenStyles + s.atRiskStyles);
    expect(s.brokenStuds).toBe(brokenStuds(stores).length);
  });

  it("ranks the most expensive one first, and prices the whole set", () => {
    const studs = brokenStuds(planningStores());
    for (let i = 1; i < studs.length; i++) {
      expect(studs[i - 1].graded.signal.valueAtRisk).toBeGreaterThanOrEqual(studs[i].graded.signal.valueAtRisk);
    }
    const s = estateSummary(planningStores(), "week");
    expect(s.brokenStudValue).toBeCloseTo(studs.reduce((a, x) => a + x.graded.signal.valueAtRisk, 0), 4);
  });

  it("adds up across stores to the estate figure", () => {
    const stores = planningStores();
    const perStore = storeRows(stores, "week").reduce((a, r) => a + r.brokenStuds, 0);
    expect(perStore).toBe(estateSummary(stores, "week").brokenStuds);
  });
});
