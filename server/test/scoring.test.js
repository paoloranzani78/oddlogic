import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScores, comparisons, keyFor } from '../src/scoring.js';

test('ordine delle carte non cambia l’identità della coppia', () => {
  assert.equal(keyFor({ cards: [4, 1] }), '1-4');
  assert.equal(keyFor({ cards: [1, 4] }), '1-4');
});

test('una coppia condivisa vale un punto per entrambi', () => {
  const room = {
    players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    answers: new Map([
      ['a', { pairs: [{ cards: [0, 1], reason: 'animali' }, { cards: [2, 3], reason: 'mare' }] }],
      ['b', { pairs: [{ cards: [1, 0], reason: 'animali domestici' }, { cards: [2, 4], reason: 'casuali' }] }],
      ['c', { pairs: [{ cards: [0, 4], reason: 'altro' }, { cards: [1, 2], reason: 'altro' }] }]
    ]),
    votes: new Map()
  };
  const list = comparisons(room);
  assert.equal(list.length, 1);
  assert.equal(list[0].votes.c, null);
  assert.deepEqual(calculateScores(room), { a: 1, b: 1, c: 0 });
  room.votes.set(list[0].key + '|c', true);
  assert.deepEqual(calculateScores(room), { a: 2, b: 2, c: 0 });
});
