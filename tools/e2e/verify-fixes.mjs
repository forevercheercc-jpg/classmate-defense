// Verifica: (1) intro VS com nomes e tempo; (2) overlay de resultado sobrevive
// à desconexão do servidor (simulada fechando a aba do oponente / drop).
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto(base);
await page.waitForTimeout(2600);
if (await page.locator('.onboarding-card').isVisible().catch(() => false)) {
  await page.locator('.name-input').fill('Adriano');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.waitForTimeout(400);
}

// Entra vs bot e mede quanto tempo a intro VS fica visível
await page.getByRole('button', { name: /Treinar vs Bot/ }).click();
const easy = page.getByRole('button', { name: /Fácil/ }).first();
if (await easy.isVisible().catch(() => false)) await easy.click();

// espera a intro aparecer
let vsSeen = 0;
for (let i = 0; i < 80; i++) {
  const vs = await page.locator('.vs-panel').count();
  if (vs) {
    vsSeen++;
    if (vsSeen === 1) {
      const left = await page.locator('.vs-player.blue .vs-name').textContent().catch(() => '?');
      const right = await page.locator('.vs-player.red .vs-name').textContent().catch(() => '?');
      console.log(`intro VS: azul(esq)="${left}"  vermelho(dir)="${right}"`);
      await page.screenshot({ path: 'docs/media/verify-intro.png' });
    }
  }
  await page.waitForTimeout(100);
  if (vsSeen > 0 && !vs) break;
}
console.log(`intro VS visível por ~${(vsSeen * 100 / 1000).toFixed(1)}s`);

// Deixa a batalha rolar e força fim por desistência
// Espera a batalha começar (countdown ~7s + latência) e força o fim via surrender.
await page.waitForTimeout(9000);
await page.evaluate(() => window.__room?.send('surrender'));
await page.waitForTimeout(1500);
console.log('resultado visivel:', await page.locator('.overlay-card.result').count(), 'jogar-novamente:', await page.getByRole('button', { name: /Jogar novamente/ }).count());

// Simula reinício do servidor: fecha o socket do cliente e vê se o overlay some
await page.evaluate(() => { try { window.__room?.connection?.transport?.ws?.close(); } catch (e) {} });
await page.waitForTimeout(2500);
const afterDrop = {
  result: await page.locator('.overlay-card.result').count(),
  playAgain: await page.getByRole('button', { name: /Jogar novamente/ }).count(),
  menu: await page.locator('.home-screen').count(),
};
console.log('APOS DROP DO SOCKET:', JSON.stringify(afterDrop));
console.log(afterDrop.result && afterDrop.playAgain ? '>>> OK: overlay sobreviveu' : '>>> FALHA: overlay sumiu');
await browser.close();
