/* 실제 화면(jsdom) → 실제 Express → 실제 PostgreSQL(PGlite)까지 한 줄로 이어 붙여
   기능별 저장·수정·삭제가 DB에 정확히 남는지 확인한다.
   기존 UI 테스트는 API를 흉내 내므로, 여기서는 흉내 없이 운영과 같은 경로를 지난다. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { JSDOM, VirtualConsole } from "jsdom";
import { ensureSchema, createPostgresRepository } from "../src/db.js";
import { createApp } from "../src/app.js";

const accessKey = "fullstack-test-access-key";
const adminCode = "fullstack-admin-code";
const workspaceId = "fullstack";

const db = new PGlite();
let lease = Promise.resolve();
const query = async (sql, params) => {
  if (sql.includes("CREATE TABLE")) { await db.exec(sql); return { rows: [], rowCount: 0 }; }
  const result = await db.query(sql, params);
  return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
};
const pool = {
  query,
  async connect() {
    const previous = lease;
    let unlock;
    lease = new Promise((resolve) => { unlock = resolve; });
    await previous;
    return { query, release: () => unlock() };
  }
};

let repository, server, baseUrl, dom, runtimeErrors;
/* 저장 중간에 한 번만 실패시켜 부분 저장이 남는지 확인하기 위한 장치 */
const failOnce = new Set();
const failNextSaveFor = (key) => failOnce.add(key);

/* DB에 실제로 저장된 값 (앱 메모리가 아니라 PostgreSQL에서 직접 읽는다) */
const stored = async (key) => (await repository.get(workspaceId, key))?.value ?? null;
const auditFor = async (key) => (await repository.exportAudit(workspaceId)).filter((entry) => entry.storageKey === key);

/* 통합 테스트는 여러 파일이 동시에 돌면서 CPU를 나눠 쓰므로 넉넉히 기다린다 */
const waitFor = async (check, label, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("시간 초과: " + label);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
};
const win = () => dom.window;
/* DB에 값이 들어온 직후에도 화면은 저장을 마무리하는 중이라, 목록(stageData/contactsData)에
   아직 반영되지 않았거나 닫기 버튼이 거절될 수 있다. 화면이 진정될 때까지 기다린다. */
const settleDrafts = () => waitFor(
  async () => win().eval("[...dealDrafts.values()].every(draft=>!draft.saving) && [...contactDrafts.values()].every(draft=>!draft.saving)"),
  "화면 저장 마무리"
);
const doc = () => dom.window.document;
const byId = (id) => doc().getElementById(id);
const setInput = (element, value) => {
  assert.ok(element, "입력 요소를 찾지 못했습니다");
  element.value = value;
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};
const setSelect = (element, value) => {
  assert.ok(element, "선택 요소를 찾지 못했습니다");
  element.value = value;
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
};

before(async () => {
  await ensureSchema(pool);
  repository = createPostgresRepository(pool);
  server = createApp({ repository, accessKey, adminCode, workspaceId }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = "http://127.0.0.1:" + server.address().port;

  const [rawHtml, appJs, css, heavyJs] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/heavy.js", import.meta.url), "utf8")
  ]);
  const html = rawHtml
    .replace(/<link rel="stylesheet" href="styles\.css[^"]*">/, () => `<style>${css}</style>`)
    /* 운영에서는 heavy.js를 쓸 때 내려받지만, 테스트 화면은 외부 파일을 받을 수 없어 함께 넣어 둔다 */
    .replace(/<script src="app\.js[^"]*"><\/script>/, () => `<script>${appJs}</script><script>${heavyJs}</script>`);

  runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => runtimeErrors.push(error.message));
  dom = new JSDOM(html, {
    url: baseUrl + "/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.localStorage.setItem("tinico:cloud:access-key", accessKey);
      /* 실제 서버로 보낸다. jsdom의 상대경로 fetch를 절대경로로 바꿔 준다. */
      window.fetch = async (input, options) => {
        const target = new URL(String(input), baseUrl);
        if (options?.method === "PUT" && failOnce.size) {
          const body = JSON.parse(String(options.body || "{}"));
          const hit = (body.changes || []).find((change) => failOnce.has(change.key));
          if (hit) { failOnce.delete(hit.key); return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: { "content-type": "application/json" } }); }
        }
        return fetch(target, options);
      };
      window.Response = Response; window.Headers = Headers; window.Request = Request;
      window.AbortController = AbortController;
      window.CompressionStream = CompressionStream;
      window.DecompressionStream = DecompressionStream;
      window.confirm = () => true;
      window.alert = () => {};
      window.scrollTo = () => {};
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.URL.createObjectURL = () => "blob:fullstack";
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function click() {};
      window.navigator.clipboard = { writeText: async () => {} };
      window.addEventListener("unhandledrejection", (event) => {
        runtimeErrors.push(String(event.reason?.message || event.reason));
        event.preventDefault();
      });
    }
  });
  await waitFor(async () => doc().querySelectorAll("#ai-persona-select option").length > 0, "CRM 초기화");
});

after(async () => {
  if (dom) dom.window.close();
  if (server) { server.close(); await once(server, "close"); }
  await db.close();
});

test("접속: 화면이 실제 서버·DB와 연결되고 기본 데이터가 저장된다", async () => {
  assert.equal(byId("cloud-gate").hidden, true, "연결키가 맞으면 연결 화면이 닫혀야 한다");
  assert.equal(byId("cloud-db-state").textContent, "연결됨");
  const areas = await stored("tinico:areas");
  assert.ok(Array.isArray(areas) && areas.length > 0, "기본 그룹이 DB에 저장되어야 한다");
  assert.ok(Array.isArray(await stored("tinico:manual:sections")), "기본 매뉴얼이 DB에 저장되어야 한다");
});

