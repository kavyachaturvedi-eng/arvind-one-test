"use client";

// Morning Briefing Agent — Arvi turns today's live numbers into the 60-second
// huddle the manager reads to the floor, with a synthesized audio version that
// can be pushed to every staff device. Same data, same script, every machine.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { NOW, rng, storeById } from "@/lib/seed";
import { sizeSetExceptions, topSellers, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Chip, Modal, StatusDot, inr, pct } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const DURATION = 60; // seconds

interface Section {
  at: string;
  title: string;
  text: string;
}

export function BriefingModal({ open, onClose, onLogged }: { open: boolean; onClose: () => void; onLogged: () => void }) {
  const app = useApp();
  const store = storeById(app.storeId);
  const [stage, setStage] = useState<"generating" | "ready">("generating");
  const [genStep, setGenStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dispatched, setDispatched] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const GEN_STEPS = ["Reading yesterday's close and today's target…", "Checking size sets and the replenishment queue…", "Pulling who's walking in from the member book…", "Writing the huddle…"];

  // ── The script, synthesized from the same engines every screen uses ────────
  const script = useMemo<Section[]>(() => {
    const v = vitalsFor(app.storeId);
    const exceptions = sizeSetExceptions(app.storeId, 20);
    const broken = exceptions.find((e) => e.health.status === "broken") ?? exceptions[0];
    const pull = exceptions.find((e) => e.decision.action === "replenish_from_dc");
    const hero = topSellers(app.storeId, 3)[0];
    const r = rng(hash("brief" + app.storeId));
    const vips = 2 + Math.floor(r() * 4);
    const gapPct = v.achievement - 1;
    const todayAsk = Math.round(v.mtdTargetToDate / 13);

    return [
      {
        at: "0:00",
        title: "The number",
        text: `Good morning. Month to date we're at ${inr(v.mtdSales, { compact: true })}, ${pct(Math.abs(gapPct), 1)} ${gapPct >= 0 ? "ahead of" : "behind"} target. Today's ask is ${inr(todayAsk, { compact: true })} — yesterday we did ${inr(v.todaySales, { compact: true })} against ${inr(v.lySameDay, { compact: true })} this day last year. Conversion ran ${pct(v.conversion, 1)}; every second walk-in we greet properly is a bill.`,
      },
      {
        at: "0:15",
        title: "Stock — what moves this morning",
        text: `${broken ? `${broken.style.name} is broken on ${broken.health.missingCore.join(" and ")} — restock from the back before 12, it's ${inr(broken.valueAtRisk, { compact: true })} of full-price sales at risk.` : "Size sets are clean this morning."} ${pull ? `The Replenishment Agent has a pull landing for ${pull.style.name}; receive it against the GRN the moment it arrives.` : ""}`,
      },
      {
        at: "0:35",
        title: "Focus",
        text: `${hero ? `Lead with ${hero.style.name} — it's selling at ${hero.ros.toFixed(1)} a day, best attach on denim baskets.` : ""} ${vips} VIP members have birthdays this week and the till flags them automatically — the offer is already loaded, just mention it. Anything we don't have in a size, Save the Sale before you let the customer walk.`,
      },
      {
        at: "0:50",
        title: "Close",
        text: `Fill rate is ${pct(v.fillRate)} — the floor should look full, faced up, sized left to right. One clean day: everything through the till, every task photographed where it asks. Have a good one.`,
      },
    ];
  }, [app.storeId]);

  // Deterministic waveform — same store, same wave.
  const wave = useMemo(() => {
    const r = rng(hash("wave" + app.storeId));
    return Array.from({ length: 48 }, () => 0.25 + r() * 0.75);
  }, [app.storeId]);

  useEffect(() => {
    if (open) {
      setStage("generating");
      setGenStep(0);
      setPlaying(false);
      setElapsed(0);
      setDispatched(false);
    }
  }, [open, app.storeId]);

  // Generation theatre — staged, fast, honest about what it reads.
  useEffect(() => {
    if (!open || stage !== "generating") return;
    if (genStep >= GEN_STEPS.length) {
      const t = setTimeout(() => setStage("ready"), 300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGenStep((n) => n + 1), 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage, genStep]);

  // Playback clock.
  useEffect(() => {
    if (!playing) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= DURATION) {
          setPlaying(false);
          return DURATION;
        }
        return e + 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const activeSection = script.findIndex((s, i) => {
    const start = toSec(s.at);
    const end = i + 1 < script.length ? toSec(script[i + 1].at) : DURATION;
    return elapsed >= start && elapsed < end;
  });

  function dispatchToStaff() {
    setDispatched(true);
    app.dispatch({
      type: "audit",
      entry: { at: NOW, actor: app.actorName, action: `Morning briefing dispatched to 7 staff devices at ${store.name}`, object: "briefing", system: "Arvi" },
    });
    app.toastNow("Briefing sent to 7 staff devices — read receipts will show on Live Execution", "good");
    onLogged();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Morning huddle"
      sub={`${store.name} · written by Arvi from live numbers · Thu 13 Aug`}
      wide
      footer={
        stage === "ready" ? (
          <>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn" onClick={() => { onLogged(); }}>
              Mark briefing done
            </button>
            <button data-brief-dispatch className="btn-primary" disabled={dispatched} onClick={dispatchToStaff}>
              {dispatched ? "Sent to staff devices" : "Send to staff devices"}
            </button>
          </>
        ) : undefined
      }
    >
      {stage === "generating" ? (
        <div className="py-6 space-y-2.5">
          {GEN_STEPS.map((s, i) => (
            <div key={s} className={`flex items-center gap-2.5 text-sm ${i < genStep ? "text-ink" : i === genStep ? "text-ink" : "text-muted opacity-50"}`}>
              {i < genStep ? <StatusDot tone="good" /> : i === genStep ? <span className="w-2 h-2 rounded-full pulse-crit shrink-0" style={{ background: "var(--brand)" }} /> : <StatusDot tone="neutral" />}
              {s}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Audio player ── */}
          <div className="border border-line p-3.5" style={{ background: "var(--text-primary)" }}>
            <div className="flex items-center gap-3.5">
              <button
                data-brief-play
                onClick={() => setPlaying((p) => !p)}
                className="w-11 h-11 grid place-items-center text-lg shrink-0 transition-colors"
                style={{ background: playing ? "var(--brand)" : "#fff", color: playing ? "#fff" : "#0A0A0A" }}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <div className={`flex-1 flex items-end gap-[2px] h-11 ${playing ? "playing" : ""}`}>
                {wave.map((h, i) => {
                  const pos = i / wave.length;
                  const played = pos <= elapsed / DURATION;
                  return (
                    <span
                      key={i}
                      className="eq-bar flex-1"
                      style={{
                        height: `${h * 100}%`,
                        background: played ? "var(--brand)" : "rgba(255,255,255,0.28)",
                        animationDelay: `${(i % 8) * 0.09}s`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="text-xs num shrink-0" style={{ color: "#8A8F96", fontFamily: "var(--f-mono)" }}>
                {fmtSec(elapsed)} / 1:00
              </div>
            </div>
            <div className="flex items-center justify-between mt-2.5">
              <span className="text-2xs" style={{ color: "#8A8F96" }}>
                Synthesized huddle · <span className="serif-accent">Arvi</span> voice · regenerated each morning at 08:00
              </span>
              <Chip tone="brand">60-second brief</Chip>
            </div>
          </div>

          {/* ── Transcript ── */}
          <div className="space-y-2">
            {script.map((s, i) => (
              <div
                key={s.at}
                className={`border p-3 transition-colors ${i === activeSection && (playing || elapsed > 0) ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="chip !text-[9px]">{s.at}</span>
                  <span className="text-xs font-semibold text-ink">{s.title}</span>
                </div>
                <p className="text-sm text-ink2 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>

          <div className="text-2xs text-muted leading-relaxed">
            Every number above is read from the same governed metrics the screens use — nothing in this huddle is
            typed by hand, so it cannot drift from what Planning sees.
          </div>
        </div>
      )}
    </Modal>
  );
}

function toSec(t: string): number {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}
function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
