/**
 * Servidor Principal - TikTok LIVE Urna Eletrônica (13 vs 22)
 * Backend Node.js com Express e WebSocket em tempo real.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const stateManager = require('./backend/stateManager');
const queueManager = require('./backend/queueManager');
const tiktokConnector = require('./backend/tiktokConnector');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Arquivos estáticos
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use(express.static(path.join(__dirname, 'public')));

// Broadcast via WebSocket para todos os clientes conectados (overlay e admin)
function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Conecta o broadcast do queueManager ao WebSocket
queueManager.setBroadcast(broadcast);

// WebSocket - Gerenciamento de conexões
wss.on('connection', (ws) => {
  // Envia estado completo imediatamente na conexão
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    data: stateManager.getState()
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      handleClientMessage(ws, parsed);
    } catch (e) {
      console.error('Mensagem WS inválida:', e.message);
    }
  });

  ws.on('error', (err) => console.error('WS Error:', err));
});

// Processa comandos enviados via WebSocket
function handleClientMessage(ws, msg) {
  const { type, payload } = msg;

  if (type === 'REQUEST_STATE') {
    ws.send(JSON.stringify({
      type: 'INIT_STATE',
      data: stateManager.getState()
    }));
  } else if (type === 'VOTE_ACTION') {
    // Voto disparado via WS
    queueManager.enqueueGift({
      user: payload.user || 'Admin',
      giftName: payload.giftName || (payload.candidate === '13' ? 'Rosa' : 'Flor branca'),
      count: payload.amount || 1
    });
  }
}

// ============================================================================
// ROTAS DE INTERFACE (HTML)
// ============================================================================

// 1. / e /overlay - Overlay Principal da Live
app.get(['/', '/overlay'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. /admin - Painel Administrativo
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 3. /test - Painel de Testes & Simulação
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test.html'));
});

// ============================================================================
// ROTAS DE API (REST)
// ============================================================================

// Obter estado atual
app.get('/api/state', (req, res) => {
  res.json({
    success: true,
    data: stateManager.getState(),
    tiktok: tiktokConnector.getStatus()
  });
});

// Atualizar configurações visuais e preferências
app.post('/api/settings', (req, res) => {
  const updated = stateManager.updateSettings(req.body);
  broadcast({
    type: 'CONFIG_SYNC',
    data: updated
  });
  res.json({ success: true, settings: updated });
});

// Atualizar mapeamento de presentes
app.post('/api/gifts', (req, res) => {
  const updated = stateManager.updateGifts(req.body.gifts);
  broadcast({
    type: 'GIFTS_SYNC',
    data: updated
  });
  res.json({ success: true, gifts: updated });
});

// Controle da partida (start, pause, reset, zero, finish, setTitles)
app.post('/api/match/action', (req, res) => {
  const { action, payload } = req.body;
  const updatedMatch = stateManager.executeAction(action, payload);

  if (action === 'reset' || action === 'zero') {
    queueManager.clearQueue();

    // Sincroniza imediatamente o placar oficial em todas as telas
    broadcast({
      type: 'SCORE_SYNC',
      version: stateManager.version,
      data: {
        votes13: updatedMatch.side13.votes,
        votes22: updatedMatch.side22.votes,
        totalVotes: updatedMatch.totalVotes,
        pct13: updatedMatch.pct13,
        pct22: updatedMatch.pct22,
        lastVotedSide: null,
        deltaVotes: 0
      }
    });

    // Emite evento específico de RESET para limpar visor da urna e fila da mão
    broadcast({
      type: 'RESET_EVENT',
      data: {
        action,
        match: updatedMatch
      }
    });
  }

  broadcast({
    type: 'MATCH_STATUS',
    data: updatedMatch
  });
  res.json({ success: true, match: updatedMatch });
});

// Inserir voto manual (API)
app.post('/api/vote', (req, res) => {
  const { candidate, amount = 1, user = 'Admin', giftName } = req.body;
  const resolvedGift = giftName || (candidate === '13' ? 'Rosa' : 'Flor branca');

  const event = queueManager.enqueueGift({
    user,
    giftName: resolvedGift,
    count: amount
  });

  res.json({ success: true, event });
});

// Webhook para eventos do TikTok Live (de bridges externos ou automações)
app.post('/api/tiktok/event', (req, res) => {
  const { username, giftName, count = 1, avatar } = req.body;

  if (!giftName) {
    return res.status(400).json({ error: 'giftName é obrigatório.' });
  }

  const result = tiktokConnector.handleGift({
    username: username || 'espectador',
    giftName,
    count: parseInt(count, 10) || 1,
    avatar
  });

  res.json({ success: true, event: result });
});

// Conectar ao TikTok Live real
app.post('/api/tiktok/connect', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await tiktokConnector.connect(username);
    broadcast({
      type: 'TIKTOK_STATUS',
      data: tiktokConnector.getStatus()
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Desconectar do TikTok Live
app.post('/api/tiktok/disconnect', (req, res) => {
  const result = tiktokConnector.disconnect();
  broadcast({
    type: 'TIKTOK_STATUS',
    data: tiktokConnector.getStatus()
  });
  res.json(result);
});

// Status do TikTok Connector
app.get('/api/tiktok/status', (req, res) => {
  res.json(tiktokConnector.getStatus());
});

// Alternar simulador de live
app.post('/api/tiktok/simulate', (req, res) => {
  const isSimulating = tiktokConnector.toggleSimulation();
  broadcast({
    type: 'TIKTOK_STATUS',
    data: tiktokConnector.getStatus()
  });
  res.json({ success: true, isSimulating });
});

// Endpoint de Teste de Carga Oficial Obrigatório:
// Usuário A (1.000 para 22) e Usuário B (400 para 13) intercalados partindo de zero.
app.post('/api/test/heavy-load', (req, res) => {
  const { startFromZero = true } = req.body;

  if (startFromZero) {
    stateManager.executeAction('zero');
    broadcast({
      type: 'MATCH_STATUS',
      data: stateManager.getState().match
    });
  }

  const streakIdA = 'streak_userA_22_' + Date.now();
  const streakIdB = 'streak_userB_13_' + Date.now();

  // Sequência intercalada de streaks cumulativos
  const steps = [
    { user: '@usuario_A', candidate: '22', giftName: 'Flor branca', count: 100, groupId: streakIdA, repeatEnd: false },
    { user: '@usuario_B', candidate: '13', giftName: 'Rosa', count: 50, groupId: streakIdB, repeatEnd: false },
    { user: '@usuario_A', candidate: '22', giftName: 'Flor branca', count: 250, groupId: streakIdA, repeatEnd: false },
    { user: '@usuario_B', candidate: '13', giftName: 'Rosa', count: 120, groupId: streakIdB, repeatEnd: false },
    { user: '@usuario_A', candidate: '22', giftName: 'Flor branca', count: 500, groupId: streakIdA, repeatEnd: false },
    { user: '@usuario_B', candidate: '13', giftName: 'Rosa', count: 250, groupId: streakIdB, repeatEnd: false },
    { user: '@usuario_A', candidate: '22', giftName: 'Flor branca', count: 750, groupId: streakIdA, repeatEnd: false },
    { user: '@usuario_B', candidate: '13', giftName: 'Rosa', count: 400, groupId: streakIdB, repeatEnd: true }, // Encerra B em 400
    // Repetição redundante de B para testar idempotência (não deve somar novamente)
    { user: '@usuario_B', candidate: '13', giftName: 'Rosa', count: 400, groupId: streakIdB, repeatEnd: true },
    { user: '@usuario_A', candidate: '22', giftName: 'Flor branca', count: 1000, groupId: streakIdA, repeatEnd: true }, // Encerra A em 1.000
    // Repetição redundante de A para testar idempotência (não deve somar novamente)
    { user: '@usuario_A', candidate: '22', giftName: 'Flor branca', count: 1000, groupId: streakIdA, repeatEnd: true }
  ];

  steps.forEach(step => {
    queueManager.enqueueGift({
      user: step.user,
      giftName: step.giftName,
      repeatCount: step.count,
      groupId: step.groupId,
      repeatEnd: step.repeatEnd
    });
  });

  const finalScores = stateManager.db.getScores();

  res.json({
    success: true,
    message: 'Carga oficial executada com sucesso!',
    scores: finalScores,
    expected: {
      votes13: 400,
      votes22: 1000,
      totalVotes: 1400,
      pct13: 28.57,
      pct22: 71.43
    },
    passed: finalScores.votes13 === 400 && finalScores.votes22 === 1000
  });
});


// Inicia o servidor
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Servidor TikTok LIVE Urna Eletrônica rodando!`);
  console.log(`📺 Overlay da Live: http://localhost:${PORT}/overlay`);
  console.log(`⚙️  Painel Admin:    http://localhost:${PORT}/admin`);
  console.log(`🧪 Cockpit de Teste: http://localhost:${PORT}/test`);
  console.log(`📡 WebSocket ativo: ws://localhost:${PORT}/ws`);
  console.log(`=======================================================`);
});
