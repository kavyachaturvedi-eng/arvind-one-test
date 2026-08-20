"use client";

// My Shift — the person, not the store: mark attendance, see your own till
// numbers, hand the till over, send the day report, apply for leave.
// Everything here is two taps or less.

import React, { useMemo, useState } from "react";
import { NOW, STAFF, rng, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, Stat, StatusDot, inr } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const NEXT_DAYS = ["Fri 14 Aug", "Sat 15 Aug", "Sun 16 Aug", "Mon 17 Aug", "Tue 18 Aug", "Wed 19 Aug", "Thu 20 Aug"];
const LEAVE_REASONS = ["Personal work", "Not well", "Family function", "Exam", "Other"];

export default function MyShift() {
  const app = useApp();
  const store = storeById(app.storeId);
  const r = rng(hash("myshift" + app.storeId));

  // My till today — deterministic, personal.
  const myBills = 6 + Math.floor(r() * 9);
  const myItems = Math.round(myBills * (1.2 + r() * 0.5));
  const mySales = Math.round(myBills * (2400 + r() * 2200));
  const cashInDrawer = Math.round(mySales * (0.22 + r() * 0.15));

  const attendance = "in" as const; // marked automatically at sign-in on the store device
  const [reportSent, setReportSent] = useState(false);
  const [handTo, setHandTo] = useState(STAFF[1]?.name ?? "");
  const [cashCounted, setCashCounted] = useState(false);
  const [shiftEnded, setShiftEnded] = useState(false);

  const [leaveDate, setLeaveDate] = useState(NEXT_DAYS[0]);
  const [leaveReason, setLeaveReason] = useState(LEAVE_REASONS[0]);
  const myLeaves = useMemo(() => app.leaves.filter((l) => l.who === app.actorName), [app.leaves, app.actorName]);

  function sendReport() {
    setReportSent(true);
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `Day report sent. ${myBills} bills, ${inr(mySales, { compact: true })}, ${myItems} items`,
        object: "day-report",
        system: "Arvind One",
      },
    });
    app.toastNow("Day report sent to your manager", "good");
  }

  function endShift() {
    if (!cashCounted || !handTo) return;
    setShiftEnded(true);
    app.dispatch({
      type: "audit",
      entry: {
        at: NOW,
        actor: app.actorName,
        action: `Shift ended, till handed to ${handTo}, ${inr(cashInDrawer)} counted and confirmed`,
        object: "shift",
        system: "Arvind One",
      },
    });
    app.toastNow(`Shift ended, till handed to ${handTo}. See you tomorrow.`, "good");
  }

  function applyLeave() {
    const id = `LV-${100 + app.leaves.length}`;
    app.dispatch({
      type: "leave:apply",
      leave: { id, who: app.actorName, date: leaveDate, reason: leaveReason, status: "pending" },
    });
    app.toastNow(`Leave asked for ${leaveDate}, your manager will confirm`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">My Shift</h1>
          <p className="text-sm text-ink2 mt-1">{app.actorName} · {store.name} · Thursday 13 Aug</p>
        </div>
        {attendance === "in" && !shiftEnded && <Chip tone="good">● On shift since 10:02</Chip>}
        {shiftEnded && <Chip tone="neutral">Shift ended · handed to {handTo}</Chip>}
      </div>

      {/* ── My till today ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="My sales today" value={inr(mySales, { compact: true })} emphasis />
        <Stat label="My bills" value={String(myBills)} sub={`${myItems} items`} />
        <Stat label="Items per bill" value={(myItems / Math.max(1, myBills)).toFixed(1)} sub="1.5 is a good day" tone={myItems / myBills >= 1.5 ? "good" : undefined} />
        <Stat label="Cash at my counter" value={inr(cashInDrawer, { compact: true })} sub="Counted at handover" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── End of day ── */}
        <Card>
          <SectionTitle title="End my shift" />
          {shiftEnded ? (
            <div className="flex items-center gap-2.5 text-sm text-ink py-2">
              <StatusDot tone="good" />
              Done, till handed to {handTo}, cash confirmed, report {reportSent ? "sent" : "pending"}.
            </div>
          ) : (
            <div className="space-y-3">
              <button data-day-report className="btn w-full !py-3 !justify-between" disabled={reportSent} onClick={sendReport}>
                <span>{reportSent ? "✓ Day report sent" : "1 · Send my day report"}</span>
                <span className="text-2xs text-muted">{myBills} bills · {inr(mySales, { compact: true })}</span>
              </button>

              <label className="flex items-center gap-2.5 border border-line p-3 cursor-pointer">
                <input type="checkbox" checked={cashCounted} onChange={(e) => setCashCounted(e.target.checked)} />
                <span className="text-sm text-ink">2 · Cash counted. {inr(cashInDrawer)} in the drawer</span>
              </label>

              <div className="flex items-center gap-2.5">
                <span className="text-sm text-ink shrink-0">3 · Hand till to</span>
                <select value={handTo} onChange={(e) => setHandTo(e.target.value)} className="flex-1 border border-line bg-raised px-3 py-2.5 text-sm text-ink">
                  {STAFF.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <button data-end-shift className="btn-primary w-full !py-3" disabled={!cashCounted} onClick={endShift}>
                End shift &amp; hand over
              </button>
            </div>
          )}
        </Card>

        {/* ── Leave ── */}
        <Card>
          <SectionTitle title="Ask for leave" />
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="label mb-1">Which day</div>
                <select value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink">
                  {NEXT_DAYS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="label mb-1">Why</div>
                <select value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink">
                  {LEAVE_REASONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
            </div>
            <button data-apply-leave className="btn-primary w-full !py-2.5" onClick={applyLeave}>
              Ask for this day off
            </button>

            {myLeaves.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <div className="label">My requests</div>
                {myLeaves.map((l) => (
                  <div key={l.id} className="flex items-center gap-2.5 border border-line px-3 py-2">
                    <StatusDot tone={l.status === "approved" ? "good" : l.status === "declined" ? "critical" : "warn"} />
                    <span className="text-sm text-ink flex-1">{l.date} · {l.reason}</span>
                    <span className="text-2xs text-muted">{l.status === "pending" ? "waiting for manager" : l.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="text-2xs text-muted">
        Your shift for next week shows here once the manager publishes it. Attendance is marked automatically when you
        sign in on the store device.
      </div>
    </div>
  );
}
