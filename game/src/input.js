// input.js — mouse + keyboard for Ember & Tide.
// Click a hand card to play it (spells ask for a target first). Click one
// of your ready creatures, then a Rival creature or the Rival hero, to
// attack. Space / Enter ends the turn. Every button is clickable too.

import { playCard, resolveSpell, attackCreature, attackFace, endTurn } from './state.js';
import { isCreature } from './cards.js';
import { runAiTurnInstant } from './ai.js';

// getGame is a function returning the current duel: the main module may
// swap the game object on a rematch, and the handlers must follow it.
export function bindInput(root, getGame, onChange) {
  root.addEventListener('click', (event) => {
    const game = getGame();
    const target = event.target;
    if (target.id === 'play-button' || target.id === 'again-button') {
      startFresh(game, onChange);
      return;
    }
    if (target.id === 'end-turn-button') {
      if (game.turnOwner === 'player' && game.screen === 'table') {
        endPlayerTurn(game, onChange);
      }
      return;
    }
    if (game.screen !== 'table' || game.turnOwner !== 'player') return;
    const cardEl = target.closest('.card');
    if (cardEl) handleCardClick(game, cardEl, onChange);
    const heroEl = target.closest('.hero.enemy');
    if (heroEl && game.selectedAttacker) {
      attackFace(game, 'player', game.selectedAttacker);
      game.selectedAttacker = null;
      onChange();
    }
  });

  document.addEventListener('keydown', (event) => {
    const game = getGame();
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      if (game.screen === 'title' || game.screen === 'win' || game.screen === 'loss') {
        startFresh(game, onChange);
      } else if (game.turnOwner === 'player') {
        endPlayerTurn(game, onChange);
      }
    }
    if (event.code === 'Escape') {
      game.selectedHand = null;
      game.selectedAttacker = null;
      game.spellTargeting = null;
      onChange();
    }
  });
}

function handleCardClick(game, cardEl, onChange) {
  const uid = Number(cardEl.dataset.uid);
  const zone = cardEl.dataset.zone;
  const owner = cardEl.dataset.owner;

  // A spell is waiting for a target: only table creatures are valid clicks.
  if (game.spellTargeting && zone === 'table') {
    const res = resolveSpell(game, 'player', uid);
    if (res.ok) {
      game.selectedHand = null;
      onChange();
    } else {
      game.message = res.why === 'needs an enemy creature'
        ? 'Riptide needs an enemy creature — pick a Rival creature.'
        : 'That is not a valid target.';
      onChange();
    }
    return;
  }

  // Play a card from the hand.
  if (zone === 'hand' && owner === 'player') {
    const card = game.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    if (!isCreature(card) && game.spellTargeting?.uid === uid) return;
    const res = playCard(game, 'player', uid);
    if (!res.ok) {
      game.message = res.why === 'not enough mana'
        ? `Not enough mana for ${card.name}.`
        : res.why === 'table is full'
          ? 'Your table is full — attack with a creature first.'
          : res.why;
      onChange();
      return;
    }
    if (res.needsTarget) {
      game.message = `Choose a target for ${card.name}.`;
      onChange();
      return;
    }
    game.selectedHand = null;
    onChange();
    return;
  }

  // Select one of your creatures to attack with, or attack with the
  // already-selected creature.
  if (zone === 'table' && owner === 'player') {
    const card = game.player.table.find((c) => c.uid === uid);
    if (!card) return;
    if (game.selectedAttacker === uid) {
      game.selectedAttacker = null;
    } else if (card.canAttack) {
      game.selectedAttacker = uid;
      game.message = `${card.name} is ready — pick a target.`;
    } else {
      game.message = `${card.name} ${card.justPlayed ? 'just entered and cannot attack yet.' : 'already attacked this turn.'}`;
    }
    onChange();
    return;
  }

  // Attack an enemy creature with the selected attacker.
  if (zone === 'table' && owner === 'enemy' && game.selectedAttacker) {
    const res = attackCreature(game, 'player', game.selectedAttacker, uid);
    if (res.ok) game.selectedAttacker = null;
    onChange();
  }
}

// End the player's turn, run the Rival's turn instantly, then hand the
// duel back. A tiny delay keeps the Rival's moves readable in the log.
export function endPlayerTurn(game, onChange) {
  endTurn(game);
  onChange();
  if (game.screen === 'win' || game.screen === 'loss') return;
  setTimeout(() => {
    runAiTurnInstant(game);
    onChange();
  }, 450);
}

function startFresh(game, onChange) {
  const fresh = game.__restart ? game.__restart() : null;
  if (fresh) {
    Object.assign(game, fresh);
    game.screen = 'table';
  }
  onChange();
}
