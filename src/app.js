import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { buildAuditEntries, createRestoreAuditEntry } from "./audit.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = path.resolve(moduleDir, "../public");
const defaultAdminCodeHash = Buffer.from("bca782ae62e8b5895faab89324c9e888c8a339c82a36848f0a2e2e5cbfad959f", "hex");
const maxBackupRecords = 5000;
const maxBackupAuditLogs = 100000;

function secretsMatch(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""), "utf8");
  const expectedBuffer = Buffer.from(String(expected || ""), "utf8");
  return actualBuffer.length === expectedBuffer.length &&
    actualBuffer.length > 0 &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function secretHash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest();
}

function adminCodeMatches(candidate, configuredAdminCode) {
  const candidateHash = secretHash(candidate);
  const expectedHash = configuredAdminCode ? secretHash(configuredAdminCode) : defaultAdminCodeHash;
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

function adminSessionSecret(accessKey, configuredAdminCode) {
  const adminHash = configuredAdminCode ? secretHash(configuredAdminCode) : defaultAdminCodeHash;
  return crypto.createHash("sha256")
    .update("tiniko-crm-admin-session\0")
    .update(accessKey)
    .update("\0")
    .update(adminHash)
    .digest();
}

function createAdminSessionToken({ accessKey, configuredAdminCode, workspaceId, lifetimeMinutes }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + lifetimeMinutes * 60;
  const payload = Buffer.from(JSON.stringify({
    workspaceId,
    scope: "admin-backup",
    iat: issuedAt,
    exp: expiresAt
  }), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", adminSessionSecret(accessKey, configuredAdminCode))
    .update(payload)
    .digest("base64url");
  return { token: payload + "." + signature, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

function verifyAdminSessionToken({ token, accessKey, configuredAdminCode, workspaceId }) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra !== undefined) return false;
  const expectedSignature = crypto.createHmac("sha256", adminSessionSecret(accessKey, configuredAdminCode))
    .update(payload)
    .digest("base64url");
  if (!secretsMatch(signature, expectedSignature)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.workspaceId === workspaceId &&
      parsed.scope === "admin-backup" &&
      Number(parsed.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function publicError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function validIso(value, fallback = new Date().toISOString()) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function cleanText(value, field, maxLength = 500) {
  const text = String(value ?? "");
  if (!text || text.length > maxLength) throw publicError("invalid_backup", field + " 값이 올바르지 않습니다.");
  return text;
}

function legacyBackupRecords(backup) {
  const data = backup.data || {};
  const updatedAt = validIso(backup.exportedAt);
  const values = new Map([
    ["tinico:app:settings", data.appSettings || {}],
    ["tinico:settings:stages", data.stages || []],
    ["tinico:settings:buckets", data.buckets || []],
    ["tinico:importance:config", data.importanceConfig || {}],
    ["tinico:areas", data.areas || []],
    ["tinico:stage:roadmap", data.roadmapData || []],
    ["tinico:manual:sections", data.manualSections || []],
    ["tinico:contacts", data.contactsData || []],
    ["tinico:calendar:events", data.calendarEntries || []],
    ["tinico:trash", data.trashData || []]
  ]);
  Object.entries(data.stageData || {}).forEach(([areaKey, value]) => {
    if (areaKey !== "roadmap") values.set("tinico:stage:" + areaKey, value);
  });
  return [...values].map(([key, value]) => ({ key, value, revision: 1, updatedAt }));
}

function normalizeBackupPayload(backup, workspaceId) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw publicError("invalid_backup", "백업 파일 형식이 올바르지 않습니다.");
  }
  if (backup.tinikoCRMBackupVersion === 2 && backup.data && typeof backup.data === "object") {
    const legacyRecords = legacyBackupRecords(backup);
    if (legacyRecords.length > maxBackupRecords) {
      throw publicError("backup_too_large", "백업 항목 수가 허용 범위를 초과했습니다.", 413);
    }
    const legacyKeys = new Set();
    legacyRecords.forEach((record) => {
      const key = cleanText(record.key, "저장 키", 240);
      if (!key.startsWith("tinico:") || legacyKeys.has(key)) {
        throw publicError("invalid_backup", "중복되거나 허용되지 않은 저장 키가 있습니다.");
      }
      legacyKeys.add(key);
    });
    return {
      exportedAt: validIso(backup.exportedAt),
      records: legacyRecords,
      auditLogs: []
    };
  }
  if (backup.tinikoCRMBackupVersion !== 3 || backup.format !== "tiniko-crm-admin-backup-v3") {
    throw publicError("unsupported_backup", "지원하지 않는 백업 파일입니다.");
  }
  if (backup.workspaceId !== workspaceId) {
    throw publicError("workspace_mismatch", "다른 CRM 작업공간에서 만든 백업 파일입니다.", 409);
  }
  const rawRecords = backup.data?.records;
  const rawAuditLogs = backup.data?.auditLogs;
  if (!Array.isArray(rawRecords) || !Array.isArray(rawAuditLogs)) {
    throw publicError("invalid_backup", "백업 데이터 또는 변경 로그가 없습니다.");
  }
  if (rawRecords.length > maxBackupRecords || rawAuditLogs.length > maxBackupAuditLogs) {
    throw publicError("backup_too_large", "백업 항목 수가 허용 범위를 초과했습니다.", 413);
  }
  const seenKeys = new Set();
  const records = rawRecords.map((record) => {
    const key = cleanText(record?.key, "저장 키", 240);
    if (!key.startsWith("tinico:") || seenKeys.has(key)) throw publicError("invalid_backup", "중복되거나 허용되지 않은 저장 키가 있습니다.");
    seenKeys.add(key);
    if (!Object.prototype.hasOwnProperty.call(record || {}, "value")) throw publicError("invalid_backup", "백업 데이터에 값이 없습니다.");
    const revision = Number(record.revision);
    return {
      key,
      value: record.value,
      revision: Number.isSafeInteger(revision) && revision > 0 ? revision : 1,
      updatedAt: validIso(record.updatedAt, validIso(backup.exportedAt))
    };
  });
  const seenEvents = new Set();
  const auditLogs = rawAuditLogs.map((entry) => {
    const eventId = cleanText(entry?.eventId, "변경 로그 ID", 120);
    if (seenEvents.has(eventId)) throw publicError("invalid_backup", "중복된 변경 로그가 있습니다.");
    seenEvents.add(eventId);
    const action = cleanText(entry.action, "변경 동작", 30);
    if (!["입력", "수정", "삭제", "복원"].includes(action)) throw publicError("invalid_backup", "변경 로그 동작이 올바르지 않습니다.");
    return {
      eventId,
      eventAt: validIso(entry.eventAt, validIso(backup.exportedAt)),
      screen: cleanText(entry.screen, "화면", 100),
      action,
      entityType: cleanText(entry.entityType, "데이터 종류", 100),
      entityId: entry.entityId === null || entry.entityId === undefined ? null : cleanText(entry.entityId, "데이터 ID", 500),
      entityLabel: cleanText(entry.entityLabel, "데이터 이름", 500),
      storageKey: cleanText(entry.storageKey, "로그 저장 키", 240),
      changedFields: Array.isArray(entry.changedFields) ? entry.changedFields : [],
      beforeValue: entry.beforeValue ?? null,
      afterValue: entry.afterValue ?? null,
      summary: cleanText(entry.summary, "변경 요약", 2000)
    };
  });
  return { exportedAt: validIso(backup.exportedAt), records, auditLogs };
}

function kstDateTime(value) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} KST`;
}

function auditSummary(auditLogs) {
  const byScreen = {};
  const byAction = { 입력: 0, 수정: 0, 삭제: 0, 복원: 0 };
  auditLogs.forEach((entry) => {
    byScreen[entry.screen] = (byScreen[entry.screen] || 0) + 1;
    byAction[entry.action] = (byAction[entry.action] || 0) + 1;
  });
  return { byScreen, byAction };
}

function readStorageKey(req, res) {
  const storageKey = String(req.params.key || "");
  if (!storageKey.startsWith("tinico:") || storageKey.length > 240) {
    res.status(400).json({ error: "invalid_storage_key" });
    return null;
  }
  return storageKey;
}

export function createApp({
  repository,
  accessKey,
  adminCode,
  workspaceId = "hlbbusisup",
  publicDir = defaultPublicDir
}) {
  if (!repository) throw new Error("repository is required");
  if (!accessKey || accessKey.length < 16) {
    throw new Error("CRM_ACCESS_KEY must contain at least 16 characters");
  }
  if (adminCode && adminCode.length < 8) {
    throw new Error("CRM_ADMIN_CODE must contain at least 8 characters");
  }

  const app = express();
  app.disable("x-powered-by");
  /* 프록시 뒤가 아닐 때 X-Forwarded-For 위조로 요청 제한을 우회하지 못하게 환경변수로 제어 (Render 등 프록시 뒤 기본값 1) */
  app.set("trust proxy", Number(process.env.CRM_TRUST_PROXY ?? 1));
  /* index.html(약 460KB 텍스트)과 JSON 응답을 gzip으로 압축해 모바일 첫 로드·저장 왕복을 단축 */
  app.use(compression());
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        /* 'wasm-unsafe-eval': Tesseract.js OCR 엔진(WebAssembly) 실행에 필수 — 없으면 명함 인식이 전부 실패함.
           앱 스크립트를 app.js로 분리했으므로 'unsafe-inline'은 더 이상 허용하지 않음(XSS 방어 강화) */
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", "https://accounts.google.com", "https://apis.google.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        /* data:/blob:: OCR 엔진이 wasm 모듈과 명함 이미지를 fetch로 읽을 때 필요 */
        connectSrc: ["'self'", "data:", "blob:", "https://accounts.google.com", "https://www.googleapis.com", "https://cdn.jsdelivr.net", "https://tessdata.projectnaptha.com"],
        workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net"],
        frameSrc: ["https://accounts.google.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  }));
  app.use(express.json({ limit: process.env.CRM_BODY_LIMIT || "25mb" }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.CRM_RATE_LIMIT || 1200),
    standardHeaders: "draft-8",
    legacyHeaders: false
  });

  /* 인증 없는 헬스체크도 요청 제한을 통과하도록 limiter 뒤에 등록 (DB 커넥션 고갈 방지) */
  app.get("/api/health", apiLimiter, async (_req, res, next) => {
    try {
      await repository.health();
      res.json({ status: "ok", database: "connected" });
    } catch (error) {
      next(error);
    }
  });

  const requireAccessKey = (req, res, next) => {
    if (!secretsMatch(req.get("x-crm-key"), accessKey)) {
      res.status(401).json({ error: "invalid_access_key" });
      return;
    }
    next();
  };

  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.CRM_ADMIN_LOGIN_LIMIT || 20),
    standardHeaders: "draft-8",
    legacyHeaders: false
  });

  const requireAdminSession = (req, res, next) => {
    const authorization = String(req.get("authorization") || "");
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!verifyAdminSessionToken({ token, accessKey, configuredAdminCode: adminCode, workspaceId })) {
      res.status(403).json({ error: "invalid_or_expired_admin_session" });
      return;
    }
    next();
  };

  function revisionConflictError(currentRevision) {
    const error = new Error("revision_conflict");
    error.code = "revision_conflict";
    error.currentRevision = currentRevision;
    return error;
  }

  async function setStorageWithAudit(storageKey, value, baseRevision) {
    if (typeof repository.setWithAudit === "function") {
      return repository.setWithAudit(workspaceId, storageKey, value, baseRevision);
    }
    const previous = await repository.get(workspaceId, storageKey);
    /* 다른 기기·탭이 먼저 저장했으면 덮어쓰지 않고 충돌을 알림 */
    if (baseRevision !== undefined && Number(previous?.revision ?? 0) !== baseRevision) {
      throw revisionConflictError(Number(previous?.revision ?? 0));
    }
    const result = await repository.set(workspaceId, storageKey, value);
    if (typeof repository.appendAudit === "function") {
      await repository.appendAudit(workspaceId, buildAuditEntries({
        storageKey,
        beforeValue: previous?.value ?? null,
        afterValue: value
      }));
    }
    return result;
  }

  async function deleteStorageWithAudit(storageKey) {
    if (typeof repository.deleteWithAudit === "function") {
      return repository.deleteWithAudit(workspaceId, storageKey);
    }
    const previous = await repository.get(workspaceId, storageKey);
    const deleted = await repository.delete(workspaceId, storageKey);
    if (deleted && typeof repository.appendAudit === "function") {
      await repository.appendAudit(workspaceId, buildAuditEntries({
        storageKey,
        beforeValue: previous?.value ?? null,
        afterValue: null
      }));
    }
    return { deleted, auditCount: 0 };
  }

  app.use("/api", apiLimiter);
  app.get("/api/session", requireAccessKey, async (_req, res, next) => {
    try {
      await repository.health();
      res.json({ status: "ok", workspaceId, database: "connected" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/session", requireAccessKey, adminLoginLimiter, (req, res) => {
    if (!adminCodeMatches(req.body?.code, adminCode)) {
      res.status(403).set("Cache-Control", "no-store").json({ error: "invalid_admin_code" });
      return;
    }
    const configuredLifetime = Number(process.env.CRM_ADMIN_SESSION_MINUTES || 30);
    const lifetimeMinutes = Number.isFinite(configuredLifetime)
      ? Math.min(120, Math.max(5, configuredLifetime))
      : 30;
    const session = createAdminSessionToken({
      accessKey,
      configuredAdminCode: adminCode,
      workspaceId,
      lifetimeMinutes
    });
    res.set("Cache-Control", "no-store").json({ status: "ok", ...session });
  });

  app.get("/api/storage/:key", requireAccessKey, async (req, res, next) => {
    const storageKey = readStorageKey(req, res);
    if (!storageKey) return;
    try {
      const record = await repository.get(workspaceId, storageKey);
      res.json(record || { value: null, revision: 0, updatedAt: null });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/storage/:key", requireAccessKey, async (req, res, next) => {
    const storageKey = readStorageKey(req, res);
    if (!storageKey) return;
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, "value")) {
      res.status(400).json({ error: "value_is_required" });
      return;
    }
    /* baseRevision(선택): 클라이언트가 마지막으로 읽은 revision — 어긋나면 409로 조용한 덮어쓰기를 차단 */
    let baseRevision;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "baseRevision")) {
      baseRevision = Number(req.body.baseRevision);
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
        res.status(400).json({ error: "invalid_base_revision" });
        return;
      }
    }
    try {
      const result = await setStorageWithAudit(storageKey, req.body.value, baseRevision);
      res.json({ status: "saved", ...result });
    } catch (error) {
      if (error && error.code === "revision_conflict") {
        res.status(409).json({
          error: "revision_conflict",
          currentRevision: error.currentRevision ?? null,
          message: "다른 기기 또는 탭에서 먼저 저장되었습니다. 최신 데이터를 불러온 뒤 다시 시도하세요."
        });
        return;
      }
      next(error);
    }
  });

  app.delete("/api/storage/:key", requireAccessKey, async (req, res, next) => {
    const storageKey = readStorageKey(req, res);
    if (!storageKey) return;
    try {
      const result = await deleteStorageWithAudit(storageKey);
      res.json({ status: "deleted", ...result });
    } catch (error) {
      next(error);
    }
  });

  app.get(["/api/admin/backup", "/api/export"], requireAccessKey, requireAdminSession, async (_req, res, next) => {
    try {
      const snapshot = typeof repository.exportSnapshot === "function"
        ? await repository.exportSnapshot(workspaceId)
        : {
            records: await repository.exportAll(workspaceId),
            auditLogs: typeof repository.exportAudit === "function" ? await repository.exportAudit(workspaceId) : []
          };
      const exportedAt = new Date();
      const downloadableAuditLogs = snapshot.auditLogs.map((entry) => ({
        ...entry,
        eventAtKST: kstDateTime(new Date(entry.eventAt))
      }));
      res.set("Cache-Control", "no-store");
      res.json({
        format: "tiniko-crm-admin-backup-v3",
        tinikoCRMBackupVersion: 3,
        workspaceId,
        exportedAt: exportedAt.toISOString(),
        exportedAtKST: kstDateTime(exportedAt),
        description: "HLB-BUSISUP CRM 전체 데이터와 화면별 입력·수정·삭제 변경 로그",
        summary: {
          recordCount: snapshot.records.length,
          auditLogCount: downloadableAuditLogs.length,
          ...auditSummary(downloadableAuditLogs)
        },
        data: { records: snapshot.records, auditLogs: downloadableAuditLogs }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/restore", requireAccessKey, requireAdminSession, async (req, res, next) => {
    try {
      if (typeof repository.restoreSnapshot !== "function") {
        throw new Error("repository.restoreSnapshot is required");
      }
      const normalized = normalizeBackupPayload(req.body?.backup, workspaceId);
      const restoreEntry = createRestoreAuditEntry({
        backupExportedAt: normalized.exportedAt,
        recordCount: normalized.records.length,
        auditLogCount: normalized.auditLogs.length
      });
      const result = await repository.restoreSnapshot(
        workspaceId,
        normalized.records,
        normalized.auditLogs,
        restoreEntry
      );
      res.set("Cache-Control", "no-store").json({
        status: "restored",
        restoredFrom: normalized.exportedAt,
        ...result
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(publicDir, {
    etag: true,
    maxAge: "1h",
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  }));

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    if (error?.type === "entity.too.large" || error?.status === 413) {
      res.status(413).json({ error: "payload_too_large" });
      return;
    }
    if (error?.publicCode && Number.isInteger(error.statusCode)) {
      res.status(error.statusCode).json({ error: error.publicCode, message: error.message });
      return;
    }
    const requestId = crypto.randomUUID();
    console.error("[" + requestId + "]", req.method, req.originalUrl, error);
    res.status(500).json({ error: "server_error", requestId });
  });

  return app;
}
