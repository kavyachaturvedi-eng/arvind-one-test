// Pre-renders every Mermaid block in the POV document into inline SVG, so the
// finished file is fully self-contained: no CDN, no JavaScript, works offline,
// behind a corporate firewall, and prints correctly.
//
//   node tests/prerender-doc.mjs <input.html> <output.html>

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const IN = process.argv[2] || "/home/claude/arvind-one-pov.html";
const OUT = process.argv[3] || "/home/claude/arvind-one-pov.html";
const MERMAID = readFileSync("node_modules/mermaid/dist/mermaid.min.js", "utf8");

let html = readFileSync(IN, "utf8");

// Pull out every <div class="mermaid">…</div> body, in order.
const blockRe = /<div class="mermaid">([\s\S]*?)<\/div>/g;
const sources = [];
let m;
while ((m = blockRe.exec(html)) !== null) sources.push(m[1]);

if (!sources.length) {
  console.error("No mermaid blocks found — nothing to do.");
  process.exit(1);
}
console.log(`Found ${sources.length} diagrams to pre-render.`);

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8">
   <style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff}</style>
   </head><body><div id="out"></div><script>${MERMAID}<\/script></body></html>`,
  { waitUntil: "domcontentloaded" }
);

await page.evaluate(() => {
  window.mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: "13px",
      primaryColor: "#e8eef7",
      primaryTextColor: "#0b0b0b",
      primaryBorderColor: "#0d366b",
      lineColor: "#898781",
      secondaryColor: "#f4f4f1",
      tertiaryColor: "#ffffff",
      clusterBkg: "#fafaf8",
      clusterBorder: "#e1e0d9",
      titleColor: "#0b0b0b",
    },
    flowchart: { curve: "basis", padding: 14, useMaxWidth: true, htmlLabels: false },
    sequence: { useMaxWidth: true, actorMargin: 60, width: 170 },
    gantt: { useMaxWidth: true, barHeight: 18, fontSize: 11, sectionFontSize: 12, leftPadding: 190 },
  });
});

const svgs = [];
for (let i = 0; i < sources.length; i++) {
  const src = decode(sources[i]).trim();
  const result = await page.evaluate(
    async ([code, id]) => {
      try {
        const { svg } = await window.mermaid.render(`d${id}`, code);
        return { ok: true, svg };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 400) };
      }
    },
    [src, i]
  );
  if (!result.ok) {
    console.error(`\n  ✗ Diagram ${i + 1} FAILED: ${result.error}`);
    console.error(`    source starts: ${src.split("\n")[0]}`);
    svgs.push(null);
  } else {
    // Let the SVG scale to the container rather than sit at a fixed width.
    const svg = result.svg
      .replace(/style="max-width:[^"]*"/g, 'style="max-width:100%;height:auto"')
      .replace(/<svg /, '<svg role="img" ');
    svgs.push(svg);
    console.log(`  ✓ Diagram ${i + 1} rendered (${(svg.length / 1024).toFixed(0)} kB)`);
  }
}

await browser.close();

const failed = svgs.filter((s) => s === null).length;
if (failed) {
  console.error(`\n${failed} diagram(s) failed. Not writing output.`);
  process.exit(1);
}

// Splice the SVGs back in, and drop the runtime script tag entirely.
let idx = 0;
html = html.replace(blockRe, () => `<div class="mermaid">${svgs[idx++]}</div>`);
html = html.replace(
  /<script src="https:\/\/cdnjs[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/,
  `<!-- Diagrams are pre-rendered inline SVG. This document is fully self-contained:
     no network, no scripts, no external assets. It opens offline and prints correctly. -->`
);

writeFileSync(OUT, html);
console.log(`\nWrote ${OUT} — ${(html.length / 1024 / 1024).toFixed(2)} MB, ${sources.length} diagrams inlined, zero external dependencies.`);