test("연락처: 추가 → 저장 → 수정 → 휴지통 → 복구 → 영구 삭제가 DB에 반영된다", async () => {
  byId("contact-manual-btn").click();
  await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세 열림");
  setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), "정담당");
  setInput(doc().querySelector('#contact-drawer-body [data-field="company"]'), "정담당테크");
  setInput(doc().querySelector('#contact-drawer-body [data-field="mobilePhone"]'), "010-1234-5678");

  /* 저장 전에는 DB에 없어야 한다 */
  assert.equal(((await stored("tinico:contacts")) || []).length, 0, "저장 전에는 DB에 쓰지 않아야 한다");

  byId("contact-drawer-save").click();
  const saved = await waitFor(async () => ((await stored("tinico:contacts")) || []).find((c) => c.name === "정담당"), "연락처 저장");
  assert.equal(saved.company, "정담당테크");
  assert.equal(saved.mobilePhone, "010-1234-5678");
  const contactId = saved.id;

  /* 수정 */
  setInput(doc().querySelector('#contact-drawer-body [data-field="company"]'), "이름바꾼테크");
  byId("contact-drawer-save").click();
  await waitFor(async () => ((await stored("tinico:contacts")) || []).find((c) => c.id === contactId)?.company === "이름바꾼테크", "연락처 수정");

  /* 변경 로그가 남는지 */
  const logs = await auditFor("tinico:contacts");
  assert.ok(logs.some((entry) => entry.action === "입력"), "입력 로그가 남아야 한다");
  assert.ok(logs.some((entry) => entry.action === "수정"), "수정 로그가 남아야 한다");

  byId("contact-drawer-close").click();

  /* 휴지통으로 이동 */
  doc().querySelector("#contact-tbody [data-check]").click();
  byId("contact-bulk-delete-btn").click();
  await waitFor(async () => ((await stored("tinico:contacts")) || []).length === 0, "연락처 삭제");
  const trash = await waitFor(async () => { const t = await stored("tinico:trash"); return t?.length ? t : null; }, "휴지통 이동");
  assert.equal(trash[0].label, "정담당");

  /* 휴지통에서 복구 */
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  const restoreButton = await waitFor(async () => doc().querySelector("#settings-trash-list [data-restore-trash]"), "휴지통 복구 버튼");
  restoreButton.click();
  await waitFor(async () => ((await stored("tinico:contacts")) || []).some((c) => c.name === "정담당"), "휴지통 복구");
  assert.equal(((await stored("tinico:trash")) || []).length, 0, "복구하면 휴지통에서 빠져야 한다");

  /* 다시 삭제하고 영구 삭제 */
  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  await waitFor(async () => doc().querySelector("#contact-tbody [data-check]"), "연락처 목록 복귀");
  doc().querySelector("#contact-tbody [data-check]").click();
  byId("contact-bulk-delete-btn").click();
  await waitFor(async () => ((await stored("tinico:trash")) || []).length === 1, "재삭제");
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  await waitFor(async () => doc().querySelector("#settings-trash-list [data-delete-trash]"), "휴지통 목록");
  doc().querySelector("#settings-trash-list [data-delete-trash]").click();
  await waitFor(async () => ((await stored("tinico:trash")) || []).length === 0, "영구 삭제");
  assert.equal(((await stored("tinico:contacts")) || []).length, 0, "영구 삭제 후 연락처도 없어야 한다");
});

test("파이프라인: 항목 추가 → 저장 → 단계 변경 → 휴지통 이동이 DB에 반영된다", async () => {
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세 열림");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "정담당 영업 건");
  setInput(doc().querySelector('#deal-drawer-body [data-f="internalOwner"]'), "홍길동");
  setInput(doc().querySelector('#deal-drawer-body [data-f="amount"]'), "150");

  const areaKey = win().eval("selectedDealRef.areaKey");
  const dealKey = "tinico:stage:" + areaKey;
  assert.ok(!((await stored(dealKey)) || []).some((d) => d.title === "정담당 영업 건"), "저장 전에는 DB에 없어야 한다");

  byId("deal-drawer-save").click();
  const deal = await waitFor(async () => ((await stored(dealKey)) || []).find((d) => d.title === "정담당 영업 건"), "영업 항목 저장");
  assert.equal(deal.internalOwner, "홍길동");
  assert.equal(deal.amount, "150");
  const dealId = deal.id;

  /* 단계 변경 후 저장 */
  setSelect(doc().querySelector("#deal-drawer-body [data-stage]"), "협상");
  byId("deal-drawer-save").click();
  await waitFor(async () => ((await stored(dealKey)) || []).find((d) => d.id === dealId)?.stage === "협상", "단계 변경 저장");

  /* 휴지통으로 이동 */
  doc().querySelector("#deal-drawer-body [data-delete]").click();
  await waitFor(async () => !((await stored(dealKey)) || []).some((d) => d.id === dealId), "영업 항목 삭제");
  assert.ok(((await stored("tinico:trash")) || []).some((entry) => entry.label === "정담당 영업 건"), "휴지통에 남아야 한다");

  /* 휴지통에서 복구되면 파이프라인으로 돌아온다 */
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  await waitFor(async () => doc().querySelector("#settings-trash-list [data-restore-trash]"), "휴지통 목록");
  doc().querySelector("#settings-trash-list [data-restore-trash]").click();
  await waitFor(async () => ((await stored(dealKey)) || []).some((d) => d.title === "정담당 영업 건"), "영업 항목 복구");
});

test("지원 업무: 추가 → 수정 → 상태 변경 → 삭제가 DB에 반영된다", async () => {
  doc().querySelector('#tn-tabs [data-key="roadmap"]').click();
  byId("roadmap-add-btn").click();
  await waitFor(async () => !byId("roadmap-modal-overlay").hidden, "지원 업무 모달");
  setInput(byId("roadmap-modal-name"), "정담당 자료 준비");
  setInput(byId("roadmap-modal-purpose"), "고객 미팅 자료를 준비한다");
  setInput(byId("roadmap-modal-deliverable"), "발표 자료 1부");
  setInput(byId("roadmap-modal-owner"), "홍길동");
  byId("roadmap-modal-save").click();

  const task = await waitFor(async () => ((await stored("tinico:stage:roadmap")) || []).find((t) => t.title === "정담당 자료 준비"), "지원 업무 저장");
  assert.equal(task.owner, "홍길동");
  assert.equal(task.purpose, "고객 미팅 자료를 준비한다");

  /* 목록에서 상태 바로 바꾸기 */
  const statusSelect = await waitFor(async () => doc().querySelector(`#roadmap-list [data-task-status="${task.id}"]`), "상태 선택");
  setSelect(statusSelect, "완료");
  await waitFor(async () => ((await stored("tinico:stage:roadmap")) || []).find((t) => t.id === task.id)?.status === "완료", "상태 변경 저장");
  assert.equal(((await stored("tinico:stage:roadmap")) || []).find((t) => t.id === task.id).progress, 100, "완료면 진행률이 100이어야 한다");

  /* 수정 */
  doc().querySelector(`#roadmap-list [data-task-edit="${task.id}"]`).click();
  await waitFor(async () => !byId("roadmap-modal-overlay").hidden, "수정 모달");
  setInput(byId("roadmap-modal-name"), "정담당 자료 준비(수정)");
  byId("roadmap-modal-save").click();
  await waitFor(async () => ((await stored("tinico:stage:roadmap")) || []).find((t) => t.id === task.id)?.title === "정담당 자료 준비(수정)", "지원 업무 수정");

  /* 삭제 → 휴지통 */
  doc().querySelector(`#roadmap-list [data-task-delete="${task.id}"]`).click();
  await waitFor(async () => !((await stored("tinico:stage:roadmap")) || []).some((t) => t.id === task.id), "지원 업무 삭제");
  assert.ok(((await stored("tinico:trash")) || []).some((entry) => entry.label === "정담당 자료 준비(수정)"), "휴지통에 남아야 한다");
});

