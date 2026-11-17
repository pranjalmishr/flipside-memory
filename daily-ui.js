/* Daily mode is separate from local practice: all ranked turns are server-confirmed. */
(() => {
  'use strict';
  const { DailyClient } = window.FlipSideDailyClient;
  const { utcDay, DAY_MS, nextReset } = window.FlipSideDailyRules;
  const { CARD_THEMES, CARD_BACKS, renderFace } = window.FlipSideThemes;
  const { formatTime } = window.FlipSide;
  const $ = id => document.getElementById(id);
  let storage; try { storage = localStorage; } catch { storage = null; }
  const client = new DailyClient(storage);
  let overview = null, round = null, busy = false, uncertain = false, timer = null, revealTimer = null;
  let baseServer = Date.now(), baseMonotonic = performance.now(), baseElapsed = 0, elapsedMonotonic = performance.now(), lockDeadline = 0;
  let selectedDate = 'today';
  const serverNow = () => baseServer + performance.now() - baseMonotonic;
  const elapsed = () => round?.started && round.status !== 'won' ? baseElapsed + performance.now() - elapsedMonotonic : baseElapsed;
  const setStatus = (text, error = false) => { $('daily-status').textContent = text; $('daily-status').classList.toggle('is-error', error); };
  function accept(data) {
    baseServer = data.serverNow; baseMonotonic = performance.now();
    if (data.challenge !== undefined) overview = data;
    else if (overview) { overview.profile = data.profile; overview.today = data.today; }
    round = data.round;
    baseElapsed = round?.elapsed || 0; elapsedMonotonic = performance.now();
    lockDeadline = performance.now() + (round?.lockRemaining || 0);
    clearTimeout(revealTimer);
    if (round?.lockRemaining) revealTimer = setTimeout(() => { renderBoard(); tick(); }, round.lockRemaining + 10);
    uncertain = false;
    render();
  }
  function renderProfile() {
    const p = overview?.profile;
    $('daily-streak').textContent = p?.streak ?? '—';
    $('daily-longest').textContent = p?.longest ?? '—';
    $('daily-credits').textContent = p ? p.credits.toLocaleString() : '—';
    $('daily-player').textContent = p ? `YOU · ${p.player}` : 'Your guest identity loads when you connect.';
    $('daily-week').replaceChildren();
    if (!overview) return;
    const today = overview.today;
    for (let back = 6; back >= 0; back--) {
      const day = utcDay(Date.parse(`${today}T00:00:00Z`) - back * DAY_MS);
      const item = document.createElement('span'); const complete = p.completedDays.includes(day);
      item.className = `daily-week-day${complete ? ' is-complete' : ''}${back === 0 ? ' is-today' : ''}`;
      const date = new Date(`${day}T12:00:00Z`);
      const label = date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
      item.innerHTML = `<small>${label}</small><strong aria-hidden="true">${complete ? '✓' : date.getUTCDate()}</strong>`;
      item.setAttribute('aria-label', `${day}: ${complete ? 'completed' : back === 0 ? 'today, not completed yet' : 'not completed'}`);
      $('daily-week').append(item);
    }
    const list = $('daily-history');
    if (!list.dataset.ready || list.dataset.today !== today) {
      list.replaceChildren();
      for (let back = 0; back < 7; back++) {
        const day = utcDay(Date.parse(`${today}T00:00:00Z`) - back * DAY_MS);
        const option = document.createElement('option'); option.value = back === 0 ? 'today' : day; option.textContent = back === 0 ? `${day} · Today` : day;
        list.append(option);
      }
      list.dataset.ready = 'true'; list.dataset.today = today;
    }
    list.value = selectedDate;
  }
  function renderRanking() {
    $('daily-leaderboard').replaceChildren();
    const rows = overview?.leaderboard || [];
    $('daily-empty').hidden = rows.length > 0;
    $('daily-ranking-title').textContent = selectedDate === 'today' ? 'Today’s shared leaderboard' : 'Daily challenge archive';
    rows.forEach((record, i) => {
      const row = document.createElement('li'); row.className = 'daily-ranking-row';
      if (record.isYou) row.classList.add('is-you');
      const rank = document.createElement('span'); rank.className = 'daily-rank'; rank.textContent = i + 1;
      const copy = document.createElement('div'); const name = document.createElement('strong'); name.textContent = record.player;
      const details = document.createElement('small'); details.textContent = `${record.moves} moves · ${formatTime(record.time)} · ${Number(record.accuracy.toFixed(1))}%`;
      copy.append(name, details); row.append(rank, copy); $('daily-leaderboard').append(row);
    });
    $('daily-own-rank').textContent = overview?.ownRank ? `Your confirmed rank: #${overview.ownRank}` : '';
  }
  function renderBoard() {
    const board = $('daily-board');
    const challenge = overview?.challenge;
    const theme = round?.theme || challenge?.theme;
    board.style.setProperty('--columns', 5); board.dataset.level = 'medium'; board.dataset.collection = theme || 'fruits';
    board.setAttribute('aria-label', `Daily ${theme ? CARD_THEMES[theme].name : 'memory'} board, 4 rows and 5 columns`);
    $('daily-collection').textContent = `${theme ? CARD_THEMES[theme].name : 'Shared puzzle'} · 4 × 5 · 10 pairs`;
    const cards = round?.cards || (challenge ? Array.from({ length: 20 }, (_, index) => ({ index, matched: false })) : []);
    const canPlay = !busy && !uncertain && round?.status === 'playing' && serverNow() < round.expiresAt && performance.now() >= lockDeadline;
    if (board.children.length !== cards.length || board.dataset.date !== overview?.date) {
      board.replaceChildren();
      board.dataset.date = overview?.date || '';
      for (const card of cards) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'memory-card'; button.dataset.index = card.index;
        const palette = [['#e5dcf7', '#b099d2'], ['#f9e4c4', '#d9ae68'], ['#d9eade', '#8bb299'], ['#f6dce0', '#cf92a5'], ['#dce8f5', '#8faecd']][card.index % 5];
        button.style.setProperty('--card-color', palette[0]); button.style.setProperty('--card-ink', palette[1]);
        button.innerHTML = '<span class="card-inner" aria-hidden="true"><span class="card-side card-back"><span class="back-art"></span></span><span class="card-side card-front"><span class="card-emoji"></span><span class="match-check"><svg class="icon"><use href="#i-check"/></svg></span></span></span>';
        board.append(button);
      }
    }
    [...board.children].forEach((button, index) => {
      const card = cards[index];
      const open = !uncertain && (card.matched || (round?.open.includes(index) && (round.lockRemaining === 0 || performance.now() < lockDeadline)));
      button.classList.toggle('is-flipped', Boolean(open)); button.classList.toggle('is-matched', card.matched);
      button.disabled = !round || round.status !== 'playing';
      button.setAttribute('aria-disabled', String(!canPlay || open));
      button.setAttribute('aria-pressed', String(Boolean(open)));
      button.setAttribute('aria-label', `Daily card ${index + 1}: ${open ? `${card.name}${card.matched ? ', matched' : ', face up'}` : 'face down'}`);
      const face = button.querySelector('.card-emoji');
      const design = theme && CARD_THEMES[theme].designs.find(d => d.key === card.key);
      if (open && design && face.dataset.key !== card.key) { face.innerHTML = renderFace(design); face.dataset.key = card.key; }
      const back = document.documentElement.dataset.cardBack || 'sparkle';
      button.querySelector('.back-art').innerHTML = CARD_BACKS[back].art;
    });
  }
  function render() {
    $('daily-history').disabled = busy;
    $('daily-refresh').disabled = busy;
    $('daily-date').textContent = `${overview?.date || 'TODAY'} · UTC`;
    renderProfile(); renderRanking(); renderBoard(); tick();
    const finished = round?.status === 'won';
    $('daily-finish').hidden = !finished;
    $('daily-start').hidden = finished;
    $('daily-start').disabled = busy || !overview?.challenge || selectedDate !== 'today';
    $('daily-start').firstChild.textContent = round ? (uncertain ? 'Reconnect saved round ' : 'Refresh saved round ') : 'Start today’s challenge ';
    if (finished && round.result) {
      const r = round.result;
      $('daily-finish-details').textContent = `${r.moves} moves · ${formatTime(r.time)} · ${Number(r.accuracy.toFixed(1))}% accuracy`;
      $('daily-earned').textContent = `+${r.credits} daily credits · ${r.streak}-day streak`;
      $('daily-reward-note').textContent = 'Already credited to your reward balance. One reward per UTC day.';
    }
  }
  function tick() {
    const day = overview?.today || utcDay(serverNow());
    const remaining = Math.max(0, nextReset(day) - serverNow());
    const hours = Math.floor(remaining / 3600000), minutes = Math.floor(remaining / 60000) % 60;
    $('daily-countdown').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.floor(remaining / 1000) % 60).padStart(2, '0')}`;
    $('daily-moves').textContent = round?.moves || 0;
    $('daily-time').textContent = formatTime(Math.max(0, elapsed()));
    $('daily-accuracy').textContent = round?.moves ? `${Number((100 * round.matches / round.moves).toFixed(1))}%` : '—';
    $('daily-pairs').textContent = `${round?.matches || 0} / 10 pairs`;
    if (remaining === 0 && overview?.today) {
      uncertain = true;
      $('daily-start').disabled = false;
      $('daily-start').firstChild.textContent = 'Load today’s new challenge ';
      setStatus('The UTC day has changed. Refresh for today’s new puzzle. Unfinished attempts can no longer earn yesterday’s reward.', true);
    }
    if (round?.lockRemaining && performance.now() >= lockDeadline) renderBoard();
  }
  async function load(date = selectedDate) {
    if (busy) return;
    busy = true; render(); setStatus('Connecting to the daily service…');
    try {
      const data = await client.request('overview', date === 'today' ? {} : { date });
      accept(data);
      setStatus(data.round?.status === 'won' ? 'Daily completion confirmed. Your reward and streak are saved.' : data.round ? 'Saved daily round loaded. Its ranked clock continues until completion or UTC reset.' : 'Ready when you are. The timer starts with your first flip.');
    } catch (error) { uncertain = true; setStatus(error.message, true); }
    finally { busy = false; render(); }
  }
  async function start() {
    if (busy || selectedDate !== 'today') return;
    busy = true; render();
    try {
      if (round) { busy = false; await load(); return; }
      accept(await client.request('start', { date: overview.today }));
      setStatus('Your ranked round is ready. Flip your first card. No resets or power-ups in daily play.');
    } catch (error) { uncertain = true; setStatus(error.message, true); }
    finally { busy = false; render(); $('daily-board').firstElementChild?.focus({ preventScroll: true }); }
  }
  async function flip(index) {
    const stillOpen = round?.open.includes(index) && (round.lockRemaining === 0 || performance.now() < lockDeadline);
    if (busy || uncertain || !round || round.status !== 'playing' || serverNow() >= round.expiresAt || performance.now() < lockDeadline || stillOpen || round.cards[index].matched) return;
    busy = true; render();
    try {
      const data = await client.request('flip', { date: round.date, index, expectedVersion: round.version });
      accept(data);
      const event = data.event;
      setStatus(event === 'win' ? 'Daily finish confirmed. Reward credited and streak updated!' : event === 'mismatch' ? 'Not a pair. Keep those two in mind.' : event === 'match' ? 'A perfect little pair. Keep going!' : 'Find this card’s other half.');
      if (data.round?.status === 'won') { busy = false; await load(); }
    } catch (error) { uncertain = true; setStatus(error.message, true); }
    finally { busy = false; render(); }
  }
  function close() {
    $('daily-dialog').close(); clearInterval(timer); timer = null;
    // No pause call: a ranked clock is server wall time, including time away.
  }
  $('daily-button').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('flipside:daily-open'));
    $('daily-dialog').showModal();
    clearInterval(timer); timer = setInterval(tick, 200);
    load();
  });
  $('daily-close').addEventListener('click', close); $('daily-back').addEventListener('click', close);
  $('daily-dialog').addEventListener('close', () => { clearInterval(timer); timer = null; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('daily-dialog').open) { renderBoard(); tick(); } });
  $('daily-start').addEventListener('click', start);
  $('daily-refresh').addEventListener('click', () => load());
  $('daily-history').addEventListener('change', event => { selectedDate = event.target.value; round = null; load(); });
  $('daily-board').addEventListener('click', event => { const card = event.target.closest('.memory-card'); if (card) flip(Number(card.dataset.index)); });
  $('daily-board').addEventListener('keydown', event => {
    const card = event.target.closest('.memory-card'); if (!card) return;
    const i = Number(card.dataset.index), total = 20;
    const keys = { ArrowRight: (i + 1) % total, ArrowLeft: (i + 19) % total, ArrowDown: (i + 5) % total, ArrowUp: (i + 15) % total, Home: 0, End: 19 };
    if (event.key in keys) { event.preventDefault(); $('daily-board').children[keys[event.key]].focus(); }
  });
  $('daily-share').addEventListener('click', async () => {
    if (!round?.result) return;
    const r = round.result; const text = `FlipSide Daily · ${r.date} UTC\n${r.moves} moves · ${formatTime(r.time)} · ${Number(r.accuracy.toFixed(1))}% accuracy\n🔥 ${overview.profile.streak}-day streak\nhttps://flipside-memory.vercel.app`;
    try { await navigator.clipboard.writeText(text); setStatus('Daily result copied. Share your moves and time with a friend!'); }
    catch { setStatus('Clipboard unavailable. Your result is still shown above.', true); }
  });
})();
