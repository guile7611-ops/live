/**
 * TikTok Live Connector & Bridge
 * Recebe eventos de presentes reais do TikTok, webhooks ou simulações
 * e encaminha para a fila inteligente com suporte completo a combos e idempotência.
 */

const queueManager = require('./queueManager');
const stateManager = require('./stateManager');

class TikTokConnector {
  constructor() {
    this.status = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'simulating'
    this.username = '';
    this.connection = null;
    this.stats = {
      giftsReceived: 0,
      totalVotesGenerated: 0,
      duplicatesRejected: 0,
      connectedAt: null
    };
    this.simulationInterval = null;
  }

  getStatus() {
    return {
      status: this.status,
      username: this.username,
      stats: this.stats
    };
  }

  // Processa qualquer presente recebido
  handleGift(giftPayload) {
    const {
      msgId = null,
      groupId = null,
      userId = null,
      username = 'espectador',
      giftName = 'Rosa',
      repeatCount = 1,
      repeatEnd = false
    } = giftPayload;

    this.stats.giftsReceived += 1;

    const result = queueManager.enqueueGift({
      msgId,
      groupId,
      userId,
      username,
      giftName,
      repeatCount,
      repeatEnd
    });

    if (result.duplicate) {
      this.stats.duplicatesRejected += 1;
    } else if (result.success && result.deltaVotes) {
      this.stats.totalVotesGenerated += result.deltaVotes;
    }

    return result;
  }

  // Conexão real com TikTok LIVE (se tiktok-live-connector estiver disponível)
  async connect(username) {
    if (!username) throw new Error('Nome de usuário do TikTok é obrigatório.');

    this.username = username.replace('@', '').trim();
    this.status = 'connecting';

    try {
      let WebcastPushConnection;
      try {
        WebcastPushConnection = require('tiktok-live-connector').WebcastPushConnection;
      } catch (err) {}

      if (WebcastPushConnection) {
        this.connection = new WebcastPushConnection(this.username, {
          processInitialData: false,
          enableExtendedGiftInfo: true
        });

        this.connection.on('gift', (data) => {
          this.handleGift({
            msgId: data.msgId || data.id,
            groupId: data.groupId || (data.userId + '_' + data.giftId),
            userId: data.userId || data.secUid,
            username: data.uniqueId || data.nickname,
            giftName: data.giftName,
            repeatCount: data.repeatCount || 1,
            repeatEnd: data.repeatEnd === 1 || data.repeatEnd === true
          });
        });

        this.connection.on('disconnected', () => {
          this.status = 'disconnected';
          this.connection = null;
        });

        await this.connection.connect();
        this.status = 'connected';
        this.stats.connectedAt = new Date().toISOString();
        return { success: true, status: 'connected', username: this.username };
      } else {
        // Bridge HTTP ativo
        this.status = 'connected';
        this.stats.connectedAt = new Date().toISOString();
        return {
          success: true,
          status: 'connected',
          message: 'Bridge HTTP ativo para @' + this.username + '. Envie presentes para POST /api/tiktok/event.'
        };
      }
    } catch (error) {
      this.status = 'disconnected';
      throw error;
    }
  }

  disconnect() {
    if (this.connection) {
      try { this.connection.disconnect(); } catch (e) {}
      this.connection = null;
    }
    this.stopSimulation();
    this.status = 'disconnected';
    this.username = '';
    return { success: true, status: 'disconnected' };
  }

  toggleSimulation() {
    if (this.status === 'simulating') {
      this.stopSimulation();
      return false;
    } else {
      this.startSimulation();
      return true;
    }
  }

  startSimulation() {
    this.status = 'simulating';
    const users = ['@luanasouza', '@carol.martins', '@pedrooliveira', '@thiago_sp', '@beatriz.22', '@felipe.alves'];
    const gifts = ['Rosa', 'Flor branca', 'Presente', 'Coração'];

    this.simulationInterval = setInterval(() => {
      if (stateManager.matchStatus !== 'running') return;

      const randomUser = users[Math.floor(Math.random() * users.length)];
      const randomGift = gifts[Math.floor(Math.random() * gifts.length)];
      const rand = Math.random();
      
      let count = 1;
      if (rand > 0.8) {
        count = Math.floor(Math.random() * 80) + 20; // 20 a 100 presentes
      } else if (rand > 0.5) {
        count = Math.floor(Math.random() * 15) + 5;  // 5 a 20 presentes
      }

      this.handleGift({
        username: randomUser,
        giftName: randomGift,
        repeatCount: count,
        repeatEnd: true
      });
    }, 2500);
  }

  stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.status === 'simulating') {
      this.status = 'disconnected';
    }
  }
}

module.exports = new TikTokConnector();
