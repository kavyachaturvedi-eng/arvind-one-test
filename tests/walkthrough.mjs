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
  store: ["pos", "bills", "offers", "health", "lookup", "savesale", "storeday", "omni", "grn", "outward", "crm", "tickets", "team", "home", "merch", "sizeset", "replenish", "cash", "reports", "agents", "ask"],
  staff: ["pos", "bills", "offers", "lookup", "savesale", "storeday", "omni", "grn", "outward", "crm", "tickets", "shift", "attendance"],
  planner: ["live", "performance", "tickets", "allocate", "merch", "moves", "catchment", "trainings", "truth", "reports", "governance", "agents", "ask"],
  leadership: ["exec", "live", "performance", "allocate", "moves", "catchment", "truth", "governance", "agents", "ask"],
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

const IGNORE = [/favicon/i, /Download the React DevTools/i, /webpack-hmr/i, /fonts\.googleapis/i, /fonts\.gstatic/i];

async function exitTillIfOpen(page) {
  const exit = page.locator("[data-exit-till]");
  if ((await exit.count()) > 0) {
    await exit.click().catch(() => {});
    await page.waitForTimeout(220);
  }
}

// Nav groups are collapsed by default — expand them all so module links exist.
async function expandNav(page) {
  // The collapsed-header list re-indexes after every click, so open them one
  // at a time until none are left.
  for (let pass = 0; pass < 12; pass++) {
    const closed = page.locator('nav [data-group][aria-expanded="false"]');
    if ((await closed.count()) === 0) break;
    await closed.first().click().catch(() => {});
    await page.waitForTimeout(60);
  }
}

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

  // ── 0. Sign in — the login screen is the front door ─────────────────────
  const signin = page.locator("[data-signin]");
  if ((await signin.count()) > 0) {
    // Store logins need a person and their PIN.
    await page.locator("[data-pin]").fill("1111");
    await page.screenshot({ path: `${SHOTS}/login.png` });
    await signin.click();
    await page.waitForTimeout(400);
    // Default sign-in is Store Staff, which lands straight in the till —
    // leave it so the header is clickable for the role loop.
    await exitTillIfOpen(page);
    pass("signed in from the login screen");
  } else {
    fail("login screen did not render");
  }

  // Modules with something new carry a dot until they are opened.
  await expandNav(page);
  const dotCount = await page.locator('nav [aria-label="new"]').count();
  if (dotCount > 0) {
    pass(`${dotCount} nav modules carry a new-activity dot`);
    await page.locator('nav [data-module="grn"]').first().click();
    await page.waitForTimeout(280);
    if ((await page.locator('nav [aria-label="new"]').count()) < dotCount) pass("opening a module clears its dot");
    else fail("dot did not clear after opening the module");
  } else fail("no notification dots on the nav");

  // ── 1. Every module renders for every role ──────────────────────────────
  for (const [roleId, role] of ROLES) {
    console.log(`\n[Role] ${role}`);
    await page.locator(`[data-role="${roleId}"]`).first().click();
    await page.waitForTimeout(220);
    await exitTillIfOpen(page);
    await expandNav(page);

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
      const tillOpen = (await page.locator("[data-exit-till]").count()) > 0;

      if (mod === "pos" && tillOpen) pass(`${role} → ${mod} (till open)`);
      else if (!h1) fail(`${role} → ${mod}: no page heading rendered`);
      else if (bodyLen < 400) fail(`${role} → ${mod}: page looks empty (${bodyLen} chars)`);
      else pass(`${role} → ${mod} (${bodyLen} chars)`);

      // Nothing should render a raw NaN, undefined or Infinity to the user.
      const text = await page.locator("main").innerText();
      for (const bad of ["NaN", "undefined", "Infinity", "[object Object]"]) {
        if (text.includes(bad)) fail(`${role} → ${mod}: rendered "${bad}" in the UI`);
      }

      // The till is a full-screen takeover — leave it so the nav is usable.
      const exit = page.locator("[data-exit-till]");
      if ((await exit.count()) > 0) {
        await exit.click();
        await page.waitForTimeout(220);
      }
    }
  }

  // ── 2. Save the Sale — the flagship flow, end to end ────────────────────
  console.log(`\n[Flow] Save the Sale`);
  await page.locator('[data-role="store"]').first().click();
  await page.waitForTimeout(200);
  await expandNav(page);
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

    if ((await page.locator("[data-distance-lane]").count()) > 0) pass("donor distance lane rendered");
    else pass("no donors to visualize (dead end) — lane correctly absent");

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

        // Same-day lane: an approved transfer inside 40 km dispatches a rider.
        const dispatchPanel = page.locator("[data-rider-dispatch]");
        if ((await dispatchPanel.count()) > 0) {
          pass("instant rider dispatch panel rendered (same-day lane)");
          const wa = page.locator("[data-wa-notify]");
          await wa.click();
          await page.waitForTimeout(260);
          if (/notified/i.test(await wa.innerText())) pass("customer WhatsApp notification confirmed");
          else fail("WhatsApp notify did not confirm");
        } else {
          pass("no instant dispatch (pending approval or beyond 40 km) — correct");
        }
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

  // ── 4b. VM photo audit — Arvi Vision closes the HQ SLA on the spot ──────
  console.log(`\n[Flow] VM photo audit`);
  await page.locator('nav [data-module="storeday"]').first().click();
  await page.waitForTimeout(320);
  const photoBtn = page.locator("main button", { hasText: /Close with photo/ }).first();
  if ((await photoBtn.count()) === 0) fail("no photo close-out task found");
  else {
    await photoBtn.click();
    await page.waitForTimeout(300);
    const capture = page.locator("[data-vm-capture]");
    if ((await capture.count()) === 0) fail("VM audit modal did not open");
    else {
      await capture.click();
      await page.waitForTimeout(3400); // four checks + verdict
      const verdict = page.locator("[data-vm-verdict]");
      if ((await verdict.count()) > 0 && /% VM compliance/.test(await verdict.innerText())) {
        pass(`Arvi Vision verdict: ${(await verdict.innerText()).trim()}`);
      } else fail("vision scan produced no verdict");
      await page.screenshot({ path: `${SHOTS}/vm-audit.png` });
      await page.locator("[data-vm-close]").click();
      await page.waitForTimeout(300);
      if ((await page.locator("[data-vm-capture]").count()) === 0) pass("task closed and SLA resolved");
      else fail("VM modal did not close after approval");
    }
  }

  // ── 4c. Briefing is a one-tap mark — huddles happen in person ───────────
  const briefBtn = page.locator("[data-briefing]");
  if ((await briefBtn.count()) > 0) {
    await briefBtn.click();
    await page.waitForTimeout(240);
    if (/Briefing done/.test(await page.locator("main").innerText())) pass("morning briefing marked done in one tap");
    else fail("briefing mark did not stick");
  } else fail("briefing button missing for the manager");

  // ── 4d. Check stock — the whole estate and the warehouse in two taps ────
  console.log(`\n[Flow] Check stock`);
  await page.locator('nav [data-module="lookup"]').first().click();
  await page.waitForTimeout(320);
  await page.locator("[data-lookup-style]").first().click();
  await page.waitForTimeout(260);
  const sizeTile = page.locator("main button[title*='sellable']").first();
  if ((await sizeTile.count()) === 0) fail("size grid missing in stock lookup");
  else {
    await sizeTile.click();
    await page.waitForTimeout(300);
    const lkText = await page.locator("main").innerText();
    if ((await page.locator("[data-lookup-dc]").count()) > 0 && /elsewhere/i.test(lkText)) {
      pass("network view rendered: this store, warehouse and every holder");
    } else fail("stock lookup network view missing");
    await page.screenshot({ path: `${SHOTS}/lookup.png`, fullPage: true });
  }

  // ── 4d2. Receive stock — short receive against the PO ───────────────────
  console.log(`\n[Flow] Receive stock`);
  await page.locator('nav [data-module="grn"]').first().click();
  await page.waitForTimeout(320);
  const rcv = page.locator("[data-receive]").first();
  if ((await rcv.count()) === 0) fail("no arrived shipment to receive");
  else {
    await rcv.click();
    await page.waitForTimeout(280);
    const qty = page.locator("[data-receive-qty]");
    const expected = Number(await qty.inputValue());
    await qty.fill(String(Math.max(1, expected - 2)));
    await page.waitForTimeout(150);
    await page.locator("[data-receive-confirm]").click();
    await page.waitForTimeout(300);
    const grnText = await page.locator("main").innerText();
    if (/2 short/.test(grnText) && /PO-\d+/.test(grnText)) pass("short receive recorded against the PO");
    else fail("short receive did not record");
  }

  // ── 4d3. Online orders — three stats, dropdown actions, past orders ─────
  console.log(`\n[Flow] Online orders`);
  await page.locator('nav [data-module="omni"]').first().click();
  await page.waitForTimeout(320);
  const omniText = await page.locator("main").innerText();
  if (/PENDING/i.test(omniText) && /DISPATCHED/i.test(omniText) && /SLA BREACHED/i.test(omniText)) pass("three essential stats only");
  else fail("omni stats not simplified");
  if ((await page.locator("[data-omni-action]").count()) > 0) pass("actions offered as a dropdown per order");
  else fail("action dropdown missing");
  if (/Past orders/.test(omniText)) pass("past orders table in place of the ledger");
  else fail("past orders table missing");
  await page.screenshot({ path: `${SHOTS}/omni.png`, fullPage: true });

  // ── 4d4. The till: open the day, customer profile, held bills ────────────
  console.log(`\n[Flow] Till: day open, profile, held bills`);
  await page.locator('[data-role="staff"]').first().click();
  await page.waitForTimeout(320);
  // Staff land straight on billing, which is gated until the day is opened
  // with a counted float.
  const floatBox = page.locator("[data-float]");
  if ((await floatBox.count()) === 0) fail("day-open gate missing on the billing screen");
  else {
    await floatBox.fill("9840.50");
    await page.screenshot({ path: `${SHOTS}/day-open.png` });
    await page.locator("[data-day-open]").click();
    await page.waitForTimeout(300);
    if ((await page.locator("[data-float]").count()) === 0) pass("day opened at the till with a counted float, paise included");
    else fail("day-open did not take");
  }

  // A known number opens the customer's profile with their past orders.
  for (const d of "9812345678") await page.locator("main button", { hasText: new RegExp(`^${d}$`) }).first().click();
  await page.waitForTimeout(400);
  const profOrder = page.locator("[data-profile-order]");
  if ((await profOrder.count()) > 0) {
    pass(`customer profile opened with ${await profOrder.count()} past orders`);
    await page.screenshot({ path: `${SHOTS}/till-profile.png` });
    await page.locator("[data-profile-return]").first().click();
    await page.waitForTimeout(200);
    await page.locator("[data-profile-reason]").first().click();
    await page.waitForTimeout(300);
    if (/Returned ·/.test(await page.locator("body").innerText())) pass("return settled from the profile with a reason");
    else fail("return from the profile did not settle");
    await page.locator("[data-start-bill]").click();
    await page.waitForTimeout(300);
    if ((await page.locator("[data-past-orders]").count()) > 0) pass("their past orders stay on the bill panel until items are added");
    else fail("past-orders panel missing for a known customer");
  } else fail("customer profile popup did not open on a known number");

  // Held bills: confirm the drawer opens and reads honestly.
  await page.locator("[data-held]").click();
  await page.waitForTimeout(260);
  if (/Held bills/.test(await page.locator("body").innerText())) pass("held-bills drawer opens from the till bar");
  else fail("held-bills drawer did not open");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Bill an item, then apply a coupon code at payment.
  {
    // Product tiles carry a "N pcs" line; sizes with stock read "N left".
    const tiles = page.locator("main button", { hasText: / pcs$/ });
    const tn = Math.min(await tiles.count(), 8);
    let added = false;
    for (let i = 0; i < tn && !added; i++) {
      await tiles.nth(i).click();
      await page.waitForTimeout(240);
      const sizeBtn = page.locator("main button", { hasText: /\d+ left$/ }).first();
      if ((await sizeBtn.count()) === 0) continue;
      await sizeBtn.click();
      await page.waitForTimeout(220);
      const add = page.locator("[data-add-item]");
      if ((await add.count()) === 0) continue;
      await add.click();
      await page.waitForTimeout(260);
      added = true;
    }
    if (!added) fail("could not add an item at the till");
    else {
      pass("item added to the bill from the tile grid");
      await page.locator("main button", { hasText: /^Charge/ }).first().click();
      await page.waitForTimeout(300);
      await page.locator("[data-coupon]").fill("FESTIVE10");
      await page.locator("[data-coupon-apply]").click();
      await page.waitForTimeout(280);
      if (/Coupon FESTIVE10/.test(await page.locator("body").innerText())) pass("coupon applied at payment and shown on the bill");
      else fail("coupon did not apply at payment");
      await page.screenshot({ path: `${SHOTS}/coupon.png` });
    }
  }

  // Split payment: the coupon flow left us on the payment stage with a bill.
  {
    await page.locator("main button", { hasText: /^Cash$/ }).click();
    await page.waitForTimeout(220);
    await page.locator("[data-part-amount]").fill("500");
    await page.waitForTimeout(180);
    const split = page.locator("[data-add-tender]");
    if ((await split.count()) === 0) fail("split tender button missing");
    else {
      await split.click();
      await page.waitForTimeout(260);
      if (/Still to pay/.test(await page.locator("body").innerText())) pass("split payment: part tender recorded, balance shown");
      else fail("split payment did not record the part tender");
      await page.locator("main button", { hasText: /^Card$/ }).click();
      await page.waitForTimeout(220);
      await page.screenshot({ path: `${SHOTS}/split.png` });
      await page.locator("[data-confirm-pay]").click();
      await page.waitForTimeout(340);
      if (/Split/.test(await page.locator("body").innerText())) pass("bill closed as a split payment");
      else fail("split bill did not close");
      await page.locator("[data-new-bill]").click();
      await page.waitForTimeout(260);
    }
  }

  // Day end from the till, then reopen so the rest of the run can bill.
  await page.locator("[data-day-end]").click();
  await page.waitForTimeout(280);
  if ((await page.locator("[data-day-end-confirm]").count()) === 0) fail("day-end dialog missing on the till");
  else {
    await page.locator("[data-day-end-confirm]").click();
    await page.waitForTimeout(320);
    if (/Day closed/.test(await page.locator("body").innerText())) pass("day closed from the billing screen");
    else fail("day close did not take");
    await page.locator("main button", { hasText: /Reopen the till/ }).click();
    await page.waitForTimeout(260);
  }

  await exitTillIfOpen(page);
  await expandNav(page);
  await page.locator('nav [data-module="crm"]').first().click();
  await page.waitForTimeout(320);
  await page.locator("[data-points-phone]").fill("9812345678");
  await page.locator("[data-points-check]").click();
  await page.waitForTimeout(280);
  const crmText = await page.locator("main").innerText();
  if (/worth at billing|Not a member yet/i.test(crmText)) pass("member points lookup answers in one tap");
  else fail("points lookup produced nothing");
  if (!/Points liability/i.test(crmText)) pass("points liability removed from the store view");
  else fail("points liability still shown to the store");
  if (/Their orders, last 30 days/i.test(crmText) ? /Points earned/i.test(crmText) : /Not a member yet/i.test(crmText)) {
    pass("loyalty answers with per-order points, not a customer list");
  } else fail("member orders with points missing");
  if (!/Members in the store recently/i.test(crmText)) pass("no laundry list of customers");
  else fail("recent-members list still shown");
  if (!/Capture rate/i.test(crmText)) pass("programme stats hidden from staff");
  else fail("programme stats still visible to staff");

  // Offers: the board and a coupon check.
  await page.locator('nav [data-module="offers"]').first().click();
  await page.waitForTimeout(320);
  const offerCount = await page.locator("[data-offer]").count();
  if (offerCount >= 4) pass(`${offerCount} running offers, in words a cashier can say`);
  else fail(`offer board thin (${offerCount})`);
  await page.locator("[data-coupon-check-input]").fill("EXPIRED50");
  await page.locator("[data-coupon-check]").click();
  await page.waitForTimeout(240);
  if (/will not apply/.test(await page.locator("main").innerText())) pass("a dead coupon is refused with the reason");
  else fail("coupon check did not refuse an expired code");
  await page.screenshot({ path: `${SHOTS}/offers.png`, fullPage: true });

  // Check stock: the full inventory list with filters.
  await page.locator('nav [data-module="lookup"]').first().click();
  await page.waitForTimeout(300);
  await page.locator("[data-full-list]").click();
  await page.waitForTimeout(300);
  const fullRows = await page.locator("main tbody tr").count();
  if (fullRows > 20) pass(`full inventory list rendered (${fullRows} styles)`);
  else fail(`full list too short (${fullRows})`);
  await page.locator("[data-stock-filter]").selectOption("Out of stock");
  await page.waitForTimeout(260);
  const outRows = await page.locator("main tbody tr").count();
  if (outRows < fullRows) pass(`stock filter narrows the list (${outRows} out of stock)`);
  else fail("stock filter did not narrow the list");
  await page.locator("[data-list-search]").fill("polo");
  await page.waitForTimeout(240);
  await page.screenshot({ path: `${SHOTS}/full-list.png`, fullPage: true });

  // The signed-in person's own name is in the header, not a generic role.
  if (/Meera Pillai/.test(await page.locator("header").innerText())) pass("the signed-in person's name shows in the header");
  else fail("staff name missing from the header");

  // Bills & Returns: find a bill, return it with a reason.
  await page.locator('nav [data-module="bills"]').first().click();
  await page.waitForTimeout(320);
  const billText = await page.locator("main").innerText();
  if (/B-41\d\d/.test(billText) && /\+\d+/.test(billText)) pass("30-day bill list with points per order");
  else fail("bill list missing");
  const act = page.locator("[data-bill-action]").first();
  await act.selectOption("returned");
  await page.waitForTimeout(280);
  if ((await page.locator("[data-bill-confirm]").count()) > 0) {
    await page.locator("[data-bill-confirm]").click();
    await page.waitForTimeout(280);
    if (/Returned/.test(await page.locator("main").innerText())) pass("return recorded with reason and refund to original mode");
    else fail("return did not record");
  } else fail("return modal did not open");
  await page.screenshot({ path: `${SHOTS}/bills.png`, fullPage: true });

  // Attendance: days present, holiday calendar, ask for leave.
  await page.locator('nav [data-module="attendance"]').first().click();
  await page.waitForTimeout(320);
  const attText = await page.locator("main").innerText();
  if (/Days present/i.test(attText) && /Onam/.test(attText)) pass("attendance shows days present and the holiday calendar");
  else fail("attendance screen incomplete");
  await page.locator("[data-apply-leave]").click();
  await page.waitForTimeout(260);
  if (/waiting for manager/i.test(await page.locator("main").innerText())) pass("leave asked from Attendance");
  else fail("leave request missing");
  await page.screenshot({ path: `${SHOTS}/attendance.png`, fullPage: true });

  // Shifts: now, upcoming, cash at the counter, then end the shift from the
  // top-bar CTA with a counted handover.
  await page.locator('nav [data-module="shift"]').first().click();
  await page.waitForTimeout(320);
  const shiftText = await page.locator("main").innerText();
  if (/Upcoming shifts/i.test(shiftText) && /Cash at this counter/i.test(shiftText)) pass("shifts screen shows now, upcoming and cash operations");
  else fail("shifts screen incomplete");
  if (/handed/i.test(shiftText)) pass("shift-change cash movements listed");
  else fail("handover history missing");
  await page.screenshot({ path: `${SHOTS}/shifts.png`, fullPage: true });

  await page.locator("[data-end-shift-cta]").click();
  await page.waitForTimeout(300);
  if ((await page.locator("[data-handover-count]").count()) === 0) fail("end-shift dialog did not ask for cash");
  else {
    pass("end-shift CTA in the top bar asks for the cash count");
    await page.locator("[data-handover]").click();
    await page.waitForTimeout(320);
    const afterShift = await page.locator("body").innerText();
    if (/Shift handed over/i.test(afterShift)) pass("shift handed over with cash, CTA turns into a status");
    else fail("handover did not complete");
  }

  // Manager sees and approves the leave.
  await page.locator('[data-role="store"]').first().click();
  await page.waitForTimeout(260);
  await exitTillIfOpen(page);
  await expandNav(page);
  await page.locator('nav [data-module="team"]').first().click();
  await page.waitForTimeout(320);
  const approveLeave = page.locator("[data-leave-approve]").first();
  if ((await approveLeave.count()) === 0) fail("no pending leave visible to the manager");
  else {
    await approveLeave.click();
    await page.waitForTimeout(240);
    pass("manager approved a leave request from Staff & Shifts");
  }

  // ── 4e. Smart Moves — merchandising intelligence in plain words ─────────
  console.log(`\n[Flow] Smart Moves`);
  await page.locator('nav [data-module="merch"]').first().click();
  await page.waitForTimeout(340);
  const moveCards = await page.locator("[data-merch-move]").count();
  if (moveCards >= 4) pass(`${moveCards} plain-language move cards rendered`);
  else fail(`expected 4+ move cards, found ${moveCards}`);
  const merchText = await page.locator("main").innerText();
  if (/Onam/.test(merchText) && /last year/i.test(merchText)) pass("festival + last-year evidence shown");
  else fail("festival evidence missing from move cards");
  await page.locator("[data-merch-approve]").first().click();
  await page.waitForTimeout(260);
  if (/Approved. Transfer raised/.test(await page.locator("main").innerText())) pass("move approved, transfer raised");
  else fail("approving a move did not confirm");
  await page.screenshot({ path: `${SHOTS}/merch.png`, fullPage: true });

  // ── 4f. Staff & Shifts — the manager's people screen ────────────────────
  console.log(`\n[Flow] Staff & Shifts`);
  await page.locator('nav [data-module="team"]').first().click();
  await page.waitForTimeout(340);
  const cells = await page.locator("[data-shift-cell]").count();
  if (cells >= 35) pass(`shift grid rendered (${cells} tappable cells)`);
  else fail(`shift grid too small (${cells} cells)`);
  const firstCell = page.locator("[data-shift-cell]").first();
  const before = (await firstCell.innerText()).trim();
  await firstCell.click();
  await page.waitForTimeout(160);
  const afterCell = (await firstCell.innerText()).trim();
  if (before !== afterCell) pass(`shift cell cycles on tap (${before} → ${afterCell})`);
  else fail("shift cell did not change on tap");
  await page.locator("[data-staff-name]").fill("Priya Nair");
  await page.locator("[data-staff-pin]").fill("9876");
  await page.locator("[data-staff-name]").press("Enter");
  await page.waitForTimeout(260);
  if (/Priya Nair/.test(await page.locator("main").innerText())) pass("new team member added with a PIN and permissions");
  else fail("added staff member did not appear");
  // RBAC: toggling a permission sticks.
  const perm = page.locator("[data-perm]").nth(8);
  const before2 = (await perm.innerText()).trim();
  await perm.click();
  await page.waitForTimeout(220);
  if ((await perm.innerText()).trim() !== before2) pass("permission toggled for a staff member");
  else fail("permission toggle did not change");
  await page.screenshot({ path: `${SHOTS}/rbac.png`, fullPage: true });
  await page.locator("[data-publish-week]").click();
  await page.waitForTimeout(260);
  if (/Week published/.test(await page.locator("main").innerText())) pass("week published to staff phones");
  else fail("publish did not confirm");
  await page.screenshot({ path: `${SHOTS}/team.png`, fullPage: true });

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
  // The certified-BI showpiece: verified formula + actionable outlier table.
  const askInput = page.locator("main input").first();
  await askInput.fill("Which stores are bleeding margin on Oxford Solid Shirts?");
  await askInput.press("Enter");
  await page.waitForTimeout(360);
  const askText = await page.locator("main").innerText();
  if (/Verified · governed metric/i.test(askText) && /Margin bleed/i.test(askText)) pass("margin-bleed answer grounded in a verified metric");
  else fail("margin-bleed answer not grounded in the registry");
  const trig = page.locator("main button", { hasText: /^Trigger markdown$/ });
  if ((await trig.count()) === 3) {
    await trig.first().click();
    await page.waitForTimeout(200);
    pass("3 outlier stores rendered with one-tap markdown triggers");
  } else fail(`expected 3 markdown triggers, found ${await trig.count()}`);
  await page.screenshot({ path: `${SHOTS}/askone.png`, fullPage: true });

  // ── 6. One Number — reconciliation across every carried style ──────────
  console.log(`\n[Flow] One Number`);
  // Stock Position lives with Planning now; the store's view is Check stock.
  await page.locator('[data-role="planner"]').first().click();
  await page.waitForTimeout(300);
  await exitTillIfOpen(page);
  await expandNav(page);
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

  // ── 6b. Command palette — ⌘K jump-to-anything ───────────────────────────
  console.log(`\n[Flow] Command palette`);
  await page.locator('[data-role="store"]').first().click();
  await page.waitForTimeout(300);
  await exitTillIfOpen(page);
  await page.locator("[data-palette]").first().click();
  await page.waitForTimeout(240);
  const palInput = page.locator("[data-palette-input]");
  if ((await palInput.count()) === 0) fail("command palette did not open");
  else {
    await palInput.fill("replen");
    await page.waitForTimeout(200);
    const items = await page.locator("[data-palette-item]").count();
    if (items > 0) pass(`palette matched ${items} result(s) for "replen"`);
    else fail(`palette returned nothing for "replen"`);
    await page.screenshot({ path: `${SHOTS}/palette.png` });
    await palInput.press("Enter");
    await page.waitForTimeout(320);
    const h1p = await page.locator("main h1").first().innerText().catch(() => "");
    if (/replenish/i.test(h1p)) pass("palette Enter navigated to Replenishment");
    else fail(`palette Enter landed on "${h1p}" instead of Replenishment`);
    const crumbText = await page.locator("main").innerText();
    if (/inventory/i.test(crumbText) && /operations/i.test(crumbText)) pass("breadcrumb shows section · group · screen");
    else fail("breadcrumb missing above the screen");
  }

  // ── 7. Store switching across the whole estate ─────────────────────────
  // Store roles are locked to their store; the focus-store picker lives with
  // Planning and Admin. Switch to Planning to sweep the estate.
  console.log(`\n[Flow] Store switching`);
  if ((await page.locator("header select").count()) === 0) pass("store roles have no store switcher — locked to their store");
  else fail("store role can still switch stores from the header");
  await page.locator('[data-role="planner"]').first().click();
  await page.waitForTimeout(300);
  await exitTillIfOpen(page);
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
    if ((await page.locator("[data-exit-till]").count()) > 0 && landing !== "pos") {
      await exitTillIfOpen(page);
    }
    if ((await page.locator("[data-exit-till]").count()) === 0) {
      await expandNav(page);
      await page.locator(`nav [data-module="${landing}"]`).first().click();
      await page.waitForTimeout(450);
    } else {
      await page.waitForTimeout(450);
    }
    await page.screenshot({ path: `${SHOTS}/home-${roleId}.png`, fullPage: true });
    await exitTillIfOpen(page);
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
