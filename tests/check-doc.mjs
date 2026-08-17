// Renders the POV document in a real browser and fails if any Mermaid diagram
// errored, if any diagram produced no SVG, or if the console reported a problem.
import { chromium } from "playwright";

const FILE = process.env.DOC || "/home/claude/arvind-one-pov.html";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));

await page.goto(`file://${FILE}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3500);

const blocks = await page.locator(".mermaid").count();
const svgs = await page.locator(".mermaid svg").count();
const errorText = await page.locator(".mermaid").allInnerTexts();
const bad = errorText.filter((t) => /syntax error|error in text|mermaid version/i.test(t));

// Diagrams that rendered but are suspiciously tiny usually mean a silent failure.
const tiny = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".mermaid svg"))
    .map((s, i) => ({ i, h: s.getBoundingClientRect().height }))
    .filter((x) => x.h < 60)
    .map((x) => x.i)
);

console.log(`\nPOV document check — ${FILE}`);
console.log(`  diagram blocks : ${blocks}`);
console.log(`  rendered SVGs  : ${svgs}`);
console.log(`  syntax errors  : ${bad.length}`);
console.log(`  suspiciously small : ${tiny.length ? tiny.join(", ") : "none"}`);

if (svgs < blocks) problems.push(`${blocks - svgs} diagram(s) did not render at all`);
if (bad.length) problems.push(`${bad.length} diagram(s) show a Mermaid syntax error`);
if (tiny.length) problems.push(`diagram index ${tiny.join(", ")} rendered under 60px tall`);

const sections = await page.locator("section").count();
const words = (await page.locator("body").innerText()).split(/\s+/).length;
console.log(`  sections       : ${sections}`);
console.log(`  word count     : ${words}`);

await page.screenshot({ path: "shots/pov-top.png" });
await page.screenshot({ path: "shots/pov-full.png", fullPage: true });

await browser.close();

if (problems.length) {
  console.log(`\nFAILURES:`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log(`\nAll ${svgs} diagrams rendered cleanly.\n`);
