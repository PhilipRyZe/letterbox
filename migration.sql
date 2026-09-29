-- Letterbox – EINMALIGE Migration für die bestehende D1-Datenbank
--
-- Was sie tut: erlaubt den neuen Typ "edit" und fügt die Spalte video_url hinzu.
-- SQLite kann eine CHECK-Regel nicht nachträglich ändern, deshalb werden die
-- Tabellen neu angelegt und alle Daten (Einträge, Likes, Bewertungen,
-- Kommentare) unverändert zurückkopiert.
--
-- Sicherheitsnetz: Bis zum letzten Schritt liegen alle Daten zusätzlich in den
-- Tabellen *_bak. Bricht etwas ab, gehen also keine Daten verloren.
--
-- Nur EINMAL ausführen!

-- 1) Sicherungskopien
CREATE TABLE items_bak    AS SELECT * FROM items;
CREATE TABLE likes_bak    AS SELECT * FROM likes;
CREATE TABLE ratings_bak  AS SELECT * FROM ratings;
CREATE TABLE comments_bak AS SELECT * FROM comments;

-- 2) Alte Tabellen entfernen (zuerst die abhängigen, damit nichts kaskadiert)
DROP TABLE likes;
DROP TABLE ratings;
DROP TABLE comments;
DROP TABLE items;

-- 3) Neu anlegen (mit Typ "edit" und video_url)
CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('film', 'serie', 'game', 'edit')),
  title       TEXT NOT NULL,
  year        INTEGER,
  cover_url   TEXT,
  description TEXT,
  host_rating REAL CHECK (host_rating IS NULL OR (host_rating >= 1 AND host_rating <= 10)),
  host_note   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  video_url   TEXT
);

CREATE TABLE likes (
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, visitor_id)
);

CREATE TABLE ratings (
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  rating     REAL NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, visitor_id)
);

CREATE TABLE comments (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_likes_item    ON likes(item_id);
CREATE INDEX idx_ratings_item  ON ratings(item_id);
CREATE INDEX idx_comments_item ON comments(item_id);
CREATE INDEX idx_items_type    ON items(type);

-- 4) Daten zurückkopieren
INSERT INTO items (id, type, title, year, cover_url, description, host_rating, host_note, created_at)
  SELECT id, type, title, year, cover_url, description, host_rating, host_note, created_at FROM items_bak;
INSERT INTO likes (item_id, visitor_id, created_at)
  SELECT item_id, visitor_id, created_at FROM likes_bak;
INSERT INTO ratings (item_id, visitor_id, rating, created_at)
  SELECT item_id, visitor_id, rating, created_at FROM ratings_bak;
INSERT INTO comments (id, item_id, visitor_id, name, text, created_at)
  SELECT id, item_id, visitor_id, name, text, created_at FROM comments_bak;

-- 5) Sicherungskopien aufräumen
DROP TABLE items_bak;
DROP TABLE likes_bak;
DROP TABLE ratings_bak;
DROP TABLE comments_bak;
