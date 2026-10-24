# Albero Genealogico Moltisanti

Applicazione statica per esplorare e gestire un albero genealogico. I dati e le fotografie sono conservati insieme in un archivio cifrato nel browser: il repository non contiene persone dimostrative né dati personali in chiaro.

## Avvio rapido

Richiede Node.js 22 o successivo.

```sh
npm ci
npm run dev
```

Per creare una build statica:

```sh
npm run lint
npm test
npm run typecheck
npm run build
```

Apri l'app, scegli **Admin**, conferma l'avviso sulla protezione locale e inserisci la password amministrativa locale (predefinita `moltisantitree`; non è un'autenticazione sicura). Può essere impostata in fase di build tramite `VITE_ADMIN_PASSWORD`, ma rimane pubblica nel bundle. Aggiungi le persone e le relazioni, quindi cifra e scarica l'archivio. Per visualizzare un archivio cifrato esistente, usa **Apri archivio** e inserisci la passphrase corretta. Un archivio pubblicato nel percorso `public/family-archive.enc.json` viene caricato automaticamente; dopo ogni ricaricamento la passphrase è richiesta di nuovo.

## Funzionalità presenti

- Albero SVG navigabile con trascinamento, zoom con rotella e pulsanti, ricerca, generazioni e selezione delle persone.
- Scheda persona con relazioni, date, biografia, note e fonti, oltre ad azioni per preparare un'email o un messaggio WhatsApp.
- Inserimento, modifica, collegamenti genitore-figlio/partner e rimozione con conferma in modalità Admin.
- Editor per ritagliare in quadrato e normalizzare nel browser le foto prima di associarle al profilo, con orientamento EXIF corretto e metadati rimossi.
- Archivio JSON versionato cifrato con AES-256-GCM e PBKDF2; una sola immagine normalizzata per persona è cifrata individualmente e inclusa nell'archivio cifrato.
- Varianti immagine generate on demand (albero 128 px, scheda fino a 800 px) e cache IndexedDB persistente cifrata, con fallback temporaneo in memoria. I limiti, incluso il massimo iniziale di 1200 × 1200 px, sono modificabili in `image-config.json`.
- Apertura automatica dell'archivio pubblicato, import con anteprima e download di archivi cifrati; chiavi e token sono mantenuti solo nello stato volatile della pagina.
- Import/export JSON; l'export in chiaro richiede conferma ed è da proteggere come dato sensibile.
- Pubblicazione dell'archivio cifrato su un repository GitHub configurato dall'utente.
- Interfaccia in italiano, inglese ed esperanto.

## Sicurezza e limiti

La password Admin è una barriera contro modifiche accidentali, non un sistema di autenticazione. Non inserire dati di persone senza il loro consenso. Non usare la passphrase di cifratura come password Admin o token GitHub. Una pagina statica può proteggere i dati cifrati a riposo, ma non può impedire a un viewer autorizzato di copiarli né difendere la chiave da codice della pagina compromesso. Leggere [docs/security.md](./docs/security.md) prima di pubblicare.

La pubblicazione GitHub salva un singolo archivio cifrato; serve un fine-grained token limitato al repository con permesso Contents: read/write. Un token di scrittura può modificare o cancellare file fuori dall'app. La creazione e il rinnovo del token avvengono direttamente su GitHub e non sono gestiti dall'applicazione.

## GitHub Pages

Abilitare Pages con GitHub Actions nelle impostazioni del repository. Il workflow esegue lint, test, typecheck e build prima del deploy. Il base path è configurato per il nome repository `moltisanti-family-tree`.

La roadmap e le funzionalità non ancora implementate sono in [docs/roadmap.md](./docs/roadmap.md). Le istruzioni di sviluppo sono in [AGENTS.md](./AGENTS.md) e [docs/development.md](./docs/development.md).
