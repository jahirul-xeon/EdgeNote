-- =====================================================================
-- Edge Note — edgeflare (Postgres + pigo REST + Dex) schema
-- =====================================================================
-- Apply this on your edgeflare tenant's Postgres (psql / tern / the SQL
-- console). It is idempotent — safe to re-run.
--
-- Design mirrors the app's local SQLite schema (src/database/database.ts)
-- 1:1 so the sync engine maps rows without translation:
--   * timestamps are epoch-MILLIS BIGINTs (not timestamptz) — the client
--     compares them numerically for last-writer-wins conflict resolution.
--   * booleans are real BOOLEANs; the client sends true/false JSON.
--   * `tags` is JSONB (a JSON array of strings); `blocks_json` is TEXT
--     (an already-serialized block model, kept opaque server-side).
--
-- Isolation: every row is owned by a Dex user (`owner_uid` = the JWT `uid`
-- claim, which references core.users.uid). RLS lets the `authn` role touch
-- only its own rows. This matches edgeforce-ng's auth model
-- (docs/auth-strategy.md) but scopes by user instead of org, because notes
-- are personal.
--
-- REST exposure: pigo serves this at
--   https://<tenant>.<region>.edgeflare.dev/api/notes/<table>
-- The `notes` schema MUST be in pigo's exposed-schemas list. If you cannot
-- add a schema to the gateway config, change every `notes.` below to `core.`
-- (already exposed) and set EXPO_PUBLIC_EDGEFLARE_SCHEMA=core in the app.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS notes;
COMMENT ON SCHEMA notes IS 'Edge Note — personal notes, folders and attachment metadata (per-user, RLS-isolated).';

-- ---------------------------------------------------------------------
-- Gateway roles — pigo/PostgREST normally owns these; guarded so this
-- file is self-contained and re-runnable.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authn') THEN CREATE ROLE authn NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')  THEN CREATE ROLE anon  NOLOGIN; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Current user helper — reads the `uid` claim pigo puts in the
-- `request.jwt.claims` GUC (same mechanism as core.current_org_id()).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notes.current_uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'uid',
    ''
  )::UUID
$$;
COMMENT ON FUNCTION notes.current_uid IS 'UUID of the authenticated user, from the JWT `uid` claim. NULL when unauthenticated.';

-- ---------------------------------------------------------------------
-- FOLDERS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes.folders (
  id          TEXT PRIMARY KEY,                 -- client-generated id (matches local row)
  owner_uid   UUID NOT NULL DEFAULT notes.current_uid(),
  name        TEXT NOT NULL DEFAULT '',
  icon        TEXT,
  color       TEXT,
  created_at  BIGINT NOT NULL,                  -- epoch millis
  updated_at  BIGINT NOT NULL                   -- epoch millis (LWW key)
);
CREATE INDEX IF NOT EXISTS idx_notes_folders_owner   ON notes.folders (owner_uid);
CREATE INDEX IF NOT EXISTS idx_notes_folders_updated ON notes.folders (owner_uid, updated_at);

