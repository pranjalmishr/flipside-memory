const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameAudio, normalizeAudio, AUDIO_DEFAULTS } = require('../audio.js');

function fakeContext() {
  const notes = [];
  const gain = () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(value) { this.value = value; } }, connect() {}, disconnect() {} });
  return { notes, currentTime: 0, state: 'suspended', destination: {}, createGain: gain,
    createOscillator() { const node = { type: '', frequency: { value: 0 }, connect() {}, disconnect() {}, start() { notes.push(this); }, stop() { this.stopped = true; } }; return node; },
    async resume() { this.state = 'running'; }, async close() { this.state = 'closed'; } };
}

test('audio defaults are silent and persisted settings are safely normalized', () => {
  assert.deepEqual(normalizeAudio(null), AUDIO_DEFAULTS);
  assert.deepEqual(normalizeAudio({ effects: true, music: 'yes', effectsVolume: 2, musicVolume: -4 }),
    { effects: true, music: false, effectsVolume: 1, musicVolume: 0 });
  assert.equal(normalizeAudio({ effectsVolume: NaN }).effectsVolume, .55);
});

test('silent preferences never create an AudioContext or start autoplay', async () => {
  let created = 0;
  const audio = new GameAudio(null, () => { created++; return fakeContext(); });
  await audio.unlock(); await audio.effect('match');
  assert.equal(created, 0);
  assert.equal(audio.musicTimer, null);
});

test('effects and music have independent volume gains and mute controls', async () => {
  const context = fakeContext();
  const audio = new GameAudio({ effects: true, effectsVolume: .4, musicVolume: .2 }, () => context);
  await audio.effect('match');
  assert.equal(context.notes.length, 2);
  assert.equal(audio.effectsGain.gain.value, .4);
  assert.equal(audio.musicGain.gain.value, 0);
  audio.update({ music: true });
  assert.notEqual(audio.musicTimer, null);
  assert.equal(audio.musicGain.gain.value, .2);
  audio.update({ effects: false, musicVolume: .7 });
  assert.equal(audio.effectsGain.gain.value, 0);
  assert.equal(audio.musicGain.gain.value, .7);
  const count = context.notes.length;
  await audio.effect('win');
  assert.equal(context.notes.length, count);
  audio.dispose();
});

test('pause stops the music scheduler and all sounding music notes; resume is idempotent', async () => {
  const context = fakeContext();
  const audio = new GameAudio({ music: true, effects: true }, () => context);
  await audio.unlock();
  const timer = audio.musicTimer;
  audio.sync();
  assert.equal(audio.musicTimer, timer);
  assert.ok(audio.musicNodes.size > 0);
  audio.setPaused(true);
  assert.equal(audio.musicTimer, null);
  assert.equal(audio.musicNodes.size, 0);
  assert.equal(audio.effectsGain.gain.value, 0);
  const count = context.notes.length;
  await audio.effect('first');
  assert.equal(context.notes.length, count);
  audio.setPaused(false);
  assert.notEqual(audio.musicTimer, null);
  audio.update({ music: false });
  assert.equal(audio.musicTimer, null);
  audio.dispose();
});

test('flip, match, mismatch, victory, hint, and shuffle all produce synthesized effects', async () => {
  const context = fakeContext();
  const audio = new GameAudio({ effects: true }, () => context);
  for (const effect of ['first', 'match', 'mismatch', 'win', 'hint', 'shuffle']) {
    const count = context.notes.length;
    await audio.effect(effect);
    assert.ok(context.notes.length > count);
  }
  audio.dispose();
});

test('unavailable browser audio fails softly without breaking the game', async () => {
  const audio = new GameAudio({ music: true, effects: true }, () => { throw new Error('Unsupported'); });
  await audio.unlock(); await audio.effect('match');
  assert.equal(audio.failed, true);
  assert.equal(audio.musicTimer, null);
  assert.equal(audio.context, null);
});
