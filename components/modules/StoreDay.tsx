"use client";

// Briefing & Tasks — the store's working list for today: what HQ needs,
// what training is due, and the floor chores, each with an owner and a clock.

import React, { useMemo, useState } from "react";
import { HOUR, NOW, rng, storeById } from "@/lib/seed";
import { slaState } from "@/lib/rules";
import { useApp } from "@/lib/state";
import { Card, Chip, Empty, Meter, SectionTitle, SlaBar, Stat, StatusDot, Table, Td, Th, inr } from "@/components/ui";
import { BriefingModal } from "./Briefing";
import { VmAuditModal } from "./VmAudit";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

interface HqTask {
  id: string;
  title: string;
  from: string;
  due: number;
  slaHours: number;
  needsPhoto: boolean;
}

interface Training {
  id: string;
  title: string;
  who: string;
  mins: number;
  duenDays: number;
  progress: number;
}

interface Chore {
  id: string;
  title: string;
  owner: string;
  slot: string;
}

function buildHq(storeId: string): HqTask[] {
  const r = rng(hash("hq" + storeId));
  return [
    { id: "HQ-1", title: "New EOSS window display — install creative kit 24B", from: "VM, HO", due: NOW + 26 * HOUR, slaHours: 48, needsPhoto: true },
    { id: "HQ-2", title: "Festive season staffing plan — confirm roster", from: "Retail Ops", due: NOW + 6 * HOUR, slaHours: 24, needsPhoto: false },
    { id: "HQ-3", title: `Price revision on ${3 + Math.floor(r() * 9)} styles — verify tags on floor`, from: "Commercial", due: NOW + 3 * HOUR, slaHours: 24, needsPhoto: true },
    { id: "HQ-4", title: "Quarterly fire-safety self-audit checklist", from: "Admin", due: NOW + 50 * HOUR, slaHours: 72, needsPhoto: false },
  ];
}

function buildTrainings(storeId: string): Training[] {
  const r = rng(hash("trn" + storeId));
  return [
    { id: "TR-1", title: "New denim fits — FW26 line knowledge", who: "All floor staff", mins: 20, duenDays: 2, progress: 0.5 + r() * 0.3 },
    { id: "TR-2", title: "Omni handover & POD — refresher", who: "Omni champ", mins: 10, duenDays: 1, progress: 0 },
    { id: "TR-3", title: "Loyalty pitch at billing", who: "Cashiers", mins: 15, duenDays: 5, progress: 0.8 + r() * 0.2 },
  ];
}

const CHORES: Chore[] = [
  { id: "C-1", title: "Facade, glass & signage", owner: "Kiran Joshi", slot: "09:30" },
  { id: "C-2", title: "Fixtures, mannequins, trial rooms", owner: "Devansh Patil", slot: "10:00" },
  { id: "C-3", title: "Till float counted & sealed", owner: "Rohit Sharma", slot: "11:00" },
  { id: "C-4", title: "Section sign-off — sizes & best-sellers", owner: "Meera Pillai", slot: "11:15" },
  { id: "C-5", title: "Hourly floor walk — 6 blocks", owner: "Meera Pillai", slot: "12:00" },
  { id: "C-6", title: "Stockroom replenishment pull", owner: "Aditya Rane", slot: "14:00" },
  { id: "C-7", title: "Evening section sign-off", owner: "Sana Qureshi", slot: "20:00" },
];

