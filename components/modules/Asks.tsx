"use client";

// Store asks — the queue, not a named planner's desk.
//
// Deliberately a small screen. The store proposes and planning decides, but the
// run and the allocation re-cut are where planning does most of its work; this
// is the exception path, and the evidence shown is what the store saw when it
// raised the ask, not what the numbers say now.

import React, { useState } from "react";
import { Card, Chip, Modal, SectionTitle, Stat, StatusDot, Table, Tabs, Td, Th, relTime } from "@/components/ui";
import { NOW, storeById, styleById } from "@/lib/seed";
import { REQUEST_LABEL, useApp } from "@/lib/state";
import { inr, pct } from "@/lib/rules";
import type { PlanningRequest } from "@/lib/types";

type Filter = "open" | "decided";

export default function Asks() {
  const app = useApp();
  const [filter, setFilter] = useState<Filter>("open");
  const [deciding, setDeciding] = useState<PlanningRequest | null>(null);

  const open = app.requests.filter((r) => r.status === "open");
  const decided = app.requests.filter((r) => r.status !== "open");
  const shown = filter === "open" ? open : decided;

  const oldest = open.reduce((a, r) => Math.min(a, r.raisedAt), NOW);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Store asks</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Waiting" value={String(open.length)} tone={open.length > 0 ? "warn" : "good"} emphasis />
        <Stat label="Oldest" value={open.length ? relTime(oldest, NOW) : "—"} />
        <Stat label="Units requested" value={open.reduce((a, r) => a + (r.units ?? 0), 0).toLocaleString("en-IN")} />
        <Stat label="Decided" value={String(decided.length)} />
      </div>

      <Card>
        <SectionTitle
          title="The queue"
          right={
            <Tabs
              value={filter}
              onChange={setFilter}
              options={[
                { id: "open", label: "Waiting", count: open.length },
                { id: "decided", label: "Decided", count: decided.length },
              ]}
            />
          }
        />
        {shown.length === 0 ? (
          <div className="text-sm text-ink2">Nothing here.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ask</Th>
                <Th>Store</Th>
                <Th>Style</Th>
                <Th align="right">Units</Th>
                <Th>Evidence when raised</Th>
                <Th>Raised</Th>
                <Th align="right">Decide</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} data-ask={r.kind}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <StatusDot tone={r.evidence.sizeSetStatus === "broken" ? "critical" : r.status === "approved" ? "good" : r.status === "rejected" ? "neutral" : "warn"} />
                      <span className="text-ink">{REQUEST_LABEL[r.kind]}</span>
                    </div>
                  </Td>
                  <Td>{storeById(r.storeId).name}</Td>
                  <Td>
                    {r.styleId ? styleById(r.styleId).name : "—"}
                    {r.size ? <span className="text-2xs text-muted ml-1.5">{r.size}</span> : null}
                  </Td>
                  <Td align="right" className="num">{r.units ?? "—"}</Td>
                  <Td>
                    <span className="text-xs text-ink2">
                      {pct(r.evidence.fillRate)} of norm
                      {r.evidence.valueAtRisk > 0 ? ` · ${inr(r.evidence.valueAtRisk, { compact: true })} at risk` : ""}
                      {r.evidence.sizeSetStatus !== "healthy" ? ` · size set ${r.evidence.sizeSetStatus === "broken" ? "broken" : "at risk"}` : ""}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-ink2">{r.raisedBy}</span>
                    <span className="text-2xs text-muted ml-1.5">{relTime(r.raisedAt, NOW)}</span>
                  </Td>
                  <Td align="right">
                    {r.status === "open" ? (
                      <button className="btn !py-1 !text-2xs" data-ask-open onClick={() => setDeciding(r)}>
                        Open
                      </button>
                    ) : (
                      <Chip tone={r.status === "approved" ? "good" : "neutral"}>{r.status === "approved" ? "Approved" : "Rejected"}</Chip>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <DecideModal request={deciding} onClose={() => setDeciding(null)} />
    </div>
  );
}

function DecideModal({ request, onClose }: { request: PlanningRequest | null; onClose: () => void }) {
  const app = useApp();
  const [note, setNote] = useState("");

  if (!request) return null;
  const req = request;
  const store = storeById(req.storeId);

  function decide(status: "approved" | "rejected") {
    app.dispatch({ type: "request:decide", id: req.id, status, by: app.actorName, note: note || undefined });
    app.toastNow(`${REQUEST_LABEL[req.kind]} ${status} · ${store.name}`, status === "approved" ? "good" : "warn");
    setNote("");
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${REQUEST_LABEL[request.kind]} · ${store.name}`}
      sub={`${request.raisedBy} · ${relTime(request.raisedAt, NOW)} · ${request.id}`}
      footer={
        <div className="flex items-center gap-2 justify-end w-full">
          <button className="btn" data-ask-reject onClick={() => decide("rejected")}>
            Reject
          </button>
          <button className="btn-primary" data-ask-approve onClick={() => decide("approved")}>
            Approve
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {request.note && <div className="text-sm text-ink">&ldquo;{request.note}&rdquo;</div>}

        <Table>
          <thead>
            <tr>
              <Th>Evidence when raised</Th>
              <Th align="right">Value</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Fill rate</Td>
              <Td align="right" className="num">{pct(request.evidence.fillRate)}</Td>
            </tr>
            <tr>
              <Td>Sellable on floor</Td>
              <Td align="right" className="num">{request.evidence.sellable.toLocaleString("en-IN")}</Td>
            </tr>
            <tr>
              <Td>True rate of sale</Td>
              <Td align="right" className="num">{request.evidence.ros.toFixed(2)}/day</Td>
            </tr>
            <tr>
              <Td>Cover</Td>
              <Td align="right" className="num">{request.evidence.coverDays > 900 ? "—" : `${Math.round(request.evidence.coverDays)}d`}</Td>
            </tr>
            <tr>
              <Td>Size set</Td>
              <Td align="right">{request.evidence.sizeSetStatus === "healthy" ? "Healthy" : request.evidence.sizeSetStatus === "broken" ? "Broken" : "At risk"}</Td>
            </tr>
            <tr>
              <Td>At risk</Td>
              <Td align="right" className="num">{request.evidence.valueAtRisk > 0 ? inr(request.evidence.valueAtRisk, { compact: true }) : "—"}</Td>
            </tr>
          </tbody>
        </Table>

        <div>
          <div className="label mb-1">Note back to the store</div>
          <input
            value={note}
            data-ask-note
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional. The store sees this."
            className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
        </div>
      </div>
    </Modal>
  );
}
