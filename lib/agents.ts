// ─────────────────────────────────────────────────────────────────────────────
// The agentic layer. Five agents modelled on what the market ships in 2026:
// a till/associate assistant (Agentforce-style), autonomous replenishment and
// markdown agents with human-in-the-loop approvals (RELEX / Blue Yonder style),
// a Sidekick-style outreach agent, and a watchtower that reads the live
// execution stream. All deterministic — same data, same behaviour, every run.
// ─────────────────────────────────────────────────────────────────────────────

import { NOW, STYLES, rng, storeById } from "./seed";
import { sizeSetExceptions, vitalsFor } from "./engine";
import type { RoleId } from "./types";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

export type AgentId = "till" | "replenish" | "markdown" | "outreach" | "watchtower" | "festival" | "swap";

export interface AgentAction {
  at: number;
  label: string;
  kind: "did" | "suggested" | "flagged";
}

export interface AgentApproval {
  id: string;
  label: string;
  detail: string;
  impact: string;
}

export interface AgentDef {
  id: AgentId;
  name: string;
  tagline: string;
  glyph: string;
  /** Who sees this agent's board. */
  roles: RoleId[];
  /** What it is allowed to do alone vs what needs a human. */
  autonomy: string;
  watches: string;
  impactToday: string;
}

export const AGENTS: AgentDef[] = [
  {
    id: "till",
    name: "Till Assist",
    tagline: "Guided selling at the counter",
    glyph: "▣",
    roles: ["store", "staff"],
    autonomy: "Suggests only — the cashier decides",
    watches: "The open basket, live stock by size, the customer's history",
    impactToday: "+₹9,400 attach revenue",
  },
  {
    id: "replenish",
    name: "Replenishment Agent",
    tagline: "Keeps cover without being asked",
    glyph: "↺",
    roles: ["store", "planner"],
    autonomy: "Auto-raises pulls up to 40 units; larger moves need one approval",
    watches: "Rate of sale vs cover for every SKU, warehouse and peer-store stock",
    impactToday: "11 pulls raised · 2 awaiting approval",
  },
  {
    id: "markdown",
    name: "Markdown Agent",
    tagline: "Protects full-price sell-through",
    glyph: "%",
    roles: ["planner", "leadership"],
    autonomy: "Proposes only — pricing changes always need Planning",
    watches: "Sell-through vs the full-price window, cover vs days left, by style",
    impactToday: "3 proposals open · ₹4.1 L margin protected MTD",
  },
  {
    id: "outreach",
    name: "Outreach Agent",
    tagline: "Writes the customer contact of the day",
    glyph: "◐",
    roles: ["store", "staff", "planner"],
    autonomy: "Builds lists and drafts messages; a person taps send",
    watches: "Birthdays, lapsing members, expiring points, segment movement",
    impactToday: "8 drafts ready · 31% reply rate this week",
  },
  {
    id: "festival",
    name: "Festival Agent",
    tagline: "Moves stock to where the festival is",
    glyph: "✦",
    roles: ["store", "planner"],
    autonomy: "Suggests moves with the evidence; a person approves every one",
    watches: "The festival calendar and what each store sold this same week last year",
    impactToday: "3 moves suggested ahead of Onam & Raksha Bandhan",
  },
  {
    id: "swap",
    name: "Sister-Store Swap",
    tagline: "Slow here, selling fast there",
    glyph: "⇄",
    roles: ["store", "planner"],
    autonomy: "Suggests swaps between nearby stores; a person approves every one",
    watches: "The same style's rate of sale at every store that carries it",
    impactToday: "2 swaps suggested · ₹1.9 L stuck stock freed if approved",
  },
  {
    id: "watchtower",
    name: "Watchtower",
    tagline: "Reads the estate so leadership reads one paragraph",
    glyph: "◉",
    roles: ["planner", "leadership"],
    autonomy: "Flags and writes briefs; never acts",
    watches: "Every store's live execution stream against its own pattern",
    impactToday: "2 anomalies flagged · morning brief delivered 08:00",
  },
];

export function agentsFor(role: RoleId): AgentDef[] {
  return AGENTS.filter((a) => a.roles.includes(role));
}

// ── Activity — what each agent did today (deterministic) ─────────────────────

