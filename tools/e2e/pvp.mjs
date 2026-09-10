import { chromium } from 'playwright';

const URL = 'http://localhost:5174/';
const OUT = process.argv[2] ?? '.';

const browser = await chromium.launch();

async function openPlayer(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[${name}] console.error:`, msg.text());
  });
  page.on('pageerror', (err) => console.log(`[${name}] pageerror:`, err.message));
  await page.goto(URL);
  await page.getByRole('button', { name: /Batalhar/ }).click();
  return page;
}

const p1 = await openPlayer('p1');
await p1.screenshot({ path: `${OUT}/1-waiting.png` });

const p2 = await openPlayer('p2');

// Espera o countdown acabar e a batalha começar
await p1.waitForTimeout(4500);
await p1.screenshot({ path: `${OUT}/2-battle-start.png` });

// Jogador 1 arrasta a primeira carta jogável para o próprio campo (perto da ponte de cima)
async function playFirstCard(page, targetX, targetY) {
  const card = page.locator('.card:not(.unaffordable)').first();
  const box = await card.boundingBox();
  if (!box) return console.log('nenhuma carta jogável');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await page.screenshot({ path: `${OUT}/3-dragging.png` });
  await page.mouse.up();
}

// Lê o lado real de cada jogador e dropa no próprio campo
async function mySide(page) {
  return page.evaluate(() => {
    const room = window.__room;
    return room?.state?.players?.get(room.sessionId)?.side ?? '?';
  });
}
const side1 = await mySide(p1);
const side2 = await mySide(p2);
console.log('p1 side:', side1, '| p2 side:', side2);

const dropX = (side) => (side === 'left' ? 450 : 830);
await playFirstCard(p1, dropX(side1), 260);
await p1.waitForTimeout(800);
await p1.screenshot({ path: `${OUT}/4-p1-deployed.png` });

await playFirstCard(p2, dropX(side2), 500);

// p1 lança Bola de Fogo na torre inimiga (espera ficar jogável)
async function playNamedCard(page, name, targetX, targetY, shot) {
  const card = page.locator('.card', { hasText: name });
  try {
    await card.locator(':scope:not(.unaffordable)').first().waitFor({ timeout: 25000 });
  } catch {
    console.log(`carta "${name}" não disponível, pulando`);
    return;
  }
  const box = await card.first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await page.screenshot({ path: `${OUT}/${shot}-preview.png` });
  await page.mouse.up();
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${shot}-impact.png` });
}
const towerX = side1 === 'left' ? 940 : 340;
await playNamedCard(p1, 'Bola de Fogo', towerX, 165, '7-fireball');
await p2.waitForTimeout(2500);
await p1.screenshot({ path: `${OUT}/5-troops-marching.png` });
await p2.screenshot({ path: `${OUT}/6-p2-view.png` });

// Estado da HUD
const timer = await p1.locator('.timer-value').textContent();
const elixir = await p1.locator('.elixir-number').textContent();
console.log('timer:', timer?.trim(), '| elixir p1:', elixir?.trim());
const entities = await p1.evaluate(() => document.querySelectorAll('canvas').length);
console.log('canvases:', entities);

await browser.close();
console.log('E2E OK');
