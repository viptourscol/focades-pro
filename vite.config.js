import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim()

  return {
    plugins: [react()],
    server: {
      proxy: supabaseUrl
        ? {
            '/functions/v1': {
              target: supabaseUrl,
              changeOrigin: true,
              secure: true,
            },
          }
        : undefined,
    },
  }
})
