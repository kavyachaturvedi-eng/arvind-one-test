"use client";

// Staff home — one screen, big tiles, pick your work. The first person in
// opens the day from here.

import React from "react";
import { storeById } from "@/lib/seed";
import { useApp, type ModuleId } from "@/lib/state";
import { Chip } from "@/components/ui";

const TILES: { id: ModuleId; glyph: string; label: string; focus?: string }[] = [
  { id: "pos", glyph: "▣", label: "Billing" },
  { id: "bills", glyph: "⎌", label: "Returns & exchange" },
  { id: "omni", glyph: "◱", label: "Online orders" },
  { id: "lookup", glyph: "▦", label: "Check stock" },
  { id: "savesale", glyph: "⇄", label: "Inter-store transfer" },
  { id: "grn", glyph: "▼", label: "Receive stock" },
  { id: "outward", glyph: "⇥", label: "Send stock out" },
  { id: "storeday", glyph: "☰", label: "Tasks" },
  { id: "crm", glyph: "◐", label: "Loyalty", focus: "points" },
  { id: "shift", glyph: "◷", label: "My shift" },
];

export default function StaffHub() {
  const app = useApp();
  const store = storeById(app.storeId);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">What are you doing?</h1>
          <p className="text-sm text-ink2 mt-1">{store.name} · Thursday 13 Aug</p>
        </div>
        {app.dayOpen ? (
          <Chip tone="good">● Day open · 10:02</Chip>
        ) : (
          <button
            data-day-open
            className="btn-primary !py-3 !px-5"
            onClick={() => {
              app.dispatch({ type: "day:open", by: app.actorName });
              app.toastNow("Day opened. Float confirmed, checklist started. Good selling.", "good");
            }}
          >
            ☀ Open the day
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TILES.map((t) => (
          <button
            key={t.id + (t.focus ?? "")}
            data-hub-tile={t.id}
            onClick={() => app.go(t.id, t.focus)}
            className="cta-tile p-6 text-center min-h-[120px] flex flex-col items-center justify-center gap-2"
          >
            <span className="text-3xl" aria-hidden>{t.glyph}</span>
            <span className="text-sm font-semibold leading-tight">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="text-2xs text-muted">
        Everything here is also in the menu on the left. Ask <span className="serif-accent">Arvi</span> (bottom right) if you are stuck.
      </div>
    </div>
  );
}
