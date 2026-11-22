// render.js — draws the whole duel into the DOM: title screen, table,
// hands, life totals, and the win / loss screens. Cards are real DOM
// elements (big, crisp text at thumbnail size), Ember orange, Tide blue,
// spells violet — suit told by colour AND shape, never by text alone.

const FLAME_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3-2 4.5-2 7 0 1.2.8 2 2 2s2-.8 2-2c2 1.5 3 3.2 3 5.5A5.5 5.5 0 0 1 6.5 14.5C6.5 9 10 6 12 2z" fill="currentColor"/></svg>';
const WAVE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 14c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1v3c-1.5-1-2.5-1-5 1s-5 2.5-7.5 0-5-2.5-7.5 0z" fill="currentColor"/><path d="M2 8c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1v3c-1.5-1-2.5-1-5 1s-5 2.5-7.5 0-5-2.5-7.5 0z" fill="currentColor" opacity=".65"/></svg>';
const BURST_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.2 6.2L21 9l-6.8 1.8L12 17l-2.2-6.2L3 9l6.8-1.8z" fill="currentColor"/></svg>';

export function suitIcon(suit) {
  if (suit === 'ember') return FLAME_SVG;
  if (suit === 'tide') return WAVE_SVG;
  return BURST_SVG;
}

export function suitLabel(suit) {
  return suit === 'ember' ? 'Ember' : suit === 'tide' ? 'Tide' : 'Spell';
}

