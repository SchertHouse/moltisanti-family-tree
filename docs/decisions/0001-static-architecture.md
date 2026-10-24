# ADR 0001: Applicazione statica senza backend

- Stato: accettata
- Decisione: React/Vite statico su GitHub Pages; archivio cifrato lato browser; API REST GitHub opzionale per pubblicarlo.

## Contesto

Il progetto deve essere gratuito, pubblicabile in repository pubblico e non dipendere da backend tradizionale. Dati personali e immagini non devono apparire negli asset pubblici in chiaro.

## Conseguenze

Web Crypto mantiene la passphrase nel client; il server statico vede solo ciphertext. Distribuzione e backup sono semplici. La soluzione non offre autenticazione robusta, controllo accessi per viewer, protezione da codice client malevolo, transazioni Git o prevenzione rollback. Un PAT con write è potente e resta responsabilità dell'admin.

## Alternative

Graph library dedicata per gerarchie (es. React Flow) faciliterebbe pan/zoom e nodi custom, ma comporta una dipendenza e non risolve da sola il layout genealogico. La prima versione usa SVG diretto e layout semplice, da rivalutare con dataset grandi.