export function agentActivity(agentId: AgentId, storeId: string): AgentAction[] {
  const store = storeById(storeId);
  const min = (m: number) => NOW - m * 60_000;
  switch (agentId) {
    case "till":
      return [
        { at: min(9), label: "Suggested Slim Fit Stretch Polo as add-on — accepted, +₹3,299", kind: "did" },
        { at: min(41), label: "Answered “do we have this in 32?” from live stock — yes, 4 on floor", kind: "did" },
        { at: min(67), label: "Suggested belt attach on denim basket — declined", kind: "suggested" },
        { at: min(118), label: `Flagged a Platinum member at the till — points expiring this week`, kind: "flagged" },
      ];
    case "replenish":
      return [
        { at: min(22), label: `Raised pull: 52 × FM Straight Jean from RPC — inside autonomy limit`, kind: "did" },
        { at: min(22), label: `Raised pull: 33 × FM Skinny Jean from RPC`, kind: "did" },
        { at: min(84), label: `Routed FM Printed Shirt (L) to a store transfer — warehouse empty`, kind: "did" },
        { at: min(140), label: `Held a 96-unit pull for approval — above the 40-unit autonomy limit`, kind: "suggested" },
      ];
    case "markdown":
      return [
        { at: min(35), label: "Proposed 20% on Linen Resort Shirt — 41 days cover, 12 days of window left", kind: "suggested" },
        { at: min(35), label: "Proposed 15% on Monogram Tee — sell-through 22 pts behind pattern", kind: "suggested" },
        { at: min(190), label: "Withdrew last week's proposal on Varsity Jacket — velocity recovered", kind: "did" },
      ];
    case "outreach":
      return [
        { at: min(52), label: `Drafted 8 WhatsApp messages for today's contact list at ${store.name}`, kind: "did" },
        { at: min(52), label: "Built the list: 2 birthdays, 3 lapsing, 2 expiring points, 1 anniversary", kind: "did" },
        { at: min(300), label: "Queued win-back campaign to the At-risk segment — awaiting send", kind: "suggested" },
      ];
    case "festival":
      return [
        { at: min(46), label: "Onam is in 13 days — Forum Kochi sold 2.3× more linen this week last year", kind: "flagged" },
        { at: min(46), label: `Suggested: send 40 × Linen Blend Shirt from ${store.name} to Forum Kochi`, kind: "suggested" },
        { at: min(180), label: "Raksha Bandhan (28 Aug) — gifting packs move 1.8× in Delhi NCR; suggested a top-up", kind: "suggested" },
      ];
    case "swap":
      return [
        { at: min(64), label: `Monogram Print Tee sells 0.3/day at ${store.name} but 1.1/day at Linking Road — suggested a swap`, kind: "suggested" },
        { at: min(210), label: `Spotted 18 × Bomber Jacket sitting at VR Surat that would sell at ${store.name}`, kind: "suggested" },
      ];
    case "watchtower":
      return [
        { at: min(28), label: "Flagged UB City: conversion 38% below its Thursday pattern since 10:30", kind: "flagged" },
        { at: min(75), label: "Flagged Quest Kolkata: 3 SLA breaches building in one morning", kind: "flagged" },
        { at: min(222), label: "Delivered the 08:00 estate brief to Planning and Admin", kind: "did" },
      ];
  }
}

// ── Approvals — what is waiting on a human (human-in-the-loop) ───────────────

export function agentApprovals(agentId: AgentId, storeId: string): AgentApproval[] {
  const r = rng(hash("appr" + agentId + storeId));
  switch (agentId) {
    case "replenish":
      return [
        {
          id: "AG-RP-1",
          label: "Pull 96 × Oxford Solid Shirt from RPC Bhiwandi",
          detail: "Above the 40-unit autonomy limit. Cover is 4 days against a 21-day norm.",
          impact: "Protects ₹4.1 L of full-price sales",
        },
        {
          id: "AG-RP-2",
          label: `Transfer 12 × Flag Logo Cotton Polo (L) from Linking Road`,
          detail: "Warehouse empty for this size. Donor holds 10 above a week's cover.",
          impact: "Repairs the top broken size set",
        },
      ];
    case "markdown":
      return [
        {
          id: "AG-MD-1",
          label: "20% markdown on Linen Resort Shirt",
          detail: `${41 + Math.floor(r() * 4)} days of cover, 12 days of full-price window left. Sell-through 61% vs 74% target.`,
          impact: "₹2.6 L margin protected vs EOSS depth",
        },
        {
          id: "AG-MD-2",
          label: "15% markdown on Monogram Tee",
          detail: "Velocity 0.4/day against a 1.1/day pattern. Cover exceeds the window by 3×.",
          impact: "₹1.5 L margin protected",
        },
      ];
    case "outreach":
      return [
        {
          id: "AG-OR-1",
          label: "Send win-back campaign to the At-risk segment",
          detail: "486 members, WhatsApp, drafted copy attached. Offer: 500 bonus points this weekend.",
          impact: "Expected 25–40 visits this weekend",
        },
      ];
    default:
      return [];
  }
}

