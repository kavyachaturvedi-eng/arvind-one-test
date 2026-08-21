"use client";

// Replenishment — what this store is asking planning to send.
//
// A pull is a *request*, not an instruction: the store proposes and Retail
// Planning decides (maker-checker). Raising one creates the local task so the
// floor knows it is in hand, and a planning request carrying the evidence the
// store could see at the moment it raised it.

import React, { useMemo, useState } from "react";
import { NOW } from "@/lib/seed";
import { sizeSetExceptions, vitalsFor, type StyleSignal } from "@/lib/engine";
import { REQUEST_LABEL, useApp } from "@/lib/state";
import { Card, Chip, Empty, SectionTitle, Stat, StatusDot, Swatch, Table, Td, Th, inr } from "@/components/ui";
import { pct } from "@/lib/rules";

const ACTION_LABEL: Record<string, string> = {
  replenish_from_dc: "Pull from warehouse",
  transfer_in: "Transfer from a store",
  stop_sell: "Stop featuring",
  monitor: "Monitor",
};

export default function Replenishment() {
  const app = useApp();
  const all = useMemo(() => sizeSetExceptions(app.storeId, 40), [app.storeId]);
  const vitals = useMemo(() => vitalsFor(app.storeId), [app.storeId]);
  const [raised, setRaised] = useState<string[]>([]);
  // What planning has already done with this store's asks.
  const mine = app.requests.filter((r) => r.storeId === app.storeId);
  const waiting = mine.filter((r) => r.status === "open");
  const decided = mine.filter((r) => r.status !== "open");

  const pulls = all.filter((s) => s.decision.action === "replenish_from_dc");
  const transfers = all.filter((s) => s.decision.action === "transfer_in");
  const others = all.filter((s) => s.decision.action !== "replenish_from_dc" && s.decision.action !== "transfer_in");
  const pullUnits = pulls.reduce((a, s) => a + (s.decision.units || 0), 0);
  const atRiskValue = all.reduce((a, s) => a + s.valueAtRisk, 0);
  // The thinnest style on the floor, in days of cover at today's rate of sale.
  const covers = all.map((s) => s.cover).filter((c) => Number.isFinite(c)).sort((a, b) => a - b);
  const thinnestCover = covers.length ? Math.round(covers[0]) : 0;
  const openPulls = pulls.filter((s) => !raised.includes(s.style.id));

  function raisePull(sig: StyleSignal) {
    const units = Math.max(1, Math.min(sig.dcUnits, sig.decision.units || Math.ceil(sig.ros * 7)));

    // The ask that goes up to planning, with the evidence frozen as the store
    // saw it. Planning decides; nothing is picked until it does.
    app.raiseRequest({
      kind: "replenish",
      storeId: app.storeId,
      styleId: sig.style.id,
      size: sig.health.missingCore[0] ?? sig.style.coreSizes[0],
      units,
      note: sig.decision.reason,
      evidence: {
        fillRate: vitals.fillRate,
        sellable: sig.sellable,
        ros: sig.ros,
        coverDays: sig.cover,
        sizeSetStatus: sig.health.status,
        valueAtRisk: Math.round(sig.valueAtRisk),
      },
    });

    app.dispatch({
      type: "task:create",
      task: {
        id: `T-RP-${sig.style.id}`,
        storeId: app.storeId,
        title: `Replenish ${units} × ${sig.style.name} — asked planning`,
        detail: `${sig.decision.reason} Warehouse shows ${sig.dcUnits} units. Waiting on Retail Planning.`,
        origin: "replenishment",
        assignedTo: app.actorName,
        dueAt: NOW + 24 * 3600_000,
        priority: 1,
        status: "todo",
        requiresPhoto: false,
        photoAttached: false,
        valueAtRisk: Math.round(sig.valueAtRisk),
        slaHours: 24,
      },
    });
    setRaised((r) => [...r, sig.style.id]);
    app.toastNow(`Asked planning for ${units} × ${sig.style.name}`, "good");
  }

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const pickedPulls = openPulls.filter((s) => picked[s.style.id]);

  function raisePicked() {
    pickedPulls.forEach(raisePull);
    setPicked({});
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Replenishment</h1>
        </div>

      </div>

      <Card>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="serif-accent text-sm shrink-0">Arvi</span>
          <span className="text-xs text-ink">
            The Replenishment Agent raised 11 pulls inside its autonomy limit overnight. 2 above-limit moves are waiting for approval.
          </span>
          <button className="btn !py-1 !text-2xs" onClick={() => app.go("agents")}>Review approvals</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Warehouse pulls" value={String(pulls.length)} tone={pulls.length ? "warn" : "good"} sub={`${pullUnits} units recommended`} emphasis />
        <Stat label="Store transfers" value={String(transfers.length)} sub="Warehouse empty, a peer store has it" />
        <Stat label="Other exceptions" value={String(others.length)} sub="Stop-sell or monitor" />
        <Stat
          label="Cover left, thinnest style"
          value={`${thinnestCover} days`}
          tone={thinnestCover <= 7 ? "critical" : thinnestCover <= 14 ? "warn" : "good"}
          sub="At today's rate of sale"
        />
        <Stat label="Value at risk" value={inr(atRiskValue, { compact: true })} tone="critical" sub="Next 7 days" />
      </div>

      <Card>
        <SectionTitle title="Pull from warehouse" right={<Chip tone={openPulls.length ? "warn" : "good"}>{openPulls.length} open</Chip>} />
        {pulls.length === 0 ? (
          <Empty title="Nothing to pull" body="No exception currently has warehouse stock available." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Style</Th><Th>Missing</Th>
                <Th align="right">RoS</Th><Th align="right">Cover</Th>
                <Th align="right">Warehouse</Th><Th align="right">Pull</Th>
                <Th align="right">At risk · 7 days</Th><Th align="right" />
              </tr>
            </thead>
            <tbody>
              {pulls.map((s) => {
                const done = raised.includes(s.style.id);
                return (
                  <tr key={s.style.id}>
                    <Td>
                      <span className="inline-flex items-center gap-2 text-sm text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span>
                    </Td>
                    <Td className="text-xs text-ink2">{s.health.missingCore.join(", ") || "—"}</Td>
                    <Td align="right" className="num text-xs">{s.ros.toFixed(2)}/d</Td>
                    <Td align="right" className="num text-xs">{s.cover > 900 ? "—" : `${s.cover.toFixed(0)}d`}</Td>
                    <Td align="right" className="num text-xs">{s.dcUnits}</Td>
                    <Td align="right" className="num font-semibold text-ink">{s.decision.units || Math.ceil(s.ros * 7)}</Td>
                    <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{inr(s.valueAtRisk, { compact: true })}</Td>
                    <Td align="right">
                      {done ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink2"><StatusDot tone="warn" />With planning</span>
                      ) : (
                        <input
                          type="checkbox"
                          data-pull-pick
                          checked={!!picked[s.style.id]}
                          onChange={(e) => setPicked({ ...picked, [s.style.id]: e.target.checked })}
                        />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {openPulls.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <button
              className="btn !py-1 !text-2xs"
              data-pull-pick-all
              onClick={() => setPicked(Object.fromEntries(openPulls.map((s2) => [s2.style.id, true])))}
            >
              Select all {openPulls.length}
            </button>
            <button
              className={pickedPulls.length > 0 ? "btn-primary" : "btn"}
              data-ask-picked
              disabled={pickedPulls.length === 0}
              onClick={raisePicked}
            >
              Ask planning{pickedPulls.length > 0 ? ` for ${pickedPulls.length}` : ""}
            </button>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Transfer from a store" right={<Chip>{transfers.length}</Chip>} />
        {transfers.length === 0 ? (
          <Empty title="No transfers suggested" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Style</Th><Th>Missing</Th><Th align="right">RoS</Th>
                <Th align="right">Peer stock</Th><Th align="right">At risk</Th><Th align="right" />
              </tr>
            </thead>
            <tbody>
              {transfers.map((s) => (
                <tr key={s.style.id}>
                  <Td>
                    <span className="inline-flex items-center gap-2 text-sm text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span>
                  </Td>
                  <Td className="text-xs text-ink2">{s.health.missingCore.join(", ") || "—"}</Td>
                  <Td align="right" className="num text-xs">{s.ros.toFixed(2)}/d</Td>
                  <Td align="right" className="num text-xs">{s.donorUnits}</Td>
                  <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{inr(s.valueAtRisk, { compact: true })}</Td>
                  <Td align="right">
                    <button className="btn-primary !py-1.5 !text-xs" onClick={() => app.go("savesale")}>Find donor</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {others.length > 0 && (
        <Card>
          <SectionTitle title="No stock anywhere" right={<Chip>{others.length}</Chip>} />
          <Table>
            <thead>
              <tr><Th>Style</Th><Th>Missing</Th><Th>Action</Th><Th className="w-1/2">Why</Th></tr>
            </thead>
            <tbody>
              {others.map((s) => (
                <tr key={s.style.id}>
                  <Td>
                    <span className="inline-flex items-center gap-2 text-sm text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span>
                  </Td>
                  <Td className="text-xs text-ink2">{s.health.missingCore.join(", ") || "—"}</Td>
                  <Td><Chip tone={s.decision.action === "stop_sell" ? "critical" : "neutral"}>{ACTION_LABEL[s.decision.action]}</Chip></Td>
                  <Td className="text-xs text-ink2">{s.decision.reason}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <SectionTitle
          title="With planning"
          sub={`Your norm is ${app.normFor(app.storeId).toLocaleString("en-IN")} units — planning owns it. Floor is at ${pct(vitals.sellableUnits / Math.max(1, app.normFor(app.storeId)))} of it.`}
          right={<Chip tone={waiting.length ? "warn" : "good"}>{waiting.length} waiting</Chip>}
        />
        {mine.length === 0 ? (
          <Empty title="Nothing with planning" body="Raise a pull above and it appears here until planning decides." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Ask</Th><Th align="right">Units</Th><Th>Status</Th><Th className="w-1/2">Planning said</Th></tr>
            </thead>
            <tbody>
              {[...waiting, ...decided].map((r) => (
                <tr key={r.id} data-my-ask={r.status}>
                  <Td className="text-sm text-ink">{REQUEST_LABEL[r.kind]}</Td>
                  <Td align="right" className="num text-xs">{r.units ?? "—"}</Td>
                  <Td>
                    <Chip tone={r.status === "approved" ? "good" : r.status === "rejected" ? "critical" : "warn"}>
                      {r.status === "open" ? "Waiting" : r.status === "approved" ? "Approved" : "Rejected"}
                    </Chip>
                  </Td>
                  <Td className="text-xs text-ink2">{r.decisionNote ?? (r.status === "open" ? "—" : r.decidedBy ?? "—")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
