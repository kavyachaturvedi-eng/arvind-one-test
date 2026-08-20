"use client";

// Staff & Shifts — the manager's people screen in plain words.
// Who works here, who works when. Tap a box to change a shift.
// M = morning, E = evening, O = off. Publish sends the week to staff phones.

import React, { useMemo, useState } from "react";
import { NOW, STAFF, rng, storeById } from "@/lib/seed";
import { ALL_PERMISSIONS, useApp, type Permission } from "@/lib/state";
import { Card, Chip, SectionTitle, Stat, StatusDot, inr } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Shift = "M" | "E" | "O";
const NEXT: Record<Shift, Shift> = { M: "E", E: "O", O: "M" };
const SHIFT_LABEL: Record<Shift, string> = { M: "Morning · 10–6", E: "Evening · 2–10", O: "Off" };
const SHIFT_BG: Record<Shift, string> = { M: "var(--ok-soft)", E: "var(--brand-soft)", O: "var(--plane)" };
const SHIFT_FG: Record<Shift, string> = { M: "var(--status-good)", E: "var(--brand)", O: "var(--text-muted)" };

const ROLES_ON_FLOOR = ["Cashier", "Floor", "Omni champ", "Visual merchandiser"];

interface Member {
  name: string;
  role: string;
  added?: boolean;
}

function seedWeek(names: string[]): Record<string, Shift[]> {
  const out: Record<string, Shift[]> = {};
  for (const n of names) {
    const r = rng(hash("shift" + n));
    // Everyone gets one off day; mornings and evenings alternate believably.
    const off = Math.floor(r() * 7);
    out[n] = DAYS.map((_, d) => (d === off ? "O" : r() > 0.5 ? "M" : "E"));
  }
  return out;
}

