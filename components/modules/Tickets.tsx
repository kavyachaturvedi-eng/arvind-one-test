"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tickets — maintenance, price-tag reprints, IT and VM on one SLA clock, with an
// escalation ladder and threshold-based approvals.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { DAY, HOUR, NOW, rng, storeById } from "@/lib/seed";
import { slaState, ticketSlaHours } from "@/lib/rules";
import { useApp } from "@/lib/state";
import {
  BeforeAfter, Callout, Card, Chip, Empty, Modal, SectionTitle, SlaBar, Stat, StatusDot,
  Table, Td, Th, Timeline, fmtDateTime, inr, relTime,
} from "@/components/ui";
import type { Ticket, TicketKind } from "@/lib/types";

const LADDER = ["Store Manager", "Area Manager", "Regional Manager", "Head Office"];
const STORE_APPROVAL_LIMIT = 25_000;
/** Within 25% of the SLA counts as an exception — that is the whole point of the view. */
const EXCEPTION_BAND = 0.75;

const KIND_LABEL: Record<TicketKind, string> = {
  maintenance: "Maintenance",
  tag_reprint: "Tag reprint",
  it: "IT",
  vm: "VM",
  safety: "Safety",
};
const KIND_TONE: Record<TicketKind, "neutral" | "good" | "warn" | "serious" | "critical" | "brand"> = {
  maintenance: "neutral",
  tag_reprint: "brand",
  it: "warn",
  vm: "serious",
  safety: "critical",
};
const STATUS_LABEL: Record<Ticket["status"], string> = {
  open: "Open",
  auto_dispatched: "Auto-dispatched",
  awaiting_approval: "Awaiting approval",
  in_progress: "In progress",
  resolved: "Resolved",
  breached: "Breached",
};

/** Vendor mapping by ticket kind. */
const VENDOR_BY_KIND: Record<TicketKind, string> = {
  maintenance: "Brightline Electricals — West",
  it: "Netcomm Managed Services",
  vm: "In-house VM pool",
  safety: "SafeGuard Fire Services",
  tag_reprint: "In-store printer",
};

interface StoreAsset { id: string; name: string; kind: TicketKind }
const ASSETS: StoreAsset[] = [
  { id: "AST-LGT-11", name: "Window track lighting", kind: "maintenance" },
  { id: "AST-HVAC-02", name: "AC unit 2", kind: "maintenance" },
  { id: "AST-POS-01", name: "POS terminal 1", kind: "it" },
  { id: "AST-POS-02", name: "POS terminal 2", kind: "it" },
  { id: "AST-LIFT-01", name: "Customer lift", kind: "maintenance" },
  { id: "AST-TRM-03", name: "Trial room mirror", kind: "maintenance" },
  { id: "AST-FIRE-A", name: "Fire extinguisher A", kind: "safety" },
];

const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** Deterministic ticket count in the last 12 months for an asset. */
const assetHistory = (id: string) => 1 + Math.floor(rng(hash(id))() * 4);
const estimateFor = (id: string, kind: TicketKind, n: number) =>
  Math.round((900 + rng(hash(id + kind) + n)() * 41_000) / 100) * 100;

const isLive = (t: Ticket) => t.status !== "resolved";

