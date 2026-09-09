import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAuditEntries } from "../src/audit.js";

function ids() {
  let index = 0;
  return () => "audit-" + ++index;
}

test("audit log identifies contact input, update, and delete with changed fields", () => {
  const eventIdFactory = ids();
  const created = buildAuditEntries({
    storageKey: "tinico:contacts",
    beforeValue: [],
    afterValue: [{ id: "contact-1", name: "홍길동", company: "티니코" }],
    eventAt: "2026-08-04T01:02:03.000Z",
    eventIdFactory
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].screen, "연락처");
  assert.equal(created[0].action, "입력");
  assert.equal(created[0].entityLabel, "홍길동 · 티니코");

  const updated = buildAuditEntries({
    storageKey: "tinico:contacts",
    beforeValue: [{ id: "contact-1", name: "홍길동", company: "티니코", updatedAt: "before" }],
    afterValue: [{ id: "contact-1", name: "홍길동", company: "티니코 주식회사", updatedAt: "after" }],
    eventIdFactory
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].action, "수정");
  assert.deepEqual(updated[0].changedFields.map((field) => field.label), ["회사명"]);
  assert.equal(updated[0].changedFields[0].before, "티니코");
  assert.equal(updated[0].changedFields[0].after, "티니코 주식회사");

  const deleted = buildAuditEntries({
    storageKey: "tinico:contacts",
    beforeValue: [{ id: "contact-1", name: "홍길동", company: "티니코 주식회사" }],
    afterValue: [],
    eventIdFactory
  });
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].action, "삭제");
  assert.equal(deleted[0].afterValue, null);
});

test("audit log maps pipeline, support, calendar, and settings screens", () => {
  const cases = [
    ["tinico:stage:sales", "파이프라인", "영업 항목", { id: "deal-1", title: "신규 영업" }],
    ["tinico:stage:roadmap", "지원 업무", "지원 업무", { id: "task-1", title: "자료 준비" }],
    ["tinico:calendar:events", "캘린더", "일정", { id: "event-1", title: "고객 미팅" }],
    ["tinico:manual:sections", "설정 > 매뉴얼", "매뉴얼", { id: "manual-1", title: "업무 기준" }]
  ];
  for (const [storageKey, screen, entityType, value] of cases) {
    const [entry] = buildAuditEntries({ storageKey, beforeValue: [], afterValue: [value] });
    assert.equal(entry.screen, screen);
    assert.equal(entry.entityType, entityType);
    assert.equal(entry.action, "입력");
  }
});

test("audit log ignores migrations, no-op saves, and replaces large images with a marker", () => {
  assert.deepEqual(buildAuditEntries({
    storageKey: "tinico:manual:migration:test",
    beforeValue: null,
    afterValue: { appliedAt: "2026-08-04" }
  }), []);
  assert.deepEqual(buildAuditEntries({
    storageKey: "tinico:contacts",
    beforeValue: [{ id: "same", name: "같음" }],
    afterValue: [{ id: "same", name: "같음" }]
  }), []);

  const [entry] = buildAuditEntries({
    storageKey: "tinico:contacts",
    beforeValue: [],
    afterValue: [{ id: "image", name: "명함", cardImage: "data:image/png;base64," + "x".repeat(5000) }]
  });
  assert.match(entry.afterValue.cardImage, /^\[이미지 데이터/);
  assert.equal(entry.afterValue.cardImage.includes("xxxxx"), false);
});
