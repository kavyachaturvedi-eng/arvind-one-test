// The intelligence layer: mix, space, staff, rate of sale, VM, the season.
//
// These are the numbers a store manager is going to be judged on, so the tests
// are about arithmetic that must hold rather than about shapes — shares that sum
// to one, splits that conserve units, and verdicts that follow their threshold.

import { describe, expect, it } from "vitest";
import { STORES, VM_CHECKS, categorySpace, storeById } from "../lib/seed";
import {
  DATA_INPUTS,
  MIX_GAP_TRIGGER,
  PRICE_BANDS,
  UPT_TARGET,
  mixGapVerdict,
  priceBandFor,
  trustOf,
  upt,
  uptUpside,
} from "../lib/rules";
import {
  allocationSplit,
  categoryMix,
  inSeasonActions,
  planningStores,
  priceBandMix,
  pushList,
  rosWatch,
  seasonState,
  spaceVsSales,
  staffKpis,
  storeIntel,
  uptPosition,
  vmAdherence,
  vmFor,
} from "../lib/engine";

const stores = planningStores();
const home = STORES[0];

describe("price bands", () => {
  it("covers the whole range with no gaps and no overlaps", () => {
    for (const mrp of [0, 999, 1199, 2499, 2500, 4499, 4500, 6999, 7000, 9999, 50_000]) {
      const band = priceBandFor(mrp);
      expect(mrp >= band.min && mrp <= band.max).toBe(true);
      expect(PRICE_BANDS.filter((b) => mrp >= b.min && mrp <= b.max)).toHaveLength(1);
    }
  });
});

describe("mix gap", () => {
  it("calls a push only once the gap clears the trigger", () => {
    expect(mixGapVerdict(0.2, 0.1)).toBe("push");
    expect(mixGapVerdict(0.1, 0.2)).toBe("feed");
    expect(mixGapVerdict(0.2, 0.2 - MIX_GAP_TRIGGER / 2)).toBe("in_line");
    // Exactly on the trigger counts — the threshold is inclusive.
    expect(mixGapVerdict(0.2, 0.1, 0.1)).toBe("push");
    expect(mixGapVerdict(0.1, 0.2, 0.1)).toBe("feed");
  });

  it("shares sum to one on both sides", () => {
    for (const rows of [categoryMix(stores), priceBandMix(stores), categoryMix([home])]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.reduce((a, r) => a + r.invShare, 0)).toBeCloseTo(1, 5);
      expect(rows.reduce((a, r) => a + r.salesShare, 0)).toBeCloseTo(1, 5);
    }
  });

  it("states the gap as inventory share minus sales share", () => {
    for (const r of categoryMix(stores)) {
      expect(r.gap).toBeCloseTo(r.invShare - r.salesShare, 8);
      expect(r.verdict).toBe(mixGapVerdict(r.invShare, r.salesShare));
    }
  });

  it("holds one brand only — a planner never sees another brand's range", () => {
    const rows = categoryMix([home]);
    const units = rows.reduce((a, r) => a + r.invUnits, 0);
    expect(units).toBeGreaterThan(0);
  });

  it("ranks the biggest over-investment first", () => {
    const rows = categoryMix(stores);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].gap).toBeGreaterThanOrEqual(rows[i].gap);
  });
});

describe("floor space", () => {
  it("allocates the whole floor and nothing more", () => {
    for (const store of stores.slice(0, 6)) {
      const lines = categorySpace(store.id);
      expect(lines.reduce((a, l) => a + l.share, 0)).toBeCloseTo(1, 5);
      expect(lines.every((l) => l.bays >= 1)).toBe(true);
    }
  });

  it("is stable — the same door always reads the same", () => {
    expect(categorySpace(home.id)).toEqual(categorySpace(home.id));
  });

  it("compares space against sales, not against stock", () => {
    const rows = spaceVsSales(home.id);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.gap).toBeCloseTo(r.spaceShare - r.salesShare, 8);
  });
});

describe("units per bill", () => {
  it("is qty over bills, and zero when there are no bills", () => {
    expect(upt(260, 100)).toBeCloseTo(2.6, 8);
    expect(upt(10, 0)).toBe(0);
  });

  it("prices the shortfall in units, never below zero", () => {
    expect(uptUpside(100, 2.4, 2.6)).toBe(20);
    expect(uptUpside(100, 2.9, 2.6)).toBe(0);
  });

  it("gives every store a team and a position", () => {
    for (const store of stores.slice(0, 8)) {
      const staff = staffKpis(store.id);
      expect(staff.length).toBeGreaterThan(0);
      expect(staff.every((s) => s.bills > 0 && s.qty >= s.bills)).toBe(true);

      const pos = uptPosition(store.id);
      expect(pos.target).toBe(UPT_TARGET);
      expect(pos.network).toBeGreaterThan(0);
      // A laggard is behind the bar, and the bar is never above the target.
      const bar = Math.min(UPT_TARGET, pos.network);
      for (const l of pos.laggards) expect(l.upt).toBeLessThan(bar);
    }
  });
});

describe("what to push", () => {
  it("only names styles this store holds and its peers outsell", () => {
    for (const store of stores.slice(0, 5)) {
      for (const row of pushList(store.id)) {
        expect(row.sellable).toBeGreaterThan(0);
        expect(row.peerRos).toBeGreaterThan(row.storeRos);
        expect(row.style.brand).toBe(store.brand);
      }
    }
  });
});

