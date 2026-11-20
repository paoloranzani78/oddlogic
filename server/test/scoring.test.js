import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoundResults, calculateScores, comparisons, keyFor } from '../src/scoring.js';

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

test('motivazioni uguali al netto delle maiuscole danno il bonus e il dettaglio dei punti', () => {
  const room = {
    players: [{ id: 'a', name: 'Mamma' }, { id: 'b', name: 'Paolo' }, { id: 'c', name: 'Chiara' }],
    answers: new Map([
      ['a', { pairs: [{ cards: [0, 1], reason: 'Animali' }, { cards: [2, 3], reason: 'Vacanza' }] }],
      ['b', { pairs: [{ cards: [1, 0], reason: 'ANIMALI' }, { cards: [2, 3], reason: 'Mare' }] }],
      ['c', { pairs: [{ cards: [0, 4], reason: 'Altro' }, { cards: [1, 2], reason: 'Altro' }] }]
    ]),
    votes: new Map()
  };
  const [identical, different] = comparisons(room);
  assert.equal(identical.equivalent, true);
  assert.equal(different.equivalent, false);
  room.votes.set(different.key + '|c', false);
  assert.deepEqual(calculateRoundResults(room), {
    a: { gain: 3, details: [
      { cards: [0, 1], partner: 'Paolo', points: 2 },
      { cards: [2, 3], partner: 'Paolo', points: 1 }
    ] },
    b: { gain: 3, details: [
      { cards: [0, 1], partner: 'Mamma', points: 2 },
      { cards: [2, 3], partner: 'Mamma', points: 1 }
    ] },
    c: { gain: 0, details: [] }
  });
});

test('la stessa carta esclusa vale un punto per ogni altro giocatore, senza votazione', () => {
  const room = {
    players: [
      { id: 'a', name: 'Anna' }, { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Chiara' }, { id: 'd', name: 'Diego' }
    ],
    answers: new Map([
      ['a', { odd: 0, pairs: [] }],
      ['b', { odd: 0, pairs: [] }],
      ['c', { odd: 0, pairs: [] }],
      ['d', { odd: 1, pairs: [] }]
    ]),
    votes: new Map()
  };
  assert.deepEqual(comparisons(room), []);
  assert.deepEqual(calculateScores(room), { a: 2, b: 2, c: 2, d: 0 });
  assert.deepEqual(calculateRoundResults(room).a.details, [
    { cards: [0], points: 1, partner: 'Bruno' },
    { cards: [0], points: 1, partner: 'Chiara' }
  ]);
});
