// Winziger statischer Server fuer die lokale Entwicklung:  npm run serve
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 8000);
const wurzel = process.cwd();
const typen = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const pfad = join(wurzel, normalize(url === '/' ? '/index.html' : url));
  if (!pfad.startsWith(wurzel)) { res.writeHead(403).end('verboten'); return; }
  try {
    const daten = await readFile(pfad);
    res.writeHead(200, { 'content-type': typen[extname(pfad)] || 'application/octet-stream' });
    res.end(daten);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('nicht gefunden');
  }
}).listen(port, () => console.log(`Knotenpunkt laeuft auf http://localhost:${port}`));
