"use client";

import React, { useMemo, useState } from "react";
import { ROLES, STORES } from "@/lib/seed";
import { useApp, type ModuleId } from "@/lib/state";
import { Chip, Freshness, StatusDot, Toast } from "./ui";
import type { RoleId } from "@/lib/types";

interface NavItem {
  id: ModuleId;
  label: string;
  glyph: string;
  roles: RoleId[];
  group: string;
  hint: string;
}

export const NAV: NavItem[] = [
  // Store — the day
  { id: "home", label: "Today", glyph: "◧", roles: ["store"], group: "Today", hint: "The whole day in one place" },
  { id: "storeday", label: "Briefing & Tasks", glyph: "☰", roles: ["store"], group: "Today", hint: "HQ tasks, training, floor chores" },
  { id: "pos", label: "Billing", glyph: "▣", roles: ["store"], group: "Today", hint: "POS, tenders, returns" },
  { id: "crm", label: "Customers", glyph: "◐", roles: ["store"], group: "Today", hint: "Capture, loyalty, outreach" },
  { id: "tickets", label: "Raise an Issue", glyph: "⚑", roles: ["store"], group: "Today", hint: "Scan the asset and raise it" },
  { id: "cash", label: "Cash & Close", glyph: "₹", roles: ["store"], group: "Today", hint: "Tender reconciliation and day close" },

  // Store — stock
  { id: "savesale", label: "Save the Sale", glyph: "⇄", roles: ["store"], group: "Stock", hint: "Transfer a size in from another store" },
  { id: "sizeset", label: "Size & Stock", glyph: "▤", roles: ["store"], group: "Stock", hint: "Broken sizes and what to do about each" },
  { id: "replenish", label: "Replenishment", glyph: "↺", roles: ["store"], group: "Stock", hint: "Warehouse pulls and store transfers" },
  { id: "grn", label: "Inward & GRN", glyph: "▼", roles: ["store"], group: "Stock", hint: "Receive against advice notes" },
  { id: "omni", label: "Online Orders", glyph: "◱", roles: ["store"], group: "Stock", hint: "Find, pack, hand over" },
  { id: "outward", label: "Outward & RTV", glyph: "⇥", roles: ["store"], group: "Stock", hint: "Pullbacks and returns to vendor" },

  // Hierarchy — live view
  { id: "exec", label: "Executive View", glyph: "◆", roles: ["leadership"], group: "Live", hint: "The business on one screen" },
  { id: "live", label: "Live Execution", glyph: "◉", roles: ["planner", "leadership"], group: "Live", hint: "Every store, right now" },
  { id: "performance", label: "Performance", glyph: "◫", roles: ["planner", "leadership"], group: "Live", hint: "Sell-through, markdown, fill rate" },

  // Hierarchy — planning actions
  { id: "tickets", label: "Issues & SLA", glyph: "⚑", roles: ["planner"], group: "Planning", hint: "Approvals and SLA across stores" },
  { id: "allocate", label: "Reallocation", glyph: "⤨", roles: ["planner", "leadership"], group: "Planning", hint: "Re-cut a drop against store signal" },
  { id: "moves", label: "Strategic Moves", glyph: "⇉", roles: ["planner", "leadership"], group: "Planning", hint: "Network transfers ranked by value" },
  { id: "catchment", label: "Catchment", glyph: "◈", roles: ["planner", "leadership"], group: "Planning", hint: "Customer concentration by pin code" },

  // Shared
  { id: "truth", label: "Stock Position", glyph: "◎", roles: ["store", "planner", "leadership"], group: "Data", hint: "What is in the system, per style" },
  { id: "reports", label: "Reports", glyph: "▥", roles: ["store"], group: "Data", hint: "DSR, stock, size sets, staff" },
  { id: "governance", label: "Metric Registry", glyph: "§", roles: ["planner", "leadership"], group: "Data", hint: "One definition per metric" },
  { id: "ask", label: "Ask One", glyph: "✳", roles: ["store", "planner", "leadership"], group: "Data", hint: "Ask in plain language" },
];

