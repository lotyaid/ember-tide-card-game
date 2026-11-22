// cards.js — the card catalogue of Ember & Tide: every creature and spell,
// its cost, its numbers, and the deck each duelist shuffles up.
// Ember cards are orange fire; Tide cards are blue water. No card here
// copies any commercial game: all names, numbers and effects are original.

export const SUIT_EMBER = 'ember';
export const SUIT_TIDE = 'tide';
export const SUIT_SPELL = 'spell';

// Creature catalogue. atk = damage it deals when it attacks, hp = health.
// heal = life the owner regains when the creature enters the table.
export const CREATURES = [
  { id: 'ember-imp',    name: 'Ember Imp',    suit: SUIT_EMBER, cost: 1, atk: 2, hp: 1, text: 'Quick spark. Hits hard, burns out fast.' },
  { id: 'tide-sprite',  name: 'Tide Sprite',  suit: SUIT_TIDE,  cost: 1, atk: 1, hp: 2, heal: 1, text: 'On play: mend 1 life.' },
  { id: 'cinder-fox',   name: 'Cinder Fox',   suit: SUIT_EMBER, cost: 2, atk: 3, hp: 2, text: 'A fox made of cinders. Fast and hungry.' },
  { id: 'dew-keeper',   name: 'Dew Keeper',   suit: SUIT_TIDE,  cost: 2, atk: 2, hp: 3, heal: 2, text: 'On play: mend 2 life.' },
  { id: 'flame-whelp',  name: 'Flame Whelp',  suit: SUIT_EMBER, cost: 3, atk: 4, hp: 3, text: 'Young dragon, old temper.' },
  { id: 'coral-guard',  name: 'Coral Guard',  suit: SUIT_TIDE,  cost: 3, atk: 3, hp: 5, text: 'A wall of living coral.' },
  { id: 'ash-knight',   name: 'Ash Knight',   suit: SUIT_EMBER, cost: 4, atk: 5, hp: 4, text: 'Rides in on a wave of ash.' },
  { id: 'tide-oracle',  name: 'Tide Oracle',  suit: SUIT_TIDE,  cost: 4, atk: 4, hp: 5, heal: 2, text: 'On play: mend 2 life.' },
  { id: 'inferno-drake', name: 'Inferno Drake', suit: SUIT_EMBER, cost: 6, atk: 7, hp: 5, text: 'The sky itself catches fire.' },
  { id: 'deep-leviathan', name: 'Deep Leviathan', suit: SUIT_TIDE, cost: 6, atk: 5, hp: 8, heal: 3, text: 'On play: mend 3 life.' },
];

// Spell catalogue. target: 'any-creature' or 'enemy-creature'.
export const SPELLS = [
  { id: 'cinder-burst', name: 'Cinder Burst', suit: SUIT_SPELL, cost: 2, target: 'any-creature', damage: 3, text: 'Deal 3 damage to any creature.' },
  { id: 'riptide',      name: 'Riptide',      suit: SUIT_SPELL, cost: 3, target: 'enemy-creature', text: 'Return an enemy creature to its owner hand.' },
];

export function cardById(id) {
  return CREATURES.find((c) => c.id === id) ?? SPELLS.find((s) => s.id === id) ?? null;
}

export function isCreature(card) {
  return CREATURES.some((c) => c.id === card.id);
}

// One 24-card deck: two copies of each creature, two of each spell.
// Both duelists draw from the same catalogue, shuffled by seed.
export function buildDeck() {
  const deck = [];
  for (const c of CREATURES) deck.push(c.id, c.id);
  for (const s of SPELLS) deck.push(s.id, s.id);
  return deck;
}

// Fisher-Yates shuffle driven by a seeded random function, so a given
// seed always deals the same opening hands (screenshots stay identical).
export function shuffleDeck(deck, rand) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Mana curve of one deck, for balance notes: eight 1-drops, eight 2-drops,
// four 3-drops, two 4-drops and two 6-drops, plus four spells (two of
// each). The curve is why the early turns are about cheap creatures and
// the late turns about the two finishers.
export function deckCurve() {
  const curve = {};
  for (const id of buildDeck()) {
    const cost = cardById(id).cost;
    curve[cost] = (curve[cost] ?? 0) + 1;
  }
  return curve;
}
