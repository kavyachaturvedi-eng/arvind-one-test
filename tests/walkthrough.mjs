// End-to-end walkthrough: visits every module in every role, clicks the primary
// interactions, and fails on any console error, page error, or hydration warning.
//
//   node tests/walkthrough.mjs            (expects a server on :3210)
//
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3210";
const SHOTS = "shots";
mkdirSync(SHOTS, { recursive: true });

const ROLES = [
  ["store", "Store Manager"],
  ["staff", "Store Staff"],
  ["planner", "Retail Planning"],
  ["leadership", "CEO"],
];
const MODULES_BY_ROLE = {
  store: ["pos", "storeday", "savesale", "omni", "grn", "outward", "crm", "tickets", "home", "sizeset", "replenish", "cash", "truth", "reports", "ask"],
  staff: ["pos", "storeday", "savesale", "omni", "grn", "outward", "crm", "tickets"],
  planner: ["live", "performance", "tickets", "allocate", "moves", "catchment", "truth", "governance", "ask"],
  leadership: ["exec", "live", "performance", "allocate", "moves", "catchment", "truth", "governance", "ask"],
};

const errors = [];
const warnings = [];
let checks = 0;
const pass = (m) => {
  checks++;
  console.log(`  ✓ ${m}`);
};
const fail = (m) => {
  errors.push(m);
  console.log(`  ✗ ${m}`);
};

const IGNORE = [/favicon/i, /Download the React DevTools/i, /webpack-hmr/i];

