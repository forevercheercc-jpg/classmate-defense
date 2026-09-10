// Grava um GIF de gameplay para o README em docs/media/gameplay.gif.
// Uso: node tools/e2e/record-gif.mjs [urlBase]  (padrão http://localhost:5173)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const base = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'docs/media/gameplay.gif';
const WIDTH = 720;
const HEIGHT = 405;
const FRAME_MS = 250; // 4 fps
const FRAMES = 36;    // ~9s

mkdirSync('docs/media', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto(base);

await page.waitForTimeout(2600);
if (await page.locator('.onboarding-card').isVisible().catch(() => false)) {
  await page.locator('.name-input').fill('Royale');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.waitForTimeout(400);
}

// Entra numa batalha vs bot e joga cartas para ter ação
await page.getByRole('button', { name: /Treinar vs Bot/ }).click();
await page.waitForTimeout(5500); // countdown

const playCard = async (x, y) => {
  const card = page.locator('.card:not(.unaffordable)').first();
  const box = await card.boundingBox().catch(() => null);
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
};

await playCard(430, 320);
await page.waitForTimeout(2500);
await playCard(500, 380);

// Captura os frames enquanto a ação rola, jogando mais cartas no meio
const frames = [];
for (let i = 0; i < FRAMES; i++) {
  const png = await page.screenshot();
  frames.push(png);
  if (i === 10) await playCard(460, 300).catch(() => {});
  if (i === 22) await playCard(520, 360).catch(() => {});
  await page.waitForTimeout(FRAME_MS);
}
await browser.close();
console.log(`${frames.length} frames capturados, montando GIF...`);

// Monta o GIF: reduz, quantiza com paleta do primeiro frame e aplica em todos
const gif = GIFEncoder();
let palette;
for (const png of frames) {
  const { data } = await sharp(png)
    .resize(WIDTH, HEIGHT)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  if (!palette) palette = quantize(rgba, 256);
  const indexed = applyPalette(rgba, palette);
  gif.writeFrame(indexed, WIDTH, HEIGHT, { palette, delay: FRAME_MS });
}
gif.finish();
writeFileSync(OUT, gif.bytes());
console.log(`${OUT} ok (${(gif.bytes().length / 1024 / 1024).toFixed(1)} MB)`);
