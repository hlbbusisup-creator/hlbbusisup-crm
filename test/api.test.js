import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { buildAuditEntries } from "../src/audit.js";

async function withServer(app, callback) {
  const testServer = app.listen(0, "127.0.0.1");
  await once(testServer, "listening");
  const address = testServer.address();
  try {
    return await callback("http://127.0.0.1:" + address.port);
  } finally {
    testServer.close();
    await once(testServer, "close");
  }
}

const records = new Map();
let auditLogs = [];
const requestedAdminCode = Buffer.from("aGxiMTMyNTAh", "base64").toString("utf8");
const repository = {
  async health() {},
  async get(workspaceId, key) {
    return records.get(workspaceId + "|" + key) || null;
  },
  async set(workspaceId, key, value) {
    const id = workspaceId + "|" + key;
    const previous = records.get(id);
    const record = {
      value,
      revision: previous ? previous.revision + 1 : 1,
      updatedAt: new Date().toISOString()
    };
    records.set(id, record);
    return { revision: record.revision, updatedAt: record.updatedAt };
  },
  async setWithAudit(workspaceId, key, value, expectedRevision) {
    const previous = records.get(workspaceId + "|" + key);
    const currentRevision = previous ? previous.revision : 0;
    if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== currentRevision) {
      const conflict = new Error("revision_conflict");
      conflict.code = "revision_conflict";
      conflict.currentRevision = currentRevision;
      throw conflict;
    }
    const result = await this.set(workspaceId, key, value);
    const entries = buildAuditEntries({
      storageKey: key,
      beforeValue: previous?.value ?? null,
      afterValue: value
    });
    auditLogs.push(...entries.map((entry) => ({ workspaceId, ...entry })));
    return { ...result, auditCount: entries.length };
  },
  async delete(workspaceId, key) {
    return records.delete(workspaceId + "|" + key);
  },
  async deleteWithAudit(workspaceId, key) {
    const id = workspaceId + "|" + key;
    const previous = records.get(id);
    const deleted = records.delete(id);
    const entries = deleted ? buildAuditEntries({
      storageKey: key,
      beforeValue: previous?.value ?? null,
      afterValue: null
    }) : [];
    auditLogs.push(...entries.map((entry) => ({ workspaceId, ...entry })));
    return { deleted, auditCount: entries.length };
  },
  async exportAll(workspaceId) {
    return [...records.entries()]
      .filter(([id]) => id.startsWith(workspaceId + "|"))
      .map(([id, record]) => ({ key: id.split("|").slice(1).join("|"), ...record }))
      .sort((left, right) => left.key.localeCompare(right.key));
  },
  async exportAudit(workspaceId) {
    return auditLogs
      .filter((entry) => entry.workspaceId === workspaceId)
      .map(({ workspaceId: _workspaceId, ...entry }) => structuredClone(entry));
  },
  async exportSnapshot(workspaceId) {
    return { records: await this.exportAll(workspaceId), auditLogs: await this.exportAudit(workspaceId) };
  },
  async restoreSnapshot(workspaceId, snapshotRecords, snapshotAuditLogs, restoreEntry) {
    for (const id of [...records.keys()]) {
      if (id.startsWith(workspaceId + "|")) records.delete(id);
    }
    snapshotRecords.forEach((record) => records.set(workspaceId + "|" + record.key, {
      value: structuredClone(record.value),
      revision: record.revision,
      updatedAt: record.updatedAt
    }));
    auditLogs = auditLogs.filter((entry) => entry.workspaceId !== workspaceId);
    auditLogs.push(...snapshotAuditLogs.map((entry) => ({ workspaceId, ...structuredClone(entry) })));
    auditLogs.push({ workspaceId, ...structuredClone(restoreEntry) });
    return { recordCount: snapshotRecords.length, auditLogCount: snapshotAuditLogs.length + 1 };
  }
};

const accessKey = "test-access-key-1234567890";
const app = createApp({ repository, accessKey, workspaceId: "test" });
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  baseUrl = "http://127.0.0.1:" + address.port;
});

after(async () => {
  server.close();
  await once(server, "close");
});

async function createAdminSession(url = baseUrl, code = requestedAdminCode) {
  const response = await fetch(url + "/api/admin/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-crm-key": accessKey
    },
    body: JSON.stringify({ code })
  });
  return { response, body: await response.json() };
}

