/**
 * Live Controller - Gestão da Transmissão Interativa & Sincronização WebSocket
 * Conecta-se em tempo real ao backend Node.js (/ws) para receber presentes do TikTok,
 * atualizar placares, acionar animações da urna e mão, gerenciar corações e chat.
 */

class LiveController {
  constructor() {
    this.votes13 = 10842;
    this.votes22 = 11000;
    this.totalVotes = 21842;
    this.timerSeconds = 12 * 60 + 35;

    this.timerInterval = null;
    this.commentsInterval = null;
    this.heartsInterval = null;
    this.isAutoBattle = false;

    this.ws = null;
    this.wsConnected = false;

    // Configurações ativas sincronizadas com o backend
    this.config = {
      enableHearts: true,
      enableSimulatedComments: true,
      enableHandAnimation: true,
      enableSound: true,
      transparentBackground: false,
      queueMode: 'detailed'
    };

    // Comentários simulados de fallback caso a live esteja vazia
    this.commentPool = [
      { user: 'rafasouza', text: 'Vai 13! 🔴❤️', team: '13', avatar: 'assets/avatar_rafasouza.png' },
      { user: 'anaclara', text: '22 na frente! 💚💚', team: '22', avatar: 'assets/avatar_anaclara.png' },
      { user: 'brunolima', text: 'Batalha incrível! 👏', team: 'neutral', avatar: 'assets/avatar_brunolima.png' },
      { user: 'natytelles', text: 'Que disputa! 😍', team: 'neutral', avatar: 'assets/avatar_natytelles.png' },
      { user: 'lucas_silva', text: 'Bora virar esse jogo 13! 🚩', team: '13', avatar: 'assets/avatar_pedrooliveira.png' },
      { user: 'mariana.costa', text: '22 tá disparando! 🚀', team: '22', avatar: 'assets/avatar_carolmartins.png' }
    ];
  }

  init() {
    // Referências aos elementos DOM
    this.score13El = document.getElementById('score-13-val');
    this.score22El = document.getElementById('score-22-val');
    this.totalVotesEl = document.getElementById('total-votes-val');
    this.pct13El = document.getElementById('score-13-pct');
    this.pct22El = document.getElementById('score-22-pct');
    this.card13El = document.getElementById('card-13');
    this.card22El = document.getElementById('card-22');
    this.bar13El = document.getElementById('dispute-bar-13');
    this.bar22El = document.getElementById('dispute-bar-22');
    this.timerEl = document.getElementById('live-timer');
    this.commentsListEl = document.getElementById('comments-list');
    this.giftsListEl = document.getElementById('gifts-list');
    this.heartsContainerEl = document.getElementById('hearts-stream');
    this.voteBannerEl = document.getElementById('recent-vote-banner');
    this.liveContainerEl = document.getElementById('live-container');

    this.updateDisplay(false);
    this.startTimer();

    // Conecta ao WebSocket do backend
    this.connectWebSocket();
  }

