export const keyFor = pair => [...pair.cards].sort((a,b)=>a-b).join('-');
export function calculateScores(room) {
  return Object.fromEntries(Object.entries(calculateRoundResults(room))
    .map(([id, result]) => [id, result.gain]));
}

export function calculateRoundResults(room, items = comparisons(room)) {
  const names = new Map(room.players.map(p => [p.id, p.name]));
  const results = Object.fromEntries(room.players.map(p => [p.id, { gain: 0, details: [] }]));
  function awardBoth(aId, bId, detail) {
    for (const [id, partnerId] of [[aId, bId], [bId, aId]]) {
      results[id].gain += detail.points;
      results[id].details.push({ ...detail, partner: names.get(partnerId) });
    }
  }
  for (const { aId, bId, cards, votes, equivalent } of items) {
    const values = Object.values(votes);
    const bonus = equivalent || (
      values.every(v => v !== null) && values.filter(v => v === true).length > values.length / 2
    );
    awardBoth(aId, bId, { cards, points: bonus ? 2 : 1 });
  }
  for (const [index, a] of room.players.entries()) {
    const card = room.answers.get(a.id)?.odd;
    if (!Number.isInteger(card)) continue;
    for (const b of room.players.slice(index + 1)) {
      if (room.answers.get(b.id)?.odd === card) {
        awardBoth(a.id, b.id, { cards: [card], points: 1 });
      }
    }
  }
  return results;
}

export function comparisons(room){
 const items=[];const answers=[...room.answers.entries()];
 for(let i=0;i<answers.length;i++)for(let j=i+1;j<answers.length;j++){
  const [aId,a]=answers[i],[bId,b]=answers[j];
  for(const pa of a.pairs)for(const pb of b.pairs)if(keyFor(pa)===keyFor(pb)){
   const key=[aId,bId].sort().join('|')+'|'+keyFor(pa);
   const equivalent = pa.reason.trim().toLowerCase() === pb.reason.trim().toLowerCase();
   items.push({key,aId,bId,cards:pa.cards,reasonA:pa.reason,reasonB:pb.reason,equivalent,
    votes:Object.fromEntries(room.players.filter(p=>p.id!==aId&&p.id!==bId).map(p=>[p.id,room.votes.get(key+'|'+p.id)??null]))});
  }
 }
 return items;
}
