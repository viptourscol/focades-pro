/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores extraídos exactamente de tu archivo original
        primary: "#0D2C54",
        secondary: "#1A5A96",
        accent: "#F9A03F",
        background: "#F5F7FA",
        border: "#dee2e6",
        success: "#28a745",
        error: "#dc3545",
      },
      borderRadius: {
        'custom': '8px', // El radio que usas en el original
      }
    },
  },
  plugins: [],
}