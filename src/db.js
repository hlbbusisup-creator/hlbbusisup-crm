import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildAuditEntries } from "./audit.js";
import { randomUUID } from "node:crypto";
import { initialDocument, publicDocument, applyChange, validateTransaction, requestFingerprint, concurrencyError } from "./concurrency.js";
import { hashMemberPassword, memberPasswordMatches } from "./members.js";

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
    actorId: row.actor_id ?? null,
    actorName: row.actor_name ?? null,
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
    actor_id: entry.actorId ?? null,
    actor_name: entry.actorName ?? null,
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
      "(workspace_id, event_id, event_at, actor_id, actor_name, screen, action, entity_type, entity_id, entity_label, storage_key, changed_fields, before_value, after_value, summary)",
      "SELECT $1, item.event_id, item.event_at, item.actor_id, item.actor_name, item.screen, item.action, item.entity_type, item.entity_id, item.entity_label, item.storage_key, item.changed_fields, item.before_value, item.after_value, item.summary",
      "FROM jsonb_to_recordset($2::jsonb) AS item(",
      "event_id TEXT, event_at TIMESTAMPTZ, actor_id TEXT, actor_name TEXT, screen TEXT, action TEXT, entity_type TEXT, entity_id TEXT, entity_label TEXT, storage_key TEXT,",
      "changed_fields JSONB, before_value JSONB, after_value JSONB, summary TEXT)",
      "ON CONFLICT (workspace_id, event_id) DO NOTHING"
    ].join(" "),
    [workspaceId, JSON.stringify(payload)]
  );
}

