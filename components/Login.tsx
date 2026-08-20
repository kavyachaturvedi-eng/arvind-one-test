"use client";

// Sign-in — the front door. Pick who you are; the app shapes itself around you.

import React, { useState } from "react";
import { ROLES, STORES } from "@/lib/seed";
import { useApp } from "@/lib/state";
import type { RoleId } from "@/lib/types";

const ORDER: RoleId[] = ["staff", "store", "planner", "catplan", "leadership"];

const DESC: Record<RoleId, string> = {
  store: "Run the store: operations plus insights",
  staff: "The till and the floor: bill, pack, receive",
  planner: "The control tower: every store, live",
  catplan: "The season: buy, depth, OTB",
  leadership: "The business on one screen",
};

export default function Login() {
  const app = useApp();
  const [role, setRole] = useState<RoleId>("staff");
  const [storeId, setStoreId] = useState(STORES[0].id);
  const storeSide = role === "store" || role === "staff";

  // Store logins are per person: pick the name, then key the PIN.
  const people = app.users.filter((u) => (role === "store" ? u.role === "Store Manager" : u.role !== "Store Manager"));
  const [who, setWho] = useState(people[0]?.name ?? "");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const person = app.users.find((u) => u.name === (people.some((p) => p.name === who) ? who : people[0]?.name));

  function submit() {
    if (!storeSide) {
      app.dispatch({ type: "login", role });
      return;
    }
    if (!person || pin !== person.pin) {
      setPinError(true);
      return;
    }
    app.dispatch({ type: "login", role, storeId, userName: person.name });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]" style={{ background: "var(--plane)" }}>
      {/* Editorial brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-14" style={{ background: "var(--text-primary)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 grid place-items-center font-medium text-ink" style={{ background: "#fff" }}>1</div>
          <div className="label" style={{ color: "#8A8F96" }}>Arvind One · Retail operations</div>
        </div>
        <div>
          <h1 className="text-[52px] leading-[1.05] font-medium text-white" style={{ letterSpacing: "-0.025em" }}>
            The store&apos;s work<br />
            <span className="serif-accent">is</span> the data.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed" style={{ color: "#8A8F96" }}>
            Bill, receive, pack and close in one place. Everything above the store — planning, insights, the
            executive view — is the live result of that work. Nothing is reported twice.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <span className="label" style={{ color: "#8A8F96" }}>24 stores</span>
          <span className="label" style={{ color: "#8A8F96" }}>5 brands</span>
          <span className="label" style={{ color: "#8A8F96" }}>One system</span>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 grid place-items-center text-white font-medium" style={{ background: "var(--text-primary)" }}>1</div>
            <div className="text-[15px] font-medium text-ink tracking-tight">Arvind <span className="serif-accent">One</span></div>
          </div>

          <div className="label mb-2">Sign in</div>
          <h2 className="text-xl font-medium text-ink mb-6">Who are you today?</h2>

          <div className="space-y-2">
            {ORDER.map((id) => {
              const r = ROLES.find((x) => x.id === id)!;
              const active = role === id;
              return (
                <button
                  key={id}
                  data-role={id}
                  onClick={() => setRole(id)}
                  className={`w-full text-left border p-3.5 flex items-center gap-3 transition-colors ${
                    active ? "border-[color:var(--brand)] bg-raised" : "border-line bg-raised hover:border-[color:var(--baseline)]"
                  }`}
                >
                  <span
                    className="w-9 h-9 grid place-items-center text-2xs font-semibold shrink-0"
                    style={{ background: active ? "var(--brand)" : "var(--plane)", color: active ? "#fff" : "var(--text-secondary)", fontFamily: "var(--f-mono)" }}
                  >
                    {r.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{r.label}</span>
                    <span className="block text-2xs text-muted mt-0.5">{DESC[id]}</span>
                  </span>
                  <span className="ml-auto w-4 h-4 border shrink-0 grid place-items-center" style={{ borderColor: active ? "var(--brand)" : "var(--line)" }}>
                    {active && <span className="w-2 h-2 block" style={{ background: "var(--brand)" }} />}
                  </span>
                </button>
              );
            })}
          </div>

          {storeSide && (
            <>
              <div className="mt-4">
                <div className="label mb-1.5">Store</div>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink"
                >
                  {STORES.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {s.brand} · {s.city}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3">
                <div className="label mb-1.5">Who is signing in</div>
                <select
                  data-who
                  value={person?.name ?? ""}
                  onChange={(e) => { setWho(e.target.value); setPin(""); setPinError(false); }}
                  className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink"
                >
                  {people.map((p) => (
                    <option key={p.name} value={p.name}>{p.name} · {p.role}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3">
                <div className="label mb-1.5">PIN</div>
                <input
                  data-pin
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 4)); setPinError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  inputMode="numeric"
                  type="password"
                  placeholder="4 digits"
                  className="w-full border border-line bg-raised px-3 py-3 text-lg num tracking-[0.4em] text-ink"
                  style={{ borderColor: pinError ? "var(--status-critical)" : undefined }}
                />
                {pinError && (
                  <div className="text-2xs mt-1.5" style={{ color: "var(--status-critical)" }}>
                    Wrong PIN. Ask your manager to reset it.
                  </div>
                )}
              </div>
            </>
          )}

          <button data-signin className="btn-primary w-full mt-5 !py-3" onClick={submit}>
            {storeSide ? "Sign in" : `Enter ${ROLES.find((r) => r.id === role)!.label} view`}
          </button>

          <div className="mt-6 text-2xs text-muted leading-relaxed">
            Demo PINs: manager 1234, cashiers 1111 and 3333, floor 2222 and 4444, omni 5555.
          </div>
        </div>
      </div>
    </div>
  );
}
