"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ROLES, STORES } from "@/lib/seed";
import { useApp, type ModuleId } from "@/lib/state";
import { Freshness, Toast } from "./ui";
import type { RoleId } from "@/lib/types";

// ── Information architecture ─────────────────────────────────────────────────
// Two levels: a SECTION (Operations / Insights / Planning / Admin) contains
// function GROUPS (Movement, Customers, …), each holding selectable items.

interface NavChild {
  id: ModuleId;
  label: string;
  /** Optional sub-view within the module (e.g. crm → enrol). */
  focus?: string;
}

interface NavGroup {
  key: string;
  label: string;
  glyph: string;
  roles: RoleId[];
  section: string;
  children: NavChild[];
}

const NAV_GROUPS: NavGroup[] = [
  // ── Operations — staff and manager ──
  {
    key: "sell", label: "Sell", glyph: "▣", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "pos", label: "Billing" },
      { id: "omni", label: "Online Orders" },
    ],
  },
  {
    key: "movement", label: "Movement", glyph: "⇅", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "grn", label: "Inward (GRN)" },
      { id: "outward", label: "Outward & RTV" },
      { id: "savesale", label: "Save the Sale" },
    ],
  },
  {
    key: "customers", label: "Customers", glyph: "◐", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "crm", label: "Enrol member", focus: "enrol" },
      { id: "crm", label: "Send offers", focus: "outreach" },
    ],
  },
  {
    key: "work", label: "My Work", glyph: "☰", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "storeday", label: "Tasks & Chores" },
      { id: "tickets", label: "Raise an Issue" },
    ],
  },

  // ── Insights — manager only ──
  {
    key: "performance", label: "Performance", glyph: "◧", roles: ["store"], section: "Insights",
    children: [
      { id: "home", label: "Overview" },
      { id: "reports", label: "Reports" },
    ],
  },
  {
    key: "sai", label: "AI", glyph: "✳", roles: ["store"], section: "Insights",
    children: [
      { id: "agents", label: "AI Agents" },
      { id: "ask", label: "Ask One" },
    ],
  },
  {
    key: "stock", label: "Stock Control", glyph: "▤", roles: ["store"], section: "Operations",
    children: [
      { id: "sizeset", label: "Size & Stock" },
      { id: "replenish", label: "Replenishment" },
      { id: "truth", label: "Stock Position" },
    ],
  },
  {
    key: "money", label: "Money", glyph: "₹", roles: ["store"], section: "Operations",
    children: [{ id: "cash", label: "Cash & Close" }],
  },

  // ── Planning ──
  {
    key: "plive", label: "Live", glyph: "◉", roles: ["planner"], section: "Planning",
    children: [
      { id: "live", label: "Live Execution" },
      { id: "performance", label: "Performance" },
    ],
  },
  {
    key: "pact", label: "Act", glyph: "⇉", roles: ["planner"], section: "Planning",
    children: [
      { id: "tickets", label: "Issues & SLA" },
      { id: "allocate", label: "Reallocation" },
      { id: "moves", label: "Strategic Moves" },
      { id: "catchment", label: "Catchment" },
      { id: "trainings", label: "Trainings" },
    ],
  },
  {
    key: "pdata", label: "Data", glyph: "◎", roles: ["planner"], section: "Planning",
    children: [
      { id: "truth", label: "Stock Position" },
      { id: "reports", label: "Reports" },
      { id: "governance", label: "Metric Registry" },
    ],
  },
  {
    key: "pai", label: "AI", glyph: "✳", roles: ["planner"], section: "Planning",
    children: [
      { id: "agents", label: "AI Agents" },
      { id: "ask", label: "Ask One" },
    ],
  },

  // ── Admin ──
  {
    key: "aover", label: "Overview", glyph: "◆", roles: ["leadership"], section: "Admin",
    children: [
      { id: "exec", label: "Executive View" },
      { id: "live", label: "Live Execution" },
      { id: "performance", label: "Performance" },
    ],
  },
  {
    key: "aact", label: "Act", glyph: "⇉", roles: ["leadership"], section: "Admin",
    children: [
      { id: "allocate", label: "Reallocation" },
      { id: "moves", label: "Strategic Moves" },
      { id: "catchment", label: "Catchment" },
    ],
  },
  {
    key: "adata", label: "Data", glyph: "◎", roles: ["leadership"], section: "Admin",
    children: [
      { id: "truth", label: "Stock Position" },
      { id: "governance", label: "Metric Registry" },
    ],
  },
  {
    key: "aai", label: "AI", glyph: "✳", roles: ["leadership"], section: "Admin",
    children: [
      { id: "agents", label: "AI Agents" },
      { id: "ask", label: "Ask One" },
    ],
  },
];

