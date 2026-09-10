import { useEffect, useMemo, useState } from 'react';
import {
  BALANCE_HISTORY, deriveStats, getCard, getAttribute, percentChange,
  type BalanceChange, type CardDef,
} from '@claude-royale/shared';

/**
 * Painel de Balanceamento (acesso via #admin):
 * 1. Saúde do meta — winrate simulada + uso/winrate reais (telemetria)
 * 2. Sugestões — heurística propõe a mudança certa; simule antes de aplicar
 * 3. Rework — mudanças compostas com trade-off obrigatório
 * 4. Linha do tempo — histórico completo de patches
 */

function serverHttp(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/^ws/, 'http');
  return `${location.protocol === 'https:' ? 'https' : 'http'}://${location.hostname}:2567`;
}

async function api<T>(path: string, key: string, body?: unknown): Promise<T> {
  const response = await fetch(`${serverHttp()}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-admin-key': key },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

interface SimResult {
  matches: number;
  elapsedSeconds: number;
  cards: Record<string, { games: number; wins: number; draws: number }>;
  matchups: Record<string, Record<string, { games: number; wins: number }>>;
}

interface Telemetry {
  matches: number;
  cards: Record<string, { usagePct: number; winrate: number; decks: number }>;
}

interface Suggestion {
  card: CardDef;
  winrate: number;
  attribute: string;
  oldValue: number;
  newValue: number;
  kind: string;
  diagnosis: string;
  expectedImpact: string;
}

function winrateOf(sim: SimResult, cardId: string): number {
  const s = sim.cards[cardId];
  if (!s || s.games === 0) return 50;
  const decided = s.games - s.draws;
  return decided > 0 ? Math.round((s.wins / decided) * 1000) / 10 : 50;
}

/** Heurística: escolhe QUAL atributo mexer com base nos derivados vs. pares de custo. */
function buildSuggestions(sim: SimResult, cards: CardDef[]): Suggestion[] {
  const byCost = new Map<number, CardDef[]>();
  for (const card of cards) {
    byCost.set(card.cost, [...(byCost.get(card.cost) ?? []), card]);
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };

  const suggestions: Suggestion[] = [];
  for (const card of cards) {
    if (card.type === 'mirror') continue;
    const winrate = winrateOf(sim, card.id);
    if (winrate >= 45 && winrate <= 55) continue;

    const over = winrate > 55;
    const derived = deriveStats(card);
    const peers = (byCost.get(card.cost) ?? []).filter((p) => p.id !== card.id);
    const peerHp = median(peers.map((p) => deriveStats(p).hpPerElixir ?? 0).filter(Boolean));
    const peerDps = median(peers.map((p) => deriveStats(p).dpsPerElixir ?? 0).filter(Boolean));

    let attribute = '';
    let factor = over ? 0.92 : 1.1;
    let diagnosis = '';

    if (card.components.spawner && over) {
      attribute = 'spawner.interval';
      factor = 1.15;
      diagnosis = `gera ${derived.totalSpawned ?? '?'} unidades na vida útil — pressão passiva alta`;
    } else if (card.components.spell) {
      attribute = 'spell.damage';
      diagnosis = `dano total do feitiço ${derived.spellTotalDamage} para ${card.cost} de elixir`;
    } else if ((derived.hpPerElixir ?? 0) > peerHp && over) {
      attribute = 'health.hp';
      diagnosis = `vida/elixir ${derived.hpPerElixir} vs mediana ${peerHp} dos custo-${card.cost}`;
    } else if ((derived.dpsPerElixir ?? 0) > peerDps && over) {
      attribute = 'attack.damage';
      diagnosis = `DPS/elixir ${derived.dpsPerElixir} vs mediana ${peerDps} dos custo-${card.cost}`;
    } else if (!over && (derived.hpPerElixir ?? 0) < peerHp && card.components.health) {
      attribute = 'health.hp';
      diagnosis = `vida/elixir ${derived.hpPerElixir} abaixo da mediana ${peerHp}`;
    } else if (card.components.attack) {
      attribute = 'attack.damage';
      diagnosis = over ? 'sem outlier claro — ajuste conservador no dano' : 'fraca no geral — dano é o ajuste mais direto';
    } else if (card.components.health) {
      attribute = 'health.hp';
      diagnosis = 'sem componente de ataque — ajuste pela vida';
    } else {
      continue;
    }

    const oldValue = getAttribute(card, attribute);
    if (oldValue === undefined) continue;
    const newValue = Math.round(oldValue * factor);
    if (newValue === oldValue) continue;

    suggestions.push({
      card,
      winrate,
      attribute,
      oldValue,
      newValue,
      kind: over ? 'nerf' : 'buff',
      diagnosis,
      expectedImpact: over
        ? 'reduzir presença sem matar a identidade da carta'
        : 'tornar a carta competitiva na banda 45–55%',
    });
  }
  return suggestions.sort((a, b) => Math.abs(b.winrate - 50) - Math.abs(a.winrate - 50));
}

type Tab = 'saude' | 'sugestoes' | 'rework' | 'timeline' | 'usuarios';

export function AdminScreen({ onExit }: { onExit: () => void }) {
  const [key, setKey] = useState(() => sessionStorage.getItem('claude-royale:admin-key') ?? '');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('saude');
  const [cards, setCards] = useState<CardDef[]>([]);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<BalanceChange[]>(BALANCE_HISTORY);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [matchupCard, setMatchupCard] = useState('');
  const [patchResults, setPatchResults] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Array<Record<string, unknown>>>([]);
  const [matches, setMatches] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!authed || tab !== 'usuarios') return;
    Promise.all([
      api<Array<Record<string, unknown>>>('/admin/subscribers', key),
      api<Array<Record<string, unknown>>>('/admin/matches', key),
    ]).then(([s, m]) => { setSubs(s); setMatches(m); }).catch(() => setError('falha ao carregar usuários'));
  }, [authed, tab, key]);

  const login = async () => {
    try {
      setError('');
      const list = await api<CardDef[]>('/admin/cards', key);
      setCards(list);
      sessionStorage.setItem('claude-royale:admin-key', key);
      setAuthed(true);
      api<Telemetry>('/admin/telemetry', key).then(setTelemetry).catch(() => undefined);
      api<BalanceChange[]>('/admin/history', key).then(setHistory).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'falha');
    }
  };

  useEffect(() => {
    if (key) void login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSim = async (matches: number) => {
    setBusy(`Simulando ${matches} partidas…`);
    try {
      setSim(await api<SimResult>('/admin/simulate', key, { matches }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'falha');
    } finally {
      setBusy('');
    }
  };

  const simulatePatch = async (s: Suggestion) => {
    setBusy(`Testando ${s.card.name} ${s.attribute} ${s.oldValue}→${s.newValue}…`);
    try {
      const out = await api<{ result: SimResult }>('/admin/simulate-patch', key, {
        cardId: s.card.id, attribute: s.attribute, newValue: s.newValue, matches: 200,
      });
      const after = winrateOf(out.result, s.card.id);
      setPatchResults((prev) => ({
        ...prev,
        [s.card.id + s.attribute]: `com a mudança: ${after}% (antes ${s.winrate}%)`,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'falha');
    } finally {
      setBusy('');
    }
  };

  const applyPatch = async (s: Suggestion) => {
    setBusy(`Aplicando…`);
    try {
      await api('/admin/apply-patch', key, {
        cardId: s.card.id, attribute: s.attribute, newValue: s.newValue,
        justification: `${s.winrate}% em ${sim?.matches ?? '?'} partidas — ${s.diagnosis}`,
        expectedImpact: s.expectedImpact,
      });
      const fresh = await api<BalanceChange[]>('/admin/history', key);
      setHistory(fresh);
      setPatchResults((prev) => ({ ...prev, [s.card.id + s.attribute]: '✅ aplicado e registrado' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'falha');
    } finally {
      setBusy('');
    }
  };

  const suggestions = useMemo(
    () => (sim ? buildSuggestions(sim, cards) : []),
    [sim, cards],
  );

  if (!authed) {
    return (
      <div className="admin-screen">
        <div className="modal-card onboarding-card">
          <h3>🎛️ Painel de Balanceamento</h3>
          <input
            className="code-input name-input"
            type="password"
            placeholder="chave admin"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
          />
          {error && <p className="admin-error">{error}</p>}
          <div className="result-actions">
            <button className="play-button secondary" onClick={onExit}>Voltar</button>
            <button className="play-button" onClick={login}>Entrar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-screen">
      <header className="admin-header">
        <h2>🎛️ Balanceamento</h2>
        <nav className="difficulty-picker">
          {(
            [
              ['saude', '📊 Saúde do meta'],
              ['sugestoes', `💡 Sugestões${suggestions.length ? ` (${suggestions.length})` : ''}`],
              ['rework', '🔁 Rework'],
              ['timeline', '📜 Linha do tempo'],
              ['usuarios', '👥 Usuários'],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              className={`difficulty-option ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="icon-button" onClick={onExit} aria-label="Sair">✕</button>
      </header>

      {busy && <div className="admin-busy"><div className="spinner" /> {busy}</div>}
      {error && <p className="admin-error">{error}</p>}

      {tab === 'saude' && (
        <section>
          <div className="admin-actions">
            <button className="text-button" onClick={() => runSim(200)}>▶ Simular 200</button>
            <button className="text-button" onClick={() => runSim(600)}>▶▶ Simular 600</button>
            <span className="admin-note">
              {sim ? `${sim.matches} partidas em ${sim.elapsedSeconds}s` : 'rode uma simulação para preencher a tabela'}
              {telemetry && ` · telemetria real: ${telemetry.matches} partidas`}
            </span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Carta</th><th>Custo</th><th>WR sim</th><th>WR real</th>
                <th>Uso real</th><th>DPS/elixir</th><th>Vida/elixir</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cards
                .map((card) => ({ card, wr: sim ? winrateOf(sim, card.id) : null }))
                .sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0))
                .map(({ card, wr }) => {
                  const derived = deriveStats(card);
                  const tel = telemetry?.cards[card.id];
                  const status = wr === null ? '—' : wr > 55 ? '🔴 forte' : wr < 45 ? '🟡 fraca' : '🟢 ok';
                  return (
                    <tr key={card.id} onClick={() => setMatchupCard(card.id)}>
                      <td>{card.emoji} {card.name}</td>
                      <td>{card.cost}</td>
                      <td>{wr === null ? '—' : `${wr}%`}</td>
                      <td>{tel ? `${tel.winrate}%` : '—'}</td>
                      <td>{tel ? `${tel.usagePct}%` : '—'}</td>
                      <td>{derived.dpsPerElixir ?? '—'}</td>
                      <td>{derived.hpPerElixir ?? '—'}</td>
                      <td>{status}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {sim && matchupCard && sim.matchups[matchupCard] && (
            <div className="admin-matchups">
              <h4>Confrontos de {getCard(matchupCard)?.name} (clique numa linha para trocar)</h4>
              {Object.entries(sim.matchups[matchupCard])
                .filter(([, m]) => m.games >= 20)
                .map(([opp, m]) => ({ opp, wr: Math.round((m.wins / m.games) * 100), games: m.games }))
                .sort((a, b) => b.wr - a.wr)
                .slice(0, 12)
                .map((row) => (
                  <span key={row.opp} className={`matchup ${row.wr >= 55 ? 'good' : row.wr <= 45 ? 'bad' : ''}`}>
                    {getCard(row.opp)?.emoji} {getCard(row.opp)?.name}: {row.wr}%
                  </span>
                ))}
            </div>
          )}
        </section>
      )}

      {tab === 'sugestoes' && (
        <section>
          {!sim && <p className="admin-note">Rode uma simulação na aba Saúde para gerar sugestões.</p>}
          {suggestions.map((s) => {
            const resultKey = s.card.id + s.attribute;
            return (
              <div key={resultKey} className="suggestion-card">
                <div className="suggestion-head">
                  <strong>{s.kind === 'nerf' ? '🔴' : '🟡'} {s.card.emoji} {s.card.name}</strong>
                  <span>{s.winrate}% em {sim?.matches} partidas</span>
                </div>
                <p>Diagnóstico: {s.diagnosis}</p>
                <p>
                  Sugestão: <code>{s.attribute}</code> {s.oldValue} → {s.newValue}{' '}
                  ({percentChange(s.oldValue, s.newValue)}%, {s.kind})
                </p>
                {patchResults[resultKey] && <p className="admin-note">📈 {patchResults[resultKey]}</p>}
                <div className="result-actions">
                  <button className="text-button" onClick={() => simulatePatch(s)}>
                    🧪 Simular com essa mudança
                  </button>
                  <button className="text-button" onClick={() => applyPatch(s)}>
                    ✅ Aplicar e registrar
                  </button>
                </div>
              </div>
            );
          })}
          {sim && suggestions.length === 0 && (
            <p className="admin-note">🎉 Todas as cartas dentro da banda 45–55%.</p>
          )}
        </section>
      )}

      {tab === 'rework' && <ReworkForm cards={cards} adminKey={key} onApplied={() => {
        api<BalanceChange[]>('/admin/history', key).then(setHistory).catch(() => undefined);
      }} />}

      {tab === 'timeline' && (
        <section>
          {[...history].reverse().map((change, i) => (
            <div key={i} className="suggestion-card">
              <div className="suggestion-head">
                <strong>{getCard(change.cardId)?.emoji} {getCard(change.cardId)?.name ?? change.cardId}</strong>
                <span>v{change.version} · {change.date} · {change.kind}</span>
              </div>
              <p>
                <code>{change.attribute}</code> {change.oldValue} → {change.newValue}{' '}
                ({percentChange(change.oldValue, change.newValue)}%)
              </p>
              <p className="admin-note">{change.justification}</p>
            </div>
          ))}
        </section>
      )}

      {tab === 'usuarios' && (
        <section>
          <h3>👥 E-mails cadastrados ({subs.length})</h3>
          {subs.length === 0 ? (
            <p className="admin-note">Nenhum cadastro ainda.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>E-mail</th><th>Nome</th><th>Updates</th><th>Origem</th><th>Data</th></tr>
              </thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={i}>
                    <td>{String(s.email ?? '')}</td>
                    <td>{String(s.name ?? '—')}</td>
                    <td>{s.wantsUpdates === false ? '❌' : '✅'}</td>
                    <td>{String(s.source ?? '')}</td>
                    <td>{String(s.at ?? '').slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ marginTop: 20 }}>⚔️ Últimas partidas ({matches.length})</h3>
          {matches.length === 0 ? (
            <p className="admin-note">Nenhuma partida registrada ainda.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Quando</th><th>Jogadores</th><th>Vencedor</th><th>Dur.</th><th>vs Bot</th></tr>
              </thead>
              <tbody>
                {matches.map((m, i) => {
                  const players = Array.isArray(m.players) ? m.players as Array<Record<string, unknown>> : [];
                  return (
                    <tr key={i}>
                      <td>{String(m.at ?? '').slice(0, 16).replace('T', ' ')}</td>
                      <td>{players.map((p) => String(p.name ?? '?')).join(' × ')}</td>
                      <td>{String(m.winner ?? '—')}</td>
                      <td>{String(m.durationSeconds ?? 0)}s</td>
                      <td>{m.vsBot ? '🤖' : '⚔️'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

/** Rework assistido: N mudanças agrupadas com trade-off obrigatório. */
function ReworkForm({
  cards, adminKey, onApplied,
}: { cards: CardDef[]; adminKey: string; onApplied: () => void }) {
  const [cardId, setCardId] = useState('');
  const [tradeoff, setTradeoff] = useState('');
  const [changes, setChanges] = useState([{ attribute: '', newValue: '' }]);
  const [status, setStatus] = useState('');

  const apply = async () => {
    if (!cardId || tradeoff.trim().length < 10) {
      setStatus('Escolha a carta e descreva o trade-off (obrigatório).');
      return;
    }
    try {
      for (const change of changes) {
        if (!change.attribute || change.newValue === '') continue;
        await api('/admin/apply-patch', adminKey, {
          cardId,
          attribute: change.attribute,
          newValue: Number(change.newValue),
          kind: 'rework',
          justification: `Rework: ${tradeoff}`,
          expectedImpact: tradeoff,
        });
      }
      setStatus('✅ Rework aplicado e registrado.');
      onApplied();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'falha');
    }
  };

  return (
    <section className="rework-form">
      <select className="code-input name-input" value={cardId} onChange={(e) => setCardId(e.target.value)}>
        <option value="">— carta —</option>
        {cards.map((card) => (
          <option key={card.id} value={card.id}>{card.name}</option>
        ))}
      </select>
      {changes.map((change, i) => (
        <div key={i} className="rework-row">
          <input
            className="code-input name-input"
            placeholder="atributo (ex.: attack.damage)"
            value={change.attribute}
            onChange={(e) => setChanges(changes.map((c, j) => (j === i ? { ...c, attribute: e.target.value } : c)))}
          />
          <input
            className="code-input name-input"
            placeholder="novo valor"
            value={change.newValue}
            onChange={(e) => setChanges(changes.map((c, j) => (j === i ? { ...c, newValue: e.target.value } : c)))}
          />
        </div>
      ))}
      <button className="text-button" onClick={() => setChanges([...changes, { attribute: '', newValue: '' }])}>
        + mudança
      </button>
      <textarea
        className="code-input name-input rework-tradeoff"
        placeholder="Trade-off obrigatório: perde X em troca de Y…"
        value={tradeoff}
        onChange={(e) => setTradeoff(e.target.value)}
      />
      <button className="play-button" onClick={apply}>Aplicar rework</button>
      {status && <p className="admin-note">{status}</p>}
    </section>
  );
}
