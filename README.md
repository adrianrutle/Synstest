# Synstest

En synstest i nettleseren på mobilen, laget for moro skyld i familien. Den er ikke en resept.

**Åpne appen:** https://adrianrutle.github.io/Synstest/

## Hva den gjør
- **Bokstavtavle (visus):** Sloan-bokstaver i riktig størrelse for 2, 3 eller 4 m. Skjermen kalibreres med et bankkort.
- **Astigmatisme-skive:** finner retningen på eventuell astigmatisme.
- **Fjernpunkt:** frontkameraet måler avstanden til ansiktet (MediaPipe Face Landmarker). Det måles med striper i to retninger, som gir sfære, sylinder og akse.
- **Nærpunkt** (fra 38 år): gir lesestyrke (ADD).
- **PD:** pupilldistanse måles fra kamerabildet.

Alt kjører lokalt på mobilen. Ingen bilder lagres eller sendes noe sted, og resultatene lagres bare i nettleseren.

## Begrensninger
Langsynthet (plusstyrke) kan ikke måles med fjernpunktmetoden. Regn med avvik på ±0,5 D. Gå til optiker for briller og for å sjekke øyehelsen.

## Filer
- `index.html`: oppsett og stil
- `app.js`: skjermer, kamera og testflyt
- `rx.js`: beregningene (rene funksjoner)
