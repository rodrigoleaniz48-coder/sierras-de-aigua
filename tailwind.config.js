/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        oliva: {
          50:  '#f4f7f2',
          100: '#e6ede0',
          200: '#cad6c2',
          300: '#a9bb9e',
          400: '#94a888',
          500: '#829378',
          600: '#6b7c62',
          700: '#57654f',
          800: '#45503f',
          900: '#364032',
        },
        aceite: {
          400: '#d5a641',
          500: '#c08f2b',
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
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
