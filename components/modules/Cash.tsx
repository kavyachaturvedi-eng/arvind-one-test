"use client";

// Cash. The manager's four questions, answered without a spreadsheet:
// what went to the bank yesterday, what we opened with, what didn't match,
// and how today's money is coming in. Then close the day.

import React, { useState } from "react";
import { NOW, rng, storeById } from "@/lib/seed";
import { vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { BarChart, Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th, inr } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

export default function Cash() {
  const app = useApp();
  const store = storeById(app.storeId);
  const v = vitalsFor(app.storeId);
  const r = rng(hash("cashx" + app.storeId));

  // Yesterday's money, deterministic.
  const yesterdaySales = Math.round(v.todaySales * (0.9 + r() * 0.3));
  const cashShare = 0.24 + r() * 0.1;
  const depositedYesterday = Math.round(yesterdaySales * cashShare);
  const openingFloat = 8000;

  // Today so far, by payment mode.
  const upiShare = 0.42 + r() * 0.08;
  const cardShare = 0.28 + r() * 0.06;
  const modes = [
    { label: "UPI", value: Math.round(v.todaySales * upiShare) },
    { label: "Card", value: Math.round(v.todaySales * cardShare) },
    { label: "Cash", value: Math.round(v.todaySales * (1 - upiShare - cardShare)) },
  ];

  const scopedRaw = app.cash.filter((c) => c.storeId === app.storeId);
  const scoped = scopedRaw.length ? scopedRaw : app.cash;
  const open = scoped.filter((c) => c.status !== "auto_cleared");

  const [closed, setClosed] = useState(false);

  function clearOne(id: string) {
    app.dispatch({ type: "cash:update", id, patch: { status: "auto_cleared" } });
    app.toastNow("Cleared with the system's explanation attached", "good");
  }

  function closeDay() {
    setClosed(true);
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `Day closed at ${store.name}: ${inr(v.todaySales)} billed, cash for deposit ${inr(modes[2].value)}. Summary posted to SAP Finance.`,
        object: "day-close",
        system: "Arvind One",
      },
    });
    app.toastNow("Day closed. Deposit slip printed, summary posted to Finance.", "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Cash</h1>
        <div className="flex items-center gap-2">
          {app.dayOpen ? <Chip tone="good">● Day open · 10:02</Chip> : (
            <button
              className="btn"
              onClick={() => {
                app.dispatch({ type: "day:open", by: app.actorName });
                app.toastNow("Day opened. Float confirmed.", "good");
              }}
            >
              ☀ Open the day
            </button>
          )}
          <button data-close-day className="btn-primary" disabled={closed} onClick={closeDay}>
            {closed ? "✓ Day closed" : "Close the day"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Deposited yesterday" value={inr(depositedYesterday, { compact: true })} sub="Banked before the 18:00 cut-off" tone="good" emphasis />
        <Stat label="Opening float today" value={inr(openingFloat)} sub="Counted and sealed at day open" />
        <Stat label="Mismatches to review" value={String(open.length)} tone={open.length ? "warn" : "good"} sub={open.length ? "Each has an explanation ready" : "Everything matched"} />
        <Stat label="Billed today" value={inr(v.todaySales, { compact: true })} sub={`${v.bills} bills so far`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle title="Today's money, by payment mode" />
          <BarChart data={modes} format={(n) => inr(n, { compact: true })} />
          <div className="text-2xs text-muted mt-3">
            Cash line becomes tomorrow's deposit. UPI and card settle to the bank on their own.
          </div>
        </Card>

        <Card>
          <SectionTitle title="Mismatches" right={<Chip tone={open.length ? "warn" : "good"}>{open.length} open</Chip>} />
          {open.length === 0 ? (
            <div className="flex items-center gap-2.5 text-sm text-ink2 py-3">
              <StatusDot tone="good" /> Nothing to review. The matcher cleared everything overnight.
            </div>
          ) : (
            <Table>
              <thead>
                <tr><Th>What</Th><Th align="right">Difference</Th><Th align="right" /></tr>
              </thead>
              <tbody>
                {open.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <div className="text-sm text-ink">{c.tender} · {c.date}</div>
                      <div className="text-2xs text-muted mt-0.5 leading-snug max-w-sm">{c.autoExplanation.replace(/\s—\s/g, ". ")}</div>
                    </Td>
                    <Td align="right">
                      <span className="num text-sm font-semibold" style={{ color: c.delta < 0 ? "var(--status-critical)" : "var(--status-good)" }}>
                        {inr(c.delta)}
                      </span>
                    </Td>
                    <Td align="right">
                      <button className="btn !py-1.5 !text-xs" onClick={() => clearOne(c.id)}>Accept &amp; clear</button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="text-2xs text-muted">
        Closing the day posts one summary to Finance. No emails, no justification notes, no hunting for deposit slips.
      </div>
    </div>
  );
}