test("캘린더: 일정 추가 → 수정 → 삭제가 DB에 반영된다", async () => {
  doc().querySelector('#tn-tabs [data-key="calendar"]').click();
  byId("calendar-add").click();
  await waitFor(async () => !byId("calendar-event-overlay").hidden, "일정 모달");
  setInput(byId("calendar-event-title"), "정담당 미팅");
  setInput(byId("calendar-event-date"), "2026-09-18");
  byId("calendar-event-save").click();

  const event = await waitFor(async () => ((await stored("tinico:calendar:events")) || []).find((e) => e.title === "정담당 미팅"), "일정 저장");
  assert.equal(event.date, "2026-09-18");

  /* 수정 */
  const eventButton = await waitFor(async () => [...doc().querySelectorAll(".tn-calendar-event.manual")].find((b) => b.textContent.includes("정담당 미팅")), "일정 버튼");
  eventButton.click();
  await waitFor(async () => !byId("calendar-event-overlay").hidden, "수정 모달");
  setInput(byId("calendar-event-title"), "정담당 미팅(수정)");
  byId("calendar-event-save").click();
  await waitFor(async () => ((await stored("tinico:calendar:events")) || []).find((e) => e.id === event.id)?.title === "정담당 미팅(수정)", "일정 수정");

  /* 삭제 */
  const updatedButton = await waitFor(async () => [...doc().querySelectorAll(".tn-calendar-event.manual")].find((b) => b.textContent.includes("정담당 미팅(수정)")), "수정된 일정 버튼");
  updatedButton.click();
  await waitFor(async () => !byId("calendar-event-overlay").hidden, "삭제용 모달");
  byId("calendar-event-delete").click();
  await waitFor(async () => !((await stored("tinico:calendar:events")) || []).some((e) => e.id === event.id), "일정 삭제");
});

test("설정: 그룹·단계·분류 추가와 삭제가 DB에 반영된다", async () => {
  doc().querySelector('#tn-tabs [data-key="settings"]').click();

  /* 그룹 추가 */
  byId("settings-group-add").click();
  await waitFor(async () => !byId("area-modal-overlay").hidden, "그룹 모달");
  setInput(byId("area-modal-title-input"), "정담당 그룹");
  byId("area-modal-save").click();
  const area = await waitFor(async () => ((await stored("tinico:areas")) || []).find((a) => a.title === "정담당 그룹"), "그룹 저장");

  /* 단계 추가 */
  byId("settings-stage-add").click();
  await waitFor(async () => !byId("stage-modal-overlay").hidden, "단계 모달");
  setInput(byId("stage-modal-name"), "정담당단계");
  byId("stage-modal-save").click();
  await waitFor(async () => ((await stored("tinico:settings:stages")) || []).some((s) => s.label === "정담당단계"), "단계 저장");

  /* 분류 추가 */
  byId("settings-bucket-add").click();
  await waitFor(async () => !byId("bucket-modal-overlay").hidden, "분류 모달");
  setInput(byId("bucket-modal-label"), "정담당분류");
  byId("bucket-modal-save").click();
  await waitFor(async () => ((await stored("tinico:settings:buckets")) || []).some((b) => b.label === "정담당분류"), "분류 저장");

  /* 단계 삭제 */
  doc().querySelector('#settings-stage-list [data-delete-stage="정담당단계"]').click();
  await waitFor(async () => !((await stored("tinico:settings:stages")) || []).some((s) => s.label === "정담당단계"), "단계 삭제");

  /* 분류 삭제 */
  const bucketKey = ((await stored("tinico:settings:buckets")) || []).find((b) => b.label === "정담당분류").key;
  doc().querySelector(`#settings-bucket-list [data-delete-bucket="${bucketKey}"]`).click();
  await waitFor(async () => !((await stored("tinico:settings:buckets")) || []).some((b) => b.label === "정담당분류"), "분류 삭제");

  /* 그룹 삭제 → 휴지통 */
  doc().querySelector(`#settings-group-list [data-delete-group="${area.key}"]`).click();
  await waitFor(async () => !((await stored("tinico:areas")) || []).some((a) => a.key === area.key), "그룹 삭제");
  assert.ok(((await stored("tinico:trash")) || []).some((entry) => entry.label === "정담당 그룹"), "그룹이 휴지통에 남아야 한다");
});

test("설정: 매뉴얼 추가 → 수정 → 삭제가 DB에 반영된다", async () => {
  byId("settings-mode-manual").click();
  byId("manual-add-btn").click();
  await waitFor(async () => !byId("manual-modal-overlay").hidden, "매뉴얼 모달");
  setInput(byId("manual-modal-name"), "정담당 매뉴얼");
  setInput(byId("manual-modal-category"), "검증");
  setInput(byId("manual-modal-content"), "첫 줄\n둘째 줄");
  byId("manual-modal-save").click();
  const section = await waitFor(async () => ((await stored("tinico:manual:sections")) || []).find((s) => s.title === "정담당 매뉴얼"), "매뉴얼 저장");
  assert.equal(section.category, "검증");

  doc().querySelector(`#settings-manual-list [data-manual-edit="${section.id}"]`).click();
  await waitFor(async () => !byId("manual-modal-overlay").hidden, "매뉴얼 수정 모달");
  setInput(byId("manual-modal-name"), "정담당 매뉴얼(수정)");
  byId("manual-modal-save").click();
  await waitFor(async () => ((await stored("tinico:manual:sections")) || []).find((s) => s.id === section.id)?.title === "정담당 매뉴얼(수정)", "매뉴얼 수정");

  doc().querySelector(`#settings-manual-list [data-manual-delete="${section.id}"]`).click();
  await waitFor(async () => !((await stored("tinico:manual:sections")) || []).some((s) => s.id === section.id), "매뉴얼 삭제");
  byId("settings-mode-config").click();
});

test("설정: 사용 환경 값이 DB에 저장되고 다시 읽힌다", async () => {
  byId("settings-beginner-toggle").click();
  await waitFor(async () => (await stored("tinico:app:settings"))?.beginnerMode === false, "초보 모드 저장");
  byId("settings-beginner-toggle").click();
  await waitFor(async () => (await stored("tinico:app:settings"))?.beginnerMode === true, "초보 모드 복귀");

  byId("settings-trash-collapse").click();
  await waitFor(async () => (await stored("tinico:app:settings"))?.trashCollapsed === true, "휴지통 접힘 저장");
  byId("settings-trash-collapse").click();
  await waitFor(async () => (await stored("tinico:app:settings"))?.trashCollapsed === false, "휴지통 펼침 저장");

  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  setSelect(byId("contact-page-size"), "30");
  await waitFor(async () => (await stored("tinico:app:settings"))?.contactPageSize === 30, "표시 줄 수 저장");
});

test("설정 저장이 중간에 실패해도 DB가 반쯤 바뀐 채로 남지 않는다", async () => {
  doc().querySelector('#tn-tabs [data-key="settings"]').click();

  /* 분류 하나와 그 분류를 쓰는 그룹·영업 항목을 만든다 */
  byId("settings-bucket-add").click();
  await waitFor(async () => !byId("bucket-modal-overlay").hidden, "분류 모달");
  setInput(byId("bucket-modal-label"), "원자성검증분류");
  byId("bucket-modal-save").click();
  const bucket = await waitFor(async () => ((await stored("tinico:settings:buckets")) || []).find((b) => b.label === "원자성검증분류"), "분류 저장");

  byId("settings-group-add").click();
  await waitFor(async () => !byId("area-modal-overlay").hidden, "그룹 모달");
  setInput(byId("area-modal-title-input"), "원자성검증그룹");
  setSelect(byId("area-modal-bucket"), bucket.key);
  byId("area-modal-save").click();
  const area = await waitFor(async () => ((await stored("tinico:areas")) || []).find((a) => a.title === "원자성검증그룹"), "그룹 저장");
  assert.equal(area.bucket, bucket.key);

  const beforeBuckets = await stored("tinico:settings:buckets");
  const beforeAreas = await stored("tinico:areas");

  /* 분류를 지우는 도중 분류 설정 저장만 실패시킨다 */
  failNextSaveFor("tinico:settings:buckets");
  doc().querySelector(`#settings-bucket-list [data-delete-bucket="${bucket.key}"]`).click();
  await new Promise((resolve) => setTimeout(resolve, 900));

  const afterBuckets = await stored("tinico:settings:buckets");
  const afterAreas = await stored("tinico:areas");
  const stillHasBucket = (afterBuckets || []).some((b) => b.key === bucket.key);
  const areaMoved = (afterAreas || []).find((a) => a.key === area.key)?.bucket !== bucket.key;

  /* 분류가 남아 있는데 그룹만 다른 분류로 옮겨졌다면 DB가 어긋난 것이다 */
  assert.equal(stillHasBucket && areaMoved, false,
    "분류 저장이 실패했는데 그룹의 분류만 바뀌면 데이터가 어긋난다");
  /* 실패했다면 두 값 모두 원래대로여야 한다 */
  if (stillHasBucket) {
    assert.deepEqual(afterAreas, beforeAreas, "실패 시 그룹 정보는 그대로여야 한다");
    assert.deepEqual(afterBuckets, beforeBuckets, "실패 시 분류 정보는 그대로여야 한다");
  }
});

