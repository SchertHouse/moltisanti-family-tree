# Sicurezza e modello delle minacce

## Protezioni

L'intero archivio viene cifrato in browser con Web Crypto AES-256-GCM. Ogni cifratura genera IV casuale e salt; PBKDF2-SHA-256 (310.000 iterazioni) deriva la chiave da una passphrase di almeno 12 caratteri, distinta dalla password Admin. L'envelope è versionato e autenticato. L'archivio è limitato a 25 MB. La passphrase e il token GitHub restano in memoria volatile; la passphrase può essere salvata solo con consenso esplicito.

Se l'utente seleziona “Ricorda su questo dispositivo”, la passphrase viene cifrata con AES-GCM usando una chiave Web Crypto non esportabile, generata appositamente e conservata come `CryptoKey` in un database IndexedDB separato dalla cache immagini. In IndexedDB non viene salvata la passphrase in chiaro. All'avvio l'app tenta l'apertura con la credenziale ricordata; se manca o non apre l'archivio, la credenziale non valida viene rimossa quando possibile e viene richiesto l'inserimento manuale. La chiave si può eliminare con “Dimentica chiave salvata”; uscire dalla modalità Admin non la rimuove. In caso di indisponibilità dello storage l'apertura manuale resta possibile.

La chiave e il ciphertext sono entrambi nel profilo locale del browser: questa scelta riduce l'esposizione accidentale dei dati memorizzati in chiaro, ma non è un keychain del sistema operativo e non protegge da malware, accesso al profilo/browser sbloccato o codice malevolo servito dalla stessa origine. Non ricordare la chiave su dispositivi condivisi o non fidati. Il token GitHub non viene mai memorizzato.

## Immagini e cache

La configurazione versionata `image-config.json` è la fonte autorevole dei limiti applicativi. Il massimo corrente è **320 × 320 pixel**, modificabile nel file senza intervenire nel codice; il valore è un tetto, non una dimensione obbligatoria, e immagini più piccole non sono ingrandite. Formati, limite del file in ingresso, qualità JPEG, varianti e limiti cache sono configurabili nello stesso file. La modifica del limite si applica alle nuove normalizzazioni e non ridimensiona retroattivamente foto già cifrate negli archivi.

Le foto selezionate passano dall'editor di ritaglio quadrato prima di entrare nei dati persona. Il file sorgente viene letto da un URL `blob:` temporaneo, poi revocato alla chiusura dell'editor; `createImageBitmap` usa l'orientamento EXIF quando supportato e il canvas produce un JPEG senza i metadati originali, inclusi quelli GPS. Il ritaglio, l'orientamento e il ridimensionamento avvengono localmente nel browser.

La foto normalizzata viene cifrata separatamente con AES-GCM e un salt/IV casuali prima di essere inserita nell'archivio cifrato. Dopo aver aperto l'archivio, i ciphertext delle immagini restano cifrati; la decifratura viene fatta solo per una variante richiesta, con la passphrase valida in memoria. Le vecchie immagini in data URL sono compatibili per la migrazione: al successivo salvataggio vengono centrate in un quadrato, normalizzate, private dei metadati e cifrate. Un archivio con galleria non vuota non viene pubblicato finché le immagini aggiuntive non sono risolte; l'app non le scarta automaticamente.

Le varianti (albero 128 × 128, profilo massimo 320 × 320) sono generate solo on demand e non vengono pubblicate. Se la foto decifrata è già entro le dimensioni richieste, viene restituita direttamente senza Canvas né una copia nella cache delle varianti; le immagini più grandi continuano a essere trasformate e le relative voci persistenti sono cifrate prima di essere salvate in IndexedDB. La relativa chiave deriva dalla passphrase senza essere salvata. La cache è vincolata per numero e byte, usa espulsione LRU e, in caso di indisponibilità/quota, ripiega sulla memoria volatile. La chiave cache include ID persona e hash/versione sorgente, dimensioni, formato e algoritmo, per non riutilizzare varianti dopo la sostituzione di una foto. La cache si può cancellare dall'interfaccia senza cancellare l'archivio.

