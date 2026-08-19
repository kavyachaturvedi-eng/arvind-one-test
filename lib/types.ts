// ─────────────────────────────────────────────────────────────────────────────
// Arvind One — canonical domain model
//
// First principle: there is exactly ONE definition of every entity and every
// metric. Source systems (SAP, D365, Vector, Capillary, Omuni, Power BI) are
// mapped INTO this model at ingest; nothing downstream ever reads a source
// system directly. That is what makes "everyone sees the same number" true by
// construction rather than by discipline.
// ─────────────────────────────────────────────────────────────────────────────

// Three users, exactly as Pushpal specified: the store executes, the hierarchy
// observes. Store Manager is the operator of the consolidated execution app;
// Retail Planning and the CEO watch that execution and act on what it surfaces.
export type RoleId = "store" | "staff" | "planner" | "leadership";

/** A training module pushed by Planning to every store's Tasks & Chores. */
export interface TrainingItem {
  id: string;
  title: string;
  audience: string;
  mins: number;
  dueDays: number;
  createdBy: string;
}

export type RoleMode = "execute" | "observe";

export interface Role {
  id: RoleId;
  label: string;
  person: string;
  title: string;
  scope: string;
  initials: string;
  /** execute = does the work in the app; observe = watches it happen. */
  mode: RoleMode;
  /** One line on what this level does with the single shared dataset. */
  does: string;
  /** Real person this persona is modelled on, from discovery. */
  basedOn: string;
}

/** A single execution event — the atom of "the hierarchy sees what is happening". */
export interface ExecutionEvent {
  id: string;
  at: number;
  storeId: string;
  actor: string;
  /** Which consolidated tool produced it — the thing that used to be a separate app. */
  channel:
    | "briefing"
    | "floor_walk"
    | "scan"
    | "transfer"
    | "omni"
    | "outward"
    | "ticket"
    | "cash"
    | "replenishment";
  label: string;
  severity: "info" | "good" | "warn" | "critical";
}

export type SourceSystem =
  | "SAP"
  | "SAP Finance"
  | "POS"
  | "Inventory ledger"
  | "Replenishment engine"
  | "Loyalty"
  | "Omni"
  | "Commercial"
  | "D365"
  | "D365 POS"
  | "Vector"
  | "Power BI"
  | "Capillary"
  | "Omuni"
  | "Eships"
  | "Excel"
  | "Email"
  | "Paper register"
  | "Scanner"
  | "Arvi"
  | "Ask One"
  | "Arvind One";

export type Brand = "Tommy Hilfiger" | "Calvin Klein" | "U.S. Polo Assn." | "Arrow" | "Flying Machine";

export type Region = "North" | "South" | "East" | "West";

export type StoreFormat = "Mall" | "High Street" | "Outlet" | "Airport";

export type StoreModel = "COCO" | "COFO" | "FOCO" | "FOCL" | "FOFO";

export interface Store {
  id: string;          // e.g. "TH-MUM-001"
  code: string;        // short display code
  name: string;
  brand: Brand;
  city: string;
  region: Region;
  format: StoreFormat;
  model: StoreModel;
  grade: "A" | "B" | "C";
  /** Planned inventory norm in units (NOT display capacity — norms follow ROS). */
  norm: number;
  /** Monthly sales target, INR. */
  targetMonth: number;
  /** Crude lat/long-ish coords used for transfer-radius maths (arbitrary units). */
  x: number;
  y: number;
  managerName: string;
  headcount: number;
  pincode: string;
}

export type Category =
  | "Polo"
  | "Shirts"
  | "T-Shirts"
  | "Denim"
  | "Trousers"
  | "Outerwear"
  | "Knitwear"
  | "Accessories";

export type SeasonStage = "Early" | "Mid" | "Late" | "EOSS";

export interface Style {
  id: string;          // e.g. "TH-PLO-4417"
  name: string;
  brand: Brand;
  category: Category;
  /** Story / capsule the style was bought into. */
  story: string;
  mrp: number;
  colour: string;
  colourHex: string;
  /** Core (pivotal) sizes for this style — a set is "broken" when these are gone. */
  coreSizes: Size[];
  sizes: Size[];
  /** Units bought for the season across the estate. */
  bought: number;
  isNOS: boolean;      // never-out-of-stock / core carry-forward
  launchedDaysAgo: number;
}

export type Size = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "28" | "30" | "32" | "34" | "36" | "38";

/** Stock position for one style × size × store — the atom of the inventory truth. */
export interface StockRow {
  storeId: string;
  styleId: string;
  size: Size;
  onHand: number;
  inTransit: number;
  reserved: number;     // omni-allocated, not sellable on floor
  /** Days in the last 28 the SKU was actually available (drives True ROS). */
  inStockDays: number;
  /** Units sold in the last 28 days. */
  sold28: number;
  /** Units sold while on markdown in the last 28 days. */
  soldOnMarkdown28: number;
}

export type MetricFreshness = "live" | "hourly" | "daily";

export interface MetricDef {
  id: string;
  label: string;
  /** Plain-English definition — the contract every role is held to. */
  definition: string;
  formula: string;
  unit: "INR" | "%" | "units" | "days" | "ratio" | "count";
  grain: string;
  owner: string;
  sources: SourceSystem[];
  freshness: MetricFreshness;
  /** Minutes since last successful refresh. */
  ageMinutes: number;
  /** Number of legacy definitions this metric replaced. */
  replaces: number;
  verified: boolean;
  version: string;
}

