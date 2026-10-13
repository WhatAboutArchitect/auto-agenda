# 📅 Auto-agenda

Een webapp die je to-dolijst automatisch inplant rond je vaste afspraken, **inclusief reistijd** naar werven of andere locaties. Je laadt je agenda (`.ics`) en een takenlijst (Excel of CSV) in, en de planner zoekt de vrije stukken tussen je afspraken.

Alles draait in de browser, op computer en gsm. Er is geen server en geen account nodig.

## Hoe gebruik je het

1. **Exporteer je agenda** als `.ics`-bestand en laad dat in bij *Vaste afspraken*.
2. **Laad je takenlijst** in (`.xlsx` of `.csv`), of voeg taken één voor één toe met het formulier *Extra taak toevoegen*.
3. Vul je **kantoor** in (naam of adres, zoals het in je agenda staat) en eventueel de lunch en werkuren.
4. Druk op **Plan in**.
5. Tik op een taak of afspraak voor details, een kaartje en een notitievak. Vink taken af in de lijst *Taken* en druk opnieuw op **Plan in** om de rest te herplannen.
6. Met **Exporteer planning** download je `planning.ics`. Zet dat bestand bij voorkeur in een **aparte agenda**, zodat de planner zijn eigen taken de volgende keer niet als vaste afspraken ziet.

## De takenlijst

Eén taak per rij. De kolomnamen mogen in hoofdletters of kleine letters staan.

| Kolom | Verplicht | Uitleg |
|---|---|---|
| **Taak** | ja | Naam van de taak. Twee taken met dezelfde naam kunnen niet. |
| **Duur (uren)** | ja | Decimalen mogen, bv. `1.5`. Staat er `min` in de kolomnaam, dan wordt het als minuten gelezen. |
| **Deadline** | nee | Datum, of datum met uur (`2026-10-16 17:00`). Zonder uur geldt de hele dag; met uur moet de taak vóór dat moment klaar zijn. |
| **Prioriteit** | nee | `1` is het hoogst. Standaard `3`. |
| **Locatie** | nee | Leeg = op kantoor. Anders een plaats of adres, of coördinaten zoals `51.02,4.47` (met punten). |
| **Niet splitsen** | nee | `ja` = de taak moet in één blok passen, ook als ze langer is dan het minimumblok. |
| **Startdatum** | nee | Datum, of datum met uur (`2026-10-12 09:00`). De taak start niet vóór dat moment. Leeg = zo snel mogelijk. |

Via de link *Voorbeeld* op de pagina download je een voorbeeldbestand.

## Hoe de planner werkt

- Taken worden gesorteerd op **deadline** (met uur als dat er is), daarna op **prioriteit**. Vandaag wordt er niets ingepland vóór het huidige uur.
- Een taak die niet in één gat past, wordt in **blokken** gesplitst (minimumlengte instelbaar), tenzij *Niet splitsen* aanstaat. Wat nergens past, staat onder *Niet ingepland*.
- **Lunch** is een vaste pauze op elke werkdag.
- **Buurt bundelen** (standaard aan): na een taak op locatie worden andere taken binnen X minuten rijden meteen meegenomen. Alleen taken zonder deadline, of met nog minstens twee dagen marge, worden naar voren gehaald. Er wordt alleen binnen één dag gebundeld.
- Reistijd wordt gerekend van en naar je **kantoor**. Tussen twee opeenvolgende plaatsen rijd je rechtstreeks. Reistijd verschijnt als eigen blokje (🚗) in de planning.
- Afspraken zonder locatie, of op je kantoor zelf, krijgen geen reistijd.

## Reistijden en kaarten

De app gebruikt **OpenStreetMap**-diensten, zonder sleutel:

- **Nominatim** zet adressen om in coördinaten (maximaal één aanvraag per seconde). Opgezochte adressen worden onthouden in je browser.
- **OSRM** berekent de rijtijden tussen alle plaatsen in één aanvraag en tekent de route.
- **MapLibre GL JS** toont de kaart, met kaartstukjes van OpenStreetMap.

Lukt het opzoeken of berekenen niet (bijvoorbeeld zonder internet), dan wordt de **standaardreistijd** uit de instellingen gebruikt. De rijtijden gelden voor de auto, zonder files.

