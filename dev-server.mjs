import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 8766);
const clients = new Set();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = normalize(join(root, decoded === '/' ? 'index.html' : decoded));
  return candidate.startsWith(root) ? candidate : null;
}

function notifyReload() {
  for (const res of clients) res.write('event: reload\ndata: now\n\n');
}

watch(root, { recursive: false }, (_event, filename) => {
  if (!filename || filename.startsWith('.') || filename === 'dev-server.mjs') return;
  notifyReload();
});

const server = createServer(async (req, res) => {
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const filePath = safePath(req.url || '/');
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
    return;
  }

  const ext = extname(filePath);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');

  if (ext === '.html') {
    const html = await readFile(filePath, 'utf8');
    res.end(html.replace('</body>', `<script>
(() => {
  const source = new EventSource('/__reload');
  source.addEventListener('reload', () => location.reload());
})();
</script></body>`));
    return;
  }

  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`SelloGuia dev listo en http://127.0.0.1:${port}`);
});
