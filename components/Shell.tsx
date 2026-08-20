"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ROLES, STORES, storeById } from "@/lib/seed";
import { AGENTS, agentApprovals } from "@/lib/agents";
import { sizeSetExceptions } from "@/lib/engine";
import { NAV_GROUPS, SECTION_ORDER, type NavChild } from "@/lib/nav";
import { useApp, type ModuleId } from "@/lib/state";
import CommandPalette from "./CommandPalette";
import { Chip, Freshness, Toast } from "./ui";

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Once a module is opened, its dot clears for the session.
  const [seen, setSeen] = useState<Set<ModuleId>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const role = ROLES.find((r) => r.id === app.role)!;

  const groups = useMemo(() => NAV_GROUPS.filter((g) => g.roles.includes(app.role)), [app.role]);
  const sections = useMemo(
    () => SECTION_ORDER.filter((s) => groups.some((g) => g.section === s)).map((s) => [s, groups.filter((g) => g.section === s)] as const),
    [groups]
  );

  const isActive = (c: NavChild) => app.module === c.id && (c.focus === undefined || app.focus === c.focus || (app.focus === null && c.focus === "points"));

  // Where am I? — the breadcrumb above every screen.
  const crumb = useMemo(() => {
    // The store view is reached by clicking a row, not from the nav, so it
    // borrows Store 360's place in the tree and names the store itself.
    if (app.module === "store" && app.estate.storeId) {
      return { section: "Planning", group: "Estate", label: storeById(app.estate.storeId).name };
    }
    const g = groups.find((gr) => gr.children.some(isActive)) ?? groups.find((gr) => gr.children.some((c) => c.id === app.module));
    if (!g) return null;
    const c = g.children.find(isActive) ?? g.children.find((ch) => ch.id === app.module)!;
    return { section: g.section, group: g.label, label: c.label };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, app.module, app.focus, app.estate.storeId]);

  // ── New-since-you-looked dots ──────────────────────────────────────────────
  // A module carries a dot when something arrived that a person has not seen:
  // orders to pick, stock at the door, an SLA breach, an approval waiting.
  const dots = useMemo(() => {
    const d = new Set<ModuleId>();
    const mine = app.omni.filter((o) => o.storeId === app.storeId || app.role === "planner" || app.role === "leadership");
    if (mine.some((o) => o.status === "new" || o.status === "locating")) d.add("omni");
    if (app.tickets.some((t) => t.status === "awaiting_approval" || t.status === "auto_dispatched")) d.add("tickets");
    if (app.tasks.some((t) => t.storeId === app.storeId && t.status !== "done" && t.priority === 1)) d.add("storeday");
    if (app.role === "store" || app.role === "staff") {
      d.add("grn"); // a vehicle is at the door in the seeded day
      d.add("offers"); // this week's offer board is new
    }
    if (app.role === "store") {
      d.add("merch");
      if (app.leaves.some((l) => l.status === "pending")) d.add("team");
    }
    if (app.role === "planner" || app.role === "catplan" || app.role === "leadership" || app.role === "store") d.add("agents");
    if (app.trainings.length > 0) d.add("trainings");
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.omni, app.tickets, app.tasks, app.leaves, app.trainings, app.role, app.storeId]);

  // Pending work, surfaced where people look — the nav.
  const approvalsWaiting = useMemo(
    () => AGENTS.filter((a) => a.roles.includes(app.role)).reduce((n, a) => n + agentApprovals(a.id, app.storeId).length, 0),
    [app.role, app.storeId]
  );
  const stockExceptions = useMemo(
    () => (app.role === "store" ? sizeSetExceptions(app.storeId, 40).length : 0),
    [app.role, app.storeId]
  );

  // Keep the group of the active module open (sticky) so navigating elsewhere
  // doesn't collapse the section you were just using.
  useEffect(() => {
    const g = groups.find((gr) => gr.children.some((c) => app.module === c.id));
    if (g) setExpanded((c) => (c[g.key] ? c : { ...c, [g.key]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.module, app.focus, app.role]);

  // A new screen always starts at the top, and its dot clears.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setSeen((s) => (s.has(app.module) ? s : new Set(s).add(app.module)));
  }, [app.module, app.focus]);

  // Store roles run on floor tablets, used by people who are not desk workers:
  // everything a step bigger — text, buttons, touch targets — via the rem base.
  useEffect(() => {
    const simple = app.role === "store" || app.role === "staff";
    document.documentElement.style.fontSize = simple ? "17px" : "16px";
    return () => {
      document.documentElement.style.fontSize = "16px";
    };
  }, [app.role]);

  // ⌘K / Ctrl-K opens the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

          <button
            data-palette
            onClick={() => setPaletteOpen(true)}
            className="hidden md:inline-flex items-center gap-2.5 border border-line bg-[color:var(--plane)] px-3 py-1.5 text-xs text-muted hover:border-[color:var(--brand)] hover:text-ink transition-colors"
            title="Jump to any screen or action"
          >
            <span aria-hidden>⌕</span>
            <span>Search</span>
            <span className="kbd">⌘K</span>
          </button>
          <button
            data-palette-sm
            onClick={() => setPaletteOpen(true)}
            className="btn-ghost md:hidden !px-2"
            aria-label="Search"
          >
            ⌕
          </button>

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
            // A store login belongs to one person at one store.
            <span className="text-xs text-ink font-medium shrink-0">
              {app.userName ? `${app.userName} · ` : ""}
              {(() => {
                const s = STORES.find((x) => x.id === app.storeId)!;
                return `${s.name} · ${s.city}`;
              })()}
            </span>
          ) : (
            <>
              <span className="text-xs text-ink2 font-medium shrink-0">{STORES.length} stores · live</span>
              {/* Planning picks a store in Store 360, not from the header — a
                  second store selector up here only competed with it. */}
              {app.role === "leadership" && (
                <>
                  <span className="text-muted text-xs shrink-0 hidden sm:inline">·</span>
                  <span className="label shrink-0">Focus store</span>
                  <StorePicker />
                </>
              )}
            </>
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
                          {/* A dot on the group when something inside it is new and unopened. */}
                          {!open && g.children.some((c) => dots.has(c.id) && !seen.has(c.id)) && <NewDot />}
                          {g.key === "invm" && stockExceptions > 0 && <CountBadge n={stockExceptions} tone="critical" />}
                          {(g.key === "sai" || g.key === "pai" || g.key === "aai") && approvalsWaiting > 0 && (
                            <CountBadge n={approvalsWaiting} tone="brand" />
                          )}
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
                                    <span className="flex-1">{c.label}</span>
                                    {dots.has(c.id) && !seen.has(c.id) && <NewDot />}
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
          {/* Bottom padding keeps the floating Arvi launcher clear of tappable content. */}
          <div key={`${app.module}:${app.focus ?? ""}`} className="max-w-[1320px] mx-auto p-3 sm:p-6 pb-24 fade">
            {crumb && (
              <div className="label mb-3 no-print" aria-label="You are here">
                {crumb.section} · {crumb.group} · <span style={{ color: "var(--text-primary)" }}>{crumb.label}</span>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {app.toast && <Toast key={app.toast.id} message={app.toast.message} tone={app.toast.tone} onDone={() => app.dispatch({ type: "toast:clear" })} />}
    </div>
  );
}

function NewDot() {
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--brand)" }} aria-label="new" />;
}

