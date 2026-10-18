/**
 * Audio Synthesizer para Live TikTok Urna Eletrônica
 * Utiliza Web Audio API pura, sem dependência de arquivos externos.
 * Reproduz com fidelidade:
 * 1. O clique mecânico tátil do teclado da urna
 * 2. O clássico som do "CONFIRMA" da urna eletrônica brasileira (TSE)
 * 3. Efeitos de combo e presentes
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initialized = false;
  }

  init() {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API não suportada neste navegador.', e);
    }
  }

  toggleSound(forceState) {
    if (forceState !== undefined) {
      this.enabled = forceState;
    } else {
      this.enabled = !this.enabled;
    }
    return this.enabled;
  }

  // Clique de tecla da urna eletrônica (estalo tátil)
  playKeyClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.Q.setValueAtTime(2.5, t);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.045);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  // O clássico som do "CONFIRMA" da Urna Eletrônica Brasileira (TSE)
  // Quatro notas ascendentes características (C5 - E5 - G5 - C6)
  playUrnaConfirma() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [
      { freq: 523.25, start: 0, dur: 0.07 },      // C5
      { freq: 659.25, start: 0.07, dur: 0.07 },   // E5
      { freq: 783.99, start: 0.14, dur: 0.07 },   // G5
      { freq: 1046.50, start: 0.21, dur: 0.65 }   // C6 prolongado
    ];

    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0.25, t);
    masterGain.connect(this.ctx.destination);

    notes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Formato de onda levemente analógico/retro da urna
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.freq, t + n.start);

      // Filtro passa-baixa para suavizar e dar o timbre idêntico ao speaker interno da urna
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, t + n.start);

      const noteStart = t + n.start;
      const noteEnd = noteStart + n.dur;

      noteGain.gain.setValueAtTime(0, noteStart);
      noteGain.gain.linearRampToValueAtTime(0.8, noteStart + 0.005);

      if (n.dur > 0.3) {
        // Nota longa final com sustentação e fade suave
        noteGain.gain.setValueAtTime(0.8, noteEnd - 0.15);
        noteGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
      } else {
        noteGain.gain.setValueAtTime(0.7, noteEnd - 0.01);
        noteGain.gain.linearRampToValueAtTime(0.001, noteEnd);
      }

      osc.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(noteStart);
      osc.stop(noteEnd + 0.02);
    });
  }

  // Efeito sonoro de presente / combo especial
  playGiftChime() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const freqs = [880, 1108.7, 1318.5, 1760]; // Arpejo de A maior
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);

      gain.gain.setValueAtTime(0.12, t + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.4);
    });
  }
}

// Instância global de áudio
window.soundEngine = new SoundEngine();
