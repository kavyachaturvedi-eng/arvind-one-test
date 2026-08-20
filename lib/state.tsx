"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Application state. One store, one action log.
//
// Every mutation appends to the audit trail, because "who changed what, and
// which system did it land in" is the question that kills adoption in a
// multi-system retail estate.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import {
  CASH_EXCEPTIONS,
  DAY,
  HOUR,
  NOW,
  SEED_OMNI,
  SEED_OUTWARD,
  SEED_TICKETS,
  STORES,
  STYLES,
  storeById,
  styleById,
} from "./seed";
import { classifyCancellation, evaluateIstPolicy, splitOutward, type IstPolicyInput } from "./rules";
import { NO_FILTERS, type EstateFilters, type Period } from "./engine";
import type {
  AllocationPush,
  AuditEntry,
  Cycle,
  CycleKind,
  StockMove,
  TrainingItem,
  CashException,
  HqAssignment,
  ISTRequest,
  ISTStatus,
  NormChange,
  OmniOrder,
  OutwardBatch,
  PlanningRequest,
  PlanningRequestKind,
  RequestEvidence,
  RoleId,
  Size,
  Store,
  Task,
  Ticket,
} from "./types";

export type ModuleId =
  | "home"
  | "live"
  | "truth"
  | "savesale"
  | "sizeset"
  | "omni"
  | "outward"
  | "storeday"
  | "tickets"
  | "cash"
  | "allocate"
  | "moves"
  | "performance"
  | "catchment"
  | "ask"
  | "governance"
  | "grn"
  | "replenish"
  | "crm"
  | "pos"
  | "reports"
  | "exec"
  | "trainings"
  | "agents"
  | "team"
  | "merch"
  | "lookup"
  | "bills"
  | "attendance"
  | "offers"
  | "health"
  // ── Retail planning ──
  | "store360"
  | "store"
  | "inv"
  | "run"
  | "alloc"
  | "otb"
  | "asks"
  | "planset"
  | "hqtask"
  | "renew"
  | "move"
  | "log"
  | "stores"
;

interface AppState {
  /** Signed in? The login screen shows until a user picks who they are. */
  authed: boolean;
  role: RoleId;
  storeId: string;
  module: ModuleId;
  /** Optional sub-view within a module, set by nav children (e.g. crm → "enrol"). */
  focus: string | null;
  ist: ISTRequest[];
  tickets: Ticket[];
  omni: OmniOrder[];
  outward: OutwardBatch[];
  tasks: Task[];
  trainings: TrainingItem[];
  cash: CashException[];
  /** Leave requests from staff — the manager decides in Staff & Shifts. */
  leaves: LeaveRequest[];
  /** The trading day: opened once each morning by the manager or first staff in. */
  dayOpen: boolean;
  dayClosed: boolean;
  /** Cash counted into the drawer at day open. */
  openFloat: number;
  /** Who is signed in, once a PIN is entered. */
  userName: string | null;
  users: StoreUser[];
  creditNotes: CreditNote[];
  /** Register whose printer is taking another register's jobs. */
  printerRoutedTo: string | null;
  /** Card terminal batches settled today. */
  cardBatched: boolean;
  audit: AuditEntry[];
  toast: { id: number; message: string; tone: "good" | "warn" | "info" } | null;
  clockOffsetMinutes: number;

  // ── Retail planning ──
  /**
   * The estate view. Flat by design: every store, plus filters that narrow it.
   * `storeId` is set when a planner has opened one store; null is the list.
   */
  estate: { filters: EstateFilters; period: Period; storeId: string | null };
  /** Store asks waiting on planning. Store proposes, planning decides. */
  requests: PlanningRequest[];
  /** Run lines planning has released to the warehouse. */
  released: string[];
  /** Run lines planning has explicitly dropped from this run. */
  dropped: string[];
  /** Norm overrides planning has set, by store id. Falls back to the seed norm. */
  norms: Record<string, number>;
  normLog: NormChange[];
  /** Tasks head office has assigned to stores this session. */
  hqTasks: HqAssignment[];
  /** Stores the replenishment run is paused for. It fires for everyone else. */
  pausedStores: string[];
  /** Replenishment, renewal and allocation cycles. */
  cycles: Cycle[];
  /** Every unit movement that actually happened. */
  moves: StockMove[];
  /** Units planning has pushed to a store outside the run. */
  pushes: AllocationPush[];
}

/** What a person is allowed to do. The manager sets these when adding staff. */
export type Permission = "bill" | "refund" | "discount" | "receive" | "transfer" | "reports";

export const ALL_PERMISSIONS: { id: Permission; label: string }[] = [
  { id: "bill", label: "Take payments" },
  { id: "refund", label: "Refunds and exchanges" },
  { id: "discount", label: "Apply coupons" },
  { id: "receive", label: "Receive and send stock" },
  { id: "transfer", label: "Raise transfers" },
  { id: "reports", label: "See store reports" },
];

export interface StoreUser {
  name: string;
  role: string;
  pin: string;
  permissions: Permission[];
}

export interface CreditNote {
  id: string;
  phone: string;
  customer: string;
  amount: number;
  balance: number;
  againstBill: string;
  issuedLabel: string;
}

