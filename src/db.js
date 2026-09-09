import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildAuditEntries } from "./audit.js";

const { Pool } = pg;
const schemaUrl = new URL("../schema.sql", import.meta.url);

export function createDatabasePool(connectionString) {
  let enableChannelBinding = false;
  try {
    enableChannelBinding = new URL(connectionString).searchParams.get("channel_binding") === "require";
  } catch {
    // Pool reports the invalid connection string when a connection is attempted.
  }
  const pool = new Pool({
    connectionString,
    enableChannelBinding,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true
  });
  // 유휴 커넥션이 끊길 때(예: 서버리스 DB의 유휴 종료) error 이벤트를 받지 않으면 프로세스 전체가 종료됨
  pool.on("error", (error) => {
    console.error("Idle database client error", error);
  });
  return pool;
}

// 트랜잭션 실패 시 원인 오류를 보존하고, 죽은 커넥션이 풀로 반환되지 않게 정리
async function rollbackAndRelease(client, error) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback failed after transaction error", rollbackError);
  }
  client.release(error);
}

export async function ensureSchema(pool) {
  const sql = await readFile(schemaUrl, "utf8");
  await pool.query(sql);
}

function mapStorageRows(rows) {
  return rows.map((row) => ({
    key: row.storage_key,
    value: row.value,
    revision: Number(row.revision),
    updatedAt: row.updated_at
  }));
}

function mapAuditRows(rows) {
  return rows.map((row) => ({
    eventId: row.event_id,
    eventAt: row.event_at,
    screen: row.screen,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    storageKey: row.storage_key,
    changedFields: row.changed_fields,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    summary: row.summary
  }));
}

async function insertAuditRows(client, workspaceId, entries) {
  if (!entries.length) return;
  const payload = entries.map((entry) => ({
    event_id: entry.eventId,
    event_at: entry.eventAt,
    screen: entry.screen,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    entity_label: entry.entityLabel,
    storage_key: entry.storageKey,
    changed_fields: entry.changedFields || [],
    before_value: entry.beforeValue ?? null,
    after_value: entry.afterValue ?? null,
    summary: entry.summary
  }));
  await client.query(
    [
      "INSERT INTO crm_audit_log",
      "(workspace_id, event_id, event_at, screen, action, entity_type, entity_id, entity_label, storage_key, changed_fields, before_value, after_value, summary)",
      "SELECT $1, item.event_id, item.event_at, item.screen, item.action, item.entity_type, item.entity_id, item.entity_label, item.storage_key, item.changed_fields, item.before_value, item.after_value, item.summary",
      "FROM jsonb_to_recordset($2::jsonb) AS item(",
      "event_id TEXT, event_at TIMESTAMPTZ, screen TEXT, action TEXT, entity_type TEXT, entity_id TEXT, entity_label TEXT, storage_key TEXT,",
      "changed_fields JSONB, before_value JSONB, after_value JSONB, summary TEXT)",
      "ON CONFLICT (workspace_id, event_id) DO NOTHING"
    ].join(" "),
    [workspaceId, JSON.stringify(payload)]
  );
}

