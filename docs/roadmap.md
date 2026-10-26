# Roadmap

Stato verificato per l'implementazione corrente; non sostituisce l'esecuzione dei test dell'ambiente CI.

## Implementato

- [x] Scaffold SPA React/Vite con TypeScript strict e CI GitHub Pages.
- [x] Modello versione 1, validazione, archivio AES-256-GCM/PBKDF2, import con riepilogo ed export JSON cifrato/in chiaro e GEDZIP 7.0 con foto/gallerie in chiaro, passphrase ove necessaria e conferma.
- [x] Caricamento automatico dell'archivio cifrato pubblicato nel percorso previsto e controllo degli asset in build.
- [x] Ricordo facoltativo della passphrase cifrata in IndexedDB con chiave non esportabile, apertura automatica, fallback manuale e rimozione.
- [x] Pubblicazione GitHub Contents dell'archivio cifrato singolo con SHA per aggiornamento e segnalazione conflitti; riuso della chiave attiva o cifratura con nuova passphrase.
- [x] Ritaglio quadrato delle fotografie prima di associarle a un profilo.
- [x] Normalizzazione immagini configurabile (massimo iniziale 1200 × 1200), cifratura individuale, varianti generate on demand, concorrenza limitata e cache IndexedDB cifrata con fallback volatile e controllo UI.
- [x] Layout genealogico raggruppato: partner compatibili allineati, figli organizzati per insieme di genitori, coordinate basate sulle larghezze reali e sugli endpoint effettivi delle relazioni, livelli ordinati per ridurre gli incroci e archi familiari ortogonali condivisi.
- [x] Mantenere contigui nel layout i fratelli con lo stesso insieme di genitori, evitando connettori che attraversino rami estranei.
- [x] Convergenza iterativa di ordinamento e posizioni, con passaggi direzionali e test di allineamento per famiglie ramificate.
- [x] Selezione ricercabile e navigabile da tastiera della persona nel modulo per aggiungere legami.
- [x] Prima interfaccia responsive per consultazione, ricerca, gestione locale e relazioni.
- [x] Visualizzazione fullscreen dell'area dell'albero con uscita tramite pulsante o tasto Escape.
- [x] Traduzioni `it`, `en`, `eo` e documentazione di architettura e sicurezza.
- [x] Deduplicazione dell'elenco fratelli/sorelle quando condividono più di un genitore.
- [x] Ricerca dei fratelli/sorelle deduplicata per ID persona, mantenendo l'ordine di prima apparizione.
- [x] Rimozione amministrativa dei singoli legami familiari con conferma, senza eliminare le persone coinvolte.
- [x] Campi opzionali persona per nome alternativo, sesso alla nascita, professione, residenza e nazionalità, inclusa esportazione GEDCOM/GEDZIP.
- [x] Deselezione tramite tocco/click sullo sfondo dell'albero e scroll della scheda di dettaglio in landscape con dettagli laterali.
- [x] Etichetta compatta per la data di morte, senza indicazione ridondante dell'opzionalità.
- [x] Conservare pan e zoom correnti quando si deseleziona una persona toccando lo sfondo dell'albero.
- [x] Navigazione spaziale tra i nodi con le frecce e indicatore di focus da tastiera distinto dalla selezione tramite puntatore.
- [x] Ricaricare le immagini visibili nell'albero dopo aver svuotato la cache delle varianti.
- [x] Inserire automaticamente i separatori nelle date digitando soltanto le cifre, mantenendo il supporto alle date parziali di solo anno.
- [x] Calcolo del percorso di parentela registrato dalla scheda persona verso un'altra persona ricercabile.

## Da completare

- [ ] Test E2E reali multi-browser e touch su dispositivi.
- [ ] Import/export ZIP e anteprima differenze prima dell'import.
- [ ] Riepilogo per date di compleanno parziali (le date complete includono il calcolo dell'anno bisestile).
- [ ] Gallerie fotografiche per profilo (il ritaglio quadrato della foto principale è implementato).
- [ ] Audit accessibilità, prestazioni su alberi grandi e threat review prima del rilascio.

## Limitazioni

Base iniziale senza dati demo per non rischiare di distribuire dati personali. Verifiche locali dipendono da Node/npm; la CI è il gate per la pubblicazione. L'API Contents pubblica un singolo archivio e non fornisce transazioni.