export interface LeaveRequest {
  id: string;
  who: string;
  date: string;
  reason: string;
  status: "pending" | "approved" | "declined";
}

let reqSeq = 1;

/** How each kind of cycle reads on screen and in the trail. */
export const CYCLE_LABEL: Record<CycleKind, string> = {
  replenishment: "Replenishment",
  renewal: "Renewal",
  allocation: "Allocation",
  pullback: "Pull-back",
};

/** How each kind of store ask reads on screen and in the audit trail. */
export const REQUEST_LABEL: Record<PlanningRequestKind, string> = {
  replenish: "Replenishment",
  renew: "Renewal",
  rtv: "RTV",
  style_ask: "Style request",
  norm_change: "Norm change",
};

type Action =
  | { type: "login"; role: RoleId; storeId?: string; userName?: string }
  | { type: "user:add"; user: StoreUser }
  | { type: "user:permissions"; name: string; permissions: Permission[] }
  | { type: "credit:issue"; note: CreditNote }
  | { type: "credit:redeem"; id: string; amount: number }
  | { type: "printer:route"; to: string | null }
  | { type: "card:batch" }
  | { type: "logout" }
  | { type: "role"; role: RoleId }
  | { type: "store"; storeId: string }
  | { type: "module"; module: ModuleId; focus?: string | null }
  | { type: "ist:create"; request: ISTRequest }
  | { type: "ist:status"; id: string; status: ISTStatus; actor: string; label: string; by?: string; reason?: string }
  | { type: "ticket:update"; id: string; patch: Partial<Ticket>; label?: string; actor?: string }
  | { type: "ticket:create"; ticket: Ticket }
  | { type: "omni:update"; id: string; patch: Partial<OmniOrder>; label?: string; actor?: string }
  | { type: "outward:create"; batch: OutwardBatch }
  | { type: "outward:update"; id: string; patch: Partial<OutwardBatch>; label?: string; actor?: string }
  | { type: "task:update"; id: string; patch: Partial<Task> }
  | { type: "task:create"; task: Task }
  | { type: "training:create"; training: TrainingItem }
  | { type: "cash:update"; id: string; patch: Partial<CashException> }
  | { type: "day:open"; by: string; float?: number }
  | { type: "day:close"; by: string }
  | { type: "day:reopen" }
  | { type: "leave:apply"; leave: LeaveRequest }
  | { type: "leave:decide"; id: string; status: "approved" | "declined"; by: string }
  | { type: "audit"; entry: AuditEntry }
  | { type: "toast"; message: string; tone?: "good" | "warn" | "info" }
  | { type: "toast:clear" }
  // ── Retail planning ──
  | { type: "estate:filter"; patch: Partial<EstateFilters> }
  | { type: "estate:period"; period: Period }
  | { type: "estate:open"; storeId: string | null }
  | { type: "url"; params: URLSearchParams }
  | { type: "request:create"; request: PlanningRequest }
  | { type: "request:decide"; id: string; status: "approved" | "rejected"; by: string; note?: string }
  | { type: "run:release"; lineIds: string[]; by: string; label: string }
  | { type: "run:drop"; lineIds: string[]; by: string; label: string }
  | { type: "norm:set"; storeId: string; to: number; by: string; reason: string }
  | { type: "hq:assign"; task: HqAssignment }
  | { type: "store:pause"; storeId: string; paused: boolean; by: string }
  | { type: "cycle:create"; cycle: Cycle }
  | { type: "cycle:decide"; id: string; status: "approved" | "rejected"; by: string; note?: string }
  | { type: "cycle:apply"; id: string; moves: StockMove[]; by: string }
  | { type: "store:add"; store: Store }
  | { type: "alloc:push"; pushes: AllocationPush[]; by: string; label: string }
  | { type: "reset" };

// ── Initial tasks, generated from the exception engines ──────────────────────

