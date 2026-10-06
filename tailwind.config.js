/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verde oliva "Campo moderno". Driven por variables CSS (ver index.css) para
        // soportar modo claro/oscuro: en oscuro la rampa se invierte (50 = fondo, 900 = texto).
        oliva: {
          50:  'rgb(var(--oliva-50) / <alpha-value>)',
          100: 'rgb(var(--oliva-100) / <alpha-value>)',
          200: 'rgb(var(--oliva-200) / <alpha-value>)',
          300: 'rgb(var(--oliva-300) / <alpha-value>)',
          400: 'rgb(var(--oliva-400) / <alpha-value>)',
          500: 'rgb(var(--oliva-500) / <alpha-value>)',
          600: 'rgb(var(--oliva-600) / <alpha-value>)',
          700: 'rgb(var(--oliva-700) / <alpha-value>)',
          800: 'rgb(var(--oliva-800) / <alpha-value>)',
          900: 'rgb(var(--oliva-900) / <alpha-value>)',
        },
        aceite: {
          400: '#d5a641',
          500: '#c48416',
          600: '#a17420',
        },
        tierra: {
          100: '#f2ebe0',
          300: '#c8b18a',
          600: '#7a5a34',
          800: '#4a3620',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