test("health check verifies the repository", async () => {
  const response = await fetch(baseUrl + "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "connected" });
});

test("API rejects a missing or wrong access key", async () => {
  const missing = await fetch(baseUrl + "/api/session");
  assert.equal(missing.status, 401);

  const wrong = await fetch(baseUrl + "/api/session", {
    headers: { "x-crm-key": "wrong-key" }
  });
  assert.equal(wrong.status, 401);
});

test("authenticated session reports the selected workspace", async () => {
  const response = await fetch(baseUrl + "/api/session", {
    headers: { "x-crm-key": accessKey }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    workspaceId: "test",
    database: "connected"
  });
});

test("administrator code gates backup download and point-in-time restore", async () => {
  const accessHeaders = { "x-crm-key": accessKey };
  const deniedBackup = await fetch(baseUrl + "/api/admin/backup", { headers: accessHeaders });
  assert.equal(deniedBackup.status, 403);

  const wrongAdmin = await createAdminSession(baseUrl, "wrong-admin-code");
  assert.equal(wrongAdmin.response.status, 403);
  assert.deepEqual(wrongAdmin.body, { error: "invalid_admin_code" });

  const admin = await createAdminSession();
  assert.equal(admin.response.status, 200);
  assert.match(admin.body.token, /^[^.]+\.[^.]+$/);
  assert.ok(new Date(admin.body.expiresAt).getTime() > Date.now());
  const headers = {
    ...accessHeaders,
    authorization: "Bearer " + admin.body.token,
    "content-type": "application/json"
  };
  const storageUrl = baseUrl + "/api/storage/" + encodeURIComponent("tinico:calendar:events");

  await fetch(storageUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: [{ id: "event-restore", title: "복원 기준 일정", date: "2026-08-04" }] })
  });
  const backupResponse = await fetch(baseUrl + "/api/admin/backup", { headers });
  assert.equal(backupResponse.status, 200);
  const backup = await backupResponse.json();
  assert.equal(backup.format, "tiniko-crm-admin-backup-v3");
  assert.match(backup.exportedAtKST, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} KST$/);
  assert.ok(backup.summary.byScreen["캘린더"] >= 1);
  assert.match(backup.data.auditLogs.find((entry) => entry.screen === "캘린더").eventAtKST, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} KST$/);

  await fetch(storageUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: [{ id: "event-restore", title: "복원 후에 입력된 일정", date: "2026-08-05" }] })
  });
  const mismatchBackup = structuredClone(backup);
  mismatchBackup.workspaceId = "another-workspace";
  const mismatch = await fetch(baseUrl + "/api/admin/restore", {
    method: "POST",
    headers,
    body: JSON.stringify({ backup: mismatchBackup })
  });
  assert.equal(mismatch.status, 409);

  const restored = await fetch(baseUrl + "/api/admin/restore", {
    method: "POST",
    headers,
    body: JSON.stringify({ backup })
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).status, "restored");
  const restoredValue = await fetch(storageUrl, { headers });
  assert.equal((await restoredValue.json()).value[0].title, "복원 기준 일정");

  const afterRestore = await fetch(baseUrl + "/api/admin/backup", { headers });
  const afterRestoreBackup = await afterRestore.json();
  assert.ok(afterRestoreBackup.data.auditLogs.some((entry) => entry.action === "복원"));
});

test("storage values can be written, read, exported, and deleted", async () => {
  const headers = {
    "content-type": "application/json",
    "x-crm-key": accessKey
  };
  const encodedKey = encodeURIComponent("tinico:contacts");

  const saved = await fetch(baseUrl + "/api/storage/" + encodedKey, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: [{ id: "contact-1", name: "홍길동" }] })
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);

  const savedAgain = await fetch(baseUrl + "/api/storage/" + encodedKey, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: [{ id: "contact-1", name: "홍길동", company: "티니코" }] })
  });
  assert.equal(savedAgain.status, 200);
  assert.equal((await savedAgain.json()).revision, 2);

  const loaded = await fetch(baseUrl + "/api/storage/" + encodedKey, { headers });
  assert.equal(loaded.status, 200);
  assert.deepEqual((await loaded.json()).value, [{ id: "contact-1", name: "홍길동", company: "티니코" }]);

  const adminSession = await createAdminSession();
  assert.equal(adminSession.response.status, 200);
  const exported = await fetch(baseUrl + "/api/export", {
    headers: { ...headers, authorization: "Bearer " + adminSession.body.token }
  });
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("cache-control"), "no-store");
  const exportedBody = await exported.json();
  assert.equal(exportedBody.tinikoCRMBackupVersion, 3);
  assert.ok(exportedBody.data.records.some((record) => record.key === "tinico:contacts"));
  assert.ok(exportedBody.data.auditLogs.some((entry) => entry.screen === "연락처" && entry.action === "입력"));
  assert.ok(exportedBody.data.auditLogs.some((entry) => entry.screen === "연락처" && entry.action === "수정"));

  const deleted = await fetch(baseUrl + "/api/storage/" + encodedKey, {
    method: "DELETE",
    headers
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).deleted, true);

  const deletedAgain = await fetch(baseUrl + "/api/storage/" + encodedKey, {
    method: "DELETE",
    headers
  });
  assert.equal((await deletedAgain.json()).deleted, false);

  const empty = await fetch(baseUrl + "/api/storage/" + encodedKey, { headers });
  assert.equal((await empty.json()).value, null);
});

