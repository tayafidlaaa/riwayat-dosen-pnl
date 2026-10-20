import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Dynamic import of API handlers
const handlers = {
  '/api/search': (await import('./api/search.js')).default,
  '/api/detail': (await import('./api/detail.js')).default,
  '/api/dosen-pnl': (await import('./api/dosen-pnl.js')).default,
  '/api/batch-study': (await import('./api/batch-study.js')).default
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Route to API handler if matched
  if (handlers[pathname]) {
    req.query = Object.fromEntries(parsedUrl.searchParams);

    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        req.body = JSON.parse(body);
      } catch (_) {
        req.body = body;
      }
    }

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return res;
    };

    try {
      await handlers[pathname](req, res);
    } catch (err) {
      console.error('API Error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Serve static files
  let safePath = pathname.replace(/^\/+/, '');
  let filePath = path.join(__dirname, safePath === '' ? 'index.html' : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server lokal berjalan di http://localhost:${PORT}`);
});