function initialTasks(): Task[] {
  const s = STORES[0].id;
  return [
    {
      id: "T-1",
      storeId: s,
      title: "Repair broken size set — Flag Logo Cotton Polo",
      detail: "Size L at zero on a top-3 style with 6 days of full-price window left. Three donors inside the same-day lane.",
      origin: "size_set",
      assignedTo: "Rohit Sharma",
      dueAt: NOW + 2 * 3600_000,
      priority: 1,
      status: "todo",
      requiresPhoto: false,
      photoAttached: false,
      valueAtRisk: 41988,
      slaHours: 4,
    },
    {
      id: "T-2",
      storeId: s,
      title: "Reprint 41 price tags — 11 styles repriced overnight",
      detail: "Tags already queued to the in-store printer. Apply and confirm with a photo of the bay.",
      origin: "price_change",
      assignedTo: "Meera Pillai",
      dueAt: NOW + 6 * 3600_000,
      priority: 2,
      status: "todo",
      requiresPhoto: true,
      photoAttached: false,
      slaHours: 24,
    },
    {
      id: "T-3",
      storeId: s,
      title: "Window changeover — AW26 drop 1",
      detail: "Planogram published with reference photos. Submit a window photo to close.",
      origin: "vm",
      assignedTo: "Aditya Rane",
      dueAt: NOW + 20 * 3600_000,
      priority: 2,
      status: "doing",
      requiresPhoto: true,
      photoAttached: false,
      slaHours: 72,
    },
    {
      id: "T-4",
      storeId: s,
      title: "Locate OM-55021 — Oxford Solid Shirt, size L",
      detail: "Omni order routed here 40 minutes ago. Bay B3, rack 2 per last inward scan.",
      origin: "omni",
      assignedTo: "Sana Qureshi",
      dueAt: NOW + 20 * 60_000,
      priority: 1,
      status: "doing",
      requiresPhoto: false,
      photoAttached: false,
      valueAtRisk: 4299,
      slaHours: 1,
    },
    {
      id: "T-5",
      storeId: s,
      title: "Morning briefing — log and confirm by 13:30",
      detail: "Targets, zone coverage, sales focus and special task. Pre-filled from today's plan.",
      origin: "briefing",
      assignedTo: "Rohit Sharma",
      dueAt: NOW + 108 * 60_000,
      priority: 3,
      status: "done",
      requiresPhoto: false,
      photoAttached: false,
      slaHours: 4,
    },
    {
      id: "T-6",
      storeId: s,
      title: "Floor walk — section C, visual merchandising",
      detail: "Nine of 50 checks open. Price tags must be hidden on all faceouts before 14:00.",
      origin: "floor_walk",
      assignedTo: "Meera Pillai",
      dueAt: NOW + 3 * 3600_000,
      priority: 2,
      status: "todo",
      requiresPhoto: true,
      photoAttached: false,
      slaHours: 6,
    },
    {
      id: "T-7",
      storeId: s,
      title: "Clear UPI mismatch of ₹3,500 — invoice INV-77120",
      detail: "PSP shows pending for 19h, outside the normal 4h window.",
      origin: "cash",
      assignedTo: "Rohit Sharma",
      dueAt: NOW + 5 * 3600_000,
      priority: 2,
      status: "todo",
      requiresPhoto: false,
      photoAttached: false,
      valueAtRisk: 3500,
      slaHours: 8,
    },
  ];
}

/**
 * A handful of store asks already sitting in the queue, so the planner's inbox
 * is never empty on a demo. Store proposes, planning decides — these are the
 * proposals, and the evidence is frozen at the moment each was raised.
 */
function seedRequests(): PlanningRequest[] {
  return [
    {
      id: "REQ-3301",
      kind: "replenish",
      storeId: STORES[1].id,
      styleId: STYLES[0].id,
      size: "L",
      units: 24,
      raisedBy: "Aisha Khan",
      raisedAt: NOW - 19 * HOUR,
      note: "Third customer this week asked for L. Wall looks picked over.",
      evidence: { fillRate: 0.88, sellable: 41, ros: 1.4, coverDays: 29, sizeSetStatus: "broken", valueAtRisk: 128_000 },
      status: "open",
    },
    {
      id: "REQ-3302",
      kind: "renew",
      storeId: STORES[5].id,
      styleId: STYLES[7].id,
      units: 30,
      raisedBy: "Ritu Bansal",
      raisedAt: NOW - 2 * DAY - 3 * HOUR,
      note: "This one is done. Same wall since launch — needs something new before the festive weekend.",
      evidence: { fillRate: 1.06, sellable: 88, ros: 0.2, coverDays: 340, sizeSetStatus: "at_risk", valueAtRisk: 42_000 },
      status: "open",
    },
    {
      id: "REQ-3303",
      kind: "rtv",
      storeId: STORES[14].id,
      styleId: STYLES[12].id,
      units: 210,
      raisedBy: "Farhan Sheikh",
      raisedAt: NOW - 27 * HOUR,
      note: "Outlet door. Knitwear is not moving at this price and it is eating the back wall.",
      evidence: { fillRate: 1.19, sellable: 260, ros: 0.1, coverDays: 999, sizeSetStatus: "healthy", valueAtRisk: 0 },
      status: "open",
    },
    {
      id: "REQ-3304",
      kind: "style_ask",
      storeId: STORES[8].id,
      styleId: STYLES[3].id,
      raisedBy: "Nikhil Rao",
      raisedAt: NOW - 4 * DAY,
      note: "Customers keep asking for the slim fit in this. We only carry regular.",
      evidence: { fillRate: 0.95, sellable: 62, ros: 0.9, coverDays: 68, sizeSetStatus: "healthy", valueAtRisk: 0 },
      status: "open",
    },
    {
      id: "REQ-3305",
      kind: "norm_change",
      storeId: STORES[3].id,
      units: 420,
      raisedBy: "Sneha Deshpande",
      raisedAt: NOW - 6 * DAY,
      note: "New wall went in after the fit-out. We can hold about 400 more units.",
      evidence: { fillRate: 1.02, sellable: 3180, ros: 0, coverDays: 0, sizeSetStatus: "healthy", valueAtRisk: 0 },
      status: "approved",
      decidedBy: "Retail Planning",
      decidedAt: NOW - 5 * DAY,
      decisionNote: "Approved after the fit-out photos. Norm raised from 3,120 to 3,540.",
    },
  ];
}

