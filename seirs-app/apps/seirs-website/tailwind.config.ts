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