// ── Merchandising intelligence — plain-language stock moves ──────────────────
// Written so a store manager can read one card and decide in ten seconds:
// WHAT to move, WHY (last year's sales, the festival calendar, a sister store
// selling it faster), and what it's WORTH. Nothing moves without a person.

export interface MerchMove {
  id: string;
  kind: "festival" | "swap";
  /** One plain sentence: what to do. */
  headline: string;
  /** Two or three plain reasons — no jargon. */
  why: string[];
  /** Rupees protected or unlocked if approved. */
  worth: number;
  units: number;
  styleName: string;
  direction: "send" | "receive";
  otherStore: string;
  dueBy: string;
}

export function merchMoves(storeId: string): MerchMove[] {
  const store = storeById(storeId);
  const r = rng(hash("merch" + storeId));
  const linenUnits = 32 + Math.floor(r() * 16);
  const giftUnits = 20 + Math.floor(r() * 12);
  const pujaUnits = 24 + Math.floor(r() * 14);
  const teeUnits = 18 + Math.floor(r() * 10);
  const jacketUnits = 12 + Math.floor(r() * 8);

  return [
    {
      id: "MM-1",
      kind: "festival",
      headline: `Send ${linenUnits} × Linen Blend Shirt to Forum Kochi before Onam`,
      why: [
        "Onam is on 26 Aug — 13 days away.",
        `This same week last year, Forum Kochi sold 2.3× more linen than ${store.name}.`,
        `Here it will last ${34 + Math.floor(r() * 10)} days at today's speed; Kochi runs out in 9.`,
      ],
      worth: Math.round(linenUnits * 4999 * 0.62),
      units: linenUnits,
      styleName: "Linen Blend Shirt",
      direction: "send",
      otherStore: "Forum Kochi",
      dueBy: "ship by 19 Aug",
    },
    {
      id: "MM-2",
      kind: "festival",
      headline: `Send ${giftUnits} × Leather Belt Reversible to Pacific Delhi before Raksha Bandhan`,
      why: [
        "Raksha Bandhan is on 28 Aug — gifting week in the North.",
        "Delhi NCR stores sold 1.8× more accessories that week last year.",
        "Belts are a top-3 gift item and this store has double its usual cover.",
      ],
      worth: Math.round(giftUnits * 2999 * 0.7),
      units: giftUnits,
      styleName: "Leather Belt Reversible",
      direction: "send",
      otherStore: "Pacific Delhi",
      dueBy: "ship by 21 Aug",
    },
    {
      id: "MM-3",
      kind: "festival",
      headline: `Plan ${pujaUnits} × Check Casual Shirt for Quest Kolkata before Durga Puja`,
      why: [
        "Durga Puja starts mid-October — new-clothes season in Bengal.",
        "Quest Kolkata sold out this style in Puja week last year and lost 11 days of sales.",
        "Booking the move now means it travels with the regular truck, not a rush courier.",
      ],
      worth: Math.round(pujaUnits * 4599 * 0.58),
      units: pujaUnits,
      styleName: "Check Casual Shirt",
      direction: "send",
      otherStore: "Quest Kolkata",
      dueBy: "book by 30 Sep",
    },
    {
      id: "MM-4",
      kind: "swap",
      headline: `Send ${teeUnits} × Monogram Print Tee to Linking Road — it sells 3× faster there`,
      why: [
        `At ${store.name} this tee sells 0.3 a day; at Linking Road it sells 1.1 a day.`,
        "Same stock, better shelf: it earns roughly a month sooner there.",
        "The space it frees here goes to your fastest polo, which keeps selling out.",
      ],
      worth: Math.round(teeUnits * 2699 * 0.4),
      units: teeUnits,
      styleName: "Monogram Print Tee",
      direction: "send",
      otherStore: "Linking Road",
      dueBy: "any day this week",
    },
    {
      id: "MM-5",
      kind: "swap",
      headline: `Bring ${jacketUnits} × Bomber Jacket in from VR Surat — it sits there, sells here`,
      why: [
        `VR Surat has ${jacketUnits + 6} bombers moving at 0.1 a day; here they move at 0.8 a day.`,
        "Evenings are already cooling in your city — jacket season starts earlier here.",
        "Surat frees stuck stock, you get a proven seller. Both stores win.",
      ],
      worth: Math.round(jacketUnits * 10999 * 0.45),
      units: jacketUnits,
      styleName: "Bomber Jacket",
      direction: "receive",
      otherStore: "VR Surat",
      dueBy: "any day this week",
    },
  ];
}

