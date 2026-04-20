import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        header: "hsl(var(--header))",
        "sidebar-border": "hsl(var(--sidebar-border))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Real estate brand colours — Rightmove-style teal palette
        brand: {
          teal: "#14C6A3",    // Primary brand teal
          "teal-dark": "#0F8F7A", // Secondary teal
          "teal-deep": "#0A6B5A", // Dark teal
          cyan: "#0F8FA0",    // Cyan accent
          yellow: "#F5B000",  // Warm yellow
          orange: "#F28C18",  // Orange accent
          navy: "#1E2235",    // Dark navy text / dark mode bg
          white: "#FFFFFF",
        },
        // Domain colours
        lease: {
          draft: "#94a3b8",
          pending: "#f59e0b",
          active: "#10b981",
          notice: "#f97316",
          closed: "#6b7280",
          terminated: "#ef4444",
        },
        payment: {
          scheduled: "#94a3b8",
          due: "#f59e0b",
          overdue: "#ef4444",
          settled: "#10b981",
          initiated: "#6366f1",
          pending: "#f59e0b",
          completed: "#10b981",
          failed: "#ef4444",
          reconciled: "#8b5cf6",
        },
        inspection: {
          scheduled: "#6366f1",
          in_progress: "#f59e0b",
          completed: "#10b981",
          approved: "#0ea5e9",
        },
        onboarding: {
          invited: "#94a3b8",
          started: "#6366f1",
          submitted: "#f59e0b",
          approved: "#10b981",
          activated: "#0ea5e9",
        },
      },
      borderRadius: {
        lg: "6px",
        md: "5px",
        sm: "4px",
        xl: "6px",
        "2xl": "8px",
        "3xl": "12px",
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "var(--font-inter)", "Inter", ...fontFamily.sans],
        heading: ["var(--font-poppins)", "Poppins", ...fontFamily.sans],
        body: ["var(--font-inter)", "Inter", ...fontFamily.sans],
        mono: ["JetBrains Mono", ...fontFamily.mono],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
      backgroundImage: {
        shimmer:
          "linear-gradient(90deg, transparent 0%, hsl(var(--muted)) 50%, transparent 100%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
