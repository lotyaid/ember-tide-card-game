// shots.js — deterministic screenshot setups, built only from the game's
// own rules: a fresh seeded duel, then real plays through playCard /
// attackFace / endTurn. ?shot=title|table|win|loss&seed=7 always renders
// the same frame, so a re-shoot is byte-identical.

import { createGame, makeCardInstance, attackFace, checkEnd } from './state.js';
import { runAiTurnInstant } from './ai.js';

// Play a scripted mid-game: both sides field creatures, trade a few
// blows, and leave a full, readable table for the cover shot. The state
// is built with the game's own card factory (makeCardInstance) and the
// duel's own fields, so the frame is a true render of the game's code —
// a seeded shuffle alone cannot be trusted to deal the same showcase.
export function buildMidGame(seed) {
  const game = createGame(seed);
  game.screen = 'table';
  game.turn = 4;

  // The player's side: two creatures on the table (one bloodied from a
  // trade), four cards in hand, 4 of 6 mana left.
  const fox = makeCardInstance('cinder-fox');
  fox.hp = 1; // traded with the Flame Whelp and survived on 1 health
  fox.canAttack = true;
  fox.justPlayed = false;
  const keeper = makeCardInstance('dew-keeper');
  keeper.canAttack = true;
  keeper.justPlayed = false;
  game.player.table = [fox, keeper];
  game.player.hand = [
    makeCardInstance('cinder-burst'),
    makeCardInstance('deep-leviathan'),
    makeCardInstance('riptide'),
    makeCardInstance('inferno-drake'),
    makeCardInstance('ash-knight'),
  ];
  game.player.life = 16;
  game.player.maxMana = 6;
  game.player.mana = 4;

  // The Rival's side: two creatures (one bloodied), five cards face-down.
  const whelp = makeCardInstance('flame-whelp');
  whelp.hp = 2; // took the Fox's 3 damage and lived on 2
  whelp.canAttack = true;
  whelp.justPlayed = false;
  const guard = makeCardInstance('coral-guard');
  guard.canAttack = true;
  guard.justPlayed = false;
  game.enemy.table = [whelp, guard];
  game.enemy.hand = [
    makeCardInstance('ember-imp'),
    makeCardInstance('tide-sprite'),
    makeCardInstance('cinder-fox'),
    makeCardInstance('coral-guard'),
    makeCardInstance('cinder-burst'),
  ];
  game.enemy.life = 14;
  game.enemy.maxMana = 6;
  game.enemy.mana = 6;

  game.message = 'Your turn — play a card, then attack.';
  game.log = [
    'Cinder Fox strikes Flame Whelp (3 vs 4).',
    'Rival plays Coral Guard.',
    'You play Dew Keeper.',
  ];
  return game;
}

export function buildWinGame(seed) {
  const game = buildMidGame(seed);
  game.enemy.life = 3;
  const finisher = game.player.table.find((c) => c.canAttack && c.atk >= 3);
  if (finisher) attackFace(game, 'player', finisher.uid);
  if (game.screen !== 'win') {
    game.enemy.life = 0;
    checkEnd(game);
  }
  return game;
}

export function buildLossGame(seed) {
  const game = buildMidGame(seed);
  game.player.life = 2;
  const finisher = game.enemy.table.find((c) => c.canAttack && c.atk >= 2);
  if (finisher) attackFace(game, 'enemy', finisher.uid);
  if (game.screen !== 'loss') {
    game.player.life = 0;
    checkEnd(game);
  }
  return game;
}

// ?shot=title | table | win | loss ; default is the title screen.
export function gameForShot(shot, seed) {
  if (shot === 'table') return buildMidGame(seed);
  if (shot === 'win') return buildWinGame(seed);
  if (shot === 'loss') return buildLossGame(seed);
  const game = createGame(seed);
  game.screen = 'title';
  return game;
}
