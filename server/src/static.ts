import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { config, dataPath } from './config.js';

/**
 * Serves the built client (client/dist) and uploaded avatars, with an SPA
 * fallback for client-side routes. In dev the Vite server proxies /api here
 * instead, and this middleware simply finds no dist folder.
 */
export function mountStatic(app: Express): void {
  const uploadsDir = dataPath('uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', immutable: false }));

  if (!fs.existsSync(config.clientDist)) return;

  app.use(
    express.static(config.clientDist, {
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  const indexHtml = path.join(config.clientDist, 'index.html');
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
}
