"use client";

// Trainings — Planning publishes a module; it lands on every store's
// Tasks & Chores the same minute.

import React, { useState } from "react";
import { STORES } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, Meter, SectionTitle, Stat, Table, Td, Th } from "@/components/ui";

const SEEDED = [
  { id: "TR-1", title: "New denim fits — FW26 line knowledge", audience: "All floor staff", mins: 20, dueDays: 2, completion: 0.64 },
  { id: "TR-2", title: "Omni handover & POD — refresher", audience: "Omni champs", mins: 10, dueDays: 1, completion: 0.38 },
  { id: "TR-3", title: "Loyalty pitch at billing", audience: "Cashiers", mins: 15, dueDays: 5, completion: 0.82 },
];

export default function Trainings() {
  const app = useApp();
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("All floor staff");
  const [mins, setMins] = useState(15);
  const [dueDays, setDueDays] = useState(3);

  const published = app.trainings;

  function publish() {
    if (!title.trim()) return;
    app.dispatch({
      type: "training:create",
      training: { id: `TR-${100 + published.length}`, title: title.trim(), audience, mins, dueDays, createdBy: app.actorName },
    });
    app.toastNow(`"${title.trim()}" published to ${STORES.length} stores`, "good");
    setTitle("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Trainings</h1>
        <p className="text-sm text-ink2 mt-1">Publish once; it appears on every store&apos;s Tasks &amp; Chores with a due date.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Live modules" value={String(SEEDED.length + published.length)} sub={`across ${STORES.length} stores`} />
        <Stat label="Published today" value={String(published.length)} tone={published.length ? "good" : undefined} sub="By planning" />
        <Stat label="Estate completion" value="61%" tone="warn" sub="Across live modules" />
        <Stat label="Overdue stores" value="4" tone="critical" sub="At least one module past due" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <SectionTitle title="Publish a training" sub="Lands on stores instantly." />
          <div className="space-y-2.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Module title"
              className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-sm"
            />
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink">
              <option>All floor staff</option>
              <option>Store managers</option>
              <option>Cashiers</option>
              <option>Omni champs</option>
            </select>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="label">Minutes</span>
                <input type="number" min={5} max={60} value={mins} onChange={(e) => setMins(Math.max(5, Math.min(60, Number(e.target.value) || 15)))} className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm num" />
              </label>
              <label className="block">
                <span className="label">Due in (days)</span>
                <input type="number" min={1} max={30} value={dueDays} onChange={(e) => setDueDays(Math.max(1, Math.min(30, Number(e.target.value) || 3)))} className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm num" />
              </label>
            </div>
            <button className="btn-primary w-full" disabled={!title.trim()} onClick={publish}>
              Publish to {STORES.length} stores
            </button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="Live modules" right={<Chip>{SEEDED.length + published.length}</Chip>} />
          <Table>
            <thead>
              <tr><Th>Module</Th><Th>Audience</Th><Th align="right">Mins</Th><Th align="right">Due</Th><Th className="w-[140px]">Estate completion</Th></tr>
            </thead>
            <tbody>
              {published.map((t) => (
                <tr key={t.id}>
                  <Td className="text-sm text-ink">{t.title} <Chip tone="good">new</Chip></Td>
                  <Td className="text-xs text-ink2">{t.audience}</Td>
                  <Td align="right" className="num text-xs">{t.mins}</Td>
                  <Td align="right" className="num text-xs">{t.dueDays}d</Td>
                  <Td><Meter value={0.02} target={1} /></Td>
                </tr>
              ))}
              {SEEDED.map((t) => (
                <tr key={t.id}>
                  <Td className="text-sm text-ink">{t.title}</Td>
                  <Td className="text-xs text-ink2">{t.audience}</Td>
                  <Td align="right" className="num text-xs">{t.mins}</Td>
                  <Td align="right" className="num text-xs">{t.dueDays}d</Td>
                  <Td><Meter value={t.completion} target={1} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {SEEDED.length + published.length === 0 && <Empty title="No live modules" />}
        </Card>
      </div>
    </div>
  );
}
