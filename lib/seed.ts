// ─────────────────────────────────────────────────────────────────────────────
// Deterministic demo dataset.
//
// Every number below is generated from a fixed seed and a fixed demo clock, so
// the prototype renders identically on the server and the client, and identically
// on every machine it is demoed from. No Date.now(), no Math.random().
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Brand,
  CashException,
  Category,
  MetricDef,
  OmniOrder,
  OutwardBatch,
  Region,
  Role,
  Size,
  StaffKpi,
  StockRow,
  Store,
  Style,
  Ticket,
  Notification,
} from "./types";
import { splitOutward } from "./rules";

/** The demo clock: Thursday 13 August 2026, 11:42 IST. */
export const NOW = Date.UTC(2026, 7, 13, 6, 12, 0);
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** Mulberry32 — small, fast, deterministic. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

// ── Roles ────────────────────────────────────────────────────────────────────

export const ROLES: Role[] = [
  {
    id: "store",
    label: "Store Manager",
    person: "Rohit Sharma",
    title: "Store Manager · Phoenix Palladium",
    scope: "Tommy Hilfiger · Phoenix Palladium, Mumbai",
    initials: "RS",
    mode: "execute",
    does: "Runs the whole store day in one app — scan, transfer, fulfil, raise, close.",
    basedOn: "Store walkthroughs, days 1–3",
  },
  {
    id: "planner",
    label: "Retail Planning",
    person: "Praveen Kumar",
    title: "Retail Planning Lead",
    scope: "All brands · allocation, replenishment, transfers",
    initials: "PK",
    mode: "observe",
    does: "Watches execution across every store and acts on what it surfaces — reallocate, rebalance.",
    basedOn: "Praveen — retail planning conversation",
  },
  {
    id: "leadership",
    label: "CEO",
    person: "Satyen",
    title: "CEO — Tommy Hilfiger & Calvin Klein",
    scope: "Enterprise",
    initials: "S",
    mode: "observe",
    does: "Sees the health of execution and the business outcome — one number, no reconciliation.",
    basedOn: "CEO conversation, day 3",
  },
];

// ── Stores ───────────────────────────────────────────────────────────────────

const STORE_SPECS: Array<[string, string, Brand, Region, Store["format"], Store["model"], Store["grade"], number, number]> = [
  // name, city, brand, region, format, model, grade, x, y
  ["Phoenix Palladium", "Mumbai", "Tommy Hilfiger", "West", "Mall", "COCO", "A", 12, 40],
  ["Linking Road", "Mumbai", "Tommy Hilfiger", "West", "High Street", "COCO", "A", 14, 42],
  ["Infiniti Malad", "Mumbai", "Calvin Klein", "West", "Mall", "COCO", "B", 10, 46],
  ["Phoenix Marketcity", "Pune", "Tommy Hilfiger", "West", "Mall", "COFO", "B", 22, 38],
  ["VR Surat", "Surat", "U.S. Polo Assn.", "West", "Mall", "FOFO", "C", 8, 58],
  ["DLF Promenade", "Delhi NCR", "Tommy Hilfiger", "North", "Mall", "COCO", "A", 40, 92],
  ["Ambience Gurgaon", "Delhi NCR", "Calvin Klein", "North", "Mall", "COCO", "A", 38, 90],
  ["Elante Chandigarh", "Chandigarh", "Arrow", "North", "Mall", "COFO", "B", 42, 104],
  ["Phoenix Marketcity BLR", "Bengaluru", "Tommy Hilfiger", "South", "Mall", "COCO", "A", 34, 14],
  ["UB City", "Bengaluru", "Calvin Klein", "South", "High Street", "COCO", "B", 35, 15],
  ["Forum Kochi", "Kochi", "U.S. Polo Assn.", "South", "Mall", "FOCO", "C", 30, 4],
  ["Express Avenue", "Chennai", "Flying Machine", "South", "Mall", "FOFO", "C", 44, 10],
  ["Quest Kolkata", "Kolkata", "Tommy Hilfiger", "East", "Mall", "COCO", "B", 68, 46],
  ["Bhubaneswar Esplanade", "Bhubaneswar", "Arrow", "East", "Mall", "FOFO", "C", 66, 34],
  ["Mumbai Outlet — Vashi", "Mumbai", "Tommy Hilfiger", "West", "Outlet", "COCO", "C", 18, 44],
  // U.S. Polo Assn. is the largest brand by door count, and Arrow and Flying
  // Machine each need a real network — a brand with one store can never make
  // an inter-store transfer, which would quietly hide the flagship workflow.
  ["Seawoods Grand Central", "Mumbai", "U.S. Polo Assn.", "West", "Mall", "COCO", "B", 17, 45],
  ["Pacific Delhi", "Delhi NCR", "U.S. Polo Assn.", "North", "Mall", "COCO", "A", 39, 93],
  ["Nexus Koramangala", "Bengaluru", "U.S. Polo Assn.", "South", "Mall", "COFO", "B", 35, 13],
  ["City Centre Siliguri", "Siliguri", "U.S. Polo Assn.", "East", "Mall", "FOFO", "C", 63, 62],
  ["Lulu Lucknow", "Lucknow", "Arrow", "North", "Mall", "COFO", "B", 48, 78],
  ["Phoenix Mall of Asia", "Bengaluru", "Arrow", "South", "Mall", "COCO", "B", 34, 17],
  ["Inorbit Hyderabad", "Hyderabad", "Flying Machine", "South", "Mall", "COFO", "B", 38, 26],
  ["Sarath City Hyderabad", "Hyderabad", "Flying Machine", "South", "Mall", "FOFO", "C", 37, 27],
  ["Ambience Vasant Kunj", "Delhi NCR", "Flying Machine", "North", "Mall", "COCO", "B", 40, 90],
];

