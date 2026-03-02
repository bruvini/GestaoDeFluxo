/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'blue-navy': '#002B49', // Estimativa baseada no padrão
      }
    },
  },
  plugins: [],
}
