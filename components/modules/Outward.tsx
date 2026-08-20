"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Outward & RTV — raise a pullback, auto-split into compliant transfer codes,
// pack against evidence, and dispatch.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { NOW, STYLES, storeById } from "@/lib/seed";
import { OUTWARD_CODE_LIMIT, splitOutward, validateOutward } from "@/lib/rules";
import { useApp } from "@/lib/state";
import { Callout, Card, Chip, Meter, SectionTitle, Stat, StatusDot, Table, Td, Th, Timeline, fmtDateTime, inr } from "@/components/ui";
import type { OutwardBatch, OutwardKind } from "@/lib/types";

const KINDS: OutwardKind[] = ["RTV", "EOSS pullback", "Outlet transfer", "Defective"];
const PRESETS = [300, 1200, 2500];
const LEGACY_MIN_DAYS = 4;
const LEGACY_MAX_DAYS = 40;
const WARN_UNITS = 20_000;

/** Average MRP across the bought range — used to value the outward queue. */
const AVG_MRP = Math.round(STYLES.reduce((a, s) => a + s.mrp, 0) / STYLES.length);

const isOpen = (b: OutwardBatch) => b.status !== "dispatched" && b.status !== "closed";

const STATUS_TONE: Record<OutwardBatch["status"], "good" | "warn" | "serious" | "critical" | "neutral"> = {
  draft: "neutral",
  picking: "warn",
  packed: "serious",
  invoiced: "serious",
  dispatched: "good",
  closed: "good",
};

