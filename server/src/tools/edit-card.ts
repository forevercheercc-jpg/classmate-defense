/**
 * Ferramenta administrativa de balanceamento.
 *
 * Uso:
 *   pnpm --filter @claude-royale/server edit-card <cardId> <atributo> <novoValor> [justificativa]
 *   ex.: pnpm --filter @claude-royale/server edit-card gigante attack.damage 240 "muito fraco em defesa"
 *
 * Lê o valor atual, classifica automaticamente (buff/nerf pela semântica do
 * atributo), registra a mudança em shared/src/balanceHistory.ts e o catálogo
 * passa a carregar o novo valor — sem tocar no código da carta.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  CARDS, classifyChange, getAttribute, percentChange,
} from '@claude-royale/shared';

const [cardId, attribute, rawValue, ...justificationParts] = process.argv.slice(2);
if (!cardId || !attribute || rawValue === undefined) {
  console.error('uso: edit-card <cardId> <atributo> <novoValor> [justificativa]');
  console.error('ex.: edit-card gigante attack.damage 240 "fraco demais em defesa"');
  process.exit(1);
}

const card = CARDS[cardId];
if (!card) {
  console.error(`carta "${cardId}" não existe. Ids: ${Object.keys(CARDS).join(', ')}`);
  process.exit(1);
}

const newValue = Number(rawValue);
if (!Number.isFinite(newValue)) {
  console.error(`valor inválido: ${rawValue}`);
  process.exit(1);
}

// CARDS já vem com os patches aplicados — o valor atual é a base do próximo patch.
const oldValue = getAttribute(card, attribute);
if (oldValue === undefined) {
  console.error(`atributo "${attribute}" não existe em ${cardId} (ou não é numérico)`);
  process.exit(1);
}

const kind = classifyChange(attribute, oldValue, newValue);
const justification = justificationParts.join(' ') || 'ajuste manual via ferramenta admin';
const entry = {
  cardId,
  form: 'normal',
  attribute,
  oldValue,
  newValue,
  kind,
  justification,
  expectedImpact: 'a validar em simulação (pnpm --filter @claude-royale/server balance)',
  version: '1.1.x',
  date: new Date().toISOString().slice(0, 10),
};

const here = dirname(fileURLToPath(import.meta.url));
const historyPath = resolve(here, '../../../shared/src/balanceHistory.ts');
const source = readFileSync(historyPath, 'utf8');
const marker = '];';
const insertAt = source.lastIndexOf(marker);
if (insertAt === -1) {
  console.error('não encontrei o fim do array em balanceHistory.ts');
  process.exit(1);
}
const serialized = `  ${JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ')},\n`;
writeFileSync(historyPath, source.slice(0, insertAt) + serialized + source.slice(insertAt));

console.log(`✔ ${card.name} — ${attribute}: ${oldValue} → ${newValue}`);
console.log(`  classificação automática: ${kind} (${percentChange(oldValue, newValue)}%)`);
console.log(`  registrado em shared/src/balanceHistory.ts (visível na Coleção do jogo)`);