const initial: AppState = {
  authed: false,
  role: "store",
  storeId: STORES[0].id,
  module: "home",
  focus: null,
  ist: [],
  tickets: SEED_TICKETS,
  omni: SEED_OMNI,
  outward: SEED_OUTWARD,
  tasks: initialTasks(),
  trainings: [],
  cash: CASH_EXCEPTIONS,
  leaves: [{ id: "LV-1", who: "Kiran Joshi", date: "Sun 16 Aug", reason: "Family function", status: "pending" }],
  dayOpen: false,
  dayClosed: false,
  openFloat: 8000,
  userName: null,
  users: [
    { name: "Rohit Sharma", role: "Store Manager", pin: "1234", permissions: ["bill", "refund", "discount", "receive", "transfer", "reports"] },
    { name: "Meera Pillai", role: "Cashier", pin: "1111", permissions: ["bill", "discount", "refund"] },
    { name: "Aditya Rane", role: "Floor", pin: "2222", permissions: ["bill", "receive", "transfer"] },
    { name: "Sana Qureshi", role: "Cashier", pin: "3333", permissions: ["bill", "discount"] },
    { name: "Devansh Patil", role: "Floor", pin: "4444", permissions: ["receive", "transfer"] },
    { name: "Kiran Joshi", role: "Omni champ", pin: "5555", permissions: ["bill", "receive"] },
  ],
  creditNotes: [
    { id: "CN-2041", phone: "9812345678", customer: "Ishita Malhotra", amount: 2199, balance: 2199, againstBill: "B-4333", issuedLabel: "3 Aug" },
  ],
  printerRoutedTo: null,
  cardBatched: false,
  estate: { filters: NO_FILTERS, period: "week", storeId: null },
  requests: seedRequests(),
  released: [],
  dropped: [],
  norms: {},
  normLog: [],
  hqTasks: [],
  pausedStores: [],
  cycles: [],
  moves: [],
  pushes: [],
  audit: [
    { at: NOW - 64 * 60_000, actor: "Commercial", action: "Price revision published", object: "11 styles", system: "Arvind One" },
    { at: NOW - 63 * 60_000, actor: "Arvind One", action: "Created reprint job TK-8803", object: "41 units", system: "Arvind One" },
    { at: NOW - 22 * 60_000, actor: "Arvind One", action: "Raised size-set exception", object: "TH-POL-4000 · size L", system: "Arvind One" },
  ],
  toast: null,
  clockOffsetMinutes: 0,
};

