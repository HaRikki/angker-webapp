// The Tailwind config is inlined here on purpose: it no longer depends on tailwind.config.* being found
// (a missing/unreadable config made the build fail with "The `bg-bg` class does not exist").
const path = require("path");
const colors = require("tailwindcss/colors");
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
module.exports = {
  plugins: {
    tailwindcss: {
      darkMode: "class",
      content: [path.join(__dirname, "src/**/*.{ts,tsx}")],
      theme: {
        extend: {
          colors: { bg: c("bg"), surface: c("surface"), fg: c("fg"), muted: c("muted"), line: c("line"), cyan: c("cyan"), violet: { ...colors.violet, DEFAULT: c("violet") } },
          fontFamily: { sans: ["var(--font-sans)", "var(--font-khmer)", "system-ui", "sans-serif"] },
        },
      },
      plugins: [],
    },
    autoprefixer: {},
  },
};