  // Conexão WebSocket em tempo real com reconexão automática e status na tela
  connectWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const connDot = document.getElementById('conn-dot');
      const connLatency = document.getElementById('conn-latency');

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('📡 WebSocket conectado com o backend da LIVE!');
        this.wsConnected = true;
        if (connDot) connDot.className = 'conn-dot connected';
        if (connLatency) connLatency.textContent = 'WS Online';
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleBackendMessage(msg);
        } catch (err) {
          console.error('Erro ao processar mensagem do servidor:', err);
        }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        if (connDot) connDot.className = 'conn-dot';
        if (connLatency) connLatency.textContent = 'Reconectando...';
        console.log('WebSocket desconectado. Tentando reconectar em 2s...');
        setTimeout(() => this.connectWebSocket(), 2000);
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
      };
    } catch (e) {
      console.warn('Servidor WebSocket indisponível. Operando em modo offline/local.', e);
    }
  }

  // Processa mensagens enviadas pelo backend
  handleBackendMessage(msg) {
    const { type, data } = msg;

    switch (type) {
      case 'INIT_STATE':
        this.applyFullState(data);
        break;

      case 'SCORE_SYNC':
        // Placar oficial atualizado imediatamente (processamento prioritário)
        this.updateScoresOfficial(data);
        break;

      case 'VISUAL_EVENT':
        // Processamento visual desacoplado (modos: normal, accelerated, combo)
        this.onVisualEventReceived(data);
        break;

      case 'VOTE_EVENT':
        this.onVisualEventReceived(data);
        break;

      case 'CONFIG_SYNC':
        this.applyConfig(data);
        break;

      case 'MATCH_STATUS':
        if (data.timerSeconds !== undefined) {
          this.timerSeconds = data.timerSeconds;
        }
        if (data.side13 && data.side22) {
          this.votes13 = data.side13.votes;
          this.votes22 = data.side22.votes;
          this.updateDisplay(false);
        }
        break;

      case 'RESET_EVENT':
        if (data.match) {
          this.votes13 = data.match.side13.votes;
          this.votes22 = data.match.side22.votes;
          this.timerSeconds = data.match.timerSeconds !== undefined ? data.match.timerSeconds : this.timerSeconds;
          this.updateDisplay(false);
        }
        if (window.handController) {
          window.handController.queue = [];
          window.handController.isBusy = false;
          window.handController.resetToIdle();
        }
        if (window.urnaController) {
          window.urnaController.prepareForNewVote();
        }
        break;

      default:
        break;
    }
  }

  // Atualização prioritária e suave dos totais oficiais persistidos
  updateScoresOfficial(data) {
    const old13 = this.votes13;
    const old22 = this.votes22;

    this.votes13 = data.votes13;
    this.votes22 = data.votes22;
    this.lastVotedTeam = data.lastVotedSide;

    const diff13 = Math.abs(this.votes13 - old13);
    const diff22 = Math.abs(this.votes22 - old22);

    // Se houver salto grande (combo), anima a rolagem dos números rapidamente
    if (diff13 > 10 && this.score13El) {
      this.animateNumberRoll(this.score13El, old13, this.votes13, 800);
    }
    if (diff22 > 10 && this.score22El) {
      this.animateNumberRoll(this.score22El, old22, this.votes22, 800);
    }

    this.updateDisplay(true);
  }

  // Animação de rolagem numérica (counter roll) para grandes saltos
  animateNumberRoll(element, start, end, duration) {
    const startTime = performance.now();
    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (end - start) * ease);
      element.textContent = this.formatNumber(current);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.textContent = this.formatNumber(end);
      }
    };
    requestAnimationFrame(step);
  }

  // Aplica o estado inicial completo vindo do backend
  applyFullState(data) {
    if (data.match) {
      this.votes13 = data.match.side13.votes;
      this.votes22 = data.match.side22.votes;
      this.timerSeconds = data.match.timerSeconds;

      if (data.match.title) {
        const titleEl = document.getElementById('main-title');
        if (titleEl) titleEl.textContent = data.match.title;
      }

      const num13El = document.getElementById('label-num-13');
      const num22El = document.getElementById('label-num-22');
      if (num13El && data.match.side13.name) num13El.textContent = data.match.side13.name;
      if (num22El && data.match.side22.name) num22El.textContent = data.match.side22.name;

      this.updateDisplay(false);
    }

    if (data.settings) {
      this.applyConfig(data.settings);
    }
  }

  // Atualiza configurações visuais dinamicamente
  applyConfig(settings) {
    this.config = { ...this.config, ...settings };

    // Fundo transparente para OBS
    if (this.liveContainerEl) {
      if (this.config.transparentBackground) {
        this.liveContainerEl.style.background = 'transparent';
        document.body.style.background = 'transparent';
      } else {
        this.liveContainerEl.style.background = "url('assets/background.jpg') center center / cover no-repeat";
        document.body.style.background = '#08090C';
      }
    }

    // Toggle de sons
    if (window.soundEngine) {
      window.soundEngine.enabled = this.config.enableSound !== false;
    }
  }

  // ========================================================================
  // PROCESSAMENTO VISUAL DINÂMICO (3 MODOS: NORMAL, ACELERADO, COMBO)
  // ========================================================================
  onVisualEventReceived(eventData) {
    const {
      candidate,
      amount,
      units = 1,
      user = '@espectador',
      giftName = 'Rosa',
      icon,
      avatar,
      mode = 'normal',
      milestone = null,
      accelerate = false
    } = eventData;

    const count = units || amount || 1;
    const isCombo = mode === 'combo' || count > 50;
    const isAccel = mode === 'accelerated' || (count >= 6 && count <= 50);

    // 1. Modo específico de animação
    if (isCombo) {
      // -------------------------------------------------------------
      // MODO COMBO (>50 PRESENTES)
      // -------------------------------------------------------------
      this.showMegaComboBanner({
        user,
        count,
        milestone,
        candidate
      });

      // Som comemorativo
      if (this.config.enableSound !== false && window.soundEngine) {
        window.soundEngine.playGiftChime();
      }

      // Executa UMA digitação cadenciada e representativa do combo na urna
      if (this.config.enableHandAnimation !== false && window.handController) {
        window.handController.queueVote(candidate, {
          isCombo: true,
          speed: 0.8
        });
      } else if (window.urnaController) {
        window.urnaController.confirmVote(candidate, 1, false);
      }

    } else if (isAccel) {
      // -------------------------------------------------------------
      // MODO ACELERADO (6 a 50 PRESENTES)
      // -------------------------------------------------------------
      this.showAccelIndicator(count);

      // Animação acelerada e natural de digitação
      if (this.config.enableHandAnimation !== false && window.handController) {
        window.handController.queueVote(candidate, {
          isCombo: true,
          speed: 0.85
        });
      } else if (window.urnaController) {
        window.urnaController.confirmVote(candidate, 1, false);
      }

    } else {
      // -------------------------------------------------------------
      // MODO NORMAL (1 a 5 PRESENTES)
      // -------------------------------------------------------------
      if (this.config.enableHandAnimation !== false && window.handController) {
        window.handController.queueVote(candidate, {
          isCombo: false,
          speed: 1.0
        });
      } else if (window.urnaController) {
        window.urnaController.confirmVote(candidate, 1, false);
      }
    }
  }

  // Indicador de Votos Acelerados sobre a urna (+X VOTOS!)
  showAccelIndicator(count) {
    const el = document.getElementById('accel-indicator');
    if (!el) return;

    el.textContent = `+${count} VOTOS!`;
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');

    clearTimeout(this.accelTimeout);
    this.accelTimeout = setTimeout(() => {
      el.classList.remove('active');
    }, 2400);
  }

  // Mega Combo Banner (>50, 100, 500, 1.000 presentes)
  showMegaComboBanner({ user, count, milestone, candidate }) {
    const banner = document.getElementById('mega-combo-banner');
    if (!banner) return;

    const userEl = document.getElementById('combo-user');
    const labelEl = document.getElementById('combo-label');
    const numEl = document.getElementById('combo-number');

    if (userEl) userEl.textContent = user;
    if (labelEl) {
      if (milestone && milestone.label) {
        labelEl.textContent = milestone.label;
      } else {
        labelEl.textContent = `COMBO ${count} PRESENTES!`;
      }
    }
    if (numEl) numEl.textContent = `+${count} VOTOS PARA O ${candidate}`;

    banner.className = 'mega-combo-banner';
    if (count >= 1000) {
      banner.classList.add('milestone-1000');
    } else if (count >= 500) {
      banner.classList.add('milestone-500');
    } else if (count >= 100) {
      banner.classList.add('milestone-100');
    }

    banner.classList.add('active');

    clearTimeout(this.comboTimeout);
    this.comboTimeout = setTimeout(() => {
      banner.classList.remove('active');
    }, 3200);
  }

  // Formatação de números padrão brasileiro
  formatNumber(num) {
    return (num || 0).toLocaleString('pt-BR');
  }

  // Atualiza placar e barra de disputa
  updateDisplay(animatePulse = true) {
    this.totalVotes = this.votes13 + this.votes22;

    const pct13 = this.totalVotes > 0 ? (this.votes13 / this.totalVotes) * 100 : 50;
    const pct22 = this.totalVotes > 0 ? (this.votes22 / this.totalVotes) * 100 : 50;

    if (this.score13El) this.score13El.textContent = this.formatNumber(this.votes13);
    if (this.score22El) this.score22El.textContent = this.formatNumber(this.votes22);
    if (this.totalVotesEl) this.totalVotesEl.textContent = this.formatNumber(this.totalVotes);

    if (this.pct13El) this.pct13El.textContent = `${pct13.toFixed(1).replace('.', ',')}%`;
    if (this.pct22El) this.pct22El.textContent = `${pct22.toFixed(1).replace('.', ',')}%`;

    if (this.bar13El) this.bar13El.style.width = `${pct13}%`;
    if (this.bar22El) this.bar22El.style.width = `${pct22}%`;

    if (animatePulse) {
      if (this.lastVotedTeam === '13' && this.card13El) {
        this.card13El.classList.remove('pulse-glow');
        void this.card13El.offsetWidth;
        this.card13El.classList.add('pulse-glow');
      } else if (this.lastVotedTeam === '22' && this.card22El) {
        this.card22El.classList.remove('pulse-glow');
        void this.card22El.offsetWidth;
        this.card22El.classList.add('pulse-glow');
      }
    }
  }

  // Incremento local (usado pelo demo ou como fallback)
  addVote(candidate, amount = 1) {
    if (this.wsConnected && this.ws) {
      // Envia comando para o backend registrar oficialmente
      this.ws.send(JSON.stringify({
        type: 'VOTE_ACTION',
        payload: { candidate, amount, user: '@demo.user' }
      }));
    } else {
      // Modo local offline
      this.lastVotedTeam = candidate;
      if (candidate === '13') {
        this.votes13 += amount;
        this.spawnHeartsBurst('#ff3b47', 6);
        this.showRecentVoteBanner('13', amount);
      } else if (candidate === '22') {
        this.votes22 += amount;
        this.spawnHeartsBurst('#00e676', 6);
        this.showRecentVoteBanner('22', amount);
      }
      this.updateDisplay(true);
    }
  }

  // Pílula flutuante de voto recente
  showRecentVoteBanner(candidate, amount = 1, user = null, icon = null) {
    if (!this.voteBannerEl) return;

    const names = ['@luanasouza', '@mariaclara', '@lucas.tech', '@gabriel_sp', '@carol.martins', '@pedrooliveira'];
    const randomUser = user || names[Math.floor(Math.random() * names.length)];

    const userEl = document.getElementById('banner-user');
    const textEl = document.getElementById('banner-text');
    const iconEl = document.getElementById('banner-icon');
    const badgeEl = document.getElementById('banner-badge');

    if (userEl) userEl.textContent = randomUser;
    if (textEl) textEl.textContent = `acabou de votar ${candidate}!`;

    if (candidate === '13') {
      if (iconEl) iconEl.src = icon || 'assets/rose.png';
      if (badgeEl) {
        badgeEl.textContent = `+${amount}`;
        badgeEl.className = 'vote-pill-badge badge-red';
      }
    } else {
      if (iconEl) iconEl.src = icon || 'assets/white_flower.png';
      if (badgeEl) {
        badgeEl.textContent = `+${amount}`;
        badgeEl.className = 'vote-pill-badge badge-green';
      }
    }

    this.voteBannerEl.classList.remove('active');
    void this.voteBannerEl.offsetWidth;
    this.voteBannerEl.classList.add('active');

    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      this.voteBannerEl.classList.remove('active');
    }, 2800);
  }

  // Cronômetro da LIVE
  startTimer() {
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      const h = Math.floor(this.timerSeconds / 3600);
      const m = Math.floor((this.timerSeconds % 3600) / 60);
      const s = this.timerSeconds % 60;
      const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (this.timerEl) this.timerEl.textContent = formatted;
    }, 1000);
  }

  // Fluxo de comentários simulados
  startCommentsTicker() {
    let index = 0;
    this.commentsInterval = setInterval(() => {
      if (this.config.enableSimulatedComments === false) return;
      const item = this.commentPool[index % this.commentPool.length];
      index++;
      this.pushComment(item);
    }, 2800);
  }

  pushComment(item) {
    if (!this.commentsListEl) return;

    const row = document.createElement('div');
    row.className = 'live-comment-bubble animate-slide-up';
    row.innerHTML = `
      <img src="${item.avatar || 'assets/avatar_rafasouza.png'}" class="comment-avatar" alt="${item.user}" onerror="this.src='assets/avatar_rafasouza.png'">
      <div class="comment-content">
        <span class="comment-user">${item.user}</span>
        <span class="comment-text">${item.text}</span>
      </div>
    `;

    this.commentsListEl.appendChild(row);

    while (this.commentsListEl.children.length > 5) {
      this.commentsListEl.removeChild(this.commentsListEl.firstChild);
    }
  }

  // Notificações de presentes
  pushGiftNotification(giftData) {
    if (!this.giftsListEl) return;

    const row = document.createElement('div');
    row.className = 'live-gift-pill animate-slide-up';
    row.innerHTML = `
      <img src="${giftData.avatar || 'assets/avatar_carolmartins.png'}" class="gift-user-avatar" alt="${giftData.user}">
      <div class="gift-pill-info">
        <span class="gift-pill-user">${giftData.user}</span>
        <span class="gift-pill-action">enviou ${giftData.gift} para <strong class="${giftData.target === '13' ? 'color-13' : 'color-22'}">${giftData.target}</strong></span>
      </div>
      <img src="${giftData.icon || 'assets/rose.png'}" class="gift-pill-icon" alt="${giftData.gift}">
      <span class="gift-pill-multiplier">x${giftData.count}</span>
    `;

    this.giftsListEl.appendChild(row);

    if (this.config.enableSound !== false && window.soundEngine) {
      window.soundEngine.playGiftChime();
    }

    while (this.giftsListEl.children.length > 3) {
      this.giftsListEl.removeChild(this.giftsListEl.firstChild);
    }
  }

  // Corações desativados a pedido do usuário
  startHeartsStream() {}
  createFloatingHeart() {}
  spawnHeartsBurst() {}

  // Reset local
  resetToInitial() {
    this.votes13 = 10842;
    this.votes22 = 11000;
    this.updateDisplay(false);
  }
}

window.liveController = new LiveController();
