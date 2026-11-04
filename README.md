# Kosten – Ausgaben & Auslagen tracken

Einfache Web-App (PWA) fürs iPhone: Ausgaben in Kategorien erfassen, Statistiken ansehen
und Auslagen (wer schuldet wem wie viel) verwalten. Keine Installation, kein Server –
die Daten bleiben nur auf dem Gerät.

## Funktionen
- **Neu:** Betrag, Kategorie, fertig. Optional Notiz und Datum.
  - *Für andere mitbezahlt?* Personen wählen, gleich aufteilen oder Beträge eingeben.
    Nur dein Anteil zählt in der Statistik.
  - *Jemand zahlte für mich:* zählt als deine Ausgabe, du schuldest der Person den Betrag.
- **Liste:** alle Einträge pro Monat, antippen zum Bearbeiten/Löschen.
- **Statistik:** Monatssumme, Budget-Balken, Verteilung nach Kategorien, letzte 6 Monate.
- **Auslagen:** offene Beträge pro Person, einzeln oder komplett abhaken.
- **Mehr:** Budget (abschaltbar), Kategorien (Name, Emoji, Farbe, Reihenfolge), Personen,
  Backup als JSON, Export als CSV, Backup laden.

## Aufs iPhone bringen
1. Repo über GitHub Pages veröffentlichen (Settings → Pages → Branch wählen, Ordner `/root`).
2. Die Pages-Adresse in **Safari** öffnen → Teilen-Symbol → **Zum Home-Bildschirm**.
3. App übers Icon starten. Funktioniert danach auch offline.

## Technik
Reines HTML/CSS/JavaScript ohne Abhängigkeiten. Speicherung in `localStorage`,
Offline-Cache über `sw.js`. Lokal testen: `python3 -m http.server` und `http://localhost:8000` öffnen.
