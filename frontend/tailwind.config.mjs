/** @type {import('tailwindcss').Config} */
// Semantic tokens mapped 1-to-1 to CSS variables in `src/styles/global.css`.
// Switching theme (light/dark) = a single toggle on `<html data-theme="...">`.
// The real tokens live in `src/styles/themes.ts` (single source of truth)
// and are injected as CSS vars in `global.css`.

export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        fg: "var(--color-fg)",
        "fg-muted": "var(--color-fg-muted)",
        primary: "var(--color-primary)",
        "primary-fg": "var(--color-primary-fg)",
        "primary-hover": "var(--color-primary-hover)",
        "primary-soft": "var(--color-primary-soft)",
        "primary-soft-fg": "var(--color-primary-soft-fg)",
        ring: "var(--color-ring)",
        accent: "var(--color-accent)",
        "accent-fg": "var(--color-accent-fg)",
        secondary: "var(--color-secondary)",
        muted: "var(--color-muted)",
        border: "var(--color-border)",
        // Derived semantic states (cadence_status + similar)
        "status-ok": "var(--color-status-ok)",
        "status-ok-fg": "var(--color-status-ok-fg)",
        "status-due-soon": "var(--color-status-due-soon)",
        "status-due-soon-fg": "var(--color-status-due-soon-fg)",
        "status-overdue": "var(--color-status-overdue)",
        "status-overdue-fg": "var(--color-status-overdue-fg)",
        "status-unknown": "var(--color-status-unknown)",
        "status-unknown-fg": "var(--color-status-unknown-fg)",
      },
      fontFamily: {
        sans: "var(--font-family-sans)",
        display: "var(--font-family-display)",
        mono: "var(--font-family-mono)",
      },
      fontWeight: {
        regular: "var(--font-weight-regular)",
        medium: "var(--font-weight-medium)",
        bold: "var(--font-weight-bold)",
        display: "var(--font-weight-display)",
      },
      borderWidth: {
        DEFAULT: "var(--border-width-default)",
        thin: "var(--border-width-thin)",
        thick: "var(--border-width-thick)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        none: "var(--shadow-none)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        // Legacy alias: same soft shadows, kept so nothing breaks.
        "neobrutal-sm": "var(--shadow-sm)",
        "neobrutal": "var(--shadow-md)",
        "neobrutal-lg": "var(--shadow-lg)",
      },
      transitionDuration: {
        fast: "var(--motion-duration-fast)",
        normal: "var(--motion-duration-normal)",
        slow: "var(--motion-duration-slow)",
      },
      transitionTimingFunction: {
        standard: "var(--motion-easing-standard)",
        "ease-out": "var(--motion-easing-ease-out)",
      },
    },
  },
  plugins: [],
};
