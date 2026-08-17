"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cash & Recon — the exception queue that explains itself.
//
// Today a third-party tender report shows a "shortage" that is really a bank
// timing difference. The store manager writes a justification note, hunts for a
// deposit slip, and emails cash & card figures to HO and RO every single day.
// The work is not the reconciliation — it is proving a negative after the fact.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { NOW, rng, storeById } from "@/lib/seed";
import { classifyCashDelta } from "@/lib/rules";
import { vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import {
  BarChart, Callout, Card, Chip, Delta, Meter, SectionTitle, Stat, StatusDot, Table, Td, Th, inr, pct,
} from "@/components/ui";
import type { CashException } from "@/lib/types";

/** Same demo calendar the engine uses: 13 August of a 31-day month. */
const DAY_OF_MONTH = 13;
const DAYS_IN_MONTH = 31;

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const STATUS_TONE: Record<CashException["status"], "good" | "warn" | "critical"> = {
  auto_cleared: "good", needs_review: "warn", escalated: "critical",
};
const STATUS_LABEL: Record<CashException["status"], string> = {
  auto_cleared: "Auto-cleared", needs_review: "Needs review", escalated: "Escalated",
};
const TENDER_TONE: Record<CashException["tender"], "neutral" | "brand" | "serious" | "warn"> = {
  Cash: "neutral", Card: "brand", UPI: "serious", "Gift Voucher": "warn",
};

/** Lines the matcher closed on its own overnight — the invisible 80% of the job. */
const MATCH_TEMPLATES = [
  ["Card", "Acquirer MDR matched to the contracted fee schedule for the settlement batch."],
  ["UPI", "PSP settled T+1 inside the normal window; reference matched on UTR."],
  ["Cash", "Deposit lodged before the 18:00 cut-off; bank credit posted the same evening."],
  ["Card", "EMI transaction settled net of the issuer subvention, per the rate card."],
  ["UPI", "Two collections netted into one bank credit; both invoices matched."],
  ["Gift Voucher", "Voucher redemption settled centrally by HO, not at store level."],
  ["Cash", "Denomination correction of ₹100 keyed at the till and re-counted at close."],
  ["Card", "Refund reversal landed a day late; matched to the original sale."],
] as const;

interface Slip { ref: string; lodgedAfterCutoff: boolean }

export default function Cash() {
  const app = useApp();
  const store = storeById(app.storeId);

  const [showMatched, setShowMatched] = useState(false);
  const [openRule, setOpenRule] = useState<string | null>(null);
  const [slips, setSlips] = useState<Record<string, Slip>>({});

  // ── Scope: this store, falling back to the whole estate if it has none ──────
  const scopedRaw = app.cash.filter((c) => c.storeId === app.storeId);
  const scoped = scopedRaw.length ? scopedRaw : app.cash;
  const scopeLabel = scopedRaw.length ? store.name : "All stores (this store had no mismatches today)";

  // ── The auto-matched lines nobody ever sees ────────────────────────────────
  const matched = useMemo(() => {
    const r = rng(hash(app.storeId) + 17);
    const n = 8 + Math.floor(r() * 4);
    return Array.from({ length: n }, (_, i) => {
      const [tender, reason] = MATCH_TEMPLATES[i % MATCH_TEMPLATES.length];
      return {
        id: `CM-${3100 + i}`,
        tender: tender as CashException["tender"],
        delta: -Math.round((40 + r() * 2600) / 10) * 10,
        reason,
        confidence: 0.94 + r() * 0.05,
      };
    });
  }, [app.storeId]);

  const cleared = scoped.filter((c) => c.status === "auto_cleared");
  const review = scoped.filter((c) => c.status === "needs_review");
  const escalated = scoped.filter((c) => c.status === "escalated");
  const totalLines = scoped.length + matched.length;
  const explained = cleared.length + matched.length;
  const needYou = review.length + escalated.length;
  const unexplained = [...review, ...escalated].reduce((a, c) => a + Math.abs(c.delta), 0);

  // ── Rule inputs, derived from the evidence attached to each line ───────────
  function ruleInputs(c: CashException) {
    const x = c.autoExplanation;
    const slip = slips[c.id];
    const hasDepositSlip = !!slip || (/deposit slip/i.test(x) && !/no deposit slip/i.test(x));
    return {
      delta: c.delta,
      hasDepositSlip,
      lodgedAfterCutoff: slip ? slip.lodgedAfterCutoff : /cut-off/i.test(x),
      matchesFeeSchedule: /fee schedule|MDR/i.test(x),
      ageHours: 12 + Math.floor(rng(hash(c.id))() * 14),
    };
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function accept(c: CashException) {
    app.dispatch({ type: "cash:update", id: c.id, patch: { status: "auto_cleared", confidence: Math.max(c.confidence, 0.95) } });
    app.dispatch({ type: "audit", entry: { at: NOW, actor: app.actorName, action: `Accepted the system explanation on ${c.id}`, object: `${c.tender} ${inr(c.delta)}`, system: "Arvind One" } });
    app.toastNow(`${c.id} cleared on the system's explanation, with evidence attached.`, "good");
  }

  function attachSlip(c: CashException) {
    const ref = String(88000 + Math.floor(rng(hash(c.id) + 5)() * 900));
    const next: Slip = { ref, lodgedAfterCutoff: true };
    const after = classifyCashDelta({ ...ruleInputs(c), hasDepositSlip: true, lodgedAfterCutoff: true });
    setSlips((s) => ({ ...s, [c.id]: next }));
    setOpenRule(c.id);
    app.dispatch({
      type: "cash:update", id: c.id,
      patch: {
        status: after.status, confidence: after.confidence,
        autoExplanation: `Deposit slip ${ref} attached, lodged after the 18:00 bank cut-off. Re-classified automatically: the delta of ${inr(Math.abs(c.delta))} is a timing difference, not a shortage. Original note: ${c.autoExplanation}`,
      },
    });
    app.toastNow(`Slip ${ref} attached — ${c.id} re-classified ${STATUS_LABEL[c.status].toLowerCase()} → ${STATUS_LABEL[after.status].toLowerCase()} at ${pct(after.confidence)} confidence.`, "good");
  }

  function escalate(c: CashException) {
    app.dispatch({ type: "cash:update", id: c.id, patch: { status: "escalated", confidence: Math.min(c.confidence, 0.45) } });
    app.dispatch({ type: "audit", entry: { at: NOW, actor: app.actorName, action: `Escalated ${c.id} to commercial`, object: `${c.tender} ${inr(c.delta)}`, system: "Arvind One" } });
    app.toastNow(`${c.id} escalated to commercial with the full evidence trail attached.`, "warn");
  }

  // ── Petty cash entitlement, from AFL's real rules ──────────────────────────
  const v = vitalsFor(app.storeId);
  const monthlyRevenue = (v.mtdSales / DAY_OF_MONTH) * DAYS_IN_MONTH;
  const imprest = monthlyRevenue <= 1_500_000 ? 20_000 : monthlyRevenue <= 2_000_000 ? 25_000 : 30_000;
  const rate = monthlyRevenue <= 3_000_000 ? 0.01 : monthlyRevenue <= 5_000_000 ? 0.007 : 0.005;
  const floor = monthlyRevenue <= 3_000_000 ? 10_000 : monthlyRevenue <= 5_000_000 ? 30_000 : 35_000;
  const limit = Math.max(Math.round(monthlyRevenue * rate), floor);

  const spend = useMemo(() => {
    const r = rng(hash(app.storeId) + 91);
    const total = Math.round(limit * (0.58 + r() * 0.5));
    const w = [0.34, 0.27, 0.23, 0.16];
    const cats = ["Food", "Alteration charges", "Housekeeping", "Printing & stationery"];
    const parts = cats.map((label, i) => ({ label, value: Math.round(total * w[i] / 100) * 100 }));
    return { total: parts.reduce((a, p) => a + p.value, 0), parts };
  }, [app.storeId, limit]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Cash &amp; Recon</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            Tender mismatches are matched against evidence overnight; only real exceptions reach you.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Exceptions today" value={String(scoped.length)} sub={scopeLabel} />
        <Stat label="Auto-cleared" value={`${cleared.length + matched.length}`} tone="good" sub={`${pct(explained / Math.max(1, totalLines))} of all mismatched lines`} />
        <Stat label="Needs review" value={String(review.length)} tone={review.length ? "warn" : undefined} sub="A human should actually look" />
        <Stat label="Escalated" value={String(escalated.length)} tone={escalated.length ? "critical" : "good"} sub="No evidence found anywhere" />
        <Stat label="Net unexplained" value={inr(unexplained)} sub="Everything else is evidenced" />
      </div>

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-lg font-semibold text-ink leading-snug">
              {totalLines} tender lines did not match. {explained} explained themselves. {needYou} need you.
            </div>
            <p className="text-xs text-ink2 mt-1 max-w-2xl">
              Matched overnight against the bank file, the acquirer settlement and the deposit slips. Evidenced lines are
              closed automatically; auto-matched lines are collapsed by default.
            </p>
          </div>
          <button className="btn" onClick={() => setShowMatched((s) => !s)}>
            {showMatched ? "Hide matched lines" : `Show all ${matched.length} matched lines`}
          </button>
        </div>

        {showMatched && (
          <div className="mt-3 rounded-lg border border-line p-3 space-y-2">
            {matched.map((m) => (
              <div key={m.id} className="flex items-center gap-3 flex-wrap text-xs">
                <StatusDot tone="good" />
                <span className="num text-muted w-16">{m.id}</span>
                <Chip tone={TENDER_TONE[m.tender]}>{m.tender}</Chip>
                <span className="num text-ink w-20">{inr(m.delta)}</span>
                <span className="text-ink2 flex-1 min-w-[200px]">{m.reason}</span>
                <span className="num text-muted">{pct(m.confidence)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Exceptions to review"
          sub="Each line arrives with a proposed reason, its evidence and a confidence score."
        />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th><Th>Tender</Th><Th align="right">POS</Th><Th align="right">Bank</Th><Th align="right">Delta</Th>
              <Th>Status</Th><Th>Confidence</Th><Th>Explanation &amp; actions</Th>
            </tr>
          </thead>
          <tbody>
            {scoped.map((c) => {
              const inputs = ruleInputs(c);
              const out = classifyCashDelta(inputs);
              const slip = slips[c.id];
              return (
                <tr key={c.id} className="align-top">
                  <Td><span className="text-xs text-ink2">{c.date}</span><div className="text-2xs text-muted num">{c.id}</div></Td>
                  <Td><Chip tone={TENDER_TONE[c.tender]}>{c.tender}</Chip></Td>
                  <Td align="right"><span className="num text-xs text-ink">{inr(c.posAmount)}</span></Td>
                  <Td align="right"><span className="num text-xs text-ink">{inr(c.bankAmount)}</span></Td>
                  <Td align="right">
                    <Delta value={c.delta / 1000} suffix="k" />
                    <div className="text-2xs text-muted num">{inr(c.delta)}</div>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink2 whitespace-nowrap">
                      <StatusDot tone={STATUS_TONE[c.status]} />{STATUS_LABEL[c.status]}
                    </span>
                  </Td>
                  <Td className="min-w-[92px]">
                    <ConfBar value={c.confidence} />
                  </Td>
                  <Td className="max-w-[420px]">
                    <p className="text-xs text-ink2 leading-relaxed">{c.autoExplanation}</p>
                    {slip && (
                      <p className="text-2xs mt-1" style={{ color: "var(--success-text)" }}>
                        Deposit slip {slip.ref} attached and matched — status recomputed live by the same rule.
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {c.status !== "auto_cleared" && <button className="btn-primary" onClick={() => accept(c)}>Accept explanation</button>}
                      {!slip && <button className="btn" onClick={() => attachSlip(c)}>Attach deposit slip</button>}
                      {c.status !== "escalated" && <button className="btn" onClick={() => escalate(c)}>Escalate to commercial</button>}
                      <button className="btn-ghost" onClick={() => setOpenRule(openRule === c.id ? null : c.id)}>
                        {openRule === c.id ? "Hide" : "How this was classified"}
                      </button>
                    </div>

                    {openRule === c.id && (
                      <div className="mt-2 rounded-lg border border-line bg-[color:var(--plane)] p-2.5">
                        <div className="label mb-1.5">classifyCashDelta — inputs</div>
                        <dl className="text-2xs text-ink2 grid grid-cols-2 gap-x-3 gap-y-0.5 num">
                          <div className="flex justify-between gap-2"><dt>delta</dt><dd className="text-ink">{inr(inputs.delta)}</dd></div>
                          <div className="flex justify-between gap-2"><dt>hasDepositSlip</dt><dd className="text-ink">{String(inputs.hasDepositSlip)}</dd></div>
                          <div className="flex justify-between gap-2"><dt>lodgedAfterCutoff</dt><dd className="text-ink">{String(inputs.lodgedAfterCutoff)}</dd></div>
                          <div className="flex justify-between gap-2"><dt>matchesFeeSchedule</dt><dd className="text-ink">{String(inputs.matchesFeeSchedule)}</dd></div>
                          <div className="flex justify-between gap-2"><dt>ageHours</dt><dd className="text-ink">{inputs.ageHours}h</dd></div>
                        </dl>
                        <div className="label mt-2 mb-1">outputs</div>
                        <div className="text-2xs text-ink2">
                          status <strong className="text-ink">{STATUS_LABEL[out.status]}</strong> · confidence{" "}
                          <strong className="text-ink num">{pct(out.confidence)}</strong>
                        </div>
                        <p className="text-2xs text-muted mt-1.5 leading-relaxed">
                          A fee-schedule match clears outright. A deposit slip lodged after the bank cut-off clears as a
                          timing difference. No slip and ₹5,000 or more escalates. Everything else waits for a person.
                          Argue with the thresholds — that is why they are written down here rather than in a slide.
                        </p>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle
            title="Petty cash — imprest and monthly limit"
            sub={`Entitlement computed from this store's revenue run-rate of ${inr(monthlyRevenue, { compact: true })} a month (${inr(monthlyRevenue * 12, { compact: true })} annualised), not from a circular nobody can find.`}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <div className="label mb-1">Imprest advance</div>
              <div className="text-[22px] font-semibold text-ink num leading-none">{inr(imprest)}</div>
              <div className="text-2xs text-muted mt-1.5 leading-relaxed">
                ≤₹15 L → ₹20,000 · ₹15–20 L → ₹25,000 · &gt;₹20 L → ₹30,000. This store falls in the{" "}
                {monthlyRevenue <= 1_500_000 ? "first" : monthlyRevenue <= 2_000_000 ? "second" : "third"} band.
              </div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="label mb-1">Monthly spend limit</div>
              <div className="text-[22px] font-semibold text-ink num leading-none">{inr(limit)}</div>
              <div className="text-2xs text-muted mt-1.5 leading-relaxed">
                Higher of {pct(rate, 1)} of revenue ({inr(Math.round(monthlyRevenue * rate))}) and the {inr(floor)} floor.
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-ink2 mb-1.5">
              <span>Spent to date this month</span>
              <span className="num text-ink font-semibold">{inr(spend.total)} of {inr(limit)}</span>
            </div>
            <Meter value={spend.total} target={limit} />
            <div className="text-2xs text-muted mt-1">
              {spend.total <= limit
                ? `${inr(limit - spend.total)} of headroom left with ${DAYS_IN_MONTH - DAY_OF_MONTH} days to run.`
                : `${inr(spend.total - limit)} over the limit — flagged to commercial the day it crossed, not at month end.`}
            </div>
          </div>

          <div className="mt-3">
            <div className="label mb-2">By category</div>
            <BarChart data={spend.parts} format={(n) => inr(n, { compact: true })} color="var(--series-3)" />
          </div>

        </Card>
      </div>
    </div>
  );
}

// ── Confidence bar ───────────────────────────────────────────────────────────

function ConfBar({ value }: { value: number }) {
  const tone = value >= 0.9 ? "var(--status-good)" : value >= 0.55 ? "var(--status-warning)" : "var(--status-critical)";
  return (
    <div>
      <div className="h-1.5 rounded-full bg-[color:var(--plane)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: tone }} />
      </div>
      <div className="text-2xs num mt-1" style={{ color: "var(--text-muted)" }}>{pct(value)} confident</div>
    </div>
  );
}
