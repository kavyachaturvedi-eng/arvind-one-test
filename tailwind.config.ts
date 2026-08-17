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
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "sans-serif"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      borderRadius: {
        xl2: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,11,11,0.04), 0 1px 1px rgba(11,11,11,0.03)",
        pop: "0 12px 32px rgba(11,11,11,0.14), 0 2px 8px rgba(11,11,11,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
