# Guida operativa per agenti

Prima di ogni modifica leggere questo file e i documenti pertinenti in `docs/`. Non alterare requisiti di sicurezza in modo implicito né introdurre servizi a pagamento. Segnalare le contraddizioni prima di procedere. Aggiornare documentazione e roadmap quando cambia il comportamento.

## Progetto e architettura

SPA statica React + TypeScript strict + Vite. L'archivio JSON versionato viene cifrato nel browser con Web Crypto AES-256-GCM e PBKDF2. Nessun backend o database; GitHub Pages serve l'app e l'API REST ufficiale Contents pubblica esclusivamente il file cifrato, a scelta dell'admin.

## Struttura

- `src/`: interfaccia, moduli dati/cifratura/pubblicazione e traduzioni.
- `docs/`: requisiti, architettura, sicurezza, sviluppo, deployment, modello dati, i18n, roadmap e ADR.
- `.github/workflows/`: CI e GitHub Pages.

## Convenzioni e dati

Usare TypeScript strict, componenti React funzionali e CSS responsive. Stato e chiavi sensibili restano in memoria; non usare storage persistente per token o dati personali. La passphrase può essere conservata solo in modo opt-in come ciphertext AES-GCM con `CryptoKey` non esportabile in IndexedDB dedicato; mai in chiaro o in local/session storage. Non loggare dati sensibili. Identificativi indipendenti dai nomi; persone e relazioni sono entità distinte. Validare gli archivi prima di usarli.

Il layout dell'albero deve essere deterministico: allineare partner solo quando il vincolo è compatibile con le generazioni genitore-figlio, tenere vicini i figli con lo stesso insieme di genitori e ridurre gli incroci con un riordino dei gruppi. I collegamenti familiari condividono connettori ortogonali senza alterare il modello relazionale.

Centralizzare i testi dell'interfaccia nelle traduzioni `it`, `en`, `eo`, mantenendo fallback inglese e test di parità. Formattare date con API `Intl`.

## Immagini

`image-config.json` è la fonte versionata e autorevole per formati e limiti in ingresso, risoluzione massima normalizzata (inizialmente 1200 × 1200), qualità JPEG, dimensioni delle varianti, concorrenza e limiti/retention della cache. Non duplicare questi valori nel codice. Ritocco, orientamento EXIF, normalizzazione, cifratura e varianti restano nel browser. Un'immagine normalizzata per persona è conservata cifrata nell'archivio; le varianti si generano on demand e non entrano nell'archivio. IndexedDB può contenere solo varianti cifrate con una chiave derivata dalla passphrase, mai blob o immagini in chiaro. La cache in memoria è temporanea e limitata.

## Accessibilità

Garantire uso da tastiera, focus visibile, etichette accessibili, controlli touch e layout mobile. Rispettare `prefers-reduced-motion`; l'area albero deve disabilitare lo scroll browser durante gesture.

## Sicurezza

La password Admin `moltisantitree` è pubblicamente visibile nel codice e serve solo a evitare modifiche accidentali. Non è autenticazione. `VITE_ADMIN_PASSWORD` può sovrascriverla in fase di build, ma il valore risultante resta leggibile nel bundle e non va trattato come segreto. Token GitHub mai in storage, URL, log o repository. Passphrase AES in memoria, salvo consenso esplicito per il ricordo cifrato descritto in `docs/security.md`; rimuoverla dallo storage quando l'utente la dimentica o non apre più l'archivio. Usare Web Crypto AES-GCM con IV casuale e PBKDF2 versionati. Non pubblicare dati personali in chiaro o immagini non cifrate. Token GitHub fornito dall'utente e limitato al repository. Non effettuare chiamate reali o commit nei test.

## Verifica e documentazione

Richiedere Node.js 22+. Usare `npm ci`, `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`. Modifiche a requisiti, architettura, sicurezza o UX devono aggiornare il documento relativo e `docs/roadmap.md`. Leggere `docs/security.md` prima di toccare crittografia o pubblicazione.

## Limitazioni correnti

Consultare `docs/roadmap.md`: non presentare funzionalità pianificate come implementate. L'app è una protezione dei dati a riposo, non una soluzione di autenticazione o un confine sicuro contro codice client malevolo.
