const http = require('http');
const fs = require('fs');
const path = require('path');
const pw = require('playwright');
const { devices } = pw;

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

const GROUPS = {
  'iOS (Safari)': ['iPhone SE', 'iPhone 15', 'iPhone 14 Pro Max', 'iPad Mini', 'iPad Pro 11'],
  'Android (Chrome)': ['Pixel 7', 'Galaxy S9+', 'Galaxy Tab S4'],
  'Escritorio': ['Desktop Chrome', 'Desktop Edge', 'Desktop Firefox', 'Desktop Safari'],
};
const LABELS = { 'Desktop Chrome': 'Windows/Linux · Chrome', 'Desktop Edge': 'Windows · Edge', 'Desktop Firefox': 'Firefox', 'Desktop Safari': 'macOS · Safari' };
const ENGINE = { webkit: 'WebKit', chromium: 'Chromium', firefox: 'Firefox' };

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// Envía una petición desde el servidor (sin restricciones CORS)
async function proxy({ url, method = 'GET', headers = {}, body }) {
  const t0 = Date.now();
  const opts = { method, headers, redirect: 'follow' };
  if (body && !['GET', 'HEAD'].includes(method)) opts.body = body;
  const r = await fetch(url, opts);
  const text = await r.text();
  return {
    status: r.status,
    statusText: r.statusText,
    ms: Date.now() - t0,
    headers: Object.fromEntries(r.headers),
    body: text.slice(0, 200000),
  };
}

// Abre la URL con el motor real del dispositivo elegido (WebKit, Chromium o Firefox)
async function webkitTest({ url, device = 'iPhone 15' }) {
  const profile = devices[device];
  if (!profile) throw new Error('Dispositivo desconocido: ' + device);
  const browser = await pw[profile.defaultBrowserType].launch();
  try {
    const ctx = await browser.newContext({ ...profile });
    const page = await ctx.newPage();
    const logs = [];
    const failed = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} -> ${r.failure()?.errorText}`));
    const t0 = Date.now();
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const ms = Date.now() - t0;
    const shot = await page.screenshot({ type: 'png' });
    return {
      status: resp ? resp.status() : null,
      ms,
      title: await page.title(),
      userAgent: profile.userAgent,
      engine: ENGINE[profile.defaultBrowserType],
      viewport: profile.viewport,
      logs,
      failed,
      screenshot: 'data:image/png;base64,' + shot.toString('base64'),
    };
  } finally {
    await browser.close();
  }
}

http
  .createServer(async (req, res) => {
    try {
      if (req.url === '/api/devices') return send(res, 200, Object.entries(GROUPS).map(([group, list]) => ({ group, items: list.map((n) => ({ name: n, label: LABELS[n] || n, engine: ENGINE[devices[n].defaultBrowserType], ...devices[n].viewport })) })));
      if (req.url === '/api/proxy' && req.method === 'POST') return send(res, 200, await proxy(await readBody(req)));
      if (req.url === '/api/webkit' && req.method === 'POST') return send(res, 200, await webkitTest(await readBody(req)));

      const file = path.join(PUBLIC, req.url === '/' ? 'index.html' : path.normalize(req.url.split('?')[0]));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) {
        res.writeHead(404);
        return res.end('No encontrado');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  })
  .listen(PORT, () => console.log(`Simulador iOS en http://localhost:${PORT}`));
