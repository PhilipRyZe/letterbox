# Letterbox

Eine kleine Letterboxd-artige Sammlung für Filme, Serien und Games – für dich
und ein paar Freunde. Läuft komplett auf Cloudflare Pages + Functions + D1,
genau wie deine anderen `pjanssen.cc`-Projekte.

- **Nur du** kannst Einträge anlegen/bearbeiten/löschen (über `/admin`,
  abgesichert mit Cloudflare Access – kein selbstgebautes Login).
- **Besucher** (deine Freunde) brauchen **kein Konto**: sie können liken,
  bewerten und kommentieren. Dafür bekommt jeder Browser beim ersten Besuch
  automatisch eine zufällige, anonyme ID (im `localStorage`), die verhindert,
  dass man mehrfach für denselben Film abstimmt.
- Jeder Eintrag zeigt **deine Bewertung als Host** getrennt vom
  **Durchschnitt aller Besucher**.

## Projektstruktur

```
public/            statische Seite (öffentlich, kein Login)
  index.html/app.js/style.css      Übersicht + Detailansicht
  admin/                           Admin-UI, später via Access geschützt
functions/api/...                 öffentliche API (Items lesen, liken, bewerten, kommentieren)
functions/admin/api/...           Admin-API (anlegen/bearbeiten/löschen)
schema.sql                        D1-Datenbankschema
wrangler.toml                     Cloudflare-Konfiguration
```

## Einfacher Weg – alles über das Cloudflare-Dashboard (kein Terminal nötig)

Wenn dir Wrangler/Terminal zu viel ist: Es geht komplett über die
Cloudflare-Website, genau wie bei deinen anderen Projekten.

1. **GitHub-Repo anlegen** und alle Dateien aus diesem Projekt hochladen
   (wie bei deinen anderen Repos).
2. **Cloudflare-Dashboard** → *Workers & Pages* → *Create* → *Pages* →
   *Connect to Git* → dein neues Repo auswählen. Als
   *Build output directory* `public` eintragen, sonst nichts einstellen,
   *Save and Deploy*.
3. **Workers & Pages* → *D1* → *Create database*, Name z. B.
   `letterbox-db`.
4. In der neuen Datenbank auf **Console** klicken, den kompletten Inhalt
   von `schema.sql` einfügen und **Execute** drücken.
5. Zurück im Pages-Projekt: **Settings** → **Functions** → **D1 database
   bindings** → *Add binding*. Variablenname: `DB`, Datenbank:
   `letterbox-db` auswählen, speichern.
6. Im Reiter **Deployments** das letzte Deployment erneut ausrollen
   (*Retry deployment*), damit die Datenbank-Verbindung aktiv wird.
7. Deine Pages-URL öffnen (z. B. `letterbox.pages.dev`), unter `/admin`
   einen ersten Eintrag anlegen und prüfen, ob er auf der Startseite
   erscheint.
8. Optional: **Custom domain** einrichten, z. B. `sammlung.pjanssen.cc`.
9. `/admin` mit **Zero Trust → Access** absichern, siehe Abschnitt 5 unten.

Das war's – kein `npm`, kein `wrangler`, kein Terminal.

---

## 1. Voraussetzungen

```bash
npm install -g wrangler
wrangler login
```

## 2. D1-Datenbank anlegen

```bash
wrangler d1 create letterbox-db
```

Das gibt dir eine `database_id` aus. Die trägst du in `wrangler.toml` bei
`database_id` ein (ersetzt `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

Dann das Schema anlegen:

```bash
wrangler d1 execute letterbox-db --remote --file=./schema.sql
```

## 3. Lokal testen

```bash
wrangler pages dev public --d1=DB=letterbox-db
```

Öffnet unter `http://localhost:8788`. Die Admin-Seite unter
`http://localhost:8788/admin` ist lokal **nicht** geschützt (Access greift
erst online) – zum Testen aber genau richtig.

## 4. Deployen

Am einfachsten direkt über Wrangler:

```bash
wrangler pages deploy public --project-name=letterbox
```

Wrangler nutzt automatisch die `functions/`-Ordner und die
`wrangler.toml`-Konfiguration (inkl. D1-Binding). Alternativ kannst du das
Repo wie deine anderen Projekte auch über die Cloudflare-Dashboard-Git-
Integration verbinden – dann baut Cloudflare bei jedem Push automatisch neu.

Danach im Dashboard eine eigene Subdomain einrichten, z. B.
`sammlung.pjanssen.cc` → Custom Domain auf das Pages-Projekt.

## 5. Admin-Bereich mit Cloudflare Access schützen

Das ist der Schritt, der dafür sorgt, dass **nur du** an `/admin` kommst,
ganz ohne eigenen Login-Code:

1. Cloudflare-Dashboard → **Zero Trust** → **Access** → **Applications** →
   **Add an application** → **Self-hosted**.
2. Domain: deine Pages-Domain (z. B. `sammlung.pjanssen.cc`), Pfad: `/admin*`.
3. Als Policy: **Allow**, Regel „Emails“ → genau deine E-Mail-Adresse
   eintragen.
4. Login-Methode: reicht ein simpler „One-time PIN per E-Mail“ – du bekommst
   dann beim Aufruf von `/admin` einen Code per Mail, kein Passwort nötig.

Ab dann verlangt `/admin` (und automatisch auch `/admin/api/*`, weil der
Pfad mitgeschützt ist) eine Anmeldung nur für dich. Der öffentliche Teil der
Seite bleibt komplett offen.

Falls du magst, kannst du in `wrangler.toml` unter `[vars]` noch
`ADMIN_EMAIL` auf deine Adresse setzen – das ist eine zusätzliche
Absicherung im Code selbst (prüft die von Access mitgeschickte
E-Mail-Adresse), falls die Access-Policy mal versehentlich zu weit gefasst
wird. Notwendig ist es nicht, schadet aber nicht.

## Datenmodell

- `items` – Film/Serie/Game, inkl. deiner Host-Bewertung (`host_rating`,
  `host_note`)
- `likes` – ein Eintrag pro (Item, Besucher-ID)
- `ratings` – ein Eintrag pro (Item, Besucher-ID), 1–10, wird beim erneuten
  Bewerten einfach überschrieben
- `comments` – Name (frei eingegeben) + Text + Besucher-ID

## Später ausbaufähig

- Eigene Diary-Ansicht ("zuletzt geschaut/gespielt") pro Besucher-ID
- Sortierung nach Beliebtheit/Bewertung
- Mehrere Cover-Bilder / Trailer-Links
- Export/Import, falls doch mal TMDB/IGDB angebunden werden soll