export function createPostgresRepository(pool) {
  // A short database-only workspace lock orders saves, first-time migration and restore.
  // Editors never hold a lock. Version checks remain per item, including in a batch.
  async function lockWorkspace(client, workspaceId) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["crm-save:" + workspaceId]);
    await client.query("INSERT INTO crm_workspace_version (workspace_id, generation) VALUES ($1, $2) ON CONFLICT DO NOTHING", [workspaceId, randomUUID()]);
    const result = await client.query("SELECT generation FROM crm_workspace_version WHERE workspace_id = $1", [workspaceId]);
    return result.rows[0].generation;
  }
  async function persistItems(client, workspaceId, doc, previous) {
    await client.query("INSERT INTO crm_document (workspace_id, storage_key, collection, head) VALUES ($1, $2, $3, $4) ON CONFLICT (workspace_id, storage_key) DO UPDATE SET head = EXCLUDED.head", [workspaceId, doc.key, doc.collection, doc.head]);
    const versions = new Map((previous?.items || []).map(item => [item.id, item.version]));
    const changed = doc.items.filter(item => versions.get(item.id) !== item.version);
    if (changed.length) await client.query(
      "INSERT INTO crm_item (workspace_id, storage_key, item_id, version, value, deleted) SELECT $1, $2, i.id, i.version, COALESCE(i.value, 'null'::jsonb), i.deleted FROM jsonb_to_recordset($3::jsonb) AS i(id TEXT, version TEXT, value JSONB, deleted BOOLEAN) ON CONFLICT (workspace_id, storage_key, item_id) DO UPDATE SET version = EXCLUDED.version, value = EXCLUDED.value, deleted = EXCLUDED.deleted",
      [workspaceId, doc.key, JSON.stringify(changed)]);
  }
  async function loadDocument(client, workspaceId, key) {
    const record = await client.query("SELECT value, revision, updated_at FROM crm_kv WHERE workspace_id = $1 AND storage_key = $2", [workspaceId, key]);
    const meta = await client.query("SELECT collection, head FROM crm_document WHERE workspace_id = $1 AND storage_key = $2", [workspaceId, key]);
    const row = record.rows[0];
    if (!meta.rowCount) {
      const doc = initialDocument(key, row ? { value: row.value, revision: Number(row.revision), updatedAt: row.updated_at } : null);
      await persistItems(client, workspaceId, doc);
      return doc;
    }
    const items = await client.query("SELECT item_id AS id, version, value, deleted FROM crm_item WHERE workspace_id = $1 AND storage_key = $2", [workspaceId, key]);
    return { key, ...meta.rows[0], value: row?.value ?? null, revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null, items: items.rows };
  }
  async function persistDocument(client, workspaceId, doc, previous, actor) {
    await persistItems(client, workspaceId, doc, previous);
    await client.query("INSERT INTO crm_kv (workspace_id, storage_key, value, revision, updated_at) VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (workspace_id, storage_key) DO UPDATE SET value = EXCLUDED.value, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at", [workspaceId, doc.key, JSON.stringify(doc.value), doc.revision, doc.updatedAt]);
    await insertAuditRows(client, workspaceId, buildAuditEntries({ storageKey: doc.key, beforeValue: previous.value, afterValue: doc.value, actor }));
  }
  return {
    concurrent: true,
    async getConcurrent(workspaceId, key) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const generation = await lockWorkspace(client, workspaceId);
        const doc = await loadDocument(client, workspaceId, key);
        await client.query("COMMIT"); client.release();
        return publicDocument(doc, generation);
      } catch (error) { await rollbackAndRelease(client, error); throw error; }
    },
    async saveConcurrent(workspaceId, body, actor) {
      validateTransaction(body);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const generation = await lockWorkspace(client, workspaceId);
        if (body.generation !== generation) throw concurrencyError("workspace_restored", "전체 데이터가 복원되었습니다. 입력 내용을 복사한 뒤 페이지를 다시 열어 주세요.");
        const fingerprint = requestFingerprint(body);
        const replay = await client.query("SELECT fingerprint, result FROM crm_save_request WHERE workspace_id = $1 AND request_id = $2", [workspaceId, body.requestId]);
        if (replay.rowCount) {
          if (replay.rows[0].fingerprint !== fingerprint) throw concurrencyError("request_id_reused", "이미 사용한 저장 요청 번호입니다.");
          await client.query("COMMIT"); client.release(); return replay.rows[0].result;
        }
        const changed = new Map();
        const conflicts = [];
        for (const change of body.changes) {
          const before = await loadDocument(client, workspaceId, change.key);
          try { changed.set(change.key, { before, after: applyChange(before, change) }); }
          catch (error) { if (error.conflicts) conflicts.push(...error.conflicts); else throw error; }
        }
        if (conflicts.length) throw concurrencyError("revision_conflict", "다른 사용자가 먼저 저장했습니다. 입력 내용과 최신 값을 비교해 주세요.", { conflicts });
        // Contact display fields are derived from the saved contacts inside this same transaction.
        // Other authored deal fields are read from the latest row and left intact.
        const contactChange = changed.get("tinico:contacts");
        if (contactChange) {
          const contacts = new Map((contactChange.after.value || []).map(item => [item.id, item]));
          const affected = new Set(body.changes.find(change => change.key === "tinico:contacts").mutations.map(item => item.id));
          const keys = await client.query("SELECT storage_key FROM crm_kv WHERE workspace_id = $1 AND storage_key LIKE 'tinico:stage:%' AND storage_key <> 'tinico:stage:roadmap'", [workspaceId]);
          for (const row of keys.rows) {
            const key = row.storage_key;
            const existing = changed.get(key);
            const before = existing?.before || await loadDocument(client, workspaceId, key);
            const current = existing?.after || before;
            if (!current.collection) continue;
            const mutations = [];
            for (const deal of current.value || []) {
              if (!(deal.linkedContactIds || []).some(id => affected.has(id))) continue;
              const linked = (deal.linkedContactIds || []).map(id => contacts.get(id)).filter(Boolean);
              const primary = linked[0];
              const value = { ...deal, contactName: linked.map(item => String(item.name || "").trim()).filter(Boolean).join(", ") };
              if (primary) Object.assign(value, { contactRole: [primary.department, primary.jobTitle].filter(Boolean).join(" / "), contactPhone: primary.mobilePhone || primary.businessPhone || primary.phone || "", contactEmail: primary.email || "" });
              else Object.assign(value, { contactRole: "", contactPhone: "", contactEmail: "" });
              if (JSON.stringify(value) !== JSON.stringify(deal)) mutations.push({ id: deal.id, version: current.items.find(item => item.id === deal.id).version, value });
            }
            if (mutations.length) changed.set(key, { before, after: applyChange(current, { mutations }) });
          }
        }
        const records = {};
        for (const [key, { before, after }] of changed) {
          await persistDocument(client, workspaceId, after, before, actor);
          records[key] = publicDocument(after, generation);
        }
        const result = { status: "saved", records };
        await client.query("INSERT INTO crm_save_request (workspace_id, request_id, fingerprint, result) VALUES ($1, $2, $3, $4::jsonb)", [workspaceId, body.requestId, fingerprint, JSON.stringify(result)]);
        await client.query("COMMIT"); client.release(); return result;
      } catch (error) { await rollbackAndRelease(client, error); throw error; }
    },
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

    async setWithAudit(workspaceId, storageKey, value, expectedRevision, actor) {
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
        const auditEntries = buildAuditEntries({ storageKey, beforeValue, afterValue: value, actor });
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

    async deleteWithAudit(workspaceId, storageKey, actor) {
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
          afterValue: null,
          actor
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
          "SELECT event_id, event_at, actor_id, actor_name, screen, action, entity_type, entity_id, entity_label, storage_key,",
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
            "SELECT event_id, event_at, actor_id, actor_name, screen, action, entity_type, entity_id, entity_label, storage_key,",
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
        await lockWorkspace(client, workspaceId);
        await client.query("UPDATE crm_workspace_version SET generation = $2 WHERE workspace_id = $1", [workspaceId, randomUUID()]);
        await client.query("DELETE FROM crm_save_request WHERE workspace_id = $1", [workspaceId]);
        await client.query("DELETE FROM crm_item WHERE workspace_id = $1", [workspaceId]);
        await client.query("DELETE FROM crm_document WHERE workspace_id = $1", [workspaceId]);
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

    /* 설정 > 변경 이력 화면이 쓰는 조회. 값 전체(before/after)는 무거워 목록에서는 빼고,
       화면·동작·사용자·기간·검색어로 좁힌 뒤 페이지 단위로 가져온다. */
    async queryAudit(workspaceId, filters = {}) {
      const where = ["workspace_id = $1"];
      const params = [workspaceId];
      const push = (sql, value) => { params.push(value); where.push(sql.split("$n").join("$" + params.length)); };
      if (filters.screen) push("screen = $n", String(filters.screen));
      if (filters.action) push("action = $n", String(filters.action));
      if (filters.actorId) push("actor_id = $n", String(filters.actorId));
      if (filters.storageKey) push("storage_key = $n", String(filters.storageKey));
      if (filters.from) push("event_at >= $n", new Date(filters.from).toISOString());
      if (filters.to) push("event_at <= $n", new Date(filters.to).toISOString());
      if (filters.q) push("(entity_label ILIKE $n OR summary ILIKE $n OR COALESCE(actor_name, '') ILIKE $n)", "%" + String(filters.q) + "%");
      const clause = where.join(" AND ");
      const limit = Math.min(200, Math.max(1, Number(filters.limit) || 20));
      const offset = Math.max(0, Number(filters.offset) || 0);
      const totalResult = await pool.query("SELECT COUNT(*)::bigint AS total FROM crm_audit_log WHERE " + clause, params);
      const rowsResult = await pool.query(
        [
          "SELECT event_id, event_at, actor_id, actor_name, screen, action, entity_type, entity_id, entity_label, storage_key,",
          "changed_fields, NULL::jsonb AS before_value, NULL::jsonb AS after_value, summary",
          "FROM crm_audit_log WHERE " + clause,
          "ORDER BY event_at DESC, event_id DESC",
          "LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2)
        ].join(" "),
        [...params, limit, offset]
      );
      const screensResult = await pool.query(
        "SELECT screen, COUNT(*)::bigint AS count FROM crm_audit_log WHERE workspace_id = $1 GROUP BY screen ORDER BY screen",
        [workspaceId]
      );
      return {
        total: Number(totalResult.rows[0].total),
        limit,
        offset,
        entries: mapAuditRows(rowsResult.rows),
        screens: screensResult.rows.map((row) => ({ screen: row.screen, count: Number(row.count) }))
      };
    },

    /* ---- 사용자 계정 ---- */
    async listMembers(workspaceId) {
      const result = await pool.query(
        "SELECT member_id, name, email, role, disabled, password_hash, created_at, updated_at FROM crm_member WHERE workspace_id = $1 ORDER BY name, member_id",
        [workspaceId]
      );
      return result.rows.map((row) => ({
        id: row.member_id,
        name: row.name,
        email: row.email,
        role: row.role,
        disabled: row.disabled,
        hasPassword: !!row.password_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    async countActiveMembers(workspaceId) {
      const result = await pool.query("SELECT COUNT(*)::bigint AS total FROM crm_member WHERE workspace_id = $1 AND disabled = FALSE", [workspaceId]);
      return Number(result.rows[0].total);
    },

    async createMember(workspaceId, member) {
      const { hash, salt } = member.password ? hashMemberPassword(member.password) : { hash: null, salt: null };
      await pool.query(
        "INSERT INTO crm_member (workspace_id, member_id, name, email, role, password_hash, password_salt, disabled) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)",
        [workspaceId, member.id, member.name, member.email || "", member.role || "editor", hash, salt]
      );
      return (await this.listMembers(workspaceId)).find((row) => row.id === member.id) || null;
    },

    async updateMember(workspaceId, memberId, changes) {
      const sets = [];
      const params = [workspaceId, memberId];
      const push = (column, value) => { params.push(value); sets.push(column + " = $" + params.length); };
      if (changes.name !== undefined) push("name", changes.name);
      if (changes.email !== undefined) push("email", changes.email);
      if (changes.role !== undefined) push("role", changes.role);
      if (changes.disabled !== undefined) push("disabled", changes.disabled);
      if (changes.password !== undefined) {
        if (changes.password) {
          const { hash, salt } = hashMemberPassword(changes.password);
          push("password_hash", hash);
          push("password_salt", salt);
        } else {
          sets.push("password_hash = NULL", "password_salt = NULL");
        }
      }
      if (!sets.length) return (await this.listMembers(workspaceId)).find((row) => row.id === memberId) || null;
      sets.push("updated_at = NOW()");
      const result = await pool.query(
        "UPDATE crm_member SET " + sets.join(", ") + " WHERE workspace_id = $1 AND member_id = $2",
        params
      );
      if (!result.rowCount) return null;
      return (await this.listMembers(workspaceId)).find((row) => row.id === memberId) || null;
    },

    async deleteMember(workspaceId, memberId) {
      const result = await pool.query("DELETE FROM crm_member WHERE workspace_id = $1 AND member_id = $2", [workspaceId, memberId]);
      return result.rowCount > 0;
    },

    /* 비밀번호 대조는 저장소 안에서만 한다 — 해시와 소금이 바깥으로 나가지 않는다 */
    async verifyMemberPassword(workspaceId, memberId, password) {
      const result = await pool.query(
        "SELECT member_id, name, email, role, disabled, password_hash, password_salt FROM crm_member WHERE workspace_id = $1 AND member_id = $2",
        [workspaceId, memberId]
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      if (row.disabled) return null;
      /* 비밀번호를 아직 정하지 않은 사용자는 이름만으로 들어올 수 있다 (관리자가 나중에 지정) */
      if (row.password_hash && !memberPasswordMatches(password, row.password_hash, row.password_salt)) return null;
      if (!row.password_hash && String(password ?? "")) return null;
      return { id: row.member_id, name: row.name, email: row.email, role: row.role };
    },

    /* 감사 로그가 무한히 쌓여 DB 용량 한도를 넘지 않도록 보존 기간이 지난 항목을 정리 */
    async pruneSaveRequests() {
      const result = await pool.query("DELETE FROM crm_save_request WHERE created_at < NOW() - INTERVAL '7 days'");
      return result.rowCount;
    },
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
