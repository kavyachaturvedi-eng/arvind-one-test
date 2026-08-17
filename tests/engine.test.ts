import { describe, expect, it } from "vitest";
import { METRICS, NOW, ROLES, STOCK, STORES, STYLES, rng } from "../lib/seed";
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
    expect(ROLES).toHaveLength(4);
    expect(ROLES.map((r) => r.id).sort()).toEqual(["leadership", "planner", "staff", "store"]);
    expect(ROLES.filter((r) => r.mode === "execute").map((r) => r.id).sort()).toEqual(["staff", "store"]);
    expect(ROLES.filter((r) => r.mode === "observe")).toHaveLength(2);
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
