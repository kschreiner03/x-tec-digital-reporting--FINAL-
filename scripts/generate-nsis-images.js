/**
 * Generates branded BMP images for the NISIS NSIS installer UI.
 * Run with: node scripts/generate-nsis-images.js
 *
 * Output:
 *   build/installerHeader.bmp  — 150x57  (top banner on every installer page)
 *   build/installerSidebar.bmp — 164x314 (left panel on welcome/finish screens)
 *
 * Files go to build/ (electron-builder's resource dir) to avoid NSIS path
 * parsing issues with special characters in the project directory path.
 */

const { Jimp, JimpMime } = require('jimp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'assets', 'xterra-white.png');

const TEAL       = 0x007D8CFF;
const TEAL_DARK  = 0x00636EFF;

async function fillRect(img, x, y, w, h, color) {
  for (let px = x; px < x + w; px++) {
    for (let py = y; py < y + h; py++) {
      img.setPixelColor(color, px, py);
    }
  }
}

async function main() {
  const logo = await Jimp.read(LOGO);

  // ── Header: 150×57 ──────────────────────────────────────────────────────────
  const header = new Jimp({ width: 150, height: 57, color: TEAL });

  // Subtle darker stripe at bottom
  await fillRect(header, 0, 50, 150, 7, TEAL_DARK);

  // Logo scaled to 36px tall, left-padded
  const hLogo = logo.clone();
  const hLogoH = 34;
  const hLogoW = Math.round((hLogo.width / hLogo.height) * hLogoH);
  hLogo.resize({ w: hLogoW, h: hLogoH });
  header.composite(hLogo, 10, Math.round((57 - hLogoH) / 2));

  await header.write(path.join(ROOT, 'build', 'installerHeader.bmp'), { mimeType: JimpMime.bmp });
  console.log('✓ build/installerHeader.bmp (150×57)');

  // ── Sidebar: 164×314 ────────────────────────────────────────────────────────
  const sidebar = new Jimp({ width: 164, height: 314, color: TEAL_DARK });

  // Lighter teal top band
  await fillRect(sidebar, 0, 0, 164, 180, TEAL);

  // Thin accent line separating the two sections
  await fillRect(sidebar, 0, 178, 164, 2, 0x005F6BFF);

  // Logo scaled to 90px wide, centered horizontally in upper band
  const sLogo = logo.clone();
  const sLogoW = 100;
  const sLogoH = Math.round((sLogo.height / sLogo.width) * sLogoW);
  sLogo.resize({ w: sLogoW, h: sLogoH });
  sidebar.composite(sLogo, Math.round((164 - sLogoW) / 2), Math.round((178 - sLogoH) / 2));

  await sidebar.write(path.join(ROOT, 'build', 'installerSidebar.bmp'), { mimeType: JimpMime.bmp });
  console.log('✓ build/installerSidebar.bmp (164×314)');

  console.log('\nDone — images saved to build/');
}

main().catch(err => {
  console.error('Error generating images:', err.message);
  process.exit(1);
});