let toastSeq = 1;

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "login":
      return {
        ...state,
        authed: true,
        role: action.role,
        storeId: action.storeId ?? state.storeId,
        userName: action.userName ?? null,
        module: defaultModule(action.role),
      };
    case "user:add":
      return {
        ...state,
        users: [...state.users, action.user],
        audit: [{ at: NOW, actor: "Store Manager", action: `Added ${action.user.name} (${action.user.role}) with a PIN and ${action.user.permissions.length} permissions`, object: action.user.name, system: "Arvind One" }, ...state.audit],
      };
    case "user:permissions":
      return {
        ...state,
        users: state.users.map((u) => (u.name === action.name ? { ...u, permissions: action.permissions } : u)),
        audit: [{ at: NOW, actor: "Store Manager", action: `Changed what ${action.name} can do`, object: action.name, system: "Arvind One" }, ...state.audit],
      };
    case "credit:issue":
      return {
        ...state,
        creditNotes: [action.note, ...state.creditNotes],
        audit: [{ at: NOW, actor: state.userName ?? "Store Staff", action: `Credit note ${action.note.id} issued for ${action.note.amount} against ${action.note.againstBill}`, object: action.note.id, system: "POS" }, ...state.audit],
      };
    case "credit:redeem":
      return {
        ...state,
        creditNotes: state.creditNotes.map((n) => (n.id === action.id ? { ...n, balance: Math.max(0, n.balance - action.amount) } : n)),
        audit: [{ at: NOW, actor: state.userName ?? "Store Staff", action: `Credit note ${action.id} used for ${action.amount}`, object: action.id, system: "POS" }, ...state.audit],
      };
    case "printer:route":
      return {
        ...state,
        printerRoutedTo: action.to,
        audit: [{ at: NOW, actor: "Store Manager", action: action.to ? `Print jobs routed to ${action.to}` : "Print routing back to normal", object: "printer", system: "Arvind One" }, ...state.audit],
      };
    case "card:batch":
      return {
        ...state,
        cardBatched: true,
        audit: [{ at: NOW, actor: "Store Manager", action: "Card terminals batched for settlement", object: "terminals", system: "POS" }, ...state.audit],
      };
    case "logout":
      return { ...state, authed: false };
    case "role": {
      // Switching into a store role puts the right person's name in the header:
      // the manager for the manager view, a floor or till person for staff.
      let userName = state.userName;
      const manager = state.users.find((u) => u.role === "Store Manager");
      if (action.role === "store" && manager) userName = manager.name;
      if (action.role === "staff" && (!userName || userName === manager?.name)) {
        userName = state.users.find((u) => u.role !== "Store Manager")?.name ?? userName;
      }
      return { ...state, role: action.role, module: defaultModule(action.role), userName };
    }
    case "store":
      return { ...state, storeId: action.storeId };
    case "module":
      return { ...state, module: action.module, focus: action.focus ?? null };

    case "day:open":
      return {
        ...state,
        dayOpen: true,
        dayClosed: false,
        openFloat: action.float ?? state.openFloat,
        audit: [{ at: NOW, actor: action.by, action: "Day opened, floor checklist started and till float confirmed", object: "day-open", system: "Arvind One" }, ...state.audit],
      };
    case "day:close":
      return {
        ...state,
        dayClosed: true,
        audit: [{ at: NOW, actor: action.by, action: "Day closed, summary posted to SAP Finance", object: "day-close", system: "Arvind One" }, ...state.audit],
      };
    case "day:reopen":
      return { ...state, dayClosed: false };
    case "leave:apply":
      return {
        ...state,
        leaves: [...state.leaves, action.leave],
        audit: [{ at: NOW, actor: action.leave.who, action: `Leave requested for ${action.leave.date} — ${action.leave.reason}`, object: action.leave.id, system: "Arvind One" }, ...state.audit],
      };
    case "leave:decide":
      return {
        ...state,
        leaves: state.leaves.map((l) => (l.id === action.id ? { ...l, status: action.status } : l)),
        audit: [{ at: NOW, actor: action.by, action: `Leave ${action.id} ${action.status}`, object: action.id, system: "Arvind One" }, ...state.audit],
      };

    case "ist:create":
      return {
        ...state,
        ist: [action.request, ...state.ist],
        audit: [
          { at: action.request.createdAt, actor: action.request.raisedBy, action: "Raised inter-store transfer", object: action.request.id, system: "Arvind One" },
          ...state.audit,
        ],
      };

    case "ist:status":
      return {
        ...state,
        ist: state.ist.map((r) =>
          r.id === action.id
            ? {
                ...r,
                status: action.status,
                approvedBy: action.by ?? r.approvedBy,
                rejectionReason: action.reason ?? r.rejectionReason,
                events: [...r.events, { at: NOW + r.events.length * 60_000, actor: action.actor, label: action.label, system: "Arvind One" }],
              }
            : r
        ),
        audit: [{ at: NOW, actor: action.actor, action: action.label, object: action.id, system: "Arvind One" }, ...state.audit],
      };

    case "ticket:create":
      return {
        ...state,
        tickets: [action.ticket, ...state.tickets],
        audit: [{ at: action.ticket.raisedAt, actor: action.ticket.raisedBy, action: "Raised ticket", object: action.ticket.id, system: "Arvind One" }, ...state.audit],
      };

    case "ticket:update":
      return {
        ...state,
        tickets: state.tickets.map((t) =>
          t.id === action.id
            ? {
                ...t,
                ...action.patch,
                events: action.label
                  ? [...t.events, { at: NOW, actor: action.actor ?? "Arvind One", label: action.label, system: "Arvind One" }]
                  : t.events,
              }
            : t
        ),
        audit: action.label ? [{ at: NOW, actor: action.actor ?? "Arvind One", action: action.label, object: action.id, system: "Arvind One" }, ...state.audit] : state.audit,
      };

    case "omni:update":
      return {
        ...state,
        omni: state.omni.map((o) =>
          o.id === action.id
            ? {
                ...o,
                ...action.patch,
                events: action.label
                  ? [...o.events, { at: NOW, actor: action.actor ?? "Arvind One", label: action.label, system: "Arvind One" }]
                  : o.events,
              }
            : o
        ),
        audit: action.label ? [{ at: NOW, actor: action.actor ?? "Arvind One", action: action.label, object: action.id, system: "Arvind One" }, ...state.audit] : state.audit,
      };

    case "outward:create":
      return {
        ...state,
        outward: [action.batch, ...state.outward],
        audit: [{ at: action.batch.createdAt, actor: "Arvind One", action: "Created outward batch", object: action.batch.id, system: "Arvind One" }, ...state.audit],
      };

    case "outward:update":
      return {
        ...state,
        outward: state.outward.map((b) =>
          b.id === action.id
            ? {
                ...b,
                ...action.patch,
                events: action.label ? [...b.events, { at: NOW, actor: action.actor ?? "Arvind One", label: action.label, system: "Arvind One" }] : b.events,
              }
            : b
        ),
        audit: action.label ? [{ at: NOW, actor: action.actor ?? "Arvind One", action: action.label, object: action.id, system: "Arvind One" }, ...state.audit] : state.audit,
      };

    case "task:update":
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)) };

    case "task:create":
      return { ...state, tasks: [action.task, ...state.tasks] };

    case "training:create":
      return {
        ...state,
        trainings: [action.training, ...state.trainings],
        audit: [
          { at: NOW, actor: action.training.createdBy, action: `Training published: ${action.training.title}`, object: action.training.audience, system: "Arvind One" },
          ...state.audit,
        ],
      };

    case "cash:update":
      return { ...state, cash: state.cash.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };

    case "audit":
      return { ...state, audit: [action.entry, ...state.audit] };

    case "toast":
      return { ...state, toast: { id: toastSeq++, message: action.message, tone: action.tone ?? "good" } };

    case "toast:clear":
      return { ...state, toast: null };

    // ── Retail planning ──────────────────────────────────────────────────────
    //
    // Every planning decision is auditable for the same reason store mutations
    // are: a store has to be able to see who decided its ask, and when.

    case "estate:filter":
      // Narrowing always returns to the list — a filter applied while inside one
      // store would silently change what the numbers describe. That includes
      // leaving the store page, not just clearing which store is open.
      return {
        ...state,
        module: state.module === "store" ? "store360" : state.module,
        estate: { ...state.estate, filters: { ...state.estate.filters, ...action.patch }, storeId: null },
      };

    case "estate:period":
      return { ...state, estate: { ...state.estate, period: action.period } };

    case "estate:open":
      // Opening a store is a page of its own, not a mode of the list.
      return {
        ...state,
        module: action.storeId ? "store" : "store360",
        estate: { ...state.estate, storeId: action.storeId },
      };

    case "url": {
      // Restoring from the address bar (a link, or the back button).
      const p = action.params;
      const one = (k: string, fallback: string) => p.get(k) ?? fallback;
      const storeId = p.get("store");
      const module = (p.get("m") as ModuleId | null) ?? state.module;
      const period = (p.get("p") as Period | null) ?? state.estate.period;
      return {
        ...state,
        role: (p.get("role") as RoleId | null) ?? state.role,
        module,
        focus: p.get("f"),
        estate: {
          filters: {
            region: one("region", "all"),
            cluster: one("cluster", "all"),
            grade: one("grade", "all"),
            band: one("band", "all"),
          },
          period,
          storeId,
        },
      };
    }

    case "request:create":
      return {
        ...state,
        requests: [action.request, ...state.requests],
        audit: [
          { at: action.request.raisedAt, actor: action.request.raisedBy, action: `${REQUEST_LABEL[action.request.kind]} raised to planning`, object: `${action.request.id} · ${storeById(action.request.storeId).name}`, system: "Arvind One" },
          ...state.audit,
        ],
      };

    case "request:decide": {
      const req = state.requests.find((r) => r.id === action.id);
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.id
            ? { ...r, status: action.status, decidedBy: action.by, decidedAt: NOW, decisionNote: action.note }
            : r,
        ),
        audit: [
          { at: NOW, actor: action.by, action: `Store ask ${action.status}`, object: `${action.id}${req ? ` · ${storeById(req.storeId).name}` : ""}`, system: "Arvind One" },
          ...state.audit,
        ],
      };
    }

    case "run:release":
      return {
        ...state,
        released: [...new Set([...state.released, ...action.lineIds])],
        dropped: state.dropped.filter((id) => !action.lineIds.includes(id)),
        audit: [{ at: NOW, actor: action.by, action: "Run lines released to the warehouse", object: action.label, system: "Arvind One" }, ...state.audit],
      };

    case "run:drop":
      return {
        ...state,
        dropped: [...new Set([...state.dropped, ...action.lineIds])],
        released: state.released.filter((id) => !action.lineIds.includes(id)),
        audit: [{ at: NOW, actor: action.by, action: "Run lines dropped", object: action.label, system: "Arvind One" }, ...state.audit],
      };

    case "norm:set": {
      const store = storeById(action.storeId);
      const from = state.norms[action.storeId] ?? store.norm;
      return {
        ...state,
        norms: { ...state.norms, [action.storeId]: action.to },
        normLog: [
          { id: `NC-${action.storeId}-${state.normLog.length + 1}`, at: NOW, by: action.by, storeId: action.storeId, from, to: action.to, reason: action.reason },
          ...state.normLog,
        ],
        audit: [{ at: NOW, actor: action.by, action: "Norm changed", object: `${store.name} · ${from} → ${action.to} units`, system: "Arvind One" }, ...state.audit],
      };
    }

    case "hq:assign":
      return {
        ...state,
        hqTasks: [action.task, ...state.hqTasks],
        audit: [
          {
            at: action.task.raisedAt,
            actor: action.task.raisedBy,
            action: "Task assigned to stores",
            object: `${action.task.title} · ${action.task.storeIds.length} ${action.task.storeIds.length === 1 ? "store" : "stores"}`,
            system: "Arvind One",
          },
          ...state.audit,
        ],
      };

    case "store:pause":
      return {
        ...state,
        pausedStores: action.paused
          ? [...new Set([...state.pausedStores, action.storeId])]
          : state.pausedStores.filter((id) => id !== action.storeId),
        audit: [
          {
            at: NOW,
            actor: action.by,
            action: action.paused ? "Replenishment paused" : "Replenishment resumed",
            object: storeById(action.storeId).name,
            system: "Arvind One",
          },
          ...state.audit,
        ],
      };

    case "cycle:create":
      return {
        ...state,
        cycles: [action.cycle, ...state.cycles],
        audit: [
          {
            at: action.cycle.createdAt,
            actor: action.cycle.createdBy,
            action: `${CYCLE_LABEL[action.cycle.kind]} cycle created`,
            object: `${action.cycle.id} · ${action.cycle.lines.length} lines · ${action.cycle.lines.reduce((a, l) => a + l.units, 0)} units`,
            system: "Arvind One",
          },
          ...state.audit,
        ],
      };

    case "cycle:decide": {
      const c = state.cycles.find((x) => x.id === action.id);
      return {
        ...state,
        cycles: state.cycles.map((x) =>
          x.id === action.id ? { ...x, status: action.status, decidedBy: action.by, decidedAt: NOW, decisionNote: action.note } : x,
        ),
        audit: [
          {
            at: NOW,
            actor: action.by,
            action: `${c ? CYCLE_LABEL[c.kind] : "Cycle"} cycle ${action.status}`,
            object: action.id,
            system: "Arvind One",
          },
          ...state.audit,
        ],
      };
    }

    case "cycle:apply": {
      const c = state.cycles.find((x) => x.id === action.id);
      return {
        ...state,
        cycles: state.cycles.map((x) => (x.id === action.id ? { ...x, status: "applied", appliedAt: NOW } : x)),
        moves: [...action.moves, ...state.moves],
        audit: [
          {
            at: NOW,
            actor: action.by,
            action: `${c ? CYCLE_LABEL[c.kind] : "Cycle"} applied`,
            object: `${action.id} · ${action.moves.reduce((a, m) => a + m.units, 0)} units moved`,
            system: "Arvind One",
          },
          ...state.audit,
        ],
      };
    }

    case "store:add":
      return {
        ...state,
        audit: [
          {
            at: NOW,
            actor: "Super Admin",
            action: "Store opened",
            object: `${action.store.name} · ${action.store.code} · ${action.store.brand}`,
            system: "Arvind One",
          },
          ...state.audit,
        ],
      };

    case "alloc:push":
      return {
        ...state,
        pushes: [...action.pushes, ...state.pushes],
        audit: [{ at: NOW, actor: action.by, action: "Units assigned from the warehouse", object: action.label, system: "Arvind One" }, ...state.audit],
      };

    case "reset":
      return { ...initial, role: state.role, module: state.module, storeId: state.storeId };

    default:
      return state;
  }
}

