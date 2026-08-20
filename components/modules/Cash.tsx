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
  const openingFloat = app.openFloat;

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

  const closed = app.dayClosed;

  // X-report is a mid-shift read, Z-report closes the day out.
  const [report, setReport] = useState<"X" | "Z" | null>(null);
  const cashExpected = openingFloat + modes[2].value;
  const [countText, setCountText] = useState("");
  const counted = Math.round((Number(countText) || 0) * 100) / 100;
  const variance = countText ? Math.round((counted - cashExpected) * 100) / 100 : 0;

  function clearOne(id: string) {
    app.dispatch({ type: "cash:update", id, patch: { status: "auto_cleared" } });
    app.toastNow("Cleared with the system's explanation attached", "good");
  }

  function closeDay() {
    app.dispatch({ type: "day:close", by: app.actorName });
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

      {/* ── Register reads and the physical count ─────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle
            title="Register reads"
            right={
              <div className="flex gap-2">
                <button data-x-report className="btn !py-1.5 !text-xs" onClick={() => setReport("X")}>X-report</button>
                <button data-z-report className="btn !py-1.5 !text-xs" disabled={!closed} onClick={() => setReport("Z")}>Z-report</button>
              </div>
            }
          />
          {report === null ? (
            <div className="text-xs text-muted py-2">Pick a read.</div>
          ) : (
            <div className="border border-line" data-report>
              <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-[color:var(--plane)]">
                <span className="label">{report}-report · {store.code}-01 · Thu 13 Aug 11:42</span>
                <Chip tone={report === "Z" ? "critical" : "brand"}>{report === "Z" ? "Closeout" : "Mid-shift read"}</Chip>
              </div>
              <div className="p-3 space-y-1.5 text-sm">
                {[
                  ["Gross sales", inr(v.todaySales)],
                  ["Bills", String(v.bills)],
                  ["UPI", inr(modes[0].value)],
                  ["Card", inr(modes[1].value)],
                  ["Cash", inr(modes[2].value)],
                  ["Opening float", inr(openingFloat)],
                  ["Cash expected in drawer", inr(cashExpected)],
                  ["Returns today", inr(Math.round(v.todaySales * 0.04))],
                ].map(([k, val]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-ink2">{k}</span>
                    <span className="num text-ink">{val}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-1 border-t border-line font-semibold">
                  <span className="text-ink">{report === "Z" ? "Banked and closed" : "Running total"}</span>
                  <span className="num text-ink">{inr(v.todaySales)}</span>
                </div>
              </div>
              <div className="px-3 py-2 border-t border-line flex gap-2">
                <button className="btn !py-1.5 !text-xs" onClick={() => app.toastNow(`${report}-report printed on the till printer`, "info")}>
                  Print
                </button>
                <button className="btn-ghost !text-xs" onClick={() => setReport(null)}>Close</button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="Count the drawer" right={<Chip tone={variance === 0 && countText ? "good" : countText ? "critical" : "neutral"}>{countText ? (variance === 0 ? "Matches" : "Variance") : "Not counted"}</Chip>} />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="border border-line p-3">
              <div className="label mb-1">System says</div>
              <div className="text-xl font-semibold num text-ink">{inr(cashExpected)}</div>
            </div>
            <div className="border border-line p-3">
              <div className="label mb-1">You counted</div>
              <input
                data-cash-count
                value={countText}
                onChange={(e) => setCountText(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full text-xl font-semibold num bg-transparent outline-none text-ink border-b border-line"
              />
            </div>
          </div>
          {countText && (
            <div className="border-l-2 pl-3 py-1" style={{ borderColor: variance === 0 ? "var(--status-good)" : "var(--status-critical)" }}>
              <div className="text-sm font-medium" style={{ color: variance === 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                {variance === 0 ? "Cash matches the system" : `${inr(Math.abs(variance))} ${variance < 0 ? "short" : "extra"}`}
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-line">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="label">Card terminals</div>
                <div className="text-sm text-ink mt-0.5">
                  {app.cardBatched ? "Batched and sent for settlement" : `${inr(modes[1].value)} on 2 terminals, not batched`}
                </div>
              </div>
              <button
                data-card-batch
                className="btn-primary !py-2 !text-xs"
                disabled={app.cardBatched}
                onClick={() => {
                  app.dispatch({ type: "card:batch" });
                  app.toastNow(`Terminals batched. ${inr(modes[1].value)} goes for settlement tonight.`, "good");
                }}
              >
                {app.cardBatched ? "✓ Batched" : "Batch terminals"}
              </button>
            </div>
          </div>
        </Card>
      </div>

    </div>
  );
}
