import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface-1)",
        plane: "var(--plane)",
        raised: "var(--surface-2)",
        ink: "var(--text-primary)",
        ink2: "var(--text-secondary)",
        muted: "var(--text-muted)",
        line: "var(--line)",
        grid: "var(--grid)",
        brand: "var(--brand)",
        brandsoft: "var(--brand-soft)",
        good: "var(--status-good)",
        warn: "var(--status-warning)",
        serious: "var(--status-serious)",
        crit: "var(--status-critical)",
        s1: "var(--series-1)",
        s2: "var(--series-2)",
        s3: "var(--series-3)",
        s4: "var(--series-4)",
        s5: "var(--series-5)",
        s6: "var(--series-6)",
        s7: "var(--series-7)",
        s8: "var(--series-8)",
      },
      fontFamily: {
        sans: ["Inter Tight", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["Source Serif 4", "Georgia", "serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      borderRadius: {
        xl2: "0px",
      },
      boxShadow: {
        // Doctrine: depth comes from rules and spacing, not elevation.
        card: "none",
        // The single approved shadow — the page shadow, used only on modals.
        pop: "0 1px 0 rgba(0,0,0,.04), 0 30px 60px -30px rgba(0,0,0,.18)",
      },
    },
  },
  plugins: [],
};

export default config;
