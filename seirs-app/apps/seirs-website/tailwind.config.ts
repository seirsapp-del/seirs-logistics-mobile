import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#0F2B4C",
        "navy-dark": "#1a3a5c",
        sky: "#3A7BD5",
        "off-white": "#F5F5F0",
        "text-dark": "#1F2937",
        "text-muted": "#6B7280",
        "success-green": "#16A34A",
        "warning-amber": "#D97706",
        // The brand yellow, added as a token 2026-08-15. It was already in
        // use, but only ever as the literal #FFBE0B pasted into class names
        // across the homepage, which is why nothing could be changed in one
        // place. Same value, now named.
        yellow: "#FFBE0B",
      },

      /**
       * Type scale, added 2026-08-15 from WEBSITE-DESIGN-AUDIT.md.
       *
       * The audit found no scale at all: five different h1 sizes across the
       * phone pages and three across desktop, including contact's desktop h1
       * at 36px while its siblings were 48-60. Those numbers were never
       * chosen together, they accumulated section by section.
       *
       * Each step carries its own line-height, because the reason headings
       * looked wrong at small sizes was as much leading as size. Mobile
       * values GROW rather than shrink: the measured gap against Stripe (34),
       * Paystack (40) and Flutterwave (50) was our 26px hero.
       *
       * Purely additive. Nothing uses these until a page is migrated, so
       * defining them changes no pixels.
       */
      fontSize: {
        "display-sm": ["40px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-lg": ["64px", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        "title-sm":   ["32px", { lineHeight: "1.1",  letterSpacing: "-0.015em" }],
        "title-lg":   ["48px", { lineHeight: "1.08", letterSpacing: "-0.015em" }],
        "section-sm": ["26px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "section-lg": ["36px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "sub-sm":     ["18px", { lineHeight: "1.3" }],
        "sub-lg":     ["20px", { lineHeight: "1.3" }],
        "body-lg":    ["17px", { lineHeight: "1.6" }],
        "body-lg-d":  ["18px", { lineHeight: "1.6" }],
        "body-sm":    ["15px", { lineHeight: "1.6" }],
        "body-md":    ["16px", { lineHeight: "1.6" }],
        // The floor. Nothing on the site may go below this: today we ship
        // 9px trust labels and 10px chip text, both unreadable on an A30.
        "caption-sm": ["13px", { lineHeight: "1.4" }],
        "caption-lg": ["14px", { lineHeight: "1.4" }],
      },

      /**
       * Spacing scale for section rhythm, same source. The current per-section
       * padding was hand-tuned value by value across a day of feedback, which
       * is why no two sections breathe alike.
       */
      spacing: {
        "section-sm": "48px",
        "section-lg": "96px",
        "block-sm": "24px",
        "block-lg": "40px",
        "card-sm": "20px",
        "card-lg": "28px",
      },
      borderRadius: {
        card: "14px",
        btn: "10px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