// Build one card element. zone: 'hand' | 'table'; owner: 'player' | 'enemy'.
// opts: { faceDown, selected, canPlay, canAttack, targetable }
export function cardElement(card, zone, owner, opts = {}) {
  const el = document.createElement('div');
  el.className = `card suit-${card.suit} zone-${zone}`;
  el.dataset.uid = card.uid;
  el.dataset.zone = zone;
  el.dataset.owner = owner;
  // Screen-reader label: the card's numbers as words, so the game stays
  // playable without reading the pixels.
  const isCreatureLabel = card.atk > 0 || card.hp > 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${card.name}, cost ${card.cost}${isCreatureLabel ? `, attack ${card.atk}, health ${card.hp}` : ', spell'}`);
  if (opts.faceDown) {
    el.classList.add('face-down');
    el.innerHTML = '<div class="card-back"><span class="back-mark">~</span><span class="back-mark ember-mark">▲</span></div>';
    return el;
  }
  if (opts.selected) el.classList.add('selected');
  if (opts.canPlay) el.classList.add('can-play');
  if (opts.canAttack) el.classList.add('can-attack');
  if (opts.targetable) el.classList.add('targetable');
  const isCreature = card.atk > 0 || card.hp > 0;
  el.innerHTML = `
    <div class="cost">${card.cost}</div>
    <div class="suit-tag">${suitLabel(card.suit)}</div>
    <div class="art">${suitIcon(card.suit)}</div>
    <div class="name">${card.name}</div>
    <div class="text">${card.text}</div>
    ${isCreature ? `<div class="stats"><span class="atk">⚔ ${card.atk}</span><span class="hp">♥ ${card.hp}</span></div>` : '<div class="stats spell-stats">✦ SPELL ✦</div>'}
    ${card.justPlayed && zone === 'table' ? '<div class="sleep">💤</div>' : ''}
  `;
  return el;
}

function heroPanel(side, who, isActive) {
  const el = document.createElement('div');
  el.className = `hero ${who}${isActive ? ' active' : ''}`;
  el.dataset.owner = who;
  el.dataset.zone = 'hero';
  el.innerHTML = `
    <div class="hero-name">${who === 'player' ? 'YOU' : 'RIVAL'}</div>
    <div class="hero-life"><span class="life-num">${side.life}</span><span class="life-label">LIFE</span></div>
    <div class="hero-mana"><span class="mana-crystal">◆</span> ${side.mana} / ${side.maxMana} mana</div>
    <div class="hero-deck">Deck: ${side.deck.length}</div>
  `;
  return el;
}

function handRow(side, who, game) {
  const row = document.createElement('div');
  row.className = `hand hand-${who}`;
  if (who === 'enemy') {
    for (let i = 0; i < side.hand.length; i++) {
      row.appendChild(cardElement({ uid: `back-${i}`, suit: 'tide', cost: 0, name: '', text: '', atk: 0, hp: 0 }, 'hand', 'enemy', { faceDown: true }));
    }
    return row;
  }
  for (const card of side.hand) {
    const canPlay = game.turnOwner === 'player' && game.screen === 'table'
      && card.cost <= side.mana
      && (card.atk > 0 || card.hp > 0 ? side.table.length < 5 : true);
    row.appendChild(cardElement(card, 'hand', 'player', {
      selected: game.selectedHand === card.uid || game.spellTargeting?.uid === card.uid,
      canPlay,
    }));
  }
  return row;
}

function tableRow(side, who, game) {
  const row = document.createElement('div');
  row.className = `table-row table-${who}`;
  if (side.table.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'table-empty';
    empty.textContent = who === 'player' ? 'Your creatures gather here' : 'Rival creatures gather here';
    row.appendChild(empty);
    return row;
  }
  for (const card of side.table) {
    const targetable = game.spellTargeting != null
      && (game.spellTargeting.target === 'any-creature'
        || (game.spellTargeting.target === 'enemy-creature' && who === 'enemy'));
    row.appendChild(cardElement(card, 'table', who, {
      selected: game.selectedAttacker === card.uid,
      canAttack: who === 'player' && card.canAttack && game.turnOwner === 'player' && game.screen === 'table',
      targetable,
    }));
  }
  return row;
}

function overlay(title, lines, buttonLabel, buttonId, extraClass = '') {
  const el = document.createElement('div');
  el.className = `overlay ${extraClass}`;
  el.innerHTML = `
    <div class="overlay-panel">
      <h1 class="overlay-title">${title}</h1>
      ${lines.map((l) => `<p class="overlay-line">${l}</p>`).join('')}
      <button class="big-button" id="${buttonId}">${buttonLabel}</button>
    </div>
  `;
  return el;
}

// Redraw the whole stage from the game state.
export function renderGame(root, game) {
  root.innerHTML = '';
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.id = 'stage';

  if (game.screen === 'title') {
    stage.appendChild(overlay(
      'EMBER <span class="amp">&amp;</span> TIDE',
      [
        'A duel of fire and water. Reduce the Rival from <b>20 life</b> to <b>0</b> — before they do the same to you.',
        'Each turn your mana grows by 1 (max 10). Play creatures, then attack with them. Ember hits hard and breaks fast; Tide endures and heals.',
        'Click a card to play it · Click your creature, then a Rival creature or the Rival, to attack · <b>Space</b> ends your turn.',
      ],
      '▶ &nbsp;PLAY',
      'play-button',
      'title-screen',
    ));
    root.appendChild(stage);
    return;
  }

  // --- Table ---
  const topBar = document.createElement('div');
  topBar.className = 'top-bar';
  topBar.appendChild(heroPanel(game.enemy, 'enemy', game.turnOwner === 'enemy'));
  const turnBadge = document.createElement('div');
  turnBadge.className = 'turn-badge';
  turnBadge.innerHTML = `<div class="turn-num">TURN ${game.turn}</div><div class="turn-who">${game.turnOwner === 'player' ? 'YOUR TURN' : 'RIVAL TURN'}</div><div class="turn-msg">${game.message}</div>`;
  topBar.appendChild(turnBadge);
  const endBtn = document.createElement('button');
  endBtn.className = 'end-turn';
  endBtn.id = 'end-turn-button';
  endBtn.disabled = game.turnOwner !== 'player' || game.screen !== 'table';
  endBtn.textContent = game.turnOwner === 'player' ? 'END TURN ⏎' : 'RIVAL…';
  topBar.appendChild(endBtn);
  stage.appendChild(topBar);

  stage.appendChild(handRow(game.enemy, 'enemy', game));
  stage.appendChild(tableRow(game.enemy, 'enemy', game));

  const mid = document.createElement('div');
  mid.className = 'mid-strip';
  const log = document.createElement('div');
  log.className = 'battle-log';
  log.innerHTML = game.log.map((l) => `<div>• ${l}</div>`).join('') || '<div>• The duel begins.</div>';
  mid.appendChild(log);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = game.spellTargeting
    ? `Choose a target for ${game.spellTargeting.name} — click a glowing creature.`
    : game.selectedAttacker
      ? 'Choose a target — click a Rival creature or the Rival.'
      : 'Click a card to play it · Click a ready creature to attack · Space ends turn';
  mid.appendChild(hint);
  stage.appendChild(mid);

  stage.appendChild(tableRow(game.player, 'player', game));
  const bottomBar = document.createElement('div');
  bottomBar.className = 'bottom-bar';
  bottomBar.appendChild(heroPanel(game.player, 'player', game.turnOwner === 'player'));
  bottomBar.appendChild(handRow(game.player, 'player', game));
  stage.appendChild(bottomBar);

  if (game.screen === 'win' || game.screen === 'loss') {
    const isWin = game.screen === 'win';
    stage.appendChild(overlay(
      isWin ? '★ &nbsp;YOU WIN!&nbsp; ★' : '☠ &nbsp;YOU LOSE&nbsp; ☠',
      [
        isWin
          ? `The Rival falls at <b>${game.enemy.life} life</b>. Fire and water bow to you on turn ${game.turn}.`
          : `Your life reaches <b>0</b> on turn ${game.turn}. The Rival takes the tide.`,
        `Final life — You <b>${game.player.life}</b> · Rival <b>${game.enemy.life}</b>`,
        'Click PLAY AGAIN for a rematch with a fresh shuffle.',
      ],
      '↻ &nbsp;PLAY AGAIN',
      'again-button',
      isWin ? 'win-screen' : 'loss-screen',
    ));
  }

  root.appendChild(stage);
}
