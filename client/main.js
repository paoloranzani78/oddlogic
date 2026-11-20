// Vue con compilatore dei template: evita la schermata nera riscontrata con la build runtime-only.
import { createApp, ref, computed, onMounted, onUnmounted } from 'https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.esm-browser.prod.js';
import { io } from 'https://esm.sh/socket.io-client@4.8.1';

const serverUrl = String(window.ODD_LOGIC_SERVER_URL || '').trim().replace(/\/$/, '');
const socket = serverUrl ? io(serverUrl, { autoConnect: false, reconnection: true, timeout: 10000 }) : null;
const storageKey = 'odd-logic-session-v2';
const roomFromUrl = () => new URLSearchParams(location.search).get('room')?.toUpperCase() || '';

createApp({
  setup() {
    const state = ref(null);
    const name = ref('');
    const code = ref(roomFromUrl());
    const error = ref('');
    const connected = ref(false);
    const connecting = ref(Boolean(socket));
    const leaving = ref(false);
    const selected = ref([]);
    const pairs = ref([]);
    const reasons = ref(['', '']);
    const scoreDialog = ref(null);
    const scorePlayer = ref(null);
    const me = computed(() => state.value?.players.find(p => p.id === state.value.me));
    const used = computed(() => pairs.value.flat());
    const odd = computed(() => [0, 1, 2, 3, 4].find(i => !used.value.includes(i)));
    const canSubmit = computed(() => pairs.value.length === 2 && reasons.value.every(x => x.trim().length > 0));
    const sortedPlayers = computed(() => [...(state.value?.players || [])].sort((a, b) => b.score - a.score));
    const playerName = id => state.value?.players.find(p => p.id === id)?.name || 'Giocatore';
    const cardName = i => state.value?.cards[i]?.word || '?';
    const cardIcon = i => state.value?.cards[i]?.emoji || '';
    const revealedPairs = computed(() => {
      const groups = new Map();
      for (const [id, answer] of Object.entries(state.value?.answers || {})) {
        for (const pair of answer.pairs) {
          const cards = [...pair.cards].sort((a, b) => a - b);
          const key = cards.join('-');
          if (!groups.has(key)) groups.set(key, { key, cards, responses: [] });
          groups.get(key).responses.push({ id, reason: pair.reason });
        }
      }
      return [...groups.values()].sort((a, b) =>
        b.responses.length - a.responses.length || a.key.localeCompare(b.key));
    });
    const excludedCards = computed(() => Object.entries(state.value?.answers || {})
      .map(([id, answer]) => ({ id, card: answer.odd }))
      .sort((a, b) => a.card - b.card));
    const readyMessage = computed(() => `${state.value?.readyCount || 0} / ${state.value?.players.length || 0} pronti`);

    function emit(event, payload = {}) {
      if (leaving.value) return;
      if (!socket || !connected.value) {
        error.value = 'Server multiplayer non connesso. Controlla la configurazione di Render.';
        return;
      }
      error.value = '';
      socket.timeout(12000).emit(event, payload, (err, result) => {
        if (err) error.value = 'Il server non risponde. Riprova tra qualche istante.';
        else if (result && !result.ok) error.value = result.error || 'Operazione non riuscita.';
      });
    }
    function create() {
      if (!name.value.trim()) { error.value = 'Inserisci il tuo nickname.'; return; }
      emit('create', { name: name.value.trim() });
    }
    function join() {
      if (!name.value.trim()) { error.value = 'Inserisci il tuo nickname.'; return; }
      const roomCode = code.value.trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(roomCode)) {
        error.value = 'Il codice stanza deve contenere quattro lettere da A a Z.';
        return;
      }
      emit('join', { name: name.value.trim(), code: roomCode });
    }
    function ready() { if (!state.value?.myReady) emit('ready'); }
    function pick(i) {
      if (pairs.value.length === 2 || used.value.includes(i) || state.value?.myAnswer) return;
      if (selected.value.includes(i)) { selected.value = selected.value.filter(x => x !== i); return; }
      selected.value.push(i);
      if (selected.value.length === 2) { pairs.value.push([...selected.value]); selected.value = []; }
    }
    function remove(i) {
      if (state.value?.myAnswer) return;
      pairs.value.splice(i, 1);
      reasons.value.splice(i, 1);
      reasons.value.push('');
    }
    function submit() {
      if (canSubmit.value) emit('answer', {
        pairs: pairs.value.map((cards, i) => ({ cards, reason: reasons.value[i].trim() }))
      });
    }
    function vote(comparison, value) { emit('vote', { key: comparison.key, value }); }
    function showScore(player) {
      scorePlayer.value = player;
      scoreDialog.value.showModal();
    }
    function closeScore() { scoreDialog.value?.close(); }
    async function copyInvite() {
      if (!state.value) return;
      const link = `${location.origin}/?room=${state.value.code}`;
      try { await navigator.clipboard.writeText(link); error.value = ''; }
      catch { error.value = `Copia questo link per invitare gli amici: ${link}`; }
    }
    function resetRound() {
      closeScore();
      scorePlayer.value = null;
      selected.value = [];
      pairs.value = [];
      reasons.value = ['', ''];
    }
    function clearSession() {
      localStorage.removeItem(storageKey);
      state.value = null;
      code.value = '';
      resetRound();
      const url = new URL(location.href);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
    }
    function leave() {
      if (!state.value || !connected.value || leaving.value) return;
      if (!window.confirm('Vuoi uscire dalla partita?')) return;
      leaving.value = true;
      error.value = '';
      socket.timeout(12000).emit('leave', {}, (err, result) => {
        leaving.value = false;
        if (err || !result?.ok) {
          error.value = 'Uscita non confermata dal server. Riprova.';
          return;
        }
        clearSession();
      });
    }
    function getSavedSession() {
      try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); }
      catch { localStorage.removeItem(storageKey); return null; }
    }
    function rejoin() {
      const saved = getSavedSession();
      if (!saved || !saved.code || !saved.token) return;
      const invitedRoom = roomFromUrl();
      if (invitedRoom && saved.code !== invitedRoom) return;
      socket.timeout(12000).emit('join', { code: saved.code, token: saved.token }, (err, result) => {
        if (err) return;
        if (result && !result.ok) {
          clearSession();
          error.value = 'La vecchia stanza non è più disponibile. Puoi crearne una nuova.';
        }
      });
    }
    function onState(next) {
      if (!state.value || state.value.round !== next.round ||
          state.value.code !== next.code ||
          (state.value.phase !== 'lobby' && next.phase === 'lobby')) resetRound();
      state.value = next;
      code.value = next.code;
      history.replaceState(null, '', `/?room=${next.code}`);
    }
    function onSession(session) { localStorage.setItem(storageKey, JSON.stringify(session)); }
    function onConnect() { connected.value = true; connecting.value = false; error.value = ''; rejoin(); }
    function onDisconnect() { connected.value = false; connecting.value = true; }
    function onConnectionError() { connected.value = false; connecting.value = false; }
    function onGameError(message) { error.value = String(message); }

    onMounted(() => {
      if (!socket) return;
      socket.on('state', onState);
      socket.on('session', onSession);
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('connect_error', onConnectionError);
      socket.on('game-error', onGameError);
      socket.connect();
    });
    onUnmounted(() => { if (socket) socket.disconnect(); });

    return {
      state, name, code, error, connected, connecting, serverUrl, me, sortedPlayers,
      selected, pairs, reasons, used, odd, canSubmit, playerName, cardName, cardIcon, readyMessage,
      revealedPairs, excludedCards, scoreDialog, scorePlayer, showScore, closeScore,
      create, join, ready, pick, remove, submit, vote, copyInvite, leave, leaving
    };
  },
  template: `
    <main class="shell">
      <header><div class="brand">✦ ODD <span>LOGIC</span></div><small>PARTY GAME ONLINE</small></header>
      <div v-if="!serverUrl" class="alert" role="status">
        Il server multiplayer non è ancora configurato. Pubblica il backend su Render e inserisci il suo URL nel file <b>client/config.js</b>.
      </div>
      <div v-else-if="!connected" class="alert" role="status">
        {{connecting ? 'Connessione al server multiplayer in corso...' : 'Server non raggiungibile. Controlla Render e client/config.js.'}}
      </div>
      <div v-if="error" class="alert" role="alert">{{error}} <button type="button" class="tiny" @click="error=''">✕</button></div>

      <section v-if="!state" class="panel center">
        <h1>Ragioniamo insieme. O quasi.</h1>
        <p>Crea una stanza o entra nella partita dei tuoi amici. Nessun account necessario.</p>
        <label class="input-label" for="nickname">Il tuo nickname</label>
        <input id="nickname" name="nickname" v-model="name" maxlength="30" placeholder="Come ti chiami?" autocomplete="nickname" />
        <button type="button" :disabled="!connected" @click="create">Crea una stanza</button>
        <div class="separator">oppure</div>
        <label class="input-label" for="room-code">Codice della stanza</label>
        <input id="room-code" name="room-code" v-model="code" maxlength="4" placeholder="Es. DXCA" autocapitalize="characters" />
        <button type="button" class="secondary" :disabled="!connected" @click="join">Entra nella stanza</button>
      </section>

      <template v-else>
        <div class="roomline"><span>STANZA <b>{{state.code}}</b></span><span>{{me?.name}} · {{state.players.length}} giocatori</span></div>
        <button type="button" class="secondary" :disabled="!connected || leaving" @click="leave">
          {{leaving ? 'Uscita in corso…' : 'Esci dalla partita'}}
        </button>
        <section v-if="state.phase==='lobby'" class="panel">
          <h1>Sala d'attesa</h1>
          <p>Condividi il codice <b>{{state.code}}</b> con gli altri giocatori.</p>
          <button type="button" class="secondary" @click="copyInvite">Copia link d'invito</button>
          <h2>Partecipanti</h2>
          <div v-for="p in state.players" :key="p.id" class="player">
            <span>● {{p.name}}</span><small>{{p.connected ? (p.ready?'Pronto':'Connesso') : 'Disconnesso'}}</small>
          </div>
          <p class="muted">Da 3 a 6 partecipanti. Quando tutti sono pronti, il server avvia la partita automaticamente.</p>
          <button type="button" :disabled="state.players.length<3 || state.myReady || !connected" @click="ready">
            {{state.myReady ? '✓ Pronto! Attendi gli altri' : 'Sono pronto: iniziamo!'}}
          </button>
          <p class="muted">{{readyMessage}}</p>
        </section>

        <template v-else>
          <div class="round">{{state.phase==='finished'?'Partita conclusa':'Round '+(state.round+1)+' di '+state.totalRounds}}</div>
          <section v-if="state.phase==='playing'" class="panel">
            <h1>Trova due connessioni</h1>
            <p>Seleziona quattro carte per creare due coppie. Una resterà esclusa.</p>
            <div class="cards">
              <button type="button" v-for="(card,i) in state.cards" :key="i" class="gamecard"
                :class="{active:selected.includes(i),used:used.includes(i)}"
                :disabled="!!state.myAnswer || used.includes(i) || pairs.length===2 || !connected" @click="pick(i)">
                <span class="emoji" aria-hidden="true">{{card.emoji}}</span><b>{{card.word}}</b>
              </button>
            </div>
            <template v-if="!state.myAnswer">
              <div v-for="(pair,i) in pairs" :key="i" class="pair">
                <div class="pairtitle"><b>Coppia {{i+1}}: {{cardName(pair[0])}} + {{cardName(pair[1])}}</b>
                  <button type="button" class="tiny" @click="remove(i)">Rimuovi</button></div>
                <label class="input-label" :for="'reason-'+i">Perché sono collegate?</label>
                <input :id="'reason-'+i" :name="'reason-'+i" v-model="reasons[i]" maxlength="80" placeholder="Motivazione" />
              </div>
              <div v-if="pairs.length===2" class="odd">Carta esclusa: <b>{{cardName(odd)}}</b></div>
              <button type="button" :disabled="!canSubmit || !connected" @click="submit">Conferma risposta</button>
            </template>
            <div v-else class="notice">✓ Risposta inviata. Attendi gli altri giocatori.</div>
            <p class="muted">Risposte inviate: {{state.players.filter(p=>p.answered).length}} / {{state.players.length}}</p>
          </section>

          <section v-if="state.phase==='reveal'" class="panel">
            <h1>Le risposte!</h1>
            <div v-for="group in revealedPairs" :key="group.key" class="answer reveal-group">
              <div v-for="response in group.responses" :key="response.id" class="reveal-row">
                <span class="card-icons" role="img" :aria-label="group.cards.map(cardName).join(' + ')">
                  {{group.cards.map(cardIcon).join(' + ')}}
                </span>
                <span>{{response.reason}}</span>
                <b>{{playerName(response.id)}}</b>
              </div>
            </div>
            <h2>Carte escluse</h2>
            <div v-for="item in excludedCards" :key="item.id" class="excluded-row">
              <span class="card-icons" role="img" :aria-label="cardName(item.card)">{{cardIcon(item.card)}}</span>
              <b>{{playerName(item.id)}}</b>
            </div>
            <button type="button" :disabled="state.myReady || !connected" @click="ready">
              {{state.myReady ? '✓ In attesa degli altri' : 'Ho letto le risposte: continua'}}
            </button>
            <p class="muted">{{readyMessage}}</p>
          </section>

          <section v-if="state.phase==='voting'" class="panel">
            <h1>Le motivazioni coincidono?</h1>
            <p>Solo gli altri giocatori votano se due motivazioni della stessa coppia hanno lo stesso significato.</p>
            <div v-for="c in state.comparisons" :key="c.key" class="answer">
              <h2>{{cardName(c.cards[0])}} + {{cardName(c.cards[1])}}</h2>
              <p><b>{{playerName(c.aId)}}:</b> {{c.reasonA}}</p>
              <p><b>{{playerName(c.bId)}}:</b> {{c.reasonB}}</p>
              <template v-if="state.me!==c.aId && state.me!==c.bId">
                <div v-if="c.votes[state.me]===null" class="actions">
                  <button type="button" :disabled="!connected" @click="vote(c,true)">Sì</button>
                  <button type="button" class="secondary" :disabled="!connected" @click="vote(c,false)">No</button>
                </div><small v-else>✓ Hai votato</small>
              </template><small v-else>Non voti sulle tue associazioni.</small>
            </div>
            <p v-if="!state.comparisons.length">Nessuna coppia condivisa: calcolo risultati in corso.</p>
          </section>

          <section v-if="state.phase==='results' || state.phase==='finished'" class="panel">
            <h1>{{state.phase==='finished'?'Classifica finale':'Risultati del round'}}</h1>
            <div v-for="(p,i) in sortedPlayers" :key="p.id" class="player">
              <span>
                <b>{{i+1}}.</b>
                <button v-if="state.roundResults?.[p.id]?.gain > 0" type="button" class="score-name"
                  aria-haspopup="dialog" @click="showScore(p)">{{p.name}}</button>
                <template v-else> {{p.name}}</template>
              </span>
              <span class="score-totals">
                <b v-if="state.roundResults?.[p.id]" class="round-gain"
                  :aria-label="'Punti del round: '+state.roundResults[p.id].gain">+{{state.roundResults[p.id].gain}}</b>
                <b>{{p.score}} pt</b>
              </span>
            </div>
            <dialog ref="scoreDialog" class="panel score-dialog" aria-labelledby="score-title">
              <template v-if="scorePlayer">
                <h2 id="score-title">Punti del round · {{scorePlayer.name}}</h2>
                <div v-for="(detail,i) in state.roundResults?.[scorePlayer.id]?.details" :key="i" class="player">
                  <span>
                    <span aria-hidden="true">{{detail.cards.map(cardIcon).join(' + ')}}</span>
                    {{detail.cards.map(cardName).join(' + ')}} con <b>{{detail.partner}}</b>
                  </span>
                  <b class="round-gain">+{{detail.points}}</b>
                </div>
              </template>
              <button type="button" class="secondary" autofocus @click="closeScore">Chiudi</button>
            </dialog>
            <button type="button" :disabled="state.myReady || !connected" @click="ready">
              {{state.myReady ? '✓ In attesa degli altri' : (state.phase==='finished'?'Nuova partita':'Prossimo round')}}
            </button>
            <p class="muted">{{readyMessage}}</p>
          </section>
        </template>
      </template>
      <footer>Prototipo indipendente · Punteggio sperimentale · Senza registrazione · Le stanze non sono salvate</footer>
    </main>
  `
}).mount('#app');
