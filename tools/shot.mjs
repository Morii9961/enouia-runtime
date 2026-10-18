#!/usr/bin/env node
// shot.mjs — 给设计方向截图并生成指标，供「自检循环」使用。
//
//   node tools/shot.mjs --out .design/shots name=url [name=url …] [选项]
//
// name=url   名字=网址或本地 html 文件路径。例如  nautical=http://localhost:4321/__design/03  riso=./variants/04/index.html
// 选项
//   --out DIR           输出目录（默认 .design/shots）
//   --widths 1440,820,390
//   --height 900        视口高度（默认 900）
//   --full              整页长图（默认只截首屏）
//   --clip x,y,w,h      只截一块区域（1:1 看细节）
//   --dark              模拟 prefers-color-scheme: dark
//   --reduced-motion    模拟 prefers-reduced-motion: reduce
//   --wait 800          页面加载后再等多少毫秒（动画多时加大）
//   --index             额外生成 DIR/index.html，并排对比所有方向与宽度
//
// 依赖 playwright 或 playwright-core（项目里装一个：npm i -D playwright-core）。
// 没有自带 Chromium 时，会依次尝试系统的 Microsoft Edge、Google Chrome；Windows 上 Edge 一定有。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = { out: '.design/shots', widths: [1440, 820, 390], height: 900, wait: 600 };
const flags = new Set();
const targets = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') opt.out = argv[++i];
  else if (a === '--widths') opt.widths = argv[++i].split(',').map(Number).filter(Boolean);
  else if (a === '--height') opt.height = Number(argv[++i]);
  else if (a === '--wait') opt.wait = Number(argv[++i]);
  else if (a === '--clip') opt.clip = argv[++i].split(',').map(Number);
  else if (a.startsWith('--')) flags.add(a.slice(2));
  else if (a.includes('=')) { const k = a.indexOf('='); targets.push([a.slice(0, k), a.slice(k + 1)]); }
  else { console.error(`看不懂的参数：${a}`); process.exit(1); }
}
if (!targets.length) { console.error('用法：node tools/shot.mjs --out DIR name=url [name=url …]'); process.exit(1); }

async function loadPlaywright() {
  const req = createRequire(path.join(process.cwd(), 'noop.js'));
  for (const name of ['playwright', 'playwright-core']) {
    try { return req(name); } catch {}
    try { return await import(name); } catch {}
  }
  console.error('找不到 playwright。请在项目里运行：npm i -D playwright-core');
  process.exit(1);
}

async function launch(pw) {
  const chromium = pw.chromium || pw.default?.chromium;
  const attempts = [{}, { channel: 'msedge' }, { channel: 'chrome' }];
  let last;
  for (const extra of attempts) {
    try { return await chromium.launch({ headless: true, ...extra }); } catch (e) { last = e; }
  }
  console.error('启动不了浏览器。可以运行 `npx playwright install chromium`，或确认系统装了 Edge / Chrome。\n' + String(last?.message || last).split('\n')[0]);
  process.exit(1);
}

const toUrl = (v) => (/^(https?|file):/i.test(v) ? v : pathToFileURL(path.resolve(v)).href);

