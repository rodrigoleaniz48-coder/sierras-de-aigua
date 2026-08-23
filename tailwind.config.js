/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verde oliva ajustado a la direccion "Campo moderno": mismos tonos, mas neutro/profundo en el extremo.
        oliva: {
          50:  '#f5f6f4',
          100: '#ecefe9',
          200: '#dfe4dc',
          300: '#c0c8bb',
          400: '#94a088',
          500: '#7d867a',
          600: '#5a6a52',
          700: '#4b5443',
          800: '#3d4a37',
          900: '#1c221a',
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
