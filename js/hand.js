/**
 * Hand Controller - Animação ultrarrealista da mão digitando na Urna Eletrônica
 * Utiliza o sprite hand_pointing_perfect.png (mão com manga escura vindo do canto inferior direito
 * e indicador apontando para cima e esquerda, idêntico à pose do mockup).
 * Âncora da ponta do dedo indicador: 2.46% horizontal, 0.0% vertical.
 */

class HandController {
  constructor() {
    this.handEl = null;
    this.containerEl = null;
    this.queue = [];
    this.isBusy = false;
    this.idleTimer = null;
    
    // Dimensões do sprite da mão calibradas
    this.handWidth = 210;
    this.handHeight = 217;
    this.anchorX = 0.0246; // 2.46% da largura
    this.anchorY = 0.0000; // 0.00% da altura (topo extremo da ponta do dedo)
  }

  init(handElement, containerElement) {
    this.handEl = handElement;
    this.containerEl = containerElement;
    this.resetToIdle();
  }

  // Posição de repouso (hover ao lado da tecla 3 / confirma, exatamente como no mockup)
  resetToIdle() {
    if (!this.handEl || !this.containerEl) return;
    this.handEl.classList.remove('pressing');
    this.handEl.classList.add('idle');

    // Posiciona a ponta do indicador suavemente tocando/hovering sobre a tecla 3
    const key3Coords = this.getKeyCoords('[data-key="3"]');
    if (key3Coords) {
      // Leve afastamento para idle (+12px x, +10px y)
      const idleX = key3Coords.x + 10;
      const idleY = key3Coords.y + 12;
      this.handEl.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
      this.handEl.style.transform = `translate3d(${idleX}px, ${idleY}px, 0) scale(1)`;
    }
  }

  // Obter coordenadas para que a ponta do indicador (âncora 2.46%, 0%) toque o centro da tecla
  getKeyCoords(keySelector) {
    const keyEl = document.querySelector(keySelector);
    if (!keyEl || !this.containerEl) return null;

    const containerRect = this.containerEl.getBoundingClientRect();
    const keyRect = keyEl.getBoundingClientRect();

    // Centro do botão em relação ao container da urna
    const keyCenterX = keyRect.left + keyRect.width / 2 - containerRect.left;
    const keyCenterY = keyRect.top + keyRect.height / 2 - containerRect.top;

    // Dimensões atuais da mão
    const hRect = this.handEl.getBoundingClientRect();
    const w = hRect.width || this.handWidth;
    const h = hRect.height || this.handHeight;

    // Deslocamento para que a ponta do dedo indicador caia no centro do botão
    const targetX = keyCenterX - (w * this.anchorX);
    const targetY = keyCenterY - (h * this.anchorY);

    return { x: targetX, y: targetY, element: keyEl };
  }

  // Enfileira um voto para execução sequencial suave
  queueVote(candidateNumber, options = {}) {
    const isCombo = options.isCombo || false;
    const multiplier = options.multiplier || 1;
    const customSpeed = options.speed || null;

    // Se houver mais de 3 itens na fila visual, mantém apenas os mais recentes
    if (this.queue.length > 3) {
      this.queue.splice(0, this.queue.length - 2);
    }

    this.queue.push({
      candidate: String(candidateNumber),
      isCombo: isCombo,
      multiplier: multiplier,
      speed: customSpeed,
      onComplete: options.onComplete
    });

    if (!this.isBusy) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.isBusy = false;
      this.resetToIdle();
      return;
    }

    this.isBusy = true;
    const item = this.queue.shift();

    // Velocidade cadenciada e natural (sempre legível para os espectadores)
    let speed = item.speed || (item.isCombo ? 0.8 : 1.0);

    await this.executeVoteSequence(item.candidate, speed);

    if (item.onComplete) {
      item.onComplete();
    }

    // Intervalo de descanso entre votos consecutivos
    const delayBetween = item.isCombo ? 250 : 450;
    setTimeout(() => {
      this.processQueue();
    }, delayBetween);
  }

  // Sequência completa e autêntica de digitação na urna
  async executeVoteSequence(candidate, speed = 1.0) {
    if (!this.handEl) return;
    this.handEl.classList.remove('idle');

    // 0. Garante tela limpa e pronta antes de digitar o primeiro número
    if (window.urnaController) {
      window.urnaController.prepareForNewVote();
    }
    await this.wait(100);

    const digits = candidate.split('');

    // 1. Move até o 1º dígito, pressiona e digita no LCD no momento do toque
    if (digits[0]) {
      await this.pressKey(
        `[data-key="${digits[0]}"]`,
        260 * speed,
        140 * speed,
        () => {
          if (window.urnaController) window.urnaController.typeDigit(digits[0]);
        }
      );
    }

    // Pausa confortável para visualização do 1º dígito
    await this.wait(220 * speed);

    // 2. Move até o 2º dígito, pressiona e digita no LCD no momento do toque
    if (digits[1]) {
      await this.pressKey(
        `[data-key="${digits[1]}"]`,
        240 * speed,
        140 * speed,
        () => {
          if (window.urnaController) window.urnaController.typeDigit(digits[1]);
        }
      );
    }

    // Pausa obrigatória: o espectador vê os 2 números completos e o candidato na tela
    await this.wait(280 * speed);

    // 3. Move para CONFIRMA e pressiona
    await this.pressKey(
      '[data-key="confirma"]',
      280 * speed,
      200 * speed,
      () => {
        if (window.urnaController) {
          window.urnaController.confirmVote(candidate, 1, false);
        }
      }
    );

    // 4. Mantém tela de FIM visível para apreciação do voto registrado
    await this.wait(850 * speed);

    // 5. Retorna para repouso
    this.resetToIdle();
  }

  // Move a mão suavemente até a tecla e executa o toque tátil com callback onKeyDown
  pressKey(keySelector, travelTime = 250, pressTime = 130, onKeyDown = null) {
    return new Promise(resolve => {
      const coords = this.getKeyCoords(keySelector);
      if (!coords) {
        if (typeof onKeyDown === 'function') onKeyDown();
        resolve();
        return;
      }

      // Trajetória suave até o botão
      this.handEl.style.transition = `transform ${travelTime}ms cubic-bezier(0.25, 1, 0.5, 1)`;
      this.handEl.style.transform = `translate3d(${coords.x}px, ${coords.y}px, 0) scale(1)`;

      setTimeout(() => {
        // Pressiona o botão (finger push)
        this.handEl.classList.add('pressing');
        this.handEl.style.transition = `transform ${pressTime * 0.45}ms ease-out`;
        this.handEl.style.transform = `translate3d(${coords.x}px, ${coords.y}px, 0) scale(0.95)`;

        if (coords.element) {
          coords.element.classList.add('active');
        }

        if (window.soundEngine) {
          window.soundEngine.playKeyClick();
        }

        // Momento do impacto mecânico: dispara a ação imediatamente
        if (typeof onKeyDown === 'function') {
          onKeyDown();
        }

        setTimeout(() => {
          // Levanta o dedo
          this.handEl.classList.remove('pressing');
          this.handEl.style.transition = `transform ${pressTime * 0.55}ms ease-out`;
          this.handEl.style.transform = `translate3d(${coords.x}px, ${coords.y}px, 0) scale(1)`;

          if (coords.element) {
            coords.element.classList.remove('active');
          }

          setTimeout(resolve, pressTime * 0.55);
        }, pressTime * 0.45);
      }, travelTime);
    });
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

window.handController = new HandController();
