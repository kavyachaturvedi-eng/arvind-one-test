"use client";

// Customers — the two things the floor actually does, fast, without holding
// up the billing queue: check a member's points, and add a new member.
// Campaigns and offers are run by the national marketing team, not the store.

import React, { useEffect, useMemo, useState } from "react";
import { NOW, STYLES, rng, storeById } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { BarChart, Card, Chip, Empty, Modal, SectionTitle, Stat, StatusDot, Table, Tabs, Td, Th, inr, pct } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const FIRST = ["Ananya", "Vikram", "Priya", "Rahul", "Sneha", "Arjun", "Divya", "Karan", "Pooja", "Nikhil", "Ishita", "Rohan"];
const LAST = ["Mehta", "Iyer", "Kapoor", "Desai", "Nair", "Malhotra", "Reddy", "Bose", "Chopra", "Kulkarni", "Sinha", "Verma"];

/** One point is worth 25 paise at the till. */
const POINT_VALUE = 0.25;

interface Customer {
  name: string;
  phone: string;
  tier: "Platinum" | "Gold" | "Silver";
  points: number;
  expiring: number;
  spend12m: number;
  visits12m: number;
  lastVisitDays: number;
}

function buildCustomers(storeId: string): Customer[] {
  const r = rng(hash("crm" + storeId));
  const out: Customer[] = [];
  for (let i = 0; i < 8; i++) {
    const tier = r() < 0.2 ? "Platinum" : r() < 0.55 ? "Gold" : "Silver";
    const points = 200 + Math.floor(r() * 4200);
    out.push({
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      phone: `98${String(10000000 + Math.floor(r() * 89999999)).slice(0, 8)}`,
      tier,
      points,
      expiring: r() < 0.4 ? Math.floor(points * (0.1 + r() * 0.3)) : 0,
      spend12m: Math.round((14000 + r() * 160000) / 100) * 100,
      visits12m: 2 + Math.floor(r() * 14),
      lastVisitDays: 4 + Math.floor(r() * 130),
    });
  }
  return out.sort((a, b) => b.spend12m - a.spend12m);
}

/** Any 10-digit number resolves deterministically, member or not. */
function lookupByPhone(phone: string, storeId: string, known: Customer[]): Customer | null {
  const exact = known.find((c) => c.phone === phone);
  if (exact) return exact;
  const h = hash("mem" + phone);
  if (h % 4 === 0) return null; // not a member
  const r = rng(h);
  const tier = r() < 0.2 ? "Platinum" : r() < 0.55 ? "Gold" : "Silver";
  const points = 150 + Math.floor(r() * 3800);
  return {
    name: `${FIRST[h % FIRST.length]} ${LAST[(h >> 3) % LAST.length]}`,
    phone,
    tier,
    points,
    expiring: r() < 0.4 ? Math.floor(points * (0.1 + r() * 0.3)) : 0,
    spend12m: Math.round((9000 + r() * 120000) / 100) * 100,
    visits12m: 1 + Math.floor(r() * 12),
    lastVisitDays: 3 + Math.floor(r() * 140),
  };
}

type TabId = "points" | "enrol";

