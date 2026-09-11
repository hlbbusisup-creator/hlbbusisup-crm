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

-- 사용자 계정: 작업공간 접속키(CRM_ACCESS_KEY) 안쪽에서 "누가" 작업했는지 구분하고 쓰기 권한을 나눈다.
CREATE TABLE IF NOT EXISTS crm_member (
  workspace_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'editor',
  password_hash TEXT,
  password_salt TEXT,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, member_id)
);
CREATE INDEX IF NOT EXISTS crm_member_name_idx ON crm_member (workspace_id, name);

-- 변경 로그에 작업한 사용자를 남긴다 (사용자 계정을 쓰지 않는 작업공간은 NULL).
ALTER TABLE crm_audit_log ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE crm_audit_log ADD COLUMN IF NOT EXISTS actor_name TEXT;
