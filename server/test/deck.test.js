import test from 'node:test';
import assert from 'node:assert/strict';
import { deck } from '../src/deck.js';
import { createDrawPile, drawCards } from '../src/deal.js';

test('il mazzo contiene esattamente 167 carte differenti', () => {
  assert.equal(deck.length, 167);
  assert.equal(new Set(deck.map(c => c.word.toLocaleLowerCase('it'))).size, 167);
  assert.ok(deck.every(c => c.word && c.emoji));
});

test('cinque round consumano 25 carte senza ripetizioni', () => {
  const room = { drawPile: createDrawPile(deck) };
  const drawn = Array.from({ length: 5 }, () => drawCards(room));
  assert.ok(drawn.every(cards => cards.length === 5));
  assert.equal(new Set(drawn.flat().map(c => c.word)).size, 25);
  assert.equal(room.drawPile.length, 142);
});

test('mescolamento non modifica il mazzo originale', () => {
  const first = deck[0];
  const shuffled = createDrawPile(deck, () => 0);
  assert.equal(deck[0], first);
  assert.equal(shuffled.length, 167);
  assert.notEqual(shuffled[0], deck[0]);
});
