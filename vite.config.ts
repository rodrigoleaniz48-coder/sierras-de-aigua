import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages served desde https://<usuario>.github.io/sierras-de-aigua/
// El base path debe coincidir con el nombre del repo.
export default defineConfig({
  plugins: [react()],
  base: '/sierras-de-aigua/',
})
