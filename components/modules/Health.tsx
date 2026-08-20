"use client";

// Systems — is everything the store depends on working right now, said in
// plain words, with the two levers a manager actually needs: force a sync,
// and send print jobs to the other register.

import React, { useState } from "react";
import { NOW, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, Stat, StatusDot, inr } from "@/components/ui";

interface Device {
  id: string;
  name: string;
  where: string;
  online: boolean;
  /** What a person should do about it. */
  problem?: string;
}

const DEVICES: Device[] = [
  { id: "gw", name: "Payment gateway", where: "UPI and cards", online: true },
  { id: "cr1", name: "Card reader", where: "Register 1", online: true },
  { id: "cr2", name: "Card reader", where: "Register 2", online: false, problem: "Card reader on Register 2 is offline. Take cards on Register 1 while IT looks at it." },
  { id: "pr1", name: "Receipt printer", where: "Register 1", online: false, problem: "Receipt printer on Register 1 is out of paper or offline. Route its bills to Register 2." },
  { id: "pr2", name: "Receipt printer", where: "Register 2", online: true },
  { id: "sc1", name: "Barcode scanner", where: "Register 1", online: true },
  { id: "sc2", name: "Barcode scanner", where: "Register 2", online: true },
  { id: "lbl", name: "Label printer", where: "Stockroom", online: true },
];

interface Feed {
  id: string;
  name: string;
  lastLabel: string;
  stuck?: string;
}

const FEEDS: Feed[] = [
  { id: "inv", name: "Stock counts to the website", lastLabel: "4 min ago" },
  { id: "orders", name: "Online orders into the store", lastLabel: "22 min ago", stuck: "2 orders from Myntra have not come down in 20 minutes." },
  { id: "prices", name: "Prices and offers from Commercial", lastLabel: "1 h ago" },
  { id: "fin", name: "Day close to Finance", lastLabel: "Yesterday 22:10" },
];

export default function Health() {
  const app = useApp();
  const store = storeById(app.storeId);
  const [synced, setSynced] = useState<Record<string, boolean>>({});
  const [fixed, setFixed] = useState<Record<string, boolean>>({});

  const devices = DEVICES.map((d) => (fixed[d.id] ? { ...d, online: true, problem: undefined } : d));
  const down = devices.filter((d) => !d.online);
  const stuck = FEEDS.filter((f) => f.stuck && !synced[f.id]);
  const routed = app.printerRoutedTo;

  function forceSync(f: Feed) {
    setSynced((s) => ({ ...s, [f.id]: true }));
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `Forced a sync: ${f.name}`, object: f.id, system: "Arvind One" },
    });
    app.toastNow(`${f.name}: sync pushed. Anything stuck comes through in under a minute.`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Systems</h1>
        <Chip tone={down.length || stuck.length ? "warn" : "good"}>{store.name}</Chip>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Working" value={`${devices.length - down.length}/${devices.length}`} tone={down.length ? "warn" : "good"} emphasis />
        <Stat label="Needs attention" value={String(down.length)} tone={down.length ? "critical" : "good"} />
        <Stat label="Feeds stuck" value={String(stuck.length)} tone={stuck.length ? "warn" : "good"} />
      </div>

      {/* What is broken, in words, with the workaround. */}
      {(down.length > 0 || stuck.length > 0) && (
        <Card>
          <SectionTitle title="What needs you now" />
          <div className="space-y-2">
            {down.map((d) => (
              <div key={d.id} className="border-l-2 pl-3 py-1.5" style={{ borderColor: "var(--status-critical)" }} data-alert>
                <div className="text-sm text-ink">{d.problem}</div>
                <div className="flex gap-2 mt-2">
                  {d.id === "pr1" && (
                    <button
                      data-route-printer
                      className="btn-primary !py-1.5 !text-xs"
                      disabled={routed === "Register 2"}
                      onClick={() => {
                        app.dispatch({ type: "printer:route", to: "Register 2" });
                        app.toastNow("Bills from Register 1 now print at Register 2.", "good");
                      }}
                    >
                      {routed === "Register 2" ? "✓ Printing at Register 2" : "Send prints to Register 2"}
                    </button>
                  )}
                  <button className="btn !py-1.5 !text-xs" onClick={() => app.go("tickets")}>Raise it with IT</button>
                  <button
                    className="btn !py-1.5 !text-xs"
                    onClick={() => {
                      setFixed((f) => ({ ...f, [d.id]: true }));
                      app.toastNow(`${d.name} on ${d.where} is back online.`, "good");
                    }}
                  >
                    It is working again
                  </button>
                </div>
              </div>
            ))}
            {stuck.map((f) => (
              <div key={f.id} className="border-l-2 pl-3 py-1.5" style={{ borderColor: "var(--status-warning)" }} data-alert>
                <div className="text-sm text-ink">{f.stuck}</div>
                <button data-force-sync className="btn-primary !py-1.5 !text-xs mt-2" onClick={() => forceSync(f)}>
                  Force sync now
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle title="Counters and devices" />
          <div className="space-y-1.5">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border border-line px-3 py-2.5" data-device>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: d.online ? "var(--status-good)" : "var(--status-critical)" }}
                  aria-label={d.online ? "online" : "offline"}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink">{d.name}</div>
                  <div className="text-2xs text-muted">{d.where}</div>
                </div>
                <span className="text-xs" style={{ color: d.online ? "var(--status-good)" : "var(--status-critical)" }}>
                  {d.online ? "Working" : "Offline"}
                </span>
              </div>
            ))}
          </div>
          {routed && (
            <div className="mt-3 flex items-center gap-2.5 border border-line px-3 py-2.5">
              <StatusDot tone="warn" />
              <span className="text-xs text-ink flex-1">Prints from Register 1 are going to {routed}.</span>
              <button className="btn !py-1 !text-2xs" onClick={() => { app.dispatch({ type: "printer:route", to: null }); app.toastNow("Print routing back to normal.", "info"); }}>
                Undo
              </button>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="Data going in and out" />
          <div className="space-y-1.5">
            {FEEDS.map((f) => {
              const ok = !f.stuck || synced[f.id];
              return (
                <div key={f.id} className="flex items-center gap-3 border border-line px-3 py-2.5" data-feed>
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: ok ? "var(--status-good)" : "var(--status-warning)" }}
                    aria-label={ok ? "online" : "stuck"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{f.name}</div>
                    <div className="text-2xs text-muted">Last {synced[f.id] ? "just now" : f.lastLabel}</div>
                  </div>
                  <button className="btn !py-1 !text-2xs" onClick={() => forceSync(f)}>Force sync</button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
