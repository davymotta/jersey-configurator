# Jersey — Design to production

Workspace SaaS per fabbricanti di teamwear DTC: il cliente crea il design, lo vede su un modello 3D e invia una richiesta con taglie e quantità. Il fabbricante approva l'ordine con un cartamodello verificato e scarica il pacchetto dei pannelli per la prestampa sublimatica.

Questa versione è un MVP funzionante da validare con un fabbricante pilota. Non è ancora un SaaS commerciale completo: abbonamenti, pagamenti, verifica email e recupero password non sono implementati.

## Avvio

Richiede **Node.js 24+** (usa `node:sqlite`) e **pnpm 11.25+**.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Apri `http://localhost:3000`. Crea un workspace oppure scegli **Esplora la demo**. Ogni demo crea dati di esempio separati, senza accesso all'AI e senza condividere i dati degli altri visitatori. Non contiene ordini o cartamodelli di produzione inventati.

Il database viene creato automaticamente in `data/jersey.sqlite`, con WAL e foreign key. Account, sessioni, design, grafiche, cartamodelli e ordini persistono sul disco. Questa implementazione usa SQLite, non il vecchio scaffold Drizzle/MySQL.

## Percorso di utilizzo

1. Il fabbricante registra il proprio workspace. In **Impostazioni** definisce prezzo indicativo in EUR e minimo d'ordine.
2. Condivide `/store/<slug>` con i clienti. La registrazione da quel link crea un cliente nel suo workspace, senza permessi di produzione.
3. Il cliente sceglie calcio, cricket o corporate, modifica palette e pattern, aggiunge squadra, nome e numero. Può caricare PNG/JPEG o generare una grafica se il servizio AI è configurato.
4. Il cliente salva e invia una **richiesta d'ordine**: quantità per taglia, contatti, consegna e note. Non viene addebitato alcun pagamento. Prezzo finale, IVA, spedizione e tempi sono da confermare con il fabbricante.
5. Il fabbricante importa e approva il proprio cartamodello, seleziona la revisione per l'ordine e approva la richiesta. Il sistema blocca l'approvazione se mancano taglie, la categoria non corrisponde o la grafica raster ha DPI insufficienti.
6. Il fabbricante scarica il pacchetto ZIP e avanza l'ordine: approvato → in produzione → spedito. È possibile annullare una richiesta o un ordine approvato.

Nome e numero valgono per tutti i capi dell'ordine. Le distinte con nomi/numeri diversi per ogni atleta e gli ordini con più design richiedono un'estensione dedicata; oggi si crea un design/ordine per ciascuna personalizzazione.

## Anteprima e cartamodello

Il modello Three.js è un volume illustrativo ruotabile con fronte, retro e grafica condivisa con l'anteprima 2D. Non è una simulazione fisica, un capo drappeggiato dal CAD o una verifica di vestibilità. Le tre categorie condividono la silhouette; colletti specifici e modelli GLB dei singoli prodotti vanno ancora collegati.

L'esportazione del concept è distinta dal pacchetto produttivo. La silhouette 3D **non viene trasformata automaticamente in un cartamodello**.

In **Cartamodelli → Esempio di formato** si scarica il formato JSON. L'esempio contiene rettangoli esplicativi, è non approvato e non va usato per tagliare un capo. Per ogni taglia reale servono quattro pannelli con chiavi `front`, `back`, `left-sleeve`, `right-sleeve`:

```json
{
  "key": "front",
  "widthMm": 550,
  "heightMm": 720,
  "cutPath": "M0 0H550V720H0Z"
}
```

Il blocco sopra illustra i campi, non un cartamodello indossabile. `cutPath` è un tracciato SVG chiuso in coordinate millimetriche positive, entro `widthMm` e `heightMm`. Il JSON completo contiene nome, categoria, revisione, tessuto, `bleedMm`, `minDpi`, approvazione e array di taglie. Sono verificati formato, chiusura, bounding box, pannelli unici e taglie uniche; la correttezza sartoriale richiede la verifica del fabbricante.

La linea caricata è la **linea di taglio**: i margini di cucitura devono essere già presenti nelle geometrie. Non vengono generati grading, margini di cucitura, compensazione di ritiro, piazzamento/nesting o conversioni DXF. Occorre esportare i contorni dal CAD e convertirli nel formato descritto.

## Pacchetto produzione

Disponibile solo al fabbricante per ordini approvati, in produzione o spediti:

