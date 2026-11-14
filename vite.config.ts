import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The app is a static page: all data calls go straight to the YouTube Data API
// from the browser, so no server is needed. A relative base lets the build run
// under any GitHub Pages path. The production build is one self-contained HTML file.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {
    // Legacy Express feed proxy (server/), only used by `npm run dev:server`.
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
