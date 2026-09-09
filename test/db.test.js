import assert from "node:assert/strict";
import { test } from "node:test";
import { createDatabasePool, createPostgresRepository, ensureSchema } from "../src/db.js";

test("Neon channel binding from the connection string is passed to pg", async () => {
  const required = createDatabasePool("postgresql://user:password@example.com/db?sslmode=require&channel_binding=require");
  const defaultPool = createDatabasePool("postgresql://user:password@example.com/db?sslmode=require");
  try {
    assert.equal(required.options.enableChannelBinding, true);
    assert.equal(defaultPool.options.enableChannelBinding, false);
  } finally {
    await Promise.all([required.end(), defaultPool.end()]);
  }
});

test("schema initialization sends the bundled SQL to PostgreSQL", async () => {
  let receivedSql = "";
  await ensureSchema({
    async query(sql) { receivedSql = sql; }
  });
  assert.match(receivedSql, /CREATE TABLE IF NOT EXISTS crm_kv/i);
  assert.match(receivedSql, /CREATE TABLE IF NOT EXISTS crm_audit_log/i);
  assert.match(receivedSql, /PRIMARY KEY \(workspace_id, storage_key\)/i);
  assert.match(receivedSql, /crm_audit_log_event_at_idx/i);
});

test("PostgreSQL repository maps records and revisions", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^SELECT value/i.test(sql)) {
        return { rowCount: 1, rows: [{ value: { saved: true }, revision: "3", updated_at: "2026-08-03T00:00:00.000Z" }] };
      }
      if (/^INSERT INTO/i.test(sql)) {
        return { rowCount: 1, rows: [{ revision: "4", updated_at: "2026-08-03T00:01:00.000Z" }] };
      }
      if (/^DELETE/i.test(sql)) return { rowCount: 1, rows: [] };
      if (/^SELECT storage_key/i.test(sql)) {
        return { rowCount: 1, rows: [{ storage_key: "tinico:test", value: [1], revision: "4", updated_at: "2026-08-03T00:01:00.000Z" }] };
      }
      if (/SELECT 1/.test(sql)) return { rowCount: 1, rows: [{ "?column?": 1 }] };
      throw new Error("unexpected SQL in test: " + sql);
    },
    async end() { calls.push({ sql: "END" }); }
  };
  const repository = createPostgresRepository(pool);

  await repository.health();
  assert.deepEqual(await repository.get("workspace", "tinico:test"), {
    value: { saved: true },
    revision: 3,
    updatedAt: "2026-08-03T00:00:00.000Z"
  });
  assert.deepEqual(await repository.set("workspace", "tinico:test", { saved: true }), {
    revision: 4,
    updatedAt: "2026-08-03T00:01:00.000Z"
  });
  assert.equal(calls.find((call) => /^INSERT INTO/i.test(call.sql)).params[2], JSON.stringify({ saved: true }));
  assert.equal(await repository.delete("workspace", "tinico:test"), true);
  assert.deepEqual(await repository.exportAll("workspace"), [{
    key: "tinico:test",
    value: [1],
    revision: 4,
    updatedAt: "2026-08-03T00:01:00.000Z"
  }]);
  await repository.close();
  assert.equal(calls.at(-1).sql, "END");
});

test("audited PostgreSQL writes commit data and a screen-level change log together", async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^SELECT value, revision FROM crm_kv/i.test(sql)) {
        return { rowCount: 1, rows: [{ value: [{ id: "contact-1", name: "이전 이름" }], revision: "1" }] };
      }
      if (/^INSERT INTO crm_kv/i.test(sql)) {
        return { rowCount: 1, rows: [{ revision: "2", updated_at: "2026-08-04T01:02:03.000Z" }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() { released = true; }
  };
  const repository = createPostgresRepository({ async connect() { return client; } });
  const result = await repository.setWithAudit("workspace", "tinico:contacts", [{ id: "contact-1", name: "새 이름" }]);

  assert.equal(result.revision, 2);
  assert.equal(result.auditCount, 1);
  const auditInsert = calls.find((call) => /^INSERT INTO crm_audit_log/i.test(call.sql));
  assert.ok(auditInsert);
  const [entry] = JSON.parse(auditInsert.params[1]);
  assert.equal(entry.screen, "연락처");
  assert.equal(entry.action, "수정");
  assert.equal(entry.changed_fields[0].label, "이름");
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
  assert.equal(released, true);
});

test("audit log pruning deletes entries older than the retention window", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 7, rows: [] };
    }
  };
  const repository = createPostgresRepository(pool);
  assert.equal(await repository.pruneAuditLogs(90), 7);
  assert.match(calls[0].sql, /DELETE FROM crm_audit_log WHERE event_at </);
  assert.deepEqual(calls[0].params, [90]);
  assert.equal(await repository.pruneAuditLogs(0), 0, "retention 0 disables pruning");
  assert.equal(calls.length, 1, "disabled pruning must not touch the database");
});

test("audited writes with a stale expected revision roll back with a conflict", async () => {
  const calls = [];
  let releasedWith;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^SELECT value, revision FROM crm_kv/i.test(sql)) {
        return { rowCount: 1, rows: [{ value: { n: 1 }, revision: "5" }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release(error) { releasedWith = error; }
  };
  const repository = createPostgresRepository({ async connect() { return client; } });
  await assert.rejects(
    repository.setWithAudit("workspace", "tinico:test", { n: 2 }, 4),
    (error) => error.code === "revision_conflict" && error.currentRevision === 5
  );
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"), "conflict must roll the transaction back");
  assert.ok(!calls.some((call) => /^INSERT INTO crm_kv/i.test(call.sql)), "conflicting write must not reach the table");
  assert.ok(releasedWith instanceof Error, "client is released with the error so the connection is discarded");
});
