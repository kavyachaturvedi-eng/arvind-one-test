// ─────────────────────────────────────────────────────────────────────────────
// Offers, coupons and customer feedback. All published centrally by Commercial
// and the campaign team; the store reads them, never writes them.
// Deterministic so every machine shows the same board.
// ─────────────────────────────────────────────────────────────────────────────

import { rng } from "./seed";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

export interface Offer {
  id: string;
  name: string;
  /** What the customer gets, in words a cashier can say out loud. */
  says: string;
  applies: string;
  endsIn: string;
  kind: "Bundle" | "Brand" | "Loyalty" | "Bank" | "Clearance";
  /** Cashier note: the one thing people get wrong about this offer. */
  note?: string;
}

export const OFFERS: Offer[] = [
  {
    id: "OF-1",
    name: "Buy 2 shirts, save 20%",
    says: "Take any second shirt and 20% comes off the higher-priced one.",
    applies: "All Arrow and USPA shirts, full price only",
    endsIn: "6 days left",
    kind: "Bundle",
    note: "Does not stack with a coupon. The till picks whichever saves more.",
  },
  {
    id: "OF-2",
    name: "Denim festival: flat ₹1,000 off",
    says: "₹1,000 off any denim above ₹4,999.",
    applies: "Flying Machine and Tommy denim",
    endsIn: "Ends Sunday",
    kind: "Brand",
  },
  {
    id: "OF-3",
    name: "Platinum double points",
    says: "Platinum members earn twice the points this week.",
    applies: "Platinum tier, any bill",
    endsIn: "3 days left",
    kind: "Loyalty",
    note: "Applies automatically once the member is on the bill.",
  },
  {
    id: "OF-4",
    name: "HDFC card: 10% instant discount",
    says: "10% off, up to ₹1,500, on HDFC credit cards.",
    applies: "Bills above ₹4,000, card payment only",
    endsIn: "Till month end",
    kind: "Bank",
    note: "The terminal applies it. Do not discount at the till as well.",
  },
  {
    id: "OF-5",
    name: "End of season: up to 40% off",
    says: "Marked EOSS racks carry their ticket price. No further discount.",
    applies: "EOSS tagged styles only",
    endsIn: "Ongoing",
    kind: "Clearance",
    note: "EOSS items do not earn points and cannot be exchanged after 7 days.",
  },
];

export interface Coupon {
  code: string;
  label: string;
  kind: "percent" | "flat";
  value: number;
  minBill: number;
  /** Reason the till would refuse it. */
  blocked?: string;
}

export const COUPONS: Coupon[] = [
  { code: "WELCOME200", label: "₹200 off the first bill", kind: "flat", value: 200, minBill: 1999 },
  { code: "FESTIVE10", label: "10% off, festive campaign", kind: "percent", value: 10, minBill: 2999 },
  { code: "BIRTHDAY500", label: "₹500 birthday voucher", kind: "flat", value: 500, minBill: 2499 },
  { code: "APPFIRST15", label: "15% off, app first purchase", kind: "percent", value: 15, minBill: 3999 },
  { code: "EXPIRED50", label: "Campaign closed on 31 July", kind: "flat", value: 50, minBill: 0, blocked: "This code expired on 31 July." },
];

/** What a coupon takes off a given bill, and why it might not apply. */
export function applyCoupon(code: string, billValue: number): { ok: boolean; amount: number; message: string; coupon?: Coupon } {
  const c = COUPONS.find((x) => x.code === code.trim().toUpperCase());
  if (!c) return { ok: false, amount: 0, message: "No such code. Check the customer's message again." };
  if (c.blocked) return { ok: false, amount: 0, message: c.blocked, coupon: c };
  if (billValue < c.minBill) {
    return { ok: false, amount: 0, message: `Needs a bill of ₹${c.minBill.toLocaleString("en-IN")} or more.`, coupon: c };
  }
  const amount = c.kind === "flat" ? c.value : Math.round((billValue * c.value) / 100);
  return { ok: true, amount, message: `${c.label} applied.`, coupon: c };
}

// ── Customer feedback, collected by the campaign team after each visit ───────

export interface FeedbackEntry {
  when: string;
  rating: number;
  comment: string;
}

export interface FeedbackSummary {
  average: number;
  count: number;
  entries: FeedbackEntry[];
}

const COMMENTS_GOOD = [
  "Staff helped me find my size quickly.",
  "Trial room was clean, billing was fast.",
  "Got a call when my size came in. Nice touch.",
];
const COMMENTS_MIXED = [
  "Good store, but the queue at billing was long.",
  "Wanted a size 32, had to be ordered.",
  "Offer was not explained clearly at the counter.",
];
const COMMENTS_POOR = [
  "Waited fifteen minutes at the counter.",
  "Exchange took two visits to sort out.",
];

/** Their feedback history, keyed off the phone number so it never shifts. */
export function feedbackFor(phone: string): FeedbackSummary | null {
  const h = hash("fb" + phone);
  if (h % 5 === 0) return null; // never left feedback
  const r = rng(h);
  const n = 1 + Math.floor(r() * 3);
  const entries: FeedbackEntry[] = Array.from({ length: n }, (_, i) => {
    const rating = 1 + Math.floor(r() * 5);
    const pool = rating >= 4 ? COMMENTS_GOOD : rating === 3 ? COMMENTS_MIXED : COMMENTS_POOR;
    return {
      when: ["Last visit", "3 weeks ago", "2 months ago"][i] ?? "Earlier",
      rating,
      comment: pool[Math.floor(r() * pool.length)],
    };
  });
  const average = entries.reduce((a, e) => a + e.rating, 0) / entries.length;
  return { average: Math.round(average * 10) / 10, count: entries.length, entries };
}