function defaultModule(role: RoleId): ModuleId {
  // Staff go straight to the till, which opens the day; the manager to
  // insights; planning to the live control tower; the CEO to the summary.
  // Staff to the till, the manager to insights, regional planning to Store 360
  // (the hierarchy is where their day starts), category planning to OTB.
  return role === "staff" ? "pos" : role === "store" ? "home" : role === "planner" ? "store360" : role === "catplan" ? "otb" : "exec";
}

// ── Context ──────────────────────────────────────────────────────────────────

interface Ctx extends AppState {
  dispatch: React.Dispatch<Action>;
  setRole: (r: RoleId) => void;
  setStore: (s: string) => void;
  go: (m: ModuleId, focus?: string) => void;
  toastNow: (m: string, tone?: "good" | "warn" | "info") => void;
  createIst: (input: CreateIstInput) => ISTRequest;
  actorName: string;
  // ── Retail planning ──
  setFilter: (patch: Partial<EstateFilters>) => void;
  setPeriod: (p: Period) => void;
  openStore: (storeId: string | null) => void;
  /** The store's norm, honouring any change planning has made this session. */
  normFor: (storeId: string) => number;
  /** Raise a store ask. Store proposes; the decision belongs to planning. */
  raiseRequest: (input: RaiseRequestInput) => PlanningRequest;
}