export default function Crm() {
  const app = useApp();
  const store = storeById(app.storeId);
  const customers = useMemo(() => buildCustomers(app.storeId), [app.storeId]);
  const [tab, setTab] = useState<TabId>(app.focus === "enrol" ? "enrol" : "points");
  const [phone, setPhone] = useState("");
  const [looked, setLooked] = useState<{ phone: string; member: Customer | null } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [added, setAdded] = useState(0);
  const [profile, setProfile] = useState<Customer | null>(null);

  useEffect(() => {
    if (app.focus === "enrol") setTab("enrol");
    else if (app.focus === "points") setTab("points");
  }, [app.focus]);

  const r = rng(hash("crmk" + app.storeId));
  const captureRate = 0.62 + r() * 0.3;
  const repeatShare = 0.24 + r() * 0.22;
  const members = 1800 + Math.floor(r() * 5200);
  const newToday = 2 + Math.floor(r() * 9);

  const tierMix = [
    { label: "Platinum", value: Math.round(members * 0.06) },
    { label: "Gold", value: Math.round(members * 0.27) },
    { label: "Silver", value: Math.round(members * 0.67) },
  ];

  function check(p?: string) {
    const q = (p ?? phone).replace(/[^\d]/g, "");
    if (q.length !== 10) return;
    setPhone(q);
    setLooked({ phone: q, member: lookupByPhone(q, app.storeId, customers) });
  }

  function addMember() {
    if (!newName.trim() || newPhone.length !== 10) return;
    setAdded((n) => n + 1);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `New loyalty member enrolled: ${newName.trim()}`, object: newPhone, system: "Arvind One" },
    });
    app.toastNow(`${newName.trim()} added, welcome message sent by SMS`, "good");
    setNewName("");
    setNewPhone("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Customers</h1>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { id: "points", label: "Check points" },
            { id: "enrol", label: "Add a member" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Capture rate today" value={pct(captureRate)} tone={captureRate >= 0.8 ? "good" : "warn"} sub="Bills with a member attached" emphasis />
        <Stat label="Members" value={(members + added).toLocaleString("en-IN")} sub={`+${newToday + added} new today`} />
        <Stat label="Repeat share" value={pct(repeatShare)} sub="Of this month's bills" />
        <Stat label="New this session" value={String(added)} tone={added > 0 ? "good" : undefined} sub="Added by you" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {tab === "points" ? (
            <Card>
              <SectionTitle title="Check a member's points" />
              <div className="flex gap-2 max-w-md">
                <input
                  data-points-phone
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                  onKeyDown={(e) => e.key === "Enter" && check()}
                  inputMode="numeric"
                  placeholder="Customer's mobile. 10 digits"
                  className="flex-1 rounded-lg border border-line bg-raised px-3 py-3 text-base num"
                />
                <button data-points-check className="btn-primary !px-5" disabled={phone.length !== 10} onClick={() => check()}>
                  Check
                </button>
              </div>

              {looked && (
                <div className="mt-4" data-points-result>
                  {looked.member ? (
                    <div className="border p-4" style={{ borderColor: "var(--brand)" }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-base font-semibold text-ink">{looked.member.name}</div>
                          <div className="text-2xs text-muted num mt-0.5">{looked.member.phone} · <Chip tone={looked.member.tier === "Platinum" ? "brand" : "neutral"}>{looked.member.tier}</Chip></div>
                        </div>
                        <button className="btn !py-1.5 !text-xs" onClick={() => setProfile(looked.member)}>Full profile</button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                        <div className="border border-line p-3">
                          <div className="text-2xl font-semibold num text-ink">{looked.member.points.toLocaleString("en-IN")}</div>
                          <div className="text-2xs text-muted mt-0.5">points</div>
                        </div>
                        <div className="border border-line p-3">
                          <div className="text-2xl font-semibold num" style={{ color: "var(--status-good)" }}>{inr(Math.round(looked.member.points * POINT_VALUE))}</div>
                          <div className="text-2xs text-muted mt-0.5">worth at billing</div>
                        </div>
                        <div className="border border-line p-3">
                          <div className="text-2xl font-semibold num" style={{ color: looked.member.expiring ? "var(--status-warning)" : "var(--text-primary)" }}>
                            {looked.member.expiring.toLocaleString("en-IN")}
                          </div>
                          <div className="text-2xs text-muted mt-0.5">expiring this month</div>
                        </div>
                      </div>
                      <button className="btn-primary w-full mt-3 !py-2.5" onClick={() => app.go("pos")}>
                        Use points on a bill
                      </button>
                    </div>
                  ) : (
                    <div className="border border-line p-4">
                      <div className="text-sm font-medium text-ink">Not a member yet</div>
                      <div className="text-xs text-ink2 mt-1">No membership on {looked.phone}. Add them in ten seconds, the welcome message goes out by SMS.</div>
                      <button
                        className="btn-primary mt-3"
                        onClick={() => {
                          setNewPhone(looked.phone);
                          setTab("enrol");
                        }}
                      >
                        Add as a member
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5">
                <div className="label mb-2">Members in the store recently</div>
                <Table>
                  <thead>
                    <tr><Th>Member</Th><Th align="right">Points</Th><Th align="right">Expiring</Th><Th align="right">Last visit</Th><Th align="right" /></tr>
                  </thead>
                  <tbody>
                    {customers.slice(0, 6).map((c) => (
                      <tr key={c.phone}>
                        <Td>
                          <button className="text-left" onClick={() => setProfile(c)}>
                            <div className="text-sm text-ink underline decoration-dotted underline-offset-2">{c.name}</div>
                            <div className="text-2xs text-muted num">{c.phone}</div>
                          </button>
                        </Td>
                        <Td align="right" className="num text-sm font-semibold text-ink">{c.points.toLocaleString("en-IN")}</Td>
                        <Td align="right" className="num text-xs" style={{ color: c.expiring ? "var(--status-warning)" : "var(--text-muted)" }}>
                          {c.expiring || "—"}
                        </Td>
                        <Td align="right" className="num text-xs">{c.lastVisitDays}d ago</Td>
                        <Td align="right">
                          <button className="btn !py-1 !text-2xs" onClick={() => { setPhone(c.phone); check(c.phone); }}>Check</button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          ) : (
            <Card>
              <SectionTitle title="Add a member" />
              <div className="max-w-sm space-y-2.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Customer name"
                  className="w-full rounded-lg border border-line bg-raised px-3 py-3 text-base"
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                  placeholder="Mobile. 10 digits"
                  className="w-full rounded-lg border border-line bg-raised px-3 py-3 text-base num"
                />
                <button className="btn-primary w-full !py-3" disabled={!newName.trim() || newPhone.length !== 10} onClick={addMember}>
                  Add member
                </button>
                {added > 0 && (
                  <div className="text-xs text-ink2 flex items-center gap-1.5"><StatusDot tone="good" />{added} added this session</div>
                )}
                <div className="text-2xs text-muted leading-relaxed pt-1">
                  Offers and campaigns go out from the national marketing team, the store never has to write one.
                </div>
              </div>
            </Card>
          )}
        </div>

        <Card>
          <SectionTitle title="Member base" />
          <BarChart data={tierMix} format={(n) => n.toLocaleString("en-IN")} />
          <div className="mt-4 pt-3 border-t border-line space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted">Member bill vs walk-in bill</span><span className="num font-semibold text-ink">1.4×</span></div>
            <div className="flex justify-between"><span className="text-muted">Points used, last 90 days</span><span className="num font-semibold text-ink">{pct(0.18 + r() * 0.2)}</span></div>
          </div>
        </Card>
      </div>

      {profile && <Customer360 c={profile} onClose={() => setProfile(null)} onBill={() => { setProfile(null); app.go("pos"); }} />}
    </div>
  );
}

// ── Customer 360 — one profile: history, sizes, value ────────────────────────

function Customer360({ c, onClose, onBill }: { c: Customer; onClose: () => void; onBill: () => void }) {
  const r = rng(hash("c360" + c.phone));
  const historyCount = 3 + Math.floor(r() * 3);
  const history = Array.from({ length: historyCount }, (_, i) => {
    const style = STYLES[Math.floor(r() * STYLES.length)];
    return {
      when: `${1 + Math.floor(r() * 11)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"][Math.floor(r() * 7)]}`,
      style: style.name,
      size: style.sizes[Math.floor(r() * style.sizes.length)],
      value: style.mrp,
      key: `${i}`,
    };
  });
  const favSize = history[0]?.size ?? "M";
  const favCat = STYLES[Math.floor(r() * STYLES.length)].category;

  return (
    <Modal open onClose={onClose} title={c.name} sub={`${c.phone} · ${c.tier} · member`} footer={
      <>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn-primary" onClick={onBill}>Use points on a bill</button>
      </>
    }>
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="rounded-lg border border-line p-2.5"><div className="text-lg font-semibold num text-ink">{inr(c.spend12m, { compact: true })}</div><div className="text-2xs text-muted">12-m spend</div></div>
          <div className="rounded-lg border border-line p-2.5"><div className="text-lg font-semibold num text-ink">{c.visits12m}</div><div className="text-2xs text-muted">visits</div></div>
          <div className="rounded-lg border border-line p-2.5"><div className="text-lg font-semibold num text-ink">{c.points.toLocaleString("en-IN")}</div><div className="text-2xs text-muted">points</div></div>
          <div className="rounded-lg border border-line p-2.5"><div className="text-lg font-semibold num text-ink">{c.lastVisitDays}d</div><div className="text-2xs text-muted">since last visit</div></div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="label">Prefers</span>
          <Chip>size {favSize}</Chip>
          <Chip>{favCat}</Chip>
          {c.expiring > 0 && <Chip tone="warn">{c.expiring} points expiring</Chip>}
        </div>

        <div>
          <div className="label mb-1.5">Purchase history</div>
          <Table>
            <thead><tr><Th>When</Th><Th>Item</Th><Th>Size</Th><Th align="right">Value</Th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.key}>
                  <Td className="text-2xs text-muted num whitespace-nowrap">{h.when}</Td>
                  <Td className="text-xs text-ink">{h.style}</Td>
                  <Td className="text-xs text-ink2">{h.size}</Td>
                  <Td align="right" className="num text-xs">{inr(h.value)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </Modal>
  );
}
