import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette (Bayanatix logo)
        brand: {
          deep:    "#201C55",
          navy:    "#2A336D",
          violet:  "#4D4B8D",
          purple:  "#6058A0",
          sky:     "#7AA1D0",
          light:   "#81B4E1",
        },
        // Surfaces
        ink:        "#0f1238",
        "ink-soft": "#50568a",
        muted:      "#8089b3",
        line:       "#e6e9f5",
        "line-soft":"#eef0f8",
        canvas:     "#f4f6fc",
        "canvas-soft":"#fafbff",
        sidebar:    "#1d1d4a",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "10px",
        md: "12px",
        lg: "14px",
        xl: "18px",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(15,18,56,0.04)",
        sm: "0 4px 14px rgba(15,18,56,0.06)",
        md: "0 14px 40px rgba(15,18,56,0.08)",
        lg: "0 24px 70px rgba(15,18,56,0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
