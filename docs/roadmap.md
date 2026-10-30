# Roadmap

Stato verificato per l'implementazione corrente; non sostituisce l'esecuzione dei test dell'ambiente CI.

## Implementato

- [x] Scaffold SPA React/Vite con TypeScript strict e CI GitHub Pages.
- [x] Modello versione 1, validazione, archivio AES-256-GCM/PBKDF2, import con riepilogo ed export JSON cifrato/in chiaro e GEDZIP 7.0 con foto/gallerie in chiaro, passphrase ove necessaria e conferma.
- [x] Caricamento automatico dell'archivio cifrato pubblicato nel percorso previsto e controllo degli asset in build.
- [x] Ricordo facoltativo della passphrase cifrata in IndexedDB con chiave non esportabile, apertura automatica, fallback manuale e rimozione.
- [x] Pubblicazione GitHub Contents dell'archivio cifrato singolo con SHA per aggiornamento e segnalazione conflitti; riuso della chiave attiva o cifratura con nuova passphrase.
- [x] Ritaglio quadrato delle fotografie prima di associarle a un profilo.
- [x] Normalizzazione immagini configurabile (massimo corrente 320 × 320), cifratura individuale, variante profilo fino a 320 px usata direttamente se la sorgente rientra nel limite, varianti on demand, concorrenza limitata e cache IndexedDB cifrata con fallback volatile e controllo UI.
- [x] Utility locale per ridimensionare in-place foto profilo e gallerie in JSON in chiaro, con limiti configurabili per esecuzione, ritaglio centrale, nessun upscaling, output atomico e rifiuto esplicito degli input cifrati.
- [x] Layout genealogico raggruppato: partner attuali e matrimoni (anche conclusi) compatibili allineati, partnership concluse mostrate come legami storici, figli organizzati per insieme di genitori, livelli ordinati per ridurre gli incroci e archi familiari ortogonali condivisi; matrimoni conclusi con cuore spezzato solo per divorzio, annullamento, separazione o altro motivo.
- [x] Mantenere contigui nel layout i fratelli con lo stesso insieme di genitori e quelli che condividono almeno un genitore anche con co-genitori diversi; centrare il genitore condiviso, disporre i co-genitori all'esterno, sfalsare le uscite, innestare i tronchi sui bus senza inversioni, ordinare i figli per endpoint, instradare su corsie distinte i bus sovrapposti, marcare gli incroci inevitabili con ponti grafici e collegare i nuclei con un solo figlio tramite una discesa verticale, prolungando il bus con un solo angolo quando necessario.
- [x] Deviare con una curva cubica le linee delle unioni che altrimenti passerebbero dietro le schede di altre persone, con tangenti a 45° dagli angoli e senza spigoli; posizionare il cuore sul percorso e mantenere il bus dei discendenti distanziato 20 unità dalle schede.
- [x] Convergenza iterativa di ordinamento e posizioni, con passaggi direzionali e test di allineamento per famiglie ramificate.
- [x] Selezione ricercabile e navigabile da tastiera della persona nel modulo per aggiungere legami.
- [x] Prima interfaccia responsive per consultazione, ricerca, gestione locale e relazioni.
- [x] Visualizzazione fullscreen dell'area dell'albero con uscita tramite pulsante o tasto Escape.
- [x] Traduzioni `it`, `en`, `eo` e documentazione di architettura e sicurezza.
- [x] Deduplicazione dell'elenco fratelli/sorelle quando condividono più di un genitore.
- [x] Ricerca dei fratelli/sorelle deduplicata per ID persona, mantenendo l'ordine di prima apparizione.
- [x] Rimozione amministrativa dei singoli legami familiari con conferma, senza eliminare le persone coinvolte.
- [x] Campi opzionali persona per nome alternativo, sesso alla nascita, professione, residenza e nazionalità, inclusa esportazione GEDCOM/GEDZIP.
- [x] Unioni distinte tra matrimonio e partnership, attuali o concluse con motivo facoltativo; retrocompatibilità dei legami `partner` preesistenti e mapping GEDCOM/GEDZIP con metadati `_UNION`.
- [x] Deselezione tramite tocco/click sullo sfondo dell'albero e scroll della scheda di dettaglio in landscape con dettagli laterali.
- [x] Etichetta compatta per la data di morte, senza indicazione ridondante dell'opzionalità.
- [x] Conservare pan e zoom correnti quando si deseleziona una persona toccando lo sfondo dell'albero.
- [x] Navigazione spaziale tra i nodi con le frecce e indicatore di focus da tastiera distinto dalla selezione tramite puntatore.
- [x] Ricaricare le immagini visibili nell'albero dopo aver svuotato la cache delle varianti.
- [x] Caricare automaticamente on demand le foto dei nodi visibili nell'albero calcolando l'intersezione con la viewport dopo pan/zoom; mantenere `IntersectionObserver` come fallback per i nodi fuori vista senza dipendere dalle notifiche di intersezione SVG dei browser.
- [x] Inserire automaticamente i separatori nelle date digitando soltanto le cifre, mantenendo il supporto alle date parziali di solo anno.
- [x] Riepilogo compleanno per date complete e mese noto (`YYYY-MM`), senza inventare un giorno; il solo anno non produce un promemoria. Il 29 febbraio ricorre al successivo anno bisestile.
- [x] Calcolo del percorso di parentela registrato, della tipologia e del grado consanguineo in linea retta e collaterale, con termini gender-aware e cugini di grado arbitrario; affinità tramite unioni registrate e percorso esplicito per i collegamenti indiretti non classificabili, senza attribuire loro un grado consanguineo né dedurre legami non registrati.
- [x] Selezione della persona da confrontare direttamente dall'albero tramite il pulsante mirino accanto alla ricerca di parentela.
- [x] Cancellazione della persona confrontata dal selettore di parentela con un pulsante accessibile.
- [x] Suite E2E Playwright per Chromium, Firefox e WebKit desktop e per viewport touch-emulate Chromium/WebKit; i test isolano l'archivio e bloccano le richieste GitHub.
- [x] Verifiche pre-rilascio del codice: focus da tastiera confinato nei dialoghi e ripristinato all'apertura, controlli accessibili etichettati, movimento ridotto, viewport stretto senza overflow, layout misurato fino a 5.000 persone e threat review dei percorsi client-side e di pubblicazione. Nessuna vulnerabilità critica o ad alto impatto confermata nel perimetro esaminato.

## Da completare

- [ ] Verifica manuale dei flussi touch su telefoni e tablet fisici; l'emulazione browser non sostituisce dispositivi reali.

## Limitazioni

Base iniziale senza dati demo per non rischiare di distribuire dati personali. Non sono pianificati un formato generico ZIP con anteprima differenze d'importazione né un'interfaccia per gestire gallerie fotografiche: l'import e l'export ordinari restano JSON, insieme all'export GEDZIP già disponibile. La CI esegue la matrice browser; la verifica touch su hardware fisico resta manuale. L'API Contents pubblica un singolo archivio e non fornisce transazioni.
