import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/', // <--- Make sure this line exists and is set to '/'
  plugins: [react()],
  // ... any other configurations you might have
})