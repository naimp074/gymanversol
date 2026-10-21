import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const pages = { '/admin': '/admin.html', '/socios': '/socios.html' };

// En desarrollo, /admin y /socios sirven sus páginas igual que en producción.
const cleanUrls = {
  name: 'clean-urls',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query] = req.url.split('?');
      const page = pages[path.replace(/\/+$/, '')];
      if (page) req.url = page + (query ? `?${query}` : '');
      next();
    });
  }
};

export default defineConfig({
  plugins: [react(), cleanUrls],
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        admin: `${root}admin.html`,
        socios: `${root}socios.html`
      }
    }
  }
});
