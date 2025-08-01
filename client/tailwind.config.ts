import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["src/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      container: {
        center: true,
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        agentvooc: {
          "primary-bg": "hsl(var(--agentvooc-primary-bg))",
          "secondary-bg": "hsl(var(--agentvooc-secondary-bg))",
          primary: "hsl(var(--agentvooc-primary))",
          "primary-foreground": "hsl(var(--agentvooc-primary-foreground))",
          "primary-card":"hsl(var(--agentvooc-primary-card-bg))",
          secondary: "hsl(var(--agentvooc-secondary))",
          "secondary-accent": "hsl(var(--agentvooc-secondary-accent))",
          "secondary-dark": "hsl(var(--agentvooc-secondary-dark))",
          "secondary-card": "hsl(var(--agentvooc-secondary-card-bg))",
          button: "hsl(var(--agentvooc-button))",
          "button-bg": "hsl(var(--agentvooc-button-bg))",
          "button-bg-hover": "hsl(var(--agentvooc-button-bg-hover))",
          "button-text-on-dark:": "hsl(var(--agentvooc-button-text-on-dark:))",
          "button-text": "hsl(var(--agentvooc-button-text))",
          "button-text-hover": "hsl(var(--agentvooc-button-text-hover))",
          accent: "hsl(var(--agentvooc-accent))",
          "accent-dark": "hsl(var(--agentvooc-accent-dark))",
          "accent-muted": "hsl(var(--agentvooc-accent-muted))",
          stars: "hsl(var(--agentvooc-stars))",
          
          glow: "hsl(var(--agentvooc-glow))",
          border: "hsl(var(--agentvooc-border))",
          error: "hsl(var(--agentvooc-error))",
          "error-foreground": "hsl(var(--agentvooc-error-foreground))",
          success: "hsl(var(--agentvooc-success))",
          "success-foreground": "hsl(var(--agentvooc-success-foreground))",
          card: "hsl(var(--agentvooc-card))",
          "card-bg":"hsl(var(--agentvooc-card-bg))",
          "card-header":"hsl(var(--agentvooc-card-header))",
          "card-title":"hsl(var(--agentvooc-card-title))",
          "card-description":"hsl(var(--agentvooc-card-description))",
          "card-content":"hsl(var(--agentvooc-card-content))",
          text: "hsl(var(--agentvooc-text))",
          "text-h1":"hsl(var(--agentvooc-text-h1))",
          "text-h2":"hsl(var(--agentvooc-text-h2))",
          "text-h3":"hsl(var(--agentvooc-text-h3))",
          "text-h4":"hsl(var(--agentvooc-text-h4))",
          "text-h5":"hsl(var(--agentvooc-text-h5))",
          "text-h6":"hsl(var(--agentvooc-text-h6))",
          "text-p":"hsl(var(--agentvooc-text-p))",
          "text-li":"hsl(var(--agentvooc-text-li))",
          "text-label":"hsl(var(--agentvooc-text-label))",
          "text-navbar-footer":"hsl(var(--agentvooc-text-navbar-footer))",
          "text-hero-title":"hsl(var(--agentvooc-text-hero-title))",
        },
      },
    },
  },
  plugins: [tailwindAnimate],
} satisfies Config;