// ── Copilot — canned, deterministic exchanges per role ───────────────────────

export interface CopilotSuggestion {
  q: string;
  a: string;
  action?: { label: string; toast: string };
}

export function copilotSuggestions(role: RoleId, storeId: string): CopilotSuggestion[] {
  const exceptions = sizeSetExceptions(storeId, 40);
  const pulls = exceptions.filter((e) => e.decision.action === "replenish_from_dc");
  const v = vitalsFor(storeId);
  const topStyle = STYLES[0];

  if (role === "staff") {
    return [
      {
        q: "Do we have this polo in 32?",
        a: `${topStyle.name}: size 32 is not carried; nearest sizes on the floor are M (23) and L (0). L is available 5.4 km away at Linking Road — Save the Sale can bring it in today.`,
        action: { label: "Open Save the Sale", toast: "Opening Save the Sale" },
      },
      {
        q: "What should I suggest with a denim basket?",
        a: "Best attach for denim this month is the FM Utility Shirt (bought together in 18% of denim bills) followed by belts. Both are in stock in all core sizes.",
      },
      {
        q: "Which orders must be packed in the next hour?",
        a: "Two online orders breach their find-time inside the hour: OM-55021 (bay B3, rack 2) and OM-55034. Both are located; they need packing and POD.",
      },
    ];
  }
  if (role === "store") {
    return [
      {
        q: "What needs me most right now?",
        a: `Three things, by money: ${pulls[0]?.style.name ?? "FM Straight Jean"} needs a ${pulls[0]?.decision.units ?? 52}-unit pull (₹${Math.round((pulls[0]?.valueAtRisk ?? 36000) / 1000)}k at risk), the 96-unit Oxford pull is waiting on your approval, and 2 HQ tasks breach SLA today.`,
        action: { label: "Raise all pending pulls", toast: "Replenishment Agent raised all pending pulls" },
      },
      {
        q: "Write my day summary for the area group",
        a: `Draft ready: "${storeById(storeId).name}: ₹${Math.round(v.todaySales / 1000)}k by noon (${Math.round(((v.todaySales - v.lySameDay) / Math.max(1, v.lySameDay)) * 100)}% vs LY), conversion ${(v.conversion * 100).toFixed(1)}%, ${v.brokenStyles + v.atRiskStyles} size exceptions open, all briefings and floor walks done."`,
        action: { label: "Send to area group", toast: "Summary sent to the area group on WhatsApp" },
      },
      {
        q: "Why is my fill rate below norm?",
        a: `You hold ${v.sellableUnits.toLocaleString("en-IN")} sellable against a norm of ${v.store.norm.toLocaleString("en-IN")}. The gap is concentrated in denim core sizes; the Replenishment Agent has queued pulls covering 71% of it.`,
      },
    ];
  }
  if (role === "planner") {
    return [
      {
        q: "Which stores need intervention today?",
        a: "Five stores are behind plan. The common factor in three (DLF Promenade, Phoenix Marketcity, Seawoods) is briefing done late plus floor walk under 60% — an execution issue, not a demand issue. UB City is a demand anomaly per Watchtower.",
        action: { label: "Open Live Execution", toast: "Opening Live Execution" },
      },
      {
        q: "Approve everything inside policy",
        a: "Cleared: 1 transfer inside all gates and 2 replenishment pulls inside cover rules. Held for you: the ₹42,000 lift quote and 2 markdown proposals — pricing always needs a human.",
        action: { label: "Apply", toast: "3 approvals applied, 3 held for review" },
      },
      {
        q: "Draft the weekly trading note",
        a: "Draft ready: estate at 94% of MTD target; sell-through 71% (benchmark 85–90); markdown exposure ₹62 L concentrated in Calvin Klein tees and Linen Resort; 22 broken size sets with fixes queued worth ₹81 L.",
      },
    ];
  }
  return [
    {
      q: "Give me the one-paragraph morning brief",
      a: "Estate at 94% of MTD target. Full-price sell-through 71%. Markdown exposure ₹62 L, two-thirds in two styles — proposals are with Planning. 5 stores behind plan; 3 are execution, 1 is a demand anomaly, 1 reopens after a fit-out today. Customer capture 78% and climbing.",
    },
    {
      q: "What changed since yesterday?",
      a: "Sell-through +0.6 pts. Broken size sets down from 26 to 22 — the Replenishment Agent closed 4 overnight with warehouse pulls. One new anomaly: UB City conversion running 38% below pattern since 10:30.",
    },
  ];
}
