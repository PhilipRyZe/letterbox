-- Letterbox – Schema für Cloudflare D1
-- Anlegen mit: wrangler d1 execute letterbox-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('film', 'serie', 'game')),
  title       TEXT NOT NULL,
  year        INTEGER,
  cover_url   TEXT,
  description TEXT,
  host_rating REAL CHECK (host_rating IS NULL OR (host_rating >= 1 AND host_rating <= 10)),
  host_note   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS likes (
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  rating     REAL NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_likes_item    ON likes(item_id);
CREATE INDEX IF NOT EXISTS idx_ratings_item  ON ratings(item_id);
CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_id);
CREATE INDEX IF NOT EXISTS idx_items_type    ON items(type);
