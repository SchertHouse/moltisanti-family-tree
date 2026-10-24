# Sviluppo

Richiede Node.js 22+ e npm. Installare con `npm ci`; avviare `npm run dev`; controllare con `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run check:dist`. Test di crittografia usano Web Crypto; i test GitHub mockano la rete.

Usare componenti piccoli e TypeScript strict; niente stringhe UI nei componenti salvo eccezioni tecniche. La configurazione immagini autorevole è `image-config.json`: input massimo 8 MiB, massimo normalizzato iniziale 1200 × 1200, senza upscaling, JPEG qualità 0.9, varianti albero 128 e scheda 800, due elaborazioni simultanee e cache massima 200 voci/30 MiB. Modificare i limiti in quel file e non duplicarli nel codice.

Il ritaglio quadrato, orientamento EXIF, rimozione metadati e normalizzazione restano nel browser. Testare geometria, risoluzione, output e migrazione/cifratura per immagine. Le varianti vanno generate on demand, cifrate prima di IndexedDB e riutilizzate solo con passphrase valida; mantenere una cache temporanea limitata per i browser senza IndexedDB. Testare invalidazione delle chiavi al cambio sorgente, errori di decifratura e fallback cache. Rilasciare bitmap e URL temporanei.

Non usare dati reali nei test. Nessuna chiamata API esterna o commit nei test. Le traduzioni devono avere set di chiavi coerente in `it`, `en`, `eo`.