-- ---------------------------------------------------------------------
-- NOTES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes.notes (
  id             TEXT PRIMARY KEY,
  owner_uid      UUID NOT NULL DEFAULT notes.current_uid(),
  title          TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',      -- flattened plain text (search/preview)
  blocks_json    TEXT,                          -- serialized rich block model (opaque)
  content_format TEXT NOT NULL DEFAULT 'plain', -- 'plain' | 'rich' | 'markdown'
  folder_id      TEXT REFERENCES notes.folders (id) ON DELETE SET NULL,
  tags           JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked      BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE, -- soft delete / trash (syncs as a normal update)
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL,               -- LWW key
  deleted_at     BIGINT,
  sync_version   INTEGER NOT NULL DEFAULT 0,
  device_id      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_notes_notes_owner   ON notes.notes (owner_uid);
CREATE INDEX IF NOT EXISTS idx_notes_notes_updated ON notes.notes (owner_uid, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_notes_folder  ON notes.notes (folder_id);

-- ---------------------------------------------------------------------
-- ATTACHMENTS (metadata; the file itself lives in S3)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes.attachments (
  id           TEXT PRIMARY KEY,
  note_id      TEXT NOT NULL REFERENCES notes.notes (id) ON DELETE CASCADE,
  owner_uid    UUID NOT NULL DEFAULT notes.current_uid(),
  type         TEXT NOT NULL DEFAULT 'file',   -- 'image' | 'video' | 'audio' | 'file'
  remote_url   TEXT,
  storage_path TEXT,
  name         TEXT,
  mime_type    TEXT,
  size         BIGINT,
  width        INTEGER,
  height       INTEGER,
  created_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_attachments_note  ON notes.attachments (note_id);
CREATE INDEX IF NOT EXISTS idx_notes_attachments_owner ON notes.attachments (owner_uid);

-- ---------------------------------------------------------------------
-- Ownership trigger — stamp owner_uid from the JWT on insert so the
-- client never has to send it (and cannot spoof it). Runs BEFORE the RLS
-- WITH CHECK, so inserts pass without an explicit owner_uid.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notes.tg_set_owner_uid() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_uid IS NULL THEN
    NEW.owner_uid := notes.current_uid();
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['folders','notes','attachments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tr_set_owner_uid ON notes.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tr_set_owner_uid BEFORE INSERT ON notes.%I
         FOR EACH ROW EXECUTE FUNCTION notes.tg_set_owner_uid()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Row-Level Security — each user sees and writes only their own rows.
-- ---------------------------------------------------------------------
ALTER TABLE notes.folders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes.notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS folders_owner     ON notes.folders;
DROP POLICY IF EXISTS notes_owner       ON notes.notes;
DROP POLICY IF EXISTS attachments_owner ON notes.attachments;

CREATE POLICY folders_owner ON notes.folders
  FOR ALL TO authn
  USING (owner_uid = notes.current_uid())
  WITH CHECK (owner_uid = notes.current_uid());

CREATE POLICY notes_owner ON notes.notes
  FOR ALL TO authn
  USING (owner_uid = notes.current_uid())
  WITH CHECK (owner_uid = notes.current_uid());

CREATE POLICY attachments_owner ON notes.attachments
  FOR ALL TO authn
  USING (owner_uid = notes.current_uid())
  WITH CHECK (owner_uid = notes.current_uid());

-- ---------------------------------------------------------------------
-- Grants — authn (authenticated app user) only; anon gets nothing.
-- RLS above is the real enforcement; the grant just opens the door.
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA notes TO authn;
GRANT ALL ON ALL TABLES    IN SCHEMA notes TO authn;
GRANT ALL ON ALL SEQUENCES IN SCHEMA notes TO authn;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA notes TO authn;
ALTER DEFAULT PRIVILEGES IN SCHEMA notes GRANT ALL     ON TABLES    TO authn;
ALTER DEFAULT PRIVILEGES IN SCHEMA notes GRANT ALL     ON SEQUENCES TO authn;
ALTER DEFAULT PRIVILEGES IN SCHEMA notes GRANT EXECUTE ON FUNCTIONS TO authn;

-- Record the migration (edgeforce-ng convention). The util.schema_migrations
-- bookkeeping table only exists on edgeforce-ng tenants; on a plain Postgres
-- (e.g. running this straight from pgAdmin) it is absent, so guard the insert
-- and skip it rather than error out.
DO $$
BEGIN
  IF to_regclass('util.schema_migrations') IS NOT NULL THEN
    INSERT INTO util.schema_migrations (version, description)
    VALUES ('edge_note_v1', 'Edge Note: notes/folders/attachments schema + RLS + grants')
    ON CONFLICT (version) DO NOTHING;
  ELSE
    RAISE NOTICE 'util.schema_migrations not found — skipping migration bookkeeping.';
  END IF;
END $$;