const MANAGER_NAMES = [
  "Rohit Sharma", "Aisha Khan", "Vikram Nair", "Sneha Deshpande", "Karan Mehta",
  "Ritu Bansal", "Aman Gill", "Priya Sethi", "Nikhil Rao", "Divya Menon",
  "Joseph Thomas", "Lakshmi Iyer", "Arnab Ghosh", "Sourav Das", "Farhan Sheikh",
  "Pooja Kulkarni", "Harpreet Singh", "Ananya Reddy", "Debjani Roy", "Imran Ansari",
  "Sruthi Varma", "Manoj Pillai", "Zoya Fernandes", "Rahul Verma",
];

const PINCODES = [
  "400013", "400050", "400064", "411014", "395007",
  "110017", "122002", "160002", "560048", "560001",
  "682024", "600002", "700107", "751001", "400703",
  "400706", "110070", "560034", "734001", "226010",
  "560092", "500081", "500019", "110070",
];

export const STORES: Store[] = STORE_SPECS.map(([name, city, brand, region, format, model, grade, x, y], i) => {
  const r = rng(1000 + i);
  const gradeMult = grade === "A" ? 1 : grade === "B" ? 0.62 : 0.38;
  return {
    id: `${brand.split(" ")[0].slice(0, 2).toUpperCase()}-${city.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
    code: `S${String(i + 1).padStart(3, "0")}`,
    name,
    brand,
    city,
    region,
    format,
    model,
    grade,
    norm: Math.round((2600 + r() * 1400) * gradeMult),
    targetMonth: Math.round((4_200_000 + r() * 2_400_000) * gradeMult),
    x,
    y,
    managerName: MANAGER_NAMES[i],
    headcount: int(r, 6, 16),
    pincode: PINCODES[i],
  };
});

export const storeById = (id: string) => STORES.find((s) => s.id === id)!;

// ── Styles ───────────────────────────────────────────────────────────────────

const APPAREL_SIZES: Size[] = ["XS", "S", "M", "L", "XL", "XXL"];
const WAIST_SIZES: Size[] = ["28", "30", "32", "34", "36", "38"];
const CORE_APPAREL: Size[] = ["M", "L", "XL"];
const CORE_WAIST: Size[] = ["32", "34", "36"];

const STORIES = ["Coastal Prep", "Heritage Flag", "Modern Essentials", "Monogram Capsule", "Summer Linen", "Varsity Club", "Utility Edit", "Core NOS"];

const STYLE_SPECS: Array<[string, Category, Brand, string, string, number]> = [
  ["Flag Logo Cotton Polo", "Polo", "Tommy Hilfiger", "Navy", "#0F2A4A", 3499],
  ["Slim Fit Stretch Polo", "Polo", "Tommy Hilfiger", "White", "#E8E8E4", 3299],
  ["Pima Cotton Polo", "Polo", "Tommy Hilfiger", "Sky", "#8FB8DE", 3999],
  ["Oxford Solid Shirt", "Shirts", "Tommy Hilfiger", "Blue", "#2a78d6", 4299],
  ["Linen Blend Shirt", "Shirts", "Tommy Hilfiger", "Sand", "#D9C7A7", 4999],
  ["Check Casual Shirt", "Shirts", "Tommy Hilfiger", "Red Check", "#B93A3A", 4599],
  ["Essential Crew Tee", "T-Shirts", "Tommy Hilfiger", "Black", "#1a1a19", 2299],
  ["Monogram Print Tee", "T-Shirts", "Tommy Hilfiger", "Ecru", "#EFE9DD", 2699],
  ["Scanton Slim Jean", "Denim", "Tommy Hilfiger", "Mid Wash", "#4A6B8A", 6499],
  ["Bleecker Straight Jean", "Denim", "Tommy Hilfiger", "Dark Wash", "#26364A", 6999],
  ["Chino Flat Front", "Trousers", "Tommy Hilfiger", "Khaki", "#B9A47C", 4999],
  ["Bomber Jacket", "Outerwear", "Tommy Hilfiger", "Olive", "#4F5B3C", 10999],
  ["Cable Knit Sweater", "Knitwear", "Tommy Hilfiger", "Cream", "#EDE4D2", 7499],
  ["Leather Belt Reversible", "Accessories", "Tommy Hilfiger", "Brown", "#6B4A2F", 2999],

  ["CK Logo Tape Polo", "Polo", "Calvin Klein", "Black", "#141414", 3899],
  ["Cotton Stretch Shirt", "Shirts", "Calvin Klein", "White", "#F2F2EE", 4499],
  ["Institutional Logo Tee", "T-Shirts", "Calvin Klein", "Grey", "#8A8A85", 2499],
  ["Body Slim Jean", "Denim", "Calvin Klein", "Indigo", "#2E3E5C", 6799],
  ["Tech Twill Trouser", "Trousers", "Calvin Klein", "Charcoal", "#3A3A38", 5499],
  ["Padded Gilet", "Outerwear", "Calvin Klein", "Black", "#101010", 9999],

  ["USPA Solid Polo", "Polo", "U.S. Polo Assn.", "Maroon", "#7A2B33", 1999],
  ["USPA Stripe Polo", "Polo", "U.S. Polo Assn.", "Navy/White", "#1F3557", 2199],
  ["USPA Tipped Collar Polo", "Polo", "U.S. Polo Assn.", "Forest", "#2F4A38", 2299],
  ["USPA Denim Shirt", "Shirts", "U.S. Polo Assn.", "Chambray", "#6E88A6", 2499],
  ["USPA Oxford Shirt", "Shirts", "U.S. Polo Assn.", "Pink", "#E2B5B5", 2299],
  ["USPA Graphic Tee", "T-Shirts", "U.S. Polo Assn.", "White", "#F4F4F0", 1299],
  ["USPA Slim Jean", "Denim", "U.S. Polo Assn.", "Blue", "#3F5B7D", 3299],
  ["USPA Cargo Trouser", "Trousers", "U.S. Polo Assn.", "Stone", "#A99C86", 2799],
  ["USPA Chino", "Trousers", "U.S. Polo Assn.", "Navy", "#28374F", 2599],
  ["USPA Quilted Jacket", "Outerwear", "U.S. Polo Assn.", "Navy", "#1E2C42", 5999],
  ["USPA Crew Sweater", "Knitwear", "U.S. Polo Assn.", "Grey Melange", "#9C9C97", 3299],

  ["Arrow Formal Shirt", "Shirts", "Arrow", "White", "#F5F5F1", 2799],
  ["Arrow Autofit Shirt", "Shirts", "Arrow", "Blue", "#3A6EA5", 2999],
  ["Arrow Print Shirt", "Shirts", "Arrow", "Ink", "#2B3550", 3199],
  ["Arrow Wrinkle Free Trouser", "Trousers", "Arrow", "Navy", "#20304C", 3199],
  ["Arrow Flat Front Trouser", "Trousers", "Arrow", "Charcoal", "#3C3C3A", 2999],
  ["Arrow Pique Polo", "Polo", "Arrow", "Wine", "#6B2739", 2499],
  ["Arrow Knit Blazer", "Outerwear", "Arrow", "Grey", "#5B5B58", 8999],
  ["Arrow Merino Pullover", "Knitwear", "Arrow", "Navy", "#22314B", 4499],

  ["FM Slim Tee", "T-Shirts", "Flying Machine", "Olive", "#5C6647", 999],
  ["FM Oversized Tee", "T-Shirts", "Flying Machine", "Sand", "#CFC0A8", 1199],
  ["FM Skinny Jean", "Denim", "Flying Machine", "Black", "#1c1c1c", 2199],
  ["FM Straight Jean", "Denim", "Flying Machine", "Light Wash", "#7C99B8", 2399],
  ["FM Printed Shirt", "Shirts", "Flying Machine", "Multi", "#C4703A", 1499],
  ["FM Utility Shirt", "Shirts", "Flying Machine", "Khaki", "#8E8460", 1699],
  ["FM Jogger", "Trousers", "Flying Machine", "Black", "#1a1a19", 1799],
  ["FM Hooded Sweatshirt", "Knitwear", "Flying Machine", "Grey", "#8F8F8A", 2299],
];

export const STYLES: Style[] = STYLE_SPECS.map(([name, category, brand, colour, colourHex, mrp], i) => {
  const r = rng(2000 + i);
  const waist = category === "Denim" || category === "Trousers";
  const sizes = category === "Accessories" ? (["M", "L", "XL"] as Size[]) : waist ? WAIST_SIZES : APPAREL_SIZES;
  const coreSizes = category === "Accessories" ? (["M", "L"] as Size[]) : waist ? CORE_WAIST : CORE_APPAREL;
  const prefix = brand.split(" ")[0].slice(0, 2).toUpperCase();
  return {
    id: `${prefix}-${category.slice(0, 3).toUpperCase()}-${4000 + i * 17}`,
    name,
    brand,
    category,
    story: pick(r, STORIES),
    mrp,
    colour,
    colourHex,
    coreSizes,
    sizes,
    bought: int(r, 4200, 21000),
    isNOS: r() < 0.22,
    launchedDaysAgo: int(r, 12, 132),
  };
});

export const styleById = (id: string) => STYLES.find((s) => s.id === id)!;

// ── Stock ────────────────────────────────────────────────────────────────────
//
// Sold28 and inStockDays are generated together so that True Rate of Sale is a
// meaningfully different number from naive ROS — which is the whole point of
// the metric.

export const STOCK: StockRow[] = (() => {
  const rows: StockRow[] = [];
  STORES.forEach((store, si) => {
    STYLES.forEach((style, yi) => {
      // Not every style is carried by every store — assortment is clustered by
      // grade and region, exactly as the buying team described it.
      const carry = rng(si * 977 + yi * 31)();
      const brandMatch = store.brand === style.brand;
      // Grade A doors carry nearly the full range; C doors carry a curated cut.
      const gradeGate = store.grade === "A" ? 0.97 : store.grade === "B" ? 0.92 : 0.86;
      // Tommy and Calvin Klein sit in the same PVH joint venture, so a limited
      // cross-carry between those two doors is real; anything else is not.
      const sisterBrands =
        (store.brand === "Tommy Hilfiger" && style.brand === "Calvin Klein") ||
        (store.brand === "Calvin Klein" && style.brand === "Tommy Hilfiger");
      if (!brandMatch && !sisterBrands) return;
      if (!brandMatch && carry > 0.35) return;
      if (brandMatch && carry > gradeGate) return;

      style.sizes.forEach((size, zi) => {
        const r = rng(si * 100003 + yi * 1009 + zi * 17);
        const isCore = style.coreSizes.includes(size);
        const popularity = isCore ? 1.6 : 0.7;
        const gradeMult = store.grade === "A" ? 1.35 : store.grade === "B" ? 1 : 0.6;

        // In-stock days drive the True ROS denominator.
        const inStockDays = isCore && r() < 0.34 ? int(r, 5, 19) : int(r, 18, 28);
        const dailyRate = (0.18 + r() * 0.75) * popularity * gradeMult;
        const sold28 = Math.round(dailyRate * inStockDays);
        // Markdown share rises sharply once a style passes its full-price
        // window. Calibrated so the estate-wide full-price sell-through lands
        // in the 72–75% band AFL reported, rather than a number the business
        // would not recognise as its own.
        const markdownShare = style.launchedDaysAgo > 100 ? 0.16 + r() * 0.16 : r() * 0.05;

        let onHand = Math.max(0, Math.round((r() * 14 + 2) * gradeMult * (isCore ? 1.1 : 1)));
        // Deliberately manufacture broken size sets on some hot styles.
        if (isCore && r() < 0.19) onHand = 0;

        rows.push({
          storeId: store.id,
          styleId: style.id,
          size,
          onHand,
          inTransit: r() < 0.14 ? int(r, 2, 12) : 0,
          reserved: onHand > 0 && r() < 0.1 ? 1 : 0,
          inStockDays,
          sold28,
          soldOnMarkdown28: Math.round(sold28 * markdownShare),
        });
      });
    });
  });
  return rows;
})();

// ── Norm calibration ─────────────────────────────────────────────────────────
//
// A store's norm is planned inventory, not display capacity — and the
// best-in-class band is 97–105% of it. Setting norms independently of the
// generated assortment would produce fill rates that are arithmetically true
// and commercially meaningless, so we calibrate them against the stock that
// actually exists and let the dispersion carry the story: some doors are thin,
// some are carrying more than they can sell.

(() => {
  STORES.forEach((store, i) => {
    const units = STOCK.filter((r) => r.storeId === store.id).reduce((a, r) => a + Math.max(0, r.onHand - r.reserved), 0);
    const r = rng(9000 + i);
    // Target fill spread across the estate: a handful of genuinely under-stocked
    // doors, a healthy middle, and a few carrying dead weight.
    const targetFill = 0.74 + r() * 0.42;
    store.norm = Math.max(60, Math.round(units / targetFill));
  });
})();

// ── Metric registry (the semantic layer) ─────────────────────────────────────

export const METRICS: MetricDef[] = [
  {
    id: "full_price_sell_through",
    label: "Full-price sell-through",
    definition:
      "Units sold at full price as a share of units received, measured across the season to date. Excludes markdown, staff purchase and inter-store transfers out.",
    formula: "SUM(units_sold WHERE discount_pct = 0) / SUM(units_received)",
    unit: "%",
    grain: "brand × season × store",
    owner: "Retail Planning",
    sources: ["SAP Finance", "POS"],
    freshness: "hourly",
    ageMinutes: 18,
    replaces: 4,
    verified: true,
    version: "v2.1",
  },
  {
    id: "true_ros",
    label: "True rate of sale",
    definition:
      "Units per day computed only over days the SKU was genuinely available and not on markdown. Stockout days are removed from the denominator so demand is not understated.",
    formula: "units_sold_at_full_price / days_in_stock_and_full_price",
    unit: "ratio",
    grain: "store × style × size",
    owner: "Retail Planning",
    sources: ["SAP Finance", "POS", "Arvind One"],
    freshness: "hourly",
    ageMinutes: 18,
    replaces: 2,
    verified: true,
    version: "v1.4",
  },
  {
    id: "size_set_health",
    label: "Size-set health",
    definition:
      "Share of carried styles where every core (pivotal) size is available on the floor. A style missing one core size is 'at risk'; missing two or more is 'broken'.",
    formula: "COUNT(styles WITH all core sizes onHand > 0) / COUNT(styles carried)",
    unit: "%",
    grain: "store × style",
    owner: "Retail Planning",
    sources: ["SAP Finance", "Arvind One"],
    freshness: "live",
    ageMinutes: 2,
    replaces: 0,
    verified: true,
    version: "v1.0",
  },
  {
    id: "sellable_stock",
    label: "Sellable stock on hand",
    definition:
      "Units physically in the store that can be sold today. On-hand less omni-reserved, less defective, less units awaiting outward. In-transit is reported separately, never added.",
    formula: "on_hand - reserved - defective - outward_staged",
    unit: "units",
    grain: "store × style × size",
    owner: "Store Operations",
    sources: ["SAP Finance", "Inventory ledger", "Omni"],
    freshness: "live",
    ageMinutes: 2,
    replaces: 3,
    verified: true,
    version: "v3.0",
  },
  {
    id: "cover_days",
    label: "Cover",
    definition: "How many days the current sellable stock will last at the True Rate of Sale.",
    formula: "sellable_stock / true_ros",
    unit: "days",
    grain: "store × style",
    owner: "Retail Planning",
    sources: ["Arvind One"],
    freshness: "hourly",
    ageMinutes: 18,
    replaces: 1,
    verified: true,
    version: "v1.2",
  },
  {
    id: "fill_rate",
    label: "Fill rate against norm",
    definition: "Sellable stock as a share of the store's planned inventory norm. Best-in-class band is 97–105%.",
    formula: "sellable_stock / store_norm",
    unit: "%",
    grain: "store",
    owner: "Retail Planning",
    sources: ["SAP Finance", "Replenishment engine"],
    freshness: "hourly",
    ageMinutes: 18,
    replaces: 2,
    verified: true,
    version: "v2.0",
  },
  {
    id: "conversion",
    label: "Conversion",
    definition: "Bills as a share of counted footfall for the trading day.",
    formula: "bills / footfall",
    unit: "%",
    grain: "store × day",
    owner: "Store Operations",
    sources: ["POS"],
    freshness: "live",
    ageMinutes: 6,
    replaces: 2,
    verified: true,
    version: "v1.1",
  },
  {
    id: "markdown_exposure",
    label: "Markdown exposure",
    definition:
      "Value at MRP of stock forecast to remain unsold at the end of the full-price window, valued at the expected markdown depth.",
    formula: "SUM(residual_units × mrp × expected_markdown_depth)",
    unit: "INR",
    grain: "brand × category",
    owner: "Finance & Planning",
    sources: ["SAP Finance", "Arvind One"],
    freshness: "daily",
    ageMinutes: 640,
    replaces: 1,
    verified: false,
    version: "v0.9",
  },
];

export const metricById = (id: string) => METRICS.find((m) => m.id === id)!;

// ── Staff KPI (from the SOP's KPI Sheet) ─────────────────────────────────────

export const STAFF: StaffKpi[] = [
  { name: "Rohit Sharma", storeId: STORES[0].id, sales: 182400, bills: 96, qty: 168, role: "SM" },
  { name: "Meera Pillai", storeId: STORES[0].id, sales: 141200, bills: 84, qty: 131, role: "ASM" },
  { name: "Aditya Rane", storeId: STORES[0].id, sales: 96800, bills: 71, qty: 92, role: "Sr.FA" },
  { name: "Sana Qureshi", storeId: STORES[0].id, sales: 88300, bills: 78, qty: 88, role: "FA" },
  { name: "Devansh Patil", storeId: STORES[0].id, sales: 51900, bills: 62, qty: 64, role: "FA" },
  { name: "Kiran Joshi", storeId: STORES[0].id, sales: 47600, bills: 59, qty: 61, role: "FA" },
];

// ── Cash exceptions ──────────────────────────────────────────────────────────

export const CASH_EXCEPTIONS: CashException[] = [
  {
    id: "CX-2041",
    storeId: STORES[0].id,
    date: "12 Aug 2026",
    tender: "Cash",
    posAmount: 15000,
    bankAmount: 0,
    delta: -15000,
    autoExplanation:
      "Deposit slip 88213 lodged 12 Aug 18:40, after the bank's 18:00 cut-off. Bank credit posted 13 Aug 09:12. Timing difference, not a shortage — matched automatically against the deposit slip image.",
    confidence: 0.97,
    status: "auto_cleared",
  },
  {
    id: "CX-2042",
    storeId: STORES[0].id,
    date: "12 Aug 2026",
    tender: "Card",
    posAmount: 248900,
    bankAmount: 248410,
    delta: -490,
    autoExplanation:
      "Acquirer MDR of ₹490 on 14 settled transactions. Recurs daily; matched to the acquirer fee schedule.",
    confidence: 0.99,
    status: "auto_cleared",
  },
  {
    id: "CX-2043",
    storeId: STORES[0].id,
    date: "12 Aug 2026",
    tender: "UPI",
    posAmount: 96400,
    bankAmount: 92900,
    delta: -3500,
    autoExplanation:
      "One UPI collection of ₹3,500 shows 'pending' at the PSP for 19h against invoice INV-77120. Outside the normal 4h window — needs a human eye before it ages further.",
    confidence: 0.55,
    status: "needs_review",
  },
  {
    id: "CX-2044",
    storeId: STORES[3].id,
    date: "12 Aug 2026",
    tender: "Cash",
    posAmount: 61200,
    bankAmount: 55200,
    delta: -6000,
    autoExplanation:
      "No deposit slip captured for ₹6,000. Petty cash sheet shows a ₹6,000 alteration payment on the same day with no bill attached. Two unmatched entries of the same value — likely the same event, but neither is evidenced.",
    confidence: 0.41,
    status: "escalated",
  },
];

// ── Notifications ────────────────────────────────────────────────────────────

export const NOTIFICATIONS: Notification[] = [
  {
    id: "N1",
    at: NOW - 22 * 60_000,
    title: "Core size gone on a top-10 style",
    body: "Flag Logo Cotton Polo — size L is at zero at Phoenix Palladium with 6 days of full-price window left. 3 donors within 9 km.",
    severity: "critical",
    role: "store",
  },
  {
    id: "N2",
    at: NOW - 64 * 60_000,
    title: "Price revision published by Commercial",
    body: "11 styles repriced overnight. 41 tag reprints created automatically across 7 stores.",
    severity: "info",
    role: "all",
  },
  {
    id: "N3",
    at: NOW - 3 * HOUR,
    title: "Lift out of service — SLA at 62%",
    body: "Quest Kolkata. Vendor dispatched automatically; quote of ₹42,000 is above the store threshold and is waiting on regional approval.",
    severity: "warn",
    role: "planner",
  },
  {
    id: "N4",
    at: NOW - 5 * HOUR,
    title: "Pre-season reallocation window opens",
    body: "AW26 drop 1 lands in 21 days. Latest store performance differs from the buy plan on 6 clusters.",
    severity: "info",
    role: "planner",
  },
];

// ── Current-state system inventory (used by the As-Is / To-Be view) ──────────

export interface LegacySystem {
  name: string;
  role: string;
  users: string;
  pain: string;
  keep: "keep" | "absorb" | "retire";
}

export const LEGACY_SYSTEMS: LegacySystem[] = [
  { name: "SAP", role: "ERP / system of record — inventory, finance", users: "HO finance, planning", pain: "Stores never see it; planners export to Excel", keep: "keep" },
  { name: "D365 + POS", role: "Store execution, billing, inventory requests", users: "Stores, backend ops", pain: "Transactional UI, no decision context", keep: "keep" },
  { name: "Replenishment engine", role: "Replenishment + IST engine", users: "SCM, planning", pain: "Suggests moves; humans still email to execute them", keep: "keep" },
  { name: "Power BI", role: "25 named reports", users: "HO, RO, circle managers", pain: "Refreshes at 9 PM; store-level action absent", keep: "absorb" },
  { name: "Loyalty", role: "CRM / loyalty", users: "CRM team, stores", pain: "Mobile capture is a manual floor-walk check", keep: "keep" },
  { name: "Omni", role: "Omni order download and fulfilment", users: "Omni champ", pain: "Separate login, paper omni register", keep: "absorb" },
  { name: "Scanner app", role: "Barcode scan for stocktake / inward", users: "Store staff", pain: "Standalone, no link to tasks or stock truth", keep: "absorb" },
  { name: "Ticketing app", role: "Facility and maintenance tickets", users: "Store manager", pain: "Feeds a slow email → vendor → quote → PO chain", keep: "absorb" },
  { name: "ALM portal", role: "Assorted store admin", users: "Store staff", pain: "Another login, another password", keep: "absorb" },
  { name: "Excel", role: "The actual working layer", users: "Everyone", pain: "Store planning, reallocation, SOH recon, WBC lists", keep: "retire" },
  { name: "23 paper registers", role: "Attendance, stock, cash, briefing, floor walk", users: "Store staff", pain: "South maintains 23, West maintains 6 — same company", keep: "retire" },
  { name: "Email", role: "IST codes, tag reprints, shortage claims, escalations", users: "Everyone", pain: "The de-facto workflow engine with no SLA and no audit", keep: "retire" },
];

export const BRANDS: Brand[] = ["Tommy Hilfiger", "Calvin Klein", "U.S. Polo Assn.", "Arrow", "Flying Machine"];
export const REGIONS: Region[] = ["North", "South", "East", "West"];
export const CATEGORIES: Category[] = ["Polo", "Shirts", "T-Shirts", "Denim", "Trousers", "Outerwear", "Knitwear", "Accessories"];

export { APPAREL_SIZES, WAIST_SIZES };

// ── Seeded workflow objects ──────────────────────────────────────────────────
// These are the "already in flight" items so the demo opens with a live board
// rather than an empty state.

export const SEED_TICKETS: Ticket[] = [
  {
    id: "TK-8801",
    kind: "maintenance",
    storeId: STORES[12].id,
    title: "Passenger lift out of service",
    assetId: "AST-LIFT-02",
    assetName: "Lift — customer side",
    raisedBy: "Arnab Ghosh",
    raisedAt: NOW - 3 * DAY - 4 * HOUR,
    status: "awaiting_approval",
    slaHours: 96,
    escalationLevel: 1,
    vendor: "Otis Service — East",
    quoteValue: 42000,
    approvalThreshold: 25000,
    photoProof: true,
    legacyDays: 21,
    events: [
      { at: NOW - 3 * DAY - 4 * HOUR, actor: "Arnab Ghosh", label: "Raised by QR scan on the lift panel", system: "Arvind One" },
      { at: NOW - 3 * DAY - 3.9 * HOUR, actor: "Arvind One", label: "Auto-dispatched to mapped vendor for Lifts · Kolkata", system: "Arvind One" },
      { at: NOW - 2 * DAY, actor: "Otis Service", label: "Site visit completed, quote ₹42,000 uploaded", system: "Arvind One" },
      { at: NOW - 2 * DAY + HOUR, actor: "Arvind One", label: "Quote above ₹25,000 store threshold — routed to Area Manager", system: "Arvind One" },
    ],
  },
  {
    id: "TK-8802",
    kind: "maintenance",
    storeId: STORES[0].id,
    title: "Two spot lights out on the window bay",
    assetId: "AST-LGT-11",
    assetName: "Window track lighting",
    raisedBy: "Rohit Sharma",
    raisedAt: NOW - 26 * HOUR,
    status: "in_progress",
    slaHours: 48,
    escalationLevel: 0,
    vendor: "Brightline Electricals — West",
    quoteValue: 3200,
    approvalThreshold: 25000,
    photoProof: true,
    legacyDays: 9,
    events: [
      { at: NOW - 26 * HOUR, actor: "Rohit Sharma", label: "Raised by QR scan; photo attached", system: "Arvind One" },
      { at: NOW - 25.8 * HOUR, actor: "Arvind One", label: "Auto-dispatched — below threshold, no approval needed", system: "Arvind One" },
      { at: NOW - 4 * HOUR, actor: "Brightline", label: "Technician assigned, ETA 14:00 today", system: "Arvind One" },
    ],
  },
  {
    id: "TK-8803",
    kind: "tag_reprint",
    storeId: STORES[0].id,
    title: "Price tag reprint — 11 styles repriced overnight",
    raisedBy: "Arvind One",
    raisedAt: NOW - 64 * 60_000,
    status: "auto_dispatched",
    slaHours: 24,
    escalationLevel: 0,
    photoProof: false,
    legacyDays: 32,
    styleId: STYLES[0].id,
    qty: 41,
    approvalThreshold: 0,
    events: [
      { at: NOW - 64 * 60_000, actor: "Commercial", label: "Price revision published for 11 styles", system: "Arvind One" },
      { at: NOW - 63 * 60_000, actor: "Arvind One", label: "41 affected units identified from live stock; reprint job created", system: "Arvind One" },
      { at: NOW - 62 * 60_000, actor: "Arvind One", label: "Tags queued to in-store printer; task assigned to Meera Pillai", system: "Arvind One" },
    ],
  },
  {
    id: "TK-8804",
    kind: "vm",
    storeId: STORES[5].id,
    title: "Window changeover — AW26 drop 1 not implemented",
    raisedBy: "Neha Iyer",
    raisedAt: NOW - 5 * DAY,
    status: "breached",
    slaHours: 72,
    escalationLevel: 2,
    photoProof: false,
    approvalThreshold: 0,
    legacyDays: 14,
    events: [
      { at: NOW - 5 * DAY, actor: "VM Team", label: "Planogram published with reference photos", system: "Arvind One" },
      { at: NOW - 2 * DAY, actor: "Arvind One", label: "No photo submitted — escalated to Area Manager", system: "Arvind One" },
      { at: NOW - 1 * DAY, actor: "Arvind One", label: "Still open — escalated to Regional Manager", system: "Arvind One" },
    ],
  },
  {
    id: "TK-8805",
    kind: "it",
    storeId: STORES[8].id,
    title: "POS terminal 2 dropping network during peak",
    assetId: "AST-POS-02",
    assetName: "POS terminal 2",
    raisedBy: "Nikhil Rao",
    raisedAt: NOW - 9 * HOUR,
    status: "open",
    slaHours: 8,
    escalationLevel: 1,
    photoProof: false,
    approvalThreshold: 25000,
    legacyDays: 5,
    events: [
      { at: NOW - 9 * HOUR, actor: "Nikhil Rao", label: "Raised from the store app", system: "Arvind One" },
      { at: NOW - HOUR, actor: "Arvind One", label: "SLA 8h exceeded — escalated to Area Manager", system: "Arvind One" },
    ],
  },
];

export const SEED_OMNI: OmniOrder[] = [
  {
    id: "OM-55021",
    channel: "Tommy.com",
    storeId: STORES[0].id,
    styleId: STYLES[3].id,
    size: "L",
    qty: 1,
    value: 4299,
    placedAt: NOW - 40 * 60_000,
    status: "locating",
    findMinutes: 6,
    events: [{ at: NOW - 40 * 60_000, actor: "Omni engine", label: "Routed to store — warehouse out of stock", system: "Omni" }],
  },
  {
    id: "OM-55022",
    channel: "Myntra",
    storeId: STORES[0].id,
    styleId: STYLES[6].id,
    size: "M",
    qty: 2,
    value: 4598,
    placedAt: NOW - 2.4 * HOUR,
    status: "packed",
    findMinutes: 3,
    events: [
      { at: NOW - 2.4 * HOUR, actor: "Omni engine", label: "Routed to store", system: "Omni" },
      { at: NOW - 2 * HOUR, actor: "Sana Qureshi", label: "Located and packed; mis-pick check passed", system: "Arvind One" },
    ],
  },
  {
    id: "OM-55023",
    channel: "Amazon",
    storeId: STORES[0].id,
    styleId: STYLES[8].id,
    size: "32",
    qty: 1,
    value: 6499,
    placedAt: NOW - 5 * HOUR,
    status: "handed_over",
    findMinutes: 4,
    podSignedBy: "Ekart — Rider 4471",
    podAt: NOW - 3 * HOUR,
    events: [
      { at: NOW - 5 * HOUR, actor: "Omni engine", label: "Routed to store", system: "Omni" },
      { at: NOW - 4 * HOUR, actor: "Aditya Rane", label: "Packed", system: "Arvind One" },
      { at: NOW - 3 * HOUR, actor: "Ekart Rider 4471", label: "Digital POD signed in app — photo + signature captured", system: "Arvind One" },
    ],
  },
  {
    id: "OM-55019",
    channel: "Flipkart",
    storeId: STORES[3].id,
    styleId: STYLES[1].id,
    size: "XL",
    qty: 1,
    value: 3299,
    placedAt: NOW - 27 * HOUR,
    status: "cancelled",
    findMinutes: 22,
    rootCause: "phantom_stock",
    events: [
      { at: NOW - 27 * HOUR, actor: "Omni engine", label: "Routed to store", system: "Omni" },
      { at: NOW - 26 * HOUR, actor: "Sneha Deshpande", label: "Unit not found after 22 minutes", system: "Arvind One" },
      { at: NOW - 25.8 * HOUR, actor: "Arvind One", label: "Root cause logged: phantom stock. Last 3 counts also disagreed on this SKU.", system: "Arvind One" },
    ],
  },
  {
    id: "OM-55020",
    channel: "AJIO",
    storeId: STORES[9].id,
    styleId: STYLES[16].id,
    size: "S",
    qty: 1,
    value: 2499,
    placedAt: NOW - 8 * HOUR,
    status: "reassigned",
    findMinutes: 12,
    reassignedTo: STORES[8].id,
    events: [
      { at: NOW - 8 * HOUR, actor: "Omni engine", label: "Routed to UB City", system: "Omni" },
      { at: NOW - 7.7 * HOUR, actor: "Arvind One", label: "Not located within 10-minute SLA — auto-reassigned to Phoenix Marketcity BLR instead of cancelling", system: "Arvind One" },
      { at: NOW - 7 * HOUR, actor: "Nikhil Rao", label: "Located and packed at the reassigned store", system: "Arvind One" },
    ],
  },
  {
    id: "OM-55010",
    channel: "Tommy.com",
    storeId: STORES[0].id,
    styleId: STYLES[11].id,
    size: "L",
    qty: 1,
    value: 10999,
    placedAt: NOW - 3 * DAY,
    status: "return_pending",
    findMinutes: 2,
    podSignedBy: "Delhivery — Rider 2210",
    podAt: NOW - 3 * DAY + 2 * HOUR,
    events: [
      { at: NOW - 3 * DAY, actor: "Omni engine", label: "Routed to store", system: "Omni" },
      { at: NOW - 3 * DAY + 2 * HOUR, actor: "Delhivery Rider 2210", label: "Digital POD signed", system: "Arvind One" },
      { at: NOW - 10 * HOUR, actor: "Customer", label: "Cancelled after dispatch — return initiated", system: "Omni" },
      { at: NOW - 9 * HOUR, actor: "Arvind One", label: "Return leg tracked against the original POD. Unit will re-enter stock only on scan-in.", system: "Arvind One" },
    ],
  },
];

export const SEED_OUTWARD: OutwardBatch[] = [
  {
    id: "OB-3310",
    storeId: STORES[14].id,
    kind: "EOSS pullback",
    totalUnits: 2500,
    createdAt: NOW - 6 * HOUR,
    status: "packed",
    videoProof: true,
    lrNumber: "LR-99312",
    legacyDaysMin: 4,
    legacyDaysMax: 40,
    codes: splitOutward(2500, "OB-3310").map((c, i) => ({ ...c, packed: i < 7 })),
    events: [
      { at: NOW - 6 * HOUR, actor: "Arvind One", label: "Pullback list generated from residual sell-through — 2,500 units across 38 styles", system: "Arvind One" },
      { at: NOW - 5.8 * HOUR, actor: "Arvind One", label: "Auto-split into 9 transfer codes of ≤300 units; pick paths sequenced by rack", system: "Arvind One" },
      { at: NOW - 2 * HOUR, actor: "Farhan Sheikh", label: "Packing completed under camera; carton weights captured", system: "Arvind One" },
    ],
  },
];
