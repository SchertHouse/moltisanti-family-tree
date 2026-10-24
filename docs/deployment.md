# Deployment

Il workflow GitHub Actions controlla lint, test, typecheck e build prima di pubblicare su GitHub Pages. Il base path di Vite corrisponde al repository `moltisanti-family-tree`; in locale è `/`. Routing iniziale è basato su singola pagina, senza necessità di fallback.

L'archivio destinato alla consultazione automatica viene scritto con API Contents nel percorso `public/family-archive.enc.json`; Vite copia questo solo file cifrato nella build. Il commit dell'API su `main` avvia il workflow Pages. Gli asset statici non devono contenere archivi personali in chiaro, token o chiavi. Distribuire solo file cifrati autorizzati; controllare gli artefatti prima del deploy. Nessun token è configurato nella pipeline.
