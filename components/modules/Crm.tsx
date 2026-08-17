"use client";

// Customers & Loyalty — capture at billing, loyalty balances, and the
// call-list the store works today.

import React, { useMemo, useState } from "react";
import { NOW, rng, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { BarChart, Card, Chip, Empty, SectionTitle, Stat, StatusDot, Table, Td, Th, inr, pct } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const FIRST = ["Ananya", "Vikram", "Priya", "Rahul", "Sneha", "Arjun", "Divya", "Karan", "Pooja", "Nikhil", "Ishita", "Rohan"];
const LAST = ["Mehta", "Iyer", "Kapoor", "Desai", "Nair", "Malhotra", "Reddy", "Bose", "Chopra", "Kulkarni", "Sinha", "Verma"];

interface Customer {
  name: string;
  phone: string;
  tier: "Platinum" | "Gold" | "Silver";
  points: number;
  spend12m: number;
  visits12m: number;
  lastVisitDays: number;
  reason: "Birthday this week" | "Anniversary this week" | "Lapsing — 90+ days" | "Points expiring";
}

function buildCustomers(storeId: string): Customer[] {
  const r = rng(hash("crm" + storeId));
  const reasons: Customer["reason"][] = ["Birthday this week", "Anniversary this week", "Lapsing — 90+ days", "Points expiring"];
  const out: Customer[] = [];
  for (let i = 0; i < 8; i++) {
    const tier = r() < 0.2 ? "Platinum" : r() < 0.55 ? "Gold" : "Silver";
    out.push({
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      phone: `98${String(10000000 + Math.floor(r() * 89999999)).slice(0, 8)}`,
      tier,
      points: 200 + Math.floor(r() * 4200),
      spend12m: Math.round((14000 + r() * 160000) / 100) * 100,
      visits12m: 2 + Math.floor(r() * 14),
      lastVisitDays: 4 + Math.floor(r() * 130),
      reason: reasons[i % reasons.length],
    });
  }
  return out.sort((a, b) => b.spend12m - a.spend12m);
}

export default function Crm() {
  const app = useApp();
  const store = storeById(app.storeId);
  const customers = useMemo(() => buildCustomers(app.storeId), [app.storeId]);
  const [contacted, setContacted] = useState<string[]>([]);

  const r = rng(hash("crmk" + app.storeId));
  const captureRate = 0.62 + r() * 0.3;
  const repeatShare = 0.24 + r() * 0.22;
  const members = 1800 + Math.floor(r() * 5200);
  const newToday = 2 + Math.floor(r() * 9);
  const pointsLiability = members * (140 + r() * 260);

  const tierMix = [
    { label: "Platinum", value: Math.round(members * 0.06) },
    { label: "Gold", value: Math.round(members * 0.27) },
    { label: "Silver", value: Math.round(members * 0.67) },
  ];

  function contact(c: Customer) {
    setContacted((x) => [...x, c.phone]);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `Loyalty outreach sent to ${c.name} (${c.reason})`, object: c.phone, system: "Capillary" },
    });
    app.toastNow(`Offer sent to ${c.name} on WhatsApp`, "good");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Customers &amp; Loyalty</h1>
        <p className="text-sm text-ink2 mt-1">Capture at billing, and today&apos;s outreach list — {store.name}.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Capture rate today" value={pct(captureRate)} tone={captureRate >= 0.8 ? "good" : "warn"} sub="Bills with a customer attached" emphasis />
        <Stat label="Members" value={members.toLocaleString("en-IN")} sub={`+${newToday} new today`} />
        <Stat label="Repeat share" value={pct(repeatShare)} sub="Of this month's bills" />
        <Stat label="Points liability" value={inr(pointsLiability, { compact: true })} sub="Outstanding, this store" />
        <Stat label="To contact today" value={String(customers.length - contacted.length)} tone={customers.length - contacted.length > 0 ? "warn" : "good"} sub="Birthdays, lapsing, expiring points" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <SectionTitle title="Contact today" right={<Chip tone={contacted.length === customers.length ? "good" : "warn"}>{contacted.length}/{customers.length} done</Chip>} />
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th><Th>Why today</Th><Th align="right">12-m spend</Th>
                <Th align="right">Points</Th><Th align="right">Last visit</Th><Th align="right" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const done = contacted.includes(c.phone);
                return (
                  <tr key={c.phone}>
                    <Td>
                      <div className="text-sm text-ink">{c.name}</div>
                      <div className="text-2xs text-muted num">{c.phone} · <Chip tone={c.tier === "Platinum" ? "brand" : "neutral"}>{c.tier}</Chip></div>
                    </Td>
                    <Td className="text-xs text-ink2">{c.reason}</Td>
                    <Td align="right" className="num text-xs">{inr(c.spend12m, { compact: true })}</Td>
                    <Td align="right" className="num text-xs">{c.points.toLocaleString("en-IN")}</Td>
                    <Td align="right" className="num text-xs">{c.lastVisitDays}d ago</Td>
                    <Td align="right">
                      {done ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink2"><StatusDot tone="good" />Sent</span>
                      ) : (
                        <button className="btn-primary !py-1.5 !text-xs" onClick={() => contact(c)}>Send offer</button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {customers.length === 0 && <Empty title="No outreach due today" />}
        </Card>

        <Card>
          <SectionTitle title="Member base" />
          <BarChart data={tierMix} format={(n) => n.toLocaleString("en-IN")} />
          <div className="mt-4 pt-3 border-t border-line space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted">Avg member ATV vs walk-in</span><span className="num font-semibold text-ink">1.4×</span></div>
            <div className="flex justify-between"><span className="text-muted">Redemption rate, 90 days</span><span className="num font-semibold text-ink">{pct(0.18 + r() * 0.2)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Referrals this month</span><span className="num font-semibold text-ink">{3 + Math.floor(r() * 18)}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
