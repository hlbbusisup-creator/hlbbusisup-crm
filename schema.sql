CREATE TABLE IF NOT EXISTS crm_kv (
  workspace_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  value JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, storage_key)
);

CREATE INDEX IF NOT EXISTS crm_kv_updated_at_idx
  ON crm_kv (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_audit_log (
  workspace_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  screen TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_value JSONB,
  after_value JSONB,
  summary TEXT NOT NULL,
  PRIMARY KEY (workspace_id, event_id)
);

CREATE INDEX IF NOT EXISTS crm_audit_log_event_at_idx
  ON crm_audit_log (workspace_id, event_at DESC);

CREATE INDEX IF NOT EXISTS crm_audit_log_screen_action_idx
  ON crm_audit_log (workspace_id, screen, action, event_at DESC);

-- crm_kv remains a transactionally maintained projection for v2/v3 backups.
CREATE TABLE IF NOT EXISTS crm_workspace_version (
  workspace_id TEXT PRIMARY KEY,
  generation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_document (
  workspace_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  collection BOOLEAN NOT NULL,
  head TEXT NOT NULL,
  PRIMARY KEY (workspace_id, storage_key)
);
CREATE TABLE IF NOT EXISTS crm_item (
  workspace_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  item_id TEXT NOT NULL,
  version TEXT NOT NULL,
  value JSONB NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (workspace_id, storage_key, item_id)
);
CREATE TABLE IF NOT EXISTS crm_save_request (
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, request_id)
);
CREATE INDEX IF NOT EXISTS crm_save_request_created_at_idx ON crm_save_request (created_at);
