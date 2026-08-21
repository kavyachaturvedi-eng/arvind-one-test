"use client";

// The flag mark. Three bands — navy, white, red — in the brand's own order, so
// the app reads as Tommy at a glance without borrowing the wordmark itself.

import React from "react";

export default function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden"
      style={{ width: size, height: size, border: "1px solid var(--line)", background: "#fff" }}
      aria-hidden
    >
      <span style={{ width: "34%", background: "var(--flag-navy)" }} />
      <span style={{ width: "32%", background: "#fff" }} />
      <span style={{ width: "34%", background: "var(--flag-red)" }} />
    </span>
  );
}