// ── Workflow objects ─────────────────────────────────────────────────────────

export type ISTStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "picking"
  | "in_transit"
  | "received"
  | "rejected"
  | "cancelled"
  | "expired";

export interface ISTRequest {
  id: string;
  createdAt: number;       // ms epoch
  raisedBy: string;
  reason: "customer_waiting" | "size_set_repair" | "strategic_rebalance" | "omni_fulfilment";
  styleId: string;
  size: Size;
  qty: number;
  fromStoreId: string;     // donor
  toStoreId: string;       // requester
  status: ISTStatus;
  /** Policy decision trail — why it auto-approved or why a human is needed. */
  policyTrail: PolicyCheck[];
  approvedBy?: string;
  rejectionReason?: string;
  customerName?: string;
  customerPhone?: string;
  slaHours: number;
  events: WorkflowEvent[];
  /** Legacy comparison: what this would have taken in the old email→Vector flow. */
  legacyHours: number;
}

export interface PolicyCheck {
  rule: string;
  passed: boolean;
  detail: string;
  /** blocking = cannot proceed; gate = needs human approval; info = advisory. */
  severity: "blocking" | "gate" | "info";
}

export interface WorkflowEvent {
  at: number;
  actor: string;
  label: string;
  system: SourceSystem;
}

export type TicketKind = "maintenance" | "tag_reprint" | "it" | "vm" | "safety";
export type TicketStatus = "open" | "auto_dispatched" | "awaiting_approval" | "in_progress" | "resolved" | "breached";

export interface Ticket {
  id: string;
  kind: TicketKind;
  storeId: string;
  title: string;
  assetId?: string;
  assetName?: string;
  raisedBy: string;
  raisedAt: number;
  status: TicketStatus;
  /** SLA in hours for this ticket class. */
  slaHours: number;
  /** Escalation ladder position: 0 = SM, 1 = AM, 2 = RM, 3 = HO. */
  escalationLevel: number;
  vendor?: string;
  quoteValue?: number;
  approvalThreshold: number;
  photoProof: boolean;
  events: WorkflowEvent[];
  legacyDays: number;
  styleId?: string;
  qty?: number;
}

export type OmniStatus =
  | "new"
  | "locating"
  | "packed"
  | "handed_over"
  | "delivered"
  | "cancelled"
  | "reassigned"
  | "return_pending"
  | "reconciled";

export interface OmniOrder {
  id: string;
  channel: "Tommy.com" | "Myntra" | "Amazon" | "Flipkart" | "AJIO";
  storeId: string;
  styleId: string;
  size: Size;
  qty: number;
  value: number;
  placedAt: number;
  status: OmniStatus;
  /** Minutes the associate has been hunting for the unit. */
  findMinutes: number;
  /** Root cause when cancelled — the thing nobody records today. */
  rootCause?: CancellationCause;
  podSignedBy?: string;
  podAt?: number;
  reassignedTo?: string;
  events: WorkflowEvent[];
}

export type CancellationCause =
  | "phantom_stock"
  | "unfindable"
  | "damaged"
  | "customer_cancelled"
  | "sla_breach"
  | "reserved_conflict";

export type OutwardKind = "RTV" | "EOSS pullback" | "Outlet transfer" | "Defective";

export interface OutwardBatch {
  id: string;
  storeId: string;
  kind: OutwardKind;
  totalUnits: number;
  createdAt: number;
  status: "draft" | "picking" | "packed" | "invoiced" | "dispatched" | "closed";
  /** Auto-split legacy transfer codes, 300 units each. */
  codes: OutwardCode[];
  videoProof: boolean;
  lrNumber?: string;
  events: WorkflowEvent[];
  legacyDaysMin: number;
  legacyDaysMax: number;
}

export interface OutwardCode {
  code: string;
  units: number;
  cartons: number;
  weightKg: number;
  packed: boolean;
}

export interface Task {
  id: string;
  storeId: string;
  title: string;
  detail: string;
  /** Which module generated it — nothing in Arvind One is hand-typed busywork. */
  origin:
    | "size_set"
    | "replenishment"
    | "ist"
    | "omni"
    | "vm"
    | "floor_walk"
    | "ticket"
    | "cash"
    | "briefing"
    | "price_change";
  assignedTo: string;
  dueAt: number;
  priority: 1 | 2 | 3;
  status: "todo" | "doing" | "done" | "blocked";
  requiresPhoto: boolean;
  photoAttached: boolean;
  valueAtRisk?: number;
  slaHours: number;
}

export interface CashException {
  id: string;
  storeId: string;
  date: string;
  tender: "Cash" | "Card" | "UPI" | "Gift Voucher";
  posAmount: number;
  bankAmount: number;
  delta: number;
  /** Arvind One's automatic explanation, replacing the manual justification note. */
  autoExplanation: string;
  confidence: number;
  status: "auto_cleared" | "needs_review" | "escalated";
}

export interface StaffKpi {
  name: string;
  storeId: string;
  sales: number;
  bills: number;
  qty: number;
  role: "SM" | "ASM" | "Sr.FA" | "FA";
}

export interface AuditEntry {
  at: number;
  actor: string;
  action: string;
  object: string;
  system: SourceSystem;
}

export interface Notification {
  id: string;
  at: number;
  title: string;
  body: string;
  severity: "info" | "warn" | "critical";
  role: RoleId | "all";
}
