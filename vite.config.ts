import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const cartoApiKey =
    process.env.CARTO_API_KEY ||
    process.env.BASEMAP_API_KEY ||
    process.env.VITE_CARTO_API_KEY ||
    process.env.VITE_BASEMAP_API_KEY ||
    '';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.VITE_CARTO_API_KEY': JSON.stringify(cartoApiKey),
      'import.meta.env.VITE_BASEMAP_API_KEY': JSON.stringify(cartoApiKey),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
