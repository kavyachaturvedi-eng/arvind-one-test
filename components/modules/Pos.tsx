"use client";

// Billing — a full-screen, touch-first till, built the way a modern retail POS
// runs a bill: customer number → scan item → size → quantity → charge →
// payment → receipt. Big targets, one job per screen region, no app chrome.

import React, { useMemo, useState } from "react";
import { CATEGORIES, NOW, rng, storeById, styleById } from "@/lib/seed";
import { sellable, stockForStyleAtStore, stylesAtStore, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, ColumnChart, Empty, Modal, SectionTitle, Stat, StatusDot, Table, Td, Th, fmtTime, inr, pct } from "@/components/ui";
import { applyCoupon } from "@/lib/offers";
import { feedbackFor } from "@/lib/offers";
import { RETURN_REASONS, ordersForPhone } from "./BillHistory";
import type { Category, Style } from "@/lib/types";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const FIRST = ["Ananya", "Vikram", "Priya", "Rahul", "Sneha", "Arjun", "Divya", "Karan", "Pooja", "Nikhil", "Ishita", "Rohan"];
const LAST = ["Mehta", "Iyer", "Kapoor", "Desai", "Nair", "Malhotra", "Reddy", "Bose", "Chopra", "Kulkarni", "Sinha", "Verma"];

// ── The day's seeded bills (Day view) ────────────────────────────────────────

interface Bill {
  id: string;
  at: number;
  items: number;
  value: number;
  tender: "UPI" | "Card" | "Cash";
  customer?: string;
  status: "billed" | "returned";
}

function buildBills(storeId: string, todaySales: number, billCount: number): Bill[] {
  const r = rng(hash("pos" + storeId));
  const names = ["Ananya M.", "Vikram I.", "Priya K.", undefined, "Rahul D.", undefined, "Sneha N.", undefined];
  const out: Bill[] = [];
  const shown = Math.min(9, billCount);
  let remaining = todaySales;
  for (let i = 0; i < shown; i++) {
    const value =
      i === shown - 1
        ? Math.min(9900, Math.max(800, Math.round(remaining / 100) * 100))
        : Math.round(((todaySales / billCount) * (0.5 + r())) / 100) * 100;
    remaining -= value;
    out.push({
      id: `B-${4200 + i}`,
      at: NOW - (8 + i * 22 + Math.floor(r() * 12)) * 60_000,
      items: 1 + Math.floor(r() * 4),
      value,
      tender: r() < 0.42 ? "UPI" : r() < 0.78 ? "Card" : "Cash",
      customer: names[i % names.length],
      status: i === 4 ? "returned" : "billed",
    });
  }
  return out;
}

// ── Cart & member ────────────────────────────────────────────────────────────

interface CartLine {
  styleId: string;
  name: string;
  size: string;
  mrp: number;
  qty: number;
}

interface Member {
  phone: string;
  name: string;
  tier: "Platinum" | "Gold" | "Silver";
  points: number;
}

/** Deterministic member lookup, most numbers are members, some are new. */
function lookupMember(phone: string): Member | null {
  const h = hash("mem" + phone);
  if (h % 4 === 0) return null; // new customer
  const r = rng(h);
  return {
    phone,
    name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
    tier: r() < 0.18 ? "Platinum" : r() < 0.5 ? "Gold" : "Silver",
    points: 200 + Math.floor(r() * 4200),
  };
}

/** Arvi's attach suggestion for the current basket. */
function attachSuggestion(cart: CartLine[], carried: Style[]): { style: Style; why: string } | null {
  if (cart.length === 0) return null;
  const last = styleById(cart[cart.length - 1].styleId);
  const inCart = new Set(cart.map((c) => c.styleId));
  const candidate = carried.find((s) => s.brand === last.brand && s.category !== last.category && !inCart.has(s.id));
  if (!candidate) return null;
  const why =
    last.category === "Denim" || candidate.category === "Denim"
      ? "bought together in 18% of denim bills"
      : `top ${candidate.category.toLowerCase()} attach for ${last.category.toLowerCase()}`;
  return { style: candidate, why };
}

type Stage = "customer" | "items" | "pay" | "done";

const CARRY_BAG_PRICE = 10;
type PayMode = "UPI" | "Card" | "Cash" | null;

