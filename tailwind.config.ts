import type { Config } from "tailwindcss";

/**
 * darkMode: "class" — a ThemeToggle flips the `.dark` class on <html>,
 * so `dark:` variants activate deliberately instead of tracking the OS
 * setting via prefers-color-scheme.
 *
 * Brand colors route through CSS variables so each shade flips between
 * light and dark modes automatically. The actual RGB values live in
 * globals.css under :root and .dark. Light mode uses Christine's
 * Rusty-Spice / Light-Bronze palette; dark mode keeps the original
 * green family so the existing design is unchanged.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