export default function Team() {
  const app = useApp();
  const store = storeById(app.storeId);

  const seeded = useMemo<Member[]>(
    () => STAFF.map((s) => ({ name: s.name, role: s.role })),
    []
  );
  const [added, setAdded] = useState<Member[]>([]);
  const team = [...seeded, ...added];

  const [week, setWeek] = useState<Record<string, Shift[]>>(() => seedWeek(seeded.map((s) => s.name)));
  const [published, setPublished] = useState(false);

  // Add-person form
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES_ON_FLOOR[1]);
  const [pin, setPin] = useState("");
  const [perms, setPerms] = useState<Permission[]>(["bill"]);

  function addPerson() {
    const clean = name.trim();
    if (!clean) return;
    if (app.users.some((m) => m.name.toLowerCase() === clean.toLowerCase())) {
      app.toastNow("That name is already on the team", "warn");
      return;
    }
    if (pin.length !== 4) {
      app.toastNow("Give them a 4-digit PIN so they can sign in", "warn");
      return;
    }
    app.dispatch({ type: "user:add", user: { name: clean, role, pin, permissions: perms } });
    setAdded((a) => [...a, { name: clean, role, added: true }]);
    setWeek((w) => ({ ...w, ...seedWeek([clean]) }));
    setName("");
    setPin("");
    setPerms(["bill"]);
    setPublished(false);
    app.toastNow(`${clean} added with PIN ${pin}. They can sign in on the store device now.`, "good");
  }

  function cycle(nameKey: string, day: number) {
    setWeek((w) => ({ ...w, [nameKey]: w[nameKey].map((s, i) => (i === day ? NEXT[s] : s)) }));
    setPublished(false);
  }

  // Coverage: how many people are in, per day.
  const coverage = DAYS.map((_, d) => team.filter((m) => (week[m.name]?.[d] ?? "O") !== "O").length);
  const thin = coverage.map((c, d) => c < (d >= 5 ? 5 : 4)); // weekends need one more
  const offToday = team.filter((m) => (week[m.name]?.[3] ?? "O") === "O"); // demo clock is Thursday

  function publish() {
    setPublished(true);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `Published next week's shifts for ${team.length} people at ${store.name}`, object: "shifts", system: "Arvind One" },
    });
    app.toastNow(`Week published. ${team.length} people get their shifts on their phone`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Staff &amp; Shifts</h1>
          <p className="text-sm text-ink2 mt-1">{store.name}</p>
        </div>
        <button data-publish-week className="btn-primary" disabled={published} onClick={publish}>
          {published ? "✓ Week published" : "Publish week to staff phones"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="On the team" value={String(team.length)} sub={`${added.length ? `${added.length} added by you` : "From the staff register"}`} emphasis />
        <Stat label="In today (Thu)" value={String(team.length - offToday.length)} sub={offToday.length ? `Off: ${offToday.map((m) => m.name.split(" ")[0]).join(", ")}` : "Full house"} />
        <Stat label="Thin days" value={String(thin.filter(Boolean).length)} tone={thin.some(Boolean) ? "warn" : "good"} sub="Days with too few people" />
        <Stat label="This month's best" value={STAFF[0].name.split(" ")[0]} sub={`${inr(STAFF[0].sales, { compact: true })} billed`} />
      </div>

      {/* ── The week ── */}
      <Card>
        <SectionTitle
          title="Next week"
          right={<span className="label">M morning · E evening · O off</span>}
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="label text-left pb-2 pr-2">Person</th>
                {DAYS.map((d, i) => (
                  <th key={d} className={`label pb-2 px-1 text-center ${i >= 5 ? "" : ""}`}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.name} className="border-t border-line">
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <div className="text-sm text-ink font-medium flex items-center gap-1.5">
                      {m.name}
                      {m.added && <Chip tone="brand">new</Chip>}
                    </div>
                    <div className="text-2xs text-muted">{m.role}</div>
                  </td>
                  {DAYS.map((_, d) => {
                    const s = week[m.name]?.[d] ?? "O";
                    return (
                      <td key={d} className="px-1 py-1.5 text-center">
                        <button
                          data-shift-cell
                          onClick={() => cycle(m.name, d)}
                          title={`${m.name} · ${DAYS[d]} · ${SHIFT_LABEL[s]}, tap to change`}
                          className="w-11 h-10 border border-line font-semibold text-sm transition-transform hover:scale-105"
                          style={{ background: SHIFT_BG[s], color: SHIFT_FG[s] }}
                        >
                          {s}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-line">
                <td className="py-2 pr-2 label">People in</td>
                {coverage.map((c, d) => (
                  <td key={d} className="px-1 py-2 text-center">
                    <span
                      className="inline-flex items-center gap-1 text-xs num font-semibold"
                      style={{ color: thin[d] ? "var(--status-critical)" : "var(--status-good)" }}
                    >
                      {thin[d] && <StatusDot tone="critical" />}
                      {c}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {thin.some(Boolean) && (
          <div className="mt-2 text-xs" style={{ color: "var(--status-critical)" }}>
            {DAYS.filter((_, d) => thin[d]).join(", ")} look thin, weekends need at least 5 people in, weekdays 4.
          </div>
        )}
      </Card>

      {/* ── Leave requests ── */}
      <Card>
        <SectionTitle title="Leave requests" right={<Chip tone={app.leaves.some((l) => l.status === "pending") ? "warn" : "good"}>{app.leaves.filter((l) => l.status === "pending").length} waiting</Chip>} />
        {app.leaves.length === 0 ? (
          <div className="text-xs text-muted py-2">No requests. Staff ask from their My Shift screen.</div>
        ) : (
          <div className="space-y-1.5">
            {app.leaves.map((l) => (
              <div key={l.id} className="flex items-center gap-3 border border-line px-3 py-2.5 flex-wrap" data-leave-row>
                <StatusDot tone={l.status === "approved" ? "good" : l.status === "declined" ? "critical" : "warn"} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink font-medium">{l.who}</div>
                  <div className="text-2xs text-muted">{l.date} · {l.reason}</div>
                </div>
                {l.status === "pending" ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      data-leave-approve
                      className="btn-primary !py-1.5 !text-xs"
                      onClick={() => {
                        app.dispatch({ type: "leave:decide", id: l.id, status: "approved", by: app.actorName });
                        app.toastNow(`${l.who}'s leave approved, the shift grid needs one change for ${l.date.split(" ")[0]}`, "good");
                      }}
                    >
                      Approve
                    </button>
                    <button
                      className="btn !py-1.5 !text-xs"
                      onClick={() => {
                        app.dispatch({ type: "leave:decide", id: l.id, status: "declined", by: app.actorName });
                        app.toastNow(`${l.who}'s leave declined, tell them why in person`, "warn");
                      }}
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <Chip tone={l.status === "approved" ? "good" : "critical"}>{l.status}</Chip>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Who can do what ── */}
      <Card>
        <SectionTitle title="What each person can do" right={<Chip>{app.users.length} people</Chip>} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="label text-left pb-2 pr-2">Person</th>
                <th className="label pb-2 px-2">PIN</th>
                {ALL_PERMISSIONS.map((p) => (
                  <th key={p.id} className="label pb-2 px-2 text-center">{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {app.users.map((u) => (
                <tr key={u.name} className="border-t border-line" data-user-row>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <div className="text-sm text-ink font-medium">{u.name}</div>
                    <div className="text-2xs text-muted">{u.role}</div>
                  </td>
                  <td className="px-2 text-center">
                    <span className="num text-xs text-ink2">{u.name === app.actorName ? u.pin : "••••"}</span>
                  </td>
                  {ALL_PERMISSIONS.map((p) => {
                    const has = u.permissions.includes(p.id);
                    const isManager = u.role === "Store Manager";
                    return (
                      <td key={p.id} className="px-2 py-1.5 text-center">
                        <button
                          data-perm
                          disabled={isManager}
                          onClick={() => {
                            const next = has ? u.permissions.filter((x) => x !== p.id) : [...u.permissions, p.id];
                            app.dispatch({ type: "user:permissions", name: u.name, permissions: next });
                            app.toastNow(`${u.name}: ${p.label} ${has ? "turned off" : "turned on"}`, has ? "warn" : "good");
                          }}
                          className="w-9 h-9 border border-line grid place-items-center"
                          style={{
                            background: has ? "var(--ok-soft)" : "var(--plane)",
                            color: has ? "var(--status-good)" : "var(--text-muted)",
                            opacity: isManager ? 0.5 : 1,
                          }}
                          title={isManager ? "The manager always has every permission" : `Tap to ${has ? "remove" : "give"} ${p.label.toLowerCase()}`}
                        >
                          {has ? "✓" : "–"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Add a person ── */}
      <Card>
        <SectionTitle title="Add someone to the team" />
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="flex-1 min-w-[180px]">
            <label className="label block mb-1">Full name</label>
            <input
              data-staff-name
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPerson()}
              placeholder="e.g. Priya Nair"
              className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
            />
          </div>
          <div>
            <label className="label block mb-1">Works as</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-line bg-raised px-3 py-2.5 text-sm text-ink">
              {ROLES_ON_FLOOR.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Sign-in PIN</label>
            <input
              data-staff-pin
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="4 digits"
              className="w-28 border border-line bg-raised px-3 py-2.5 text-sm num tracking-widest text-ink"
            />
          </div>
          <button data-staff-add className="btn-primary !py-2.5" onClick={addPerson}>
            + Add to team
          </button>
        </div>
        <div className="mt-3">
          <div className="label mb-1.5">What they can do</div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_PERMISSIONS.map((p) => {
              const on = perms.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setPerms((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                  className={`btn !py-1.5 !text-xs ${on ? "!border-[color:var(--brand)] !text-[color:var(--brand)]" : ""}`}
                >
                  {on ? "✓ " : ""}{p.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
