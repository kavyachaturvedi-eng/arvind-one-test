"use client";

// Bills & Returns — every bill from the last 30 days. Find it by phone,
// bill number or barcode scan, then return, refund or exchange with a reason.
// The manager sees how many returns and exchanges the store did.

import React, { useMemo, useState } from "react";
import { NOW, STYLES, rng } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, Modal, SectionTitle, Stat, StatusDot, Table, Td, Th, inr } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const FIRST = ["Ananya", "Vikram", "Priya", "Rahul", "Sneha", "Arjun", "Divya", "Karan", "Pooja", "Nikhil", "Ishita", "Rohan"];
const LAST = ["Mehta", "Iyer", "Kapoor", "Desai", "Nair", "Malhotra", "Reddy", "Bose", "Chopra", "Kulkarni", "Sinha", "Verma"];

export const RETURN_REASONS = ["Size does not fit", "Customer changed mind", "Defect or damage", "Wrong item billed", "Gift, not needed"];

export interface PastBill {
  id: string;
  dateLabel: string;
  daysAgo: number;
  phone: string;
  customer: string;
  items: { name: string; size: string; qty: number }[];
  total: number;
  tender: "UPI" | "Card" | "Cash";
  pointsEarned: number;
  pointsUsed: number;
  status: "billed" | "returned" | "exchanged";
  reason?: string;
}

/** 13 Aug minus N days, as a label. */
function dateLabel(daysAgo: number): string {
  const d = 13 - daysAgo;
  return d >= 1 ? `${d} Aug` : `${31 + d} Jul`;
}

/** The store's bills, last 30 days. Deterministic. */
export function pastBills(storeId: string): PastBill[] {
  const r = rng(hash("bills30" + storeId));
  const out: PastBill[] = [];
  for (let i = 0; i < 16; i++) {
    const daysAgo = Math.min(29, Math.floor(i * 1.9 + r() * 2));
    const lineCount = 1 + Math.floor(r() * 3);
    const items = Array.from({ length: lineCount }, () => {
      const s = STYLES[Math.floor(r() * STYLES.length)];
      return { name: s.name, size: s.sizes[Math.floor(r() * s.sizes.length)], qty: 1 + Math.floor(r() * 2), mrp: s.mrp };
    });
    const total = items.reduce((a, x) => a + x.mrp * x.qty, 0);
    const usedPts = r() < 0.3 ? Math.round((total * (0.05 + r() * 0.1)) / 25) * 100 : 0;
    out.push({
      id: `B-${4180 - i}`,
      dateLabel: dateLabel(daysAgo),
      daysAgo,
      phone: `98${String(10000000 + Math.floor(r() * 89999999)).slice(0, 8)}`,
      customer: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      items: items.map(({ name, size, qty }) => ({ name, size, qty })),
      total,
      tender: r() < 0.42 ? "UPI" : r() < 0.78 ? "Card" : "Cash",
      pointsEarned: Math.round(total / 100),
      pointsUsed: usedPts,
      status: i === 5 ? "exchanged" : i === 9 ? "returned" : "billed",
      reason: i === 5 ? "Size does not fit" : i === 9 ? "Defect or damage" : undefined,
    });
  }
  return out;
}

/** A member's own orders, by phone. Used by the Loyalty screen. */
export function ordersForPhone(phone: string): PastBill[] {
  const r = rng(hash("cust30" + phone));
  const n = 3 + Math.floor(r() * 3);
  return Array.from({ length: n }, (_, i) => {
    const daysAgo = Math.min(29, Math.floor(i * 6 + r() * 5));
    const s = STYLES[Math.floor(r() * STYLES.length)];
    const qty = 1 + Math.floor(r() * 2);
    const total = s.mrp * qty;
    const usedPts = r() < 0.35 ? Math.round((total * (0.05 + r() * 0.1)) / 25) * 100 : 0;
    return {
      id: `B-${4400 - (hash(phone) % 90) - i * 3}`,
      dateLabel: dateLabel(daysAgo),
      daysAgo,
      phone,
      customer: "",
      items: [{ name: s.name, size: s.sizes[Math.floor(r() * s.sizes.length)], qty }],
      total,
      tender: r() < 0.5 ? "UPI" : "Card",
      pointsEarned: Math.round(total / 100),
      pointsUsed: usedPts,
      status: "billed" as const,
    };
  });
}

