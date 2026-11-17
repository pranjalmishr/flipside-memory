/* FlipSide UI. Runs directly from index.html, including file://, without a build. */
(() => {
  'use strict';
  const { LEVELS, MemoryGame, formatTime, POINTS_PER_PAIR, POINTS_PER_SECOND, POWER_LIMITS } = window.FlipSide;
  const { CARD_THEMES, CARD_BACKS, BOARD_COLORS, APPEARANCES, normalizePreferences, renderFace } = window.FlipSideThemes;
  const { KEYS, SafeStore, normalizeLeaderboard, addResult, makeResult, compareRecords } = window.FlipSideStorage;
  const { GameAudio, normalizeAudio } = window.FlipSideAudio;
  const store = new SafeStore();
  const formatAccuracy = value => `${Number(value.toFixed(1))}%`;
  const $ = id => document.getElementById(id);
  const game = new MemoryGame();
  const board = $('board');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const STORAGE_KEY = 'flipside-best-v1';
  const LOOK_KEY = 'flipside-look-v1';
  let preferences = normalizePreferences(null);
  try { preferences = normalizePreferences(JSON.parse(localStorage.getItem(LOOK_KEY))); } catch { /* Optional preferences. */ }
  const PALETTE = [
    ['#e5dcf7', '#c0a9e2'], ['#f9e4c4', '#e5c187'], ['#d9eade', '#a9c9b2'], ['#f6dce0', '#ddaab8'],
    ['#dce8f5', '#afc4e0'], ['#f6dce0', '#ddaab8'], ['#e5dcf7', '#c0a9e2'], ['#f9e4c4', '#e5c187'],
    ['#f9e4c4', '#e5c187'], ['#d9eade', '#a9c9b2'], ['#dce8f5', '#afc4e0'], ['#e5dcf7', '#c0a9e2'],
    ['#f6dce0', '#ddaab8'], ['#e5dcf7', '#c0a9e2'], ['#f9e4c4', '#e5c187'], ['#d9eade', '#a9c9b2'],
  ];
  let selectedLevel = 'easy';
  let mismatchTimeout = null;
  let celebrationTimeout = null;
  let confettiTimeout = null;
  let clockInterval = null;
  let soundOn = false;
  let best = {};
  let pendingEffect = null;
  let lastSavedSecond = -1;
  let records = normalizeLeaderboard(store.load(KEYS.leaderboard));

  // Storage is optional: private mode, disabled storage, or corrupt data never blocks play.
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const key of Object.keys(LEVELS)) {
      const record = saved?.[key];
      if (record && Number.isFinite(record.time) && record.time >= 0 &&
          Number.isInteger(record.moves) && record.moves >= LEVELS[key].pairs) best[key] = record;
    }
    soundOn = localStorage.getItem('flipside-sound') === 'true';
  } catch { /* Use in-memory defaults. */ }
  const audio = new GameAudio(normalizeAudio(store.load(KEYS.audio, { effects: store.load('flipside-sound', soundOn) === true })));

  function announce(message) { $('announcer').textContent = message; }
  function setMessage(message) {
    $('board-message').replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    $('board-message').append(dot, document.createTextNode(message));
  }

  function renderSaveStatus() {
    const unsaved = !store.available || (game.status === 'won' ? store.dirty.has(KEYS.leaderboard) : store.dirty.has(KEYS.progress));
    const text = unsaved ? 'Saving unavailable · progress stays in this tab'
      : game.status === 'won' ? 'Best performances saved · see My leaderboard'
      : game.status === 'paused' ? 'Game saved · resume whenever you’re ready'
      : game.status === 'playing' ? 'Autosaved on this browser · safe to take a break'
      : 'Autosave ready · stays on this browser';
    if ($('save-status').textContent !== text) $('save-status').textContent = text;
  }

  function saveProgress(force = true) {
    const snapshot = game.snapshot();
    if (!snapshot) { renderSaveStatus(); return; }
    const second = Math.floor(snapshot.elapsedMs / 1000);
    if (force || second !== lastSavedSecond) {
      store.save(KEYS.progress, snapshot);
      lastSavedSecond = second;
    }
    renderSaveStatus();
  }

  function startClock() {
    clearInterval(clockInterval);
    clockInterval = null;
    if (game.status === 'playing' && game.startedAt !== null) {
      clockInterval = setInterval(() => { updateStats(); saveProgress(false); }, 200);
    }
  }

  function scheduleEffect(kind, duration) {
    clearTimeout(mismatchTimeout);
    pendingEffect = { kind, remaining: duration, due: Date.now() + duration };
    mismatchTimeout = setTimeout(() => {
      if (game.status !== 'playing') return;
      const resolved = kind === 'hint' ? game.resolveHint() : game.resolveMismatch();
      pendingEffect = null;
      if (!resolved) return;
      updateBoard(); updateStats(); saveProgress();
      setMessage(kind === 'hint' ? 'Keep that little pair in mind.' : 'A fresh flip, a new possibility.');
      announce('Cards are face down. Choose your next pair.');
    }, duration);
  }

  function pauseGame(reason = 'manual') {
    if (!game.pause()) return;
    if (pendingEffect) pendingEffect.remaining = Math.max(0, pendingEffect.due - Date.now());
    clearTimeout(mismatchTimeout);
    clearInterval(clockInterval); clockInterval = null;
    audio.setPaused(true);
    $('pause-title').textContent = reason === 'away' ? 'Paused while you were away.' : 'A little breather.';
    $('pause-description').textContent = 'Your timer is stopped. Your cards are safe.';
    updateBoard(); updateStats(); saveProgress(); renderAudioControls();
    setMessage('Paused. Take all the time you need.');
    announce('Game paused. Cards hidden and timer stopped.');
  }

  function resumeGame() {
    if (document.hidden || !game.resume()) return;
    audio.setPaused(false);
    audio.unlock().then(renderAudioControls);
    if (pendingEffect) scheduleEffect(pendingEffect.kind, pendingEffect.remaining);
    updateBoard(); updateStats(); startClock(); saveProgress();
    setMessage('Welcome back. Find your next pair!');
    announce('Game resumed.');
    board.querySelector('button')?.focus({ preventScroll: true });
  }

  function useHint() {
    if (!game.useHint()) return;
    updateBoard(); updateStats(); startClock(); saveProgress();
    audio.unlock().then(renderAudioControls); playTone('hint');
    scheduleEffect('hint', 1500);
    setMessage('A little nudge. Remember this pair!');
    announce(`Hint: ${game.cards[game.hintOpen[0]].name} at cards ${game.hintOpen.map(i => i + 1).join(' and ')}. ${POWER_LIMITS.hints - game.hintsUsed} hints left.`);
  }

  function useShuffle() {
    const keepBoardFocus = board.contains(document.activeElement);
    if (!game.useShuffle()) return;
    renderBoard(); updateStats(); startClock(); saveProgress();
    if (keepBoardFocus) board.children[game.cards.findIndex(card => !card.matched)]?.focus({ preventScroll: true });
    audio.unlock().then(renderAudioControls); playTone('shuffle');
    setMessage('Fresh positions. Your matches stay put.');
    announce(`Unmatched cards shuffled. ${POWER_LIMITS.shuffles - game.shufflesUsed} shuffles left.`);
  }

  function renderPlayControls() {
    const active = ['playing', 'paused'].includes(game.status);
    const paused = game.status === 'paused';
    const busy = game.locked || game.open.length > 0;
    $('pause-button').disabled = !active;
    $('pause-button').querySelector('span').textContent = paused ? 'Resume' : 'Pause';
    $('pause-button').querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    $('hints-left').textContent = POWER_LIMITS.hints - game.hintsUsed;
    $('shuffles-left').textContent = POWER_LIMITS.shuffles - game.shufflesUsed;
    $('hint-button').setAttribute('aria-label', `Hint, ${POWER_LIMITS.hints - game.hintsUsed} remaining`);
    $('shuffle-button').setAttribute('aria-label', `Shuffle, ${POWER_LIMITS.shuffles - game.shufflesUsed} remaining`);
    $('hint-button').disabled = game.status !== 'playing' || busy || game.hintsUsed >= POWER_LIMITS.hints;
    $('shuffle-button').disabled = game.status !== 'playing' || busy || game.shufflesUsed >= POWER_LIMITS.shuffles || game.cards.filter(c => !c.matched).length < 4;
    $('pause-overlay').hidden = !paused;
    board.inert = paused;
  }

  function renderLeaderboard() {
    const level = $('leaderboard-level').value;
    const mode = $('leaderboard-mode').value;
    const visible = records.filter(r => r.level === level && (mode === 'all' || r.assisted === (mode === 'assisted'))).sort(compareRecords);
    $('leaderboard-best').textContent = visible.length ? visible[0].score.toLocaleString() : '—';
    $('leaderboard-fastest').textContent = visible.length ? formatTime(Math.min(...visible.map(r => r.time))) : '—';
    $('leaderboard-count').textContent = visible.length;
    $('leaderboard-empty').hidden = visible.length > 0;
    $('leaderboard-list').replaceChildren();
    visible.forEach((record, index) => {
      const item = document.createElement('li');
      item.className = 'leaderboard-row';
      const date = new Date(record.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      item.innerHTML = `<span class="leaderboard-rank" aria-label="Rank ${index + 1}">${index + 1}</span><div class="leaderboard-result"><div class="leaderboard-run-title"><strong>${CARD_THEMES[record.theme].name}</strong><span class="leaderboard-stars" role="img" aria-label="${record.stars} out of 3 stars">${'★'.repeat(record.stars)}${'☆'.repeat(3 - record.stars)}</span></div><div class="leaderboard-meta"><span>${formatTime(record.time)}</span><span>${record.moves} moves</span><span>${formatAccuracy(record.accuracy)} accuracy</span></div><small>${record.assisted ? `Assisted · ${record.hintsUsed} hints / ${record.shufflesUsed} shuffles` : 'Unassisted'} · ${date}</small></div><strong class="leaderboard-score">${record.score.toLocaleString()}<small>points</small></strong>`;
      $('leaderboard-list').append(item);
    });
  }

  function openLeaderboard(level = selectedLevel) {
    clearTimeout(celebrationTimeout);
    celebrationTimeout = null;
    if (game.status === 'playing') pauseGame();
    if ($('win-dialog').open) $('win-dialog').close();
    records = normalizeLeaderboard(store.load(KEYS.leaderboard, { version: 1, records }));
    $('leaderboard-level').value = level;
    $('leaderboard-mode').value = 'all';
    renderLeaderboard();
    $('leaderboard-dialog').showModal();
  }

  function applyAppearance() {
    const root = document.documentElement;
    root.dataset.appearance = preferences.appearance;
    root.dataset.cardBack = preferences.back;
    root.dataset.boardColor = preferences.board;
    root.style.setProperty('--board-color', BOARD_COLORS[preferences.board].color);
    document.querySelector('meta[name="theme-color"]').content = APPEARANCES[preferences.appearance].colors[0];
    $('current-vibe').textContent = `${CARD_THEMES[preferences.collection].name} · ${APPEARANCES[preferences.appearance].name}`;
    $('vibe-icon').textContent = CARD_THEMES[preferences.collection].icon;
    // Restyle existing cards in place: preserve order, focus, open cards, and timers.
    board.querySelectorAll('.back-art').forEach(art => { art.innerHTML = CARD_BACKS[preferences.back].art; });
  }

  function previewReadyBoard() {
    game.level = selectedLevel;
    game.theme = preferences.collection;
    game.cards = window.FlipSide.createDeck(selectedLevel, Math.random, preferences.collection);
    $('active-level').textContent = LEVELS[selectedLevel].badge;
    renderBoard();
    updateStats();
  }

  function buildCustomization() {
    const makeOption = (group, key, content, className, style = '') => {
      const label = document.createElement('label');
      label.className = `custom-choice ${className}`;
      if (style) label.setAttribute('style', style);
      // All markup and option values come from our local, validated artwork catalog.
      label.innerHTML = `<input type="radio" name="${group}" value="${key}"${preferences[group] === key ? ' checked' : ''}>${content}<span class="choice-check" aria-hidden="true">✓</span>`;
      label.querySelector('input').addEventListener('change', () => {
        preferences[group] = key;
        try { localStorage.setItem(LOOK_KEY, JSON.stringify(preferences)); } catch { /* Keep the session usable. */ }
        applyAppearance();
        if (group === 'collection') {
          if (game.status === 'ready') previewReadyBoard();
          $('customize-note').textContent = game.status === 'ready'
            ? `${CARD_THEMES[key].name} selected. Your next game has a fresh set of matching designs.`
            : `${CARD_THEMES[key].name} is ready for your next game. Your current ${CARD_THEMES[game.theme].name} board is unchanged.`;
          if (game.status !== 'ready') $('setup-note').textContent = `${CARD_THEMES[key].name} selected. Press New game when you’re ready.`;
        } else {
          $('customize-note').textContent = 'A fresh look, same game. Your cards, moves, and score are unchanged.';
        }
      });
      return label;
    };
    for (const [key, theme] of Object.entries(CARD_THEMES)) {
      const samples = theme.designs.slice(0, 3).map(design => `<span>${renderFace(design)}</span>`).join('');
      $('collection-options').append(makeOption('collection', key,
        `<span class="collection-samples" data-collection="${key}" aria-hidden="true">${samples}</span><strong>${theme.name}</strong><small>${theme.description}</small>`, 'collection-choice'));
    }
    for (const [key, back] of Object.entries(CARD_BACKS)) {
      $('back-options').append(makeOption('back', key,
        `<span class="back-sample" data-back="${key}" aria-hidden="true"><span class="back-art">${back.art}</span></span><strong>${back.name}</strong>`, 'back-choice'));
    }
    for (const [key, color] of Object.entries(BOARD_COLORS)) {
      $('board-options').append(makeOption('board', key,
        `<span class="color-sample" aria-hidden="true"></span><strong>${color.name}</strong>`, 'color-choice', `--swatch:${color.color}`));
    }
    for (const [key, appearance] of Object.entries(APPEARANCES)) {
      const colors = appearance.colors.map(color => `<i style="background:${color}"></i>`).join('');
      $('appearance-options').append(makeOption('appearance', key,
        `<span class="appearance-sample" aria-hidden="true">${colors}</span><strong>${appearance.name}</strong><small>${appearance.description}</small>`, 'appearance-choice'));
    }
    $('customize-button').addEventListener('click', () => $('customize-dialog').showModal());
  }

  function renderBoard() {
    const config = LEVELS[game.level];
    board.dataset.level = game.level;
    board.dataset.collection = game.theme;
    $('collection-caption').textContent = `${CARD_THEMES[game.theme].name.toUpperCase()} COLLECTION`;
    board.style.setProperty('--columns', config.columns);
    board.setAttribute('aria-label', `${config.name} memory board, ${config.rows} rows and ${config.columns} columns`);
    board.replaceChildren();
    for (let i = 0; i < game.cards.length; i++) {
      const card = document.createElement('button');
      const [color, ink] = PALETTE[i % PALETTE.length];
      card.className = 'memory-card';
      card.type = 'button';
      card.dataset.index = i;
      card.style.setProperty('--card-color', color);
      card.style.setProperty('--card-ink', ink);
      // Hidden symbols are not placed in the DOM until the card is flipped.
      card.innerHTML = `<span class="card-inner" aria-hidden="true"><span class="card-side card-back"><span class="back-art">${CARD_BACKS[preferences.back].art}</span></span><span class="card-side card-front"><span class="card-emoji"></span><span class="match-check"><svg class="icon"><use href="#i-check"/></svg></span></span></span>`;
      board.append(card);
    }
    updateBoard();
  }

  function updateBoard() {
    [...board.children].forEach((element, i) => {
      const card = game.cards[i];
      const faceUp = game.status !== 'paused' && (card.matched || game.open.includes(i) || game.hintOpen.includes(i));
      const justMatched = card.matched && !element.classList.contains('is-matched');
      element.classList.toggle('is-flipped', faceUp);
      element.classList.toggle('is-matched', card.matched);
      element.classList.toggle('is-hint', game.hintOpen.includes(i));
      element.disabled = game.status === 'ready';
      element.setAttribute('aria-disabled', String(game.status !== 'playing' || game.locked || faceUp));
      element.setAttribute('aria-pressed', String(faceUp));
      element.setAttribute('aria-label', `Card ${i + 1}: ${game.status === 'paused' ? 'hidden while paused' : faceUp ? `${card.name}${card.matched ? ', matched' : ', face up'}` : 'face down'}`);
      const emoji = element.querySelector('.card-emoji');
      if (faceUp && !emoji.hasChildNodes()) emoji.innerHTML = renderFace(card);
      // Keep a turning card's picture until the flip-back animation ends.
      if (justMatched) {
        element.classList.remove('match-pop');
        void element.offsetWidth;
        element.classList.add('match-pop');
      }
    });
  }

  function updateStats() {
    document.body.classList.toggle('round-active', game.status !== 'ready');
    const performance = game.performance();
    $('score').textContent = game.score.toLocaleString();
    $('moves').textContent = game.moves;
    $('timer').textContent = formatTime(game.elapsed());
    $('timer').dataset.wide = String($('timer').textContent.length > 5);
    $('accuracy').textContent = game.moves ? formatAccuracy(performance.accuracy) : '—';
    const bonusLabel = game.status === 'won' ? 'Speed bonus earned'
      : game.startedAt === null ? 'Finish bonus up to' : 'Potential finish bonus';
    $('bonus-preview-label').textContent = bonusLabel;
    $('bonus-preview-value').textContent = `+${performance.potentialBonus.toLocaleString()}`;
    const pairs = LEVELS[game.level].pairs;
    $('pairs-count').textContent = `${game.matches} / ${pairs}`;
    const progress = document.querySelector('.progress-track');
    progress.setAttribute('aria-valuemax', pairs);
    progress.setAttribute('aria-valuenow', game.matches);
    $('progress-fill').style.width = `${game.matches / pairs * 100}%`;
    renderPlayControls();
  }

  function updateBest() {
    $('best-level').textContent = selectedLevel.toUpperCase();
    const record = best[selectedLevel];
    $('best-time').textContent = record ? `${formatTime(record.time)} · ${record.moves} moves` : 'A fresh start awaits';
    const scores = records.filter(r => r.level === selectedLevel).sort(compareRecords);
    $('best-score').textContent = `Best score: ${scores.length ? scores[0].score.toLocaleString() : '—'}`;
  }

  function resetAsyncWork() {
    clearTimeout(mismatchTimeout);
    clearTimeout(celebrationTimeout);
    clearTimeout(confettiTimeout);
    clearInterval(clockInterval);
    mismatchTimeout = celebrationTimeout = confettiTimeout = clockInterval = null;
    pendingEffect = null;
    lastSavedSecond = -1;
    $('confetti').replaceChildren();
    audio.cancelEffects();
  }

  function startGame(level, theme = preferences.collection) {
    resetAsyncWork();
    if ($('win-dialog').open) $('win-dialog').close();
    game.start(level, Math.random, theme);
    audio.setPaused(false);
    audio.unlock().then(renderAudioControls);
    $('active-level').textContent = LEVELS[level].badge;
    $('restart-button').disabled = false;
    $('start-button').querySelector('span').textContent = 'New game';
    $('setup-note').textContent = 'A new game means a fresh shuffle.';
    setMessage('All set. Flip your first card!');
    renderBoard();
    updateStats();
    updateBest();
    saveProgress();
    announce(`${LEVELS[level].name} ${CARD_THEMES[theme].name} game started. ${LEVELS[level].pairs} pairs to find. A flip or power-up starts the timer.`);
    board.querySelector('button').focus({ preventScroll: true });
    if (matchMedia('(max-width: 760px)').matches) {
      document.querySelector('.play-area').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    }
  }

  function playTone(kind) {
    audio.effect(kind).then(renderAudioControls);
  }

  function celebrate() {
    const record = best[game.level];
    const time = game.elapsed();
    const performance = game.performance();
    const newBest = !record || time < record.time || (time === record.time && game.moves < record.moves);
    if (newBest) {
      best[game.level] = { time, moves: game.moves };
      store.save(STORAGE_KEY, best);
    }
    records = addResult(normalizeLeaderboard(store.load(KEYS.leaderboard, { version: 1, records })), makeResult(game));
    const resultSaved = store.save(KEYS.leaderboard, { version: 1, records });
    const progressCleared = store.remove(KEYS.progress);
    store.available = resultSaved && progressCleared;
    updateBest(); renderSaveStatus();
    $('win-score').textContent = game.score.toLocaleString();
    $('win-moves').textContent = game.moves;
    $('win-time').textContent = formatTime(time);
    $('win-accuracy').textContent = formatAccuracy(performance.accuracy);
    $('win-description').textContent = `${LEVELS[game.level].name} · ${CARD_THEMES[game.theme].name} · ${LEVELS[game.level].pairs} pairs found.`;
    $('win-title').textContent = ['Every match is a win!', 'That’s some happy focus!', 'You’re a memory star!'][performance.stars - 1];
    $('win-stars').setAttribute('aria-label', `${performance.stars} out of 3 stars`);
    $('win-stars').dataset.stars = performance.stars;
    [...$('win-stars').children].forEach((star, index) => star.classList.toggle('is-earned', index < performance.stars));
    $('rating-label').textContent = `${performance.stars} / 3 stars · ${['Challenge complete', 'Nicely matched', 'Brilliant focus'][performance.stars - 1]}`;
    $('pair-points-label').textContent = `${game.matches} pairs × ${POINTS_PER_PAIR} points`;
    $('win-pair-points').textContent = performance.pairPoints.toLocaleString();
    $('win-bonus').textContent = `+${performance.speedBonus.toLocaleString()}`;
    $('bonus-target').textContent = `Target ${formatTime(performance.targetSeconds * 1000)}`;
    $('bonus-explanation').textContent = performance.speedBonus > 0
      ? `${performance.speedBonus / POINTS_PER_SECOND} full seconds saved × ${POINTS_PER_SECOND} points. A speedy little bonus!`
      : `No speed bonus this round. Finish before ${formatTime(performance.targetSeconds * 1000)} to earn ${POINTS_PER_SECOND} points per full second saved.`;
    $('rating-feedback').textContent = performance.stars === 3
      ? 'Speed and precision. You earned all three stars!'
      : `Next star goal: ${performance.stars === 2 ? '80%' : '50%'} accuracy within ${formatTime(performance.targetSeconds * (performance.stars === 2 ? 1000 : 2000))}.`;
    $('win-record').textContent = newBest ? '✦ A new fastest time. Look at you go!' : 'Every little brain break is a win.';
    $('win-assistance').textContent = game.hintsUsed || game.shufflesUsed
      ? `Assisted finish · ${game.hintsUsed} hints · ${game.shufflesUsed} shuffles` : 'Unassisted finish · just you and your memory';
    celebrationTimeout = setTimeout(() => {
      celebrationTimeout = null;
      if ($('help-dialog').open) $('help-dialog').close();
      if ($('customize-dialog').open) $('customize-dialog').close();
      if ($('audio-dialog').open) $('audio-dialog').close();
      if ($('leaderboard-dialog').open) $('leaderboard-dialog').close();
      $('win-dialog').showModal();
      if (!reducedMotion.matches) {
        for (let i = 0; i < 55; i++) {
          const piece = document.createElement('span');
          piece.className = 'confetti-piece';
          piece.style.left = `${Math.random() * 100}%`;
          piece.style.background = ['#b59be6', '#f3ce89', '#a8ceb4', '#edb6c7', '#a9c4e5'][i % 5];
          piece.style.animationDelay = `${Math.random() * .6}s`;
          piece.style.animationDuration = `${2 + Math.random()}s`;
          $('confetti').append(piece);
        }
        confettiTimeout = setTimeout(() => $('confetti').replaceChildren(), 3800);
      }
    }, reducedMotion.matches ? 50 : 600);
  }

  function flipCard(index) {
    const result = game.flip(index);
    if (result.type === 'ignored') return;
    if (!clockInterval && game.status === 'playing') startClock();
    audio.unlock().then(renderAudioControls);
    updateBoard();
    updateStats();
    playTone(result.type);
    if (result.type === 'first') {
      setMessage('Now, where’s its other half?');
      announce(`${result.name}. Choose another card.`);
    } else if (result.type === 'mismatch') {
      setMessage('Not quite. Keep those two in mind!');
      announce(`${result.names.join(' and ')}. Not a match. Cards will flip back.`);
      scheduleEffect('mismatch', 1000);
    } else if (result.type === 'match') {
      setMessage(`A perfect pair. +${POINTS_PER_PAIR} points!`);
      announce(`${result.name} pair matched! ${game.matches} of ${LEVELS[game.level].pairs} pairs found. Score ${game.score}. Accuracy ${formatAccuracy(game.performance().accuracy)}.`);
    } else if (result.type === 'win') {
      clearInterval(clockInterval);
      clockInterval = null;
      setMessage('All paired up. You did it!');
      const performance = game.performance();
      announce(`You won! ${performance.stars} out of 3 stars. ${game.score} points including ${performance.speedBonus} speed bonus, ${game.moves} moves in ${formatTime(game.elapsed())}, ${formatAccuracy(performance.accuracy)} accuracy.`);
      celebrate();
    }
    if (game.status !== 'won') saveProgress();
  }

  function renderAudioControls() {
    const settings = audio.settings;
    $('sound-toggle').setAttribute('aria-pressed', String(settings.effects));
    $('sound-toggle').querySelector('span').textContent = `Sound ${settings.effects ? 'on' : 'off'}`;
    $('sound-toggle').querySelector('use').setAttribute('href', settings.effects ? '#i-sound' : '#i-mute');
    $('music-toggle').setAttribute('aria-pressed', String(settings.music));
    $('music-toggle').querySelector('span').textContent = `Music ${settings.music ? 'on' : 'off'}`;
    $('effects-enabled').checked = settings.effects;
    $('music-enabled').checked = settings.music;
    for (const kind of ['effects', 'music']) {
      const percent = Math.round(settings[`${kind}Volume`] * 100);
      $(`${kind}-volume`).value = percent;
      $(`${kind}-volume-label`).textContent = `${percent}%`;
    }
    const status = audio.failed ? 'Audio is unavailable in this browser. You can still play silently.'
      : !settings.effects && !settings.music ? 'Audio is off. Turn on whatever feels good.'
      : audio.paused ? 'Audio paused. Resume your game to bring it back.'
      : audio.context?.state !== 'running' ? 'Preferences saved. Press play, resume, or an audio toggle to enable playback.'
      : settings.music ? 'Daydream is playing · a gentle, original loop.' : 'Sound effects are on. Happy little flips ahead.';
    if ($('audio-status').textContent !== status) $('audio-status').textContent = status;
  }

  function changeAudio(changes) {
    audio.update(changes);
    store.save(KEYS.audio, audio.settings);
    store.save('flipside-sound', audio.settings.effects);
    renderAudioControls();
    audio.unlock().then(renderAudioControls);
    renderSaveStatus();
  }

  document.querySelectorAll('input[name="difficulty"]').forEach(input => {
    input.addEventListener('change', () => {
      selectedLevel = input.value;
      updateBest();
      if (game.status === 'ready') {
        previewReadyBoard();
        $('setup-note').textContent = 'A flip or power-up starts your timer.';
      } else {
        $('setup-note').textContent = `${LEVELS[selectedLevel].name} selected. Press New game to switch.`;
      }
    });
  });
  $('start-button').addEventListener('click', () => startGame(selectedLevel));
  $('restart-button').addEventListener('click', () => startGame(game.level, game.theme));
  $('play-again').addEventListener('click', () => startGame(selectedLevel));
  $('pause-button').addEventListener('click', () => game.status === 'paused' ? resumeGame() : pauseGame());
  $('resume-button').addEventListener('click', resumeGame);
  $('hint-button').addEventListener('click', useHint);
  $('shuffle-button').addEventListener('click', useShuffle);
  $('leaderboard-button').addEventListener('click', () => openLeaderboard());
  $('win-leaderboard').addEventListener('click', () => openLeaderboard(game.level));
  $('leaderboard-level').addEventListener('change', renderLeaderboard);
  $('leaderboard-mode').addEventListener('change', renderLeaderboard);
  $('audio-button').addEventListener('click', () => { renderAudioControls(); $('audio-dialog').showModal(); });
  $('effects-enabled').addEventListener('change', event => { changeAudio({ effects: event.target.checked }); if (audio.settings.effects) playTone('match'); });
  $('music-enabled').addEventListener('change', event => changeAudio({ music: event.target.checked }));
  for (const kind of ['effects', 'music']) $(`${kind}-volume`).addEventListener('input', event => changeAudio({ [`${kind}Volume`]: Number(event.target.value) / 100 }));
  board.addEventListener('click', event => {
    const card = event.target.closest('.memory-card');
    if (card) flipCard(Number(card.dataset.index));
  });
  board.addEventListener('keydown', event => {
    const current = event.target.closest('.memory-card');
    if (!current) return;
    const index = Number(current.dataset.index);
    const columns = LEVELS[game.level].columns;
    const total = game.cards.length;
    const destinations = { ArrowRight: (index + 1) % total, ArrowLeft: (index - 1 + total) % total,
      ArrowDown: (index + columns) % total, ArrowUp: (index - columns + total) % total,
      Home: 0, End: total - 1 };
    if (event.key in destinations) {
      event.preventDefault();
      board.children[destinations[event.key]].focus();
    }
  });
  $('sound-toggle').addEventListener('click', () => {
    changeAudio({ effects: !audio.settings.effects });
    if (audio.settings.effects) playTone('match');
  });
  $('music-toggle').addEventListener('click', () => changeAudio({ music: !audio.settings.music }));
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  window.addEventListener('flipside:daily-open', () => {
    clearTimeout(celebrationTimeout); celebrationTimeout = null;
    if (game.status === 'playing') pauseGame();
  });
  document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => $(button.dataset.closeDialog).close());
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    } });
  });
  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') ||
        (event.target instanceof Element && (event.target.closest('input, textarea, select') || event.target.isContentEditable))) return;
    const key = event.key.toLowerCase();
    if (['p', 'h', 's'].includes(key) && ['playing', 'paused'].includes(game.status)) {
      event.preventDefault();
      if (key === 'p') game.status === 'paused' ? resumeGame() : pauseGame();
      if (key === 'h') useHint();
      if (key === 's') useShuffle();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseGame('away'); audio.setPaused(true); }
    else { audio.setPaused(game.status === 'paused'); updateStats(); }
    renderAudioControls();
  });
  window.addEventListener('pagehide', () => { pauseGame('away'); saveProgress(); audio.setPaused(true); });
  buildCustomization();
  applyAppearance();
  const savedProgress = store.load(KEYS.progress);
  if (game.restore(savedProgress)) {
    selectedLevel = game.level;
    document.querySelector(`input[name="difficulty"][value="${selectedLevel}"]`).checked = true;
    $('active-level').textContent = LEVELS[game.level].badge;
    $('start-button').querySelector('span').textContent = 'New game';
    $('restart-button').disabled = false;
    $('setup-note').textContent = 'Welcome back. Resume your saved round below.';
    $('pause-title').textContent = 'Welcome back, curious mind.';
    $('pause-description').textContent = 'Your progress is restored. Time away never counted.';
    audio.setPaused(true);
    renderBoard(); updateStats();
    setMessage('Saved game restored. Resume when you’re ready.');
  } else {
    if (savedProgress !== null) store.remove(KEYS.progress);
    previewReadyBoard();
  }
  updateBest();
  renderAudioControls();
  renderSaveStatus();
})();
