# Architettura

La pagina React/Vite è una SPA statica ospitabile su GitHub Pages. Il client carica automaticamente `public/family-archive.enc.json` quando presente, chiede la passphrase a ogni caricamento, decifra con Web Crypto e gestisce temporaneamente i dati in memoria. Può cifrare e scaricare o pubblicare l'archivio. Le relazioni sono dati espliciti e non dedotti dai partner.

Il grafo viene rappresentato con SVG e layout deterministico per generazioni. Le relazioni partner sono raggruppate prima del calcolo dei livelli quando il vincolo resta compatibile con l'ordine genitore-figlio e non introduce cicli; i casi incompatibili conservano la precedenza delle relazioni genitoriali. Il posizionamento tiene unite le coppie, dispone i figli per nucleo di genitori e riordina iterativamente i gruppi secondo la posizione dei genitori e dei figli per ridurre gli incroci. Gli archi genitore-figlio condividono connettori ortogonali per nuclei familiari; i legami partner sono orizzontali quando i nodi sono allineati. Pan, zoom e gesture touch sono gestiti dalla vista. I moduli per modello, validazione, crittografia e API sono separati dall'interfaccia.

`image-config.json` centralizza i limiti di input, l'output normalizzato massimo di 1200 × 1200, la qualità JPEG, le dimensioni delle varianti (albero 128, scheda 800), la concorrenza e i limiti cache. Il ritaglio e l'orientamento EXIF sono elaborati nel browser. Il canvas crea una sola immagine quadrata JPEG normalizzata per persona, senza metadati EXIF/GPS.

La foto normalizzata viene cifrata separatamente con AES-GCM e passphrase derivata tramite PBKDF2; l'archivio cifrato contiene questo envelope associato al campo `photo` della persona. L'apertura dell'archivio non decifra le foto. I componenti visibili richiedono varianti locali generate con Canvas e bitmap, usando una coda a concorrenza limitata; l'albero avvia il lavoro solo quando il nodo interseca la viewport.

Le varianti persistenti sono cifrate prima di essere salvate in IndexedDB. La chiave include ID persona, hash dell'immagine cifrata, dimensione, formato e versione algoritmo; la sostituzione della foto produce quindi una cache key diversa. La passphrase non viene persistita. Un fallback LRU in memoria è limitato dalla stessa configurazione. Blob URL e bitmap temporanei vengono rilasciati, e l'interfaccia può svuotare la cache senza toccare l'archivio.

La pubblicazione atomica di un unico blob cifrato evita riferimenti a immagini esterne mancanti. L'API Contents non offre transazioni: conflitti sono rilevati con SHA e pubblicazioni concorrenti richiedono ripetizione manuale.

Decisione: vedi [ADR 0001](./decisions/0001-static-architecture.md).