export default function Outward() {
  const app = useApp();

  const [kind, setKind] = useState<OutwardKind>("EOSS pullback");
  const [unitsText, setUnitsText] = useState("2500");
  const [formError, setFormError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string>(() => (app.outward.find((b) => b.id === "OB-3310") ? "OB-3310" : app.outward[0]?.id ?? ""));

  const batches = app.outward;
  const sel = batches.find((b) => b.id === selId) ?? batches[0];

  const parsedUnits = Number(unitsText);
  const unitsValid = Number.isFinite(parsedUnits) && Math.floor(parsedUnits) > 0;
  const previewCodes = unitsValid ? Math.ceil(Math.floor(parsedUnits) / OUTWARD_CODE_LIMIT) : 0;
  const overSized = unitsValid && Math.floor(parsedUnits) > WARN_UNITS;

  const openBatches = batches.filter(isOpen);
  const stagedUnits = openBatches.reduce((a, b) => a + b.totalUnits, 0);
  const queueValue = stagedUnits * AVG_MRP;
  const codesToPack = openBatches.reduce((a, b) => a + b.codes.filter((c) => !c.packed).length, 0);

  // ── Build a batch ──────────────────────────────────────────────────────────
  function buildBatch() {
    if (!unitsValid) {
      setFormError("Enter a unit count above zero — an empty batch cannot be picked, packed or invoiced.");
      return;
    }
    const units = Math.floor(parsedUnits);
    const id = `OB-${3311 + batches.length}`;
    const codes = splitOutward(units, id);
    const batch: OutwardBatch = {
      id,
      storeId: app.storeId,
      kind,
      totalUnits: units,
      createdAt: NOW,
      status: "draft",
      codes,
      videoProof: false,
      legacyDaysMin: LEGACY_MIN_DAYS,
      legacyDaysMax: LEGACY_MAX_DAYS,
      events: [
        { at: NOW, actor: app.actorName, label: `${kind} of ${units.toLocaleString("en-IN")} units raised`, system: "Arvind One" },
        {
          at: NOW + 1000,
          actor: "Arvind One",
          label: `Split into ${codes.length} transfer codes of ≤${OUTWARD_CODE_LIMIT} units; carton plan and weights generated`,
          system: "Arvind One",
        },
      ],
    };
    app.dispatch({ type: "outward:create", batch });
    setSelId(id);
    setFormError(null);
    app.toastNow(`${id} built — ${codes.length} transfer codes generated.`, "good");
  }

  // ── Progression on the selected batch ──────────────────────────────────────
  const packedCount = sel ? sel.codes.filter((c) => c.packed).length : 0;
  const unpacked = sel ? sel.codes.length - packedCount : 0;
  const dispatched = sel?.status === "dispatched" || sel?.status === "closed";

  function packNext() {
    if (!sel) return;
    const idx = sel.codes.findIndex((c) => !c.packed);
    if (idx < 0) return;
    const codes = sel.codes.map((c, i) => (i === idx ? { ...c, packed: true } : c));
    const allPacked = codes.every((c) => c.packed);
    app.dispatch({
      type: "outward:update",
      id: sel.id,
      patch: { codes, status: allPacked ? "packed" : "picking" },
      label: `${sel.codes[idx].code} packed — ${sel.codes[idx].units} units, ${sel.codes[idx].cartons} cartons, ${sel.codes[idx].weightKg} kg`,
      actor: app.actorName,
    });
    app.toastNow(`${sel.codes[idx].code} packed · ${codes.filter((c) => c.packed).length} of ${codes.length} codes done`, "good");
  }

  function toggleVideo() {
    if (!sel) return;
    const next = !sel.videoProof;
    app.dispatch({
      type: "outward:update",
      id: sel.id,
      patch: { videoProof: next },
      label: next ? "Packing video capture started — timestamped against each carton" : "Packing video capture stopped",
      actor: app.actorName,
    });
    app.toastNow(next ? "Packing video is recording against this batch." : "Packing video capture stopped.", next ? "good" : "warn");
  }

  function attachLr() {
    if (!sel) return;
    const idx = batches.findIndex((b) => b.id === sel.id);
    const lrNumber = `LR-${99000 + idx + 1}`;
    app.dispatch({
      type: "outward:update",
      id: sel.id,
      patch: { lrNumber },
      label: `LR copy ${lrNumber} attached`,
      actor: app.actorName,
    });
    app.toastNow(`${lrNumber} attached to ${sel.id}.`, "good");
  }

  const blockers = useMemo(() => {
    if (!sel) return ["No batch selected."];
    const errs = validateOutward({ codes: sel.codes, videoProof: sel.videoProof, lrNumber: sel.lrNumber });
    if (unpacked > 0) errs.push(`${unpacked} transfer code${unpacked === 1 ? "" : "s"} still unpacked — pick and pack before handover.`);
    return errs;
  }, [sel, unpacked]);

  function dispatchBatch() {
    if (!sel || blockers.length > 0) return;
    app.dispatch({
      type: "outward:update",
      id: sel.id,
      patch: { status: "dispatched" },
      label: `Dispatched on ${sel.lrNumber} with packing video attached — invoice raised`,
      actor: app.actorName,
    });
    app.toastNow(`${sel.id} dispatched. Invoice raised and transporter advised.`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Send stock out</h1>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Units staged for outward" value={stagedUnits.toLocaleString("en-IN")} sub={`across ${openBatches.length} open batches`} />
        <Stat label="Open batches" value={String(openBatches.length)} sub={`${batches.length} total this season`} />
        <Stat label="Codes to pack" value={String(codesToPack)} tone={codesToPack > 0 ? "warn" : "good"} sub="across open batches" />
        <Stat label="Value in the outward queue" value={inr(queueValue, { compact: true })} sub={`${stagedUnits.toLocaleString("en-IN")} units at ₹${AVG_MRP.toLocaleString("en-IN")} average MRP`} />
      </div>

      {/* ── Batch builder — planning raises these; the store does not decide
             what to return. Shown only outside store roles. ─────────────── */}
      {app.role !== "store" && app.role !== "staff" ? (
      <Card>
        <SectionTitle
          title="Build a batch"
          sub={`Pick the kind and the quantity. The batch splits automatically into transfer codes of at most ${OUTWARD_CODE_LIMIT} units.`}
        />
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] items-end">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Kind</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as OutwardKind)}
                className="mt-1 w-full rounded-lg border border-line bg-raised text-ink text-sm px-3 py-2"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            <div>
              <label className="block">
                <span className="label">Units</span>
                <input
                  type="number"
                  min={1}
                  value={unitsText}
                  onChange={(e) => { setUnitsText(e.target.value); setFormError(null); }}
                  className="mt-1 w-full rounded-lg border border-line bg-raised text-ink text-sm px-3 py-2 num"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p} className="btn !py-1 !px-2 text-xs" onClick={() => { setUnitsText(String(p)); setFormError(null); }}>
                    {p.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button className="btn-primary" onClick={buildBatch}>Build batch</button>
        </div>

        {unitsValid && !formError && (
          <p className="text-xs text-ink2 mt-3">
            {Math.floor(parsedUnits).toLocaleString("en-IN")} units will split into <strong className="text-ink num">{previewCodes}</strong> transfer
            code{previewCodes === 1 ? "" : "s"} of at most {OUTWARD_CODE_LIMIT} units.
          </p>
        )}
        {formError && (
          <div className="mt-3">
            <Callout tone="critical" title="Cannot build this batch">{formError}</Callout>
          </div>
        )}
        {overSized && (
          <div className="mt-3">
            <Callout tone="warn" title="Unusually large batch">
              {Math.floor(parsedUnits).toLocaleString("en-IN")} units is above the {WARN_UNITS.toLocaleString("en-IN")}-unit norm for a single
              pullback and will generate {previewCodes} codes. It will still build, but the area manager is notified and the transporter needs a
              multi-vehicle plan.
            </Callout>
          </div>
        )}
      </Card>
      ) : null}

      {/* ── Batch list + working surface ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr] items-start">
        <Card>
          <SectionTitle title="Batches" sub={`${batches.length} in the estate`} />
          <div className="space-y-1.5">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelId(b.id)}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                  b.id === sel?.id ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line hover:bg-[color:var(--plane)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink num">{b.id}</span>
                  <span className="inline-flex items-center gap-1.5 text-2xs text-ink2">
                    <StatusDot tone={STATUS_TONE[b.status]} /> {b.status}
                  </span>
                </div>
                <div className="text-2xs text-muted mt-0.5">
                  {b.kind} · {b.totalUnits.toLocaleString("en-IN")} units · {b.codes.length} codes · {storeById(b.storeId).code}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {sel && (
            <Card>
              <SectionTitle
                title={`${sel.id} · ${sel.kind}`}
                sub={`${storeById(sel.storeId).name} · raised ${fmtDateTime(sel.createdAt)}`}
                right={<Chip tone="brand">{sel.codes.length} transfer codes</Chip>}
              />

              <div className="mt-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="label">Packing progress</span>
                  <span className="text-xs text-ink2 num">
                    {packedCount} of {sel.codes.length} codes packed
                  </span>
                </div>
                <Meter value={packedCount} target={sel.codes.length} />
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <button className="btn" onClick={packNext} disabled={unpacked === 0 || dispatched}>Pack next code</button>
                <button className="btn" onClick={toggleVideo} disabled={dispatched}>
                  {sel.videoProof ? "◉ Packing video captured" : "○ Capture packing video"}
                </button>
                <button className="btn" onClick={attachLr} disabled={!!sel.lrNumber || dispatched}>
                  {sel.lrNumber ? `LR ${sel.lrNumber} attached` : "Attach LR copy"}
                </button>
                <button className="btn-primary" onClick={dispatchBatch} disabled={blockers.length > 0 || dispatched}>
                  {dispatched ? "Dispatched" : "Dispatch"}
                </button>
              </div>

              {!dispatched && blockers.length > 0 && (
                <div className="mt-3">
                  <Callout tone="critical" title="Dispatch blocked — these must be true before handover">
                    <ul className="list-disc pl-4 space-y-1">
                      {blockers.map((e) => <li key={e}>{e}</li>)}
                    </ul>
                  </Callout>
                </div>
              )}
              {dispatched && (
                <div className="mt-3">
                  <Callout tone="good" title="Dispatched">
                    {sel.codes.length} codes, {sel.totalUnits.toLocaleString("en-IN")} units, packing video attached, {sel.lrNumber} on file.
                  </Callout>
                </div>
              )}

              <div className="mt-4">
                <Table>
                  <thead>
                    <tr>
                      <Th>Transfer code</Th>
                      <Th align="right">Units</Th>
                      <Th align="right">Cartons</Th>
                      <Th align="right">Weight</Th>
                      <Th>Packed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.codes.map((c) => (
                      <tr key={c.code}>
                        <Td className="num font-semibold text-ink">{c.code}</Td>
                        <Td align="right" className="num">{c.units}</Td>
                        <Td align="right" className="num">{c.cartons}</Td>
                        <Td align="right" className="num">{c.weightKg} kg</Td>
                        <Td>
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
                            <StatusDot tone={c.packed ? "good" : "neutral"} />
                            {c.packed ? "Packed" : "Awaiting pick"}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              {sel.events.length > 0 && (
                <div className="mt-4">
                  <SectionTitle title="Trail" />
                  <Timeline events={sel.events} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
