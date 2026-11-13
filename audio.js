/* Original synthesized effects and a gentle procedural music loop. No downloads. */
(function (root) {
  'use strict';
  const AUDIO_DEFAULTS = Object.freeze({ effects: false, music: false, effectsVolume: .55, musicVolume: .25 });
  function normalizeAudio(value) {
    const s = value && typeof value === 'object' ? value : {};
    const volume = (key, fallback) => typeof s[key] === 'number' && Number.isFinite(s[key]) ? Math.max(0, Math.min(1, s[key])) : fallback;
    return { effects: typeof s.effects === 'boolean' ? s.effects : false,
      music: typeof s.music === 'boolean' ? s.music : false,
      effectsVolume: volume('effectsVolume', .55), musicVolume: volume('musicVolume', .25) };
  }

  class GameAudio {
    constructor(settings, createContext) {
      this.settings = normalizeAudio(settings);
      this.createContext = createContext || (() => new (root.AudioContext || root.webkitAudioContext)());
      this.context = null;
      this.paused = false;
      this.musicTimer = null;
      this.musicNodes = new Set();
      this.effectNodes = new Set();
      this.effectGeneration = 0;
      this.step = 0;
      this.failed = false;
    }
    async unlock() {
      if (!this.settings.effects && !this.settings.music) return;
      try {
        if (!this.context) {
          this.context = this.createContext();
          this.effectsGain = this.context.createGain();
          this.musicGain = this.context.createGain();
          this.effectsGain.connect(this.context.destination);
          this.musicGain.connect(this.context.destination);
        }
        await this.context.resume();
        this.failed = false;
        this.sync();
      } catch { this.failed = true; this.stopMusic(); }
    }
    update(changes) {
      this.settings = normalizeAudio({ ...this.settings, ...changes });
      if (!this.settings.effects) this.cancelEffects();
      this.sync();
    }
    setPaused(paused) { this.paused = paused; if (paused) this.cancelEffects(); this.sync(); }
    sync() {
      if (!this.context) return;
      try {
        if (!this.effectsGain || !this.musicGain || this.context.state === 'closed') throw new Error('Audio context unavailable');
        const now = this.context.currentTime;
        this.effectsGain.gain.setTargetAtTime(this.settings.effects && !this.paused ? this.settings.effectsVolume : 0, now, .02);
        this.musicGain.gain.setTargetAtTime(this.settings.music && !this.paused ? this.settings.musicVolume : 0, now, .04);
        if (this.settings.music && !this.paused && this.context.state === 'running') {
          if (this.musicTimer === null && this.musicStep()) this.musicTimer = setInterval(() => this.musicStep(), 800);
        } else this.stopMusic();
      } catch { this.failed = true; this.stopMusic(); this.cancelEffects(); }
    }
    cancelEffects() {
      this.effectGeneration++;
      for (const node of this.effectNodes) { try { node.stop(); } catch { /* Already ended. */ } }
      this.effectNodes.clear();
    }
    stopMusic() {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
      for (const node of this.musicNodes) { try { node.stop(); } catch { /* Already ended. */ } }
      this.musicNodes.clear();
    }
    note(frequency, when, duration, destination, gainValue, music = false) {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, when);
      envelope.gain.linearRampToValueAtTime(gainValue, when + .025);
      envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
      oscillator.connect(envelope);
      envelope.connect(destination);
      (music ? this.musicNodes : this.effectNodes).add(oscillator);
      oscillator.onended = () => { this.musicNodes.delete(oscillator); this.effectNodes.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(when);
      oscillator.stop(when + duration + .03);
    }
    musicStep() {
      if (!this.context || this.paused || !this.settings.music) return false;
      try {
        const melody = [261.63, 329.63, 392, 329.63, 293.66, 440, 392, 329.63, 261.63, 392, 523.25, 440, 329.63, 293.66, 392, 329.63];
        const now = this.context.currentTime;
        this.note(melody[this.step % melody.length], now, .72, this.musicGain, .12, true);
        if (this.step % 4 === 0) this.note([130.81, 146.83, 110, 98][Math.floor(this.step / 4) % 4], now, 2.7, this.musicGain, .055, true);
        this.step++;
        return true;
      } catch { this.failed = true; this.stopMusic(); return false; }
    }
    async effect(kind) {
      if (!this.settings.effects || this.paused) return;
      const generation = this.effectGeneration;
      await this.unlock();
      if (!this.context || this.failed || this.paused || !this.settings.effects || generation !== this.effectGeneration) return;
      const notes = { first: [440], match: [523.25, 659.25], mismatch: [220, 196],
        win: [523.25, 659.25, 783.99, 1046.5], hint: [659.25, 880], shuffle: [392, 493.88, 587.33] }[kind] || [440];
      try { notes.forEach((frequency, i) => this.note(frequency, this.context.currentTime + i * .09, .17, this.effectsGain, .10)); }
      catch { this.failed = true; }
    }
    dispose() { this.stopMusic(); this.cancelEffects(); try { this.context?.close()?.catch(() => {}); } catch { /* Optional audio cleanup. */ } }
  }

  const api = { AUDIO_DEFAULTS, normalizeAudio, GameAudio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlipSideAudio = api;
})(globalThis);
