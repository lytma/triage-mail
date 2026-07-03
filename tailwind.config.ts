import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--color-border)",
        input: "var(--color-border)",
        ring: "var(--color-primary)",
        background: "var(--color-bg)",
        foreground: "var(--color-fg)",
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-fg)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          foreground: "var(--color-secondary-fg)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-fg)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-fg)",
        },
        card: {
          DEFAULT: "var(--color-card)",
          foreground: "var(--color-card-fg)",
        },
        destructive: {
          DEFAULT: "#DC2626",
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "#16A34A",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-fg)",
        },
        popover: {
          DEFAULT: "var(--color-card)",
          foreground: "var(--color-card-fg)",
        },
      },
      borderRadius: {
        lg: "var(--radius-card)",
        md: "var(--radius)",
        sm: "calc(var(--radius) - 0.125rem)",
        btn: "var(--radius-btn)",
        card: "var(--radius-card)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        btn: "var(--shadow-btn)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