const SECTION_ORDER = ["Operations", "Insights", "Planning", "Admin"];

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [navOpen, setNavOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const role = ROLES.find((r) => r.id === app.role)!;

  const groups = useMemo(() => NAV_GROUPS.filter((g) => g.roles.includes(app.role)), [app.role]);
  const sections = useMemo(
    () => SECTION_ORDER.filter((s) => groups.some((g) => g.section === s)).map((s) => [s, groups.filter((g) => g.section === s)] as const),
    [groups]
  );

  const isActive = (c: NavChild) => app.module === c.id && (c.focus === undefined || app.focus === c.focus || (app.focus === null && c.focus === "outreach"));

  // Keep the group of the active module open (sticky) so navigating elsewhere
  // doesn't collapse the section you were just using.
  useEffect(() => {
    const g = groups.find((gr) => gr.children.some((c) => app.module === c.id));
    if (g) setExpanded((c) => (c[g.key] ? c : { ...c, [g.key]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.module, app.focus, app.role]);

  return (
    <div className="min-h-screen flex flex-col bg-plane">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-raised border-b border-line no-print">
        <div className="flex items-center gap-3 px-3 sm:px-5 h-16">
          <button className="btn-ghost lg:hidden !px-2" onClick={() => setNavOpen((v) => !v)} aria-label="Menu">
            ☰
          </button>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 grid place-items-center text-white font-medium" style={{ background: "var(--text-primary)" }}>
              1
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-[15px] font-medium text-ink tracking-tight">Arvind <span className="serif-accent">One</span></div>
              <div className="label">Retail operations</div>
            </div>
          </div>

          <div className="flex-1" />

          <RoleSwitcher />
          <button className="btn-ghost !px-2 text-xs hidden sm:inline-flex" onClick={() => app.dispatch({ type: "logout" })} title="Sign out">
            Sign out
          </button>
        </div>

        {/* Context strip */}
        <div className="flex items-center gap-2.5 px-3 sm:px-5 h-10 border-t border-line bg-[color:var(--plane)] overflow-x-auto">
          <span
            className="chip shrink-0"
            style={{ background: "var(--brand-soft)", borderColor: "transparent", color: "var(--brand)" }}
          >
            {role.label}
          </span>
          {app.role === "store" || app.role === "staff" ? (
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
          className={`${navOpen ? "block" : "hidden"} lg:block w-full lg:w-[240px] shrink-0 border-r border-line bg-raised overflow-y-auto no-print
             fixed lg:static inset-y-16 left-0 z-30 lg:z-auto`}
        >
          <div className="p-2.5 space-y-4">
            {sections.map(([section, sectionGroups]) => (
              <div key={section}>
                <div className="label px-2 mb-1.5">{section}</div>
                <div className="space-y-1">
                  {sectionGroups.map((g) => {
                    const groupActive = g.children.some(isActive);
                    const open = expanded[g.key] ?? groupActive;
                    return (
                      <div key={g.key}>
                        <button
                          data-group={g.key}
                          aria-expanded={open}
                          onClick={() => setExpanded((c) => ({ ...c, [g.key]: !open }))}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2.5 transition-colors ${
                            groupActive ? "text-ink font-semibold" : "text-ink2 hover:bg-[color:var(--plane)]"
                          }`}
                        >
                          <span className="w-4 text-center opacity-70">{g.glyph}</span>
                          <span className="text-[13px] flex-1">{g.label}</span>
                          {g.key === "stock" && app.role === "store" && <ExceptionBadge />}
                          {(g.key === "plive" || g.key === "aover") && <LiveDot />}
                          <span className="text-2xs text-muted">{open ? "▾" : "▸"}</span>
                        </button>
                        {open && (
                          <ul className="mt-0.5 space-y-0.5">
                            {g.children.map((c) => {
                              const active = isActive(c);
                              return (
                                <li key={`${c.id}-${c.focus ?? ""}`}>
                                  <button
                                    data-module={c.id}
                                    data-focus={c.focus}
                                    onClick={() => {
                                      app.go(c.id, c.focus);
                                      setNavOpen(false);
                                    }}
                                    className={`w-full text-left pl-9 pr-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors text-[13px] ${
                                      active
                                        ? "bg-[color:var(--brand-soft)] text-[color:var(--brand)] font-semibold"
                                        : "text-ink2 hover:bg-[color:var(--plane)]"
                                    }`}
                                  >
                                    {c.label}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
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
    <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "var(--status-critical)" }}>
      !
    </span>
  );
}

function LiveDot() {
  return <span className="w-2 h-2 rounded-full pulse-crit" style={{ background: "var(--status-good)" }} aria-label="live" />;
}

// ── Role hierarchy: Store (Manager | Staff) · Planning · Admin ───────────────

function RoleSwitcher() {
  const app = useApp();
  const storeSide = app.role === "store" || app.role === "staff";

  const pill = (active: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
      active ? "bg-raised text-ink shadow-card" : "text-ink2 hover:text-ink"
    }`;

  return (
    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[color:var(--plane)] border border-line">
      {/* Store, with its two sub-logins */}
      <div className={`flex items-center gap-0.5 rounded-lg px-1 py-0.5 ${storeSide ? "bg-[color:var(--brand-soft)]" : ""}`}>
        <span className={`text-2xs font-semibold px-1 ${storeSide ? "text-[color:var(--brand)]" : "text-muted"}`}>Store</span>
        <button data-role="store" onClick={() => app.setRole("store")} title="Store Manager — insights and operations" className={pill(app.role === "store")}>
          Manager
        </button>
        <button data-role="staff" onClick={() => app.setRole("staff")} title="Store Staff — floor and till operations" className={pill(app.role === "staff")}>
          Staff
        </button>
      </div>

      <span className="w-px h-5 bg-[color:var(--line)]" />

      <button data-role="planner" onClick={() => app.setRole("planner")} title="Retail Planning" className={pill(app.role === "planner")}>
        Planning
      </button>
      <button data-role="leadership" onClick={() => app.setRole("leadership")} title="Leadership view" className={pill(app.role === "leadership")}>
        Admin
      </button>
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
