// Builds the app icons (GDD §22): northern lights over an ice hole with a fishing rod, in the game's palette.
// Writes the SVGs to public/ and renders the PNGs with headless Chrome:
//   node tools/make-icons.mjs [path-to-chrome]
// Output: icon.svg (rounded, favicon + splash), icon-maskable.svg, icon-192.png, icon-512.png,
// icon-maskable-512.png (art inside the 80% safe zone), apple-touch-icon.png (180, no transparency).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Same values as src/render/Palette.ts (icons are static files, so the hex values are written out here).
const C = {
  night: '#0e1a3a',
  nightLow: '#1f3c5c',
  green: '#5ff2b0',
  purple: '#9b6bff',
  snow: '#f4f8fb',
  ice: '#cfe6f2',
  iceDark: '#a9cde0',
  shadow: '#8fb3c9',
  hole: '#1f5674',
  shallow: '#4f93b3',
  wood: '#8a5a3b',
  woodDark: '#5e3c27',
  reel: '#7d8a96',
  line: '#dcecf5',
  bobber: '#e2504c',
  coin: '#ffd447',
};

/** The picture on a 512 canvas. */
const art = () => `
  <g fill="${C.snow}">
    <circle cx="70" cy="64" r="4"/><circle cx="148" cy="38" r="3"/><circle cx="430" cy="52" r="4"/>
    <circle cx="470" cy="128" r="3"/><circle cx="36" cy="150" r="3"/><circle cx="300" cy="30" r="3"/>
  </g>
  <path d="M-140 168 L60 120 L130 150 L210 96 L290 132 L370 84 L450 118 L652 80 L652 150 L450 196 L370 160 L290 212 L210 172 L130 226 L60 196 L-140 240 Z" fill="url(#aur)" opacity="0.9"/>
  <path d="M-140 236 L80 200 L170 226 L260 186 L350 214 L440 178 L652 200 L652 238 L440 220 L350 252 L260 226 L170 262 L80 240 L-140 268 Z" fill="url(#aur2)" opacity="0.55"/>
  <path d="M-140 318 L120 300 L256 312 L392 296 L652 312 L652 652 L-140 652 Z" fill="${C.ice}"/>
  <path d="M-140 318 L120 300 L256 312 L392 296 L652 312 L652 330 L392 316 L256 332 L120 320 L-140 338 Z" fill="${C.snow}"/>
  <path d="M-140 440 L150 470 L60 652 L-140 652 Z M330 652 L470 452 L652 470 L652 652 Z" fill="${C.iceDark}"/>
  <ellipse cx="236" cy="404" rx="112" ry="42" fill="${C.shadow}"/>
  <ellipse cx="236" cy="398" rx="98" ry="34" fill="${C.hole}"/>
  <ellipse cx="236" cy="400" rx="44" ry="13" fill="none" stroke="${C.shallow}" stroke-width="5"/>
  <path d="M458 512 L300 196" stroke="${C.woodDark}" stroke-width="20" stroke-linecap="round"/>
  <path d="M452 500 L300 196" stroke="${C.wood}" stroke-width="12" stroke-linecap="round"/>
  <circle cx="410" cy="420" r="20" fill="${C.reel}"/>
  <circle cx="410" cy="420" r="8" fill="${C.snow}"/>
  <path d="M300 196 Q262 290 240 386" fill="none" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>
  <path d="M226 392 a14 14 0 0 1 28 0 Z" fill="${C.bobber}"/>
  <path d="M226 392 a14 14 0 0 0 28 0 Z" fill="${C.snow}"/>
`;

const defs = `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.night}"/><stop offset="1" stop-color="${C.nightLow}"/></linearGradient>
    <linearGradient id="aur" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.green}"/><stop offset="0.55" stop-color="${C.green}"/><stop offset="1" stop-color="${C.purple}"/></linearGradient>
    <linearGradient id="aur2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.purple}"/><stop offset="1" stop-color="${C.green}"/></linearGradient>
  </defs>`;

/**
 * `rounded`: rounded corners (the "any" icon and favicon). `safe`: art scaled into the maskable 80% safe zone.
 * `size`: width/height attributes (for rendering).
 */
function svg({ rounded = false, safe = false, size = 0 } = {}) {
  const wh = size ? ` width="${size}" height="${size}"` : '';
  const clip = rounded ? '<clipPath id="r"><rect width="512" height="512" rx="104"/></clipPath>' : '';
  const k = safe ? 0.8 : 1;
  const o = (512 * (1 - k)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${wh}>${defs.replace('</defs>', `${clip}</defs>`)}
  <g${rounded ? ' clip-path="url(#r)"' : ''}>
    <rect width="512" height="512" fill="url(#sky)"/>
    ${safe ? `<rect y="300" width="512" height="212" fill="${C.ice}"/>` : ''}
    <g transform="translate(${o} ${o}) scale(${k})">${art()}</g>
  </g>
</svg>
`;
}

const root = resolve(import.meta.dirname, '..');
const pub = join(root, 'public');
writeFileSync(join(pub, 'icon.svg'), svg({ rounded: true }));
writeFileSync(join(pub, 'icon-maskable.svg'), svg({ safe: true }));

const chrome = process.argv[2] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(chrome)) {
  console.log(`SVGs written. Chrome not found at ${chrome}: pass its path to render the PNGs.`);
  process.exit(0);
}
const tmp = mkdtempSync(join(tmpdir(), 'nb-icons-'));
const renders = [
  ['icon-192.png', 192, { rounded: true }],
  ['icon-512.png', 512, { rounded: true }],
  ['icon-maskable-512.png', 512, { safe: true }],
  ['apple-touch-icon.png', 180, {}],
];
for (const [name, size, opts] of renders) {
  const file = join(tmp, `${name}.html`);
  // Transparent page background so the rounded icons keep their transparent corners.
  writeFileSync(file, `<!doctype html><html><body style="margin:0;background:transparent">${svg({ ...opts, size })}</body></html>`);
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${join(pub, name)}`,
    pathToFileURL(file).href,
  ], { stdio: 'ignore' });
  console.log(`public/${name}`);
}
rmSync(tmp, { recursive: true, force: true });