export default function StoreDay() {
  const app = useApp();
  const store = storeById(app.storeId);

  const hq = useMemo(() => buildHq(app.storeId), [app.storeId]);
  const seededTrainings = useMemo(() => buildTrainings(app.storeId), [app.storeId]);
  // Modules published by Planning land here instantly, on top of the seeded ones.
  const trainings = useMemo<Training[]>(
    () => [
      ...app.trainings.map((t) => ({ id: t.id, title: t.title, who: t.audience, mins: t.mins, duenDays: t.dueDays, progress: 0 })),
      ...seededTrainings,
    ],
    [app.trainings, seededTrainings]
  );
  const [hqDone, setHqDone] = useState<string[]>([]);
  const [choresDone, setChoresDone] = useState<string[]>(["C-1", "C-2", "C-3"]);
  const [briefed, setBriefed] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [auditTask, setAuditTask] = useState<HqTask | null>(null);

  const systemTasks = app.tasks
    .filter((t) => t.storeId === app.storeId && t.status !== "done")
    .sort((a, b) => a.priority - b.priority);

  const openHq = hq.filter((t) => !hqDone.includes(t.id));
  const trainingDue = trainings.filter((t) => t.progress < 1);
  const openChores = CHORES.filter((c) => !choresDone.includes(c.id));

  function completeHq(t: HqTask) {
    if (t.needsPhoto) {
      // Photo close-outs go through Arvi Vision — capture, check, auto-approve.
      setAuditTask(t);
      return;
    }
    setHqDone((d) => [...d, t.id]);
    app.toastNow(`${t.id} closed`, "good");
  }

  function vmApproved(t: HqTask, score: number) {
    setHqDone((d) => [...d, t.id]);
    setAuditTask(null);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `${t.id} closed with photo — ${score}% VM compliance, auto-approved by Arvi Vision`, object: t.id, system: "Arvi" },
    });
    app.toastNow(`${t.id} closed · ${score}% VM compliance — HQ SLA resolved`, "good");
  }
  function completeChore(c: Chore) {
    setChoresDone((d) => [...d, c.id]);
    app.toastNow(`${c.title} — done`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Briefing &amp; Tasks</h1>
          <p className="text-sm text-ink2 mt-1">{store.name} · everything due today, with an owner.</p>
        </div>
        {!briefed ? (
          <button data-briefing className="btn-primary" onClick={() => setBriefingOpen(true)}>
            ▶ Generate morning huddle
          </button>
        ) : (
          <Chip tone="good">● Briefing done · 11:41</Chip>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="From HQ" value={String(openHq.length)} tone={openHq.length ? "warn" : "good"} sub="Open, with an SLA" emphasis />
        <Stat label="System tasks" value={String(systemTasks.length)} sub="Raised by exceptions & orders" />
        <Stat label="Training due" value={String(trainingDue.length)} tone={trainingDue.some((t) => t.duenDays <= 1) ? "warn" : undefined} sub="Modules pending this week" />
        <Stat label="Floor chores" value={`${CHORES.length - openChores.length}/${CHORES.length}`} tone={openChores.length <= 2 ? "good" : "warn"} sub="Done today" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* HQ tasks */}
        <Card>
          <SectionTitle title="From HQ" right={<Chip tone={openHq.length ? "warn" : "good"}>{openHq.length} open</Chip>} />
          <div className="space-y-2">
            {hq.map((t) => {
              const done = hqDone.includes(t.id);
              const s = slaState(t.due - t.slaHours * HOUR, t.slaHours, NOW);
              return (
                <div key={t.id} className={`rounded-lg border border-line p-3 ${done ? "opacity-55" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink leading-snug">{t.title}</div>
                      <div className="text-2xs text-muted mt-0.5">
                        {t.from} {t.needsPhoto && "· photo close-out"}
                      </div>
                      {!done && <div className="mt-2 max-w-[220px]"><SlaBar pctConsumed={s.pctConsumed} label={s.remainingLabel} /></div>}
                    </div>
                    {done ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink2 shrink-0"><StatusDot tone="good" />Done</span>
                    ) : (
                      <button className="btn-primary !py-1.5 !text-xs shrink-0" onClick={() => completeHq(t)}>
                        {t.needsPhoto ? "Close with photo" : "Mark done"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* System tasks */}
        <Card>
          <SectionTitle title="Raised by the system" right={<Chip>{systemTasks.length}</Chip>} />
          {systemTasks.length === 0 ? (
            <Empty title="Queue clear" body="Exceptions and orders create tasks here on their own." />
          ) : (
            <div className="space-y-2">
              {systemTasks.slice(0, 6).map((t) => {
                const s = slaState(t.dueAt - t.slaHours * HOUR, t.slaHours, NOW);
                return (
                  <div key={t.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start gap-2.5">
                      <StatusDot tone={t.priority === 1 ? "critical" : t.priority === 2 ? "warn" : "neutral"} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink leading-snug">{t.title}</div>
                        <div className="text-2xs text-muted mt-0.5">
                          {t.assignedTo}
                          {t.valueAtRisk ? ` · ${inr(t.valueAtRisk, { compact: true })} at risk` : ""}
                        </div>
                        <div className="mt-2 max-w-[220px]"><SlaBar pctConsumed={s.pctConsumed} label={s.remainingLabel} /></div>
                      </div>
                      <button
                        className="btn !py-1.5 !text-xs shrink-0"
                        onClick={() => {
                          app.dispatch({ type: "task:update", id: t.id, patch: { status: "done" } });
                          app.toastNow(`${t.id} completed`, "good");
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Trainings */}
        <Card>
          <SectionTitle title="Training due" right={<Chip tone={trainingDue.length ? "warn" : "good"}>{trainingDue.length} pending</Chip>} />
          <Table>
            <thead>
              <tr><Th>Module</Th><Th>Who</Th><Th align="right">Due</Th><Th className="w-[130px]">Progress</Th><Th align="right" /></tr>
            </thead>
            <tbody>
              {trainings.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <div className="text-sm text-ink">{t.title}</div>
                    <div className="text-2xs text-muted">{t.mins} min</div>
                  </Td>
                  <Td className="text-xs text-ink2">{t.who}</Td>
                  <Td align="right" className="num text-xs" style={{ color: t.duenDays <= 1 ? "var(--status-critical)" : undefined }}>
                    {t.duenDays <= 1 ? "today" : `${t.duenDays}d`}
                  </Td>
                  <Td><Meter value={t.progress} target={1} /></Td>
                  <Td align="right">
                    {t.progress >= 1 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink2"><StatusDot tone="good" />Done</span>
                    ) : (
                      <button className="btn-primary !py-1.5 !text-xs" onClick={() => app.toastNow(`${t.title} started on the floor tablet`, "info")}>Start</button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Staff chores */}
        <Card>
          <SectionTitle title="Floor chores" right={<Chip tone={openChores.length ? "warn" : "good"}>{CHORES.length - openChores.length}/{CHORES.length}</Chip>} />
          <div className="space-y-1.5">
            {CHORES.map((c) => {
              const done = choresDone.includes(c.id);
              const overdue = !done && Number(c.slot.split(":")[0]) <= 11;
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  <StatusDot tone={done ? "good" : overdue ? "critical" : "neutral"} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm leading-snug ${done ? "text-muted line-through" : "text-ink"}`}>{c.title}</div>
                    <div className="text-2xs text-muted">{c.owner} · {c.slot}</div>
                  </div>
                  {!done && (
                    <button className="btn !py-1 !text-2xs shrink-0" onClick={() => completeChore(c)}>Done</button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <BriefingModal
        open={briefingOpen}
        onClose={() => setBriefingOpen(false)}
        onLogged={() => {
          setBriefed(true);
          setBriefingOpen(false);
        }}
      />
      {auditTask && (
        <VmAuditModal
          open={!!auditTask}
          taskId={auditTask.id}
          taskTitle={auditTask.title}
          onClose={() => setAuditTask(null)}
          onApproved={(score) => vmApproved(auditTask, score)}
        />
      )}
    </div>
  );
}