test("단계 이름을 바꾸는 중 실패해도 단계 설정과 영업 항목이 어긋나지 않는다", async () => {
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  byId("settings-stage-add").click();
  await waitFor(async () => !byId("stage-modal-overlay").hidden, "단계 모달");
  setInput(byId("stage-modal-name"), "원자성단계");
  byId("stage-modal-save").click();
  await waitFor(async () => ((await stored("tinico:settings:stages")) || []).some((s) => s.label === "원자성단계"), "단계 저장");

  /* 이 단계를 쓰는 영업 항목을 만든다 */
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "원자성 영업 건");
  setSelect(doc().querySelector("#deal-drawer-body [data-stage]"), "원자성단계");
  const areaKey = win().eval("selectedDealRef.areaKey");
  byId("deal-drawer-save").click();
  await waitFor(async () => ((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.title === "원자성 영업 건")?.stage === "원자성단계", "항목 저장");
  byId("deal-drawer-close").click();

  /* 단계 이름 변경 중 단계 설정 저장만 실패시킨다 */
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  await waitFor(async () => doc().querySelector('#settings-stage-list [data-edit-stage="원자성단계"]'), "단계 목록");
  doc().querySelector('#settings-stage-list [data-edit-stage="원자성단계"]').click();
  await waitFor(async () => !byId("stage-modal-overlay").hidden, "단계 수정 모달");
  setInput(byId("stage-modal-name"), "원자성단계수정");
  failNextSaveFor("tinico:settings:stages");
  byId("stage-modal-save").click();
  await new Promise((resolve) => setTimeout(resolve, 900));

  const stages = (await stored("tinico:settings:stages")) || [];
  const dealStage = ((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.title === "원자성 영업 건")?.stage;
  const renamedInSettings = stages.some((s) => s.label === "원자성단계수정");
  /* 설정에는 옛 이름이 남았는데 항목만 새 이름이면 그 항목의 단계는 존재하지 않는 단계가 된다 */
  assert.equal(!renamedInSettings && dealStage === "원자성단계수정", false,
    "단계 설정 저장이 실패했는데 영업 항목만 새 이름이면 없는 단계를 가리키게 된다");
  assert.ok(stages.some((s) => s.label === dealStage), "영업 항목의 단계는 항상 설정에 존재해야 한다");
});

test("저장이 실패하면 화면 값도 되돌아가 DB와 어긋나지 않는다", async () => {
  /* 지원 업무 상태 변경 실패 */
  doc().querySelector('#tn-tabs [data-key="roadmap"]').click();
  byId("roadmap-add-btn").click();
  await waitFor(async () => !byId("roadmap-modal-overlay").hidden, "지원 업무 모달");
  setInput(byId("roadmap-modal-name"), "되돌리기 검증 과제");
  setInput(byId("roadmap-modal-purpose"), "저장 실패 시 되돌아가는지 확인");
  setInput(byId("roadmap-modal-deliverable"), "확인 결과");
  byId("roadmap-modal-save").click();
  const task = await waitFor(async () => ((await stored("tinico:stage:roadmap")) || []).find((t) => t.title === "되돌리기 검증 과제"), "과제 저장");
  assert.equal(task.status, "미착수");

  const statusSelect = await waitFor(async () => doc().querySelector(`#roadmap-list [data-task-status="${task.id}"]`), "상태 선택");
  failNextSaveFor("tinico:stage:roadmap");
  setSelect(statusSelect, "완료");
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(((await stored("tinico:stage:roadmap")) || []).find((t) => t.id === task.id).status, "미착수", "DB는 그대로여야 한다");
  assert.equal(win().eval(`roadmapData.find(t=>t.id===${JSON.stringify(task.id)}).status`), "미착수", "화면 값도 되돌아가야 한다");
  assert.match(doc().querySelector(".tn-notice-stack")?.textContent || "", /저장/, "사용자에게 알려야 한다");

  /* 매뉴얼 삭제 실패 */
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  byId("settings-mode-manual").click();
  byId("manual-add-btn").click();
  await waitFor(async () => !byId("manual-modal-overlay").hidden, "매뉴얼 모달");
  setInput(byId("manual-modal-name"), "되돌리기 검증 매뉴얼");
  setInput(byId("manual-modal-content"), "내용");
  byId("manual-modal-save").click();
  const section = await waitFor(async () => ((await stored("tinico:manual:sections")) || []).find((s) => s.title === "되돌리기 검증 매뉴얼"), "매뉴얼 저장");

  const beforeCount = ((await stored("tinico:manual:sections")) || []).length;
  failNextSaveFor("tinico:manual:sections");
  doc().querySelector(`#settings-manual-list [data-manual-delete="${section.id}"]`).click();
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(((await stored("tinico:manual:sections")) || []).length, beforeCount, "DB의 매뉴얼 수가 그대로여야 한다");
  assert.equal(win().eval("manualSections.length"), beforeCount, "화면 목록도 되돌아가야 한다");
  assert.ok(win().eval(`manualSections.some(s=>s.id===${JSON.stringify(section.id)})`), "지워지지 않아야 한다");

  /* 정리: 실제로 삭제 */
  doc().querySelector(`#settings-manual-list [data-manual-delete="${section.id}"]`).click();
  await waitFor(async () => !((await stored("tinico:manual:sections")) || []).some((s) => s.id === section.id), "매뉴얼 정리");
  byId("settings-mode-config").click();
});

test("대시보드의 일정 변경이 실패해도 화면과 DB가 같은 값을 유지한다", async () => {
  /* 지연된 영업 항목을 하나 만든다 */
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "지연 검증 영업 건");
  setInput(doc().querySelector('#deal-drawer-body [data-f="action"]'), "연락하기");
  setInput(doc().querySelector('#deal-drawer-body [data-f="nextAction"]'), "2020-01-01");
  const areaKey = win().eval("selectedDealRef.areaKey");
  byId("deal-drawer-save").click();
  const deal = await waitFor(async () => ((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.title === "지연 검증 영업 건"), "항목 저장");
  byId("deal-drawer-close").click();

  doc().querySelector('#tn-tabs [data-key="home"]').click();
  const changeButton = await waitFor(async () =>
    [...doc().querySelectorAll("#tn-today-list .tn-task-row")]
      .find((row) => row.textContent.includes("지연 검증 영업 건"))
      ?.querySelector(".tn-task-actions button:last-child"), "일정 변경 버튼");

  const originalPrompt = win().prompt;
  win().prompt = () => "2026-12-31";
  failNextSaveFor("tinico:stage:" + areaKey);
  changeButton.click();
  await new Promise((resolve) => setTimeout(resolve, 700));
  win().prompt = originalPrompt;

  assert.equal(((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.id === deal.id).nextAction, "2020-01-01", "DB는 그대로여야 한다");
  assert.equal(win().eval(`stageData[${JSON.stringify(areaKey)}].find(d=>d.id===${JSON.stringify(deal.id)}).nextAction`), "2020-01-01", "화면 값도 되돌아가야 한다");
});

test("연락처를 고치면 그 담당자를 연결한 영업 항목도 함께 갱신된다", async () => {
  /* 연락처를 만들고 */
  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  byId("contact-manual-btn").click();
  await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세");
  setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), "연결담당");
  setInput(doc().querySelector('#contact-drawer-body [data-field="mobilePhone"]'), "010-1000-1000");
  byId("contact-drawer-save").click();
  const contact = await waitFor(async () => ((await stored("tinico:contacts")) || []).find((c) => c.name === "연결담당"), "연락처 저장");
  byId("contact-drawer-close").click();

  /* 영업 항목에서 그 담당자를 고른다 */
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "연결 검증 영업 건");
  const areaKey = win().eval("selectedDealRef.areaKey");
  const combo = doc().querySelector("#deal-drawer-body [data-contact-combo] .tn-combo-input");
  setInput(combo, "연결담당");
  const option = await waitFor(async () => doc().querySelector("#deal-drawer-body .tn-combo-option"), "담당자 후보");
  option.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  byId("deal-drawer-save").click();
  const deal = await waitFor(async () => ((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.title === "연결 검증 영업 건"), "항목 저장");
  assert.deepEqual(deal.linkedContactIds, [contact.id]);
  assert.equal(deal.contactPhone, "010-1000-1000");
  byId("deal-drawer-close").click();

  /* 연락처의 이름·연락처를 바꾸면 영업 항목에도 반영돼야 한다 */
  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  win().openContactDetail(win().eval("contactsData.find(c=>c.id===" + JSON.stringify(contact.id) + ")"));
  await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세 재열기");
  setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), "연결담당변경");
  setInput(doc().querySelector('#contact-drawer-body [data-field="mobilePhone"]'), "010-2000-2000");
  byId("contact-drawer-save").click();
  await waitFor(async () => ((await stored("tinico:contacts")) || []).find((c) => c.id === contact.id)?.name === "연결담당변경", "연락처 수정");
  const mirrored = await waitFor(async () => {
    const item = ((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.id === deal.id);
    return item?.contactName === "연결담당변경" ? item : null;
  }, "영업 항목 담당자 이름 반영");
  assert.equal(mirrored.contactPhone, "010-2000-2000", "연락처도 함께 반영되어야 한다");
  byId("contact-drawer-close").click();
});

