// ai.js — the Rival's brain. It reads the table, not the player's hand:
// play the most expensive creature it can afford (biggest threat first),
// fire Cinder Burst at the player's strongest creature, sweep the biggest
// threat back with Riptide, then attack with everything it has. Simple
// enough to read and counter, strong enough to win when you stall.

import { isCreature } from './cards.js';
import { playCard, resolveSpell, attackCreature, attackFace, endTurn } from './state.js';

// One full Rival turn, as a list of moves the UI replays with a small
// delay between them so the player can follow what happened.
export function planAiTurn(game) {
  const moves = [];
  const foe = game.enemy;
  // 1) Play creatures, most expensive first, while mana allows.
  const creatures = foe.hand.filter(isCreature).sort((a, b) => b.cost - a.cost);
  for (const card of creatures) {
    if (card.cost <= foe.mana && foe.table.length < 5) {
      const res = playCard(game, 'enemy', card.uid);
      if (res.ok) moves.push({ kind: 'play', card: card.name });
    }
  }
  // 2) Cinder Burst: burn the player's strongest creature.
  const burst = foe.hand.find((c) => c.id === 'cinder-burst');
  if (burst && burst.cost <= foe.mana) {
    const target = strongestCreature(game.player.table);
    if (target) {
      playCard(game, 'enemy', burst.uid);
      const res = resolveSpell(game, 'enemy', target.uid);
      if (res.ok) moves.push({ kind: 'spell', card: 'Cinder Burst', target: target.name });
    }
  }
  // 3) Riptide: sweep the player's biggest remaining threat back to hand.
  const riptide = foe.hand.find((c) => c.id === 'riptide');
  if (riptide && riptide.cost <= foe.mana) {
    const target = strongestCreature(game.player.table);
    if (target && target.atk >= 4) {
      playCard(game, 'enemy', riptide.uid);
      const res = resolveSpell(game, 'enemy', target.uid);
      if (res.ok) moves.push({ kind: 'spell', card: 'Riptide', target: target.name });
    }
  }
  // 4) Attack with every ready creature. The Rival reads the table:
  //    a free kill (remove a creature without dying) always comes first.
  //    When the Rival's board out-hits yours it races you: it stops
  //    trading and sends everything at your life. Otherwise it removes
  //    your biggest threat even at the cost of its own creature, then
  //    takes an even trade, and only then goes face.
  const foeBoardAtk = foe.table.reduce((s, c) => s + c.atk, 0);
  const yourBoardAtk = game.player.table.reduce((s, c) => s + c.atk, 0);
  const raceMode = foeBoardAtk > yourBoardAtk;
  for (const attacker of [...foe.table]) {
    if (!attacker.canAttack) continue;
    const freeKill = game.player.table.find(
      (d) => attacker.atk >= d.hp && attacker.hp > d.atk,
    );
    const bigThreat = game.player.table.find(
      (d) => d.atk >= 4 && attacker.atk >= d.hp,
    );
    const evenTrade = game.player.table.find(
      (d) => d.atk >= attacker.hp && attacker.atk >= d.hp,
    );
    const prey = freeKill ?? (raceMode ? null : (bigThreat ?? evenTrade));
    if (prey) {
      attackCreature(game, 'enemy', attacker.uid, prey.uid);
      moves.push({ kind: 'attack', card: attacker.name, target: prey.name });
    } else {
      attackFace(game, 'enemy', attacker.uid);
      moves.push({ kind: 'attack', card: attacker.name, target: 'you' });
    }
    if (game.screen === 'win' || game.screen === 'loss') break;
  }
  if (game.screen !== 'win' && game.screen !== 'loss') {
    endTurn(game);
    moves.push({ kind: 'end' });
  }
  return moves;
}

export function strongestCreature(table) {
  let best = null;
  for (const c of table) {
    if (!best || c.atk > best.atk || (c.atk === best.atk && c.hp > best.hp)) best = c;
  }
  return best;
}

// Instant, no-delay version of the Rival turn for scripted tests: same
// decisions, no animation pacing, so a test can run a whole game fast.
export function runAiTurnInstant(game) {
  return planAiTurn(game);
}