// 在页面里跑：收集字体、字号、颜色、溢出等指标
function collectMetrics() {
  const fam = new Map(); const sizes = new Set(); const hues = new Set(); const colors = new Set();
  let tiny = 0; let textEls = 0;
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const note = (c) => {
    const p = parse(c); if (!p || p.a < 0.3) return;
    colors.add(`${p.r},${p.g},${p.b}`);
    const r = p.r / 255, g = p.g / 255, b = p.b / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const d = mx - mn;
    const l = (mx + mn) / 2; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (s < 0.18 || l < 0.08 || l > 0.95) return;
    let h = 0; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360; hues.add(Math.round(h / 30) % 12);
  };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    note(cs.backgroundColor);
    if (parseFloat(cs.borderTopWidth) > 0) note(cs.borderTopColor);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length) continue;
    textEls++;
    const chars = own.reduce((a, n) => a + n.textContent.trim().length, 0);
    const first = cs.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    fam.set(first, (fam.get(first) || 0) + chars);
    const fs = parseFloat(cs.fontSize); sizes.add(fs); if (fs < 11) tiny++;
    note(cs.color);
  }
  const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`);
  const sz = [...sizes].sort((a, b) => a - b);
  return {
    firstFamilyByCharCount: Object.fromEntries([...fam.entries()].sort((a, b) => b[1] - a[1])),
    loadedFontFaces: [...new Set(loaded)],
    fontSizeSteps: sz.length, fontSizes: sz,
    largestToSmallestRatio: sz.length ? +(sz[sz.length - 1] / sz[0]).toFixed(2) : null,
    chromaticHueBuckets30deg: [...hues].sort((a, b) => a - b),
    chromaticHueCount: hues.size,
    distinctColors: colors.size,
    textElements: textEls, textBelow11px: tiny,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    lang: document.documentElement.lang || null,
  };
}

const pw = await loadPlaywright();
const browser = await launch(pw);
fs.mkdirSync(opt.out, { recursive: true });
const rows = [];
let problems = 0;

for (const [name, raw] of targets) {
  const url = toUrl(raw); const row = { name, shots: [] };
  for (const w of opt.widths) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: opt.height },
      colorScheme: flags.has('dark') ? 'dark' : 'light',
      reducedMotion: flags.has('reduced-motion') ? 'reduce' : 'no-preference',
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForTimeout(opt.wait);
      const file = `${name}-${w}${flags.has('dark') ? '-dark' : ''}${opt.clip ? '-clip' : ''}.png`;
      const shotOpts = { path: path.join(opt.out, file) };
      if (opt.clip) shotOpts.clip = { x: opt.clip[0], y: opt.clip[1], width: opt.clip[2], height: opt.clip[3] };
      else shotOpts.fullPage = flags.has('full');
      await page.screenshot(shotOpts);
      const metrics = await page.evaluate(collectMetrics);
      metrics.consoleErrors = errors;
      fs.writeFileSync(path.join(opt.out, file.replace(/\.png$/, '.json')), JSON.stringify(metrics, null, 2));
      const flagsOut = [];
      if (metrics.horizontalOverflow) flagsOut.push('横向溢出');
      if (metrics.textBelow11px) flagsOut.push(`${metrics.textBelow11px} 处文字 < 11px`);
      if (errors.length) flagsOut.push(`${errors.length} 条控制台报错`);
      if (metrics.fontSizeSteps < 4) flagsOut.push(`字号只有 ${metrics.fontSizeSteps} 档`);
      if (metrics.chromaticHueCount > 3) flagsOut.push(`${metrics.chromaticHueCount} 个色相区间`);
      if (flagsOut.length) problems++;
      console.log(`${file}  ${flagsOut.length ? '⚠ ' + flagsOut.join('；') : '指标正常'}`);
      row.shots.push({ w, file, flags: flagsOut });
    } catch (e) {
      problems++;
      console.log(`${name}@${w}  失败：${String(e.message).split('\n')[0]}`);
      row.shots.push({ w, file: null, flags: ['失败'] });
    }
    await ctx.close();
  }
  rows.push(row);
}
await browser.close();

if (flags.has('index')) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>方向对比</title>
<style>body{margin:0;padding:24px;background:#111;color:#ddd;font:14px/1.5 system-ui,"Noto Sans SC",sans-serif}
h2{margin:32px 0 8px;font-weight:600}.row{display:flex;gap:16px;align-items:flex-start;overflow-x:auto;padding-bottom:12px}
figure{margin:0;flex:none}figcaption{font-size:12px;opacity:.7;margin-top:4px}img{display:block;height:360px;width:auto;border:1px solid #333}
.warn{color:#f2b35a}</style><h1>方向对比（${new Date().toLocaleString('zh-CN')}）</h1>
${rows.map((r) => `<h2>${esc(r.name)}</h2><div class="row">${r.shots.map((s) => s.file ? `<figure><a href="${esc(s.file)}"><img src="${esc(s.file)}" alt="${esc(r.name)} ${s.w}"></a><figcaption>${s.w}px ${s.flags.length ? `<span class="warn">⚠ ${esc(s.flags.join('；'))}</span>` : ''}</figcaption></figure>` : `<figure><figcaption class="warn">${s.w}px 失败</figcaption></figure>`).join('')}</div>`).join('')}`;
  fs.writeFileSync(path.join(opt.out, 'index.html'), html);
  console.log(`并排对比：${path.join(opt.out, 'index.html')}`);
}
process.exit(problems ? 2 : 0);