export default function BillHistory() {
  const app = useApp();
  const manager = app.role === "store";
  const base = useMemo(() => pastBills(app.storeId), [app.storeId]);
  const [query, setQuery] = useState("");
  const [decided, setDecided] = useState<Record<string, { kind: "returned" | "exchanged"; reason: string }>>({});
  const [acting, setActing] = useState<{ bill: PastBill; kind: "returned" | "exchanged" } | null>(null);
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [refundMode, setRefundMode] = useState<"original" | "credit">("original");

  const rows = useMemo(() => {
    const withDecisions = base.map((b) => (decided[b.id] ? { ...b, status: decided[b.id].kind, reason: decided[b.id].reason } : b));
    const q = query.trim().toLowerCase();
    if (!q) return withDecisions;
    return withDecisions.filter(
      (b) => b.phone.includes(q) || b.id.toLowerCase().includes(q) || b.customer.toLowerCase().includes(q)
    );
  }, [base, decided, query]);

  const returned = rows.filter((b) => b.status === "returned");
  const exchanged = rows.filter((b) => b.status === "exchanged");
  const refundValue = returned.reduce((a, b) => a + b.total, 0);

  function confirmAction() {
    if (!acting) return;
    const { bill, kind } = acting;
    setDecided((d) => ({ ...d, [bill.id]: { kind, reason } }));
    const asCredit = kind === "returned" && refundMode === "credit";
    if (asCredit) {
      const note = {
        id: `CN-${2100 + app.creditNotes.length}`,
        phone: bill.phone,
        customer: bill.customer,
        amount: bill.total,
        balance: bill.total,
        againstBill: bill.id,
        issuedLabel: "Today",
      };
      app.dispatch({ type: "credit:issue", note });
    }
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action:
          kind === "returned"
            ? asCredit
              ? `${bill.id} returned, ${inr(bill.total)} issued as a credit note. Reason: ${reason}`
              : `${bill.id} returned, ${inr(bill.total)} refunded to ${bill.tender}. Reason: ${reason}`
            : `${bill.id} exchanged. Reason: ${reason}`,
        object: bill.id,
        system: "POS",
      },
    });
    app.toastNow(
      kind === "returned"
        ? asCredit
          ? `Credit note issued for ${inr(bill.total)}. It shows up on their next bill.`
          : `${inr(bill.total)} refunded to ${bill.tender}.`
        : `Exchange started for ${bill.id}. Bill the new item at the counter.`,
      "good"
    );
    setActing(null);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Bills &amp; Returns</h1>

      {/* The manager sees what left the till and what came back. */}
      {manager && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Bills, last 30 days" value={String(rows.length)} />
          <Stat label="Returns" value={String(returned.length)} tone={returned.length > 2 ? "warn" : "good"} sub={`${inr(refundValue, { compact: true })} refunded`} />
          <Stat label="Exchanges" value={String(exchanged.length)} sub={exchanged[0]?.reason ?? ""} />
        </div>
      )}

      <Card>
        <SectionTitle title="Find the bill" />
        <div className="flex gap-2 max-w-xl">
          <span className="grid place-items-center w-11 border border-line bg-[color:var(--plane)] text-lg shrink-0" aria-hidden>⌸</span>
          <input
            data-bill-search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Scan the bill barcode, or type the phone number or bill no."
            className="flex-1 rounded-lg border border-line bg-raised px-3 py-3 text-base text-ink placeholder:text-muted"
          />
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            <Empty title="No bill matches" body="Check the number, or scan the barcode on the bill." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th><Th>Customer</Th><Th>Items</Th>
                  <Th align="right">Amount</Th><Th align="right">Points</Th><Th>Status</Th><Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <div className="num text-sm font-semibold text-ink">{b.id}</div>
                      <div className="text-2xs text-muted">{b.dateLabel} · {b.tender}</div>
                    </Td>
                    <Td>
                      <div className="text-sm text-ink">{b.customer}</div>
                      <div className="text-2xs text-muted num">{b.phone}</div>
                    </Td>
                    <Td className="text-xs text-ink2">
                      {b.items.map((x) => (
                        <div key={x.name + x.size}>{x.qty} × {x.name} ({x.size})</div>
                      ))}
                    </Td>
                    <Td align="right" className="num text-sm font-semibold text-ink">{inr(b.total)}</Td>
                    <Td align="right" className="num text-xs">
                      <span style={{ color: "var(--status-good)" }}>+{b.pointsEarned}</span>
                      {b.pointsUsed > 0 && <span className="text-muted"> · −{b.pointsUsed}</span>}
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink">
                        <StatusDot tone={b.status === "billed" ? "good" : b.status === "returned" ? "critical" : "warn"} />
                        {b.status === "billed" ? "Billed" : b.status === "returned" ? "Returned" : "Exchanged"}
                      </span>
                      {b.reason && <div className="text-2xs text-muted mt-0.5">{b.reason}</div>}
                    </Td>
                    <Td align="right">
                      {b.status === "billed" ? (
                        <select
                          data-bill-action
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            setReason(RETURN_REASONS[0]);
                            setActing({ bill: b, kind: e.target.value as "returned" | "exchanged" });
                          }}
                          className="text-xs border border-line bg-raised px-2 py-2 text-ink"
                        >
                          <option value="" disabled>Choose…</option>
                          <option value="returned">Return &amp; refund</option>
                          <option value="exchanged">Exchange</option>
                        </select>
                      ) : (
                        <span className="text-2xs text-muted">Done</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {acting && (
        <Modal
          open
          onClose={() => setActing(null)}
          title={acting.kind === "returned" ? `Return & refund ${acting.bill.id}` : `Exchange ${acting.bill.id}`}
          footer={
            <>
              <button className="btn" onClick={() => setActing(null)}>Cancel</button>
              <button data-bill-confirm className="btn-primary" onClick={confirmAction}>
                {acting.kind === "returned"
                  ? refundMode === "credit"
                    ? `Issue a credit note for ${inr(acting.bill.total)}`
                    : `Refund ${inr(acting.bill.total)} to ${acting.bill.tender}`
                  : "Start the exchange"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <div className="label mb-1.5">Why is it coming back?</div>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink">
                {RETURN_REASONS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            {acting.kind === "returned" && (
              <div>
                <div className="label mb-1.5">How is the money going back?</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRefundMode("original")}
                    className={`border p-3 text-left ${refundMode === "original" ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line"}`}
                  >
                    <div className="text-sm font-medium text-ink">Refund to {acting.bill.tender}</div>
                    <div className="text-2xs text-muted mt-0.5">{inr(acting.bill.total)}</div>
                  </button>
                  <button
                    data-credit-note
                    onClick={() => setRefundMode("credit")}
                    className={`border p-3 text-left ${refundMode === "credit" ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line"}`}
                  >
                    <div className="text-sm font-medium text-ink">Credit note</div>
                    <div className="text-2xs text-muted mt-0.5">Use on any future bill</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
