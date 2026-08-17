// ─────────────────────────────────────────────────────────────────────────────
// Pure decision rules. No data imports, no React, no clock reads.
//
// Everything here is unit-tested in tests/rules.test.ts. These are the rules a
// client can argue with — which is exactly why they are written down as code
// rather than buried in a slide.
// ─────────────────────────────────────────────────────────────────────────────

import type { OutwardCode, PolicyCheck, Size, StockRow, Style, Ticket } from "./types";

// ── True rate of sale ────────────────────────────────────────────────────────

/**
 * Naive ROS divides by the whole period, so every stockout day silently
 * suppresses demand and the replenishment engine learns to under-buy its own
 * winners. True ROS divides only by the days the SKU was genuinely available at
 * full price.
 */
export function trueRos(row: Pick<StockRow, "sold28" | "soldOnMarkdown28" | "inStockDays">): number {
  const fullPriceUnits = Math.max(0, row.sold28 - row.soldOnMarkdown28);
  const days = Math.max(1, row.inStockDays);
  return fullPriceUnits / days;
}

export function naiveRos(row: Pick<StockRow, "sold28">, periodDays = 28): number {
  return row.sold28 / periodDays;
}

/** How badly the naive number understates demand, as a multiplier. */
export function demandUnderstatement(row: Pick<StockRow, "sold28" | "soldOnMarkdown28" | "inStockDays">): number {
  const naive = naiveRos(row);
  if (naive <= 0) return 1;
  return trueRos(row) / naive;
}

// ── Size-set health ──────────────────────────────────────────────────────────

export type SizeSetStatus = "healthy" | "at_risk" | "broken";

export interface SizeSetResult {
  status: SizeSetStatus;
  missingCore: Size[];
  presentCore: Size[];
  coverage: number;
}

/**
 * A style is only really "in stock" if a customer can find their size. One core
 * size gone = at risk. Two or more gone = broken; the remaining sizes will sit
 * on the floor and end up marked down.
 */
export function sizeSetHealth(style: Pick<Style, "coreSizes">, rows: Pick<StockRow, "size" | "onHand" | "reserved">[]): SizeSetResult {
  const available = new Set(
    rows.filter((r) => Math.max(0, r.onHand - r.reserved) > 0).map((r) => r.size)
  );
  const presentCore = style.coreSizes.filter((s) => available.has(s));
  const missingCore = style.coreSizes.filter((s) => !available.has(s));
  const coverage = style.coreSizes.length === 0 ? 1 : presentCore.length / style.coreSizes.length;
  const status: SizeSetStatus = missingCore.length === 0 ? "healthy" : missingCore.length === 1 ? "at_risk" : "broken";
  return { status, missingCore, presentCore, coverage };
}

// ── Cover and replenishment decision ─────────────────────────────────────────

export function coverDays(sellable: number, ros: number): number {
  if (ros <= 0.0001) return sellable > 0 ? 999 : 0;
  return sellable / ros;
}

export type ReplenishAction = "replenish_from_dc" | "transfer_in" | "hold" | "stop_sell" | "pull_back";

export interface ReplenishDecision {
  action: ReplenishAction;
  reason: string;
  units: number;
  confidence: number;
}

/**
 * The decision the store manager actually needs, not the report they currently
 * download. Order of checks matters: warehouse first (cheapest), then a peer
 * store, then commercial containment.
 */
export function replenishmentDecision(input: {
  sellable: number;
  ros: number;
  dcAvailable: number;
  peerExcess: number;
  daysLeftInWindow: number;
  sizeSet: SizeSetStatus;
  isNOS: boolean;
}): ReplenishDecision {
  const { sellable, ros, dcAvailable, peerExcess, daysLeftInWindow, sizeSet, isNOS } = input;
  const cover = coverDays(sellable, ros);
  const target = Math.min(daysLeftInWindow, 21);
  const gap = Math.max(0, Math.ceil((target - cover) * ros));

  if (daysLeftInWindow <= 7 && !isNOS && cover > daysLeftInWindow * 2.5 && ros < 0.15) {
    return {
      action: "pull_back",
      reason: `Cover of ${cover.toFixed(0)} days against ${daysLeftInWindow} days left in the full-price window. Pull back before it becomes markdown.`,
      units: Math.max(0, Math.floor(sellable - ros * daysLeftInWindow)),
      confidence: 0.82,
    };
  }
  if (gap <= 0 && sizeSet === "healthy") {
    return { action: "hold", reason: `Cover of ${cover.toFixed(0)} days is inside the target band. No action.`, units: 0, confidence: 0.9 };
  }
  if (sizeSet !== "healthy" && dcAvailable <= 0 && peerExcess <= 0) {
    return {
      action: "stop_sell",
      reason: "Core sizes gone with no warehouse stock and no donor store. Stop featuring the style and re-space the fixture — leaving it out will not convert.",
      units: 0,
      confidence: 0.71,
    };
  }
  if (dcAvailable >= Math.max(1, gap)) {
    return {
      action: "replenish_from_dc",
      reason: `Warehouse holds ${dcAvailable} units. Replenishing ${Math.max(1, gap)} restores cover to ${target} days.`,
      units: Math.max(1, gap),
      confidence: 0.93,
    };
  }
  if (peerExcess > 0) {
    return {
      action: "transfer_in",
      reason: `Warehouse is short. ${peerExcess} units sit above norm at a donor store inside the transfer radius.`,
      units: Math.min(peerExcess, Math.max(1, gap)),
      confidence: 0.85,
    };
  }
  return {
    action: "hold",
    reason: "No supply anywhere in the network. Flagged to planning for the next buy.",
    units: 0,
    confidence: 0.6,
  };
}