## Aanpassen in de app

- **Taken** aanpassen met het ✏️-knopje in de lijst of in de popup van de taak. Een nieuwe locatie wordt opnieuw opgezocht.
- **Vaste afspraken** aanpassen of schrappen in hun popup (titel, datum, uren, locatie). Bij een terugkerende afspraak geldt dat alleen voor die ene keer. Dit past alleen de planner aan, niet je echte agenda, en gaat verloren zodra je het `.ics`-bestand opnieuw inlaadt.
- **Notities** bij taken en afspraken worden bewaard in je browser (per toestel).
- De **dagkaart** toont de route van de hele dag.

## Bestanden

| Bestand | Rol |
|---|---|
| `index.html` | Opbouw van de pagina |
| `style.css` | Opmaak (lichtblauw, met een donkere weergave) |
| `ui.js` | **Frontend**: invoervelden, lijsten, popups, kaartjes. Bevat geen planninglogica. |
| `planner.js` | **Backend**: agenda en taken inlezen, adressen, reistijden en de planning zelf. Raakt de pagina niet aan. |

`index.html` laadt `planner.js` vóór `ui.js`. Die volgorde moet zo blijven.

`ui.js` roept de backend zo aan:

```js
const res = await Planner.run({
  events, tasks, doneT,              // ingelezen agenda, taken, afgevinkte taken
  from: new Date('2026-10-12'), days: 14,
  ws: [8, 30], we: [17, 30],         // werkuren
  weekend: false,
  lunchStart: [12, 0], lunchMin: 45,
  minBlock: 30, defaultTravel: 20,   // minuten
  office: 'Kantoorstraat 1, Mechelen', officeCoords: null,
  bundle: true, radius: 15,
  onStatus: t => console.log(t)
});
// res = { plan, travels, lunches, lastEvs, q, office, status }
```

Verder bevat `Planner` onder meer `parseICS`, `parseTasks`, `makeICS`, `suggest` (adresvoorstellen) en `route`.

## Op GitHub Pages zetten

1. Maak een **publieke** repository op github.com.
2. Upload de vier bestanden naast elkaar in de hoofdmap (**Add file → Upload files**).
3. Ga naar **Settings → Pages**, kies *Deploy from a branch*, branch `main`, map `/ (root)` en sla op.
4. Na een à twee minuten staat de link bovenaan die pagina: `https://gebruikersnaam.github.io/repository/`.
5. Op een iPhone: open de link in Safari en kies **Deel → Zet op beginscherm**.

Na een update kan je browser nog het oude bestand tonen. Ververs dan hard (Ctrl+F5), of verhoog het nummer in `style.css?v=3` in `index.html`.

## Privacy

- Je agenda en takenlijst worden **niet geüpload**. Ze blijven in je browser.
- Wel worden adressen en coördinaten naar OpenStreetMap-diensten (Nominatim en OSRM) gestuurd om ze op te zoeken en reistijden te berekenen.
- In je browser worden alleen opgezochte adressen en je notities bewaard.

## Beperkingen

- Er is **geen live koppeling** met je agenda. Verandert er iets in je agenda, exporteer dan opnieuw en laad het bestand opnieuw in.
- Hele-dag-afspraken worden genegeerd. Tijdzones in `.ics`-bestanden worden niet omgerekend: tijden zonder tijdzone gelden als lokale tijd.
- Terugkerende afspraken met ingewikkelde regels (zoals "tweede dinsdag van de maand") worden niet ondersteund.
- Er zijn geen automatische tests. De planner is getest met voorbeelddagen en nagebootste antwoorden van de kaartdiensten.
- Safari op iPhone kan opgeslagen gegevens na weken zonder gebruik wissen. Dan worden adressen opnieuw opgezocht en zijn notities weg.

## Gebruikte bibliotheken en bronnen

- [MapLibre GL JS](https://maplibre.org/) 4.7.1
- [SheetJS](https://sheetjs.com/) 0.18.5, voor het inlezen van Excel
- Kaartgegevens © [OpenStreetMap](https://www.openstreetmap.org/copyright)-bijdragers, via Nominatim, OSRM en de standaard kaartstukjes
