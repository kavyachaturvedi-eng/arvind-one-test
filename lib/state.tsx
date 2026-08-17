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
  NOW,
  SEED_OMNI,
  SEED_OUTWARD,
  SEED_TICKETS,
  STORES,
  styleById,
} from "./seed";
import { classifyCancellation, evaluateIstPolicy, splitOutward, type IstPolicyInput } from "./rules";
import type {
  AuditEntry,
  CashException,
  ISTRequest,
  ISTStatus,
  OmniOrder,
  OutwardBatch,
  RoleId,
  Size,
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
;

interface AppState {
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
  cash: CashException[];
  audit: AuditEntry[];
  toast: { id: number; message: string; tone: "good" | "warn" | "info" } | null;
  clockOffsetMinutes: number;
}

type Action =
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
  | { type: "cash:update"; id: string; patch: Partial<CashException> }
  | { type: "audit"; entry: AuditEntry }
  | { type: "toast"; message: string; tone?: "good" | "warn" | "info" }
  | { type: "toast:clear" }
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

const initial: AppState = {
  role: "store",
  storeId: STORES[0].id,
  module: "home",
  focus: null,
  ist: [],
  tickets: SEED_TICKETS,
  omni: SEED_OMNI,
  outward: SEED_OUTWARD,
  tasks: initialTasks(),
  cash: CASH_EXCEPTIONS,
  audit: [
    { at: NOW - 64 * 60_000, actor: "SAP", action: "Price change published", object: "11 styles", system: "SAP" },
    { at: NOW - 63 * 60_000, actor: "Arvind One", action: "Created reprint job TK-8803", object: "41 units", system: "Arvind One" },
    { at: NOW - 22 * 60_000, actor: "Arvind One", action: "Raised size-set exception", object: "TH-POL-4000 · size L", system: "Arvind One" },
  ],
  toast: null,
  clockOffsetMinutes: 0,
};

let toastSeq = 1;

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "role": {
      // Leadership and planners are not scoped to a single store.
      return { ...state, role: action.role, module: defaultModule(action.role) };
    }
    case "store":
      return { ...state, storeId: action.storeId };
    case "module":
      return { ...state, module: action.module, focus: action.focus ?? null };

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

    case "cash:update":
      return { ...state, cash: state.cash.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };

    case "audit":
      return { ...state, audit: [action.entry, ...state.audit] };

    case "toast":
      return { ...state, toast: { id: toastSeq++, message: action.message, tone: action.tone ?? "good" } };

    case "toast:clear":
      return { ...state, toast: null };

    case "reset":
      return { ...initial, role: state.role, module: state.module, storeId: state.storeId };

    default:
      return state;
  }
}

function defaultModule(role: RoleId): ModuleId {
  // Staff lands on the till; the manager on insights; planning on the live
  // control tower; the CEO on the executive summary.
  return role === "staff" ? "pos" : role === "store" ? "home" : role === "planner" ? "live" : "exec";
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
    switch (state.role) {
      case "store":
        return "Rohit Sharma";
      case "staff":
        return "Sana Qureshi";
      case "planner":
        return "Praveen Kumar";
      case "leadership":
        return "Satyen";
    }
  }, [state.role]);

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

  const value: Ctx = {
    ...state,
    dispatch,
    actorName,
    setRole: (r) => dispatch({ type: "role", role: r }),
    setStore: (s) => dispatch({ type: "store", storeId: s }),
    go: (m, focus) => dispatch({ type: "module", module: m, focus: focus ?? null }),
    toastNow: (m, tone) => dispatch({ type: "toast", message: m, tone }),
    createIst,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export { classifyCancellation, splitOutward };
