import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeedRouter, type FeedRouterOptions } from './feed';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '..', 'dist');

export interface AppOptions extends FeedRouterOptions {}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', createFeedRouter(options));

  // JSON 404 for unknown /api/* paths (feeds router above only handles /feed)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown API endpoint' } });
  });

  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err && !res.headersSent) {
        res.status(404).send('Not found');
      }
    });
  });

  return app;
}

const entryFile = process.argv[1] ?? '';
const isDirectRun =
  entryFile.endsWith('server/index.ts') || entryFile.endsWith('server/index.js');

if (isDirectRun) {
  const port = Number(process.env.PORT) || 3001;
  createApp().listen(port, () => {
    console.log(`my-tube server listening on http://localhost:${port}`);
  });
}