export default function Tickets() {
  const app = useApp();
  const scopedToOneStore = app.role === "store";
  const canApprove = app.role !== "store";

  const [exceptionsOnly, setExceptionsOnly] = useState(!scopedToOneStore);
  const [openId, setOpenId] = useState<string | null>(null);
  const [photoOn, setPhotoOn] = useState<Record<string, boolean>>({});

  // Raise-a-ticket flow
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [asset, setAsset] = useState<StoreAsset | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TicketKind>("maintenance");
  const [photo, setPhoto] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const scoped = useMemo(
    () => (scopedToOneStore ? app.tickets.filter((t) => t.storeId === app.storeId) : app.tickets),
    [app.tickets, app.storeId, scopedToOneStore]
  );

  const rows = useMemo(() => {
    const withSla = scoped.map((t) => ({ t, s: slaState(t.raisedAt, t.slaHours, NOW) }));
    const filtered = exceptionsOnly ? withSla.filter((r) => isLive(r.t) && r.s.pctConsumed >= EXCEPTION_BAND) : withSla;
    return filtered.sort((a, b) => Number(b.s.breached) - Number(a.s.breached) || b.s.pctConsumed - a.s.pctConsumed);
  }, [scoped, exceptionsOnly]);

  const live = scoped.filter(isLive);
  const breached = live.filter((t) => slaState(t.raisedAt, t.slaHours, NOW).breached).length;
  const awaiting = live.filter((t) => t.status === "awaiting_approval");
  const approvalValue = awaiting.reduce((a, t) => a + (t.quoteValue ?? 0), 0);
  const avgAgeDays = live.length ? live.reduce((a, t) => a + (NOW - t.raisedAt) / DAY, 0) / live.length : 0;
  const legacyAvgDays = live.length ? live.reduce((a, t) => a + t.legacyDays, 0) / live.length : 0;
  const hiddenCount = exceptionsOnly ? live.length - rows.filter((r) => isLive(r.t)).length : 0;

  const sel = openId ? app.tickets.find((t) => t.id === openId) ?? null : null;

  // ── Actions ────────────────────────────────────────────────────────────────
  function approve(t: Ticket) {
    app.dispatch({
      type: "ticket:update", id: t.id, actor: app.actorName,
      patch: { status: "in_progress" },
      label: `Quote of ${inr(t.quoteValue ?? 0)} approved by ${app.actorName} — PO raised automatically, vendor scheduled`,
    });
    app.toastNow(`${t.id} approved — ${inr(t.quoteValue ?? 0)} released to ${t.vendor ?? "the mapped vendor"}, PO raised.`, "good");
  }
  function secondQuote(t: Ticket) {
    app.dispatch({
      type: "ticket:update", id: t.id, actor: app.actorName,
      patch: {}, label: "Second quote requested from an alternate mapped vendor — 24h to respond",
    });
    app.toastNow(`Second quote requested on ${t.id}. Both quotes will sit side by side on this ticket.`, "info");
  }
  function resolve(t: Ticket, note: string) {
    app.dispatch({
      type: "ticket:update", id: t.id, actor: app.actorName,
      patch: { status: "resolved", photoProof: true }, label: note,
    });
    app.toastNow(`${t.id} closed with photo proof after ${Math.round((NOW - t.raisedAt) / HOUR)}h.`, "good");
    setOpenId(null);
  }
  function escalate(t: Ticket) {
    const next = Math.min(3, t.escalationLevel + 1);
    app.dispatch({
      type: "ticket:update", id: t.id, actor: app.actorName,
      patch: { escalationLevel: next }, label: `Escalated to ${LADDER[next]} by ${app.actorName}`,
    });
    app.toastNow(`${t.id} escalated to ${LADDER[next]} — it is on their board now.`, "warn");
  }

  function submitTicket() {
    if (!asset) return;
    if (title.trim() === "") { setErr("A one-line description is required — the vendor cannot be dispatched against a blank title."); return; }
    const sla = ticketSlaHours(kind);
    const estimate = estimateFor(asset.id, kind, app.tickets.length);
    const auto = estimate <= STORE_APPROVAL_LIMIT;
    const vendor = VENDOR_BY_KIND[kind];
    const id = `TK-${8806 + app.tickets.length}`;
    const ticket: Ticket = {
      id, kind, storeId: app.storeId, title: title.trim(),
      assetId: asset.id, assetName: asset.name,
      raisedBy: app.actorName, raisedAt: NOW,
      status: auto ? "auto_dispatched" : "awaiting_approval",
      slaHours: sla, escalationLevel: 0,
      vendor, quoteValue: estimate, approvalThreshold: STORE_APPROVAL_LIMIT,
      photoProof: photo, legacyDays: kind === "tag_reprint" ? 32 : kind === "it" ? 5 : 14,
      events: [
        { at: NOW, actor: app.actorName, label: `Raised by QR scan on ${asset.name}${photo ? "; photo attached" : ""}`, system: "Arvind One" },
        {
          at: NOW + 60_000, actor: "Arvind One",
          label: auto
            ? `Auto-dispatched to ${vendor} — rate-card estimate ${inr(estimate)} is below the ${inr(STORE_APPROVAL_LIMIT)} store threshold`
            : `Rate-card estimate ${inr(estimate)} is above the ${inr(STORE_APPROVAL_LIMIT)} store threshold — routed to Area Manager`,
          system: "Arvind One",
        },
      ],
    };
    app.dispatch({ type: "ticket:create", ticket });
    app.toastNow(
      auto
        ? `${id} raised and auto-dispatched to ${vendor}. SLA ${sla}h.`
        : `${id} raised. ${inr(estimate)} is above the store limit, so it is with the Area Manager. SLA ${sla}h.`,
      "good"
    );
    setRaiseOpen(false); setAsset(null); setTitle(""); setErr(null); setExceptionsOnly(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Tickets</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            Maintenance, price-tag reprints, IT and VM requests on one SLA clock.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={() => { setRaiseOpen(true); setErr(null); }}>Raise a ticket</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Open tickets" value={String(live.length)} sub={`${scopedToOneStore ? storeById(app.storeId).name : "All 15 stores"} · live`} />
        <Stat label="Breached SLA" value={String(breached)} tone={breached ? "critical" : "good"} sub={breached ? "Up the ladder" : "Nothing overdue"} />
        <Stat label="Waiting on approval" value={String(awaiting.length)} tone={awaiting.length ? "warn" : undefined} sub="Above the store threshold" />
        <Stat label="Average age" value={`${avgAgeDays.toFixed(1)} d`} tone="good" sub="Across live tickets" />
        <Stat label="Approvals pending" value={inr(approvalValue, { compact: true })} sub="Value awaiting approval" />
      </div>

      <Card>
        <SectionTitle
          title={exceptionsOnly ? "Showing exceptions only" : "All tickets in scope"}
          sub={
            exceptionsOnly
              ? "Breached, or within 25% of their SLA. This is the field-manager view: the board only shows what needs a decision, not everything that exists."
              : "Every live and closed ticket in scope, breached first."
          }
          right={
            <div className="flex items-center gap-2">
              {exceptionsOnly && hiddenCount > 0 && <span className="text-2xs text-muted">{hiddenCount} healthy hidden</span>}
              <button className="btn" onClick={() => setExceptionsOnly((v) => !v)}>
                {exceptionsOnly ? "Show everything" : "Show exceptions only"}
              </button>
            </div>
          }
        />
        {rows.length === 0 ? (
          <Empty title="Nothing is breaching" body="Every ticket in scope is inside 75% of its SLA. Switch to 'Show everything' to see the full board." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ticket</Th><Th>Store</Th><Th>Raised</Th><Th>SLA</Th><Th>Escalation</Th><Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, s }) => (
                <tr key={t.id} className="hover:bg-[color:var(--plane)] cursor-pointer" onClick={() => setOpenId(t.id)}>
                  <Td>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip tone={KIND_TONE[t.kind]}>{KIND_LABEL[t.kind]}</Chip>
                      <span className="text-sm text-ink font-medium">{t.title}</span>
                    </div>
                    <div className="text-2xs text-muted mt-0.5">
                      {t.id}{t.assetName ? ` · ${t.assetName} (${t.assetId})` : ""}
                    </div>
                  </Td>
                  <Td><span className="text-xs text-ink2">{storeById(t.storeId).name}</span></Td>
                  <Td>
                    <div className="text-xs text-ink2">{t.raisedBy}</div>
                    <div className="text-2xs text-muted num">{relTime(t.raisedAt, NOW)}</div>
                  </Td>
                  <Td className="min-w-[130px]"><SlaBar pctConsumed={s.pctConsumed} label={`${s.remainingLabel} · ${t.slaHours}h SLA`} /></Td>
                  <Td><Ladder level={t.escalationLevel} /></Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                      <StatusDot tone={s.breached ? "critical" : t.status === "resolved" ? "good" : t.status === "awaiting_approval" ? "warn" : "neutral"} />
                      {STATUS_LABEL[t.status]}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {sel && <TicketModal
        t={sel} onClose={() => setOpenId(null)} canApprove={canApprove}
        photoReady={!!photoOn[sel.id]} onPhoto={() => { setPhotoOn((p) => ({ ...p, [sel.id]: true })); app.toastNow(`Completion photo attached to ${sel.id}.`, "info"); }}
        onApprove={approve} onSecondQuote={secondQuote} onResolve={resolve} onEscalate={escalate}
      />}

      <Modal
        open={raiseOpen} onClose={() => { setRaiseOpen(false); setAsset(null); }}
        title={asset ? `Raise a ticket — ${asset.name}` : "Scan an asset"}
        sub={asset ? `${asset.id} · ${storeById(app.storeId).name}` : "In the store this is a QR sticker on the asset. Here, pick from the tagged assets at this store."}
        footer={
          asset ? (
            <>
              <button className="btn" onClick={() => setAsset(null)}>Back to assets</button>
              <button className="btn-primary" onClick={submitTicket}>Raise ticket</button>
            </>
          ) : <button className="btn" onClick={() => setRaiseOpen(false)}>Cancel</button>
        }
      >
        {!asset ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {ASSETS.map((a) => (
              <button key={a.id} className="card p-3 text-left hover:shadow-pop transition-shadow"
                onClick={() => { setAsset(a); setKind(a.kind); setErr(null); }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{a.name}</span>
                  <Chip tone={KIND_TONE[a.kind]}>{KIND_LABEL[a.kind]}</Chip>
                </div>
                <div className="text-2xs text-muted mt-1 num">{a.id} · {assetHistory(a.id)} tickets in the last 12 months</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <Callout tone="brand" title="Pre-filled from the asset tag">
              {asset.name} ({asset.id}) at {storeById(app.storeId).name}. <strong className="text-ink">{assetHistory(asset.id)} tickets
              in the last 12 months on this asset.</strong> Raised by {app.actorName}. The vendor, the SLA and the approval
              limit are all derived — none of it is typed.
            </Callout>
            <label className="block">
              <div className="label mb-1">What is wrong</div>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }}
                className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
                placeholder="e.g. Lift stalls between floors and doors do not re-open" />
            </label>
            {err && <Callout tone="critical" title="Cannot raise this yet">{err}</Callout>}
            <label className="block">
              <div className="label mb-1">Ticket class</div>
              <select value={kind} onChange={(e) => setKind(e.target.value as TicketKind)}
                className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink">
                {(Object.keys(KIND_LABEL) as TicketKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]} — {ticketSlaHours(k)}h SLA</option>
                ))}
              </select>
              <div className="text-2xs text-muted mt-1">
                Routes to {VENDOR_BY_KIND[kind]}. Rate-card estimate {inr(estimateFor(asset.id, kind, app.tickets.length))} —{" "}
                {estimateFor(asset.id, kind, app.tickets.length) <= STORE_APPROVAL_LIMIT
                  ? `below the ${inr(STORE_APPROVAL_LIMIT)} store threshold, so it auto-dispatches.`
                  : `above the ${inr(STORE_APPROVAL_LIMIT)} store threshold, so it goes straight to the Area Manager.`}
              </div>
            </label>
            <label className="flex items-start gap-2.5 rounded-lg border border-line p-3 cursor-pointer">
              <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-ink2 leading-relaxed">
                <strong className="text-ink">Photo attached</strong> — the vendor quotes off the photo instead of a site
                visit, which is the step that costs a week.
              </span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Escalation ladder ────────────────────────────────────────────────────────

function Ladder({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-1" title={`Currently with ${LADDER[Math.min(3, level)]}`}>
      {LADDER.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          <span
            className="text-2xs px-1.5 py-0.5 rounded font-semibold"
            style={{
              background: i === level ? "var(--brand-soft)" : "var(--plane)",
              color: i === level ? "var(--brand)" : i < level ? "var(--text-muted)" : "var(--baseline)",
              border: i === level ? "1px solid var(--brand)" : "1px solid transparent",
            }}
          >
            {l.split(" ").map((w) => w[0]).join("")}
          </span>
          {i < LADDER.length - 1 && <span className="text-[8px] text-muted">→</span>}
        </span>
      ))}
      <span className="text-2xs text-ink2 ml-1">{LADDER[Math.min(3, level)]}</span>
    </div>
  );
}

// ── Detail modal ─────────────────────────────────────────────────────────────

function TicketModal({
  t, onClose, canApprove, photoReady, onPhoto, onApprove, onSecondQuote, onResolve, onEscalate,
}: {
  t: Ticket; onClose: () => void; canApprove: boolean; photoReady: boolean; onPhoto: () => void;
  onApprove: (t: Ticket) => void; onSecondQuote: (t: Ticket) => void;
  onResolve: (t: Ticket, note: string) => void; onEscalate: (t: Ticket) => void;
}) {
  const s = slaState(t.raisedAt, t.slaHours, NOW);
  const needsApproval = t.status === "awaiting_approval" && (t.quoteValue ?? 0) > t.approvalThreshold;
  const workable = t.status === "open" || t.status === "in_progress";

  return (
    <Modal
      open onClose={onClose} wide
      title={t.title}
      sub={`${t.id} · ${KIND_LABEL[t.kind]} · ${storeById(t.storeId).name} · raised ${fmtDateTime(t.raisedAt)} by ${t.raisedBy}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Close</button>
          {needsApproval && (
            <>
              <button className="btn" onClick={() => onSecondQuote(t)}>Request a second quote</button>
              <button className="btn-primary" disabled={!canApprove} onClick={() => onApprove(t)}>
                Approve {inr(t.quoteValue ?? 0)}
              </button>
            </>
          )}
          {workable && (
            <>
              <button className="btn" onClick={() => onEscalate(t)}>Escalate now</button>
              {!photoReady
                ? <button className="btn" onClick={onPhoto}>Attach completion photo</button>
                : <button className="btn-primary" onClick={() => onResolve(t, "Resolved and closed with photo proof of the completed work")}>Mark resolved</button>}
            </>
          )}
          {t.status === "auto_dispatched" && (
            <button className="btn-primary" onClick={() => onResolve(t, "Tags printed and applied; bay photo captured")}>Print and apply</button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {s.breached && (
          <Callout tone="critical" title={`Breached — now with ${LADDER[Math.min(3, Math.max(t.escalationLevel, s.level))]}`}>
            {s.remainingLabel} past a {t.slaHours}h service level. It moved up the ladder on its own at 100% and again at
            140% of the SLA — no one had to notice and forward an email.
          </Callout>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-3">
            <div className="label mb-1.5">Asset & vendor</div>
            <dl className="text-xs text-ink2 space-y-1">
              {([
                ["Asset", t.assetName ?? "Not asset-linked"],
                ["Asset ID", t.assetId ?? "—"],
                ["Vendor", t.vendor ?? "Unassigned"],
                ["Quote", t.quoteValue ? inr(t.quoteValue) : "No quote yet"],
                ["Store limit", inr(t.approvalThreshold)],
                ["Photo proof", t.photoProof || photoReady ? "Attached" : "Not attached"],
              ] as [string, string][]).map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3"><dt>{k}</dt><dd className="text-ink num">{val}</dd></div>
              ))}
            </dl>
          </div>
          <div className="rounded-lg border border-line p-3">
            <div className="label mb-1.5">Clock</div>
            <SlaBar pctConsumed={s.pctConsumed} label={`${s.remainingLabel} of a ${t.slaHours}h SLA · ${s.elapsedHours.toFixed(0)}h elapsed`} />
            <div className="mt-2.5"><Ladder level={Math.max(t.escalationLevel, s.level)} /></div>
          </div>
        </div>

        {t.status === "auto_dispatched" && t.kind === "tag_reprint" && (
          <Callout tone="brand" title="Created automatically from a price change">
            <ol className="space-y-1 mt-0.5">
              <li>1. SAP published a price change for 11 styles at 10:38.</li>
              <li>2. {t.qty ?? 41} affected units identified in this store.</li>
              <li>3. Tags queued to the in-store printer.</li>
              <li>4. Task assigned with a 24h SLA and a photo close-out.</li>
            </ol>
          </Callout>
        )}

        {needsApproval && !canApprove && (
          <Callout tone="warn" title="Approval needed above your threshold">
            The quote of {inr(t.quoteValue ?? 0)} is above this store&apos;s {inr(t.approvalThreshold)} threshold, so it has
            gone to Retail Planning for approval.
          </Callout>
        )}

        {workable && !photoReady && (
          <Callout tone="warn" title="Photo required to close">
            Close-out is photo-verified. Attach the completion photo first — that is what stops a ticket being marked done
            from an inbox without the work being done.
          </Callout>
        )}

        <div className="rounded-lg border border-line p-3">
          <div className="label mb-2">Everything that happened, in one place</div>
          <Timeline events={t.events} />
        </div>
      </div>
    </Modal>
  );
}
