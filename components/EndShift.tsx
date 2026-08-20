"use client";

// End of shift: count the drawer, name who takes over, hand it across.
// Reachable from the top bar on every staff screen and from Shifts.

import React, { useMemo, useState } from "react";
import { STAFF, rng, storeById } from "@/lib/seed";
import { vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Modal, StatusDot, inr } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/** Cash the person took at their counter today, deterministic per store. */
export function cashAtCounter(storeId: string): number {
  const v = vitalsFor(storeId);
  const r = rng(hash("mycash" + storeId));
  return Math.round((v.todaySales * (0.22 + r() * 0.12)) / 10) * 10;
}

export function EndShiftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const store = storeById(app.storeId);
  const collected = cashAtCounter(app.storeId);
  const drawer = app.openFloat + collected;

  const others = useMemo(() => STAFF.filter((s) => s.name !== app.actorName), [app.actorName]);
  const [to, setTo] = useState(others[0]?.name ?? STAFF[0].name);
  const [countText, setCountText] = useState(String(drawer));
  const [confirmed, setConfirmed] = useState(false);

  const counted = Math.max(0, Math.floor(Number(countText) || 0));
  const diff = counted - drawer;
  const done = app.handovers.some((h) => h.from === app.actorName);

  function handOver() {
    app.dispatch({ type: "shift:handover", from: app.actorName, to, cash: counted });
    app.toastNow(`Shift ended. ${inr(counted)} handed to ${to}. Have a good evening.`, "good");
    setConfirmed(true);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="End my shift"
      sub={`${store.name} · ${app.actorName}`}
      footer={
        done || confirmed ? (
          <button className="btn" onClick={onClose}>Close</button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>Not yet</button>
            <button data-handover className="btn-primary" onClick={handOver}>
              Hand over {inr(counted)} to {to.split(" ")[0]}
            </button>
          </>
        )
      }
    >
      {done || confirmed ? (
        <div className="flex items-center gap-2.5 text-sm text-ink py-2">
          <StatusDot tone="good" />
          Shift already handed over today. Nothing left to do.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="border border-line p-3">
              <div className="text-lg font-semibold num text-ink">{inr(app.openFloat)}</div>
              <div className="text-2xs text-muted mt-0.5">float at day open</div>
            </div>
            <div className="border border-line p-3">
              <div className="text-lg font-semibold num" style={{ color: "var(--status-good)" }}>+{inr(collected)}</div>
              <div className="text-2xs text-muted mt-0.5">cash I collected</div>
            </div>
            <div className="border border-line p-3">
              <div className="text-lg font-semibold num text-ink">{inr(drawer)}</div>
              <div className="text-2xs text-muted mt-0.5">should be in the drawer</div>
            </div>
          </div>

          <div className="border border-line p-4">
            <div className="label mb-1.5">Cash I counted</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl text-muted">₹</span>
              <input
                data-handover-count
                value={countText}
                onChange={(e) => setCountText(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
                inputMode="numeric"
                className="flex-1 text-3xl font-semibold num bg-transparent outline-none text-ink border-b border-line"
              />
            </div>
            {diff !== 0 && (
              <div className="text-xs mt-2" style={{ color: diff < 0 ? "var(--status-critical)" : "var(--status-warning)" }}>
                {diff < 0 ? `${inr(Math.abs(diff))} short of the expected count.` : `${inr(diff)} more than expected.`} It is recorded with your name, not
                held against you. The manager sees it on Cash.
              </div>
            )}
          </div>

          <div>
            <div className="label mb-1.5">Handing the till to</div>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-line bg-raised px-3 py-3 text-base text-ink">
              {others.map((s) => (
                <option key={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="text-2xs text-muted leading-relaxed">
            Your shift report goes to the manager with this handover: bills, sales and the counted cash. There is
            nothing else to fill in.
          </div>
        </div>
      )}
    </Modal>
  );
}
