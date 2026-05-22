/**
 * Dev server for docent's interactive web player.
 *
 * Serves the player with live bundling: the React entry is built on each
 * request, and the monorepo `public/` folder is served at the root so
 * `staticFile()` resolves narration audio at `/audio/...`.
 *
 * Usage:
 *   bun packages/engine/player/dev.ts [--port <n>]
 *
 * Then open http://localhost:<port>/?film=<id>
 */

import {existsSync} from 'node:fs';
import path from 'node:path';

const PLAYER_DIR = import.meta.dir;
const ENGINE_DIR = path.resolve(PLAYER_DIR, '..');
const REPO_ROOT = path.resolve(ENGINE_DIR, '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

const portArg = process.argv.indexOf('--port');
const port = portArg !== -1 ? Number(process.argv[portArg + 1]) : 4321;

const ENTRY = path.join(PLAYER_DIR, 'index.tsx');
const HTML = path.join(PLAYER_DIR, 'index.html');

const buildEntry = async (): Promise<Response> => {
  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: 'browser',
    format: 'esm',
    define: {'process.env.NODE_ENV': '"development"'},
  });
  if (!result.success) {
    const msg = result.logs.map((l) => String(l)).join('\n');
    return new Response(`console.error(${JSON.stringify(msg)});`, {
      status: 200,
      headers: {'content-type': 'application/javascript'},
    });
  }
  const code = await result.outputs[0].text();
  return new Response(code, {
    headers: {'content-type': 'application/javascript'},
  });
};

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === '/' || pathname === '/index.html') {
      // Serve the template, rewriting the dev entry to /index.js.
      const template = await Bun.file(HTML).text();
      const html = template.replace('./index.tsx', '/index.js');
      return new Response(html, {
        headers: {'content-type': 'text/html'},
      });
    }

    if (pathname === '/index.js') {
      return buildEntry();
    }

    // Everything else (notably /audio/...) is served from public/.
    const asset = path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ''));
    if (asset.startsWith(PUBLIC_DIR) && existsSync(asset)) {
      return new Response(Bun.file(asset));
    }

    return new Response('Not found', {status: 404});
  },
});

console.log(`docent player — dev server`);
console.log(`  http://localhost:${server.port}/`);
console.log(`  http://localhost:${server.port}/?film=<id>`);
