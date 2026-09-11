/* 사용자 계정: 작업공간 접속키(CRM_ACCESS_KEY) 안쪽에서 "누가" 작업하는지 구분하고
   쓰기 권한을 나눈다. 비밀번호는 scrypt 해시로만 보관하며 평문은 어디에도 남기지 않는다.
   사용자를 한 명도 만들지 않은 작업공간은 예전처럼 접속키만으로 모든 작업이 가능하다. */
import crypto from "node:crypto";

export const MEMBER_ROLES = ["admin", "editor", "viewer"];
export const MEMBER_ROLE_LABELS = { admin: "관리자", editor: "편집자", viewer: "열람자" };
const SCRYPT_KEY_LENGTH = 32;

export function canWrite(role) {
  return role === "admin" || role === "editor";
}

export function hashMemberPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEY_LENGTH).toString("hex");
  return { hash, salt };
}

export function memberPasswordMatches(password, storedHash, storedSalt) {
  if (!storedHash || !storedSalt) return false;
  const candidate = crypto.scryptSync(String(password ?? ""), storedSalt, SCRYPT_KEY_LENGTH);
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

function memberSessionSecret(accessKey) {
  return crypto.createHash("sha256").update("tiniko-crm-member-session\0").update(String(accessKey)).digest();
}

export function createMemberSessionToken({ accessKey, workspaceId, member, lifetimeMinutes = 720 }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.round(lifetimeMinutes * 60);
  const payload = Buffer.from(JSON.stringify({
    workspaceId,
    scope: "member",
    memberId: member.id,
    name: member.name,
    role: member.role,
    iat: issuedAt,
    exp: expiresAt
  }), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", memberSessionSecret(accessKey)).update(payload).digest("base64url");
  return { token: payload + "." + signature, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export function readMemberSessionToken({ token, accessKey, workspaceId }) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = crypto.createHmac("sha256", memberSessionSecret(accessKey)).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.workspaceId !== workspaceId || parsed.scope !== "member") return null;
    if (!(Number(parsed.exp) > Math.floor(Date.now() / 1000))) return null;
    return { id: String(parsed.memberId), name: String(parsed.name || ""), role: String(parsed.role || "viewer") };
  } catch {
    return null;
  }
}

export function normalizeMemberInput(body, { requireName = true } = {}) {
  const result = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, "name") || requireName) {
    const name = String(body?.name ?? "").trim();
    if (!name || name.length > 60) {
      throw Object.assign(new Error("사용자 이름은 1~60자로 입력해 주세요."), { publicCode: "invalid_member", statusCode: 400 });
    }
    result.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "email")) {
    const email = String(body.email ?? "").trim();
    if (email.length > 160 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw Object.assign(new Error("이메일 형식을 확인해 주세요."), { publicCode: "invalid_member", statusCode: 400 });
    }
    result.email = email;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "role")) {
    const role = String(body.role ?? "").trim();
    if (!MEMBER_ROLES.includes(role)) {
      throw Object.assign(new Error("권한은 관리자·편집자·열람자 중에서 고르세요."), { publicCode: "invalid_member", statusCode: 400 });
    }
    result.role = role;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "disabled")) {
    result.disabled = !!body.disabled;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "password") && body.password !== null) {
    const password = String(body.password ?? "");
    if (password && password.length < 6) {
      throw Object.assign(new Error("비밀번호는 6자 이상으로 정해 주세요."), { publicCode: "invalid_member", statusCode: 400 });
    }
    if (password.length > 200) {
      throw Object.assign(new Error("비밀번호가 너무 깁니다."), { publicCode: "invalid_member", statusCode: 400 });
    }
    result.password = password;
  }
  return result;
}