- `order.json`: copia confermata di design, quantità, contatti, valore e cronologia.
- `pattern.json`: cartamodello congelato all'approvazione con hash SHA-256.
- `quantities.csv`: quantità per taglia; lo stesso design si applica a ogni capo.
- `preview-front.svg`, `preview-back.svg`: grafiche piatte di riferimento.
- `panels/<taglia>/<pannello>.svg`: geometrie alle misure fisiche dichiarate, grafica RGB e abbondanza specificata.
- `READ-ME.txt`: istruzioni di prestampa.

La guida di taglio magenta è nel gruppo `CUT_GUIDE_REMOVE_BEFORE_RIP`, da rimuovere prima di rasterizzare/stampare. I testi SVG vanno convertiti in tracciati con il font scelto in prestampa. Il fabbricante applica profilo ICC, eventuale specchiatura, nesting e impostazioni del RIP, e controlla misure, abbondanze, allineamenti delle cuciture e prova colore prima della tiratura. Il pacchetto è un passaggio alla prestampa, non un file RIP certificato.

La grafica viene adattata a ogni pannello: corrispondenza continua dei motivi tra cuciture e piazzamento diverso per ogni pannello non sono ancora disponibili. Queste funzioni e la mappatura UV dei modelli reali sono necessarie per prodotti che richiedono registrazione precisa fra pannelli.

## AI

Configura `OPENAI_API_KEY` sul server per abilitare la chiamata reale a OpenAI `gpt-image-1`. La chiave non viene inviata al browser. Il prompt e la categoria del prodotto vengono inviati a OpenAI; gli altri dati dell'ordine non vengono inclusi nella richiesta. Le generazioni usano il conto collegato alla chiave. In assenza della chiave il pulsante è disabilitato e l'API restituisce un errore esplicito.

Le immagini generate sono concept da 1024×1024 px. Il sistema usa un controllo DPI conservativo, considerando ritaglio verticale e dimensione fisica dei pannelli. I concept normalmente non raggiungono i DPI per un capo adulto: prima della produzione occorre caricare una grafica sufficientemente grande o passare ai pattern vettoriali. Il caricamento accetta PNG/JPEG fino a 20 MB; non esegue upscaling e non inventa dettagli di stampa.

## Sicurezza e distribuzione

Password con scrypt e salt casuale, sessioni opache con hash nel database, cookie HttpOnly/SameSite, scadenza a sette giorni e revoca al logout. Le API verificano tenant e ruolo sul server, richiedono JSON e controllano l'origine delle scritture. Gli aggiornamenti dei design usano revisioni per evitare sovrascritture concorrenti. Gli ordini usano chiavi di idempotenza e prezzi calcolati sul server; design e cartamodello vengono congelati nei rispettivi passaggi. Il sistema non permette al cliente di modificare stati o esportare pacchetti di produzione.

Per una singola istanza con volume persistente:

```sh
pnpm build
APP_ORIGIN=https://jersey.example.com SQLITE_PATH=/var/lib/jersey/jersey.sqlite pnpm start
```

Configura HTTPS con reverse proxy e, solo se il proxy è fidato e a un singolo hop, `TRUST_PROXY=1`. `APP_ORIGIN` deve corrispondere esattamente all'origine pubblica, senza slash finale. Il processo di produzione richiede HTTPS e cookie Secure. Non esporre il server di sviluppo in produzione. Il database e i suoi WAL contengono dati dei clienti e vanno conservati su un volume privato, con backup SQLite consistenti e controllo degli accessi.

SQLite e limiti di frequenza in memoria sono una scelta per l'istanza pilota. Prima di più repliche servono database condiviso, object storage per le grafiche, rate limiting e coda AI distribuiti. Le demo persistono nel database fino alla rimozione amministrativa: definire pulizia e retention prima dell'accesso pubblico. Il recupero degli account oggi richiede intervento amministrativo; non invitare utenti commerciali prima di aggiungere recupero password, verifica email, osservabilità e politiche di conservazione/cancellazione.

## Verifiche

```sh
pnpm check
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

I test API coprono isolamento dei tenant, ruoli cliente/fabbricante, login/logout, origine delle richieste, idempotenza, copie immutabili, conflitti di revisione, minimi d'ordine, stato della produzione, validazione delle geometrie, esportazione ZIP e DPI. I test browser percorrono demo, modifica in 3D/2D, salvataggio, ordine, cartamodello, approvazione, ZIP, produzione, viewport mobile e registrazione cliente da link dedicato. Gli screenshot vengono salvati in `artifacts/`.

Il codice attivo è in `client/src`, `server/index.ts`, `server/saas` e `shared/production.ts`. Il repository conserva anche i file del prototipo originale alla radice e lo scaffold Manus in `server/_core`; non costituiscono il flusso di autenticazione o produzione di questa versione. I vecchi utenti MySQL non vengono migrati automaticamente.
