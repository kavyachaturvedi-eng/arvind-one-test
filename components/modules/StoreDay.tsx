"use client";

// Store Day — the store's operating day: one calendar, one ranked work queue,
// one KPI sheet, all derived from live store numbers.

import React, { useMemo, useState } from "react";
import { HOUR, NOW, STAFF, storeById } from "@/lib/seed";
import { slaState } from "@/lib/rules";
import { topSellers, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { BarChart, Callout, Card, Chip, Meter, SectionTitle, SlaBar, Stat, StatusDot, Table, Tabs, Td, Th, fmtTime, inr, pct } from "@/components/ui";
import type { Task } from "@/lib/types";

// 00:00 IST on the demo day. Everything below is derived from NOW — no clock reads.
const IST_MIDNIGHT = NOW - (11 * HOUR + 42 * 60_000);
const at = (h: number, m = 0) => IST_MIDNIGHT + h * HOUR + m * 60_000;

interface Slot {
  id: string;
  at: number;
  title: string;
  owner: string;
  detail: string;
  repeat?: string;
}

const SLOTS: Slot[] = [
  { id: "clean", at: at(9, 30), title: "Cleanliness champ — facade, glass, signage", owner: "Kiran Joshi", detail: "Champ of the day from the SOP roster. Closes with a facade photo." },
  { id: "dust", at: at(10, 0), title: "Dusting & mopping — fixtures, mannequins, trial rooms", owner: "Devansh Patil", detail: "Full sweep before the shutters go up." },
  { id: "open", at: at(11, 0), title: "Store opening — shutters, lights, music, till float", owner: "Rohit Sharma", detail: "Till float counted and sealed against yesterday's day close." },
  { id: "hb-am", at: at(11, 15), title: "Section handbook check — morning", owner: "Meera Pillai", detail: "Each section head signs off sizes, stock and best-sellers for their zone." },
  { id: "walk", at: at(12, 0), title: "Floor walk — hourly sweep", owner: "Meera Pillai", detail: "Six blocks, 12 checks. Two visual merchandising checks need a photo.", repeat: "every hour to close" },
  { id: "brief", at: at(13, 30), title: "Morning briefing — due by 13:30", owner: "Rohit Sharma", detail: "Seven fixed sections, pre-filled from today's live numbers." },
  { id: "replen", at: at(14, 0), title: "Replenishment pull from the stockroom", owner: "Aditya Rane", detail: "Sizes ascending, full replenishment on every arm before the evening peak." },
  { id: "hb-pm", at: at(20, 0), title: "Section handbook check — evening", owner: "Sana Qureshi", detail: "Second sign-off before close; gaps become tomorrow's first tasks." },
  { id: "seal", at: at(21, 30), title: "Cash seal & bank deposit prep", owner: "Rohit Sharma", detail: "Tender-wise seal; mismatches are already explained in Cash & Recon." },
  { id: "close", at: at(21, 45), title: "Day close in POS", owner: "Rohit Sharma", detail: "Single POS day close." },
  { id: "dsr", at: at(22, 0), title: "DSR to HO and RO", owner: "Arvind One", detail: "Generated from the KPI sheet numbers." },
];

const INITIAL_DONE = ["clean", "dust", "open"];

type SlotState = "done" | "overdue" | "due" | "upcoming";

function slotState(slot: Slot, done: string[]): SlotState {
  if (done.includes(slot.id)) return "done";
  if (slot.at <= NOW) return "overdue";
  if (slot.at <= NOW + 2 * HOUR) return "due";
  return "upcoming";
}

const SLOT_TONE: Record<SlotState, "good" | "critical" | "warn" | "neutral"> = { done: "good", overdue: "critical", due: "warn", upcoming: "neutral" };
const SLOT_LABEL: Record<SlotState, string> = { done: "Done", overdue: "Overdue", due: "Due", upcoming: "Upcoming" };
const SLOT_FILL: Record<SlotState, string> = {
  done: "var(--status-good)",
  overdue: "var(--status-critical)",
  due: "var(--status-warning)",
  upcoming: "var(--surface-2)",
};

const ORIGIN_LABEL: Record<Task["origin"], string> = {
  size_set: "Size set",
  replenishment: "Replenishment",
  ist: "Transfer",
  omni: "Omni order",
  vm: "Visual merch",
  floor_walk: "Floor walk",
  ticket: "Ticket",
  cash: "Cash",
  briefing: "Briefing",
  price_change: "Price change",
};

const ZONES = ["Window & entrance", "Polo & tees", "Shirts", "Denim & trousers", "Trial rooms & till", "Stockroom"];

interface Check {
  id: string;
  block: string;
  label: string;
  photo?: boolean;
}

const CHECKS: Check[] = [
  { id: "w1", block: "Window", label: "Window lit, clean and matching the current planogram" },
  { id: "w2", block: "Window", label: "No stray price tags visible from outside" },
  { id: "f1", block: "Floor", label: "All price tags hidden on faceouts" },
  { id: "f2", block: "Floor", label: "Sizes ascending with full replenishment on every arm" },
  { id: "v1", block: "Visual Merchandising", label: "Mannequins styled to the live VM guideline", photo: true },
  { id: "v2", block: "Visual Merchandising", label: "Feature table matches the published planogram", photo: true },
  { id: "s1", block: "Stockroom", label: "Best-sellers stored nearest the stockroom door" },
  { id: "s2", block: "Stockroom", label: "No unprocessed inward cartons left on the floor" },
  { id: "t1", block: "Team", label: "Grooming and name badges to standard" },
  { id: "t2", block: "Team", label: "Every associate can state today's target and their own" },
  { id: "r1", block: "Reports", label: "Cash & card report sent to HO and RO" },
  { id: "r2", block: "Reports", label: "CRM mobile numbers cross-checked against today's bills" },
];

export default function StoreDay() {
  const app = useApp();
  const store = storeById(app.storeId);
  const vitals = vitalsFor(app.storeId);

  const [done, setDone] = useState<string[]>(INITIAL_DONE);
  const [tab, setTab] = useState<"brief" | "kpi" | "walk">("brief");
  const [feedback, setFeedback] = useState("Trial-room wait was the top complaint yesterday — two associates on rotation from 18:00.");
  const [briefed, setBriefed] = useState(false);
  const [checked, setChecked] = useState<string[]>(["w1", "w2", "f1", "s1", "t1"]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [walkSubmitted, setWalkSubmitted] = useState(false);

  const tasks = useMemo(
    () => app.tasks.filter((t) => t.storeId === app.storeId).sort((a, b) => a.priority - b.priority || a.dueAt - b.dueAt),
    [app.tasks, app.storeId]
  );
  const openTasks = tasks.filter((t) => t.status === "todo" || t.status === "doing");
  const valueAtRisk = openTasks.reduce((a, t) => a + (t.valueAtRisk ?? 0), 0);

  const roster = useMemo(() => {
    const own = STAFF.filter((s) => s.storeId === app.storeId);
    return own.length ? own : STAFF;
  }, [app.storeId]);

  const focus = useMemo(() => topSellers(app.storeId, 3), [app.storeId]);
  const specialTask = openTasks[0];

  function audit(action: string, object: string) {
    app.dispatch({ type: "audit", entry: { at: NOW, actor: app.actorName, action, object, system: "Arvind One" } });
  }

  function completeSlot(slot: Slot) {
    setDone((d) => (d.includes(slot.id) ? d : [...d, slot.id]));
    audit(`Completed "${slot.title}"`, `${store.code} · ${fmtTime(slot.at)}`);
    app.toastNow(`${fmtTime(slot.at)} · ${slot.title} logged.`, "good");
  }

  function startTask(t: Task) {
    app.dispatch({ type: "task:update", id: t.id, patch: { status: "doing" } });
    app.toastNow(`Started: ${t.title}`, "info");
  }
  function attachPhoto(t: Task) {
    app.dispatch({ type: "task:update", id: t.id, patch: { photoAttached: true } });
    app.toastNow("Photo attached — close-out is now verifiable.", "good");
  }
  function completeTask(t: Task) {
    if (t.requiresPhoto && !t.photoAttached) return;
    app.dispatch({ type: "task:update", id: t.id, patch: { status: "done" } });
    audit("Closed task", t.id);
    app.toastNow(`Closed: ${t.title}`, "good");
  }

  function confirmBriefing() {
    setBriefed(true);
    const t = tasks.find((x) => x.origin === "briefing");
    if (t) app.dispatch({ type: "task:update", id: t.id, patch: { status: "done" } });
    audit("Confirmed morning briefing", `${store.code} · 7 sections`);
    setDone((d) => (d.includes("brief") ? d : [...d, "brief"]));
    app.toastNow("Briefing logged against today's numbers.", "good");
  }

  const walkPct = checked.length / CHECKS.length;
  const photosDone = CHECKS.filter((c) => c.photo).every((c) => photos.includes(c.id));

  function attachWalkPhoto(id: string) {
    setPhotos((p) => (p.includes(id) ? p : [...p, id]));
    app.toastNow("VM photo attached to the floor walk.", "good");
  }

  function submitWalk() {
    if (!photosDone) return;
    const open = CHECKS.filter((c) => !checked.includes(c.id));
    if (open.length) {
      app.dispatch({
        type: "task:create",
        task: {
          id: `T-FW-${checked.length}`, storeId: app.storeId, origin: "floor_walk", assignedTo: "Meera Pillai",
          title: `Close ${open.length} open floor-walk check${open.length === 1 ? "" : "s"}`,
          detail: open.map((c) => `${c.block}: ${c.label}`).join(" · "),
          dueAt: NOW + 3 * HOUR, priority: 2, status: "todo", requiresPhoto: true, photoAttached: false, slaHours: 3,
        },
      });
    }
    setWalkSubmitted(true);
    app.toastNow(
      open.length ? `Floor walk submitted — ${open.length} open checks raised as a tracked task.` : "Floor walk submitted clean, with VM photos attached.",
      open.length ? "warn" : "good"
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Store Day</h1>
          <p className="text-sm text-ink2 mt-1 max-w-2xl">
            The day plan, work queue, KPI sheet and floor walk for {store.name}.
          </p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Day plan" value={`${done.length}/${SLOTS.length}`} sub="slots complete" />
        <Stat label="Open work items" value={String(openTasks.length)} sub="in the ranked queue" tone={openTasks.length > 4 ? "warn" : undefined} />
        <Stat label="Value at risk in the queue" value={inr(valueAtRisk, { compact: true })} sub="sum of what the open items are protecting" />
        <Stat label="Floor walk" value={`${checked.length}/${CHECKS.length}`} sub={photosDone ? "VM photos attached" : "VM photos outstanding"} tone={photosDone ? undefined : "warn"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
        {/* ── Day calendar ─────────────────────────────────────────────────── */}
        <Card>
          <SectionTitle
            title="Today"
            sub="Every slot is a line item from the SOP workbook."
          />
          <ol className="relative pl-[68px]">
            <div className="absolute left-[61px] top-2 bottom-2 w-px bg-[color:var(--grid)]" />
            {SLOTS.map((s) => {
              const st = slotState(s, done);
              return (
                <li key={s.id} className="relative pb-3.5 last:pb-0">
                  <span className="absolute -left-[68px] top-0 text-xs num text-ink2 font-semibold w-[46px] text-right">{fmtTime(s.at)}</span>
                  <span
                    className="absolute -left-[11px] top-1.5 w-2.5 h-2.5 rounded-full border-2"
                    style={{ background: SLOT_FILL[st], borderColor: "var(--surface-2)", boxShadow: st === "upcoming" ? "0 0 0 1.5px var(--baseline)" : undefined }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink leading-snug">{s.title}</div>
                      <div className="text-2xs text-muted mt-0.5">{s.owner}{s.repeat ? ` · ${s.repeat}` : ""}</div>
                      <div className="text-xs text-ink2 mt-1 leading-snug">{s.detail}</div>
                    </div>
                    <div className="shrink-0 text-right space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 text-2xs text-ink2 whitespace-nowrap">
                        <StatusDot tone={SLOT_TONE[st]} /> {SLOT_LABEL[st]}
                      </span>
                      {st !== "done" && (
                        <div>
                          <button className="btn !py-1 !px-2 text-xs" onClick={() => completeSlot(s)}>Complete</button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* ── Work queue ───────────────────────────────────────────────────── */}
        <Card>
          <SectionTitle
            title="Work queue"
            sub="One ranked list. Priority first, then time left on the clock."
            right={<Chip tone={openTasks.length ? "warn" : "good"}>{openTasks.length} open</Chip>}
          />
          <div className="space-y-2.5">
            {tasks.map((t) => {
              const sla = slaState(t.dueAt - t.slaHours * HOUR, t.slaHours, NOW);
              const blocked = t.requiresPhoto && !t.photoAttached;
              const isDone = t.status === "done";
              return (
                <div key={t.id} className={`rounded-lg border px-3 py-2.5 ${isDone ? "border-line opacity-60" : sla.breached ? "border-[color:var(--status-critical)]" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Chip tone="neutral">{ORIGIN_LABEL[t.origin]}</Chip>
                        <Chip tone={t.priority === 1 ? "critical" : t.priority === 2 ? "warn" : "neutral"}>P{t.priority}</Chip>
                        {t.requiresPhoto && <Chip tone={t.photoAttached ? "good" : "serious"}>{t.photoAttached ? "Photo attached" : "Photo required"}</Chip>}
                      </div>
                      <div className="text-sm text-ink mt-1.5 leading-snug">{t.title}</div>
                      <div className="text-xs text-ink2 mt-0.5 leading-snug">{t.detail}</div>
                      <div className="text-2xs text-muted mt-1">
                        {t.assignedTo}{t.valueAtRisk ? ` · ${inr(t.valueAtRisk)} at risk` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 w-[124px] space-y-1.5">
                      <SlaBar pctConsumed={sla.pctConsumed} label={isDone ? "closed" : sla.remainingLabel} />
                      {!isDone && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {t.status === "todo" && <button className="btn !py-1 !px-2 text-xs" onClick={() => startTask(t)}>Start</button>}
                          {blocked && <button className="btn !py-1 !px-2 text-xs" onClick={() => attachPhoto(t)}>Attach photo</button>}
                          <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => completeTask(t)} disabled={blocked}>Complete</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {blocked && !isDone && (
                    <p className="text-2xs mt-2" style={{ color: "var(--status-serious)" }}>
                      Complete is blocked until a photo is attached.
                    </p>
                  )}
                </div>
              );
            })}
            {tasks.length === 0 && <p className="text-xs text-ink2">No work items for this store today.</p>}
          </div>
        </Card>
      </div>

      {/* ── Briefing / KPI / Floor walk ─────────────────────────────────────── */}
      <Card>
        <SectionTitle
          title="Briefing, KPI sheet & floor walk"
          right={
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { id: "brief" as const, label: "Briefing" },
                { id: "kpi" as const, label: "KPI sheet", count: roster.length },
                { id: "walk" as const, label: "Floor walk", count: CHECKS.length },
              ]}
            />
          }
        />

        {tab === "brief" && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Section title="1 · Zone coverage">
                <ul className="space-y-1">
                  {roster.map((s, i) => (
                    <li key={s.name} className="flex justify-between gap-2">
                      <span>{s.name}</span> <span className="text-muted">{ZONES[i % ZONES.length]}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="2 · Company information">
                AW26 drop 1 lands this week across {store.brand}. Price changes on 11 styles published overnight from SAP — tags are already queued in the
                work queue.
              </Section>
              <Section title="3 · Targets">
                <ul className="space-y-1 num">
                  {[
                    ["Month target", inr(store.targetMonth, { compact: true })],
                    ["MTD", `${inr(vitals.mtdSales, { compact: true })} · ${pct(vitals.achievement)} of plan`],
                    ["Same day last year", inr(vitals.lySameDay, { compact: true })],
                    ["Target today", inr(Math.round(store.targetMonth / 31), { compact: true })],
                  ].map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span>{k}</span> <span className="text-ink font-semibold">{v}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2">
                  <Meter value={vitals.mtdSales} target={vitals.mtdTargetToDate} />
                </div>
              </Section>
              <Section title="4 · Sales focus">
                Push {focus.map((f) => f.style.name).join(", ")} — the three fastest True ROS lines in this store this week. Two of them have{" "}
                {focus.filter((f) => f.health.status !== "healthy").length} size-set issues open in the queue.
              </Section>
              <Section title="5 · Service focus">
                CRM capture on every bill: mobile number read back to the customer, not guessed. Trial-room greet inside 30 seconds; that is the check
                that moved conversion last month.
              </Section>
              <Section title="6 · Special task">
                {specialTask ? `${specialTask.title} — ${specialTask.assignedTo}, due ${fmtTime(specialTask.dueAt)}.` : "No special task outstanding."}
              </Section>
            </div>
            <Section title="7 · Team feedback">
              <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2}
                className="w-full rounded-lg border border-line bg-raised text-ink text-xs px-3 py-2" />
            </Section>
            <div className="flex items-center gap-3 flex-wrap">
              <button className="btn-primary" onClick={confirmBriefing} disabled={briefed}>{briefed ? "Briefing confirmed" : "Confirm briefing"}</button>
            </div>
          </div>
        )}

        {tab === "kpi" && <KpiSheet />}

        {tab === "walk" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink2 num">{checked.length} of {CHECKS.length} checks complete</span>
              <span className="text-2xs text-muted">Two visual merchandising checks need a photo before submission</span>
            </div>
            <Meter value={checked.length} target={CHECKS.length} />
            <div className="grid gap-x-4 gap-y-1.5 md:grid-cols-2">
              {CHECKS.map((c) => {
                const on = checked.includes(c.id);
                const hasPhoto = photos.includes(c.id);
                return (
                  <div key={c.id} className="flex items-start gap-2 py-1 border-b border-line">
                    <input id={c.id} type="checkbox" checked={on} className="mt-1 shrink-0"
                      onChange={() => setChecked((v) => (on ? v.filter((x) => x !== c.id) : [...v, c.id]))} />
                    <label htmlFor={c.id} className="text-xs text-ink2 leading-snug min-w-0 flex-1">
                      <span className="label mr-1.5">{c.block}</span>{c.label}
                    </label>
                    {c.photo && (
                      <button className="btn !py-0.5 !px-1.5 text-2xs shrink-0" onClick={() => attachWalkPhoto(c.id)} disabled={hasPhoto}>
                        {hasPhoto ? "◉ Photo" : "Attach photo"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {!photosDone && (
              <Callout tone="warn" title="Submission blocked">
                Both visual merchandising checks need a photo before you can submit.
              </Callout>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button className="btn-primary" onClick={submitWalk} disabled={!photosDone || walkSubmitted}>
                {walkSubmitted ? "Floor walk submitted" : `Submit floor walk (${Math.round(walkPct * 100)}%)`}
              </button>
              <span className="text-xs text-ink2">Anything left open is raised as a tracked task.</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="label mb-1.5">{title}</div>
      <div className="text-xs text-ink2 leading-relaxed">{children}</div>
    </div>
  );
}

function KpiSheet() {
  const app = useApp();
  const roster = useMemo(() => {
    const own = STAFF.filter((s) => s.storeId === app.storeId);
    return own.length ? own : STAFF;
  }, [app.storeId]);

  const rows = roster.map((s) => ({
    ...s,
    atv: s.sales / Math.max(1, s.bills),
    upt: s.qty / Math.max(1, s.bills),
    asp: s.sales / Math.max(1, s.qty),
  }));
  const total = rows.reduce((a, r) => ({ sales: a.sales + r.sales, bills: a.bills + r.bills, qty: a.qty + r.qty }), { sales: 0, bills: 0, qty: 0 });
  const lowest = rows.reduce((a, r) => (r.upt < a.upt ? r : a), rows[0]);
  const best = rows.reduce((a, r) => (r.upt > a.upt ? r : a), rows[0]);

  return (
    <div className="space-y-4">
      <Table>
        <thead>
          <tr>
            <Th>Associate</Th>
            <Th>Role</Th>
            {["Sales", "Bills", "Qty", "ATV", "UPT", "ASP"].map((h) => (
              <Th key={h} align="right">{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <Td className="text-ink font-medium">{r.name}</Td>
              <Td className="text-ink2">{r.role}</Td>
              {[inr(r.sales, { compact: true }), String(r.bills), String(r.qty), inr(r.atv), r.upt.toFixed(2), inr(r.asp)].map((v, i) => (
                <Td key={i} align="right" className="num">{v}</Td>
              ))}
            </tr>
          ))}
          <tr>
            <Td className="text-ink font-semibold">Store total</Td>
            <Td />
            {[
              inr(total.sales, { compact: true }),
              String(total.bills),
              String(total.qty),
              inr(total.sales / Math.max(1, total.bills)),
              (total.qty / Math.max(1, total.bills)).toFixed(2),
              inr(total.sales / Math.max(1, total.qty)),
            ].map((v, i) => (
              <Td key={i} align="right" className="num font-semibold text-ink">{v}</Td>
            ))}
          </tr>
        </tbody>
      </Table>

      <div>
        <div className="label mb-2">Sales by associate, month to date</div>
        <BarChart data={rows.map((r) => ({ label: r.name, value: r.sales }))} format={(n) => inr(n, { compact: true })} />
      </div>

      <Callout tone="brand" title="Coaching prompt">
        {lowest.name} is converting at {lowest.upt.toFixed(2)} units per bill against {best.name} at {best.upt.toFixed(2)} — the gap is add-on, not
        traffic. Pair them on the denim wall for two shifts and re-read this sheet on Friday.
      </Callout>
    </div>
  );
}
