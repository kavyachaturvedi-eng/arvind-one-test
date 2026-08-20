"use client";

// Offers — what is running today, in the words a cashier can say at the
// counter, plus every coupon code and whether it will actually work.
// Published by Commercial and the campaign team; the store only reads it.

import React, { useState } from "react";
import { COUPONS, OFFERS, applyCoupon } from "@/lib/offers";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th, inr } from "@/components/ui";

export default function Offers() {
  const app = useApp();
  const [code, setCode] = useState("");
  const [checked, setChecked] = useState<{ code: string; ok: boolean; message: string; amount: number } | null>(null);

  const SAMPLE_BILL = 4999;

  function check() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const res = applyCoupon(c, SAMPLE_BILL);
    setChecked({ code: c, ok: res.ok, message: res.message, amount: res.amount });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Offers</h1>
        <Chip tone="neutral">Published by Commercial</Chip>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Running now" value={String(OFFERS.length)} emphasis />
        <Stat label="Ending this week" value={String(OFFERS.filter((o) => /days left|Sunday/.test(o.endsIn)).length)} tone="warn" />
        <Stat label="Coupon codes live" value={String(COUPONS.filter((c) => !c.blocked).length)} />
      </div>

      <Card>
        <SectionTitle title="What to tell the customer" />
        <div className="space-y-2.5">
          {OFFERS.map((o) => (
            <div key={o.id} className="border border-line p-3.5" data-offer>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Chip tone={o.kind === "Clearance" ? "critical" : o.kind === "Loyalty" ? "brand" : "neutral"}>{o.kind}</Chip>
                    <span className="text-2xs text-muted">{o.endsIn}</span>
                  </div>
                  <div className="text-[15px] font-semibold text-ink leading-snug">{o.name}</div>
                  <div className="text-sm text-ink2 mt-1 leading-relaxed">&ldquo;{o.says}&rdquo;</div>
                  <div className="text-2xs text-muted mt-1.5">{o.applies}</div>
                  {o.note && (
                    <div className="flex items-start gap-2 mt-2 text-2xs" style={{ color: "var(--status-warning)" }}>
                      <StatusDot tone="warn" />
                      <span>{o.note}</span>
                    </div>
                  )}
                </div>
                <button className="btn !py-1.5 !text-xs shrink-0" onClick={() => app.go("pos")}>
                  Use at billing
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle title="Check a coupon code" />
          <div className="flex gap-2">
            <input
              data-coupon-check-input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && check()}
              placeholder="Type the code from the customer's message"
              className="flex-1 rounded-lg border border-line bg-raised px-3 py-3 text-base num tracking-wide"
            />
            <button data-coupon-check className="btn-primary !px-5" onClick={check}>Check</button>
          </div>
          {checked && (
            <div
              className="mt-3 border-l-2 pl-3 py-1.5"
              style={{ borderColor: checked.ok ? "var(--status-good)" : "var(--status-critical)" }}
              data-coupon-result
            >
              <div className="text-sm font-medium" style={{ color: checked.ok ? "var(--status-good)" : "var(--status-critical)" }}>
                {checked.ok ? `${checked.code} works: ${inr(checked.amount)} off` : `${checked.code} will not apply`}
              </div>
              <div className="text-xs text-ink2 mt-0.5">{checked.message}</div>
            </div>
          )}
          <div className="text-2xs text-muted mt-3">
            Checked against a {inr(SAMPLE_BILL)} bill. The till re-checks it against the real total at payment.
          </div>
        </Card>

        <Card>
          <SectionTitle title="All codes" right={<Chip>{COUPONS.length}</Chip>} />
          <Table>
            <thead>
              <tr><Th>Code</Th><Th>What it gives</Th><Th align="right">Minimum bill</Th><Th align="right">Status</Th></tr>
            </thead>
            <tbody>
              {COUPONS.map((c) => (
                <tr key={c.code}>
                  <Td className="num text-sm font-semibold text-ink">{c.code}</Td>
                  <Td className="text-xs text-ink2">{c.label}</Td>
                  <Td align="right" className="num text-xs">{c.minBill ? inr(c.minBill) : "None"}</Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                      <StatusDot tone={c.blocked ? "critical" : "good"} />
                      {c.blocked ? "Closed" : "Live"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
