import { createApp } from "./src/app.js";
import { createDatabasePool, createPostgresRepository, ensureSchema } from "./src/db.js";

const {
  DATABASE_URL,
  CRM_ACCESS_KEY,
  CRM_ADMIN_CODE,
  CRM_WORKSPACE_ID = "hlbbusisup",
  PORT = "3000"
} = process.env;

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!CRM_ACCESS_KEY) throw new Error("CRM_ACCESS_KEY is required");

const pool = createDatabasePool(DATABASE_URL);
await ensureSchema(pool);
const repository = createPostgresRepository(pool);
const app = createApp({
  repository,
  accessKey: CRM_ACCESS_KEY,
  adminCode: CRM_ADMIN_CODE,
  workspaceId: CRM_WORKSPACE_ID
});

const server = app.listen(Number(PORT), "0.0.0.0", () => {
  console.log("HLB-BUSISUP CRM listening on port " + PORT);
});

/* 감사 로그 보존 기간(기본 90일, CRM_AUDIT_RETENTION_DAYS로 조정·0이면 비활성) 초과분을 기동 시 및 매일 정리 */
const auditRetentionDays = Number(process.env.CRM_AUDIT_RETENTION_DAYS ?? 90);
async function pruneOldAuditLogs() {
  if (typeof repository.pruneAuditLogs !== "function") return;
  try {
    await repository.pruneSaveRequests();
    const removed = await repository.pruneAuditLogs(auditRetentionDays);
    if (removed) console.log(`Pruned ${removed} audit log entries older than ${auditRetentionDays} days`);
  } catch (error) {
    console.error("Audit log pruning failed", error);
  }
}
pruneOldAuditLogs();
setInterval(pruneOldAuditLogs, 24 * 60 * 60 * 1000).unref();

let shuttingDown = false;
async function shutdown(signal) {
  /* 중복 신호로 pool.end()가 두 번 불리며 종료 중 크래시하는 것을 방지 */
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(signal + " received; shutting down");
  /* keep-alive 연결 때문에 close 콜백이 영원히 안 오는 경우를 대비한 강제 종료 */
  setTimeout(() => {
    console.error("Shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000).unref();
  server.close(async () => {
    try {
      await repository.close();
      process.exit(0);
    } catch (error) {
      console.error("Database shutdown failed", error);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
