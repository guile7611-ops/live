/**
 * State Manager - Gerenciador de Estado e Coordenação com SQLite
 * O banco SQLite é a ÚNICA fonte de verdade para os votos, streaks e eventos.
 */

const db = require('./database');

const DEFAULT_SETTINGS = {
  dynamicAnimationEnabled: true,
  normalMaxCount: 5,        // 1 a 5 = Modo normal
  acceleratedMaxCount: 50,  // 6 a 50 = Modo acelerado
  comboThreshold: 50,       // > 50 = Modo combo
  handSpeed: 1.0,           // 0.5x a 2.5x
  barTransitionDuration: 0.5,
  enableHearts: true,
  enableSound: true,
  transparentBackground: false,
  tiktokUsername: '',
  // Efeitos especiais de combo
  comboMilestones: [
    { count: 100, label: 'COMBO 100!', sound: 'chime', color: '#FFD700' },
    { count: 500, label: 'MEGA COMBO 500!', sound: 'epic', color: '#00F0FF' },
    { count: 1000, label: 'ULTRA COMBO 1.000!', sound: 'ultra', color: '#FF0055' }
  ]
};

const DEFAULT_GIFTS = [
  { id: 'rose', name: 'Rosa', targetSide: '13', votesPerUnit: 1, icon: 'assets/rose.png' },
  { id: 'white_flower', name: 'Flor branca', targetSide: '22', votesPerUnit: 1, icon: 'assets/white_flower.png' },
  { id: 'gift_box', name: 'Presente', targetSide: '13', votesPerUnit: 5, icon: 'assets/gift_box.png' },
  { id: 'coracao', name: 'Coração', targetSide: '22', votesPerUnit: 2, icon: 'assets/rose.png' }
];

class StateManager {
  constructor() {
    this.db = db;
    this.matchStatus = 'running'; // 'running', 'paused', 'finished'
    this.timerSeconds = 12 * 60 + 35;
    this.title = 'QUEM VENCE DOMINGO?';
    this.side13Name = '13';
    this.side22Name = '22';
    this.version = 1;

    this.settings = this.db.getSetting('app_settings', DEFAULT_SETTINGS);
    this.gifts = this.db.getSetting('app_gifts', DEFAULT_GIFTS);

    this.startTimerTicker();
  }

  // Retorna o estado completo da aplicação
  getState() {
    const scores = this.db.getScores();
    return {
      version: this.version,
      match: {
        status: this.matchStatus,
        timerSeconds: this.timerSeconds,
        title: this.title,
        side13: {
          name: this.side13Name,
          label: 'Lado 13',
          color: '#E51A24',
          votes: scores.votes13
        },
        side22: {
          name: this.side22Name,
          label: 'Lado 22',
          color: '#0BB053',
          votes: scores.votes22
        },
        totalVotes: scores.totalVotes,
        pct13: scores.pct13,
        pct22: scores.pct22
      },
      settings: this.settings,
      gifts: this.gifts,
      eventHistory: this.db.getRecentEvents(30)
    };
  }

  // Processa evento de voto/presente de forma estritamente atômica
  registerVoteEvent(giftPayload) {
    if (this.matchStatus !== 'running') {
      console.log(`Partida está ${this.matchStatus}. Voto ignorado.`);
      return null;
    }

    const {
      msgId = null,
      groupId = null,
      userId = null,
      giftName = 'Rosa',
      repeatCount = 1,
      repeatEnd = false
    } = giftPayload;

    const username = giftPayload.username || giftPayload.user || 'espectador';

    // Localiza configuração do presente com suporte a nomes em pt/en e IDs oficiais
    const cleanGift = (giftName || '').toLowerCase().trim();
    let giftConfig = this.gifts.find(g => {
      const gName = (g.name || '').toLowerCase().trim();
      const gId = (g.id || '').toLowerCase().trim();
      if (gName === cleanGift || gId === cleanGift) return true;
      // Sinônimos clássicos TikTok
      if ((cleanGift === 'rose' || cleanGift === 'rosa') && (gName === 'rosa' || gName === 'rose' || gId === 'rose')) return true;
      if ((cleanGift.includes('flower') || cleanGift.includes('flor') || cleanGift.includes('branca')) && (gName.includes('flor') || gName.includes('branca') || gId === 'white_flower')) return true;
      return false;
    });

    if (!giftConfig) {
      if (cleanGift === 'rose' || cleanGift === 'rosa') {
        giftConfig = { targetSide: '13', votesPerUnit: 1, icon: 'assets/rose.png' };
      } else if (cleanGift.includes('flower') || cleanGift.includes('flor') || cleanGift.includes('branca')) {
        giftConfig = { targetSide: '22', votesPerUnit: 1, icon: 'assets/white_flower.png' };
      } else {
        // Fallback para o lado 13 se não identificado
        giftConfig = { targetSide: '13', votesPerUnit: 1, icon: 'assets/rose.png' };
      }
    }

    // Executa no SQLite com transação atômica e deduplicação
    const result = this.db.processGiftEvent({
      msgId,
      groupId,
      userId,
      username,
      giftName,
      repeatCount,
      repeatEnd,
      targetSide: giftConfig.targetSide,
      votesPerUnit: giftConfig.votesPerUnit,
      timestamp: Date.now()
    });

    if (result.success) {
      this.version++;
      result.version = this.version;
      result.icon = giftConfig.icon;
    }

    return result;
  }

  // Determina o modo dinâmico da animação baseado na contagem de presentes
  getAnimationMode(count) {
    if (!this.settings.dynamicAnimationEnabled) {
      return 'normal';
    }
    const num = Number(count) || 1;
    if (num <= this.settings.normalMaxCount) {
      return 'normal';
    } else if (num <= this.settings.acceleratedMaxCount) {
      return 'accelerated';
    } else {
      return 'combo';
    }
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.db.saveSetting('app_settings', this.settings);
    this.version++;
    return this.settings;
  }

  updateGifts(newGifts) {
    if (Array.isArray(newGifts)) {
      this.gifts = newGifts;
      this.db.saveSetting('app_gifts', this.gifts);
      this.version++;
    }
    return this.gifts;
  }

  executeAction(action, payload = {}) {
    switch (action) {
      case 'start':
        this.matchStatus = 'running';
        break;
      case 'pause':
        this.matchStatus = 'paused';
        break;
      case 'finish':
        this.matchStatus = 'finished';
        break;
      case 'reset':
        this.db.resetScores(10842, 11000);
        this.timerSeconds = 12 * 60 + 35;
        this.matchStatus = 'running';
        this.version++;
        break;
      case 'zero':
        this.db.resetScores(0, 0);
        this.timerSeconds = 0;
        this.matchStatus = 'running';
        this.version++;
        break;
      case 'setTitles':
        if (payload.title) this.title = payload.title;
        if (payload.side13Name) this.side13Name = payload.side13Name;
        if (payload.side22Name) this.side22Name = payload.side22Name;
        this.version++;
        break;
      default:
        console.warn('Ação desconhecida:', action);
    }
    return this.getState().match;
  }

  startTimerTicker() {
    setInterval(() => {
      if (this.matchStatus === 'running') {
        this.timerSeconds++;
      }
    }, 1000);
  }
}

module.exports = new StateManager();