test("영업 항목을 지원 업무로 전환하면 양쪽이 한 번에 반영된다", async () => {
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "전환 검증 건");
  setInput(doc().querySelector('#deal-drawer-body [data-f="action"]'), "내부 확인 필요");
  const areaKey = win().eval("selectedDealRef.areaKey");
  byId("deal-drawer-save").click();
  const deal = await waitFor(async () => ((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.title === "전환 검증 건"), "항목 저장");

  doc().querySelector("#deal-drawer-body [data-convert-support]").click();
  /* 파이프라인에서 빠지고 지원 업무에 생겨야 한다 */
  await waitFor(async () => !((await stored("tinico:stage:" + areaKey)) || []).some((d) => d.id === deal.id), "파이프라인에서 제거");
  const task = await waitFor(async () => ((await stored("tinico:stage:roadmap")) || []).find((t) => t.title === "전환 검증 건"), "지원 업무 생성");
  assert.equal(task.nextAction, "내부 확인 필요", "다음 할 일이 옮겨져야 한다");
  byId("roadmap-modal-cancel")?.click();
});

test("휴지통 비우기가 목록과 DB를 모두 비운다", async () => {
  /* 지울 항목 두 개를 만든다 */
  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  for (const name of ["비우기1", "비우기2"]) {
    byId("contact-manual-btn").click();
    await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세 " + name);
    setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), name);
    byId("contact-drawer-save").click();
    await waitFor(async () => ((await stored("tinico:contacts")) || []).some((c) => c.name === name), "저장 " + name);
    byId("contact-drawer-close").click();
  }
  doc().querySelectorAll("#contact-tbody [data-check]").forEach((box) => box.click());
  byId("contact-bulk-delete-btn").click();
  await waitFor(async () => ((await stored("tinico:trash")) || []).length >= 2, "휴지통 이동");

  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  await waitFor(async () => doc().querySelector("#settings-trash-list .tn-trash-row"), "휴지통 목록");
  byId("settings-trash-empty").click();
  await waitFor(async () => ((await stored("tinico:trash")) || []).length === 0, "휴지통 비우기");
  await waitFor(async () => doc().querySelectorAll("#settings-trash-list .tn-trash-row").length === 0, "휴지통 화면 목록 비우기");
});

test("전체 검색이 영업·연락처·지원 업무를 한 번에 찾아 해당 화면을 연다", async () => {
  /* 검색 대상이 될 영업 항목 하나 */
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세 열림");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "검색대상 영업건");
  const areaKey = win().eval("selectedDealRef.areaKey");
  byId("deal-drawer-save").click();
  const saved = await waitFor(async () => ((await stored("tinico:stage:" + areaKey)) || []).find((d) => d.title === "검색대상 영업건"), "검색 대상 저장");
  await settleDrafts();
  byId("deal-drawer-close").click();

  /* Ctrl+K 로 열린다 */
  const event = new dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true });
  win().dispatchEvent(event);
  assert.equal(byId("global-search-overlay").hidden, false, "Ctrl+K 로 검색창이 열려야 한다");

  setInput(byId("global-search-input"), "검색대상");
  await waitFor(async () => doc().querySelectorAll("#global-search-results .tn-search-item").length > 0, "검색 결과");
  const titles = [...doc().querySelectorAll("#global-search-results .tn-search-item-title")].map((el) => el.textContent);
  assert.ok(titles.includes("검색대상 영업건"), "영업 항목이 검색되어야 한다");

  /* Enter 로 첫 결과를 열면 파이프라인 화면과 항목 상세가 함께 열린다 */
  byId("global-search-input").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert.equal(byId("global-search-overlay").hidden, true, "선택하면 검색창이 닫혀야 한다");
  await waitFor(async () => !byId("deal-drawer").hidden, "검색 결과 열기");
  assert.equal(win().eval("selectedDealRef.id"), saved.id, "검색한 영업 항목이 열려야 한다");
  byId("deal-drawer-close").click();
});

