"use client";

// Customers — the two things the floor actually does, fast, without holding
// up the billing queue: check a member's points, and add a new member.
// Campaigns and offers are run by the national marketing team, not the store.

import React, { useEffect, useState } from "react";
import { NOW, STYLES, rng } from "@/lib/seed";
import { useApp } from "@/lib/state";
import { BarChart, Card, Chip, Modal, SectionTitle, Stat, StatusDot, Table, Tabs, Td, Th, inr, pct } from "@/components/ui";
import { ordersForPhone } from "./BillHistory";

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

/** Any 10-digit number resolves deterministically, member or not. */
function lookupByPhone(phone: string): Customer | null {
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
  const manager = app.role === "store";
  const [tab, setTab] = useState<TabId>(app.focus === "enrol" ? "enrol" : "points");
  // Pre-filled so the demo answers in one tap. Any 10-digit number works.
  const [phone, setPhone] = useState("9812345678");
  const [looked, setLooked] = useState<{ phone: string; member: Customer | null } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [added, setAdded] = useState(0);
  const [profile, setProfile] = useState<Customer | null>(null);

  useEffect(() => {
    if (app.focus === "enrol") setTab("enrol");
    else if (app.focus === "points") setTab("points");
  }, [app.focus]);

  // Answer for the pre-filled number straight away, so the screen opens useful.
  useEffect(() => {
    setLooked((cur) => cur ?? { phone: "9812345678", member: lookupByPhone("9812345678") });
  }, []);

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
    setLooked({ phone: q, member: lookupByPhone(q) });
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
            { id: "points", label: "Loyalty" },
            { id: "enrol", label: "Add a member" },
          ]}
        />
      </div>

      {/* Programme numbers are the manager's business, not the counter's. */}
      {manager && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Capture rate today" value={pct(captureRate)} tone={captureRate >= 0.8 ? "good" : "warn"} sub="Bills with a member attached" emphasis />
          <Stat label="Members" value={(members + added).toLocaleString("en-IN")} sub={`+${newToday + added} new today`} />
          <Stat label="Repeat share" value={pct(repeatShare)} sub="Of this month's bills" />
          <Stat label="New this session" value={String(added)} tone={added > 0 ? "good" : undefined} sub="Added by you" />
        </div>
      )}

      <div className={`grid gap-4 ${manager ? "lg:grid-cols-3" : ""}`}>
        <div className={manager ? "lg:col-span-2" : ""}>
          {tab === "points" ? (
            <Card>
              <SectionTitle title="Loyalty · check a member" />
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

              {/* Their orders, with the points story per bill. Shown after a search only. */}
              {looked?.member && (
                <div className="mt-5" data-member-orders>
                  <div className="label mb-2">Their orders, last 30 days</div>
                  <Table>
                    <thead>
                      <tr><Th>When</Th><Th>Bill</Th><Th>Item</Th><Th align="right">Amount</Th><Th align="right">Points earned</Th><Th align="right">Points used</Th></tr>
                    </thead>
                    <tbody>
                      {ordersForPhone(looked.phone).map((o) => (
                        <tr key={o.id}>
                          <Td className="text-xs text-ink2 num whitespace-nowrap">{o.dateLabel}</Td>
                          <Td className="num text-xs text-ink">{o.id}</Td>
                          <Td className="text-xs text-ink">{o.items[0].qty} × {o.items[0].name} ({o.items[0].size})</Td>
                          <Td align="right" className="num text-xs font-semibold text-ink">{inr(o.total)}</Td>
                          <Td align="right" className="num text-xs" style={{ color: "var(--status-good)" }}>+{o.pointsEarned}</Td>
                          <Td align="right" className="num text-xs" style={{ color: o.pointsUsed ? "var(--status-warning)" : "var(--text-muted)" }}>
                            {o.pointsUsed ? `−${o.pointsUsed}` : "—"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <div className="text-2xs text-muted mt-2">
                    Returns and exchanges for this customer live in Bills &amp; Returns, under Sell.
                  </div>
                </div>
              )}
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

        {manager && (
          <Card>
            <SectionTitle title="Member base" />
            <BarChart data={tierMix} format={(n) => n.toLocaleString("en-IN")} />
            <div className="mt-4 pt-3 border-t border-line space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted">Member bill vs walk-in bill</span><span className="num font-semibold text-ink">1.4×</span></div>
              <div className="flex justify-between"><span className="text-muted">Points used, last 90 days</span><span className="num font-semibold text-ink">{pct(0.18 + r() * 0.2)}</span></div>
            </div>
          </Card>
        )}
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
