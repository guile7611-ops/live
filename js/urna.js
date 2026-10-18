/**
 * Urna Controller - Lógica da Urna Eletrônica Brasileira
 * Gerencia a tela LCD, exibição dos dígitos, feedback visual "FIM",
 * e integração com os placares e efeitos sonoros.
 */

class UrnaController {
  constructor() {
    this.digits = [];
    this.maxDigits = 2;
    this.screenState = 'idle'; // 'idle', 'typing', 'fim'
    this.isLocked = false;
  }

  init() {
    this.box0 = document.getElementById('digit-box-0');
    this.box1 = document.getElementById('digit-box-1');
    this.screenFim = document.getElementById('screen-fim');
    this.screenVoting = document.getElementById('screen-voting');
    this.screenSubtitle = document.getElementById('screen-candidate-info');

    this.renderScreen();
    this.bindKeypadEvents();
  }

  // Vincula cliques manuais nos botões do teclado da urna
  bindKeypadEvents() {
    const keys = document.querySelectorAll('.urna-key');
    keys.forEach(k => {
      k.addEventListener('click', (e) => {
        if (this.isLocked) return;
        const key = k.getAttribute('data-key');
        if (['0','1','2','3','4','5','6','7','8','9'].includes(key)) {
          if (window.soundEngine) window.soundEngine.playKeyClick();
          this.typeDigit(key);
        } else if (key === 'corrige') {
          if (window.soundEngine) window.soundEngine.playKeyClick();
          this.corrige();
        } else if (key === 'branco') {
          if (window.soundEngine) window.soundEngine.playKeyClick();
          this.votoBranco();
        } else if (key === 'confirma') {
          this.manualConfirm();
        }
      });
    });
  }

  // Prepara o visor limpo e desbloqueado para um novo ciclo de votação
  prepareForNewVote() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.digits = [];
    this.screenState = 'idle';
    this.isLocked = false;

    if (this.screenVoting && this.screenFim) {
      this.screenFim.classList.remove('flash-fim');
      this.screenFim.style.display = 'none';
      this.screenVoting.style.display = 'flex';
    }

    this.renderScreen();
  }

  // Digita um número no visor da urna
  typeDigit(digit) {
    if (this.screenState === 'fim' || this.isLocked) {
      this.prepareForNewVote();
    }
    if (this.digits.length < this.maxDigits) {
      this.digits.push(digit);
      this.renderScreen();
    }
  }

  // Limpa os dígitos (botão CORRIGE)
  corrige() {
    this.digits = [];
    this.renderScreen();
  }

  // Voto em branco
  votoBranco() {
    this.digits = ['B', 'R'];
    this.renderScreen();
  }

  // Confirmação manual pelo usuário clicando no teclado com mouse
  manualConfirm() {
    if (this.isLocked || this.screenState === 'fim') return;
    const currentCode = this.digits.join('');
    if (currentCode === '13' || currentCode === '22') {
      this.confirmVote(currentCode, 1, true); // isManual = true
    } else {
      if (window.soundEngine) window.soundEngine.playKeyClick();
      this.corrige();
    }
  }

  // Confirmação disparada pela mão animada ou pelo usuário
  // isManual = true SOMENTE quando o usuário clica com o mouse na urna
  confirmVote(candidateNumber, multiplier = 1, isManual = false) {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.isLocked = true;
    this.screenState = 'fim';

    // Som clássico da urna brasileira
    if (window.soundEngine) {
      window.soundEngine.playUrnaConfirma();
    }

    // Exibe tela oficial FIM com animação
    if (this.screenVoting && this.screenFim) {
      this.screenVoting.style.display = 'none';
      this.screenFim.style.display = 'flex';
      this.screenFim.classList.add('flash-fim');
    }

    // CRÍTICO: Só notifica o backend se for um clique manual físico!
    // NUNCA emite voto se for animação vinda de um evento, evitando loop infinito.
    if (isManual && window.liveController) {
      window.liveController.addVote(candidateNumber, multiplier);
    }

    // Após 1.1s, limpa a tela e prepara para o próximo voto
    this.resetTimer = setTimeout(() => {
      this.prepareForNewVote();
    }, 1100);
  }

  // Reseta o visor para o estado inicial pronto para votar
  resetScreen() {
    this.prepareForNewVote();
  }

  // Atualiza os boxes de dígitos e o cursor piscante
  renderScreen() {
    if (!this.box0 || !this.box1) return;

    // Dígito 0
    if (this.digits.length >= 1) {
      this.box0.textContent = this.digits[0];
      this.box0.classList.remove('cursor-active');
    } else {
      this.box0.textContent = '';
      this.box0.classList.add('cursor-active');
    }

    // Dígito 1
    if (this.digits.length >= 2) {
      this.box1.textContent = this.digits[1];
      this.box1.classList.remove('cursor-active');
    } else if (this.digits.length === 1) {
      this.box1.textContent = '';
      this.box1.classList.add('cursor-active');
    } else {
      this.box1.textContent = '';
      this.box1.classList.remove('cursor-active');
    }

    // Legenda/Info opcional
    if (this.screenSubtitle) {
      const code = this.digits.join('');
      if (code === '13') {
        this.screenSubtitle.textContent = 'CANDIDATO 13';
        this.screenSubtitle.style.color = '#c62828';
      } else if (code === '22') {
        this.screenSubtitle.textContent = 'CANDIDATO 22';
        this.screenSubtitle.style.color = '#2e7d32';
      } else {
        this.screenSubtitle.textContent = 'DIGITE SEU VOTO';
        this.screenSubtitle.style.color = '#777';
      }
    }
  }
}

window.urnaController = new UrnaController();
