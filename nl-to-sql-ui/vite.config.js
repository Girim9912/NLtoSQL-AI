// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/nl-to-sql-ui/', // 👈 This must match your repo name
  plugins: [react()],
})
