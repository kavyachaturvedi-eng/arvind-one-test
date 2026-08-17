"use client";

// Billing / POS — today's till: bills, tender mix, returns, hourly run-rate.

import React, { useMemo, useState } from "react";
import { NOW, STYLES, rng, storeById } from "@/lib/seed";
import { sellable, stockForStyleAtStore, stylesAtStore, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, ColumnChart, Empty, Modal, SectionTitle, SizeGrid, Stat, StatusDot, Table, Td, Th, fmtTime, inr, pct } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

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

export default function Pos() {
  const app = useApp();
  const store = storeById(app.storeId);
  const v = vitalsFor(app.storeId);
  const seeded = useMemo(() => buildBills(app.storeId, v.todaySales, v.bills), [app.storeId, v.todaySales, v.bills]);
  const [newBills, setNewBills] = useState<Bill[]>([]);
  const [parked, setParked] = useState<{ id: string; note: string }[]>([]);
  const [billOpen, setBillOpen] = useState(false);

  const bills = useMemo(() => [...newBills, ...seeded], [newBills, seeded]);
  const newSales = newBills.reduce((a, b) => a + b.value, 0);
  const salesToday = v.todaySales + newSales;
  const billCount = v.bills + newBills.length;
  const atv = salesToday / Math.max(1, billCount);

  const r = rng(hash("posx" + app.storeId));
  const upiShare = 0.34 + r() * 0.18;
  const cardShare = 0.36 + r() * 0.14;
  const cashShare = Math.max(0.08, 1 - upiShare - cardShare);
  const returnsToday = bills.filter((b) => b.status === "returned").length;
  const captureRate = 0.62 + r() * 0.3;

  function createBill(b: { styleId: string; size: string; qty: number; tender: Bill["tender"]; customer: string }) {
    const style = STYLES.find((s) => s.id === b.styleId)!;
    const bill: Bill = {
      id: `B-${4300 + newBills.length}`,
      at: NOW,
      items: b.qty,
      value: style.mrp * b.qty,
      tender: b.tender,
      customer: b.customer || undefined,
      status: "billed",
    };
    setNewBills((x) => [bill, ...x]);
    setBillOpen(false);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `Bill ${bill.id} — ${b.qty} × ${style.name} (${b.size}), ${inr(bill.value)} by ${b.tender}`, object: bill.id, system: "POS" },
    });
    app.toastNow(`${bill.id} billed — ${inr(bill.value)}${b.customer ? ` · ${b.customer} captured` : ""}`, "good");
  }

  const hours = ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"];
  const curve = hours.map((_, i) => {
    const rr = rng(hash(app.storeId + "h" + i));
    const peak = i >= 8 ? 1.5 : i >= 4 ? 1.0 : 0.55;
    return Math.round((v.todaySales / 10) * peak * (0.7 + rr() * 0.6) / 100) * 100;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Billing</h1>
          <p className="text-sm text-ink2 mt-1">Till {store.code}-01 · day open since 11:03.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={() => {
              setParked((x) => [...x, { id: `P-${x.length + 1}`, note: `Parked bill ${x.length + 1}` }]);
              app.toastNow("Bill parked — recall it below when the customer returns", "info");
            }}
          >
            Park bill{parked.length ? ` (${parked.length})` : ""}
          </button>
          <button className="btn-primary" onClick={() => setBillOpen(true)}>New bill</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Sales today" value={inr(salesToday, { compact: true })} sub={`${billCount} bills`} emphasis freshness={1} />
        <Stat label="ATV" value={inr(atv)} sub={`UPT ${v.upt.toFixed(1)}`} />
        <Stat label="Conversion" value={pct(v.conversion, 1)} sub={`${v.footfall.toLocaleString("en-IN")} walk-ins`} tone={v.conversion >= 0.14 ? "good" : "warn"} />
        <Stat label="Customer capture" value={pct(captureRate)} tone={captureRate >= 0.8 ? "good" : "warn"} sub="Bills with a member attached" />
        <Stat label="Returns today" value={String(returnsToday)} tone={returnsToday > 1 ? "warn" : "good"} sub="Processed at this till" />
      </div>

      {parked.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="label">Parked bills</span>
            {parked.map((pb) => (
              <button
                key={pb.id}
                className="btn !py-1 !text-2xs"
                onClick={() => {
                  setParked((x) => x.filter((y) => y.id !== pb.id));
                  setBillOpen(true);
                  app.toastNow(`${pb.note} recalled to the till`, "info");
                }}
              >
                ⏸ {pb.note} — resume
              </button>
            ))}
          </div>
        </Card>
      )}

      <NewBillModal open={billOpen} onClose={() => setBillOpen(false)} onCreate={createBill} storeId={app.storeId} />

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
                      <button className="btn !py-1 !text-2xs" onClick={() => app.toastNow(`${b.id} reprinted`, "info")}>Reprint</button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {bills.length === 0 && <Empty title="No bills yet" />}
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
            <div className="mt-2 text-2xs text-muted">Cash in till: {inr(Math.round(v.todaySales * cashShare / 100) * 100)}</div>
          </Card>

          <Card>
            <SectionTitle title="Hourly run-rate" />
            <ColumnChart categories={hours} series={[{ name: "Sales", color: "var(--series-1)", values: curve }]} format={(n) => inr(n, { compact: true })} height={110} />
          </Card>

          <Card>
            <SectionTitle title="Top styles at the till" />
            <Table>
              <tbody>
                {STYLES.slice(0, 4).map((s, i) => (
                  <tr key={s.id}>
                    <Td className="text-xs text-ink">{s.name}</Td>
                    <Td align="right" className="num text-xs">{4 - i} sold</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── New bill — the native POS flow ───────────────────────────────────────────

function NewBillModal({
  open,
  onClose,
  onCreate,
  storeId,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (b: { styleId: string; size: string; qty: number; tender: "Card" | "UPI" | "Cash"; customer: string }) => void;
  storeId: string;
}) {
  const carried = useMemo(() => stylesAtStore(storeId), [storeId]);
  const [styleId, setStyleId] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [tender, setTender] = useState<"Card" | "UPI" | "Cash">("UPI");
  const [customer, setCustomer] = useState("");
  const [scan, setScan] = useState("");

  const style = carried.find((s) => s.id === styleId) ?? null;
  const units: Record<string, number> = {};
  if (style) for (const r of stockForStyleAtStore(storeId, style.id)) units[r.size] = sellable(r);
  const canBill = !!style && !!size && (units[size] ?? 0) >= qty;

  function reset() {
    setStyleId("");
    setSize("");
    setQty(1);
    setCustomer("");
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New bill"
      sub="Scan or pick the item. Stock and loyalty update on billing."
      footer={
        <>
          <button className="btn" onClick={() => { reset(); onClose(); }}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!canBill}
            onClick={() => { if (style && size) { onCreate({ styleId: style.id, size, qty, tender, customer }); reset(); } }}
          >
            {style && size ? `Bill ${inr(style.mrp * qty)} by ${tender}` : "Bill"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label block mb-1">Scan barcode</label>
          <input
            value={scan}
            onChange={(e) => setScan(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const hit = carried.find((st) => st.id.toUpperCase() === scan.trim().toUpperCase());
              if (hit) {
                setStyleId(hit.id);
                setSize("");
                setScan("");
              }
            }}
            placeholder="Scan or type a style code and press Enter — e.g. TO-POL-4000"
            className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-sm num"
            autoFocus
          />
        </div>
        <div>
          <label className="label block mb-1">Or pick the item</label>
          <select
            value={styleId}
            onChange={(e) => { setStyleId(e.target.value); setSize(""); }}
            className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
          >
            <option value="">Pick a style…</option>
            {carried.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.id} · {inr(s.mrp)}</option>
            ))}
          </select>
        </div>

        {style && (
          <div>
            <label className="label block mb-1.5">Size — sellable units shown</label>
            <SizeGrid sizes={style.sizes} units={units} core={style.coreSizes} selected={size || undefined} onPick={(s) => setSize(s)} />
            {size && (units[size] ?? 0) === 0 && (
              <div className="text-2xs mt-1.5" style={{ color: "var(--status-critical)" }}>
                Zero here — use Save the Sale to bring it in for the customer.
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label block mb-1">Qty</label>
            <input
              type="number"
              min={1}
              max={9}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
              className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm num"
            />
          </div>
          <div>
            <label className="label block mb-1">Tender</label>
            <select
              value={tender}
              onChange={(e) => setTender(e.target.value as "Card" | "UPI" | "Cash")}
              className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
            >
              <option>UPI</option>
              <option>Card</option>
              <option>Cash</option>
            </select>
          </div>
          <div>
            <label className="label block mb-1">Customer (optional)</label>
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Name or mobile"
              className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
