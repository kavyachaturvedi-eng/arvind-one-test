"use client";

// VM Task Auditor — photo close-out with Arvi Vision.
// The associate captures the window/floor photo; a vision pass checks it
// against the HQ creative guideline and, when compliant, closes the SLA on
// the spot instead of waiting days for a human at HO to open an email.
// Deterministic: the same task always produces the same photo and score.

import React, { useEffect, useMemo, useState } from "react";
import { rng } from "@/lib/seed";
import { Chip, Modal, StatusDot } from "@/components/ui";

const hash = (s: string) => { let h = 11; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

interface CheckDef {
  name: string;
  detail: string;
}

const CHECKS: CheckDef[] = [
  { name: "Mannequin styling & posture", detail: "Pose set 24B, left-facing, styled per kit" },
  { name: "Brand banner placement", detail: "Header band centred, no obstruction" },
  { name: "Price tag visibility", detail: "Revised tags present and legible on featured styles" },
  { name: "Lighting & glass", detail: "Window lit, glass clean, no glare on creative" },
];

type Stage = "capture" | "scanning" | "result";

export function VmAuditModal({
  open,
  taskId,
  taskTitle,
  onClose,
  onApproved,
}: {
  open: boolean;
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onApproved: (score: number) => void;
}) {
  const [stage, setStage] = useState<Stage>("capture");
  const [revealed, setRevealed] = useState(0);

  // Deterministic per task: same photo, same confidences, same verdict.
  const seed = hash("vm" + taskId);
  const scores = useMemo(() => {
    const r = rng(seed);
    return CHECKS.map(() => 92 + Math.floor(r() * 7)); // 92–98 per check
  }, [seed]);
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  useEffect(() => {
    if (open) {
      setStage("capture");
      setRevealed(0);
    }
  }, [open, taskId]);

  // The scan reveals one check at a time, then lands on the verdict.
  useEffect(() => {
    if (stage !== "scanning") return;
    if (revealed >= CHECKS.length) {
      const t = setTimeout(() => setStage("result"), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed((n) => n + 1), 520);
    return () => clearTimeout(t);
  }, [stage, revealed]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close with photo"
      sub={`${taskId} · ${taskTitle}`}
      footer={
        stage === "result" ? (
          <>
            <button className="btn" onClick={() => { setStage("capture"); setRevealed(0); }}>Retake</button>
            <button data-vm-close className="btn-primary" onClick={() => onApproved(overall)}>
              Close task · SLA resolved
            </button>
          </>
        ) : stage === "capture" ? (
          <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button data-vm-capture className="btn-primary" onClick={() => { setRevealed(0); setStage("scanning"); }}>
              ◉ Capture photo
            </button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {/* Viewfinder / captured frame */}
        <div className="relative border border-line overflow-hidden" style={{ background: "#101012" }}>
          <WindowPhoto seed={seed} />
          {stage === "capture" && (
            <>
              {/* Framing guides */}
              <div className="absolute inset-3 border border-white/25 pointer-events-none" />
              <div className="absolute top-3 left-3 px-1.5 py-0.5 text-2xs text-white/80" style={{ fontFamily: "var(--f-mono)" }}>
                REC · floor tablet camera
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-2xs text-white/70" style={{ fontFamily: "var(--f-mono)" }}>
                <span>Frame the full window, tags visible</span>
                <span>kit 24B</span>
              </div>
            </>
          )}
          {stage === "scanning" && <div className="scanline" />}
          {stage === "result" && (
            <div className="absolute top-3 right-3">
              <Chip tone="good" icon={<StatusDot tone="good" />}>Evidence archived</Chip>
            </div>
          )}
        </div>

        {/* Inspector panel */}
        {stage === "capture" && (
          <div className="text-xs text-ink2 leading-relaxed">
            Arvi Vision checks the photo against the HQ creative guideline the moment it is captured — mannequin
            styling, banner placement, price tags, lighting. A compliant photo closes the task and the HQ SLA
            immediately; nobody at head office has to open an email.
          </div>
        )}

        {(stage === "scanning" || stage === "result") && (
          <div className="border border-line">
            <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-[color:var(--plane)]">
              <span className="label">Arvi Vision · guideline check</span>
              {stage === "scanning" ? (
                <span className="text-2xs text-muted">analysing frame…</span>
              ) : (
                <Chip tone="good">{overall}% VM compliance</Chip>
              )}
            </div>
            <div>
              {CHECKS.map((c, i) => {
                const done = stage === "result" || i < revealed;
                const active = stage === "scanning" && i === revealed;
                return (
                  <div key={c.name} className={`flex items-center gap-3 px-3 py-2 border-b border-line last:border-b-0 ${done ? "" : "opacity-45"}`}>
                    {done ? <StatusDot tone="good" /> : active ? <span className="w-2 h-2 rounded-full pulse-crit" style={{ background: "var(--brand)" }} /> : <StatusDot tone="neutral" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-ink">{c.name}</div>
                      <div className="text-2xs text-muted">{c.detail}</div>
                    </div>
                    <span className="text-xs num font-semibold shrink-0" style={{ color: done ? "var(--status-good)" : "var(--text-muted)" }}>
                      {done ? `${scores[i]}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {stage === "result" && (
          <div className="border-l-2 pl-3 py-1" style={{ borderColor: "var(--status-good)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--status-good)" }} data-vm-verdict>
              {overall}% VM compliance — auto-approved
            </div>
            <div className="text-2xs text-ink2 mt-0.5 leading-relaxed">
              The photo meets guideline kit 24B. Closing the task resolves the HQ SLA now and files the photo and
              this score against the task record — auditable later, invisible work removed today.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// A deterministic "photo": a stylised storefront window rendered from the task
// seed, so every machine shows the same capture for the same task.
function WindowPhoto({ seed }: { seed: number }) {
  const r = rng(seed);
  const mannequins = [0, 1, 2].map((i) => ({
    x: 18 + i * 26 + r() * 6,
    h: 46 + r() * 10,
    tone: 0.75 + r() * 0.2,
  }));
  const tagXs = [0, 1, 2].map((i) => 22 + i * 26 + r() * 4);
  return (
    <svg viewBox="0 0 100 62" width="100%" style={{ display: "block" }} aria-label="Captured window display photo">
      <rect width="100" height="62" fill="#141416" />
      {/* Back wall + floor */}
      <rect x="4" y="10" width="92" height="44" fill="#1d1e21" />
      <rect x="4" y="50" width="92" height="4" fill="#2a2b2f" />
      {/* Brand banner */}
      <rect x="26" y="4" width="48" height="7" fill="#f5f4f0" />
      <text x="50" y="9.2" textAnchor="middle" fontSize="4.2" fontFamily="monospace" fill="#0A0A0A" letterSpacing="1.4">
        END OF SEASON
      </text>
      {/* Spotlights */}
      {mannequins.map((m, i) => (
        <polygon key={`l${i}`} points={`${m.x + 4},12 ${m.x - 6},50 ${m.x + 14},50`} fill="#ffffff" opacity="0.05" />
      ))}
      {/* Mannequins */}
      {mannequins.map((m, i) => (
        <g key={i} opacity={m.tone}>
          <circle cx={m.x + 4} cy={52 - m.h} r="2.6" fill="#c9c6bf" />
          <rect x={m.x} y={54 - m.h} width="8" height={m.h - 10} fill="#c9c6bf" rx="0" />
          <rect x={m.x + 2.4} y={50 - m.h * 0.45} width="3.2" height={m.h * 0.35} fill="#8f8d88" />
        </g>
      ))}
      {/* Price tags */}
      {tagXs.map((x, i) => (
        <g key={`t${i}`}>
          <rect x={x} y={46} width="7" height="4" fill="#f5f4f0" />
          <rect x={x + 1} y={47.2} width="5" height="0.7" fill="#6b6b6b" />
          <rect x={x + 1} y={48.4} width="3.4" height="0.7" fill="#9a9a9a" />
        </g>
      ))}
    </svg>
  );
}
