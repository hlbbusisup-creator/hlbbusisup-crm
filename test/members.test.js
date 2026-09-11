import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canWrite,
  createMemberSessionToken,
  hashMemberPassword,
  memberPasswordMatches,
  normalizeMemberInput,
  readMemberSessionToken
} from "../src/members.js";

const accessKey = "members-test-access-key";
const workspaceId = "members-test";

test("비밀번호는 소금을 섞은 해시로만 남고 원문 비교가 가능하다", () => {
  const first = hashMemberPassword("field-team-2026");
  const second = hashMemberPassword("field-team-2026");
  assert.notEqual(first.salt, second.salt, "같은 비밀번호라도 소금이 달라야 한다");
  assert.notEqual(first.hash, second.hash, "저장된 해시도 달라야 한다");
  assert.equal(first.hash.includes("field-team-2026"), false, "원문이 남아서는 안 된다");

  assert.equal(memberPasswordMatches("field-team-2026", first.hash, first.salt), true);
  assert.equal(memberPasswordMatches("field-team-2027", first.hash, first.salt), false);
  assert.equal(memberPasswordMatches("field-team-2026", first.hash, second.salt), false, "소금이 다르면 맞지 않아야 한다");
  assert.equal(memberPasswordMatches("field-team-2026", "", ""), false, "비밀번호가 없으면 통과시키지 않는다");
});

test("사용자 세션 토큰은 위조·만료·다른 작업공간을 걸러낸다", () => {
  const member = { id: "member-1", name: "김현장", role: "editor" };
  const { token, expiresAt } = createMemberSessionToken({ accessKey, workspaceId, member, lifetimeMinutes: 60 });
  assert.ok(new Date(expiresAt).getTime() > Date.now());

  const parsed = readMemberSessionToken({ token, accessKey, workspaceId });
  assert.deepEqual(parsed, { id: "member-1", name: "김현장", role: "editor" });

  assert.equal(readMemberSessionToken({ token, accessKey: "다른-접속키-1234567890", workspaceId }), null, "접속키가 바뀌면 무효");
  assert.equal(readMemberSessionToken({ token, accessKey, workspaceId: "other" }), null, "다른 작업공간에서는 무효");
  assert.equal(readMemberSessionToken({ token: token.slice(0, -1) + "x", accessKey, workspaceId }), null, "서명이 어긋나면 무효");
  assert.equal(readMemberSessionToken({ token: "", accessKey, workspaceId }), null);

  /* 권한을 올린 위조 토큰: 본문만 바꾸면 서명이 맞지 않는다 */
  const [payload] = token.split(".");
  const tampered = Buffer.from(JSON.stringify({
    ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    role: "admin"
  }), "utf8").toString("base64url");
  assert.equal(readMemberSessionToken({ token: tampered + "." + token.split(".")[1], accessKey, workspaceId }), null);

  const expired = createMemberSessionToken({ accessKey, workspaceId, member, lifetimeMinutes: -1 });
  assert.equal(readMemberSessionToken({ token: expired.token, accessKey, workspaceId }), null, "만료된 토큰은 무효");
});

test("권한은 관리자·편집자만 저장할 수 있다", () => {
  assert.equal(canWrite("admin"), true);
  assert.equal(canWrite("editor"), true);
  assert.equal(canWrite("viewer"), false);
  assert.equal(canWrite(""), false);
});

test("사용자 입력값 검사는 이름·이메일·권한·비밀번호를 거른다", () => {
  assert.deepEqual(normalizeMemberInput({ name: "  김현장  " }), { name: "김현장" });
  assert.throws(() => normalizeMemberInput({ name: "" }), /사용자 이름/);
  assert.throws(() => normalizeMemberInput({ name: "가".repeat(61) }), /사용자 이름/);
  assert.throws(() => normalizeMemberInput({ name: "김현장", email: "not-an-email" }), /이메일/);
  assert.throws(() => normalizeMemberInput({ name: "김현장", role: "owner" }), /권한/);
  assert.throws(() => normalizeMemberInput({ name: "김현장", password: "12345" }), /비밀번호/);

  const full = normalizeMemberInput({ name: "김현장", email: "field@hlb.co.kr", role: "viewer", disabled: true, password: "123456" });
  assert.deepEqual(full, { name: "김현장", email: "field@hlb.co.kr", role: "viewer", disabled: true, password: "123456" });

  /* 수정할 때는 이름 없이 일부만 보낼 수 있다 */
  assert.deepEqual(normalizeMemberInput({ role: "admin" }, { requireName: false }), { role: "admin" });
  /* 빈 비밀번호는 "비밀번호 없음"으로 지우는 뜻이라 통과시킨다 */
  assert.deepEqual(normalizeMemberInput({ password: "" }, { requireName: false }), { password: "" });
});