export function createPostgresRepository(pool) {
  return {
    async health() {
      await pool.query("SELECT 1");
    },

    async get(workspaceId, storageKey) {
      const result = await pool.query(
        "SELECT value, revision, updated_at FROM crm_kv WHERE workspace_id = $1 AND storage_key = $2",
        [workspaceId, storageKey]
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      return {
        value: row.value,
        revision: Number(row.revision),
        updatedAt: row.updated_at
      };
    },

    async set(workspaceId, storageKey, value) {
      const result = await pool.query(
        [
          "INSERT INTO crm_kv (workspace_id, storage_key, value)",
          "VALUES ($1, $2, $3::jsonb)",
          "ON CONFLICT (workspace_id, storage_key) DO UPDATE",
          "SET value = EXCLUDED.value,",
          "    revision = crm_kv.revision + 1,",
          "    updated_at = NOW()",
          "RETURNING revision, updated_at"
        ].join(" "),
        [workspaceId, storageKey, JSON.stringify(value)]
      );
      return {
        revision: Number(result.rows[0].revision),
        updatedAt: result.rows[0].updated_at
      };
    },

    async setWithAudit(workspaceId, storageKey, value, expectedRevision) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const previousResult = await client.query(
          "SELECT value, revision FROM crm_kv WHERE workspace_id = $1 AND storage_key = $2 FOR UPDATE",
          [workspaceId, storageKey]
        );
        const beforeValue = previousResult.rowCount ? previousResult.rows[0].value : null;
        /* 클라이언트가 읽은 시점 이후 다른 기기가 저장했으면 덮어쓰지 않고 충돌로 알림 (행 잠금 상태라 원자적) */
        const currentRevision = previousResult.rowCount ? Number(previousResult.rows[0].revision) : 0;
        if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== currentRevision) {
          const conflict = new Error("revision_conflict");
          conflict.code = "revision_conflict";
          conflict.currentRevision = currentRevision;
          throw conflict;
        }
        const result = await client.query(
          [
            "INSERT INTO crm_kv (workspace_id, storage_key, value)",
            "VALUES ($1, $2, $3::jsonb)",
            "ON CONFLICT (workspace_id, storage_key) DO UPDATE",
            "SET value = EXCLUDED.value,",
            "    revision = crm_kv.revision + 1,",
            "    updated_at = NOW()",
            "RETURNING revision, updated_at"
          ].join(" "),
          [workspaceId, storageKey, JSON.stringify(value)]
        );
        const auditEntries = buildAuditEntries({ storageKey, beforeValue, afterValue: value });
        await insertAuditRows(client, workspaceId, auditEntries);
        await client.query("COMMIT");
        client.release();
        return {
          revision: Number(result.rows[0].revision),
          updatedAt: result.rows[0].updated_at,
          auditCount: auditEntries.length
        };
      } catch (error) {
        await rollbackAndRelease(client, error);
        throw error;
      }
    },

    async delete(workspaceId, storageKey) {
      const result = await pool.query(
        "DELETE FROM crm_kv WHERE workspace_id = $1 AND storage_key = $2",
        [workspaceId, storageKey]
      );
      return result.rowCount > 0;
    },

    async deleteWithAudit(workspaceId, storageKey) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const previousResult = await client.query(
          "SELECT value FROM crm_kv WHERE workspace_id = $1 AND storage_key = $2 FOR UPDATE",
          [workspaceId, storageKey]
        );
        if (!previousResult.rowCount) {
          await client.query("COMMIT");
          client.release();
          return { deleted: false, auditCount: 0 };
        }
        const result = await client.query(
          "DELETE FROM crm_kv WHERE workspace_id = $1 AND storage_key = $2",
          [workspaceId, storageKey]
        );
        const auditEntries = buildAuditEntries({
          storageKey,
          beforeValue: previousResult.rows[0].value,
          afterValue: null
        });
        await insertAuditRows(client, workspaceId, auditEntries);
        await client.query("COMMIT");
        client.release();
        return { deleted: result.rowCount > 0, auditCount: auditEntries.length };
      } catch (error) {
        await rollbackAndRelease(client, error);
        throw error;
      }
    },

    async exportAll(workspaceId) {
      const result = await pool.query(
        "SELECT storage_key, value, revision, updated_at FROM crm_kv WHERE workspace_id = $1 ORDER BY storage_key",
        [workspaceId]
      );
      return mapStorageRows(result.rows);
    },

    async exportAudit(workspaceId) {
      const result = await pool.query(
        [
          "SELECT event_id, event_at, screen, action, entity_type, entity_id, entity_label, storage_key,",
          "changed_fields, before_value, after_value, summary",
          "FROM crm_audit_log WHERE workspace_id = $1 ORDER BY event_at, event_id"
        ].join(" "),
        [workspaceId]
      );
      return mapAuditRows(result.rows);
    },

    async exportSnapshot(workspaceId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const recordsResult = await client.query(
          "SELECT storage_key, value, revision, updated_at FROM crm_kv WHERE workspace_id = $1 ORDER BY storage_key",
          [workspaceId]
        );
        const auditResult = await client.query(
          [
            "SELECT event_id, event_at, screen, action, entity_type, entity_id, entity_label, storage_key,",
            "changed_fields, before_value, after_value, summary",
            "FROM crm_audit_log WHERE workspace_id = $1 ORDER BY event_at, event_id"
          ].join(" "),
          [workspaceId]
        );
        await client.query("COMMIT");
        client.release();
        return { records: mapStorageRows(recordsResult.rows), auditLogs: mapAuditRows(auditResult.rows) };
      } catch (error) {
        await rollbackAndRelease(client, error);
        throw error;
      }
    },

    async restoreSnapshot(workspaceId, records, auditLogs, restoreEntry) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM crm_audit_log WHERE workspace_id = $1", [workspaceId]);
        await client.query("DELETE FROM crm_kv WHERE workspace_id = $1", [workspaceId]);
        if (records.length) {
          const recordPayload = records.map((record) => ({
            key: record.key,
            value: record.value,
            revision: record.revision,
            updated_at: record.updatedAt
          }));
          await client.query(
            [
              "INSERT INTO crm_kv (workspace_id, storage_key, value, revision, updated_at)",
              /* JSON null 값은 SQL NULL로 변환되어 NOT NULL 제약을 깨므로 jsonb null로 보존 */
              "SELECT $1, item.key, COALESCE(item.value, 'null'::jsonb), item.revision, item.updated_at",
              "FROM jsonb_to_recordset($2::jsonb) AS item(key TEXT, value JSONB, revision BIGINT, updated_at TIMESTAMPTZ)"
            ].join(" "),
            [workspaceId, JSON.stringify(recordPayload)]
          );
        }
        await insertAuditRows(client, workspaceId, auditLogs);
        await insertAuditRows(client, workspaceId, [restoreEntry]);
        await client.query("COMMIT");
        client.release();
        return { recordCount: records.length, auditLogCount: auditLogs.length + 1 };
      } catch (error) {
        await rollbackAndRelease(client, error);
        throw error;
      }
    },

    /* 감사 로그가 무한히 쌓여 DB 용량 한도를 넘지 않도록 보존 기간이 지난 항목을 정리 */
    async pruneAuditLogs(retentionDays) {
      const days = Number(retentionDays);
      if (!Number.isFinite(days) || days <= 0) return 0;
      const result = await pool.query(
        "DELETE FROM crm_audit_log WHERE event_at < NOW() - ($1 * INTERVAL '1 day')",
        [days]
      );
      return result.rowCount;
    },

    async close() {
      await pool.end();
    }
  };
}
