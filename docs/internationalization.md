# Internazionalizzazione

Lingue iniziali: italiano (`it`), inglese (`en`), esperanto (`eo`), in file JSON separati. La lingua browser è usata se supportata, altrimenti inglese. Il selettore permette di cambiare lingua; la preferenza, se persistita, non deve includere dati personali o segreti. Date e numeri sono formattati con `Intl`. Test automatici verificano la parità delle chiavi.

Le etichette dei campi opzionali persona (nome alternativo, sesso alla nascita e valori ammessi, professione, residenza e nazionalità) sono centralizzate nelle tre traduzioni e sottoposte allo stesso test di parità. I campi data inseriscono automaticamente i separatori nel formato della lingua attiva; l'etichetta della data di morte riporta il formato atteso senza qualificarla come facoltativa, per mantenere compatto il layout.

Il calcolo del percorso di parentela nella scheda persona usa testi localizzati per la ricerca, i legami attraversati, i rapporti di affinità tramite unioni registrate, i collegamenti indiretti e l'assenza di un percorso registrato. Il selettore “Confronta con” include un controllo localizzato e accessibile per cancellare la persona selezionata e il relativo risultato.
