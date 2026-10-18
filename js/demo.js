/**
 * Demo Controller - Painel de Controle e Demonstração Local
 * Permite disparar votos, combos, simulação contínua e modo OBS.
 * Suporta atalhos de teclado para teste rápido.
 */

class DemoController {
  constructor() {
    this.obsMode = false;
    this.panelCollapsed = false;
  }

  init() {
    this.bindButtons();
    this.bindKeyboardShortcuts();
  }

  bindButtons() {
    // Voto 13 (+1)
    const btnVote13 = document.getElementById('btn-vote-13');
    if (btnVote13) {
      btnVote13.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.init();
        if (window.handController) {
          window.handController.queueVote('13', { isCombo: false, multiplier: 1 });
        }
      });
    }

    // Voto 22 (+1)
    const btnVote22 = document.getElementById('btn-vote-22');
    if (btnVote22) {
      btnVote22.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.init();
        if (window.handController) {
          window.handController.queueVote('22', { isCombo: false, multiplier: 1 });
        }
      });
    }

    // Combo +10 para 13
    const btnCombo13 = document.getElementById('btn-combo-13');
    if (btnCombo13) {
      btnCombo13.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.init();
        if (window.handController) {
          window.handController.queueVote('13', { isCombo: true, multiplier: 10 });
        }
        if (window.liveController) {
          window.liveController.pushGiftNotification({
            user: 'carol.martins',
            gift: 'Rosa',
            target: '13',
            count: 47,
            icon: 'assets/rose.png',
            avatar: 'assets/avatar_carolmartins.png'
          });
        }
      });
    }

    // Combo +10 para 22
    const btnCombo22 = document.getElementById('btn-combo-22');
    if (btnCombo22) {
      btnCombo22.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.init();
        if (window.handController) {
          window.handController.queueVote('22', { isCombo: true, multiplier: 10 });
        }
        if (window.liveController) {
          window.liveController.pushGiftNotification({
            user: 'pedrooliveira',
            gift: 'Flor branca',
            target: '22',
            count: 54,
            icon: 'assets/white_flower.png',
            avatar: 'assets/avatar_pedrooliveira.png'
          });
        }
      });
    }

    // Auto-Batalha (Simulação contínua)
    const btnAuto = document.getElementById('btn-auto-battle');
    if (btnAuto) {
      btnAuto.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.init();
        if (window.liveController) {
          const isRunning = window.liveController.toggleAutoBattle();
          btnAuto.classList.toggle('active', isRunning);
          btnAuto.innerHTML = isRunning 
            ? '<span>⏹️</span> Parar Auto-Live' 
            : '<span>🤖</span> Iniciar Auto-Live';
        }
      });
    }

    // Alternar Áudio
    const btnAudio = document.getElementById('btn-toggle-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        if (window.soundEngine) {
          window.soundEngine.init();
          const isEnabled = window.soundEngine.toggleSound();
          btnAudio.classList.toggle('muted', !isEnabled);
          btnAudio.innerHTML = isEnabled 
            ? '<span>🔊</span> Som: Ligado' 
            : '<span>🔇</span> Som: Mudo';
        }
      });
    }

    // Modo OBS (overlay limpo)
    const btnOBS = document.getElementById('btn-toggle-obs');
    if (btnOBS) {
      btnOBS.addEventListener('click', () => {
        this.toggleOBSMode();
      });
    }

    // Resetar Votos
    const btnReset = document.getElementById('btn-reset-votes');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (window.liveController) {
          window.liveController.resetToInitial();
        }
      });
    }

    // Minimizar / Expandir Painel Demo
    const btnCollapse = document.getElementById('btn-collapse-panel');
    const panelBody = document.getElementById('demo-panel-content');
    if (btnCollapse && panelBody) {
      btnCollapse.addEventListener('click', () => {
        this.panelCollapsed = !this.panelCollapsed;
        panelBody.style.display = this.panelCollapsed ? 'none' : 'grid';
        btnCollapse.textContent = this.panelCollapsed ? '◀ Expandir' : '▼ Ocultar';
      });
    }
  }

  toggleOBSMode() {
    this.obsMode = !this.obsMode;
    document.body.classList.toggle('obs-mode', this.obsMode);

    const btnOBS = document.getElementById('btn-toggle-obs');
    if (btnOBS) {
      btnOBS.classList.toggle('active', this.obsMode);
      btnOBS.innerHTML = this.obsMode 
        ? '<span>🖥️</span> Sair do Modo OBS' 
        : '<span>🖥️</span> Modo OBS (Limpo)';
    }

    // Mostra toast discreto
    const toast = document.createElement('div');
    toast.className = 'obs-toast';
    toast.textContent = this.obsMode 
      ? 'Modo OBS Ativado (Pressione "O" para sair)' 
      : 'Modo Normal Ativado';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // Atalhos de teclado
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignora atalhos se estiver digitando em input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toUpperCase();

      if (key === '1') {
        const btn = document.getElementById('btn-vote-13');
        if (btn) btn.click();
      } else if (key === '2') {
        const btn = document.getElementById('btn-vote-22');
        if (btn) btn.click();
      } else if (key === 'Q') {
        const btn = document.getElementById('btn-combo-13');
        if (btn) btn.click();
      } else if (key === 'W') {
        const btn = document.getElementById('btn-combo-22');
        if (btn) btn.click();
      } else if (key === 'A') {
        const btn = document.getElementById('btn-auto-battle');
        if (btn) btn.click();
      } else if (key === 'M') {
        const btn = document.getElementById('btn-toggle-audio');
        if (btn) btn.click();
      } else if (key === 'O') {
        this.toggleOBSMode();
      } else if (key === 'H') {
        const panel = document.getElementById('demo-dock');
        if (panel) {
          panel.classList.toggle('hidden');
        }
      }
    });
  }
}

window.demoController = new DemoController();