test("stale baseRevision writes are rejected with 409 and do not overwrite", async () => {
  const headers = { "content-type": "application/json", "x-crm-key": accessKey };
  const url = baseUrl + "/api/storage/" + encodeURIComponent("tinico:test:conflict");

  const first = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ value: { n: 1 } }) });
  assert.equal(first.status, 200);
  const firstBody = await first.json();

  const second = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: { n: 2 }, baseRevision: firstBody.revision })
  });
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.revision, firstBody.revision + 1);

  const stale = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: { n: 3 }, baseRevision: firstBody.revision })
  });
  assert.equal(stale.status, 409);
  const staleBody = await stale.json();
  assert.equal(staleBody.error, "revision_conflict");
  assert.equal(staleBody.currentRevision, secondBody.revision);

  const invalid = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: { n: 4 }, baseRevision: -1 })
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid_base_revision" });

  const read = await fetch(url, { headers: { "x-crm-key": accessKey } });
  assert.deepEqual((await read.json()).value, { n: 2 });
});

test("storage endpoint accepts only TINIKO namespaced keys", async () => {
  const response = await fetch(baseUrl + "/api/storage/" + encodeURIComponent("other:key"), {
    headers: { "x-crm-key": accessKey }
  });
  assert.equal(response.status, 400);

  const tooLong = await fetch(baseUrl + "/api/storage/" + encodeURIComponent("tinico:" + "x".repeat(241)), {
    headers: { "x-crm-key": accessKey }
  });
  assert.equal(tooLong.status, 400);
});

test("storage writes require a value and malformed JSON is a client error", async () => {
  const headers = {
    "content-type": "application/json",
    "x-crm-key": accessKey
  };
  const url = baseUrl + "/api/storage/" + encodeURIComponent("tinico:test");
  const missingValue = await fetch(url, {
    method: "PUT",
    headers,
    body: "{}"
  });
  assert.equal(missingValue.status, 400);
  assert.deepEqual(await missingValue.json(), { error: "value_is_required" });

  const malformed = await fetch(url, {
    method: "PUT",
    headers,
    body: "{not-json"
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "invalid_json" });
});

test("static CRM routes and security headers are configured", async () => {
  const response = await fetch(baseUrl + "/pipeline");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>HLB-현장지원팀 CRM 간편 모드<\/title>/);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
  const contentSecurityPolicy = response.headers.get("content-security-policy") || "";
  assert.match(contentSecurityPolicy, /accounts\.google\.com/);
  assert.match(contentSecurityPolicy, /cdn\.jsdelivr\.net/);
  assert.match(contentSecurityPolicy, /tessdata\.projectnaptha\.com/);
  assert.match(contentSecurityPolicy, /worker-src[^;]*blob:/);
  assert.match(response.headers.get("cache-control") || "", /no-cache/);

  const missingApi = await fetch(baseUrl + "/api/not-found");
  assert.equal(missingApi.status, 404);
  assert.deepEqual(await missingApi.json(), { error: "not_found" });
});

test("unexpected repository failures return an opaque request ID", async () => {
  const failingRepository = {
    async health() { throw new Error("database password must stay private"); },
    async get() {},
    async set() {},
    async delete() {},
    async exportAll() {}
  };
  const failingApp = createApp({ repository: failingRepository, accessKey, workspaceId: "failure-test" });
  const originalError = console.error;
  console.error = () => {};
  try {
    await withServer(failingApp, async (url) => {
      const response = await fetch(url + "/api/health");
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.error, "server_error");
      assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
      assert.equal(JSON.stringify(body).includes("password"), false);
    });
  } finally {
    console.error = originalError;
  }
});

test("oversized JSON is rejected with 413", async () => {
  const previousLimit = process.env.CRM_BODY_LIMIT;
  process.env.CRM_BODY_LIMIT = "64b";
  const limitedApp = createApp({ repository, accessKey, workspaceId: "limited" });
  if (previousLimit === undefined) delete process.env.CRM_BODY_LIMIT;
  else process.env.CRM_BODY_LIMIT = previousLimit;

  await withServer(limitedApp, async (url) => {
    const response = await fetch(url + "/api/storage/" + encodeURIComponent("tinico:large"), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-crm-key": accessKey
      },
      body: JSON.stringify({ value: "x".repeat(256) })
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "payload_too_large" });
  });
});

test("app configuration requires a repository and a sufficiently long key", () => {
  assert.throws(() => createApp({ repository: null, accessKey }), /repository is required/);
  assert.throws(() => createApp({ repository, accessKey: "too-short" }), /at least 16 characters/);
  assert.throws(() => createApp({ repository, accessKey, adminCode: "short" }), /at least 8 characters/);
});
