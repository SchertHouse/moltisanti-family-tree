# Requisiti

## Obiettivo

Consultazione e gestione responsive di un albero genealogico privato, pubblicabile come sito statico senza backend tradizionale.

## Funzioni

- Albero interattivo, schede persona, ricerca e filtri per generazione.
- Relazioni genitore-figlio e partner indipendenti.
- Nel layout, allineare i partner quando compatibile con le generazioni, raggruppare i figli per genitori comuni e ridurre gli incroci con connettori familiari condivisi; preservare i dati originali nei casi incompatibili.
- Modifica Admin separata dalla consultazione Viewer.
- Nell'interfaccia italiana, inserire e mostrare le date complete nel formato `DD-MM-YYYY`; mantenere le date ISO nell'archivio e usare formati localizzati per le altre lingue.
- Prima di associare una fotografia a una persona, mostrare un editor di ritaglio quadrato utilizzabile con mouse e touch, con anteprima, spostamento e ridimensionamento della selezione. Correggere l'orientamento EXIF se supportato dal browser, normalizzare nel browser e non conservare i metadati originali. Validare tipo e dimensione in ingresso in base alla configurazione.
- Normalizzare le immagini in JPEG nel browser, senza ingrandirle, con un massimo iniziale di **1200 × 1200 pixel**. `image-config.json` è la fonte versionata e autorevole per limiti, qualità, varianti e cache, ed è modificabile senza cambiare il codice applicativo.
- Salvare una sola immagine normalizzata cifrata per persona nell'archivio cifrato; non pubblicare originali, immagini in chiaro o varianti. La cifratura avviene nel browser con la passphrase e la relazione immagine-persona usa l'ID stabile.
- Non copiare il file originale, l'immagine normalizzata in chiaro o file temporanei nel repository, nell'archivio pubblicato o in storage persistenti del browser; il sorgente resta solo in memoria volatile fino al termine dell'elaborazione.
- Generare le varianti soltanto quando l'interfaccia ne ha bisogno: albero circa 128 × 128 e scheda persona fino a 800 × 800. Caricare progressivamente le foto visibili, limitare i processi simultanei e rilasciare bitmap e Blob URL temporanei.
- Memorizzare le varianti persistenti esclusivamente cifrate in IndexedDB, con chiavi derivate dalla passphrase non salvate sul dispositivo. La chiave cache include ID persona, hash/versione sorgente, dimensioni, formato e algoritmo. Limitare e sfrattare le voci meno usate; usare una cache volatile in memoria se IndexedDB non è disponibile. La UI consente di svuotare la cache senza modificare l'archivio.
- Offrire facoltativamente il ricordo della passphrase, solo su consenso: cifrarla con Web Crypto e conservarla con una `CryptoKey` non esportabile in uno store IndexedDB separato. Non salvarla mai in chiaro o in local/session storage. Tentare l'apertura automatica e richiedere l'inserimento manuale se manca o non funziona; consentire di dimenticare la chiave salvata.
- Non decifrare né generare tutte le foto all'apertura dell'archivio. Verificare e preparare tutte le immagini prima di completare un salvataggio o una pubblicazione; in caso di errore mantenere invariato l'archivio pubblicato.
- Archivi JSON cifrati prima di download o pubblicazione; immagini incluse nell'archivio cifrato.
- Import/export, tre lingue, GitHub Pages e pubblicazione opzionale tramite API.

## Requisiti non funzionali

TypeScript strict, browser moderni, layout touch/responsive, accessibilità da tastiera, nessun dato personale in chiaro nel deploy. Token e passphrase restano in memoria salvo ricordo cifrato esplicitamente richiesto. Il ricordo locale non è un keychain del sistema operativo e non protegge da codice malevolo same-origin o da un browser/profilo già sbloccato. Nessun backend o servizio a pagamento.

## Stato

L'implementazione corrente copre la base d'architettura e le funzionalità riportate come complete in `roadmap.md`. Tra le limitazioni note del primo incremento: archivio singolo senza manifest/rollback, import/export ZIP assente, galleria non gestita dall'interfaccia, date di compleanno incomplete escluse e test touch solo tramite controlli manuali/browser. Consultare la roadmap prima di considerare il prodotto pronto al rilascio.
