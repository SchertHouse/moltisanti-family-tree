# Sicurezza e modello delle minacce

## Protezioni

L'intero archivio viene cifrato in browser con Web Crypto AES-256-GCM. Ogni cifratura genera IV casuale e salt; PBKDF2-SHA-256 (310.000 iterazioni) deriva la chiave da una passphrase di almeno 12 caratteri, distinta dalla password Admin. L'envelope è versionato e autenticato. L'archivio è limitato a 25 MB. La passphrase e il token GitHub restano in memoria volatile; la passphrase può essere salvata solo con consenso esplicito.

Se l'utente seleziona “Ricorda su questo dispositivo”, la passphrase viene cifrata con AES-GCM usando una chiave Web Crypto non esportabile, generata appositamente e conservata come `CryptoKey` in un database IndexedDB separato dalla cache immagini. In IndexedDB non viene salvata la passphrase in chiaro. All'avvio l'app tenta l'apertura con la credenziale ricordata; se manca o non apre l'archivio, la credenziale non valida viene rimossa quando possibile e viene richiesto l'inserimento manuale. La chiave si può eliminare con “Dimentica chiave salvata”; uscire dalla modalità Admin non la rimuove. In caso di indisponibilità dello storage l'apertura manuale resta possibile.

La chiave e il ciphertext sono entrambi nel profilo locale del browser: questa scelta riduce l'esposizione accidentale dei dati memorizzati in chiaro, ma non è un keychain del sistema operativo e non protegge da malware, accesso al profilo/browser sbloccato o codice malevolo servito dalla stessa origine. Non ricordare la chiave su dispositivi condivisi o non fidati. Il token GitHub non viene mai memorizzato.

## Immagini e cache

La configurazione versionata `image-config.json` è la fonte autorevole dei limiti applicativi. Il massimo iniziale è **1200 × 1200 pixel**, modificabile nel file senza intervenire nel codice; il valore è un tetto, non una dimensione obbligatoria, e immagini più piccole non sono ingrandite. Formati, limite del file in ingresso, qualità JPEG, varianti e limiti cache sono configurabili nello stesso file.

Le foto selezionate passano dall'editor di ritaglio quadrato prima di entrare nei dati persona. Il file sorgente viene letto da un URL `blob:` temporaneo, poi revocato alla chiusura dell'editor; `createImageBitmap` usa l'orientamento EXIF quando supportato e il canvas produce un JPEG senza i metadati originali, inclusi quelli GPS. Il ritaglio, l'orientamento e il ridimensionamento avvengono localmente nel browser.

La foto normalizzata viene cifrata separatamente con AES-GCM e un salt/IV casuali prima di essere inserita nell'archivio cifrato. Dopo aver aperto l'archivio, i ciphertext delle immagini restano cifrati; la decifratura viene fatta solo per una variante richiesta, con la passphrase valida in memoria. Le vecchie immagini in data URL sono compatibili per la migrazione: al successivo salvataggio vengono centrate in un quadrato, normalizzate, private dei metadati e cifrate. Un archivio con galleria non vuota non viene pubblicato finché le immagini aggiuntive non sono risolte; l'app non le scarta automaticamente.

Le varianti (albero 128 × 128, profilo massimo 800 × 800) sono generate solo on demand e non vengono pubblicate. IndexedDB contiene soltanto ciphertext di varianti; la relativa chiave deriva dalla passphrase senza essere salvata. La cache è vincolata per numero e byte, usa espulsione LRU e, in caso di indisponibilità/quota, ripiega sulla memoria volatile. La chiave cache include ID persona e hash/versione sorgente, dimensioni, formato e algoritmo, per non riutilizzare varianti dopo la sostituzione di una foto. La cache si può cancellare dall'interfaccia senza cancellare l'archivio.

Le bitmap e gli URL temporanei vengono rilasciati dopo l'elaborazione/visualizzazione. L'archivio non viene salvato o pubblicato se la preparazione o la verifica di una delle immagini fallisce. L'export JSON in chiaro decifra anche le foto protette solo dopo conferma e con la passphrase valida; il file esportato è quindi interamente sensibile e non va pubblicato.

La password iniziale `moltisantitree` è nel bundle pubblico e modificabile: deterrente per modifiche accidentali, non autenticazione. `VITE_ADMIN_PASSWORD` può sovrascriverla a build time, ma il valore finale resta visibile nel bundle e non è un segreto. La passphrase di cifratura non viene mai memorizzata in chiaro né distribuita.

## GitHub

Il token è inserito dall'utente, usato solo come header Authorization per l'API ufficiale e non deve apparire in log/errori. Usare un fine-grained PAT limitato al solo repository e permesso Contents minimo. Chi possiede un token di scrittura può modificare o cancellare i file al di fuori dell'app. Il client non deve mai fare richieste reali nei test.

## Limiti

Viewer con chiave può copiare i dati decifrati. Codice malevolo servito dalla stessa pagina potrebbe sottrarre chiave o dati. AES-GCM non impedisce sostituzione o rollback dell'archivio da parte di chi controlla il repository. GitHub Pages è pubblico; pubblicare solo ciphertext e risorse d'interfaccia. Non usare i dati di demo come dati reali. I backup in chiaro esportati sono dati sensibili.

Le operazioni di salvataggio devono validare, cifrare e verificare localmente il risultato prima della pubblicazione. La pubblicazione di un singolo archivio rende consistente il payload; i conflitti GitHub non sono transazioni e richiedono ricarica/nuovo tentativo.