test("활동: AI 요약 초안과 다음 액션 추천이 채워지고 활동 화면에 모인다", async () => {
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세 열림");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "활동기록 영업건");
  setInput(doc().querySelector('#deal-drawer-body [data-f="internalOwner"]'), "활동담당");
  const areaKey = win().eval("selectedDealRef.areaKey");
  const dealKey = "tinico:stage:" + areaKey;
  byId("deal-drawer-save").click();
  const deal = await waitFor(async () => ((await stored(dealKey)) || []).find((d) => d.title === "활동기록 영업건"), "활동 대상 저장");
  await settleDrafts();

  /* 활동 추가 + AI 요약 초안 */
  doc().querySelector("#deal-drawer-body [data-add-activity]").click();
  await waitFor(async () => !byId("activity-overlay").hidden, "활동 모달");
  setSelect(byId("activity-type"), "미팅");
  setInput(byId("activity-content"), "샘플 시험 결과를 함께 확인했다");
  setInput(byId("activity-result"), "");
  setInput(byId("activity-next-action"), "");
  byId("activity-ai-summary").click();
  assert.ok(byId("activity-result").value.includes("샘플"), "AI 초안이 결과를 채워야 한다: " + byId("activity-result").value);
  assert.ok(byId("activity-next-action").value.length > 0, "AI 초안이 다음 할 일을 채워야 한다");
  assert.ok(byId("activity-next-date").value.length === 10, "AI 초안이 다음 액션일을 채워야 한다");

  byId("activity-save").click();
  await waitFor(async () => (((await stored(dealKey)) || []).find((d) => d.id === deal.id)?.activities || []).length === 1, "활동 저장");

  /* 다음 액션 추천이 항목에 반영된다 */
  await waitFor(async () => !byId("deal-drawer").hidden, "상세 복귀");
  doc().querySelector("#deal-drawer-body [data-next-action]").click();
  await waitFor(async () => {
    const current = ((await stored(dealKey)) || []).find((d) => d.id === deal.id);
    return current && current.nextAction && current.action;
  }, "다음 액션 추천 저장");
  const afterDeal = ((await stored(dealKey)) || []).find((d) => d.id === deal.id);
  assert.ok(afterDeal.nextAction.length === 10, "권장 일자가 저장되어야 한다");
  assert.ok(afterDeal.action.length > 0, "다음에 할 일이 저장되어야 한다");
  byId("deal-drawer-close").click();

  /* 활동 화면에 모여 보인다 */
  doc().querySelector('#tn-tabs [data-key="activity"]').click();
  setSelect(byId("activity-range"), "all");
  await waitFor(async () => doc().querySelectorAll("#activity-timeline .tn-activity-row").length > 0, "활동 타임라인");
  const timeline = byId("activity-timeline").textContent;
  assert.ok(timeline.includes("활동기록 영업건"), "타임라인에 영업건 이름이 보여야 한다");
  assert.ok(timeline.includes("샘플 시험 결과를 함께 확인했다"), "타임라인에 활동 내용이 보여야 한다");
  assert.ok(byId("activity-summary").textContent.includes("활동 기록"), "요약 카드가 있어야 한다");
  assert.ok(byId("activity-breakdown").textContent.includes("미팅"), "유형별 집계가 있어야 한다");
  /* 접촉 기록이 없는 영업건은 접촉 끊김 목록에 남는다 */
  assert.ok(byId("activity-stale").textContent.length > 0, "접촉 끊김 영역이 채워져야 한다");
});

test("연락처 중복 정리가 빈 값을 채워 합치고 중복을 휴지통으로 보낸다", async () => {
  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  const make = async (name, fill) => {
    byId("contact-manual-btn").click();
    await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세 " + name);
    setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), name);
    fill();
    byId("contact-drawer-save").click();
    const saved = await waitFor(async () => ((await stored("tinico:contacts")) || []).find((c) => c.name === name), "저장 " + name);
    /* DB에 값이 들어온 뒤에도 화면은 저장 마무리 중이라 닫기 버튼이 거절될 수 있다 */
    await waitFor(async () => win().eval("[...contactDrafts.values()].every(draft=>!draft.saving)"), "저장 마무리 " + name);
    byId("contact-drawer-close").click();
    await waitFor(async () => byId("contact-drawer").hidden, "상세 닫힘 " + name);
    return saved;
  };
  /* 같은 휴대전화 번호를 쓰는 두 사람 (리멤버 CSV를 두 번 올렸을 때와 같은 상태) */
  const primary = await make("중복검사대표", () => {
    setInput(doc().querySelector('#contact-drawer-body [data-field="mobilePhone"]'), "010-7777-8888");
  });
  await make("중복검사부본", () => {
    setInput(doc().querySelector('#contact-drawer-body [data-field="mobilePhone"]'), "010-7777-8888");
    setInput(doc().querySelector('#contact-drawer-body [data-field="company"]'), "중복상사");
    setInput(doc().querySelector('#contact-drawer-body [data-field="email"]'), "dup@example.com");
  });

  byId("contact-dedupe-btn").click();
  await waitFor(async () => doc().querySelectorAll("#dedupe-list .tn-dedupe-group").length > 0, "중복 그룹");
  /* 첫 그룹에서 회사가 비어 있는 쪽을 대표로 고른다 */
  const radios = [...doc().querySelectorAll('#dedupe-list input[name="dedupe-0"]')];
  const primaryRadio = radios.find((radio) => radio.value === primary.id);
  assert.ok(primaryRadio, "대표 후보에 첫 연락처가 있어야 한다");
  primaryRadio.checked = true;
  doc().querySelector('#dedupe-list [data-merge-group="0"]').click();

  await waitFor(async () => !((await stored("tinico:contacts")) || []).some((c) => c.name === "중복검사부본"), "중복 병합");
  const merged = ((await stored("tinico:contacts")) || []).find((c) => c.id === primary.id);
  assert.ok(merged, "고른 대표가 남아야 한다");
  assert.equal(merged.company, "중복상사", "빈 회사명이 합쳐진 값으로 채워져야 한다");
  assert.equal(merged.email, "dup@example.com", "빈 이메일이 합쳐진 값으로 채워져야 한다");
  assert.ok(((await stored("tinico:trash")) || []).some((entry) => entry.type === "contact" && entry.label === "중복검사부본"), "합쳐진 쪽은 휴지통으로");
  byId("dedupe-close").click();
});