export interface RaiseRequestInput {
  kind: PlanningRequestKind;
  storeId: string;
  styleId?: string;
  size?: Size;
  units?: number;
  note?: string;
  evidence: RequestEvidence;
}

const AppCtx = createContext<Ctx | null>(null);

export interface CreateIstInput {
  styleId: string;
  size: Size;
  qty: number;
  fromStoreId: string;
  toStoreId: string;
  reason: ISTRequest["reason"];
  customerName?: string;
  customerPhone?: string;
  raisedBy: string;
  policy: IstPolicyInput;
}

let istSeq = 100;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const actorName = useMemo(() => {
    // A signed-in person's own name, once a PIN identified them.
    if (state.userName && (state.role === "store" || state.role === "staff")) return state.userName;
    switch (state.role) {
      case "store":
        return "Store Manager";
      case "staff":
        return "Store Staff";
      case "planner":
        return "Retail Planning";
      case "catplan":
        return "Buying team";
      case "leadership":
        return "Super Admin";
    }
  }, [state.role, state.userName]);

  const createIst = useCallback((input: CreateIstInput): ISTRequest => {
    const result = evaluateIstPolicy(input.policy);
    const id = `IST-${istSeq++}`;
    const status: ISTStatus =
      result.outcome === "auto_approved" ? "approved" : result.outcome === "needs_approval" ? "pending_approval" : "rejected";

    const events = [
      { at: NOW, actor: input.raisedBy, label: "Request raised at the till", system: "Arvind One" as const },
      {
        at: NOW + 1000,
        actor: "Arvind One",
        label:
          result.outcome === "auto_approved"
            ? "Policy engine auto-approved"
            : result.outcome === "needs_approval"
            ? "Policy gate hit — routed to the planner for a one-tap decision"
            : "Blocked by policy — see the trail",
        system: "Arvind One" as const,
      },
    ];
    if (result.outcome === "auto_approved") {
      events.push({ at: NOW + 2000, actor: "Arvind One", label: "Pick task created at the donor store; receipt task created here", system: "Arvind One" });
      events.push({ at: NOW + 3000, actor: "Arvind One", label: "Transfer posted to the inventory ledger; pickup advice raised with the carrier", system: "Arvind One" });
    }

    const request: ISTRequest = {
      id,
      createdAt: NOW,
      raisedBy: input.raisedBy,
      reason: input.reason,
      styleId: input.styleId,
      size: input.size,
      qty: input.qty,
      fromStoreId: input.fromStoreId,
      toStoreId: input.toStoreId,
      status,
      policyTrail: result.checks,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      slaHours: result.slaHours,
      legacyHours: result.legacyHours,
      rejectionReason: result.outcome === "blocked" ? result.checks.find((c) => c.severity === "blocking" && !c.passed)?.detail : undefined,
      events,
    };

    dispatch({ type: "ist:create", request });
    if (status === "approved") {
      dispatch({
        type: "task:create",
        task: {
          id: `T-${id}`,
          storeId: input.fromStoreId,
          title: `Pick and pack ${input.qty} × ${styleById(input.styleId).name} (${input.size}) for transfer`,
          detail: `Transfer ${id} to ${input.toStoreId}. Customer waiting.`,
          origin: "ist",
          assignedTo: "Donor store team",
          dueAt: NOW + 4 * 3600_000,
          priority: 1,
          status: "todo",
          requiresPhoto: false,
          photoAttached: false,
          slaHours: 4,
        },
      });
    }
    return request;
  }, []);

  // ── The address bar is state too ─────────────────────────────────────────
  //
  // Without this, the browser back button throws you out of the app instead of
  // back a screen. Every screen a planner can be on is addressable, so a link
  // to "Phoenix Palladium, this week" is a link.
  const fromUrl = React.useRef(false);
  // A deep link is read before sign-in, but `login` resets the module to the
  // role's default — so the link has to be re-applied once the person is in.
  const deepLink = React.useRef<URLSearchParams | null>(null);

  React.useEffect(() => {
    const apply = () => {
      fromUrl.current = true;
      dispatch({ type: "url", params: new URLSearchParams(window.location.search) });
    };
    if (window.location.search) {
      deepLink.current = new URLSearchParams(window.location.search);
      apply();
    }
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  React.useEffect(() => {
    if (!state.authed || !deepLink.current) return;
    const params = deepLink.current;
    deepLink.current = null;
    if (!params.get("m")) return;
    fromUrl.current = true;
    dispatch({ type: "url", params });
  }, [state.authed]);

  React.useEffect(() => {
    if (!state.authed) return;
    const p = new URLSearchParams();
    p.set("role", state.role);
    p.set("m", state.module);
    if (state.focus) p.set("f", state.focus);
    // Only the store view carries a store in the address — otherwise the URL
    // would claim a store you are not looking at.
    if (state.module === "store" && state.estate.storeId) p.set("store", state.estate.storeId);
    if (state.estate.period !== "week") p.set("p", state.estate.period);
    (["region", "cluster", "grade", "band"] as const).forEach((k) => {
      if (state.estate.filters[k] !== "all") p.set(k, state.estate.filters[k]);
    });
    const next = `${window.location.pathname}?${p.toString()}`;
    if (fromUrl.current) {
      fromUrl.current = false;
      window.history.replaceState(null, "", next);
      return;
    }
    if (window.location.search !== `?${p.toString()}`) window.history.pushState(null, "", next);
  }, [state.authed, state.role, state.module, state.focus, state.estate]);

  const raiseRequest = useCallback(
    (input: RaiseRequestInput): PlanningRequest => {
      const request: PlanningRequest = {
        id: `REQ-${4100 + reqSeq++}`,
        kind: input.kind,
        storeId: input.storeId,
        styleId: input.styleId,
        size: input.size,
        units: input.units,
        raisedBy: actorName,
        raisedAt: NOW,
        note: input.note,
        evidence: input.evidence,
        status: "open",
      };
      dispatch({ type: "request:create", request });
      return request;
    },
    [actorName],
  );

  const value: Ctx = {
    ...state,
    dispatch,
    actorName,
    setRole: (r) => dispatch({ type: "role", role: r }),
    setStore: (s) => dispatch({ type: "store", storeId: s }),
    go: (m, focus) => dispatch({ type: "module", module: m, focus: focus ?? null }),
    toastNow: (m, tone) => dispatch({ type: "toast", message: m, tone }),
    createIst,
    setFilter: (patch) => dispatch({ type: "estate:filter", patch }),
    setPeriod: (p) => dispatch({ type: "estate:period", period: p }),
    openStore: (storeId) => dispatch({ type: "estate:open", storeId }),
    normFor: (storeId) => state.norms[storeId] ?? storeById(storeId).norm,
    raiseRequest,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export { classifyCancellation, splitOutward };
