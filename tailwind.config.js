/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        oliva: {
          50:  '#f7f8f2',
          100: '#eceee0',
          200: '#d4d9b8',
          300: '#b7c088',
          400: '#96a25c',
          500: '#7a8842',
          600: '#5f6b33',
          700: '#4a5228',
          800: '#3a4120',
          900: '#2e331b',
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
