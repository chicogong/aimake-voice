-- Fix usage_logs.type CHECK constraint + drop legacy columns
--
-- 0001_init.sql created usage_logs with CHECK (type IN ('tts', 'podcast')).
-- The universal-jobs model (0005) made content_type one of
-- tts | podcast | audiobook | voiceover | education, and the audio-completion
-- callback (api/src/routes/internal.ts) writes a usage_logs row with that
-- type. As a result, audiobook / voiceover / education jobs failed the CHECK
-- on their final usage write, so those job types could never complete.
--
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt. While
-- rebuilding we also drop the now-dead audio_id / podcast_id columns
-- (superseded by job_id in 0005) so the table matches api/src/db/schema.ts.
-- usage_logs is a leaf table — nothing references it — so the drop + rename
-- is safe.

CREATE TABLE usage_logs_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('tts', 'podcast', 'audiobook', 'voiceover', 'education')),
  chars_used INTEGER NOT NULL,
  duration_used REAL NOT NULL,
  job_id TEXT REFERENCES jobs(id),
  provider TEXT,
  api_cost REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO usage_logs_new (id, user_id, type, chars_used, duration_used, job_id, provider, api_cost, created_at)
  SELECT id, user_id, type, chars_used, duration_used, job_id, provider, api_cost, created_at
  FROM usage_logs;

DROP TABLE usage_logs;

ALTER TABLE usage_logs_new RENAME TO usage_logs;

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
