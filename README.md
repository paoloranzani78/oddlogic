# Odd Logic Online — un solo repository per Netlify e Render

Gioco web multiplayer indipendente per **3–6 persone**, senza account e senza database. Ognuno usa il proprio telefono. Le carte sono parole originali con emoji dimostrative (illustrazioni definitive da realizzare).

## Alberatura del repository

```text
odd-logic-online/
├── .gitignore
├── README.md
├── netlify.toml          # Frontend statico su Netlify
├── render.yaml           # Backend Node.js su Render
├── client/
│   ├── index.html
│   ├── main.js
│   ├── style.css
│   ├── config.js         # Inserire qui l'URL Render
│   └── _redirects
└── server/
    ├── package.json
    ├── .env.example
    ├── src/
    │   ├── index.js      # Express + Socket.IO + stanze
    │   ├── deck.js       # Mazzo dimostrativo originale
    │   └── scoring.js    # Punteggio sperimentale
    └── test/
        └── scoring.test.js
```

## A. GitHub — carica tutto il progetto

1. Crea un repository GitHub vuoto, chiamato `oddlogic` (privato o pubblico).
2. Estrai lo ZIP, entra nella cartella `odd-logic-online` e carica **tutti i file e le cartelle contenuti**, mantenendo `client/`, `server/`, `netlify.toml`, `render.yaml` e `README.md` nella radice del repository.
3. In GitHub fai **Add file > Upload files > Commit changes**.

## B. Render — prima pubblica il server

1. In Render crea **New > Blueprint** e collega lo stesso repository GitHub (usa `render.yaml`). In alternativa crea un **Web Service** con:
   - Root directory: `server`
   - Runtime: `Node`
   - Build command: `npm install --omit=dev`
   - Start command: `npm start`
   - Health check: `/health`
   - Variabile `CLIENT_ORIGIN`: `https://oddlogic.netlify.app` (senza `/` finale)
2. Prendi l'URL HTTPS assegnato da Render, ad esempio `https://nome-servizio.onrender.com`.
3. Visita `<URL_RENDER>/health`: deve rispondere con JSON contenente `"ok": true`.

**Importante:** su servizi gratuiti con sospensione o riavvio, le partite in RAM possono andare perse.

## C. Netlify — frontend dallo stesso repository GitHub

1. In Netlify scegli **Add new project > Import an existing project** e collega lo stesso repository GitHub.
2. `netlify.toml` contiene già:
   - Build command: `echo 'Odd Logic: frontend statico, nessuna build richiesta'`
   - Publish directory: `client`
3. Apri `client/config.js` su GitHub, sostituisci la stringa vuota con l'URL di Render e salva il commit, per esempio:

   ```js
   window.ODD_LOGIC_SERVER_URL = 'https://IL-TUO-SERVER.onrender.com';
   ```

   Netlify pubblicherà la nuova versione automaticamente.
4. Verifica che `https://oddlogic.netlify.app/config.js` contenga l'URL reale. Ora **Crea una stanza** si collegherà a Render.

### Se preferisci continuare con il caricamento manuale su Netlify

Puoi caricare **solo il contenuto della cartella `client/`**, direttamente nella radice del sito. Non caricare la cartella `server/` su Netlify. Prima modifica `client/config.js` con l'URL di Render e poi carica la cartella aggiornata.

## D. Prova in locale

Richiede Node.js 20+:

```bash
cd server
npm install
npm start
```

Apri `http://localhost:3001/health`. Per provare il frontend locale, modifica temporaneamente `client/config.js` con `http://localhost:3001` e servi `client/` usando un server statico sulla porta 8080 (per esempio `python -m http.server 8080` dalla directory `client/`).

## Flusso di gioco

- Un giocatore crea una stanza, gli altri entrano con il codice di quattro lettere (per esempio `DXCA`).
- Tutti premono **Sono pronto** (non esiste un giocatore amministratore): con almeno tre partecipanti il server avvia il turno.
- Ciascuno forma due coppie, motiva le associazioni ed esclude una carta.
- Dopo l'invio di tutte le risposte, ogni giocatore conferma di aver letto le risposte per passare alle votazioni.
- Gli altri partecipanti votano l'equivalenza delle motivazioni.
- Il server calcola la classifica e tutti confermano il passaggio al round seguente.
- Cinque round, poi classifica finale. Possibilità di nuova partita.

## Punteggi e limitazioni

**Punteggio sperimentale**: +1 a ciascuno per ogni coppia condivisa con un altro giocatore. Le motivazioni identiche ignorando maiuscole e minuscole danno automaticamente +1 bonus. Per motivazioni diverse, il bonus richiede il voto favorevole della maggioranza stretta degli altri giocatori.

- Il mazzo contiene 6 combinazioni di cinque carte, con emoji segnaposto per future illustrazioni originali.
- Stanze, risposte e punteggi sono solo in RAM; si perdono dopo un riavvio di Render.
- Se un giocatore perde la connessione può rientrare dallo stesso browser con un token nel `localStorage`. L'attesa di un giocatore assente può bloccare un round.
- **Vue viene caricato dal CDN** (build con compilatore template) e Socket.IO Client da `esm.sh`: il frontend richiede Internet. Questa scelta elimina Vite e gli errori `vite: not found` durante i deploy statici.
- In caso di nuovo URL Netlify, aggiorna `CLIENT_ORIGIN` su Render.

## Test del punteggio

```bash
cd server
npm test
```