test("파이프라인 Excel 내보내기·가져오기가 DB에 반영된다", async () => {
  doc().querySelector('#tn-tabs [data-key="pipeline"]').click();
  byId("pipe-new-deal").click();
  await waitFor(async () => !byId("deal-drawer").hidden, "항목 상세 열림");
  setInput(doc().querySelector('#deal-drawer-body [data-f="title"]'), "엑셀왕복 영업건");
  const areaKey = win().eval("selectedDealRef.areaKey");
  const dealKey = "tinico:stage:" + areaKey;
  byId("deal-drawer-save").click();
  const deal = await waitFor(async () => ((await stored(dealKey)) || []).find((d) => d.title === "엑셀왕복 영업건"), "엑셀 대상 저장");
  await settleDrafts();
  byId("deal-drawer-close").click();
  /* 내보내기는 지금 걸린 검색·필터 결과를 그대로 담으므로 조건을 비워 둔다 */
  setInput(byId("pipe-search"), "");
  ["pipe-bucket-filter", "pipe-area-filter", "pipe-owner-filter", "pipe-stage-filter"].forEach((id) => setSelect(byId(id), ""));
  await waitFor(async () => win().eval("pipeDeals().some(entry=>entry.item.title==='엑셀왕복 영업건')"), "내보낼 목록에 포함");

  const blobs = [];
  const originalCreate = win().URL.createObjectURL;
  win().URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:pipeline"; };
  byId("pipe-export-btn").click();
  await waitFor(async () => blobs.length > 0, "Excel 파일 생성");
  win().URL.createObjectURL = originalCreate;
  const bytes = new Uint8Array(await blobs[0].arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK", "xlsx 파일이어야 한다");

  /* 내보낸 표에서 값을 고쳐 다시 가져온다 */
  const sheets = await win().eval("workbookSheetRows")(bytes.buffer);
  const rows = sheets.get("영업항목");
  assert.ok(rows && rows.length > 1, "영업항목 시트가 있어야 한다");
  const headers = rows[0].map((value) => String(value));
  const target = rows.find((row) => String(row[headers.indexOf("항목ID")]) === deal.id);
  assert.ok(target, "내보낸 표에 방금 만든 항목이 있어야 한다");
  target[headers.indexOf("내부 담당자")] = "엑셀담당";
  target[headers.indexOf("다음에 할 일")] = "엑셀로 수정한 후속 업무";
  const newRow = headers.map((_, index) => index === headers.indexOf("항목ID") ? "" : "");
  newRow[headers.indexOf("그룹키")] = areaKey;
  newRow[headers.indexOf("고객사/영업건")] = "엑셀신규 영업건";
  newRow[headers.indexOf("단계")] = "상담";
  const rebuilt = await win().eval("buildSheetWorkbook")([{ name: "영업항목", rows: [...rows, newRow] }]);
  const file = new dom.window.File([new Uint8Array(await rebuilt.arrayBuffer())], "pipeline.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  await win().eval("importPipelineWorkbook")(file);
  await waitFor(async () => ((await stored(dealKey)) || []).find((d) => d.id === deal.id)?.internalOwner === "엑셀담당", "Excel 수정 반영");
  await waitFor(async () => ((await stored(dealKey)) || []).some((d) => d.title === "엑셀신규 영업건"), "Excel 신규 추가");
  const created = ((await stored(dealKey)) || []).find((d) => d.title === "엑셀신규 영업건");
  assert.equal(created.stage, "상담");
});

test("사용자 계정: 로그인한 이름이 변경 이력에 남고 열람 권한은 저장이 막힌다", async () => {
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  byId("settings-admin-open").click();
  setInput(byId("settings-admin-code"), adminCode);
  byId("settings-admin-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(async () => !byId("settings-admin-actions").hidden, "관리자 인증");

  /* 사용자 추가 */
  await waitFor(async () => !byId("settings-member-add").disabled, "사용자 추가 버튼 활성화");
  byId("settings-member-add").click();
  setInput(byId("member-modal-name"), "테스트사용자");
  setSelect(byId("member-modal-role"), "editor");
  setInput(byId("member-modal-password"), "member-pass-1");
  byId("member-modal-save").click();
  const member = await waitFor(async () => (await repository.listMembers(workspaceId)).find((entry) => entry.name === "테스트사용자"), "사용자 생성");
  assert.equal(member.role, "editor");
  assert.equal(member.hasPassword, true, "비밀번호는 해시로만 저장된다");

  /* 로그인하지 않으면 서버가 저장을 거부한다 */
  const denied = await fetch(baseUrl + "/api/storage/" + encodeURIComponent("tinico:app:settings"), {
    method: "PUT",
    headers: { "x-crm-key": accessKey, "content-type": "application/json" },
    body: JSON.stringify({ requestId: "aaaaaaaaaaaaaaaa-no-member", generation: "x", changes: [{ key: "tinico:app:settings", mutations: [] }] })
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error, "member_session_required");

  /* 화면에서 로그인 */
  win().eval("showMemberGate")("");
  await waitFor(async () => doc().querySelectorAll("#member-login-name option").length > 0, "사용자 목록");
  setSelect(byId("member-login-name"), member.id);
  setInput(byId("member-login-password"), "member-pass-1");
  byId("member-login-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(async () => byId("member-gate").hidden && win().eval("currentMember && currentMember.name") === "테스트사용자", "사용자 로그인");
  assert.equal(byId("tn-user-chip-name").textContent, "테스트사용자");

  /* 저장하면 변경 이력에 이름이 남는다 */
  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  byId("contact-manual-btn").click();
  await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세");
  setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), "권한확인연락처");
  byId("contact-drawer-save").click();
  await waitFor(async () => ((await stored("tinico:contacts")) || []).some((c) => c.name === "권한확인연락처"), "사용자 저장");
  byId("contact-drawer-close").click();
  const logged = await waitFor(async () => (await auditFor("tinico:contacts")).find((entry) => entry.entityLabel.startsWith("권한확인연락처")), "변경 이력 기록");
  assert.equal(logged.actorName, "테스트사용자", "변경 이력에 작업자가 남아야 한다");
  assert.equal(logged.actorId, member.id);

  /* 열람 권한으로 바꾸면 저장이 막힌다 */
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  await waitFor(async () => doc().querySelector('#settings-member-list [data-edit-member]'), "사용자 목록 표시");
  doc().querySelector('#settings-member-list [data-edit-member="' + member.id + '"]').click();
  setSelect(byId("member-modal-role"), "viewer");
  byId("member-modal-save").click();
  await waitFor(async () => (await repository.listMembers(workspaceId)).find((entry) => entry.id === member.id)?.role === "viewer", "열람 권한 전환");

  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  byId("contact-manual-btn").click();
  await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세(열람)");
  setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), "열람권한연락처");
  byId("contact-drawer-save").click();
  await waitFor(async () => win().eval("canEditData()") === false, "열람 권한 반영");
  assert.ok(!((await stored("tinico:contacts")) || []).some((c) => c.name === "열람권한연락처"), "열람 권한으로는 저장되지 않아야 한다");
  byId("contact-drawer-close").click();

  /* 사용자를 지우면 예전처럼 접속키만으로 저장된다 */
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  doc().querySelector('#settings-member-list [data-edit-member="' + member.id + '"]').click();
  byId("member-modal-delete").click();
  await waitFor(async () => (await repository.listMembers(workspaceId)).length === 0, "사용자 삭제");
  await waitFor(async () => win().eval("canEditData()") === true, "권한 제한 해제");

  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  byId("contact-manual-btn").click();
  await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세(복구)");
  setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), "권한해제연락처");
  byId("contact-drawer-save").click();
  await waitFor(async () => ((await stored("tinico:contacts")) || []).some((c) => c.name === "권한해제연락처"), "사용자 삭제 후 저장");
  byId("contact-drawer-close").click();
});