export default function Pos() {
  const app = useApp();
  const store = storeById(app.storeId);
  const v = vitalsFor(app.storeId);
  const carried = useMemo(() => stylesAtStore(app.storeId), [app.storeId]);

  const [view, setView] = useState<"till" | "day">("till");
  const [stage, setStage] = useState<Stage>("customer");
  const [phone, setPhone] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [walkIn, setWalkIn] = useState(false);

  const [cat, setCat] = useState<Category | "All">("All");
  const [query, setQuery] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [pendingSize, setPendingSize] = useState<string | null>(null);
  const [pendingQty, setPendingQty] = useState(1);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [parked, setParked] = useState<{ id: string; lines: CartLine[]; member: Member | null; walkIn: boolean }[]>([]);
  const [payMode, setPayMode] = useState<PayMode>(null);
  const [cash, setCash] = useState(0);
  const [bag, setBag] = useState(false);
  const [redeemPts, setRedeemPts] = useState(false);
  const [couponText, setCouponText] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; amount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [useNote, setUseNote] = useState(false);
  const [paid, setPaid] = useState<{ mode: "UPI" | "Card" | "Cash"; amount: number }[]>([]);
  const [partText, setPartText] = useState("");
  const [paidLabel, setPaidLabel] = useState("");
  const [lastBill, setLastBill] = useState<Bill | null>(null);
  const [newBills, setNewBills] = useState<Bill[]>([]);

  // Opening the day at the counter, held bills, and the customer's profile.
  const [floatText, setFloatText] = useState("8000");
  const [heldOpen, setHeldOpen] = useState(false);
  const [dayEndOpen, setDayEndOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: string; kind: "returned" | "exchanged" } | null>(null);
  const [settled, setSettled] = useState<Record<string, string>>({});

  const seeded = useMemo(() => buildBills(app.storeId, v.todaySales, v.bills), [app.storeId, v.todaySales, v.bills]);
  const bills = useMemo(() => [...newBills, ...seeded], [newBills, seeded]);
  const salesToday = v.todaySales + newBills.reduce((a, b) => a + b.value, 0);
  const billCount = v.bills + newBills.length;

  const cats = useMemo(() => {
    const present = new Set(carried.map((s) => s.category));
    return ["All", ...CATEGORIES.filter((c) => present.has(c))] as (Category | "All")[];
  }, [carried]);

  const results = useMemo(() => {
    let list = cat === "All" ? carried : carried.filter((s) => s.category === cat);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
    }
    return list.slice(0, 12);
  }, [carried, cat, query]);

  const picking = pickingId ? styleById(pickingId) : null;
  const pickingUnits: Record<string, number> = {};
  if (picking) for (const r of stockForStyleAtStore(app.storeId, picking.id)) pickingUnits[r.size] = sellable(r);
  const maxQty = picking && pendingSize ? pickingUnits[pendingSize] ?? 0 : 0;

  const subtotal = cart.reduce((a, l) => a + l.mrp * l.qty, 0);
  const gst = Math.round((subtotal * 12) / 112);
  const itemCount = cart.reduce((a, l) => a + l.qty, 0);
  const suggestion = attachSuggestion(cart, carried);

  // Cash that leaves for the bank at day close, float stays behind.
  const cashForDeposit = Math.round((salesToday * 0.26) / 10) * 10;

  // Carry bag, coupon and loyalty-point payment. One point is worth 25 paise.
  const bagValue = bag ? CARRY_BAG_PRICE : 0;
  const gross = subtotal + bagValue;
  const couponValue = coupon?.amount ?? 0;
  const afterCoupon = Math.max(0, gross - couponValue);
  // A credit note from an earlier return pays first, then points.
  const openNote = member ? app.creditNotes.find((n) => n.phone === member.phone && n.balance > 0) ?? null : null;
  const noteUsed = useNote && openNote ? Math.min(openNote.balance, afterCoupon) : 0;
  const afterNote = afterCoupon - noteUsed;
  const redeemValue = redeemPts && member ? Math.min(Math.floor(member.points * 0.25), afterNote) : 0;
  const ptsUsed = redeemValue > 0 ? Math.min(member?.points ?? 0, Math.ceil(redeemValue / 0.25)) : 0;
  const total = afterNote - redeemValue;
  const paidSoFar = paid.reduce((a, p) => a + p.amount, 0);
  const due = Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
  const partAmount = Math.min(due, Math.max(0, Math.round((Number(partText) || 0) * 100) / 100));
  const change = payMode === "Cash" ? Math.max(0, cash - due) : 0;

  // ── Actions ────────────────────────────────────────────────────────────────

  function key(d: string) {
    if (d === "⌫") { setPhone((p) => p.slice(0, -1)); setMember(null); return; }
    setPhone((p) => {
      const next = (p + d).slice(0, 10);
      const m = next.length === 10 ? lookupMember(next) : null;
      setMember(m);
      // A known customer opens their profile straight away: past orders in
      // reach, so a return or exchange never needs a second screen.
      if (m) setProfileOpen(true);
      return next;
    });
  }

  function tryCoupon() {
    const res = applyCoupon(couponText, gross);
    if (res.ok) {
      setCoupon({ code: couponText.trim().toUpperCase(), amount: res.amount });
      setCouponError(null);
      app.toastNow(`${res.message} ${inr(res.amount)} off this bill.`, "good");
    } else {
      setCoupon(null);
      setCouponError(res.message);
    }
  }

  function settle(orderId: string, kind: "returned" | "exchanged", reason: string) {
    setSettled((s) => ({ ...s, [orderId]: `${kind === "returned" ? "Returned" : "Exchanged"} · ${reason}` }));
    setPendingAction(null);
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action:
          kind === "returned"
            ? `${orderId} returned at the counter. Reason: ${reason}`
            : `${orderId} exchanged at the counter. Reason: ${reason}`,
        object: orderId,
        system: "POS",
      },
    });
    app.toastNow(
      kind === "returned"
        ? `${orderId} refunded to the original payment mode. Reason recorded.`
        : `${orderId} exchange started. Bill the new item on this screen.`,
      "good"
    );
    if (kind === "exchanged") {
      setProfileOpen(false);
      setStage("items");
    }
  }

  function startItems(asWalkIn: boolean) {
    setWalkIn(asWalkIn);
    setStage("items");
  }

  function resetPending() {
    setPickingId(null);
    setPendingSize(null);
    setPendingQty(1);
  }

  function addPending() {
    if (!picking || !pendingSize) return;
    const s = picking;
    const size = pendingSize;
    const qty = pendingQty;
    setCart((c) => {
      const i = c.findIndex((l) => l.styleId === s.id && l.size === size);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [...c, { styleId: s.id, name: s.name, size, mrp: s.mrp, qty }];
    });
    resetPending();
    setQuery("");
  }

  function bump(idx: number, d: number) {
    setCart((c) => c.map((l, i) => (i === idx ? { ...l, qty: Math.max(0, l.qty + d) } : l)).filter((l) => l.qty > 0));
  }

  function addTender() {
    if (!payMode || partAmount <= 0) return;
    setPaid((p) => [...p, { mode: payMode, amount: partAmount }]);
    setPayMode(null);
    setCash(0);
    setPartText("");
  }

  function confirmPayment() {
    if (cart.length === 0) return;
    // Whatever is still due goes on the tender that is selected now.
    const lines = due > 0 && payMode ? [...paid, { mode: payMode, amount: due }] : paid;
    if (lines.length === 0) return;
    const tenderLabel = lines.length === 1 ? lines[0].mode : "Split";
    const bill: Bill = {
      id: `B-${4300 + newBills.length}`,
      at: NOW,
      items: itemCount,
      value: total,
      tender: lines.length === 1 ? lines[0].mode : "Card",
      customer: member ? member.name : undefined,
      status: "billed",
    };
    if (noteUsed > 0 && openNote) app.dispatch({ type: "credit:redeem", id: openNote.id, amount: noteUsed });
    setNewBills((x) => [bill, ...x]);
    setLastBill(bill);
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `Bill ${bill.id}, ${itemCount} item${itemCount > 1 ? "s" : ""}, ${inr(total)} on ${lines.map((l) => `${l.mode} ${inr(l.amount)}`).join(" + ")}${noteUsed ? `, credit note ${inr(noteUsed)}` : ""}${ptsUsed ? `, ${ptsUsed} points` : ""}`,
        object: bill.id,
        system: "POS",
      },
    });
    setPaidLabel(tenderLabel);
    setStage("done");
  }

  function newBill() {
    setCart([]);
    setPhone("");
    setMember(null);
    setWalkIn(false);
    setPayMode(null);
    setCash(0);
    setBag(false);
    setRedeemPts(false);
    setCoupon(null);
    setCouponText("");
    setCouponError(null);
    setUseNote(false);
    setPaid([]);
    setPartText("");
    setPaidLabel("");
    setLastBill(null);
    resetPending();
    setStage("customer");
  }

  function hold() {
    if (cart.length === 0) return;
    setParked((p) => [...p, { id: `P-${p.length + 1}`, lines: cart, member, walkIn }]);
    app.toastNow("Bill on hold", "info");
    newBill();
  }

  function recall(id: string) {
    const p = parked.find((x) => x.id === id);
    if (!p) return;
    setParked((x) => x.filter((y) => y.id !== id));
    setCart(p.lines);
    setMember(p.member);
    setWalkIn(p.walkIn);
    setPhone(p.member?.phone ?? "");
    setStage("items");
    app.toastNow(`${id} recalled`, "info");
  }

  // ── The till — a full-screen takeover, like a real POS ─────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--plane)" }}>
      {/* Till bar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-line bg-raised shrink-0">
        <div className="w-8 h-8 grid place-items-center text-white text-sm font-medium" style={{ background: "var(--text-primary)" }}>1</div>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-ink">Billing · Counter {store.code}-01</h1>
          <div className="text-2xs text-muted">{store.name} · {app.actorName}</div>
        </div>
        <div className="flex-1" />
        <button
          data-held
          className={`btn !py-1.5 !text-xs ${parked.length ? "!border-[color:var(--brand)] !text-[color:var(--brand)]" : ""}`}
          onClick={() => setHeldOpen(true)}
        >
          ⏸ Held bills{parked.length ? ` · ${parked.length}` : ""}
        </button>
        {app.dayOpen && !app.dayClosed && (
          <>
            <Chip tone="good">● Day open</Chip>
            <button data-day-end className="btn !py-1.5 !text-xs" onClick={() => setDayEndOpen(true)}>
              Day end
            </button>
          </>
        )}
        {app.dayClosed && <Chip tone="neutral">Day closed</Chip>}
        <span className="text-2xs text-muted num hidden sm:inline">{inr(salesToday, { compact: true })} · {billCount} bills</span>
        <button className={`btn !py-1.5 !text-xs ${view === "day" ? "!border-[color:var(--brand)] !text-[color:var(--brand)]" : ""}`} onClick={() => setView(view === "till" ? "day" : "till")}>
          {view === "till" ? "Today's sales" : "Back to billing"}
        </button>
        <button data-exit-till className="btn !py-1.5 !text-xs" onClick={() => app.go(app.role === "staff" ? "bills" : "home")}>
          Exit billing screen
        </button>
      </div>

      {view === "day" ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-[1200px] mx-auto">
            <DayView v={v} bills={bills} billCount={billCount} storeId={app.storeId} onReprint={(id) => app.toastNow(`${id} reprinted`, "info")} />
          </div>
        </div>
      ) : app.dayClosed ? (
        /* ── The day is closed: nothing bills until it is reopened ── */
        <div className="flex-1 grid place-items-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto w-14 h-14 grid place-items-center border-2 mb-4" style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}>
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="text-xl font-medium text-ink">Day closed</h2>
            <div className="text-xs text-muted mt-1 num">
              {billCount} bills · {inr(salesToday)} billed · {inr(cashForDeposit)} to the bank
            </div>
            <div className="text-xs text-ink2 mt-4 leading-relaxed">
              The summary is with Finance and the deposit slip has printed. The till stays shut until tomorrow.
            </div>
            <button className="btn w-full mt-5 !py-3" onClick={() => app.dispatch({ type: "day:reopen" })}>
              Reopen the till
            </button>
          </div>
        </div>
      ) : !app.dayOpen ? (
        /* ── Open the day before the first bill: count the cash in the till ── */
        <div className="flex-1 grid place-items-center p-6">
          <div className="w-full max-w-sm">
            <div className="label mb-1.5">Before the first bill</div>
            <h2 className="text-xl font-medium text-ink mb-4">Open the day</h2>

            <div className="border border-line bg-raised p-4">
              <div className="label mb-1.5">Cash in the till now</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl text-muted">₹</span>
                <input
                  data-float
                  value={floatText}
                  onChange={(e) => setFloatText(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="flex-1 text-3xl font-semibold num bg-transparent outline-none text-ink border-b border-line"
                />
              </div>
            </div>

            <button
              data-day-open
              className="btn-primary w-full mt-4 !py-4 !text-base"
              disabled={!floatText || Number(floatText) <= 0}
              onClick={() => {
                app.dispatch({ type: "day:open", by: app.actorName, float: Math.round((Number(floatText) || 0) * 100) / 100 });
                app.dispatch({
                  type: "audit",
                  entry: { at: NOW, actor: app.actorName, action: `Till opened with ${inr(Number(floatText))} counted in the drawer`, object: "day-open", system: "POS" },
                });
                app.toastNow(`Day open. Float ${inr(Number(floatText))} confirmed. Good selling.`, "good");
              }}
            >
              ☀ Open the day and start billing
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid lg:grid-cols-[400px_1fr]">
          {/* ── LEFT: the bill ─────────────────────────────────────────────── */}
          <div className="border-r border-line bg-raised flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
              <div className="min-w-0">
                {member ? (
                  <>
                    <div className="text-sm font-medium text-ink">{member.name}</div>
                    <div className="text-2xs text-muted num">{member.phone} · {member.tier} · {member.points.toLocaleString("en-IN")} pts</div>
                  </>
                ) : walkIn ? (
                  <div className="text-sm text-ink2">Walk-in customer</div>
                ) : (
                  <div className="text-sm text-muted">No customer yet</div>
                )}
              </div>
              <span className="text-2xs text-muted num shrink-0">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {cart.length === 0 && member ? (
                /* A known customer: their recent orders sit here until the bill starts. */
                <div data-past-orders>
                  <div className="px-4 py-2.5 border-b border-line flex items-center justify-between bg-[color:var(--plane)]">
                    <span className="label">Their recent orders</span>
                    <button className="btn-ghost !px-1 !text-2xs" onClick={() => setProfileOpen(true)}>Open profile</button>
                  </div>
                  {ordersForPhone(member.phone).map((o) => (
                    <div key={o.id} className="px-4 py-2.5 border-b border-[color:var(--grid)]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs num font-medium text-ink">{o.id}</span>
                        <span className="text-2xs text-muted num">{o.dateLabel}</span>
                      </div>
                      <div className="text-xs text-ink2 mt-0.5">{o.items[0].qty} × {o.items[0].name} ({o.items[0].size})</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs num font-semibold text-ink">{inr(o.total)}</span>
                        {settled[o.id] ? (
                          <span className="text-2xs" style={{ color: "var(--status-good)" }}>{settled[o.id]}</span>
                        ) : (
                          <span className="text-2xs num" style={{ color: "var(--status-good)" }}>+{o.pointsEarned} pts</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3 text-2xs text-muted">
                    Scan an item to start their new bill, or open the profile to return or exchange.
                  </div>
                </div>
              ) : cart.length === 0 ? (
                <div className="px-4 py-12 text-center text-xs text-muted">Bill is empty</div>
              ) : (
                cart.map((l, i) => (
                  <div key={`${l.styleId}-${l.size}`} className="px-4 py-3 border-b border-[color:var(--grid)] flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink leading-snug">{l.name}</div>
                      <div className="text-2xs text-muted">Size {l.size} · {inr(l.mrp)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button className="w-9 h-9 border border-line text-lg leading-none" onClick={() => bump(i, -1)}>−</button>
                      <span className="w-8 text-center text-base num">{l.qty}</span>
                      <button className="w-9 h-9 border border-line text-lg leading-none" onClick={() => bump(i, 1)}>+</button>
                    </div>
                    <div className="w-20 text-right text-base font-semibold text-ink num shrink-0">{inr(l.mrp * l.qty)}</div>
                  </div>
                ))
              )}

              {/* Arvi suggests, the cashier decides */}
              {stage === "items" && suggestion && (
                <div className="px-4 py-3 flex items-center gap-2.5 border-b border-line" style={{ background: "var(--brand-soft)" }}>
                  <span className="serif-accent text-sm shrink-0">Arvi</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-ink leading-snug">Suggest <span className="font-medium">{suggestion.style.name}</span> · {inr(suggestion.style.mrp)}</div>
                    <div className="text-2xs text-muted">{suggestion.why}</div>
                  </div>
                  <button className="btn !py-1.5 !text-xs shrink-0" onClick={() => { setPickingId(suggestion.style.id); setPendingSize(null); setPendingQty(1); }}>
                    Add
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-line shrink-0 space-y-1.5">
              {/* Ask every customer: carry bag? Points if they're a member. */}
              {stage === "items" && cart.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pb-1">
                  <button
                    data-bag
                    onClick={() => setBag((v) => !v)}
                    className={`btn !py-1.5 !text-xs ${bag ? "!border-[color:var(--brand)] !text-[color:var(--brand)]" : ""}`}
                  >
                    {bag ? "✓ Carry bag ₹10" : "Ask: carry bag? +₹10"}
                  </button>
                  {member && member.points > 0 && (
                    <button
                      data-redeem
                      onClick={() => setRedeemPts((v) => !v)}
                      className={`btn !py-1.5 !text-xs ${redeemPts ? "!border-[color:var(--brand)] !text-[color:var(--brand)]" : ""}`}
                    >
                      {redeemPts
                        ? `✓ Paying ${inr(redeemValue)} by points`
                        : `Use ${member.points.toLocaleString("en-IN")} pts (worth ${inr(Math.floor(member.points * 0.25))})`}
                    </button>
                  )}
                </div>
              )}
              <div className="flex justify-between text-xs text-ink2"><span>Subtotal</span><span className="num">{inr(subtotal)}</span></div>
              {bag && <div className="flex justify-between text-xs text-ink2"><span>Carry bag</span><span className="num">{inr(bagValue)}</span></div>}
              {coupon && (
                <div className="flex justify-between text-xs" style={{ color: "var(--status-good)" }}>
                  <span>Coupon {coupon.code}</span><span className="num">−{inr(coupon.amount)}</span>
                </div>
              )}
              {noteUsed > 0 && openNote && (
                <div className="flex justify-between text-xs" style={{ color: "var(--status-good)" }}>
                  <span>Credit note {openNote.id}</span><span className="num">−{inr(noteUsed)}</span>
                </div>
              )}
              {redeemValue > 0 && (
                <div className="flex justify-between text-xs" style={{ color: "var(--status-good)" }}>
                  <span>Points ({ptsUsed.toLocaleString("en-IN")} used)</span><span className="num">−{inr(redeemValue)}</span>
                </div>
              )}
              <div className="flex justify-between text-2xs text-muted"><span>Includes GST (12%)</span><span className="num">{inr(gst)}</span></div>
              <div className="flex justify-between text-xl font-semibold text-ink pt-2 border-t border-line"><span>Total</span><span className="num">{inr(total)}</span></div>
              {stage === "items" && (
                <div className="pt-2 grid grid-cols-[1fr_auto_auto] gap-2">
                  <button className="btn-primary !py-4 !text-base" disabled={cart.length === 0} onClick={() => setStage("pay")}>
                    Charge {inr(total)}
                  </button>
                  <button className="btn !py-4" disabled={cart.length === 0} onClick={hold}>Hold bill</button>
                  <button className="btn !py-4" disabled={cart.length === 0} onClick={() => setCart([])}>Clear</button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: the stage ───────────────────────────────────────────── */}
          <div className="min-h-0 overflow-y-auto">
            {stage === "customer" && (
              <div className="h-full flex items-center justify-center p-6">
                <div className="w-full max-w-sm">
                  <div className="label mb-1.5">New bill · step 1 of 3</div>
                  <h2 className="text-xl font-medium text-ink mb-1">Customer&apos;s mobile number</h2>
                  <p className="text-xs text-muted mb-4">Points and offers attach to the bill. Skip for a walk-in.</p>

                  <div className="border border-line bg-raised px-4 py-3 text-center text-2xl num tracking-widest min-h-[56px]">
                    {phone || <span className="text-muted text-base">—. —. —. —. — —</span>}
                  </div>

                  {phone.length === 10 && (
                    <div className="mt-2 border px-3 py-2.5 flex items-center gap-2.5" style={{ borderColor: "var(--brand)", background: "var(--brand-soft)" }}>
                      <StatusDot tone={member ? "good" : "warn"} />
                      {member ? (
                        <span className="text-xs text-ink">
                          <span className="font-medium">{member.name}</span> · {member.tier} · {member.points.toLocaleString("en-IN")} pts
                        </span>
                      ) : (
                        <span className="text-xs text-ink">New customer, will be enrolled on billing</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].map((d) => (
                      <button
                        key={d}
                        onClick={() => key(d)}
                        className={`h-14 border border-line bg-raised text-xl num hover:border-[color:var(--brand)] transition-colors ${d === "1" ? "" : ""}`}
                      >
                        {d}
                      </button>
                    ))}
                    <button
                      data-continue
                      disabled={phone.length !== 10}
                      onClick={() => startItems(false)}
                      className="h-14 btn-primary !text-base"
                    >
                      Go
                    </button>
                  </div>

                  <button data-walkin className="btn w-full mt-3 !py-3" onClick={() => startItems(true)}>
                    Skip, walk-in customer
                  </button>
                </div>
              </div>
            )}

            {stage === "items" && (
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); resetPending(); }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const hit = carried.find((s) => s.id.toUpperCase() === query.trim().toUpperCase());
                      if (hit) { setPickingId(hit.id); setPendingSize(null); setPendingQty(1); }
                    }}
                    placeholder="Scan barcode or search"
                    className="flex-1 border border-line bg-raised px-4 py-3.5 text-base"
                    autoFocus
                  />
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {cats.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setCat(c); resetPending(); }}
                      className={`px-4 py-2.5 text-sm whitespace-nowrap border transition-colors ${
                        cat === c ? "border-transparent text-white" : "border-line bg-raised text-ink2"
                      }`}
                      style={cat === c ? { background: "var(--text-primary)" } : undefined}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                {/* Size → quantity, in place */}
                {picking && (
                  <div className="border p-4" style={{ borderColor: "var(--brand)", background: "var(--surface-2)" }}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <div className="text-base font-medium text-ink">{picking.name}</div>
                        <div className="text-2xs text-muted">{picking.id} · {inr(picking.mrp)}</div>
                      </div>
                      <button className="btn-ghost !px-2 text-lg" onClick={resetPending}>×</button>
                    </div>

                    {!pendingSize ? (
                      <>
                        <div className="label mb-2">Pick the size</div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {picking.sizes.map((sz) => {
                            const u = pickingUnits[sz] ?? 0;
                            return (
                              <button
                                key={sz}
                                disabled={u <= 0}
                                onClick={() => { setPendingSize(sz); setPendingQty(1); }}
                                className={`h-16 border text-center transition-colors ${u > 0 ? "border-line bg-raised hover:border-[color:var(--brand)]" : "border-line opacity-30 cursor-not-allowed"}`}
                              >
                                <div className="text-base font-semibold text-ink">{sz}</div>
                                <div className="text-2xs text-muted num">{u > 0 ? `${u} left` : "0"}</div>
                              </button>
                            );
                          })}
                        </div>
                        {Object.values(pickingUnits).every((u) => u <= 0) && (
                          <div className="text-xs mt-2" style={{ color: "var(--status-critical)" }}>
                            Nothing sellable here. Save the Sale can bring it from a nearby store.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-end gap-4 flex-wrap">
                        <div>
                          <div className="label mb-2">Size</div>
                          <button className="h-14 px-5 border text-base font-semibold" style={{ borderColor: "var(--brand)", color: "var(--brand)" }} onClick={() => setPendingSize(null)}>
                            {pendingSize} ▾
                          </button>
                        </div>
                        <div>
                          <div className="label mb-2">Quantity · {maxQty} available</div>
                          <div className="flex items-center gap-2">
                            <button className="w-14 h-14 border border-line bg-raised text-2xl" onClick={() => setPendingQty((q) => Math.max(1, q - 1))}>−</button>
                            <span className="w-12 text-center text-2xl num">{pendingQty}</span>
                            <button className="w-14 h-14 border border-line bg-raised text-2xl" onClick={() => setPendingQty((q) => Math.min(maxQty, q + 1))}>+</button>
                          </div>
                        </div>
                        <button data-add-item className="btn-primary !py-4 !px-8 !text-base ml-auto" onClick={addPending}>
                          Add · {inr(picking.mrp * pendingQty)}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                  {results.map((s) => {
                    const rows = stockForStyleAtStore(app.storeId, s.id);
                    const total = rows.reduce((a, r) => a + sellable(r), 0);
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setPickingId(s.id); setPendingSize(null); setPendingQty(1); }}
                        className="text-left border border-line bg-raised p-3 hover:border-[color:var(--brand)] transition-colors min-h-[104px]"
                      >
                        <div className="h-1.5 mb-2.5" style={{ background: s.colourHex }} />
                        <div className="text-sm font-medium text-ink leading-snug min-h-[36px]">{s.name}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-base font-semibold text-ink num">{inr(s.mrp)}</span>
                          <span className="text-2xs text-muted num">{total} pcs</span>
                        </div>
                      </button>
                    );
                  })}
                  {results.length === 0 && <div className="col-span-full"><Empty title="No match" body="Try another category or the style code." /></div>}
                </div>
              </div>
            )}

            {stage === "pay" && (
              <div className="h-full flex items-center justify-center p-6">
                <div className="w-full max-w-md">
                  <div className="label mb-1.5">Step 3 of 3</div>
                  <h2 className="text-xl font-medium text-ink mb-4">Take {inr(due)}</h2>

                  {/* Coupon codes come in on the customer's phone. */}
                  <div className="border border-line bg-raised p-3 mb-4">
                    <div className="label mb-1.5">Coupon code</div>
                    {coupon ? (
                      <div className="flex items-center gap-2.5">
                        <StatusDot tone="good" />
                        <span className="text-sm text-ink flex-1 num">{coupon.code} · {inr(coupon.amount)} off</span>
                        <button
                          className="btn !py-1 !text-2xs"
                          onClick={() => { setCoupon(null); setCouponText(""); setCouponError(null); }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <input
                            data-coupon
                            value={couponText}
                            onChange={(e) => { setCouponText(e.target.value.toUpperCase()); setCouponError(null); }}
                            onKeyDown={(e) => e.key === "Enter" && tryCoupon()}
                            placeholder="Type or scan the code"
                            className="flex-1 border border-line bg-raised px-3 py-2.5 text-sm num tracking-wide"
                          />
                          <button data-coupon-apply className="btn !py-2.5 !text-xs" onClick={tryCoupon}>Apply</button>
                        </div>
                        {couponError && (
                          <div className="text-2xs mt-1.5" style={{ color: "var(--status-critical)" }}>{couponError}</div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Credit note, if this customer has one open. */}
                  {member && openNote && (
                    <div className="border p-3 mb-4" style={{ borderColor: "var(--brand)" }}>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="label" style={{ color: "var(--brand)" }}>Credit note</span>
                        <span className="text-sm text-ink flex-1 num">{openNote.id} · {inr(openNote.balance)} left</span>
                        {noteUsed > 0 ? (
                          <button className="btn !py-1 !text-2xs" onClick={() => setUseNote(false)}>Remove</button>
                        ) : (
                          <button data-use-note className="btn !py-1 !text-2xs" onClick={() => setUseNote(true)}>
                            Use {inr(Math.min(openNote.balance, afterCoupon))}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Split payment: keep adding tenders until the bill is settled. */}
                  {paid.length > 0 && (
                    <div className="border border-line bg-raised p-3 mb-3 space-y-1.5">
                      {paid.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <StatusDot tone="good" />
                          <span className="text-ink flex-1">{p.mode}</span>
                          <span className="num text-ink">{inr(p.amount)}</span>
                          <button className="btn-ghost !px-1.5 !text-2xs" onClick={() => setPaid((x) => x.filter((_, j) => j !== i))}>×</button>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-line">
                        <span className="text-ink">Still to pay</span>
                        <span className="num" style={{ color: due > 0 ? "var(--status-critical)" : "var(--status-good)" }}>{inr(due)}</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {(["UPI", "Card", "Cash"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setPayMode(t); setCash(0); setPartText(String(due)); }}
                        className={`h-16 border text-base font-medium transition-colors ${payMode === t ? "text-white border-transparent" : "border-line bg-raised text-ink"}`}
                        style={payMode === t ? { background: "var(--text-primary)" } : undefined}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Part amount, so two tenders can settle one bill. */}
                  {payMode && due > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="label shrink-0">Amount on {payMode}</span>
                      <input
                        data-part-amount
                        value={partText}
                        onChange={(e) => setPartText(e.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        className="w-32 border border-line bg-raised px-3 py-2 text-base num"
                      />
                      <button className="btn !py-2 !text-xs" onClick={() => setPartText(String(due))}>Full {inr(due)}</button>
                      {partAmount > 0 && partAmount < due && (
                        <button data-add-tender className="btn-primary !py-2 !text-xs" onClick={addTender}>
                          Add {inr(partAmount)} and split
                        </button>
                      )}
                    </div>
                  )}

                  {payMode === "UPI" && (
                    <div className="border border-line bg-raised p-5 text-center">
                      <div className="mx-auto w-32 h-32 grid grid-cols-8 gap-0.5 p-2 border border-line mb-3">
                        {Array.from({ length: 64 }, (_, i) => (
                          <span key={i} style={{ background: rng(hash("qr" + due) + i)() > 0.5 ? "var(--text-primary)" : "transparent" }} />
                        ))}
                      </div>
                      <div className="text-xs text-ink2">Customer scans to pay {inr(due)}</div>
                    </div>
                  )}
                  {payMode === "Card" && (
                    <div className="border border-line bg-raised p-5 text-center">
                      <div className="text-sm text-ink mb-1">Tap or insert on the terminal</div>
                      <div className="text-xs text-muted">Amount pushed: {inr(due)}</div>
                    </div>
                  )}
                  {payMode === "Cash" && (
                    <div className="border border-line bg-raised p-4">
                      <div className="label mb-2">Cash received</div>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[due, Math.ceil(due / 500) * 500, Math.ceil(due / 1000) * 1000, Math.ceil(due / 1000) * 1000 + 1000]
                          .filter((v2, i, a) => a.indexOf(v2) === i)
                          .map((amt) => (
                            <button key={amt} onClick={() => setCash(amt)} className={`h-12 border text-sm num ${cash === amt ? "border-[color:var(--brand)] text-[color:var(--brand)]" : "border-line bg-raised text-ink"}`}>
                              {inr(amt)}
                            </button>
                          ))}
                      </div>
                      {cash >= due && cash > 0 && (
                        <div className="flex justify-between text-sm text-ink pt-2 border-t border-line">
                          <span>Change to return</span>
                          <span className="num font-semibold">{inr(change)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr_auto] gap-2 mt-4">
                    <button
                      data-confirm-pay
                      className="btn-primary !py-4 !text-base"
                      disabled={due > 0 && (!payMode || (payMode === "Cash" && cash < due))}
                      onClick={confirmPayment}
                    >
                      {due <= 0 ? "Bill settled, print it" : payMode ? `Take ${inr(due)} on ${payMode}` : "Pick a tender"}
                    </button>
                    <button className="btn !py-4" onClick={() => setStage("items")}>Back</button>
                  </div>
                </div>
              </div>
            )}

            {stage === "done" && lastBill && (
              <div className="h-full flex items-center justify-center p-6">
                <div className="w-full max-w-sm text-center">
                  <div className="mx-auto w-14 h-14 grid place-items-center border-2 mb-4" style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}>
                    <span className="text-2xl">✓</span>
                  </div>
                  <h2 className="text-xl font-medium text-ink">{inr(lastBill.value)} received</h2>
                  <div className="text-xs text-muted mt-1 num">
                    {lastBill.id} · {lastBill.items} item{lastBill.items > 1 ? "s" : ""} · {paidLabel || lastBill.tender}
                    {member ? ` · ${Math.round(lastBill.value / 100)} pts to ${member.name.split(" ")[0]}` : ""}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-6">
                    <button className="btn !py-3.5" onClick={() => app.toastNow(`${lastBill.id} printing on the till printer`, "info")}>
                      Print receipt
                    </button>
                    <button
                      className="btn !py-3.5"
                      onClick={() => app.toastNow(member ? `Receipt sent to ${member.phone} on WhatsApp` : "Receipt sent by SMS", "good")}
                    >
                      WhatsApp receipt
                    </button>
                  </div>
                  <button data-new-bill className="btn-primary w-full mt-2 !py-4 !text-base" onClick={newBill}>
                    New bill
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Day end, from the till ────────────────────────────────────────── */}
      <Modal
        open={dayEndOpen}
        onClose={() => setDayEndOpen(false)}
        title="Close the day"
        footer={
          <>
            <button className="btn" onClick={() => setDayEndOpen(false)}>Not yet</button>
            <button
              data-day-end-confirm
              className="btn-primary"
              onClick={() => {
                app.dispatch({ type: "day:close", by: app.actorName });
                app.dispatch({
                  type: "audit",
                  entry: {
                    at: NOW,
                    actor: app.actorName,
                    action: `Day closed at the till: ${billCount} bills, ${inr(salesToday)} billed, ${inr(cashForDeposit)} cash for deposit`,
                    object: "day-close",
                    system: "POS",
                  },
                });
                app.toastNow("Day closed. Deposit slip printed and the summary posted to Finance.", "good");
                setDayEndOpen(false);
              }}
            >
              Close the day
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-line p-3">
              <div className="label mb-1">Billed today</div>
              <div className="text-2xl font-semibold num text-ink">{inr(salesToday)}</div>
              <div className="text-2xs text-muted mt-0.5">{billCount} bills</div>
            </div>
            <div className="border border-line p-3">
              <div className="label mb-1">Cash for deposit</div>
              <div className="text-2xl font-semibold num" style={{ color: "var(--status-good)" }}>{inr(cashForDeposit)}</div>
              <div className="text-2xs text-muted mt-0.5">Float {inr(app.openFloat)} stays in the till</div>
            </div>
          </div>
          {parked.length > 0 && (
            <div className="border-l-2 pl-3 py-1" style={{ borderColor: "var(--status-warning)" }}>
              <div className="text-xs text-ink">
                {parked.length} bill{parked.length === 1 ? "" : "s"} still on hold. Closing the day cancels them.
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Held bills ────────────────────────────────────────────────────── */}
      <Modal
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        title="Held bills"
        sub={parked.length ? `${parked.length} on hold at this counter` : undefined}
        footer={<button className="btn" onClick={() => setHeldOpen(false)}>Close</button>}
      >
        {parked.length === 0 ? (
          <Empty title="Nothing on hold" body="Hold a bill when a customer steps away, then pick it up again here." />
        ) : (
          <div className="space-y-2">
            {parked.map((p) => (
              <div key={p.id} className="border border-line p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink num">{p.id}</div>
                  <div className="text-2xs text-muted mt-0.5">
                    {p.member ? `${p.member.name} · ${p.member.phone}` : "Walk-in customer"} · {p.lines.reduce((a, l) => a + l.qty, 0)} item
                    {p.lines.reduce((a, l) => a + l.qty, 0) === 1 ? "" : "s"}
                  </div>
                  <div className="text-2xs text-ink2 mt-1">{p.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold num text-ink">{inr(p.lines.reduce((a, l) => a + l.mrp * l.qty, 0))}</div>
                  <button
                    data-recall
                    className="btn-primary !py-1.5 !text-xs mt-1.5"
                    onClick={() => { recall(p.id); setHeldOpen(false); }}
                  >
                    Pick it up
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ── Customer profile: their orders, and what to do with them ──────── */}
      {member && (
        <Modal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          wide
          title={member.name}
          footer={
            <>
              <button className="btn" onClick={() => setProfileOpen(false)}>Close</button>
              <button
                data-start-bill
                className="btn-primary"
                onClick={() => { setProfileOpen(false); startItems(false); }}
              >
                Start a new bill
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-line p-3">
                <div className="text-2xl font-semibold num text-ink">{member.points.toLocaleString("en-IN")}</div>
                <div className="text-2xs text-muted mt-0.5">points</div>
              </div>
              <div className="border border-line p-3">
                <div className="text-2xl font-semibold num" style={{ color: "var(--status-good)" }}>{inr(Math.floor(member.points * 0.25))}</div>
                <div className="text-2xs text-muted mt-0.5">worth on this bill</div>
              </div>
              <div className="border border-line p-3">
                <div className="text-2xl font-semibold num text-ink">{ordersForPhone(member.phone).length}</div>
                <div className="text-2xs text-muted mt-0.5">orders, last 30 days</div>
              </div>
            </div>

            {/* How they rated us last time, from the campaign team's survey. */}
            {(() => {
              const fb = feedbackFor(member.phone);
              if (!fb) {
                return (
                  <div className="border border-line px-3 py-2.5 text-xs text-muted" data-feedback>
                    No feedback on record yet. Worth asking how the visit went.
                  </div>
                );
              }
              const tone = fb.average >= 4 ? "good" : fb.average >= 3 ? "warn" : "critical";
              const colour = tone === "good" ? "var(--status-good)" : tone === "warn" ? "var(--status-warning)" : "var(--status-critical)";
              return (
                <div className="border p-3" style={{ borderColor: colour }} data-feedback>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="label">Their feedback</span>
                    <span className="text-base font-semibold num" style={{ color: colour }}>
                      {fb.average.toFixed(1)} / 5
                    </span>
                    <span style={{ color: colour }}>{"★".repeat(Math.round(fb.average))}<span className="text-muted">{"★".repeat(5 - Math.round(fb.average))}</span></span>
                    <span className="text-2xs text-muted">{fb.count} survey{fb.count === 1 ? "" : "s"}</span>
                    {fb.average < 3.5 && <Chip tone="critical">handle with care</Chip>}
                  </div>
                  <div className="mt-2 space-y-1">
                    {fb.entries.map((e, i) => (
                      <div key={i} className="text-xs text-ink2">
                        <span className="num" style={{ color: colour }}>{e.rating}/5</span> · {e.comment}{" "}
                        <span className="text-2xs text-muted">({e.when})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div>
              <div className="label mb-2">Past orders</div>
              <div className="space-y-2">
                {ordersForPhone(member.phone).map((o) => (
                  <div key={o.id} className="border border-line p-3" data-profile-order>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink num">{o.id} <span className="text-2xs text-muted font-normal">{o.dateLabel} · {o.tender}</span></div>
                        <div className="text-xs text-ink2 mt-0.5">{o.items[0].qty} × {o.items[0].name} ({o.items[0].size})</div>
                        <div className="text-2xs text-muted mt-0.5 num">
                          <span style={{ color: "var(--status-good)" }}>+{o.pointsEarned} pts earned</span>
                          {o.pointsUsed > 0 && <span> · {o.pointsUsed} pts used</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold num text-ink">{inr(o.total)}</div>
                        {settled[o.id] ? (
                          <span className="inline-flex items-center gap-1.5 text-2xs mt-1" style={{ color: "var(--status-good)" }}>
                            <StatusDot tone="good" />{settled[o.id]}
                          </span>
                        ) : pendingAction?.id === o.id ? null : (
                          <div className="flex gap-1.5 mt-1.5">
                            <button
                              data-profile-return
                              className="btn !py-1 !text-2xs"
                              onClick={() => setPendingAction({ id: o.id, kind: "returned" })}
                            >
                              Return
                            </button>
                            <button className="btn !py-1 !text-2xs" onClick={() => setPendingAction({ id: o.id, kind: "exchanged" })}>
                              Exchange
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* One tap on a reason completes it. No second screen. */}
                    {pendingAction?.id === o.id && (
                      <div className="mt-3 pt-3 border-t border-line">
                        <div className="label mb-1.5">
                          {pendingAction.kind === "returned" ? "Refund reason" : "Exchange reason"}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {RETURN_REASONS.map((rsn) => (
                            <button
                              key={rsn}
                              data-profile-reason
                              className="btn !py-1.5 !text-xs"
                              onClick={() => settle(o.id, pendingAction.kind, rsn)}
                            >
                              {rsn}
                            </button>
                          ))}
                          <button className="btn-ghost !text-xs" onClick={() => setPendingAction(null)}>Cancel</button>
                        </div>
                        <div className="text-2xs text-muted mt-2">
                          {pendingAction.kind === "returned"
                            ? "Refund goes back to the original payment mode. Points on that bill reverse."
                            : "The new item is billed on this screen. Any difference settles there."}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Day view — the register's day at a glance ───────────────────────────────

function DayView({
  v,
  bills,
  billCount,
  storeId,
  onReprint,
}: {
  v: ReturnType<typeof vitalsFor>;
  bills: Bill[];
  billCount: number;
  storeId: string;
  onReprint: (id: string) => void;
}) {
  const r = rng(hash("posx" + storeId));
  const upiShare = 0.34 + r() * 0.18;
  const cardShare = 0.36 + r() * 0.14;
  const cashShare = Math.max(0.08, 1 - upiShare - cardShare);
  const returnsToday = bills.filter((b) => b.status === "returned").length;
  const captureRate = 0.62 + r() * 0.3;

  const hours = ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"];
  const curve = hours.map((_, i) => {
    const rr = rng(hash(storeId + "h" + i));
    const peak = i >= 8 ? 1.5 : i >= 4 ? 1.0 : 0.55;
    return Math.round(((v.todaySales / 10) * peak * (0.7 + rr() * 0.6)) / 100) * 100;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Sales today" value={inr(v.todaySales, { compact: true })} sub={`${billCount} bills`} emphasis freshness={1} />
        <Stat label="ATV" value={inr(v.atv)} sub={`UPT ${v.upt.toFixed(1)}`} />
        <Stat label="Conversion" value={pct(v.conversion, 1)} sub={`${v.footfall.toLocaleString("en-IN")} walk-ins`} tone={v.conversion >= 0.14 ? "good" : "warn"} />
        <Stat label="Customer capture" value={pct(captureRate)} tone={captureRate >= 0.8 ? "good" : "warn"} sub="Bills with a member attached" />
        <Stat label="Returns today" value={String(returnsToday)} tone={returnsToday > 1 ? "warn" : "good"} sub="Processed at this till" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <SectionTitle title="Bills" right={<Chip>{billCount} today</Chip>} />
          <Table>
            <thead>
              <tr>
                <Th>Bill</Th><Th>Time</Th><Th align="right">Items</Th><Th align="right">Value</Th>
                <Th>Tender</Th><Th>Customer</Th><Th align="right" />
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <Td className="num font-semibold text-ink">{b.id}</Td>
                  <Td className="text-xs text-ink2 num">{fmtTime(b.at)}</Td>
                  <Td align="right" className="num">{b.items}</Td>
                  <Td align="right" className="num font-semibold text-ink">{inr(b.value)}</Td>
                  <Td><Chip tone={b.tender === "Cash" ? "warn" : "neutral"}>{b.tender}</Chip></Td>
                  <Td className="text-xs text-ink2">{b.customer ?? <span className="text-muted">not captured</span>}</Td>
                  <Td align="right">
                    {b.status === "returned" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--status-critical)" }}><StatusDot tone="critical" />Returned</span>
                    ) : (
                      <button className="btn !py-1 !text-2xs" onClick={() => onReprint(b.id)}>Reprint</button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Tender mix" />
            <Table>
              <tbody>
                <tr><Td className="text-xs text-ink2">UPI</Td><Td align="right" className="num font-semibold text-ink">{pct(upiShare)}</Td></tr>
                <tr><Td className="text-xs text-ink2">Card</Td><Td align="right" className="num font-semibold text-ink">{pct(cardShare)}</Td></tr>
                <tr><Td className="text-xs text-ink2">Cash</Td><Td align="right" className="num font-semibold text-ink">{pct(cashShare)}</Td></tr>
              </tbody>
            </Table>
            <div className="mt-2 text-2xs text-muted">Cash in till: {inr(Math.round((v.todaySales * cashShare) / 100) * 100)}</div>
          </Card>

          <Card>
            <SectionTitle title="Hourly run-rate" />
            <ColumnChart categories={hours} series={[{ name: "Sales", color: "var(--series-1)", values: curve }]} format={(n) => inr(n, { compact: true })} height={110} />
          </Card>
        </div>
      </div>
    </div>
  );
}
