"use client";

// Billing — a real till. Catalog and scan on the left, the bill on the right,
// tender in one tap. Till Assist (the agent) suggests, the cashier decides.

import React, { useMemo, useState } from "react";
import { NOW, STYLES, rng, storeById, styleById } from "@/lib/seed";
import { sellable, stockForStyleAtStore, stylesAtStore, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, ColumnChart, Empty, SectionTitle, Stat, StatusDot, Swatch, Table, Tabs, Td, Th, fmtTime, inr, pct } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

// ── The day's seeded bills (Day view) ────────────────────────────────────────

interface Bill {
  id: string;
  at: number;
  items: number;
  value: number;
  tender: "Card" | "UPI" | "Cash";
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

// ── The cart ─────────────────────────────────────────────────────────────────

interface CartLine {
  styleId: string;
  name: string;
  size: string;
  mrp: number;
  qty: number;
}

/** Till Assist: the deterministic attach suggestion for the current basket. */
function attachSuggestion(cart: CartLine[], carriedIds: Set<string>): { style: (typeof STYLES)[number]; why: string } | null {
  if (cart.length === 0) return null;
  const last = styleById(cart[cart.length - 1].styleId);
  const inCart = new Set(cart.map((c) => c.styleId));
  const candidate = STYLES.find(
    (s) => s.brand === last.brand && s.category !== last.category && !inCart.has(s.id) && carriedIds.has(s.id)
  );
  if (!candidate) return null;
  const why =
    last.category === "Denim" || candidate.category === "Denim"
      ? "bought together in 18% of denim bills this month"
      : `top ${candidate.category.toLowerCase()} attach for ${last.category.toLowerCase()} baskets`;
  return { style: candidate, why };
}

export default function Pos() {
  const app = useApp();
  const store = storeById(app.storeId);
  const v = vitalsFor(app.storeId);
  const carried = useMemo(() => stylesAtStore(app.storeId), [app.storeId]);
  const carriedIds = useMemo(() => new Set(carried.map((s) => s.id)), [carried]);

  const [tab, setTab] = useState<"till" | "day">("till");
  const [query, setQuery] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [parked, setParked] = useState<{ id: string; lines: CartLine[]; customer: string }[]>([]);
  const [newBills, setNewBills] = useState<Bill[]>([]);

  const seeded = useMemo(() => buildBills(app.storeId, v.todaySales, v.bills), [app.storeId, v.todaySales, v.bills]);
  const bills = useMemo(() => [...newBills, ...seeded], [newBills, seeded]);
  const salesToday = v.todaySales + newBills.reduce((a, b) => a + b.value, 0);
  const billCount = v.bills + newBills.length;

  const results = useMemo(() => {
    if (!query.trim()) return carried.slice(0, 12);
    const q = query.toLowerCase();
    return carried.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)).slice(0, 12);
  }, [carried, query]);

  const picking = pickingId ? styleById(pickingId) : null;
  const pickingUnits: Record<string, number> = {};
  if (picking) for (const r of stockForStyleAtStore(app.storeId, picking.id)) pickingUnits[r.size] = sellable(r);

  const subtotal = cart.reduce((a, l) => a + l.mrp * l.qty, 0);
  const gst = Math.round((subtotal * 12) / 112);
  const itemCount = cart.reduce((a, l) => a + l.qty, 0);
  const suggestion = attachSuggestion(cart, carriedIds);

  function addLine(styleId: string, size: string) {
    const s = styleById(styleId);
    setCart((c) => {
      const i = c.findIndex((l) => l.styleId === styleId && l.size === size);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { styleId, name: s.name, size, mrp: s.mrp, qty: 1 }];
    });
    setPickingId(null);
    setQuery("");
  }

  function bump(idx: number, d: number) {
    setCart((c) => c.map((l, i) => (i === idx ? { ...l, qty: Math.max(0, l.qty + d) } : l)).filter((l) => l.qty > 0));
  }

  function charge(tender: Bill["tender"]) {
    if (cart.length === 0) return;
    const bill: Bill = {
      id: `B-${4300 + newBills.length}`,
      at: NOW,
      items: itemCount,
      value: subtotal,
      tender,
      customer: customer || undefined,
      status: "billed",
    };
    setNewBills((x) => [bill, ...x]);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `Bill ${bill.id} — ${itemCount} item${itemCount > 1 ? "s" : ""}, ${inr(subtotal)} by ${tender}`, object: bill.id, system: "POS" },
    });
    app.toastNow(`${bill.id} · ${inr(subtotal)} by ${tender}${customer ? ` · ${customer} captured` : ""}`, "good");
    setCart([]);
    setCustomer("");
  }

  function hold() {
    if (cart.length === 0) return;
    setParked((p) => [...p, { id: `P-${p.length + 1}`, lines: cart, customer }]);
    setCart([]);
    setCustomer("");
    app.toastNow("Bill on hold — recall it when the customer returns", "info");
  }

  function recall(id: string) {
    const p = parked.find((x) => x.id === id);
    if (!p) return;
    setParked((x) => x.filter((y) => y.id !== id));
    setCart(p.lines);
    setCustomer(p.customer);
    app.toastNow(`${id} recalled to the till`, "info");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Billing</h1>
          <p className="text-sm text-ink2 mt-1">Till {store.code}-01 · {inr(salesToday, { compact: true })} today · {billCount} bills</p>
        </div>
        <Tabs value={tab} onChange={setTab} options={[{ id: "till", label: "Till" }, { id: "day", label: "Day" }]} />
      </div>

      {tab === "till" ? (
        <div className="grid lg:grid-cols-[1fr_400px] gap-4 items-start">
          {/* ── Catalog ─────────────────────────────────────────────────── */}
          <Card>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPickingId(null); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const hit = carried.find((s) => s.id.toUpperCase() === query.trim().toUpperCase());
                if (hit) setPickingId(hit.id);
              }}
              placeholder="Scan barcode or search — name, code or category"
              className="w-full border border-line bg-raised px-3.5 py-3 text-sm"
              autoFocus
            />

            {picking && (
              <div className="mt-3 border border-[color:var(--brand)] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                    <Swatch hex={picking.colourHex} />{picking.name} · {inr(picking.mrp)}
                  </span>
                  <button className="btn-ghost !px-2" onClick={() => setPickingId(null)}>×</button>
                </div>
                <div className="label mb-1.5">Pick the size</div>
                <div className="flex flex-wrap gap-1.5">
                  {picking.sizes.map((sz) => {
                    const u = pickingUnits[sz] ?? 0;
                    return (
                      <button
                        key={sz}
                        disabled={u <= 0}
                        onClick={() => addLine(picking.id, sz)}
                        className={`min-w-[56px] border px-2 py-2 text-center transition-colors ${
                          u > 0 ? "border-line hover:border-[color:var(--brand)]" : "border-line opacity-35 cursor-not-allowed"
                        }`}
                      >
                        <div className="text-xs font-semibold text-ink">{sz}</div>
                        <div className="text-2xs text-muted num">{u > 0 ? `${u} left` : "0"}</div>
                      </button>
                    );
                  })}
                </div>
                {Object.values(pickingUnits).every((u) => u <= 0) && (
                  <div className="text-2xs mt-2" style={{ color: "var(--status-critical)" }}>
                    Nothing sellable here — use Save the Sale to bring it from a nearby store.
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 mt-3">
              {results.map((s) => {
                const rows = stockForStyleAtStore(app.storeId, s.id);
                const total = rows.reduce((a, r) => a + sellable(r), 0);
                return (
                  <button
                    key={s.id}
                    onClick={() => setPickingId(s.id)}
                    className="text-left border border-line p-2.5 hover:border-[color:var(--brand)] transition-colors"
                  >
                    <div className="h-1.5 mb-2" style={{ background: s.colourHex }} />
                    <div className="text-xs font-medium text-ink leading-snug min-h-[30px]">{s.name}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-sm font-semibold text-ink num">{inr(s.mrp)}</span>
                      <span className="text-2xs text-muted num">{total} pcs</span>
                    </div>
                  </button>
                );
              })}
              {results.length === 0 && <div className="col-span-full"><Empty title="No match" body="Try a category like denim, or the style code." /></div>}
            </div>
          </Card>

          {/* ── The bill ────────────────────────────────────────────────── */}
          <div className="space-y-3">
            {parked.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="label">On hold</span>
                {parked.map((p) => (
                  <button key={p.id} className="btn !py-1 !text-2xs" onClick={() => recall(p.id)}>
                    {p.id} · {p.lines.reduce((a, l) => a + l.qty, 0)} items — recall
                  </button>
                ))}
              </div>
            )}

            <Card className="p-0">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Current bill</span>
                <span className="text-2xs text-muted num">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
              </div>

              <div className="px-4 py-2 border-b border-line">
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="+ Attach customer (name or mobile)"
                  className="w-full bg-transparent text-sm py-1 outline-none placeholder:text-muted"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="px-4 py-10 text-center text-xs text-muted">Scan or tap a product to start the bill</div>
                ) : (
                  cart.map((l, i) => (
                    <div key={`${l.styleId}-${l.size}`} className="px-4 py-2.5 border-b border-[color:var(--grid)] flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-ink leading-snug">{l.name}</div>
                        <div className="text-2xs text-muted">Size {l.size} · {inr(l.mrp)}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button className="w-6 h-6 border border-line text-sm leading-none" onClick={() => bump(i, -1)}>−</button>
                        <span className="w-6 text-center text-sm num">{l.qty}</span>
                        <button className="w-6 h-6 border border-line text-sm leading-none" onClick={() => bump(i, 1)}>+</button>
                      </div>
                      <div className="w-16 text-right text-sm font-semibold text-ink num shrink-0">{inr(l.mrp * l.qty)}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Till Assist — the agent suggests, the cashier decides */}
              {suggestion && (
                <div className="px-4 py-2.5 border-b border-line flex items-center gap-2.5" style={{ background: "var(--brand-soft)" }}>
                  <span className="serif-accent text-sm shrink-0">Ai</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-ink leading-snug">Suggest <span className="font-medium">{suggestion.style.name}</span> · {inr(suggestion.style.mrp)}</div>
                    <div className="text-2xs text-muted">{suggestion.why}</div>
                  </div>
                  <button
                    className="btn !py-1 !text-2xs shrink-0"
                    onClick={() => {
                      const rows = stockForStyleAtStore(app.storeId, suggestion.style.id);
                      const first = rows.find((r) => sellable(r) > 0);
                      if (first) addLine(suggestion.style.id, first.size);
                    }}
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs text-ink2"><span>Subtotal</span><span className="num">{inr(subtotal)}</span></div>
                <div className="flex justify-between text-2xs text-muted"><span>Includes GST (12%)</span><span className="num">{inr(gst)}</span></div>
                <div className="flex justify-between text-base font-semibold text-ink pt-1.5 border-t border-line"><span>Total</span><span className="num">{inr(subtotal)}</span></div>
              </div>

              <div className="p-3 pt-0 grid grid-cols-3 gap-2">
                {(["UPI", "Card", "Cash"] as const).map((t) => (
                  <button key={t} className="btn-primary !py-3" disabled={cart.length === 0} onClick={() => charge(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                <button className="btn !py-2 !text-xs" disabled={cart.length === 0} onClick={hold}>Hold bill</button>
                <button className="btn !py-2 !text-xs" disabled={cart.length === 0} onClick={() => { setCart([]); setCustomer(""); }}>Clear</button>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <DayView v={v} bills={bills} billCount={billCount} storeId={app.storeId} onReprint={(id) => app.toastNow(`${id} reprinted`, "info")} />
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
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Sales today" value={inr(v.todaySales, { compact: true })} sub={`${billCount} bills`} emphasis freshness={1} />
        <Stat label="ATV" value={inr(v.atv)} sub={`UPT ${v.upt.toFixed(1)}`} />
        <Stat label="Conversion" value={pct(v.conversion, 1)} sub={`${v.footfall.toLocaleString("en-IN")} walk-ins`} tone={v.conversion >= 0.14 ? "good" : "warn"} />
        <Stat label="Customer capture" value={pct(captureRate)} tone={captureRate >= 0.8 ? "good" : "warn"} sub="Bills with a member attached" />
        <Stat label="Returns today" value={String(returnsToday)} tone={returnsToday > 1 ? "warn" : "good"} sub="Processed at this till" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
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
    </>
  );
}
