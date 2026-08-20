"use client";

// Shifts — where I am now, what is coming, and the cash that moved through
// this counter. Leave and attendance live on their own screen.

import React, { useMemo, useState } from "react";
import { rng, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, Stat, StatusDot, Table, Td, Th, inr } from "@/components/ui";
import { EndShiftDialog, cashAtCounter } from "@/components/EndShift";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const DAYS = ["Fri 14 Aug", "Sat 15 Aug", "Sun 16 Aug", "Mon 17 Aug", "Tue 18 Aug", "Wed 19 Aug", "Thu 20 Aug"];
const SLOTS = [
  { code: "M", label: "Morning", hours: "10:00 to 18:00" },
  { code: "E", label: "Evening", hours: "14:00 to 22:00" },
  { code: "O", label: "Off", hours: "Rest day" },
] as const;

export default function MyShift() {
  const app = useApp();
  const store = storeById(app.storeId);
  const [endOpen, setEndOpen] = useState(false);

  const collected = cashAtCounter(app.storeId);
  const myHandover = app.handovers.find((h) => h.from === app.actorName);
  const handedToMe = app.handovers.filter((h) => h.to === app.actorName);

  // My week, deterministic and matching the manager's published grid.
  const week = useMemo(() => {
    const r = rng(hash("shift" + app.actorName));
    const off = Math.floor(r() * 7);
    return DAYS.map((d, i) => ({ day: d, slot: i === off ? "O" : r() > 0.5 ? "M" : "E" }));
  }, [app.actorName]);

  const nextOn = week.find((w) => w.slot !== "O");

  // My bills today.
  const r = rng(hash("myshift" + app.storeId));
  const myBills = 6 + Math.floor(r() * 9);
  const myItems = Math.round(myBills * (1.2 + r() * 0.5));
  const mySales = Math.round(myBills * (2400 + r() * 2200));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Shifts</h1>
          <p className="text-sm text-ink2 mt-1">{app.actorName} · {store.name}</p>
        </div>
        {myHandover ? (
          <Chip tone="neutral">Handed to {myHandover.to} · {inr(myHandover.cash)}</Chip>
        ) : (
          <button data-end-shift className="btn-primary !py-2.5" onClick={() => setEndOpen(true)}>
            End my shift
          </button>
        )}
      </div>

      {/* ── Right now ── */}
      <Card>
        <SectionTitle
          title="Right now"
          right={myHandover ? <Chip tone="neutral">Shift closed</Chip> : <Chip tone="good">● On shift since 10:02</Chip>}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Shift" value="Morning" sub="10:00 to 18:00" emphasis />
          <Stat label="My sales today" value={inr(mySales, { compact: true })} sub={`${myBills} bills`} />
          <Stat label="Items per bill" value={(myItems / Math.max(1, myBills)).toFixed(1)} sub="1.5 is a good day" tone={myItems / myBills >= 1.5 ? "good" : undefined} />
          <Stat label="Cash at my counter" value={inr(collected, { compact: true })} sub="Counted at handover" />
        </div>
      </Card>

      {/* ── Upcoming ── */}
      <Card>
        <SectionTitle
          title="Upcoming shifts"
          right={nextOn ? <Chip tone="brand">Next: {nextOn.day.split(" ").slice(0, 2).join(" ")}</Chip> : undefined}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {week.map((w) => {
            const slot = SLOTS.find((s) => s.code === w.slot)!;
            const off = w.slot === "O";
            return (
              <div
                key={w.day}
                className="border p-3 text-center"
                style={{
                  borderColor: off ? "var(--line)" : "var(--brand)",
                  background: off ? "var(--plane)" : "var(--brand-soft)",
                }}
              >
                <div className="text-2xs text-muted">{w.day}</div>
                <div className="text-sm font-semibold mt-1" style={{ color: off ? "var(--text-muted)" : "var(--brand)" }}>
                  {slot.label}
                </div>
                <div className="text-2xs text-muted mt-0.5">{slot.hours}</div>
              </div>
            );
          })}
        </div>
        <div className="text-2xs text-muted mt-2.5">
          Published by your manager. Ask for a day off from Attendance.
        </div>
      </Card>

      {/* ── Cash operations ── */}
      <Card>
        <SectionTitle title="Cash at this counter" right={<Chip>{app.handovers.length} handovers</Chip>} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat label="Float at day open" value={inr(app.openFloat)} sub={app.dayOpen ? "Counted at 10:02" : "Day not open yet"} />
          <Stat label="Cash I collected" value={inr(collected)} tone="good" sub={`From ${myBills} bills`} />
          <Stat
            label="Cash given to me"
            value={inr(handedToMe.reduce((a, h) => a + h.cash, 0))}
            sub={handedToMe.length ? `From ${handedToMe.map((h) => h.from.split(" ")[0]).join(", ")}` : "Nothing handed to me today"}
          />
          <Stat label="In the drawer now" value={inr(app.openFloat + collected)} emphasis sub="Float plus today's cash" />
        </div>
        <Table>
          <thead>
            <tr><Th>When</Th><Th>From</Th><Th>To</Th><Th align="right">Cash handed</Th><Th align="right">Status</Th></tr>
          </thead>
          <tbody>
            {[...app.handovers].reverse().map((h) => (
              <tr key={h.id}>
                <Td className="text-xs text-ink2 whitespace-nowrap">{h.atLabel}</Td>
                <Td className="text-sm text-ink">{h.from}</Td>
                <Td className="text-sm text-ink">{h.to}</Td>
                <Td align="right" className="num text-sm font-semibold text-ink">{inr(h.cash)}</Td>
                <Td align="right">
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink2"><StatusDot tone="good" />Counted by both</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="text-2xs text-muted mt-2">
          Both people count the cash at a handover, so a shortage is always traceable to one shift.
        </div>
      </Card>

      <EndShiftDialog open={endOpen} onClose={() => setEndOpen(false)} />
    </div>
  );
}
