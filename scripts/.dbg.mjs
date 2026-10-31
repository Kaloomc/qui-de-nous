import { chromium } from 'playwright';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { GameStore } from '../server/gameStore.js';
import { registerSockets } from '../server/sockets.js';
import { ROOT, launch, sleep, bot, CAST } from './lib/demo.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const store = new GameStore();
registerSockets(io, store);
app.get('/api/info', (_q, r) => r.json({ lanIps: [], publicUrl: null }));
app.use(express.static(path.join(ROOT, 'dist')));
app.use((q, r) => r.sendFile(path.join(ROOT, 'dist/index.html')));
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}`;
const browser = await launch(chromium);
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(url);
await page.getByRole('button', { name: /Créer une partie/ }).click();
await page.waitForURL(/\/host\/[A-Z0-9]{4}/);
const code = page.url().split('/').pop();
await page.getByRole('button', { name: /Mode Duel/ }).first().click();
await page.waitForSelector('.duel-setup');
const bots = [];
for (let i = 0; i < 8; i++) {
  const b = bot(url, code, CAST[i], undefined);
  await b.ready;
  bots.push(b);
}
await sleep(600);
const script = process.argv[2];
const out = await page.evaluate((sel) => {
  const rows = [];
  const walk = (el, depth) => {
    if (depth > 4) return;
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      if (r.height > 40) rows.push(`${' '.repeat(depth * 2)}${c.tagName.toLowerCase()}.${(c.className || '').toString().slice(0, 40)} top=${Math.round(r.top)} h=${Math.round(r.height)} w=${Math.round(r.width)}`);
      walk(c, depth + 1);
    }
  };
  walk(document.querySelector(sel || 'main'), 0);
  return rows.join('\n');
}, script);
console.log(out);
await browser.close();
process.exit(0);