// ── Inter-store transfer policy ──────────────────────────────────────────────

export interface IstPolicyInput {
  qty: number;
  /** Donor's sellable units of this SKU. */
  donorSellable: number;
  /** Donor's fill rate against norm, 1.0 = exactly at norm. */
  donorFillRate: number;
  /** Donor's True ROS for this SKU. */
  donorRos: number;
  /** Requesting store's True ROS for this SKU. */
  requesterRos: number;
  distanceKm: number;
  /** Is the donor unit flagged defective / non-saleable? */
  donorSaleable: boolean;
  /** Local hour of day, 0–23, at the donor store. */
  hourOfDay: number;
  /** Is a named customer waiting? */
  customerWaiting: boolean;
  /** Auto-approval ceiling in units. */
  autoApproveMaxQty: number;
  /** Is there already an open request for this SKU between these two stores? */
  duplicateOpen: boolean;
}

export interface IstPolicyResult {
  outcome: "auto_approved" | "needs_approval" | "blocked";
  checks: PolicyCheck[];
  slaHours: number;
  /** What the same request costs in the current email → IST-code process. */
  legacyHours: number;
}

/**
 * The single most valuable rule in the product: it converts a one-day email
 * round trip into a decision taken at the till while the customer is still in
 * the store. Every check is explicit so planning can tune the policy rather
 * than veto the idea.
 */
export function evaluateIstPolicy(i: IstPolicyInput): IstPolicyResult {
  const checks: PolicyCheck[] = [];
  const add = (rule: string, passed: boolean, detail: string, severity: PolicyCheck["severity"]) =>
    checks.push({ rule, passed, detail, severity });

  add(
    "Donor has sellable stock",
    i.donorSellable >= i.qty,
    i.donorSellable >= i.qty
      ? `${i.donorSellable} sellable at the donor, ${i.qty} requested.`
      : `Donor shows only ${i.donorSellable} sellable against ${i.qty} requested.`,
    "blocking"
  );

  add(
    "Unit is in saleable condition",
    i.donorSaleable,
    i.donorSaleable ? "Not flagged defective, not staged for outward." : "Unit is flagged defective or already staged for outward — cannot be transferred.",
    "blocking"
  );

  add(
    "No duplicate request open",
    !i.duplicateOpen,
    i.duplicateOpen ? "An identical request between these two stores is already in flight." : "No open request for this SKU on this lane.",
    "blocking"
  );

  const donorProtected = i.donorFillRate < 0.85 && i.donorRos >= i.requesterRos;
  add(
    "Donor stays above its norm floor",
    !donorProtected,
    donorProtected
      ? `Donor is at ${(i.donorFillRate * 100).toFixed(0)}% of norm and sells this SKU at least as fast. Taking stock would move the problem, not solve it.`
      : `Donor at ${(i.donorFillRate * 100).toFixed(0)}% of norm; requester sells this SKU ${(i.requesterRos / Math.max(0.01, i.donorRos)).toFixed(1)}× faster.`,
    "gate"
  );

  const withinRadius = i.distanceKm <= 40;
  add(
    "Inside the transfer radius",
    withinRadius,
    withinRadius ? `${i.distanceKm.toFixed(0)} km — same-day courier lane.` : `${i.distanceKm.toFixed(0)} km — outside the 40 km same-day lane, needs planning sign-off.`,
    "gate"
  );

  const withinQty = i.qty <= i.autoApproveMaxQty;
  add(
    "Within the store's auto-approval ceiling",
    withinQty,
    withinQty ? `${i.qty} of ${i.autoApproveMaxQty} units allowed without central approval.` : `${i.qty} units exceeds the ${i.autoApproveMaxQty}-unit store ceiling.`,
    "gate"
  );

  const beforeCutoff = i.hourOfDay < 11;
  add(
    "Raised before the 11:00 pickup cut-off",
    beforeCutoff,
    beforeCutoff ? "Same-day pickup advice will be raised automatically." : "Past 11:00 — pickup moves to tomorrow's first slot.",
    "info"
  );

  const blocked = checks.some((c) => c.severity === "blocking" && !c.passed);
  const gated = checks.some((c) => c.severity === "gate" && !c.passed);

  const outcome: IstPolicyResult["outcome"] = blocked ? "blocked" : gated ? "needs_approval" : "auto_approved";
  const slaHours = outcome === "auto_approved" ? (beforeCutoff ? 24 : 36) : 48;

  return { outcome, checks, slaHours, legacyHours: i.customerWaiting ? 26 : 34 };
}