const GROUP_ORDER = ["Today", "Stock", "Live", "Planning", "Data"];

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [navOpen, setNavOpen] = useState(false);
  const role = ROLES.find((r) => r.id === app.role)!;

  const visible = useMemo(() => NAV.filter((n) => n.roles.includes(app.role)), [app.role]);
  const groups = useMemo(() => {
    const g: Record<string, NavItem[]> = {};
    for (const item of visible) (g[item.group] ??= []).push(item);
    return GROUP_ORDER.filter((k) => g[k]).map((k) => [k, g[k]] as const);
  }, [visible]);

  return (
    <div className="min-h-screen flex flex-col bg-plane">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-raised border-b border-line no-print">
        <div className="flex items-center gap-3 px-3 sm:px-5 h-16">
          <button className="btn-ghost lg:hidden !px-2" onClick={() => setNavOpen((v) => !v)} aria-label="Menu">
            ☰
          </button>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-white font-bold" style={{ background: "var(--brand)" }}>
              1
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-[15px] font-semibold text-ink">Arvind One</div>
              <div className="text-2xs text-muted">Retail operations</div>
            </div>
          </div>

          <div className="flex-1" />

          <RoleSwitcher />
        </div>

        {/* Context strip */}
        <div className="flex items-center gap-2.5 px-3 sm:px-5 h-10 border-t border-line bg-[color:var(--plane)] overflow-x-auto">
          <span
            className="chip shrink-0"
            style={{ background: "var(--brand-soft)", borderColor: "transparent", color: "var(--brand)" }}
          >
            {role.person} · {role.label}
          </span>
          {app.role === "store" ? (
            <StorePicker />
          ) : (
            <span className="text-xs text-ink2 font-medium shrink-0">{STORES.length} stores · live</span>
          )}
          <span className="text-muted text-xs shrink-0 hidden sm:inline">·</span>
          <Freshness minutes={2} label="as of" />
          <div className="flex-1" />
          <span className="text-2xs text-muted shrink-0 hidden md:inline">Thu 13 Aug 2026 · 11:42 IST</span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <nav
          className={`${navOpen ? "block" : "hidden"} lg:block w-full lg:w-[236px] shrink-0 border-r border-line bg-raised overflow-y-auto no-print
             fixed lg:static inset-y-16 left-0 z-30 lg:z-auto`}
        >
          <div className="p-2.5 space-y-4">
            {groups.map(([group, items]) => (
              <div key={group}>
                <div className="label px-2 mb-1.5">{group}</div>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = app.module === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          data-module={item.id}
                          onClick={() => {
                            app.go(item.id);
                            setNavOpen(false);
                          }}
                          title={item.hint}
                          className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2.5 transition-colors ${
                            active ? "bg-[color:var(--brand-soft)] text-[color:var(--brand)] font-semibold" : "text-ink2 hover:bg-[color:var(--plane)]"
                          }`}
                        >
                          <span className="w-4 text-center opacity-70">{item.glyph}</span>
                          <span className="text-[13px]">{item.label}</span>
                          {item.id === "sizeset" && app.role === "store" && <ExceptionBadge />}
                          {item.id === "live" && <LiveDot />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <div className="pt-2 mt-2 border-t border-line px-2">
              <div className="text-2xs text-muted leading-relaxed">Demo environment · synthetic data</div>
            </div>
          </div>
        </nav>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <div className="max-w-[1320px] mx-auto p-3 sm:p-6">{children}</div>
        </main>
      </div>

      {app.toast && <Toast key={app.toast.id} message={app.toast.message} tone={app.toast.tone} onDone={() => app.dispatch({ type: "toast:clear" })} />}
    </div>
  );
}

function ExceptionBadge() {
  return (
    <span className="ml-auto text-2xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "var(--status-critical)" }}>
      !
    </span>
  );
}

function LiveDot() {
  return <span className="ml-auto w-2 h-2 rounded-full pulse-crit" style={{ background: "var(--status-good)" }} aria-label="live" />;
}

function RoleSwitcher() {
  const app = useApp();
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[color:var(--plane)] border border-line">
      {ROLES.map((r) => {
        const active = app.role === r.id;
        return (
          <button
            key={r.id}
            data-role={r.id}
            onClick={() => app.setRole(r.id)}
            title={`${r.person} — ${r.title}`}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              active ? "bg-raised text-ink shadow-card" : "text-ink2 hover:text-ink"
            }`}
          >
            <span
              className="w-6 h-6 rounded-full grid place-items-center text-2xs font-semibold shrink-0"
              style={{ background: active ? "var(--brand)" : "var(--baseline)", color: "#fff" }}
            >
              {r.initials}
            </span>
            <span className="hidden sm:inline">{r.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StorePicker() {
  const app = useApp();
  return (
    <select
      value={app.storeId}
      onChange={(e) => app.setStore(e.target.value)}
      className="text-xs rounded-md border border-line bg-raised px-2 py-1 text-ink max-w-[260px] shrink-0"
    >
      {STORES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} · {s.brand} · {s.city}
        </option>
      ))}
    </select>
  );
}
