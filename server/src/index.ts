import http from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { BattleRoom } from './BattleRoom';
import { lookupRoomByCode } from './roomRegistry';
import { topPlayers } from './leaderboard';
import { addSubscriber } from './subscribers';
import { handleAdminRequest } from './admin';
import { loadRemoteProfile, saveRemoteProfile } from './profileStore';

const PORT = Number(process.env.PORT ?? 2567);

// Servidor HTTP próprio: lookup de sala, ranking, sync de perfil e painel admin.
const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-admin-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (await handleAdminRequest(req, res)) return;

  // Sincronização de perfil por token
  const profileMatch = req.url?.match(/^\/profile\/([a-zA-Z0-9-]{8,64})$/);
  if (profileMatch) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      const found = loadRemoteProfile(profileMatch[1]);
      res.writeHead(found ? 200 : 404);
      res.end(JSON.stringify(found ?? { error: 'não encontrado' }));
      return;
    }
    if (req.method === 'PUT') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try {
        const ok = raw.length < 200_000 && saveRemoteProfile(profileMatch[1], JSON.parse(raw));
        res.writeHead(ok ? 200 : 400);
        res.end(JSON.stringify({ ok }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false }));
      }
      return;
    }
  }

  const match = req.url?.match(/^\/room-by-code\/([A-Za-z0-9]{4,6})$/);
  if (req.method === 'GET' && match) {
    const roomId = lookupRoomByCode(match[1]);
    res.setHeader('Content-Type', 'application/json');
    if (roomId) {
      res.writeHead(200);
      res.end(JSON.stringify({ roomId }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'sala não encontrada' }));
    }
    return;
  }

  // Cadastro de e-mail para updates
  if (req.method === 'POST' && req.url === '/subscribe') {
    res.setHeader('Content-Type', 'application/json');
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4000) break; // anti-abuso
    }
    try {
      const body = JSON.parse(raw);
      const result = addSubscriber(body?.email, typeof body?.source === 'string' ? body.source : 'unknown', body?.name);
      res.writeHead(result === 'invalid' ? 400 : 200);
      res.end(JSON.stringify({ result }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ result: 'invalid' }));
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/leaderboard') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(topPlayers(10)));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('⚔️ Claude Royale server');
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// filterBy: partidas públicas (privateCode vazio) só casam entre si;
// salas com código só casam com quem digitou o mesmo código.
gameServer.define('battle', BattleRoom).filterBy(['privateCode', 'vsBot']);

gameServer.listen(PORT).then(() => {
  console.log(`⚔️  Claude Royale server ouvindo em ws://localhost:${PORT}`);
});

