CREATE TABLE IF NOT EXISTS events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 payload TEXT NOT NULL,
 received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS materials (
 material_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 payload TEXT NOT NULL,
 PRIMARY KEY(material_id, version)
);