Le bitmap e gli URL temporanei vengono rilasciati dopo l'elaborazione/visualizzazione. Nell'albero, le foto visibili vengono richieste on demand; quelle fuori dall'area visibile non vengono decifrate né trasformate. L'archivio non viene salvato o pubblicato se la preparazione o la verifica di una delle immagini fallisce. L'export JSON in chiaro decifra anche le foto protette solo dopo conferma e con la passphrase valida; il file esportato è quindi interamente sensibile e non va pubblicato. L'Admin può inoltre esportare GEDZIP 7.0 in chiaro dopo conferma: contiene GEDCOM e immagini (foto e gallerie) in chiaro, richiede la passphrase per le immagini protette e non include i contatti. Il GEDCOM include i nuovi campi personali facoltativi e i dettagli registrati delle unioni (matrimonio/partnership, attuale/conclusa e motivo), anch'essi dati personali. I metadati `_UNION` sono estensioni GEDCOM custom che possono non essere conservate da tutti i programmi genealogici. Il pacchetto risultante è sensibile e non deve essere pubblicato in chiaro.

Lo script locale `npm run images:resize` opera esclusivamente su un JSON già in chiaro e non decifra né l'envelope dell'archivio né le foto cifrate individualmente. Elabora in memoria tutte le foto interessate e sostituisce il file in modo atomico solo dopo il successo completo; non crea copie di backup automatiche. Usare il file in un ambiente locale fidato, conservare manualmente un backup protetto se necessario e ricifrare il risultato nell'app prima di pubblicarlo.

La password iniziale `moltisantitree` è nel bundle pubblico e modificabile: deterrente per modifiche accidentali, non autenticazione. `VITE_ADMIN_PASSWORD` può sovrascriverla a build time, ma il valore finale resta visibile nel bundle e non è un segreto. La passphrase di cifratura non viene mai memorizzata in chiaro né distribuita.

## GitHub

Il token è inserito dall'utente, usato solo come header Authorization per l'API ufficiale e non deve apparire in log/errori. Usare un fine-grained PAT limitato al solo repository e permesso Contents minimo. Chi possiede un token di scrittura può modificare o cancellare i file al di fuori dell'app. Il client non deve mai fare richieste reali nei test.

## Limiti

Viewer con chiave può copiare i dati decifrati. Codice malevolo servito dalla stessa pagina potrebbe sottrarre chiave o dati. AES-GCM non impedisce sostituzione o rollback dell'archivio da parte di chi controlla il repository. GitHub Pages è pubblico; pubblicare solo ciphertext e risorse d'interfaccia. Non usare i dati di demo come dati reali. I backup in chiaro esportati sono dati sensibili.

Le operazioni di salvataggio devono validare, cifrare e verificare localmente il risultato prima della pubblicazione. La pubblicazione di un singolo archivio rende consistente il payload; i conflitti GitHub non sono transazioni e richiedono ricarica/nuovo tentativo.

## Revisione delle minacce

Revisione del 26-10-2026 dei percorsi client-side di validazione/decifratura dell'archivio, cifratura delle immagini, ricordo locale opt-in e pubblicazione GitHub Contents. Non sono state confermate vulnerabilità critiche o ad alto impatto nel perimetro esaminato. Le prove automatizzate mockano la rete; non è stato usato un token né effettuata alcuna pubblicazione reale. Restano valide le limitazioni sopra: uno script malevolo same-origin può leggere i dati e le chiavi mentre l'archivio è aperto; la password Admin è pubblica e non è autenticazione; un PAT con permessi di scrittura può modificare il repository; il client non protegge da rollback/cancellazione dell'archivio o da indisponibilità del servizio. La revisione non costituisce un audit indipendente del browser, GitHub o dell'infrastruttura di hosting.
