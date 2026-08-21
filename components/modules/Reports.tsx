"use client";

// Reports — store-level report pack. Numbers only, one tap to share.

import React, { useMemo, useState } from "react";
import { STORES, rng, storeById } from "@/lib/seed";
import { PLANNING_BRAND, allVitals, brandRollups, enterprise, planningStores, regionRollups, sizeSetExceptions, topSellers, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, SectionTitle, Swatch, Table, Tabs, Td, Th, inr, pct } from "@/components/ui";
import Catchment from "@/components/modules/Catchment";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

type ReportId = "dsr" | "stock" | "sizeset" | "staff";

export default function Reports() {
  const app = useApp();
  if (app.role === "planner" || app.role === "leadership") return <EstateReports />;
  return <StoreReports />;
}

// ── Estate reports — the planning/admin view ─────────────────────────────────

function EstateReports() {
  const app = useApp();
  const e = useMemo(() => enterprise(), []);
  // Planning and buying own one brand, so their report is that brand's estate.
  // Leadership keeps the cross-brand view.
  const oneBrand = app.role === "planner" || app.role === "catplan";
  const brands = useMemo(() => (oneBrand ? brandRollups().filter((b) => b.brand === PLANNING_BRAND) : brandRollups()), [oneBrand]);
  const scopeStores = useMemo(() => (oneBrand ? planningStores() : STORES), [oneBrand]);
  const regions = useMemo(() => regionRollups(), []);
  const vitals = useMemo(() => allVitals().filter((v) => scopeStores.some((st) => st.id === v.store.id)), [scopeStores]);
  const laggards = useMemo(() => [...vitals].sort((a, b) => a.achievement - b.achievement).slice(0, 5), [vitals]);

  const [tab, setTab] = useState<"estate" | "newstores">("estate");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reports</h1>
          <p className="text-sm text-ink2 mt-1">Estate level</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { id: "estate", label: "Estate" },
              { id: "newstores", label: "New stores" },
            ]}
          />
          <button className="btn-primary !py-1.5 !text-xs" onClick={() => app.toastNow(note.trim() ? "Estate pack sent to leadership, with your note" : "Estate pack sent to leadership", "good")}>Send pack</button>
        </div>
      </div>

      {tab === "newstores" && <Catchment />}
      {tab === "estate" && (
        <>

      <Card>
        <SectionTitle title="Estate DSR" />
        <Table>
          <tbody>
            <tr><Td className="text-xs text-muted">MTD sales</Td><Td align="right" className="num font-semibold text-ink">{inr(e.mtdSales, { compact: true })}</Td><Td className="text-xs text-muted">MTD target</Td><Td align="right" className="num">{inr(e.mtdTarget, { compact: true })}</Td></tr>
            <tr><Td className="text-xs text-muted">Achievement</Td><Td align="right" className="num font-semibold" style={{ color: e.mtdSales >= e.mtdTarget ? "var(--success-text)" : "var(--status-critical)" }}>{pct(e.mtdSales / Math.max(1, e.mtdTarget))}</Td><Td className="text-xs text-muted">Full-price sell-through</Td><Td align="right" className="num">{pct(e.sellThrough)}</Td></tr>
            <tr><Td className="text-xs text-muted">Markdown exposure</Td><Td align="right" className="num" style={{ color: "var(--status-critical)" }}>{inr(e.markdownExposure, { compact: true })}</Td><Td className="text-xs text-muted">Value at risk this week</Td><Td align="right" className="num" style={{ color: "var(--status-critical)" }}>{inr(e.valueAtRisk, { compact: true })}</Td></tr>
            <tr><Td className="text-xs text-muted">Fill rate</Td><Td align="right" className="num">{pct(e.fillRate)}</Td><Td className="text-xs text-muted">Broken size sets</Td><Td align="right" className="num">{e.brokenStyles}</Td></tr>
          </tbody>
        </Table>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle title="By brand" />
          <Table>
            <thead><tr><Th>Brand</Th><Th align="right">Sell-through</Th><Th align="right">Markdown exposure</Th><Th align="right">Fill</Th></tr></thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.brand}>
                  <Td className="text-sm text-ink">{b.brand}</Td>
                  <Td align="right" className="num text-xs">{pct(b.sellThrough)}</Td>
                  <Td align="right" className="num text-xs">{inr(b.markdownExposure, { compact: true })}</Td>
                  <Td align="right" className="num text-xs">{pct(b.fillRate)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <SectionTitle title="Bottom five stores — achievement" />
          <Table>
            <thead><tr><Th>Store</Th><Th align="right">Achievement</Th><Th align="right">Fill</Th><Th align="right">Size-set health</Th></tr></thead>
            <tbody>
              {laggards.map((v) => (
                <tr key={v.store.id}>
                  <Td className="text-sm text-ink">{v.store.name}</Td>
                  <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{pct(v.achievement)}</Td>
                  <Td align="right" className="num text-xs">{pct(v.fillRate)}</Td>
                  <Td align="right" className="num text-xs">{pct(v.sizeSetScore)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-2 text-2xs text-muted">By region: {regions.map((r) => `${r.region} ${pct(r.sellThrough)}`).join(" · ")}</div>
        </Card>
      </div>

      {/* A pack goes out with a covering note, not just tables. */}
      <Card>
        <SectionTitle title="Note on the pack" right={<span className="text-2xs text-muted">Goes out with it</span>} />
        <textarea
          value={note}
          data-report-note
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What leadership should read first."
          className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink leading-relaxed placeholder:text-muted"
        />
      </Card>
        </>
      )}
    </div>
  );
}

// ── Store reports — the manager's pack ───────────────────────────────────────

function StoreReports() {
  const app = useApp();
  const store = storeById(app.storeId);
  const v = vitalsFor(app.storeId);
  const [tab, setTab] = useState<ReportId>("dsr");
  const exceptions = useMemo(() => sizeSetExceptions(app.storeId, 8), [app.storeId]);
  const sellers = useMemo(() => topSellers(app.storeId, 8), [app.storeId]);
  const r = rng(hash("rep" + app.storeId));

  function share(name: string) {
    app.toastNow(`${name} sent to HO & RO`, "good");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reports</h1>
          <p className="text-sm text-ink2 mt-1">{store.name}</p>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { id: "dsr", label: "DSR" },
            { id: "stock", label: "Stock" },
            { id: "sizeset", label: "Size sets" },
            { id: "staff", label: "Staff" },
          ]}
        />
      </div>

      {tab === "dsr" && (
        <Card>
          <SectionTitle title="Daily sales report" right={<button className="btn-primary !py-1.5 !text-xs" onClick={() => share("DSR")}>Send to HO</button>} />
          <Table>
            <tbody>
              <tr><Td className="text-xs text-muted">Sales today</Td><Td align="right" className="num font-semibold text-ink">{inr(v.todaySales)}</Td><Td className="text-xs text-muted">vs LY same day</Td><Td align="right" className="num">{inr(v.lySameDay)}</Td></tr>
              <tr><Td className="text-xs text-muted">MTD sales</Td><Td align="right" className="num font-semibold text-ink">{inr(v.mtdSales)}</Td><Td className="text-xs text-muted">MTD target to date</Td><Td align="right" className="num">{inr(v.mtdTargetToDate)}</Td></tr>
              <tr><Td className="text-xs text-muted">Achievement</Td><Td align="right" className="num font-semibold" style={{ color: v.achievement >= 1 ? "var(--success-text)" : "var(--status-critical)" }}>{pct(v.achievement)}</Td><Td className="text-xs text-muted">Footfall</Td><Td align="right" className="num">{v.footfall.toLocaleString("en-IN")}</Td></tr>
              <tr><Td className="text-xs text-muted">Bills</Td><Td align="right" className="num">{v.bills}</Td><Td className="text-xs text-muted">Conversion</Td><Td align="right" className="num">{pct(v.conversion, 1)}</Td></tr>
              <tr><Td className="text-xs text-muted">ATV</Td><Td align="right" className="num">{inr(v.atv)}</Td><Td className="text-xs text-muted">UPT</Td><Td align="right" className="num">{v.upt.toFixed(2)}</Td></tr>
              <tr><Td className="text-xs text-muted">Sellable stock</Td><Td align="right" className="num">{v.sellableUnits.toLocaleString("en-IN")} units</Td><Td className="text-xs text-muted">Fill rate</Td><Td align="right" className="num">{pct(v.fillRate)}</Td></tr>
              <tr><Td className="text-xs text-muted">Size-set exceptions</Td><Td align="right" className="num">{v.brokenStyles + v.atRiskStyles}</Td><Td className="text-xs text-muted">Value at risk</Td><Td align="right" className="num" style={{ color: "var(--status-critical)" }}>{inr(v.valueAtRisk, { compact: true })}</Td></tr>
            </tbody>
          </Table>
          <div className="mt-3 text-2xs text-muted">Auto-sent to HO &amp; RO at day close. Numbers are the same as every screen in this app.</div>
        </Card>
      )}

      {tab === "stock" && (
        <Card>
          <SectionTitle title="Stock position" right={<button className="btn-primary !py-1.5 !text-xs" onClick={() => share("Stock report")}>Send to HO</button>} />
          <Table>
            <tbody>
              <tr><Td className="text-xs text-muted">Sellable units</Td><Td align="right" className="num font-semibold text-ink">{v.sellableUnits.toLocaleString("en-IN")}</Td><Td className="text-xs text-muted">Store norm</Td><Td align="right" className="num">{v.store.norm.toLocaleString("en-IN")}</Td></tr>
              <tr><Td className="text-xs text-muted">Fill rate</Td><Td align="right" className="num font-semibold" style={{ color: v.fillRate >= 0.9 ? "var(--success-text)" : "var(--status-critical)" }}>{pct(v.fillRate)}</Td><Td className="text-xs text-muted">In transit</Td><Td align="right" className="num">{v.inTransit}</Td></tr>
              <tr><Td className="text-xs text-muted">Full-price sell-through</Td><Td align="right" className="num">{pct(v.sellThrough)}</Td><Td className="text-xs text-muted">Ageing &gt; 90 days</Td><Td align="right" className="num">{Math.round(v.sellableUnits * (0.06 + r() * 0.09)).toLocaleString("en-IN")} units</Td></tr>
            </tbody>
          </Table>
          <div className="mt-4">
            <SectionTitle title="Top sellers — true rate of sale" />
            <Table>
              <thead><tr><Th>Style</Th><Th align="right">RoS</Th><Th align="right">Sellable</Th><Th align="right">Cover</Th></tr></thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.style.id}>
                    <Td><span className="inline-flex items-center gap-2 text-xs text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span></Td>
                    <Td align="right" className="num text-xs">{s.ros.toFixed(2)}/d</Td>
                    <Td align="right" className="num text-xs">{s.sellable}</Td>
                    <Td align="right" className="num text-xs">{s.cover > 900 ? "—" : `${s.cover.toFixed(0)}d`}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {tab === "sizeset" && (
        <Card>
          <SectionTitle
            title="Size-set exceptions"
            right={
              <div className="flex items-center gap-2">
                <Chip tone={exceptions.length ? "critical" : "good"}>{exceptions.length} open</Chip>
                <button className="btn-primary !py-1.5 !text-xs" onClick={() => share("Size-set report")}>Send to HO</button>
              </div>
            }
          />
          <Table>
            <thead><tr><Th>Style</Th><Th>Status</Th><Th>Missing core</Th><Th align="right">At risk / week</Th></tr></thead>
            <tbody>
              {exceptions.map((s) => (
                <tr key={s.style.id}>
                  <Td><span className="inline-flex items-center gap-2 text-xs text-ink"><Swatch hex={s.style.colourHex} />{s.style.name}</span></Td>
                  <Td><Chip tone={s.health.status === "broken" ? "critical" : "warn"}>{s.health.status === "broken" ? "Broken" : "At risk"}</Chip></Td>
                  <Td className="text-xs text-ink2">{s.health.missingCore.join(", ") || "—"}</Td>
                  <Td align="right" className="num text-xs" style={{ color: "var(--status-critical)" }}>{inr(s.valueAtRisk, { compact: true })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "staff" && (
        <Card>
          <SectionTitle title="Staff productivity — today" right={<button className="btn-primary !py-1.5 !text-xs" onClick={() => share("Staff report")}>Send to HO</button>} />
          <Table>
            <thead><tr><Th>Staff</Th><Th>Role</Th><Th align="right">Sales</Th><Th align="right">Bills</Th><Th align="right">UPT</Th></tr></thead>
            <tbody>
              {["Rohit Sharma·SM", "Meera Pillai·ASM", "Aditya Rane·Sr.FA", "Sana Qureshi·FA", "Devansh Patil·FA", "Kiran Joshi·FA"].map((s, i) => {
                const [name, role] = s.split("·");
                const rr = rng(hash(app.storeId + name));
                const sales = Math.round((v.todaySales / 6) * (1.6 - i * 0.18) * (0.8 + rr() * 0.4) / 100) * 100;
                const billsN = Math.max(2, Math.round((v.bills / 6) * (1.5 - i * 0.15)));
                return (
                  <tr key={name}>
                    <Td className="text-sm text-ink">{name}</Td>
                    <Td className="text-xs text-ink2">{role}</Td>
                    <Td align="right" className="num text-xs">{inr(sales)}</Td>
                    <Td align="right" className="num text-xs">{billsN}</Td>
                    <Td align="right" className="num text-xs">{(1.1 + rr() * 1.1).toFixed(1)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
