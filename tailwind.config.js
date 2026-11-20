/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Segoe UI",
          "Inter",
          "sans-serif",
        ],
        mono: ["SF Mono", "JetBrains Mono", "Cascadia Code", "monospace"],
      },
      colors: {
        obsidian: "#07090E",
        notch: "#000000",
      },
    },
  },
  plugins: [],
};
