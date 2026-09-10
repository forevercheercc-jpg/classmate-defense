import { chromium } from 'playwright';

const browser = await chromium.launch();
const URL = 'http://localhost:5174/';
const CODE = 'WXYZ';

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.log(`[${name}] pageerror:`, err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[${name}] console:`, msg.text().slice(0, 200));
  });
  await page.goto(URL);
  await page.waitForTimeout(2500);
  if (await page.locator('.onboarding-card').isVisible()) {
    await page.locator('.name-input').fill(name);
    await page.getByRole('button', { name: /Começar/ }).click();
    await page.waitForTimeout(400);
  }
  // O código de amigo fica recolhido em "Mais opções" no dashboard
  await page.locator('.more-options summary').click();
  return page;
}

// P1 cria sala privada com código
const p1 = await open('p1');
await p1.locator('.code-input').fill(CODE);
await p1.getByRole('button', { name: /Jogar com amigo/ }).click();
await p1.waitForTimeout(1200);
const codeShown = await p1.locator('.room-code strong').textContent();
console.log('código exibido na espera:', codeShown);

// P2 entra com o mesmo código
const p2 = await open('p2');
await p2.locator('.code-input').fill(CODE);
await p2.getByRole('button', { name: /Jogar com amigo/ }).click();
await p2.waitForTimeout(4500); // countdown

// P3 assiste com o código
const p3 = await open('p3');
await p3.locator('.code-input').fill(CODE);
await p3.getByRole('button', { name: /^👁 Assistir$/ }).click();
await p3.waitForTimeout(4000);
const spectatorBadge = await p3.locator('.spectator-badge').isVisible();
console.log('badge de espectador visível:', spectatorBadge);
await p3.screenshot({ path: 'social-1-espectador.png' });

// Reconexão: P1 dá reload no meio da batalha e deve voltar para a partida
await p1.reload();
await p1.waitForTimeout(3000);
const timerVisible = await p1.locator('.timer-value').isVisible();
const timer = timerVisible ? await p1.locator('.timer-value').textContent() : 'N/A';
console.log('p1 reconectou? timer visível:', timerVisible, '| timer:', timer);
await p1.screenshot({ path: 'social-2-reconectado.png' });

await browser.close();
console.log('E2E social OK');
