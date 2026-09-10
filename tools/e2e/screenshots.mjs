// Captura screenshots para o README em docs/screenshots/.
// Uso: node tools/e2e/screenshots.mjs [urlBase]  (padrão http://localhost:5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const outDir = 'docs/screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (err) => console.log('pageerror:', err.message));
await page.goto(base);

// Splash + cadastro no primeiro acesso
await page.waitForTimeout(2600);
if (await page.locator('.onboarding-card').isVisible().catch(() => false)) {
  await page.locator('.name-input').fill('Royale');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: `${outDir}/home.png` });
console.log('home.png ok');

// Coleção de cartas
const collectionBtn = page.getByRole('button', { name: /Coleção/ });
if (await collectionBtn.isVisible().catch(() => false)) {
  await collectionBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/collection.png` });
  console.log('collection.png ok');
  const back = page.getByRole('button', { name: /Voltar|←/ }).first();
  if (await back.isVisible().catch(() => false)) await back.click();
  else await page.goto(base);
  await page.waitForTimeout(800);
}

// Batalha vs bot
await page.getByRole('button', { name: /Treinar vs Bot/ }).click();
await page.waitForTimeout(1000);
// Se houver seleção de dificuldade, escolhe a primeira opção visível
const difficulty = page.getByRole('button', { name: /Fácil|Médio|Difícil/ }).first();
if (await difficulty.isVisible().catch(() => false)) await difficulty.click();
await page.waitForTimeout(5000); // countdown + começo

// Joga algumas cartas para a arena ter ação
for (let i = 0; i < 3; i++) {
  const card = page.locator('.card:not(.unaffordable)').first();
  const box = await card.boundingBox().catch(() => null);
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(430 + i * 60, 320, { steps: 6 });
    await page.mouse.up();
  }
  await page.waitForTimeout(3500);
}
await page.screenshot({ path: `${outDir}/battle.png` });
console.log('battle.png ok');

// Deixa a partida correr para ter combate perto das torres
await page.waitForTimeout(20000);
await page.screenshot({ path: `${outDir}/battle-late.png` });
console.log('battle-late.png ok');

await browser.close();
console.log('done');