// ── Outward / RTV batching ───────────────────────────────────────────────────

export const OUTWARD_CODE_LIMIT = 300;
export const CARTON_MIN_UNITS = 30;
export const CARTON_MAX_UNITS = 120;

/**
 * Today a 2,500-unit pullback is eight or more separate hand-keyed transactions
 * because a transfer code caps at 300 units. The cap is a system constraint, not
 * a business rule — so we keep the constraint and remove the labour.
 */
export function splitOutward(totalUnits: number, batchId = "OB"): OutwardCode[] {
  if (totalUnits <= 0) return [];
  const codes: OutwardCode[] = [];
  let remaining = totalUnits;
  let n = 1;
  while (remaining > 0) {
    const units = Math.min(OUTWARD_CODE_LIMIT, remaining);
    // Never leave a final carton below the 30-unit minimum: rebalance with the
    // previous code instead of shipping an invalid carton.
    let cartons = Math.max(1, Math.ceil(units / CARTON_MAX_UNITS));
    if (units / cartons < CARTON_MIN_UNITS) cartons = Math.max(1, Math.floor(units / CARTON_MIN_UNITS));
    codes.push({
      code: `${batchId}-C${String(n).padStart(2, "0")}`,
      units,
      cartons,
      weightKg: Math.round(units * 0.42 * 10) / 10,
      packed: false,
    });
    remaining -= units;
    n += 1;
  }
  return codes;
}

/** Guardrail the current process has no way to enforce before dispatch. */
export function validateOutward(batch: { codes: OutwardCode[]; videoProof: boolean; lrNumber?: string }): string[] {
  const errors: string[] = [];
  if (batch.codes.length === 0) errors.push("Nothing picked — the batch is empty.");
  if (batch.codes.some((c) => c.units > OUTWARD_CODE_LIMIT)) errors.push(`A transfer code exceeds the ${OUTWARD_CODE_LIMIT}-unit ceiling.`);
  if (batch.codes.some((c) => c.cartons > 0 && c.units / c.cartons < CARTON_MIN_UNITS))
    errors.push(`A carton is below the ${CARTON_MIN_UNITS}-unit minimum.`);
  if (!batch.videoProof) errors.push("Packing video not captured — shortage claims will not be admissible.");
  if (!batch.lrNumber) errors.push("No LR copy attached — handover to the transporter is not allowed.");
  return errors;
}

// ── Ticket SLA and escalation ────────────────────────────────────────────────

export interface SlaState {
  elapsedHours: number;
  pctConsumed: number;
  breached: boolean;
  /** 0 = Store Manager, 1 = Area Manager, 2 = Regional Manager, 3 = Head Office. */
  level: 0 | 1 | 2 | 3;
  levelLabel: string;
  remainingLabel: string;
}

const LEVEL_LABELS = ["Store Manager", "Area Manager", "Regional Manager", "Head Office"];

export function slaState(raisedAt: number, slaHours: number, now: number): SlaState {
  const elapsedHours = Math.max(0, (now - raisedAt) / 3_600_000);
  const pctConsumed = slaHours <= 0 ? 1 : elapsedHours / slaHours;
  const level: SlaState["level"] = pctConsumed >= 2 ? 3 : pctConsumed >= 1.4 ? 2 : pctConsumed >= 1 ? 1 : 0;
  const remaining = slaHours - elapsedHours;
  return {
    elapsedHours,
    pctConsumed,
    breached: pctConsumed >= 1,
    level,
    levelLabel: LEVEL_LABELS[level],
    remainingLabel:
      remaining >= 0
        ? `${remaining < 1 ? Math.round(remaining * 60) + "m" : Math.round(remaining) + "h"} left`
        : `${Math.round(-remaining) < 48 ? Math.round(-remaining) + "h" : Math.round(-remaining / 24) + "d"} over`,
  };
}

export function ticketSlaHours(kind: Ticket["kind"]): number {
  switch (kind) {
    case "it":
      return 8;
    case "tag_reprint":
      return 24;
    case "safety":
      return 4;
    case "maintenance":
      return 48;
    case "vm":
      return 72;
  }
}

