export const keyFor = pair => [...pair.cards].sort((a,b)=>a-b).join('-');
// Regole MVP (non punteggio ufficiale): +1 per coppia condivisa con ogni altro giocatore;
// +1 extra per motivazione considerata equivalente dalla maggioranza dei votanti terzi.
export function calculateScores(room) {
 const gains=Object.fromEntries(room.players.map(p=>[p.id,0]));
 const answers=[...room.answers.entries()];
 for(let i=0;i<answers.length;i++)for(let j=i+1;j<answers.length;j++){
  const [aId,a]=answers[i], [bId,b]=answers[j];
  for(const pa of a.pairs)for(const pb of b.pairs)if(keyFor(pa)===keyFor(pb)){
   gains[aId]++;gains[bId]++;
   const voteKey=[aId,bId].sort().join('|')+'|'+keyFor(pa);
   const eligible=room.players.filter(p=>p.id!==aId&&p.id!==bId);
   const votes=eligible.map(p=>room.votes.get(voteKey+'|'+p.id)).filter(v=>v!==undefined);
   if(votes.length===eligible.length&&votes.filter(Boolean).length>votes.length/2){gains[aId]++;gains[bId]++;}
  }
 }
 return gains;
}
export function comparisons(room){
 const items=[];const answers=[...room.answers.entries()];
 for(let i=0;i<answers.length;i++)for(let j=i+1;j<answers.length;j++){
  const [aId,a]=answers[i],[bId,b]=answers[j];
  for(const pa of a.pairs)for(const pb of b.pairs)if(keyFor(pa)===keyFor(pb)){
   const key=[aId,bId].sort().join('|')+'|'+keyFor(pa);
   items.push({key,aId,bId,cards:pa.cards,reasonA:pa.reason,reasonB:pb.reason,
    votes:Object.fromEntries(room.players.filter(p=>p.id!==aId&&p.id!==bId).map(p=>[p.id,room.votes.get(key+'|'+p.id)??null]))});
  }
 }
 return items;
}
