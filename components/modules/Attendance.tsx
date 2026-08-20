"use client";

// Attendance — days present this month, the holiday calendar, and leave:
// ask for a day, then watch its status. Nothing here needs a manager present.

import React, { useMemo, useState } from "react";
import { NOW, rng, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, Stat, StatusDot, inr } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const NEXT_DAYS = ["Fri 14 Aug", "Sat 15 Aug", "Sun 16 Aug", "Mon 17 Aug", "Tue 18 Aug", "Wed 19 Aug", "Thu 20 Aug"];
const LEAVE_REASONS = ["Personal work", "Not well", "Family function", "Exam", "Other"];

/** Store holidays and festival trading days for the rest of the season. */
const CALENDAR = [
  { date: "15 Aug", name: "Independence Day", kind: "Holiday, store open on mall hours" },
  { date: "26 Aug", name: "Onam", kind: "Festival trading, leave closed in the South" },
  { date: "28 Aug", name: "Raksha Bandhan", kind: "Festival trading, gifting week" },
  { date: "5 Sep", name: "Ganesh Chaturthi", kind: "Festival trading in the West" },
  { date: "2 Oct", name: "Gandhi Jayanti", kind: "Holiday, store open" },
  { date: "20 Oct", name: "Durga Puja begins", kind: "Peak week, leave closed in the East" },
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function Attendance() {
  const app = useApp();
  const store = storeById(app.storeId);

  // This month to date: 13 trading days so far.
  const marks = useMemo(() => {
    const r = rng(hash("att" + app.actorName));
    return Array.from({ length: 13 }, (_, i) => {
      const day = i + 1;
      const v = r();
      // One week off day, one approved leave, the rest present.
      return { day, state: v < 0.12 ? "leave" : v < 0.26 ? "off" : "present" as "present" | "off" | "leave" };
    });
  }, [app.actorName]);

  const present = marks.filter((m) => m.state === "present").length;
  const onLeave = marks.filter((m) => m.state === "leave").length;
  const offDays = marks.filter((m) => m.state === "off").length;

  const myLeaves = app.leaves.filter((l) => l.who === app.actorName);
  const [leaveDate, setLeaveDate] = useState(NEXT_DAYS[0]);
  const [leaveReason, setLeaveReason] = useState(LEAVE_REASONS[0]);

  function applyLeave() {
    const id = `LV-${100 + app.leaves.length}`;
    app.dispatch({
      type: "leave:apply",
      leave: { id, who: app.actorName, date: leaveDate, reason: leaveReason, status: "pending" },
    });
    app.toastNow(`Leave asked for ${leaveDate}. Your manager will confirm.`, "good");
  }

  const blocked = CALENDAR.some((c) => leaveDate.startsWith(c.date.split(" ")[0]) && c.kind.includes("leave closed"));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Attendance</h1>
          <p className="text-sm text-ink2 mt-1">{app.actorName} · {store.name} · August</p>
        </div>
        <Chip tone="good">● Marked in at 10:02</Chip>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Days present" value={`${present}/13`} tone={present >= 11 ? "good" : "warn"} sub="This month to date" emphasis />
        <Stat label="Week offs taken" value={String(offDays)} sub="One a week is the norm" />
        <Stat label="Leave taken" value={String(onLeave)} sub="Approved days this month" />
        <Stat label="Leave pending" value={String(myLeaves.filter((l) => l.status === "pending").length)} tone={myLeaves.some((l) => l.status === "pending") ? "warn" : undefined} sub="Waiting for the manager" />
      </div>

      {/* ── The month so far ── */}
      <Card>
        <SectionTitle title="This month" right={<Chip>{present} present</Chip>} />
        <div className="flex flex-wrap gap-1.5">
          {marks.map((m) => {
            const bg = m.state === "present" ? "var(--ok-soft)" : m.state === "leave" ? "var(--warn-soft)" : "var(--plane)";
            const fg = m.state === "present" ? "var(--status-good)" : m.state === "leave" ? "var(--status-warning)" : "var(--text-muted)";
            return (
              <div
                key={m.day}
                title={`${m.day} Aug · ${m.state === "present" ? "Present" : m.state === "leave" ? "On leave" : "Week off"}`}
                className="w-11 h-14 border border-line grid place-items-center"
                style={{ background: bg }}
              >
                <div className="text-2xs text-muted">{DAY_LABELS[(m.day + 3) % 7]}</div>
                <div className="text-sm font-semibold num" style={{ color: fg }}>{m.day}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-2xs text-muted">
          <span className="inline-flex items-center gap-1.5"><StatusDot tone="good" />Present</span>
          <span className="inline-flex items-center gap-1.5"><StatusDot tone="warn" />On leave</span>
          <span className="inline-flex items-center gap-1.5"><StatusDot tone="neutral" />Week off</span>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Ask for leave ── */}
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
            {blocked && (
              <div className="text-xs" style={{ color: "var(--status-warning)" }}>
                That day is a festival trading day. Your manager can still approve it, but cover has to be arranged.
              </div>
            )}
            <button data-apply-leave className="btn-primary w-full !py-2.5" onClick={applyLeave}>
              Ask for this day off
            </button>
          </div>

          {myLeaves.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line space-y-1.5">
              <div className="label">My leave history</div>
              {myLeaves.map((l) => (
                <div key={l.id} className="flex items-center gap-2.5 border border-line px-3 py-2">
                  <StatusDot tone={l.status === "approved" ? "good" : l.status === "declined" ? "critical" : "warn"} />
                  <span className="text-sm text-ink flex-1">{l.date} · {l.reason}</span>
                  <span className="text-2xs text-muted">{l.status === "pending" ? "waiting for manager" : l.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Holiday calendar ── */}
        <Card>
          <SectionTitle title="Holidays and festival days" />
          <div className="space-y-1.5">
            {CALENDAR.map((c) => {
              const closed = c.kind.includes("leave closed");
              return (
                <div key={c.date} className="flex items-start gap-3 border border-line px-3 py-2.5">
                  <div className="w-14 shrink-0">
                    <div className="text-sm font-semibold num text-ink">{c.date}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{c.name}</div>
                    <div className="text-2xs mt-0.5" style={{ color: closed ? "var(--status-warning)" : "var(--text-muted)" }}>{c.kind}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
