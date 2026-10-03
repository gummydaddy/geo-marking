import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import serverApp from './src/serverApp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Mount Vite middleware in development or serve dist in production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    serverApp.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      serverApp.use(serverApp.get('express')?.static ? serverApp.get('express').static(distPath) : (await import('express')).default.static(distPath));
      serverApp.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  serverApp.listen(PORT, '0.0.0.0', () => {
    console.log(`[GeoMark Studio Server] Ready on port ${PORT}`);
    const hasCarto = Boolean(
      process.env.CARTO_API_KEY ||
      process.env.BASEMAP_API_KEY ||
      process.env.VITE_CARTO_API_KEY ||
      process.env.VITE_BASEMAP_API_KEY
    );
    if (hasCarto) {
      console.log('[GeoMark Studio Server] CARTO Basemaps API key detected. Universal shared cache active.');
    }
  });
}

startServer().catch((err) => {
  console.error('[GeoMark Studio Server Fatal Error]:', err);
});
