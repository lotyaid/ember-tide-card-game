// state.js — the duel's state: life, mana, hands, table, and the rules
// that move a game forward. Pure logic, no DOM: render.js draws it,
// input.js and ai.js drive it, shots.js presets it.

import { buildDeck, shuffleDeck, cardById, isCreature } from './cards.js';
import { mulberry32 } from './random.js';

export const MAX_LIFE = 20;
export const MAX_MANA = 10;
export const MAX_HAND = 7;
export const MAX_TABLE = 5;
export const START_HAND = 4;

let nextUid = 1;

export function makeCardInstance(cardId) {
  const def = cardById(cardId);
  return {
    uid: nextUid++,
    id: def.id,
    name: def.name,
    suit: def.suit,
    cost: def.cost,
    atk: def.atk ?? 0,
    hp: def.hp ?? 0,
    maxHp: def.hp ?? 0,
    heal: def.heal ?? 0,
    text: def.text,
    target: def.target ?? null,
    damage: def.damage ?? 0,
    // A creature cannot attack on the turn it is played.
    canAttack: false,
    justPlayed: true,
  };
}

// A fresh duel. seed drives the shuffle, so ?seed=7 always deals the same.
export function createGame(seed) {
  const rand = mulberry32(seed);
  nextUid = 1;
  const playerDeck = shuffleDeck(buildDeck(), rand);
  const enemyDeck = shuffleDeck(buildDeck(), rand);
  const game = {
    seed,
    screen: 'title', // title | table | win | loss
    turn: 1,
    turnOwner: 'player',
    message: 'Welcome to Ember & Tide.',
    log: [],
    // The Rival moves second, so it opens with one extra card — the
    // classic second-player compensation for losing the first move.
    player: makeSide(playerDeck, START_HAND),
    enemy: makeSide(enemyDeck, START_HAND + 1),
    selectedHand: null,   // uid of a hand card picked for play / targeting
    selectedAttacker: null, // uid of a table creature picked to attack
    spellTargeting: null, // spell instance awaiting a target
    winner: null,
  };
  startTurn(game, 'player');
  return game;
}

function makeSide(deck, handCount) {
  const side = { life: MAX_LIFE, mana: 0, maxMana: 0, deck, hand: [], table: [] };
  for (let i = 0; i < handCount; i++) drawCard(side);
  return side;
}

export function drawCard(side) {
  if (side.hand.length >= MAX_HAND) return null;
  const id = side.deck.shift();
  if (!id) return null;
  const card = makeCardInstance(id);
  side.hand.push(card);
  return card;
}

export function otherSide(game, who) {
  return who === 'player' ? game.enemy : game.player;
}

// Begin a side's turn: mana grows by 1 (capped at 10), refills, draws a
// card, and every creature on that side wakes up ready to attack.
export function startTurn(game, who) {
  const side = who === 'player' ? game.player : game.enemy;
  side.maxMana = Math.min(MAX_MANA, side.maxMana + 1);
  side.mana = side.maxMana;
  drawCard(side);
  for (const c of side.table) {
    c.canAttack = true;
    c.justPlayed = false;
  }
  game.turnOwner = who;
}

// Play a hand card. Creatures enter the table; spells need a target first
// (the caller sets game.spellTargeting), then resolve on that target.
export function playCard(game, who, handUid) {
  const side = who === 'player' ? game.player : game.enemy;
  const idx = side.hand.findIndex((c) => c.uid === handUid);
  if (idx === -1) return { ok: false, why: 'not in hand' };
  const card = side.hand[idx];
  if (card.cost > side.mana) return { ok: false, why: 'not enough mana' };
  if (isCreature(card) && side.table.length >= MAX_TABLE) {
    return { ok: false, why: 'table is full' };
  }
  if (isCreature(card)) {
    side.mana -= card.cost;
    side.hand.splice(idx, 1);
    card.canAttack = false;
    card.justPlayed = true;
    side.table.push(card);
    if (card.heal) {
      side.life = Math.min(MAX_LIFE, side.life + card.heal);
      pushLog(game, `${card.name} mends ${card.heal} life.`);
    }
    pushLog(game, `${who === 'player' ? 'You play' : 'Rival plays'} ${card.name}.`);
    return { ok: true, played: card };
  }
  // Spell: hold it until a target is chosen.
  game.spellTargeting = card;
  return { ok: true, needsTarget: true, spell: card };
}

