-- Executable backend DESIGN for a disposable candidate database.
-- No Runtime adapter or production database is installed by this file.
-- Canonical validation, exact file hashes and bounds belong to the future adapter.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;
PRAGMA user_version = 1;

CREATE TABLE index_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  vault_id TEXT NOT NULL COLLATE BINARY,
  generation_id TEXT NOT NULL COLLATE BINARY,
  manifest_sha256 TEXT NOT NULL COLLATE BINARY,
  normalization_policy TEXT NOT NULL CHECK (normalization_policy = 'ascii_fold_v1'),
  ranking_policy TEXT NOT NULL CHECK (ranking_policy = 'scope_literal_v1'),
  sqlite_version TEXT NOT NULL,
  ready INTEGER NOT NULL CHECK (ready IN (0, 1))
);

CREATE TABLE source (
  source_id TEXT PRIMARY KEY COLLATE BINARY,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL COLLATE BINARY,
  record_sha256 TEXT NOT NULL COLLATE BINARY
);
CREATE TABLE memory (
  memory_id TEXT PRIMARY KEY COLLATE BINARY,
  kind TEXT NOT NULL CHECK (kind IN ('fact','preference','episode','project_state','session_checkpoint')),
  status TEXT NOT NULL CHECK (status IN ('active','superseded','archived')),
  source_id TEXT NOT NULL REFERENCES source(source_id),
  project_id TEXT COLLATE BINARY,
  session_id TEXT COLLATE BINARY,
  created_at TEXT NOT NULL COLLATE BINARY,
  updated_at TEXT NOT NULL COLLATE BINARY,
  valid_from TEXT COLLATE BINARY,
  valid_until TEXT COLLATE BINARY,
  record_sha256 TEXT NOT NULL COLLATE BINARY
);
CREATE INDEX memory_scope ON memory(status, project_id, session_id, kind);
CREATE TABLE memory_tag (
  memory_id TEXT NOT NULL REFERENCES memory(memory_id),
  tag TEXT NOT NULL COLLATE BINARY,
  PRIMARY KEY (memory_id, tag)
);
CREATE TABLE memory_relation (
  successor_id TEXT PRIMARY KEY REFERENCES memory(memory_id),
  predecessor_id TEXT NOT NULL REFERENCES memory(memory_id)
);
CREATE TABLE session (
  session_id TEXT PRIMARY KEY COLLATE BINARY,
  created_at TEXT NOT NULL COLLATE BINARY,
  updated_at TEXT NOT NULL COLLATE BINARY,
  event_count INTEGER NOT NULL CHECK (event_count >= 0),
  record_sha256 TEXT NOT NULL COLLATE BINARY
);
CREATE TABLE session_event (
  session_id TEXT NOT NULL REFERENCES session(session_id),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  created_at TEXT NOT NULL COLLATE BINARY,
  kind TEXT NOT NULL CHECK (kind IN ('turn','checkpoint')),
  turn_id TEXT UNIQUE COLLATE BINARY,
  source_id TEXT REFERENCES source(source_id),
  checkpoint_id TEXT UNIQUE REFERENCES memory(memory_id),
  PRIMARY KEY (session_id, sequence),
  CHECK ((kind = 'turn' AND turn_id IS NOT NULL AND source_id IS NOT NULL AND checkpoint_id IS NULL)
      OR (kind = 'checkpoint' AND checkpoint_id IS NOT NULL AND turn_id IS NULL AND source_id IS NULL))
);

-- One row per separate searchable field/array value. Never concatenate fields.
CREATE TABLE search_value (
  value_id INTEGER PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memory(memory_id),
  field TEXT NOT NULL CHECK (field IN ('content','state','decision','open_loop','last_state','tag')),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  value TEXT NOT NULL COLLATE BINARY,
  UNIQUE (memory_id, field, ordinal)
);
CREATE INDEX search_value_memory ON search_value(memory_id);
-- Normal content mode: a fresh full rebuild writes both tables in one transaction.
CREATE VIRTUAL TABLE search_fts USING fts5(value, tokenize='trigram case_sensitive 1', detail=full);
