import { randomInt } from 'node:crypto';

// Mescolamento Fisher-Yates, eseguito una volta per ciascuna partita.
export function createDrawPile(cards, pickIndex = randomInt) {
  if (!Array.isArray(cards) || cards.length < 5) throw new Error('Mazzo insufficiente');
  const pile = [...cards];
  for (let i = pile.length - 1; i > 0; i--) {
    const j = pickIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Indice casuale non valido');
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  return pile;
}

export function drawCards(room, count = 5) {
  if (!Number.isInteger(count) || count < 1 ||
      !Array.isArray(room.drawPile) || room.drawPile.length < count) {
    throw new Error('Carte insufficienti per il round');
  }
  return room.drawPile.splice(0, count);
}