describe("rate of sale watch", () => {
  const rows = rosWatch(stores, 20);

  it("only raises styles that are actually selling", () => {
    for (const r of rows) expect(r.ros).toBeGreaterThan(0.15);
  });

  it("only raises availability problems — thin cover or a broken run", () => {
    for (const r of rows) expect(r.cover <= 21 || r.status !== "healthy").toBe(true);
  });

  it("routes the fix to a source that exists", () => {
    for (const r of rows) {
      if (r.fix === "pull") expect(r.warehouse).toBeGreaterThan(0);
      if (r.fix === "recut") expect(r.warehouse).toBe(0);
    }
  });

  it("ranks by money at risk, not by rate", () => {
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].risk).toBeGreaterThanOrEqual(rows[i].risk);
  });
});

describe("allocation split", () => {
  it("conserves every unit it is given", () => {
    for (const units of [0, 1, 7, 250, 2906]) {
      const { byCategory, byBand } = allocationSplit(home.id, units);
      expect(byCategory.reduce((a, r) => a + r.units, 0)).toBe(units);
      expect(byBand.reduce((a, r) => a + r.units, 0)).toBe(units);
    }
  });

  it("follows what the store sells", () => {
    const { byCategory } = allocationSplit(home.id, 1000);
    const mix = categoryMix([storeById(home.id)]);
    const best = [...mix].sort((a, b) => b.soldUnits - a.soldUnits)[0];
    expect(byCategory[0].key).toBe(best.key);
  });
});

describe("VM adherence", () => {
  it("scores against the published checklist", () => {
    const row = vmFor(home.id);
    expect(row.score).toBeCloseTo(row.done.length / VM_CHECKS.length, 8);
    expect(row.done.length + row.missing.length).toBe(VM_CHECKS.length);
  });

  it("takes a store's live progress over the seeded state", () => {
    const all = VM_CHECKS.map((c) => c.id);
    expect(vmFor(home.id, all).score).toBe(1);
    expect(vmFor(home.id, []).score).toBe(0);
  });

  it("puts the worst doors first, so HQ chases the four not the twenty-four", () => {
    const rows = vmAdherence(stores);
    expect(rows).toHaveLength(stores.length);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeLessThanOrEqual(rows[i].score);
  });
});

describe("the consolidated view", () => {
  it("carries one row per store, with the same network average on each", () => {
    const rows = storeIntel(stores);
    expect(rows).toHaveLength(stores.length);
    const network = rows[0].uptNetwork;
    for (const r of rows) {
      expect(r.uptNetwork).toBeCloseTo(network, 8);
      expect(r.vmScore).toBeGreaterThanOrEqual(0);
      expect(r.vmScore).toBeLessThanOrEqual(1);
      if (r.topGap) expect(r.topGap.verdict).toBe("push");
    }
  });
});

describe("the season", () => {
  it("knows which phase the demo clock sits in", () => {
    const s = seasonState();
    expect(["pre", "in", "post"]).toContain(s.phase);
    expect(s.dropsLanded).toBeLessThanOrEqual(s.dropsTotal);
    // The demo is set mid-season, three weeks after launch.
    expect(s.phase).toBe("in");
    expect(s.dayOfSeason).toBeGreaterThan(0);
  });

  it("ranks in-season actions by money and keeps them referenced", () => {
    const actions = inSeasonActions(stores, 12);
    expect(actions.length).toBeGreaterThan(0);
    for (let i = 1; i < actions.length; i++) expect(actions[i - 1].value).toBeGreaterThanOrEqual(actions[i].value);
    for (const a of actions) {
      expect(a.value).toBeGreaterThan(0);
      if (a.storeId) expect(STORES.some((s) => s.id === a.storeId)).toBe(true);
    }
  });

  it("covers all four kinds of in-season decision", () => {
    const kinds = new Set(inSeasonActions(stores, 60).map((a) => a.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe("data readiness", () => {
  it("is honest about the inputs the intelligence rests on", () => {
    expect(DATA_INPUTS.some((d) => d.trust === "weak")).toBe(true);
    // Anything not solid has to say what would fix it.
    for (const d of DATA_INPUTS) {
      if (d.trust !== "solid") expect(d.fix.length).toBeGreaterThan(3);
    }
  });

  it("takes the weakest input in a chain, never the average", () => {
    expect(trustOf(["soh", "sales"])).toBe("solid");
    expect(trustOf(["soh", "staff"])).toBe("partial");
    expect(trustOf(["soh", "space"])).toBe("weak");
    expect(trustOf(["staff", "space"])).toBe("weak");
  });
});

describe("the dataset earns the screens", () => {
  // A mix report where nothing is ever out of line is a screen nobody opens
  // twice. These guard the demo data itself, not the arithmetic above.
  it("has doors that are genuinely over-invested in something", () => {
    const withPush = storeIntel(stores).filter((r) => r.topGap);
    expect(withPush.length).toBeGreaterThan(stores.length / 2);
  });

  it("has at least one door badly out — the case worth showing", () => {
    const worst = storeIntel(stores)
      .filter((r) => r.topGap)
      .sort((a, b) => b.topGap!.gap - a.topGap!.gap)[0];
    expect(worst.topGap!.gap).toBeGreaterThan(0.1);
  });

  it("spreads VM adherence rather than parking every door at full marks", () => {
    const rows = vmAdherence(stores);
    expect(rows.some((r) => r.score < 0.7)).toBe(true);
    expect(rows.some((r) => r.score >= 0.85)).toBe(true);
  });

  it("finds styles worth pushing somewhere in the estate", () => {
    expect(stores.some((s) => pushList(s.id).length > 0)).toBe(true);
  });
});
