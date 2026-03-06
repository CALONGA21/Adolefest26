import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '..', '');
  const explicitAllowedHost = env.VITE_ALLOWED_HOST?.trim();

  return {
    envDir: '..',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.MERCADO_PAGO_PUBLIC_KEY': JSON.stringify(
        env.MERCADO_PAGO_PUBLIC_KEY || env.VITE_MERCADO_PAGO_PUBLIC_KEY,
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify-file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      host: true,
      allowedHosts: explicitAllowedHost
        ? [explicitAllowedHost, '.ngrok-free.dev']
        : ['.ngrok-free.dev'],
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