// ── Omni cancellation root cause ─────────────────────────────────────────────

export type RootCause = "phantom_stock" | "unfindable" | "damaged" | "customer_cancelled" | "sla_breach" | "reserved_conflict";

/**
 * The post-mortem nobody produces today. Without it, the same store keeps
 * cancelling the same SKU and the stock file never gets corrected.
 */
export function classifyCancellation(input: {
  systemStock: number;
  physicallyFound: boolean;
  findMinutes: number;
  findSlaMinutes: number;
  damaged: boolean;
  reservedElsewhere: boolean;
  customerInitiated: boolean;
}): { cause: RootCause; narrative: string; correctiveAction: string } {
  if (input.customerInitiated)
    return {
      cause: "customer_cancelled",
      narrative: "Customer cancelled before handover. No inventory fault.",
      correctiveAction: "Return the unit to sellable stock on scan-in. No accuracy penalty for the store.",
    };
  if (input.damaged)
    return {
      cause: "damaged",
      narrative: "Unit located but not in saleable condition.",
      correctiveAction: "Move to the defective bin and adjust sellable stock immediately, so the next order does not route here.",
    };
  if (input.reservedElsewhere)
    return {
      cause: "reserved_conflict",
      narrative: "The same unit was reserved against a second order — a double allocation.",
      correctiveAction: "Reservation is now held at unit level, not style level. Re-route the second order automatically.",
    };
  if (input.systemStock > 0 && !input.physicallyFound)
    return {
      cause: "phantom_stock",
      narrative: `System showed ${input.systemStock} but nothing was on the floor or in the stockroom.`,
      correctiveAction: "Write the SKU to zero, raise a targeted count task for that bay, and add the SKU to the store's accuracy watch-list.",
    };
  if (input.findMinutes > input.findSlaMinutes)
    return {
      cause: "sla_breach",
      narrative: `Unit search ran ${input.findMinutes} minutes against a ${input.findSlaMinutes}-minute service level.`,
      correctiveAction: "Re-route to the next nearest node automatically rather than cancelling on the customer.",
    };
  return {
    cause: "unfindable",
    narrative: "Stock was accurate but the unit could not be located in time.",
    correctiveAction: "Bay-level location capture at inward so the next search starts in the right place.",
  };
}

// ── Sell-through and markdown exposure ───────────────────────────────────────

export function sellThrough(soldFullPrice: number, received: number): number {
  if (received <= 0) return 0;
  return soldFullPrice / received;
}

/**
 * The bridge the CEO conversation asked for: what a sell-through improvement is
 * actually worth in margin, and how much of it is currently leaking to markdown.
 */
export function markdownExposure(input: { residualUnits: number; mrp: number; expectedDepth: number }): number {
  return input.residualUnits * input.mrp * input.expectedDepth;
}

export function sellThroughUplift(input: {
  currentSellThrough: number;
  targetSellThrough: number;
  seasonUnits: number;
  averageMrp: number;
  markdownDepth: number;
  grossMargin: number;
}): { unitsMoved: number; marginUnlocked: number; markdownAvoided: number } {
  const delta = Math.max(0, input.targetSellThrough - input.currentSellThrough);
  const unitsMoved = Math.round(delta * input.seasonUnits);
  const markdownAvoided = unitsMoved * input.averageMrp * input.markdownDepth;
  const marginUnlocked = unitsMoved * input.averageMrp * input.grossMargin * input.markdownDepth;
  return { unitsMoved, marginUnlocked, markdownAvoided };
}

// ── Cash reconciliation ──────────────────────────────────────────────────────

export function classifyCashDelta(input: {
  delta: number;
  hasDepositSlip: boolean;
  lodgedAfterCutoff: boolean;
  matchesFeeSchedule: boolean;
  ageHours: number;
}): { status: "auto_cleared" | "needs_review" | "escalated"; confidence: number } {
  if (input.matchesFeeSchedule) return { status: "auto_cleared", confidence: 0.99 };
  if (input.hasDepositSlip && input.lodgedAfterCutoff) return { status: "auto_cleared", confidence: 0.97 };
  if (!input.hasDepositSlip && Math.abs(input.delta) >= 5000) return { status: "escalated", confidence: 0.41 };
  if (input.ageHours > 12) return { status: "needs_review", confidence: 0.55 };
  return { status: "needs_review", confidence: 0.6 };
}

// ── Geography ────────────────────────────────────────────────────────────────

/** Toy distance in km over the demo coordinate grid. */
export function distanceKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 1.9 * 10) / 10;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function inr(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} L`;
    if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(0)}k`;
    return `₹${Math.round(n)}`;
  }
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}
