"use client";

// Morning Briefing Agent — Arvi turns today's live numbers into the 60-second
// huddle. The MANAGER generates and dispatches it; STAFF get it on their own
// screen, listen to it, and mark it heard — and the manager sees who has.
// The voice uses the device's own speech engine, so it works offline and
// says exactly what the transcript says.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { NOW, rng, storeById } from "@/lib/seed";
import { sizeSetExceptions, topSellers, vitalsFor } from "@/lib/engine";
import { useApp } from "@/lib/state";
import { Card, Chip, Modal, SectionTitle, StatusDot, inr, pct } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const DURATION = 60; // seconds
/** Staff devices at the store, beyond the person tapping. */
const STAFF_DEVICES = 7;

export interface HuddleSection {
  at: string;
  title: string;
  text: string;
}

// ── The script — one source of truth for manager, staff and the voice ────────

export function buildHuddleScript(storeId: string): HuddleSection[] {
  const v = vitalsFor(storeId);
  const exceptions = sizeSetExceptions(storeId, 20);
  const broken = exceptions.find((e) => e.health.status === "broken") ?? exceptions[0];
  const pull = exceptions.find((e) => e.decision.action === "replenish_from_dc");
  const hero = topSellers(storeId, 3)[0];
  const r = rng(hash("brief" + storeId));
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
}

// ── Voice — the device's own speech engine, no network needed ────────────────

function speakScript(script: HuddleSection[], onEnd: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(script.map((s) => s.text).join(" "));
    u.rate = 1.02;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en[-_]IN/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang));
    if (preferred) u.voice = preferred;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }
}

// ── Shared player (waveform + voice + clock) ─────────────────────────────────

function useHuddlePlayer(script: HuddleSection[]) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [voiceOk, setVoiceOk] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= DURATION) {
          setPlaying(false);
          stopSpeech();
          return DURATION;
        }
        return e + 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  // Never leave the voice running after unmount.
  useEffect(() => () => stopSpeech(), []);

  function toggle() {
    if (playing) {
      setPlaying(false);
      stopSpeech();
      return;
    }
    if (elapsed >= DURATION) setElapsed(0);
    const ok = speakScript(script, () => setPlaying(false));
    setVoiceOk(ok);
    setPlaying(true);
  }

  return { playing, elapsed, voiceOk, toggle };
}

function Waveform({ storeId, playing, elapsed }: { storeId: string; playing: boolean; elapsed: number }) {
  const wave = useMemo(() => {
    const r = rng(hash("wave" + storeId));
    return Array.from({ length: 48 }, () => 0.25 + r() * 0.75);
  }, [storeId]);
  return (
    <div className={`flex-1 flex items-end gap-[2px] h-11 ${playing ? "playing" : ""}`}>
      {wave.map((h, i) => {
        const played = i / wave.length <= elapsed / DURATION;
        return (
          <span
            key={i}
            className="eq-bar flex-1"
            style={{ height: `${h * 100}%`, background: played ? "var(--brand)" : "rgba(255,255,255,0.28)", animationDelay: `${(i % 8) * 0.09}s` }}
          />
        );
      })}
    </div>
  );
}

