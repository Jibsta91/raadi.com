// Serves the app's web export (dist/) under BASE_PATH for the gateway. Telemetry comes from the
// service-kit preload (node --import), like the web app. Security headers are set by the gateway.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.env.DIST_DIR ?? 'dist');
const base = (process.env.BASE_PATH ?? '/m').replace(/\/+$/, '');
const port = Number(process.env.PORT ?? 8080);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function log(level, msg, extra = {}) {
  process.stdout.write(
    `${JSON.stringify({ level, time: new Date().toISOString(), service: 'mobile-web', msg, ...extra })}\n`,
  );
}

/** Maps a request path to a file under root, or null if it escapes root. */
function fileFor(pathname) {
  const rel = normalize(decodeURIComponent(pathname.slice(base.length) || '/')).replace(
    /^([/\\])+/,
    '',
  );
  const file = join(root, rel);
  return file === root || file.startsWith(root + sep) ? file : null;
}

async function send(res, file, method, immutable) {
  const info = await stat(file);
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/healthz') return res.writeHead(200).end('ok');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return res.writeHead(404).end();

  let file;
  try {
    file = fileFor(pathname);
  } catch {
    return res.writeHead(400).end();
  }
  if (!file) return res.writeHead(404).end();

  try {
    // Content-hashed bundles and assets never change; everything else is revalidated.
    const hashed = pathname.startsWith(`${base}/_expo/`) || pathname.startsWith(`${base}/assets/`);
    if ((await stat(file)).isFile()) return await send(res, file, req.method, hashed);
  } catch {
    // Not a file: fall through to the app shell for client-side routes.
  }
  if (extname(pathname)) return res.writeHead(404).end();
  try {
    await send(res, join(root, 'index.html'), req.method, false);
  } catch (err) {
    log('error', 'cannot serve index.html', { err: String(err) });
    res.writeHead(500).end();
  }
});

server.listen(port, '0.0.0.0', () => log('info', `mobile-web listening on :${port}`, { base }));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
