// ─────────────────────────────────────────────────────────────────────────────
// Information architecture — the single source of truth for navigation.
// Two levels: a SECTION (Operations / Insights / Planning / Admin) contains
// function GROUPS (Movement, Customers, …), each holding selectable items.
// The sidebar and the command palette both read from here, so they can
// never disagree about what a role can reach.
// ─────────────────────────────────────────────────────────────────────────────

import type { ModuleId } from "./state";
import type { RoleId } from "./types";

export interface NavChild {
  id: ModuleId;
  label: string;
  /** Optional sub-view within the module (e.g. crm → enrol). */
  focus?: string;
}

export interface NavGroup {
  key: string;
  label: string;
  glyph: string;
  roles: RoleId[];
  section: string;
  children: NavChild[];
}

export const NAV_GROUPS: NavGroup[] = [
  // ── Operations — staff and manager ──
  {
    key: "sell", label: "Sell", glyph: "▣", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "pos", label: "Billing" },
      { id: "bills", label: "Bills & Returns" },
      { id: "omni", label: "Online Orders" },
    ],
  },
  {
    key: "inv", label: "Inventory", glyph: "▦", roles: ["staff"], section: "Operations",
    children: [
      { id: "lookup", label: "Check stock" },
      { id: "savesale", label: "Inter-store transfer" },
    ],
  },
  {
    // The manager's single stock home — lookup, transfers, moves and refills in one place.
    key: "invm", label: "Inventory", glyph: "▦", roles: ["store"], section: "Operations",
    children: [
      { id: "lookup", label: "Check stock" },
      { id: "savesale", label: "Inter-store transfer" },
      { id: "merch", label: "Smart Moves" },
      { id: "sizeset", label: "Size & Stock" },
      { id: "replenish", label: "Replenishment" },
    ],
  },
  {
    key: "movement", label: "Movement", glyph: "⇅", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "grn", label: "Receive stock" },
      { id: "outward", label: "Send stock out" },
    ],
  },
  {
    key: "customers", label: "Customers", glyph: "◐", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "crm", label: "Loyalty", focus: "points" },
      { id: "crm", label: "Add a member", focus: "enrol" },
    ],
  },
  {
    key: "work", label: "My Work", glyph: "☰", roles: ["staff", "store"], section: "Operations",
    children: [
      { id: "storeday", label: "Tasks & Chores" },
      { id: "tickets", label: "Report a problem" },
    ],
  },
  {
    key: "shiftg", label: "Me", glyph: "◷", roles: ["staff"], section: "Operations",
    children: [
      { id: "shift", label: "Shifts" },
      { id: "attendance", label: "Attendance" },
    ],
  },
  {
    key: "teamg", label: "Team", glyph: "◔", roles: ["store"], section: "Operations",
    children: [{ id: "team", label: "Staff & Shifts" }],
  },

  // ── Insights — manager only ──
  {
    key: "performance", label: "Performance", glyph: "◧", roles: ["store"], section: "Insights",
    children: [
      { id: "home", label: "My store today" },
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
    key: "money", label: "Money", glyph: "₹", roles: ["store"], section: "Operations",
    children: [{ id: "cash", label: "Cash" }],
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
      { id: "merch", label: "Smart Moves" },
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

export const SECTION_ORDER = ["Operations", "Insights", "Planning", "Admin"];

/** Quick actions the command palette offers on top of plain navigation. */
export interface NavAction {
  label: string;
  hint: string;
  id: ModuleId;
  focus?: string;
  roles: RoleId[];
}

export const NAV_ACTIONS: NavAction[] = [
  { label: "Start a new bill", hint: "Opens the billing screen", id: "pos", roles: ["staff", "store"] },
  { label: "Check stock in another store", hint: "Every store and the warehouse", id: "lookup", roles: ["staff", "store"] },
  { label: "Check loyalty points", hint: "Ten seconds, no queue held up", id: "crm", focus: "points", roles: ["staff", "store"] },
  { label: "Return or exchange a bill", hint: "Last 30 days, with a reason", id: "bills", roles: ["staff", "store"] },
  { label: "Add a member", hint: "Name and mobile, done", id: "crm", focus: "enrol", roles: ["staff", "store"] },
  { label: "Report a problem", hint: "Opens tickets", id: "tickets", roles: ["staff", "store"] },
  { label: "End my shift", hint: "Count the cash and hand over", id: "shift", roles: ["staff"] },
  { label: "Ask for leave", hint: "Attendance and the holiday calendar", id: "attendance", roles: ["staff"] },
  { label: "Pull stock from the warehouse", hint: "Replenishment", id: "replenish", roles: ["store"] },
  { label: "Plan next week's shifts", hint: "Staff & Shifts", id: "team", roles: ["store"] },
  { label: "Review smart stock moves", hint: "Festival & swap suggestions", id: "merch", roles: ["store", "planner"] },
  { label: "Review agent approvals", hint: "AI agents waiting on you", id: "agents", roles: ["store", "planner", "leadership"] },
  { label: "Create a training", hint: "Publishes to every store", id: "trainings", roles: ["planner"] },
  { label: "Open live execution", hint: "The estate right now", id: "live", roles: ["planner", "leadership"] },
];