// Resolve a spell that already has a target creature (or null for none).
export function resolveSpell(game, who, targetUid) {
  const spell = game.spellTargeting;
  if (!spell) return { ok: false, why: 'no spell waiting' };
  const side = who === 'player' ? game.player : game.enemy;
  const foe = otherSide(game, who);
  const idx = side.hand.findIndex((c) => c.uid === spell.uid);
  if (idx === -1) return { ok: false, why: 'spell left hand' };
  let target = null;
  if (targetUid != null) {
    target = foe.table.find((c) => c.uid === targetUid)
      ?? side.table.find((c) => c.uid === targetUid) ?? null;
  }
  if (spell.target === 'enemy-creature' && (!target || !foe.table.includes(target))) {
    return { ok: false, why: 'needs an enemy creature' };
  }
  if (spell.target === 'any-creature' && !target) {
    return { ok: false, why: 'needs a creature' };
  }
  side.mana -= spell.cost;
  side.hand.splice(idx, 1);
  game.spellTargeting = null;
  if (spell.id === 'cinder-burst') {
    damageCreature(game, target, spell.damage);
    pushLog(game, `Cinder Burst hits ${target.name} for ${spell.damage}.`);
  } else if (spell.id === 'riptide') {
    foe.table = foe.table.filter((c) => c.uid !== target.uid);
    if (foe.hand.length < MAX_HAND) foe.hand.push(target);
    pushLog(game, `Riptide sweeps ${target.name} back to hand.`);
  }
  checkEnd(game);
  return { ok: true };
}

// One creature attacks another: both deal their attack to each other.
export function attackCreature(game, who, attackerUid, defenderUid) {
  const side = who === 'player' ? game.player : game.enemy;
  const foe = otherSide(game, who);
  const attacker = side.table.find((c) => c.uid === attackerUid);
  const defender = foe.table.find((c) => c.uid === defenderUid);
  if (!attacker || !defender) return { ok: false, why: 'no such creature' };
  if (!attacker.canAttack) return { ok: false, why: 'already attacked' };
  attacker.canAttack = false;
  damageCreature(game, defender, attacker.atk);
  damageCreature(game, attacker, defender.atk);
  pushLog(game, `${attacker.name} strikes ${defender.name} (${attacker.atk} vs ${defender.atk}).`);
  checkEnd(game);
  return { ok: true };
}

// Attack the opposing duelist directly: life drops, no retaliation.
export function attackFace(game, who, attackerUid) {
  const side = who === 'player' ? game.player : game.enemy;
  const foe = otherSide(game, who);
  const attacker = side.table.find((c) => c.uid === attackerUid);
  if (!attacker) return { ok: false, why: 'no such creature' };
  if (!attacker.canAttack) return { ok: false, why: 'already attacked' };
  attacker.canAttack = false;
  foe.life -= attacker.atk;
  pushLog(game, `${attacker.name} hits ${who === 'player' ? 'the Rival' : 'you'} for ${attacker.atk}.`);
  checkEnd(game);
  return { ok: true };
}

export function damageCreature(game, creature, amount) {
  creature.hp -= amount;
  const owner = game.player.table.includes(creature) ? game.player : game.enemy;
  if (creature.hp <= 0) {
    owner.table = owner.table.filter((c) => c.uid !== creature.uid);
    pushLog(game, `${creature.name} is destroyed.`);
  }
}

// End the current side's turn and hand the duel to the other side.
export function endTurn(game) {
  if (game.screen === 'win' || game.screen === 'loss') return;
  game.selectedHand = null;
  game.selectedAttacker = null;
  game.spellTargeting = null;
  const next = game.turnOwner === 'player' ? 'enemy' : 'player';
  if (next === 'player') game.turn += 1;
  startTurn(game, next);
  game.message = next === 'player' ? 'Your turn — play a card, then attack.' : 'Rival is thinking…';
}

export function checkEnd(game) {
  if (game.enemy.life <= 0) {
    game.enemy.life = 0;
    game.screen = 'win';
    game.winner = 'player';
    game.message = 'The tide turns in your favour — you win!';
  } else if (game.player.life <= 0) {
    game.player.life = 0;
    game.screen = 'loss';
    game.winner = 'enemy';
    game.message = 'The embers die down — the Rival wins.';
  }
}

export function pushLog(game, text) {
  game.log.unshift(text);
  if (game.log.length > 6) game.log.length = 6;
}
