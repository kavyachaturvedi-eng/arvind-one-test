import { describe, expect, it } from "vitest";
import {
  CARTON_MIN_UNITS,
  OUTWARD_CODE_LIMIT,
  classifyCancellation,
  classifyCashDelta,
  coverDays,
  demandUnderstatement,
  distanceKm,
  evaluateIstPolicy,
  inr,
  markdownExposure,
  naiveRos,
  pct,
  replenishmentDecision,
  sellThrough,
  sellThroughUplift,
  sizeSetHealth,
  slaState,
  splitOutward,
  ticketSlaHours,
  trueRos,
  validateOutward,
  type IstPolicyInput,
} from "../lib/rules";
import type { Size } from "../lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// True rate of sale — the metric the whole replenishment argument rests on
// ─────────────────────────────────────────────────────────────────────────────

describe("trueRos", () => {
  it("divides full-price units by days genuinely in stock", () => {
    expect(trueRos({ sold28: 28, soldOnMarkdown28: 0, inStockDays: 28 })).toBeCloseTo(1);
    expect(trueRos({ sold28: 14, soldOnMarkdown28: 0, inStockDays: 14 })).toBeCloseTo(1);
  });

  it("excludes markdown units from the numerator", () => {
    expect(trueRos({ sold28: 20, soldOnMarkdown28: 10, inStockDays: 10 })).toBeCloseTo(1);
  });

  it("never divides by zero when a SKU was never in stock", () => {
    expect(Number.isFinite(trueRos({ sold28: 0, soldOnMarkdown28: 0, inStockDays: 0 }))).toBe(true);
    expect(trueRos({ sold28: 0, soldOnMarkdown28: 0, inStockDays: 0 })).toBe(0);
  });

  it("never returns a negative rate when markdown units exceed total units", () => {
    expect(trueRos({ sold28: 5, soldOnMarkdown28: 9, inStockDays: 10 })).toBe(0);
  });

  it("understatement: a SKU out of stock half the month reads twice as fast as the naive number", () => {
    const row = { sold28: 14, soldOnMarkdown28: 0, inStockDays: 14 };
    expect(naiveRos(row)).toBeCloseTo(0.5);
    expect(trueRos(row)).toBeCloseTo(1);
    expect(demandUnderstatement(row)).toBeCloseTo(2);
  });

  it("understatement is 1 when nothing sold, rather than exploding", () => {
    expect(demandUnderstatement({ sold28: 0, soldOnMarkdown28: 0, inStockDays: 28 })).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Size-set health
// ─────────────────────────────────────────────────────────────────────────────

describe("sizeSetHealth", () => {
  const style = { coreSizes: ["M", "L", "XL"] as Size[] };
  const row = (size: Size, onHand: number, reserved = 0) => ({ size, onHand, reserved });

  it("is healthy when every core size is on the floor", () => {
    const r = sizeSetHealth(style, [row("M", 4), row("L", 2), row("XL", 9), row("S", 0)]);
    expect(r.status).toBe("healthy");
    expect(r.missingCore).toEqual([]);
    expect(r.coverage).toBe(1);
  });

  it("is at risk when exactly one core size is gone", () => {
    const r = sizeSetHealth(style, [row("M", 4), row("L", 0), row("XL", 9)]);
    expect(r.status).toBe("at_risk");
    expect(r.missingCore).toEqual(["L"]);
  });

  it("is broken when two or more core sizes are gone", () => {
    const r = sizeSetHealth(style, [row("M", 0), row("L", 0), row("XL", 3)]);
    expect(r.status).toBe("broken");
    expect(r.missingCore).toEqual(["M", "L"]);
    expect(r.coverage).toBeCloseTo(1 / 3);
  });

  it("treats omni-reserved units as unavailable — this is the phantom-availability trap", () => {
    const r = sizeSetHealth(style, [row("M", 1, 1), row("L", 3), row("XL", 3)]);
    expect(r.status).toBe("at_risk");
    expect(r.missingCore).toEqual(["M"]);
  });

  it("handles a style with no stock rows at all", () => {
    const r = sizeSetHealth(style, []);
    expect(r.status).toBe("broken");
    expect(r.coverage).toBe(0);
  });

  it("handles a style with no declared core sizes", () => {
    const r = sizeSetHealth({ coreSizes: [] }, [row("M", 0)]);
    expect(r.status).toBe("healthy");
    expect(r.coverage).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cover and the replenishment decision
// ─────────────────────────────────────────────────────────────────────────────

describe("coverDays", () => {
  it("returns days of stock at the current rate", () => {
    expect(coverDays(20, 2)).toBe(10);
  });
  it("returns 0 when there is nothing to sell", () => {
    expect(coverDays(0, 0)).toBe(0);
  });
  it("returns a sentinel rather than Infinity for dead stock", () => {
    expect(coverDays(12, 0)).toBe(999);
  });
});

describe("replenishmentDecision", () => {
  const base = {
    sellable: 4,
    ros: 1,
    dcAvailable: 0,
    peerExcess: 0,
    daysLeftInWindow: 60,
    sizeSet: "healthy" as const,
    isNOS: false,
  };

  it("holds when cover is already inside the target band", () => {
    expect(replenishmentDecision({ ...base, sellable: 40 }).action).toBe("hold");
  });

  it("prefers the warehouse over a peer store when both can supply", () => {
    const d = replenishmentDecision({ ...base, dcAvailable: 100, peerExcess: 100 });
    expect(d.action).toBe("replenish_from_dc");
    expect(d.units).toBeGreaterThan(0);
  });

  it("falls back to a transfer when the warehouse is short", () => {
    const d = replenishmentDecision({ ...base, dcAvailable: 0, peerExcess: 6 });
    expect(d.action).toBe("transfer_in");
    expect(d.units).toBeLessThanOrEqual(6);
  });

  it("says stop featuring when the set is broken and there is no supply anywhere", () => {
    const d = replenishmentDecision({ ...base, sizeSet: "broken" });
    expect(d.action).toBe("stop_sell");
  });

  it("pulls back slow stock late in the window instead of letting it become markdown", () => {
    const d = replenishmentDecision({ ...base, sellable: 60, ros: 0.05, daysLeftInWindow: 5 });
    expect(d.action).toBe("pull_back");
    expect(d.units).toBeGreaterThan(0);
  });

  it("never pulls back a never-out-of-stock core style", () => {
    const d = replenishmentDecision({ ...base, sellable: 60, ros: 0.05, daysLeftInWindow: 5, isNOS: true });
    expect(d.action).not.toBe("pull_back");
  });

  it("never recommends more units than a donor actually has", () => {
    const d = replenishmentDecision({ ...base, sellable: 0, ros: 5, peerExcess: 2 });
    expect(d.units).toBeLessThanOrEqual(2);
  });

  it("always returns a confidence between 0 and 1", () => {
    for (const sizeSet of ["healthy", "at_risk", "broken"] as const) {
      for (const dc of [0, 50]) {
        const d = replenishmentDecision({ ...base, sizeSet, dcAvailable: dc });
        expect(d.confidence).toBeGreaterThan(0);
        expect(d.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inter-store transfer policy — the flagship rule
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateIstPolicy", () => {
  const ok: IstPolicyInput = {
    qty: 1,
    donorSellable: 6,
    donorFillRate: 1.02,
    donorRos: 0.2,
    requesterRos: 0.9,
    distanceKm: 8,
    donorSaleable: true,
    hourOfDay: 9,
    customerWaiting: true,
    autoApproveMaxQty: 3,
    duplicateOpen: false,
  };

  it("auto-approves the clean save-the-sale case", () => {
    const r = evaluateIstPolicy(ok);
    expect(r.outcome).toBe("auto_approved");
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.slaHours).toBe(24);
  });

  it("blocks when the donor does not have the units", () => {
    const r = evaluateIstPolicy({ ...ok, qty: 9 });
    expect(r.outcome).toBe("blocked");
    expect(r.checks.find((c) => c.rule === "Donor has sellable stock")!.passed).toBe(false);
  });

  it("blocks a defective unit outright", () => {
    expect(evaluateIstPolicy({ ...ok, donorSaleable: false }).outcome).toBe("blocked");
  });

  it("blocks a duplicate request on the same lane", () => {
    expect(evaluateIstPolicy({ ...ok, duplicateOpen: true }).outcome).toBe("blocked");
  });

  it("gates rather than blocks when the donor is below its norm floor and sells it as fast", () => {
    const r = evaluateIstPolicy({ ...ok, donorFillRate: 0.6, donorRos: 1.5, requesterRos: 0.5 });
    expect(r.outcome).toBe("needs_approval");
  });

  it("does not gate a low-fill donor when the requester genuinely sells it faster", () => {
    const r = evaluateIstPolicy({ ...ok, donorFillRate: 0.6, donorRos: 0.1, requesterRos: 2 });
    expect(r.outcome).toBe("auto_approved");
  });

  it("gates a transfer outside the 40 km same-day lane", () => {
    expect(evaluateIstPolicy({ ...ok, distanceKm: 400 }).outcome).toBe("needs_approval");
  });

  it("gates a quantity above the store ceiling", () => {
    expect(evaluateIstPolicy({ ...ok, qty: 3, autoApproveMaxQty: 3 }).outcome).toBe("auto_approved");
    expect(evaluateIstPolicy({ ...ok, qty: 4, autoApproveMaxQty: 3, donorSellable: 20 }).outcome).toBe("needs_approval");
  });

  it("treats the 11:00 cut-off as advisory, not as a gate", () => {
    const r = evaluateIstPolicy({ ...ok, hourOfDay: 15 });
    expect(r.outcome).toBe("auto_approved");
    expect(r.slaHours).toBe(36);
    expect(r.checks.find((c) => c.rule.includes("11:00"))!.severity).toBe("info");
  });

  it("blocking beats gating — a defective unit far away is blocked, not queued for approval", () => {
    expect(evaluateIstPolicy({ ...ok, donorSaleable: false, distanceKm: 400 }).outcome).toBe("blocked");
  });

  it("always beats the legacy process on elapsed time", () => {
    const r = evaluateIstPolicy(ok);
    expect(r.slaHours).toBeLessThan(r.legacyHours);
  });

  it("explains every check in plain language", () => {
    for (const c of evaluateIstPolicy(ok).checks) {
      expect(c.detail.length).toBeGreaterThan(10);
      expect(["blocking", "gate", "info"]).toContain(c.severity);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Outward batching
// ─────────────────────────────────────────────────────────────────────────────

describe("splitOutward", () => {
  it("splits 2,500 units into nine codes without a human doing arithmetic nine times", () => {
    const codes = splitOutward(2500, "OB-1");
    expect(codes).toHaveLength(9);
    expect(codes.reduce((a, c) => a + c.units, 0)).toBe(2500);
  });

  it("never exceeds the 300-unit transfer code ceiling", () => {
    for (const total of [1, 299, 300, 301, 2500, 9999]) {
      for (const c of splitOutward(total)) expect(c.units).toBeLessThanOrEqual(OUTWARD_CODE_LIMIT);
    }
  });

  it("conserves the total across every input", () => {
    for (const total of [1, 29, 30, 31, 300, 1200, 2500, 7777]) {
      expect(splitOutward(total).reduce((a, c) => a + c.units, 0)).toBe(total);
    }
  });

  it("returns nothing for zero or negative input rather than throwing", () => {
    expect(splitOutward(0)).toEqual([]);
    expect(splitOutward(-50)).toEqual([]);
  });

  it("never plans a carton below the 30-unit minimum when the code can support it", () => {
    for (const total of [30, 61, 300, 2500]) {
      for (const c of splitOutward(total)) {
        expect(c.units / c.cartons).toBeGreaterThanOrEqual(CARTON_MIN_UNITS);
      }
    }
  });

  it("still produces a single carton for a very small batch", () => {
    const codes = splitOutward(5);
    expect(codes).toHaveLength(1);
    expect(codes[0].cartons).toBe(1);
  });

  it("prefixes codes with the batch id so they are traceable", () => {
    expect(splitOutward(700, "OB-42")[0].code).toBe("OB-42-C01");
  });
});

describe("validateOutward", () => {
  const codes = splitOutward(600, "OB-9");

  it("passes a fully compliant batch", () => {
    expect(validateOutward({ codes, videoProof: true, lrNumber: "LR-1" })).toEqual([]);
  });

  it("refuses to dispatch without packing video — shortage claims would not be admissible", () => {
    expect(validateOutward({ codes, videoProof: false, lrNumber: "LR-1" })).toContain(
      "Packing video not captured — shortage claims will not be admissible."
    );
  });

  it("refuses to dispatch without an LR copy", () => {
    expect(validateOutward({ codes, videoProof: true }).some((e) => e.includes("LR copy"))).toBe(true);
  });

  it("refuses an empty batch", () => {
    expect(validateOutward({ codes: [], videoProof: true, lrNumber: "LR-1" })[0]).toMatch(/empty/i);
  });

  it("catches a hand-edited code above the ceiling", () => {
    const bad = [{ code: "X", units: 500, cartons: 5, weightKg: 10, packed: false }];
    expect(validateOutward({ codes: bad, videoProof: true, lrNumber: "LR-1" }).some((e) => e.includes("300-unit"))).toBe(true);
  });

  it("reports every violation at once rather than one at a time", () => {
    expect(validateOutward({ codes: [], videoProof: false }).length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SLA and escalation
// ─────────────────────────────────────────────────────────────────────────────

describe("slaState", () => {
  const now = 1_000_000_000_000;
  const h = 3_600_000;

  it("stays with the store manager inside the service level", () => {
    const s = slaState(now - 2 * h, 48, now);
    expect(s.breached).toBe(false);
    expect(s.level).toBe(0);
    expect(s.levelLabel).toBe("Store Manager");
    expect(s.remainingLabel).toContain("left");
  });

  it("escalates to the area manager the moment the SLA is breached", () => {
    const s = slaState(now - 49 * h, 48, now);
    expect(s.breached).toBe(true);
    expect(s.level).toBe(1);
    expect(s.remainingLabel).toContain("over");
  });

  it("climbs the ladder as the breach deepens", () => {
    expect(slaState(now - 70 * h, 48, now).level).toBe(2);
    expect(slaState(now - 100 * h, 48, now).level).toBe(3);
    expect(slaState(now - 100 * h, 48, now).levelLabel).toBe("Head Office");
  });

  it("handles a ticket raised in the future without going negative", () => {
    expect(slaState(now + 5 * h, 48, now).elapsedHours).toBe(0);
  });

  it("treats a zero-hour SLA as immediately breached rather than dividing by zero", () => {
    const s = slaState(now - h, 0, now);
    expect(s.breached).toBe(true);
    expect(Number.isFinite(s.pctConsumed)).toBe(true);
  });

  it("prices each ticket class the way the business talks about it", () => {
    expect(ticketSlaHours("safety")).toBeLessThan(ticketSlaHours("it"));
    expect(ticketSlaHours("it")).toBeLessThan(ticketSlaHours("tag_reprint"));
    expect(ticketSlaHours("tag_reprint")).toBeLessThan(ticketSlaHours("maintenance"));
    expect(ticketSlaHours("maintenance")).toBeLessThan(ticketSlaHours("vm"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancellation root cause — the post-mortem nobody currently produces
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyCancellation", () => {
  const base = {
    systemStock: 1,
    physicallyFound: false,
    findMinutes: 4,
    findSlaMinutes: 10,
    damaged: false,
    reservedElsewhere: false,
    customerInitiated: false,
  };

  it("does not penalise the store when the customer cancelled", () => {
    const r = classifyCancellation({ ...base, customerInitiated: true });
    expect(r.cause).toBe("customer_cancelled");
    expect(r.correctiveAction).toMatch(/no accuracy penalty/i);
  });

  it("identifies phantom stock and prescribes writing the SKU to zero", () => {
    const r = classifyCancellation(base);
    expect(r.cause).toBe("phantom_stock");
    expect(r.correctiveAction).toMatch(/zero/i);
  });

  it("identifies a double allocation", () => {
    expect(classifyCancellation({ ...base, reservedElsewhere: true }).cause).toBe("reserved_conflict");
  });

  it("identifies damage before it identifies a search failure", () => {
    expect(classifyCancellation({ ...base, damaged: true, findMinutes: 40 }).cause).toBe("damaged");
  });

  it("calls a slow search an SLA breach when the stock was actually there", () => {
    const r = classifyCancellation({ ...base, systemStock: 1, physicallyFound: true, findMinutes: 25 });
    expect(r.cause).toBe("sla_breach");
    expect(r.correctiveAction).toMatch(/re-route/i);
  });

  it("falls back to unfindable when the record was right and time was not the issue", () => {
    expect(classifyCancellation({ ...base, physicallyFound: true, findMinutes: 2 }).cause).toBe("unfindable");
  });

  it("always returns a narrative and a corrective action", () => {
    const inputs = [base, { ...base, damaged: true }, { ...base, customerInitiated: true }, { ...base, reservedElsewhere: true }];
    for (const i of inputs) {
      const r = classifyCancellation(i);
      expect(r.narrative.length).toBeGreaterThan(10);
      expect(r.correctiveAction.length).toBeGreaterThan(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sell-through and the margin model
// ─────────────────────────────────────────────────────────────────────────────

describe("sell-through maths", () => {
  it("is a plain ratio", () => {
    expect(sellThrough(75, 100)).toBeCloseTo(0.75);
  });

  it("returns 0 rather than NaN when nothing was received", () => {
    expect(sellThrough(10, 0)).toBe(0);
  });

  it("prices markdown exposure at expected depth", () => {
    expect(markdownExposure({ residualUnits: 100, mrp: 4000, expectedDepth: 0.4 })).toBe(160_000);
  });

  it("returns zero uplift when the target is at or below today's performance", () => {
    const r = sellThroughUplift({
      currentSellThrough: 0.8,
      targetSellThrough: 0.74,
      seasonUnits: 100_000,
      averageMrp: 3500,
      markdownDepth: 0.38,
      grossMargin: 0.55,
    });
    expect(r.unitsMoved).toBe(0);
    expect(r.marginUnlocked).toBe(0);
  });

  it("scales linearly with the sell-through gap", () => {
    const args = { currentSellThrough: 0.74, seasonUnits: 100_000, averageMrp: 3500, markdownDepth: 0.38, grossMargin: 0.55 };
    const four = sellThroughUplift({ ...args, targetSellThrough: 0.78 });
    const eight = sellThroughUplift({ ...args, targetSellThrough: 0.82 });
    expect(eight.unitsMoved).toBeCloseTo(four.unitsMoved * 2, -1);
  });

  it("never claims more margin than markdown avoided", () => {
    const r = sellThroughUplift({
      currentSellThrough: 0.74,
      targetSellThrough: 0.86,
      seasonUnits: 100_000,
      averageMrp: 3500,
      markdownDepth: 0.38,
      grossMargin: 0.55,
    });
    expect(r.marginUnlocked).toBeLessThanOrEqual(r.markdownAvoided);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cash reconciliation
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyCashDelta", () => {
  const base = { delta: -1000, hasDepositSlip: false, lodgedAfterCutoff: false, matchesFeeSchedule: false, ageHours: 2 };

  it("clears an acquirer fee automatically at high confidence", () => {
    const r = classifyCashDelta({ ...base, matchesFeeSchedule: true });
    expect(r.status).toBe("auto_cleared");
    expect(r.confidence).toBeGreaterThan(0.95);
  });

  it("clears a bank timing difference when the deposit slip proves it", () => {
    expect(classifyCashDelta({ ...base, hasDepositSlip: true, lodgedAfterCutoff: true }).status).toBe("auto_cleared");
  });

  it("escalates a large unevidenced gap", () => {
    expect(classifyCashDelta({ ...base, delta: -6000 }).status).toBe("escalated");
  });

  it("asks for a human on a small ageing gap rather than escalating it", () => {
    expect(classifyCashDelta({ ...base, delta: -900, ageHours: 20 }).status).toBe("needs_review");
  });

  it("treats a surplus as seriously as a shortage", () => {
    expect(classifyCashDelta({ ...base, delta: 7000 }).status).toBe("escalated");
  });

  it("never returns a confidence outside 0–1", () => {
    const combos = [true, false].flatMap((a) => [true, false].map((b) => ({ ...base, hasDepositSlip: a, matchesFeeSchedule: b })));
    for (const c of combos) {
      const r = classifyCashDelta(c);
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

describe("formatting", () => {
  it("uses the Indian crore and lakh scale", () => {
    expect(inr(42_00_000, { compact: true })).toBe("₹42 L");
    expect(inr(3_50_00_000, { compact: true })).toBe("₹3.50 Cr");
    expect(inr(4500, { compact: true })).toBe("₹5k");
  });

  it("groups full figures the Indian way", () => {
    expect(inr(1234567)).toMatch(/12,34,567/);
  });

  it("handles zero and negatives without breaking", () => {
    expect(inr(0, { compact: true })).toBe("₹0");
    expect(inr(-250000, { compact: true })).toBe("₹-2.5 L");
  });

  it("formats percentages at the requested precision", () => {
    expect(pct(0.7534)).toBe("75%");
    expect(pct(0.7534, 1)).toBe("75.3%");
  });
});

describe("distanceKm", () => {
  it("is zero for the same point and symmetric", () => {
    expect(distanceKm({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    expect(distanceKm({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(distanceKm({ x: 3, y: 4 }, { x: 0, y: 0 }));
  });
  it("grows with separation", () => {
    expect(distanceKm({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeGreaterThan(distanceKm({ x: 0, y: 0 }, { x: 2, y: 0 }));
  });
});
