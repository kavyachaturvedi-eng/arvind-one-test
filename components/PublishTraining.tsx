"use client";

// Publish a training — reachable from any screen, not just the Trainings module.
//
// A module is an ask like any other: it names the stores, it has a due date, and
// it lands on those stores' task lists with planning's name against it.

import React, { useState } from "react";
import { NOW } from "@/lib/seed";
import { planningStores } from "@/lib/engine";
import { useApp } from "@/lib/state";

export default function PublishTraining({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stores = planningStores();
  const app = useApp();
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("All floor staff");
  const [mins, setMins] = useState(15);
  const [dueDays, setDueDays] = useState(3);
  const [picked, setPicked] = useState<string[]>([]);

  const target = picked.length === 0 ? stores : stores.filter((s) => picked.includes(s.id));

  function publish() {
    if (!title.trim() || target.length === 0) return;
    const id = `TR-${200 + app.trainings.length}`;
    app.dispatch({
      type: "training:create",
      training: { id, title: title.trim(), audience, mins, dueDays, createdBy: app.actorName },
    });
    app.dispatch({
      type: "hq:assign",
      task: {
        id: `HQ-${id}`,
        title: title.trim(),
        from: "Training",
        storeIds: target.map((s) => s.id),
        dueAt: NOW + dueDays * 24 * 60 * 60 * 1000,
        slaHours: dueDays * 24,
        needsPhoto: false,
        raisedBy: app.actorName,
        raisedAt: NOW,
      },
    });
    app.toastNow(`"${title.trim()}" published to ${target.length} ${target.length === 1 ? "store" : "stores"}`, "good");
    setTitle("");
    setPicked([]);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center pt-[10vh] px-4 no-print" role="dialog" aria-modal="true" aria-label="Publish a training">
      <div className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative card shadow-pop w-full max-w-lg rise p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Publish a training</h2>
          <button className="btn !py-1 !text-2xs" onClick={onClose}>Close</button>
        </div>

        <input
          value={title}
          data-training-title
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Module title"
          className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
        />

        <div className="grid grid-cols-3 gap-2">
          <select value={audience} data-training-audience onChange={(e) => setAudience(e.target.value)} className={sel}>
            <option>All floor staff</option>
            <option>Store managers</option>
            <option>Cashiers</option>
            <option>Omni champs</option>
          </select>
          <select value={mins} onChange={(e) => setMins(Number(e.target.value))} className={sel}>
            {[10, 15, 20, 30].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
          <select value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} className={sel}>
            {[1, 2, 3, 5, 7].map((d) => (
              <option key={d} value={d}>Due in {d}d</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="label">Stores</div>
            <button className="btn !py-0.5 !text-2xs" data-training-all onClick={() => setPicked([])}>
              {picked.length === 0 ? `All ${stores.length}` : "Select all"}
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto border border-line divide-y divide-[color:var(--line)]">
            {stores.map((s) => {
              const on = picked.length === 0 || picked.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    data-training-store
                    checked={on}
                    onChange={(e) => {
                      const base = picked.length === 0 ? stores.map((x) => x.id) : picked;
                      setPicked(e.target.checked ? [...new Set([...base, s.id])] : base.filter((x) => x !== s.id));
                    }}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-2xs text-muted">{s.city}</span>
                </label>
              );
            })}
          </div>
        </div>

        <button className="btn-primary w-full" data-training-publish disabled={!title.trim() || target.length === 0} onClick={publish}>
          Publish to {target.length} {target.length === 1 ? "store" : "stores"}
        </button>
      </div>
    </div>
  );
}

const sel = "w-full border border-line bg-raised px-2 py-2 text-xs text-ink";

/** Opens the publisher from anywhere. */
export function openPublishTraining() {
  window.dispatchEvent(new Event("training:publish"));
}
