// random.js — a tiny seeded random generator (mulberry32) so the same seed
// always shuffles the same decks and deals the same hands. Screenshots
// taken with ?seed=7 are byte-identical on every re-shoot.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draw an integer in [0, n): the shuffle's only other consumer, kept here
// so every seeded decision in the game flows through this one file.
export function randomInt(rand, n) {
  return Math.floor(rand() * n);
}
