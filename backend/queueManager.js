/**
 * Queue Manager - Desacoplamento entre Contabilização Prioritária e Fila Visual
 * 
 * 1. Processamento de Votos (PRIORITÁRIO / IMEDIATO):
 *    - Persiste atômico no SQLite via stateManager
 *    - Atualiza placar oficial e porcentagens imediatamente
 *    - Não aguarda a animação da urna
 * 
 * 2. Processamento Visual (NÃO PRIORITÁRIO / ADAPTATIVO):
 *    - Modos: Normal (1-5), Acelerado (6-50), Combo (>50)
 *    - Agrupamento inteligente sob carga
 *    - Descarta animações obsoletas se houver flood, NUNCA votos
 */

const stateManager = require('./stateManager');

class QueueManager {
  constructor() {
    this.visualQueue = [];
    this.isProcessingVisual = false;
    this.broadcastFn = null;
    this.maxVisualQueueSize = 20; // Limite de sobrecarga da fila visual
  }

  setBroadcast(fn) {
    this.broadcastFn = fn;
  }

  clearQueue() {
    this.visualQueue = [];
    this.isProcessingVisual = false;
  }

  broadcast(message) {
    if (typeof this.broadcastFn === 'function') {
      this.broadcastFn(message);
    }
  }

  // Ponto de entrada para presentes e votos
  enqueueGift(giftPayload) {
    // ========================================================================
    // ETAPA 1: PROCESSAMENTO DE VOTOS (PRIORITÁRIO / IMEDIATO)
    // ========================================================================
    const result = stateManager.registerVoteEvent(giftPayload);

    if (!result) {
      return { success: false, reason: 'Partida não está ativa ou erro interno.' };
    }

    if (result.duplicate || result.deltaVotes <= 0) {
      // Evento duplicado ou já contabilizado por streak
      return { success: false, duplicate: true, reason: result.reason };
    }

    // Transmite sincronização imediata do placar persistido para todos os clientes
    this.broadcast({
      type: 'SCORE_SYNC',
      version: result.version,
      data: {
        votes13: result.scores.votes13,
        votes22: result.scores.votes22,
        totalVotes: result.scores.totalVotes,
        pct13: result.scores.pct13,
        pct22: result.scores.pct22,
        lastVotedSide: result.candidate,
        deltaVotes: result.deltaVotes,
        user: result.user
      }
    });

    // ========================================================================
    // ETAPA 2: PROCESSAMENTO VISUAL (NÃO PRIORITÁRIO / DINÂMICO)
    // ========================================================================
    const totalCount = result.repeatCount || result.deltaUnits || 1;
    const mode = stateManager.getAnimationMode(totalCount);

    const visualPayload = {
      id: result.eventId,
      candidate: result.candidate,
      amount: result.deltaVotes,
      units: totalCount,
      user: result.user,
      giftName: result.giftName,
      icon: result.icon,
      mode: mode, // 'normal' | 'accelerated' | 'combo'
      timestamp: Date.now()
    };

    // Identifica marcos especiais de combo (100, 500, 1.000)
    if (mode === 'combo') {
      const milestones = stateManager.settings.comboMilestones || [];
      const matched = milestones
        .slice()
        .reverse()
        .find(m => totalCount >= m.count);

      if (matched) {
        visualPayload.milestone = matched;
      }
    }

    this.enqueueVisualEvent(visualPayload);

    return {
      success: true,
      deltaVotes: result.deltaVotes,
      scores: result.scores,
      visualMode: mode
    };
  }

  // Enfileira na fila visual com descarte inteligente sob sobrecarga
  enqueueVisualEvent(visualEvent) {
    if (visualEvent.mode === 'combo') {
      // Combos têm prioridade máxima de exibição
      this.broadcast({
        type: 'VISUAL_EVENT',
        data: visualEvent
      });
      return;
    }

    // Controle de sobrecarga: se houver mais de 15 eventos visuais na fila,
    // consolida ou descarta animações lentas antigas mantendo a interface leve
    if (this.visualQueue.length >= this.maxVisualQueueSize) {
      // Agrupa e descarta eventos visuais obsoletos do meio da fila
      this.visualQueue.splice(0, Math.floor(this.maxVisualQueueSize / 2));
    }

    this.visualQueue.push(visualEvent);

    if (!this.isProcessingVisual) {
      this.processNextVisual();
    }
  }

  // Executa o próximo evento visual de forma cadenciada
  async processNextVisual() {
    if (this.visualQueue.length === 0) {
      this.isProcessingVisual = false;
      return;
    }

    this.isProcessingVisual = true;
    const event = this.visualQueue.shift();

    // Ajusta velocidade caso a fila esteja acumulando
    if (this.visualQueue.length > 3) {
      event.accelerate = true;
    }

    this.broadcast({
      type: 'VISUAL_EVENT',
      data: event
    });

    // Cadência visual harmonizada com a velocidade natural da urna (sem engavetar animações)
    const interval = event.mode === 'combo' ? 3200 : (event.mode === 'accelerated' ? 1800 : 2500);
    setTimeout(() => {
      this.processNextVisual();
    }, interval);
  }
}

module.exports = new QueueManager();
