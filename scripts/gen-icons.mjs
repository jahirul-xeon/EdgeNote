/**
 * Generates the Edge Note app icons/splash from an SVG mark using sharp.
 * Run: node scripts/gen-icons.mjs
 *
 * The mark: a white note card with an accent "edge" spine on the left (the
 * "Edge" in Edge Note) and three text lines. Rendered onto a gradient tile for
 * the iOS icon, and on transparency for adaptive/splash use.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'images');

const BRAND = '#5B5BD6';
const BRAND_LT = '#7C78F5';
const BRAND_DK = '#4B45B8';
const LINE = '#C9C9DA';

/** The note mark, drawn in a 1024 viewBox. `spine`/`lines` colors let us make a
 *  white-on-transparent silhouette for the monochrome variant. */
function mark({ spine = BRAND, lines = LINE, paper = '#FFFFFF' } = {}) {
  return `
    <!-- accent edge spine (full card, shows on the left) -->
    <rect x="300" y="232" width="424" height="560" rx="72" fill="${spine}"/>
    <!-- white note paper: square left corners (meets spine), rounded right -->
    <path d="M436 232 H652 Q724 232 724 304 V720 Q724 792 652 792 H436 Z" fill="${paper}"/>
    <!-- text lines -->
    <rect x="484" y="356" width="196" height="30" rx="15" fill="${lines}"/>
    <rect x="484" y="436" width="212" height="30" rx="15" fill="${lines}"/>
    <rect x="484" y="516" width="150" height="30" rx="15" fill="${lines}"/>
  `;
}

function tileSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BRAND_LT}"/>
        <stop offset="1" stop-color="${BRAND_DK}"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="230" fill="url(#g)"/>
    ${mark()}
  </svg>`;
}

/** The mark on transparency, scaled into a safe center area. The spine uses the
 *  darker brand so it stays visible on the solid brand adaptive background. */
function markSvg(size, safe = 0.62) {
  const s = safe;
  const tx = (1 - s) * 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <g transform="translate(${tx} ${tx}) scale(${s})">${mark({ spine: BRAND_DK })}</g>
  </svg>`;
}

function monoSvg(size, safe = 0.62) {
  const s = safe;
  const tx = (1 - s) * 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <g transform="translate(${tx} ${tx}) scale(${s})">${mark({ spine: '#FFFFFF', lines: 'rgba(0,0,0,0.25)', paper: '#FFFFFF' })}</g>
  </svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).png();

const jobs = [
  ['app-icon.png', tileSvg(1024)],
  ['icon.png', tileSvg(1024)],
  ['app-icon-foreground.png', markSvg(1024)],
  ['android-icon-foreground.png', markSvg(1024)],
  ['android-icon-monochrome.png', monoSvg(1024)],
  ['splash-icon.png', tileSvg(512)],
  ['favicon.png', tileSvg(64)],
];

for (const [name, svg] of jobs) {
  await png(svg).toFile(path.join(OUT, name));
  console.log('wrote', name);
}

// Solid brand background for Android adaptive (if referenced).
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BRAND } })
  .png()
  .toFile(path.join(OUT, 'android-icon-background.png'));
console.log('wrote android-icon-background.png');
console.log('done');
