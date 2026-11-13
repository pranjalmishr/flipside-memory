const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', process.env.SERVE_DIR || '.');
const port = Number(process.env.PORT || 5195);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.split('/').some(part => part.startsWith('.') || ['node_modules', 'tests', 'scripts'].includes(part))) {
      response.writeHead(404); response.end('Not found'); return;
    }
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.statSync(file).isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`FlipSide: http://127.0.0.1:${port} (${path.basename(root)})`));