function Player({ script, storeId, compact }: { script: HuddleSection[]; storeId: string; compact?: boolean }) {
  const { playing, elapsed, voiceOk, toggle } = useHuddlePlayer(script);
  return (
    <div>
      <div className="border border-line p-3.5" style={{ background: "var(--text-primary)" }}>
        <div className="flex items-center gap-3.5">
          <button
            data-brief-play
            onClick={toggle}
            className="w-11 h-11 grid place-items-center text-lg shrink-0 transition-colors"
            style={{ background: playing ? "var(--brand)" : "#fff", color: playing ? "#fff" : "#0A0A0A" }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <Waveform storeId={storeId} playing={playing} elapsed={elapsed} />
          <div className="text-xs num shrink-0" style={{ color: "#8A8F96", fontFamily: "var(--f-mono)" }}>
            {fmtSec(elapsed)} / 1:00
          </div>
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-2xs" style={{ color: "#8A8F96" }}>
            {voiceOk ? (
              <>Spoken by the device · <span className="serif-accent">Arvi</span> script · same words as the text below</>
            ) : (
              "This device has no voice engine — the transcript below says exactly the same thing."
            )}
          </span>
          {!compact && <Chip tone="brand">60-second brief</Chip>}
        </div>
      </div>
      {!compact && (
        <div className="space-y-2 mt-4">
          {script.map((s, i) => {
            const start = toSec(s.at);
            const end = i + 1 < script.length ? toSec(script[i + 1].at) : DURATION;
            const active = elapsed > 0 && elapsed >= start && elapsed < end;
            return (
              <div key={s.at} className={`border p-3 transition-colors ${active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-line"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="chip !text-[9px]">{s.at}</span>
                  <span className="text-xs font-semibold text-ink">{s.title}</span>
                </div>
                <p className="text-sm text-ink2 leading-relaxed">{s.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Manager modal — generate, review, dispatch ───────────────────────────────

export function BriefingModal({ open, onClose, onLogged }: { open: boolean; onClose: () => void; onLogged: () => void }) {
  const app = useApp();
  const store = storeById(app.storeId);
  const [stage, setStage] = useState<"generating" | "ready">("generating");
  const [genStep, setGenStep] = useState(0);

  const GEN_STEPS = ["Reading yesterday's close and today's target…", "Checking size sets and the replenishment queue…", "Pulling who's walking in from the member book…", "Writing the huddle…"];

  const script = useMemo(() => buildHuddleScript(app.storeId), [app.storeId]);

  useEffect(() => {
    if (open) {
      setStage("generating");
      setGenStep(0);
    }
  }, [open, app.storeId]);

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

  function dispatchToStaff() {
    stopSpeech();
    app.dispatch({ type: "huddle:dispatch" });
    app.toastNow(`Huddle sent to ${STAFF_DEVICES} staff devices — each person plays it and marks it heard`, "good");
    onLogged();
  }

  return (
    <Modal
      open={open}
      onClose={() => { stopSpeech(); onClose(); }}
      title="Morning huddle"
      sub={`${store.name} · written by Arvi from live numbers · Thu 13 Aug`}
      wide
      footer={
        stage === "ready" ? (
          <>
            <button className="btn" onClick={() => { stopSpeech(); onClose(); }}>Close</button>
            <button data-brief-dispatch className="btn-primary" onClick={dispatchToStaff}>
              Send to staff devices
            </button>
          </>
        ) : undefined
      }
    >
      {stage === "generating" ? (
        <div className="py-6 space-y-2.5">
          {GEN_STEPS.map((s, i) => (
            <div key={s} className={`flex items-center gap-2.5 text-sm ${i <= genStep ? "text-ink" : "text-muted opacity-50"}`}>
              {i < genStep ? <StatusDot tone="good" /> : i === genStep ? <span className="w-2 h-2 rounded-full pulse-crit shrink-0" style={{ background: "var(--brand)" }} /> : <StatusDot tone="neutral" />}
              {s}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Player script={script} storeId={app.storeId} />
          <div className="text-2xs text-muted leading-relaxed">
            Every number above is read from the same governed metrics the screens use — nothing in this huddle is
            typed by hand, so it cannot drift from what Planning sees. Staff receive it on their Tasks screen and
            mark it heard; you&apos;ll see the count here.
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Staff card — listen and confirm ─────────────────────────────────────────

export function HuddleListenCard() {
  const app = useApp();
  const script = useMemo(() => buildHuddleScript(app.storeId), [app.storeId]);
  const heard = app.huddleHeardBy.includes(app.actorName);

  if (!app.huddleDispatched) {
    return (
      <Card>
        <SectionTitle title="Morning huddle" sub="Your manager sends today's 60-second brief here. Nothing yet." />
      </Card>
    );
  }
  return (
    <Card>
      <SectionTitle
        title="Morning huddle"
        sub="Today's brief from your manager — play it, then mark it heard."
        right={heard ? <Chip tone="good">● Heard</Chip> : <Chip tone="warn">Waiting for you</Chip>}
      />
      <Player script={script} storeId={app.storeId} compact />
      {/* Staff still get the words, for a loud floor or a quiet device. */}
      <details className="mt-2.5">
        <summary className="text-xs text-ink2 cursor-pointer">Read it instead</summary>
        <div className="mt-2 space-y-1.5">
          {script.map((s) => (
            <p key={s.at} className="text-sm text-ink2 leading-relaxed">
              <span className="font-semibold text-ink">{s.title}: </span>
              {s.text}
            </p>
          ))}
        </div>
      </details>
      {!heard && (
        <button
          data-huddle-heard
          className="btn-primary w-full mt-3 !py-2.5"
          onClick={() => {
            stopSpeech();
            app.dispatch({ type: "huddle:heard", who: app.actorName });
            app.toastNow("Marked as heard — your manager can see it", "good");
          }}
        >
          ✓ Mark as heard
        </button>
      )}
    </Card>
  );
}

/** How many of the store's staff have confirmed the huddle. */
export function huddleHeardCount(heardBy: string[]): { heard: number; total: number } {
  // Four devices confirm on their own in the demo; live confirmations add to it.
  return { heard: Math.min(STAFF_DEVICES, 4 + heardBy.length), total: STAFF_DEVICES };
}

function toSec(t: string): number {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}
function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