function CountBadge({ n, tone }: { n: number; tone: "brand" | "critical" }) {
  const style =
    tone === "critical"
      ? { background: "var(--crit-soft)", color: "var(--status-critical)" }
      : { background: "var(--brand-soft)", color: "var(--brand)" };
  return (
    <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full num" style={style}>
      {n}
    </span>
  );
}

function LiveDot() {
  return <span className="w-2 h-2 rounded-full pulse-crit" style={{ background: "var(--status-good)" }} aria-label="live" />;
}

// ── Role hierarchy: Store (Manager | Staff) · Planning (Retail | Buying) · Super Admin

function RoleSwitcher() {
  const app = useApp();
  const storeSide = app.role === "store" || app.role === "staff";
  const planningSide = app.role === "planner" || app.role === "catplan";

  const pill = (active: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
      active ? "bg-raised text-ink shadow-card" : "text-ink2 hover:text-ink"
    }`;

  return (
    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[color:var(--plane)] border border-line">
      {/* Store, with its two sub-logins */}
      <div className={`flex items-center gap-0.5 rounded-lg px-1 py-0.5 ${storeSide ? "bg-[color:var(--brand-soft)]" : ""}`}>
        <span className={`text-2xs font-semibold px-1 ${storeSide ? "text-[color:var(--brand)]" : "text-muted"}`}>Store</span>
        <button data-role="staff" onClick={() => app.setRole("staff")} title="Store Staff — floor and till operations" className={pill(app.role === "staff")}>
          Staff
        </button>
        <button data-role="store" onClick={() => app.setRole("store")} title="Store Manager — insights and operations" className={pill(app.role === "store")}>
          Manager
        </button>
      </div>

      <span className="w-px h-5 bg-[color:var(--line)]" />

      {/* Planning is two jobs: regional runs the estate day to day, category owns the season. */}
      <div className={`flex items-center gap-0.5 rounded-lg px-1 py-0.5 ${planningSide ? "bg-[color:var(--brand-soft)]" : ""}`}>
        <span className={`text-2xs font-semibold px-1 ${planningSide ? "text-[color:var(--brand)]" : "text-muted"}`}>Planning</span>
        <button data-role="planner" onClick={() => app.setRole("planner")} title="Retail Planning — the estate day to day" className={pill(app.role === "planner")}>
          Retail
        </button>
        <button data-role="catplan" onClick={() => app.setRole("catplan")} title="Buying team — season, OTB, buy depth" className={pill(app.role === "catplan")}>
          Buying
        </button>
      </div>
      <button data-role="leadership" onClick={() => app.setRole("leadership")} title="Leadership view" className={pill(app.role === "leadership")}>
        Super Admin
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
      aria-label="Store"
    >
      {STORES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} · {s.brand} · {s.city}
        </option>
      ))}
    </select>
  );
}
