# 10

Multitouch-Reaktionsspiel als PWA fürs iPad: Kreise so schnell und so gleichzeitig wie möglich berühren – erst einer, am Ende zehn.

## Regeln

- Pro Aufgabe 5 Sekunden Zeit. Startpunkte = 10 × Anzahl der Kreise, sie zählen gleichmäßig auf 0 herunter (bei einem Kreis alle 500 ms ein Punkt).
- Weiter geht es erst, wenn jeder Kreis von genau einem Finger berührt wird und kein Finger daneben liegt. Finger, die schon vor dem Erscheinen lagen, zählen als „daneben“.
- Stufe 1: ein Kreis, 4 Aufgaben, die Kreise werden kleiner.
- Danach je 5 Aufgaben mit 2, 3 … 10 Kreisen. In jeder Stufe starten die Kreise groß und dicht beieinander und werden dann kleiner und rücken auseinander. Ab 6 Kreisen gibt es eine Gruppe pro Hand.
- Höchstpunktzahl: 2740.

## iPad-Tipp

Ab vier Fingern lösen die Multitasking-Gesten von iPadOS gern aus. Ausschalten unter *Einstellungen › Multitasking & Gesten*, oder *Geführter Zugriff* nutzen.

## Dateien

- `index.html`, `style.css`, `app.js` – das Spiel (ohne Build-Schritt, ohne Abhängigkeiten)
- `sw.js` – Offline-Cache (bei Änderungen `VERSION` hochzählen)
- `manifest.webmanifest`, `icons/` – PWA-Manifest und Icons

## Veröffentlichen

GitHub Pages: *Settings › Pages › Deploy from a branch › main / (root)*.