test("설정 > 변경 이력이 조건에 맞는 기록과 상세를 보여준다", async () => {
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  await waitFor(async () => !byId("settings-audit-refresh").disabled, "변경 이력 사용 가능");
  setSelect(byId("audit-range"), "");
  byId("settings-audit-refresh").click();
  await waitFor(async () => doc().querySelectorAll("#audit-tbody [data-audit-detail]").length > 0, "변경 이력 목록");
  assert.ok(byId("settings-audit-state").textContent.includes("건"), "건수가 표시되어야 한다");

  /* 화면 필터가 실제로 좁힌다 */
  const options = [...doc().querySelectorAll("#audit-screen option")].map((option) => option.value);
  assert.ok(options.includes("연락처"), "화면 목록에 연락처가 있어야 한다: " + options.join(","));
  setSelect(byId("audit-screen"), "연락처");
  await waitFor(async () => {
    const screens = [...doc().querySelectorAll("#audit-tbody tr td:nth-child(2)")].map((cell) => cell.textContent);
    return screens.length > 0 && screens.every((screen) => screen === "연락처");
  }, "화면 필터");

  /* 검색어로 방금 만든 연락처를 찾고 상세를 연다 */
  setInput(byId("audit-search"), "권한확인연락처");
  await waitFor(async () => {
    const labels = [...doc().querySelectorAll("#audit-tbody .tn-settings-row-title")].map((cell) => cell.textContent);
    return labels.length > 0 && labels.some((label) => label.includes("권한확인연락처"));
  }, "검색 필터");
  doc().querySelector("#audit-tbody [data-audit-detail]").click();
  assert.equal(byId("audit-detail-overlay").hidden, false, "상세가 열려야 한다");
  assert.ok(byId("audit-detail-sub").textContent.includes("연락처"), "상세에 화면 이름이 보여야 한다");
  assert.ok(byId("audit-detail-tbody").textContent.length > 0, "변경 항목이 있어야 한다");
  byId("audit-detail-close").click();

  /* 다음 테스트를 위해 조건을 되돌린다 */
  setInput(byId("audit-search"), "");
  setSelect(byId("audit-screen"), "");
});

test("관리자 백업·복원: 내려받은 Excel 파일로 실제 DB가 되돌아온다", async () => {
  doc().querySelector('#tn-tabs [data-key="settings"]').click();
  byId("settings-admin-open").click();
  setInput(byId("settings-admin-code"), adminCode);
  byId("settings-admin-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(async () => !byId("settings-admin-actions").hidden, "관리자 인증");

  /* 이 시점의 상태를 백업 */
  const blobs = [];
  const originalCreate = win().URL.createObjectURL;
  win().URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:backup"; };
  byId("settings-backup-export").click();
  await waitFor(async () => blobs.length > 0, "백업 파일 생성");
  win().URL.createObjectURL = originalCreate;
  const workbook = new Uint8Array(await blobs[0].arrayBuffer());
  assert.equal(String.fromCharCode(workbook[0], workbook[1]), "PK", "Excel 파일이어야 한다");

  const before = ((await stored("tinico:manual:sections")) || []).length;
  assert.ok(before > 0);

  /* 백업 후 데이터를 바꾼다 */
  doc().querySelector('#tn-tabs [data-key="contacts"]').click();
  byId("contact-manual-btn").click();
  await waitFor(async () => !byId("contact-drawer").hidden, "연락처 상세");
  setInput(doc().querySelector('#contact-drawer-body [data-field="name"]'), "백업이후연락처");
  byId("contact-drawer-save").click();
  await waitFor(async () => ((await stored("tinico:contacts")) || []).some((c) => c.name === "백업이후연락처"), "백업 이후 추가");
  byId("contact-drawer-close").click();

  /* 복원하면 백업 시점으로 되돌아간다 */
  const file = new dom.window.File([workbook], "backup.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await win().eval("importFullBackup")(file);
  await waitFor(async () => !((await stored("tinico:contacts")) || []).some((c) => c.name === "백업이후연락처"), "복원으로 되돌아감");
  assert.equal(((await stored("tinico:manual:sections")) || []).length, before, "복원 후 매뉴얼 수가 같아야 한다");
});

test("명함 인식·백업 코드는 첫 화면에서 받지 않고, 쓸 때 받아서 동작한다", async (t) => {
  /* 이 테스트만 heavy.js 를 미리 넣지 않고 실제 주소에서 받아오게 한다 */
  const requested = [];
  const rawHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const lazyDom = new JSDOM(rawHtml, {
    url: baseUrl + "/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    resources: "usable",
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.localStorage.setItem("tinico:cloud:access-key", accessKey);
      window.fetch = (input, options) => fetch(new URL(String(input), baseUrl), options);
      window.Response = Response; window.Headers = Headers; window.Request = Request;
      window.AbortController = AbortController;
      window.CompressionStream = CompressionStream;
      window.DecompressionStream = DecompressionStream;
      window.confirm = () => true; window.alert = () => {}; window.scrollTo = () => {};
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.URL.createObjectURL = () => "blob:lazy"; window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () {};
    }
  });
  t.after(() => lazyDom.window.close());
  const lazyDoc = lazyDom.window.document;
  for (let i = 0; i < 600; i++) {
    if (lazyDoc.querySelectorAll("#ai-persona-select option").length) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(lazyDoc.querySelectorAll("#ai-persona-select option").length, "화면이 떠야 한다");

  /* 첫 화면에서는 heavy.js 의 함수가 없어야 한다 */
  assert.equal(lazyDom.window.eval("typeof openScanner"), "undefined", "첫 화면에는 명함 인식 코드가 없어야 한다");
  assert.equal(lazyDom.window.eval("typeof buildBackupWorkbook"), "undefined", "첫 화면에는 백업 코드가 없어야 한다");
  assert.equal(lazyDom.window.eval("typeof loadHeavyFeatures"), "function", "필요할 때 불러오는 장치는 있어야 한다");

  /* 실제로 불러오면 두 기능 모두 쓸 수 있어야 한다 */
  await lazyDom.window.eval("loadHeavyFeatures()");
  assert.equal(lazyDom.window.eval("typeof openScanner"), "function", "불러온 뒤에는 명함 인식이 가능해야 한다");
  assert.equal(lazyDom.window.eval("typeof buildBackupWorkbook"), "function", "불러온 뒤에는 백업이 가능해야 한다");

  /* 불러온 코드가 실제로 동작하는지 (Excel 파일을 만들어 다시 읽는다) */
  const sample = {
    format: "tiniko-crm-admin-backup-v3", tinikoCRMBackupVersion: 3, workspaceId,
    exportedAt: "2026-09-11T00:00:00.000Z", description: "지연 로딩 확인",
    summary: { recordCount: 1, auditLogCount: 0 },
    data: { records: [{ key: "tinico:areas", value: [{ id: "a", title: "확인" }], revision: 1, updatedAt: "2026-09-11T00:00:00.000Z" }], auditLogs: [] }
  };
  const blob = await lazyDom.window.eval("buildBackupWorkbook")(sample);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const back = await lazyDom.window.eval("readBackupWorkbook")(bytes.buffer);
  assert.equal(back.data.records[0].key, "tinico:areas");
  assert.equal(back.data.records[0].value[0].title, "확인");

  /* 두 번째 호출은 다시 내려받지 않는다 */
  await lazyDom.window.eval("loadHeavyFeatures()");
  assert.equal(lazyDom.window.document.querySelectorAll('script[src^="heavy.js"]').length, 1, "한 번만 내려받아야 한다");
});

test("전체 흐름 동안 처리되지 않은 오류가 없다", () => {
  const ignorable = /Not implemented: navigation|Could not parse CSS|csstree/;
  assert.deepEqual(runtimeErrors.filter((message) => !ignorable.test(message)), []);
});
