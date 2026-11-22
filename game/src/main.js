// main.js — bootstrap for Ember & Tide. Reads ?shot=…&seed=… for the
// deterministic screenshot setups, otherwise starts on the title screen,
// and exposes a small debug handle (window.__ember) the playtest driver
// uses to play scripted games and prove a win and a loss are reachable.

import { createGame, playCard, attackCreature, attackFace, endTurn, startTurn } from './state.js';
import { runAiTurnInstant } from './ai.js';
import { isCreature } from './cards.js';
import { renderGame } from './render.js';
import { bindInput, endPlayerTurn } from './input.js';
import { gameForShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? '7') || 7;
const shot = params.get('shot');

const root = document.getElementById('app');
let game = shot ? gameForShot(shot, seed) : createGame(seed);
if (!shot) game.screen = 'title';

// Restart hook used by the Play / Play Again buttons: a fresh seeded
// duel, rendered from the title onwards.
game.__restart = () => {
  const fresh = createGame(seed);
  fresh.screen = 'table';
  return fresh;
};

function render() {
  renderGame(root, game);
}
render();
bindInput(root, () => game, render);

// A greedy scripted player: play every affordable creature, attack face
// with everything ready, end the turn. Used by the playtest to prove the
// game can be won and lost end to end.
function autopilotRound() {
  if (game.screen === 'win' || game.screen === 'loss') return game.screen;
  const creatures = game.player.hand.filter(isCreature).sort((a, b) => b.cost - a.cost);
  for (const card of creatures) {
    if (card.cost <= game.player.mana) playCard(game, 'player', card.uid);
  }
  for (const c of [...game.player.table]) {
    if (c.canAttack && game.screen === 'table') attackFace(game, 'player', c.uid);
  }
  if (game.screen === 'table') {
    endTurn(game);
    runAiTurnInstant(game);
  }
  render();
  return game.screen;
}

function playFullGame(maxRounds = 60) {
  let rounds = 0;
  while (game.screen === 'table' && rounds < maxRounds) {
    autopilotRound();
    rounds += 1;
  }
  return { screen: game.screen, rounds, playerLife: game.player.life, enemyLife: game.enemy.life };
}

window.__ember = {
  get game() { return game; },
  setGame(next) {
    game = next;
    game.__restart = () => {
      const fresh = createGame(seed);
      fresh.screen = 'table';
      return fresh;
    };
    render();
  },
  createGame,
  playFullGame,
  autopilotRound,
  render,
};