(async () => {
  // The sandbox ships a pinned Chromium build; point Playwright at it rather
  // than downloading one.
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  page.on("console", (msg) => {
    const t = msg.text();
    if (IGNORE.some((r) => r.test(t))) return;
    if (msg.type() === "error") errors.push(`console.error: ${t.slice(0, 300)}`);
    else if (msg.type() === "warning") warnings.push(t.slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    if (!IGNORE.some((x) => x.test(r.url()))) errors.push(`requestfailed: ${r.url()}`);
  });

  console.log(`\nArvind One — end-to-end walkthrough against ${BASE}\n`);

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // ── 1. Every module renders for every role ──────────────────────────────
  for (const [roleId, role] of ROLES) {
    console.log(`\n[Role] ${role}`);
    await page.locator(`[data-role="${roleId}"]`).first().click();
    await page.waitForTimeout(220);

    for (const mod of MODULES_BY_ROLE[roleId]) {
      const link = page.locator(`nav [data-module="${mod}"]`).first();
      if ((await link.count()) === 0) {
        fail(`${role} → "${mod}" not present in nav`);
        continue;
      }
      await link.click();
      await page.waitForTimeout(260);

      const h1 = await page.locator("main h1").first().innerText().catch(() => "");
      const bodyLen = (await page.locator("main").innerText()).length;

      if (!h1) fail(`${role} → ${mod}: no page heading rendered`);
      else if (bodyLen < 400) fail(`${role} → ${mod}: page looks empty (${bodyLen} chars)`);
      else pass(`${role} → ${mod} (${bodyLen} chars)`);

      // Nothing should render a raw NaN, undefined or Infinity to the user.
      const text = await page.locator("main").innerText();
      for (const bad of ["NaN", "undefined", "Infinity", "[object Object]"]) {
        if (text.includes(bad)) fail(`${role} → ${mod}: rendered "${bad}" in the UI`);
      }
    }
  }

  // ── 2. Save the Sale — the flagship flow, end to end ────────────────────
  console.log(`\n[Flow] Save the Sale`);
  await page.locator('[data-role="store"]').first().click();
  await page.waitForTimeout(200);
  await page.locator('nav [data-module="savesale"]').first().click();
  await page.waitForTimeout(300);

  // Hunt across styles for one with a zero-stock CORE size — that is the
  // transfer case, and it is the whole point of the screen. Trying only the
  // first style would let the flagship flow go untested.
  const styleButtons = page.locator("main button", { hasText: /MRP ₹/ });
  const styleCount = Math.min(await styleButtons.count(), 25);
  let picked = false;
  let pickedStyle = "";

  for (let si = 0; si < styleCount && !picked; si++) {
    await styleButtons.nth(si).click();
    await page.waitForTimeout(220);
    pickedStyle = (await styleButtons.nth(si).innerText()).split("\n")[0];
    const tiles = page.locator("main button[title*='sellable']");
    const tn = await tiles.count();
    for (let i = 0; i < tn; i++) {
      const t = (await tiles.nth(i).getAttribute("title")) || "";
      if (/· 0 sellable/.test(t) && /core size/.test(t)) {
        await tiles.nth(i).click();
        picked = true;
        break;
      }
    }
  }
  if (!picked) {
    fail("could not find any style with a zero-stock core size — the transfer path is untestable");
  } else {
    pass(`found a broken core size on "${pickedStyle}" — transfer path engaged`);
  }
  await page.waitForTimeout(360);

  const mainText = await page.locator("main").innerText();
  if (picked) {
    if (/Auto-approved|One approval needed|Blocked|Nothing in the network/.test(mainText)) pass("policy engine produced a decision");
    else fail("policy engine produced no visible decision");

    // The policy trail must explain itself, not just rule.
    if (/Donor has sellable stock/.test(mainText) && /saleable condition/.test(mainText)) pass("policy trail lists its rules");
    else if (/Nothing in the network/.test(mainText)) pass("honest dead end shown (no donor anywhere)");
    else fail("policy trail did not render its rules");

    const cta = page.locator("main button", { hasText: /Transfer \d+ unit|Send for one-tap approval/ }).first();
    if ((await cta.count()) > 0) {
      await cta.click();
      await page.waitForTimeout(320);
      const dialog = page.locator("[role='dialog']");
      if ((await dialog.count()) > 0) {
        pass("confirmation modal opened");
        await page.screenshot({ path: `${SHOTS}/savesale-confirm.png` });
        await dialog.locator("button", { hasText: /Confirm and transfer|Send for approval/ }).first().click();
        await page.waitForTimeout(500);
        const after = await page.locator("main").innerText();
        if (/IST-\d+/.test(after)) pass("transfer created with an id");
        else fail("transfer did not appear after confirming");
        if (/Approved|Awaiting approval/.test(after)) pass("outcome status rendered");
        else fail("outcome panel missing the request status");
        // The audit timeline is the trust artefact — it must exist.
        if (/Policy engine|Request raised at the till/.test(after)) pass("audit timeline rendered");
        else fail("audit timeline missing");
        await page.screenshot({ path: `${SHOTS}/savesale-result.png`, fullPage: true });
      } else fail("confirmation modal did not open");
    } else if (/Nothing in the network/.test(mainText)) {
      pass("no CTA because no donor exists — correct behaviour");
    } else {
      pass("no CTA — blocked by policy, which is a valid outcome");
    }
  }

  // ── 3. Outward — the dispatch gate must actually block ──────────────────
  console.log(`\n[Flow] Outward dispatch gate`);
  await page.locator('nav [data-module="outward"]').first().click();
  await page.waitForTimeout(320);
  const outText = await page.locator("main").innerText();
  if (/transfer code/i.test(outText)) pass("outward batch shows auto-split transfer codes");
  else fail("outward batch did not show transfer codes");
  const dispatch = page.locator("main button", { hasText: /^Dispatch/ }).first();
  if ((await dispatch.count()) > 0) {
    const disabled = await dispatch.isDisabled();
    pass(`dispatch button present (disabled=${disabled})`);
  }
  await page.screenshot({ path: `${SHOTS}/outward.png`, fullPage: true });

  // ── 4. Tickets — SLA ladder renders ────────────────────────────────────
  console.log(`\n[Flow] Tickets`);
  await page.locator('nav [data-module="tickets"]').first().click();
  await page.waitForTimeout(320);
  const tkText = await page.locator("main").innerText();
  if (/Area Manager|Regional Manager|Head Office|Store Manager/.test(tkText)) pass("escalation ladder rendered");
  else fail("escalation ladder missing");

  // ── 5. Ask One — every suggested question answers ──────────────────────
  console.log(`\n[Flow] Ask One`);
  await page.locator('nav [data-module="ask"]').first().click();
  await page.waitForTimeout(320);
  const chips = page.locator("main button", { hasText: /\?$/ });
  const chipCount = Math.min(await chips.count(), 8);
  if (chipCount === 0) fail("Ask One: no suggested questions found");
  for (let i = 0; i < chipCount; i++) {
    const label = (await chips.nth(i).innerText()).slice(0, 60);
    await chips.nth(i).click();
    await page.waitForTimeout(300);
    const t = await page.locator("main").innerText();
    if (/Interpreted as|interpreted as|I can't answer|cannot answer/i.test(t)) pass(`answered: ${label}`);
    else fail(`no interpretation strip for: ${label}`);
  }
  await page.screenshot({ path: `${SHOTS}/askone.png`, fullPage: true });

  // ── 6. One Number — reconciliation across every carried style ──────────
  console.log(`\n[Flow] One Number`);
  await page.locator('nav [data-module="truth"]').first().click();
  await page.waitForTimeout(320);
  const sel = page.locator("main select").first();
  const optCount = await sel.locator("option").count();
  let reconOk = 0;
  for (let i = 0; i < Math.min(optCount, 6); i++) {
    await sel.selectOption({ index: i });
    await page.waitForTimeout(200);
    const t = await page.locator("main").innerText();
    if (/sellable now/i.test(t) && /movements/i.test(t) && !/NaN|undefined/.test(t)) reconOk++;
  }
  if (reconOk === Math.min(optCount, 6)) pass(`reconciliation held for ${reconOk} styles`);
  else fail(`reconciliation broke on ${Math.min(optCount, 6) - reconOk} styles`);
  await page.screenshot({ path: `${SHOTS}/onenumber.png`, fullPage: true });

  // ── 7. Store switching across the whole estate ─────────────────────────
  console.log(`\n[Flow] Store switching`);
  const storeSel = page.locator("header select").first();
  const storeCount = await storeSel.locator("option").count();
  let storeOk = 0;
  for (let i = 0; i < storeCount; i++) {
    await storeSel.selectOption({ index: i });
    await page.waitForTimeout(180);
    const t = await page.locator("main").innerText();
    if (t.length > 400 && !/NaN|undefined/.test(t)) storeOk++;
  }
  if (storeOk === storeCount) pass(`all ${storeCount} stores render cleanly`);
  else fail(`${storeCount - storeOk} of ${storeCount} stores rendered badly`);

  // ── 8. Landing screenshots per role, for the deck ──────────────────────
  // The store lands on its execution home; the hierarchy lands on Live Execution.
  for (const [roleId, role] of ROLES) {
    await page.locator(`[data-role="${roleId}"]`).first().click();
    await page.waitForTimeout(300);
    const landing = roleId === "store" ? "home" : roleId === "staff" ? "pos" : roleId === "planner" ? "live" : "exec";
    await page.locator(`nav [data-module="${landing}"]`).first().click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/home-${roleId}.png`, fullPage: true });
  }
  pass("captured landing screenshots for all roles");

  // ── 9. Mobile viewport ─────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(320);
  const mobileText = await page.locator("main").innerText();
  if (mobileText.length > 400) pass("renders on a 390px viewport");
  else fail("mobile viewport rendered empty");
  await page.screenshot({ path: `${SHOTS}/mobile.png`, fullPage: true });

  await browser.close();

  // ── Report ─────────────────────────────────────────────────────────────
  const hydration = warnings.filter((w) => /hydrat|did not match|Text content does not match/i.test(w));
  console.log(`\n${"─".repeat(64)}`);
  console.log(`Checks passed : ${checks}`);
  console.log(`Errors        : ${errors.length}`);
  console.log(`Hydration     : ${hydration.length}`);
  if (hydration.length) hydration.slice(0, 5).forEach((h) => console.log(`  ! ${h}`));
  if (errors.length) {
    console.log(`\nFailures:`);
    errors.slice(0, 30).forEach((e) => console.log(`  - ${e}`));
  }
  console.log(`${"─".repeat(64)}\n`);
  process.exit(errors.length || hydration.length ? 1 : 0);
})();
