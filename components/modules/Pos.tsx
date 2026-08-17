"use client";

// Billing / POS — today's till: bills, tender mix, returns, hourly run-rate.

import React, { useMemo, useState } from "react";
import { NOW, STYLES, rng, storeById } from "@/lib/seed";
import { vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, ColumnChart, Empty, SectionTitle, Stat, StatusDot, Table, Td, Th, fmtTime, inr, pct } from "@/components/ui";

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
    const value = i === shown - 1 ? Math.max(800, Math.round(remaining / 100) * 100) : Math.round((todaySales / billCount) * (0.5 + r()) / 100) * 100;
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
  const bills = useMemo(() => buildBills(app.storeId, v.todaySales, v.bills), [app.storeId, v.todaySales, v.bills]);
  const [held, setHeld] = useState(false);

  const r = rng(hash("posx" + app.storeId));
  const upiShare = 0.34 + r() * 0.18;
  const cardShare = 0.36 + r() * 0.14;
  const cashShare = Math.max(0.08, 1 - upiShare - cardShare);
  const returnsToday = bills.filter((b) => b.status === "returned").length;
  const captureRate = 0.62 + r() * 0.3;

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
          <button className="btn" onClick={() => { setHeld(true); app.toastNow("Bill parked — recall it from the till", "info"); }}>
            {held ? "1 bill parked" : "Park bill"}
          </button>
          <button className="btn-primary" onClick={() => app.toastNow("New bill started on till 01", "good")}>New bill</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Sales today" value={inr(v.todaySales, { compact: true })} sub={`${v.bills} bills`} emphasis freshness={1} />
        <Stat label="ATV" value={inr(v.atv)} sub={`UPT ${v.upt.toFixed(1)}`} />
        <Stat label="Conversion" value={pct(v.conversion, 1)} sub={`${v.footfall.toLocaleString("en-IN")} walk-ins`} tone={v.conversion >= 0.14 ? "good" : "warn"} />
        <Stat label="Customer capture" value={pct(captureRate)} tone={captureRate >= 0.8 ? "good" : "warn"} sub="Bills with a member attached" />
        <Stat label="Returns today" value={String(returnsToday)} tone={returnsToday > 1 ? "warn" : "good"} sub="Processed at this till" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <SectionTitle title="Bills" right={<Chip>{v.bills} today</Chip>} />
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
