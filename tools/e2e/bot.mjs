import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (err) => console.log('pageerror:', err.message));
await page.goto('http://localhost:5174/');

// Splash + cadastro no primeiro acesso
await page.waitForTimeout(2600);
if (await page.locator('.onboarding-card').isVisible()) {
  await page.locator('.name-input').fill('Adriano');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: 'bot-0-home.png' });

// Treinar vs bot
await page.getByRole('button', { name: /Treinar vs Bot/ }).click();
await page.waitForTimeout(5000); // countdown + começo

// Joga uma carta para gerar ação
const card = page.locator('.card:not(.unaffordable)').first();
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(450, 300, { steps: 6 });
await page.mouse.up();

// Emote
await page.locator('.emote-toggle').click();
await page.locator('.emote-option').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'bot-1-battle.png' });

// Espera o bot agir e a batalha se desenvolver
await page.waitForTimeout(12000);
await page.screenshot({ path: 'bot-2-mid.png' });

// Desiste para chegar ao resultado
await page.locator('button[aria-label="Desistir"]').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'bot-3-result.png' });

// Abre o replay
await page.getByRole('button', { name: /Ver replay/ }).click();
await page.waitForTimeout(3500);
await page.screenshot({ path: 'bot-4-replay.png' });

// Sai do replay e confere histórico
await page.locator('button[aria-label="Sair do replay"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'bot-5-home-history.png' });
const history = await page.locator('.history-row').count();
console.log('partidas no histórico:', history);

await browser.close();
console.log('E2E bot OK');
