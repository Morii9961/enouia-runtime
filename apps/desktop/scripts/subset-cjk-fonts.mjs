// Build-time tool only. Original TTFs stay outside the repository.
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dictionary } from '../tests/i18n-keys.mjs';

const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const source = value('--fonts');
if (!source) throw new Error('Usage: node scripts/subset-cjk-fonts.mjs --fonts <original-font-directory> [--python <python>] [--jobs <n>]');
const desktop = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), 'enouia-cjk-'));
const input = path.join(temp, 'characters.json');
const chars = {};
for (const language of ['zh-Hans', 'ja']) chars[language] = [...new Set([...dictionary(language).values()].join(''))].map(c => c.codePointAt(0)).sort((a, b) => a - b);
writeFileSync(input, JSON.stringify(chars));
try {
  const run = spawnSync(value('--python') || 'python', [path.join(desktop, 'scripts/subset-cjk-fonts.py'), '--fonts', path.resolve(source), '--characters', input,
    '--output', path.join(desktop, 'src/assets/fonts'), '--css', path.join(desktop, 'src/theme/cjk-faces.css'), '--jobs', value('--jobs') || '4'], { stdio: 'inherit', windowsHide: true });
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
} finally { unlinkSync(input); rmdirSync(temp); }
