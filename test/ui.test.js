import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { randomUUID } from "node:crypto";
import { initialDocument, publicDocument, applyChange, validateTransaction } from "../src/concurrency.js";
import { buildAuditEntries } from "../src/audit.js";

const htmlPath = new URL("../public/index.html", import.meta.url);
const accessKey = "browser-test-key-1234567890";
/* 모의 서버가 검증하는 값이므로 실제 관리자 코드를 저장소에 남기지 않는다 */
const requestedAdminCode = "ui-test-admin-code";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createMockApi(initialRecords = {}) {
  const records = new Map(Object.entries(initialRecords).map(([key, value]) => [key, clone(value)]));
  const revisions = new Map();
  const failedPuts = new Map();
  const googleRequests = [];
  const allRequests = [];
  const adminRequests = [];
  const auditLogs = [];
  const documents=new Map(),requests=new Map();let generation=randomUUID();
  function getDocument(key){if(!documents.has(key))documents.set(key,initialDocument(key,records.has(key)?{value:clone(records.get(key)),revision:revisions.get(key)||1}:null));return documents.get(key);}
  let expectedAccessKey = accessKey;
  const adminToken = "ui-test-admin-token";

  return {
    records,
    allRequests,
    googleRequests,
    adminRequests,
    remoteSave(key,value){const before=getDocument(key);const mutations=before.collection?value.filter(item=>JSON.stringify(item)!==JSON.stringify((before.value||[]).find(old=>old.id===item.id))).map(item=>({id:item.id,version:before.items.find(old=>old.id===item.id)?.version??null,value:item})):[{id:"",version:before.items[0]?.version??null,value}];if(before.collection)for(const old of before.value||[])if(!value.some(item=>item.id===old.id))mutations.push({id:old.id,version:before.items.find(item=>item.id===old.id).version,deleted:true});const after=applyChange(before,{mutations});documents.set(key,after);records.set(key,clone(after.value));return publicDocument(after,generation);},
    simulateRestore(){generation=randomUUID();documents.clear();requests.clear();},
    setExpectedAccessKey(value) {
      expectedAccessKey = value;
    },
    failNextPut(key, status = 500) {
      failedPuts.set(key, status);
    },
    async fetch(input, options = {}) {
      const url = new URL(String(input), "https://tiniko.test");
      const method = String(options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});
      allRequests.push({ method, url: url.href, accessKey: headers.get("x-crm-key") });

      if (url.hostname === "www.googleapis.com") {
        googleRequests.push({
          method,
          path: url.pathname + url.search,
          authorization: headers.get("authorization"),
          body: options.body ? JSON.parse(String(options.body)) : null
        });
        if (method === "GET") {
          const now = new Date();
          const importedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
          return jsonResponse({ items: [{
          id: "google-import-1",
          summary: "Google에서 불러온 일정",
          start: { date: importedDate },
          location: "Google Calendar",
          htmlLink: "https://calendar.google.com/event?eid=import-test",
          status: "confirmed"
        }] });
        }
        if (method === "DELETE") return new Response(null, { status: 204 });
        return jsonResponse({ id: "google-event-1", htmlLink: "https://calendar.google.com/event?eid=test" });
      }

      if (url.pathname === "/api/session") {
        if (headers.get("x-crm-key") !== expectedAccessKey) return jsonResponse({ error: "invalid_access_key" }, 401);
        return jsonResponse({ status: "ok", workspaceId: "test", database: "connected" });
      }

      if (url.pathname === "/api/admin/session") {
        adminRequests.push({ method, path: url.pathname });
        if (headers.get("x-crm-key") !== expectedAccessKey) return jsonResponse({ error: "invalid_access_key" }, 401);
        const body = JSON.parse(String(options.body || "{}"));
        if (body.code !== requestedAdminCode) return jsonResponse({ error: "invalid_admin_code" }, 403);
        return jsonResponse({ status: "ok", token: adminToken, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
      }

      if (url.pathname === "/api/admin/backup") {
        adminRequests.push({ method, path: url.pathname });
        if (headers.get("x-crm-key") !== expectedAccessKey) return jsonResponse({ error: "invalid_access_key" }, 401);
        if (headers.get("authorization") !== "Bearer " + adminToken) return jsonResponse({ error: "invalid_or_expired_admin_session" }, 403);
        const exportedAt = new Date().toISOString();
        return jsonResponse({
          format: "tiniko-crm-admin-backup-v3",
          tinikoCRMBackupVersion: 3,
          workspaceId: "test",
          exportedAt,
          exportedAtKST: exportedAt,
          summary: { recordCount: records.size, auditLogCount: auditLogs.length, byScreen: {}, byAction: {} },
          data: {
            records: [...records.entries()].map(([key, value]) => ({ key, value: clone(value), revision: revisions.get(key) || 1, updatedAt: exportedAt })),
            auditLogs: clone(auditLogs)
          }
        });
      }

      if (url.pathname === "/api/admin/restore") {
        adminRequests.push({ method, path: url.pathname });
        if (headers.get("x-crm-key") !== expectedAccessKey) return jsonResponse({ error: "invalid_access_key" }, 401);
        if (headers.get("authorization") !== "Bearer " + adminToken) return jsonResponse({ error: "invalid_or_expired_admin_session" }, 403);
        const body = JSON.parse(String(options.body || "{}"));
        if (body.backup?.tinikoCRMBackupVersion !== 3) return jsonResponse({ error: "unsupported_backup" }, 400);
        records.clear();
        documents.clear();requests.clear();generation=randomUUID();
        (body.backup.data?.records || []).forEach((record) => records.set(record.key, clone(record.value)));
        return jsonResponse({ status: "restored", recordCount: records.size, auditLogCount: (body.backup.data?.auditLogs || []).length + 1 });
      }

      if (url.pathname.startsWith("/api/storage/")) {
        if (headers.get("x-crm-key") !== expectedAccessKey) return jsonResponse({ error: "invalid_access_key" }, 401);
        const key = decodeURIComponent(url.pathname.slice("/api/storage/".length));

        if (method === "GET") {
          return jsonResponse(publicDocument(getDocument(key),generation));
        }

        if (method === "PUT") {
          const body = JSON.parse(String(options.body || "{}"));
          const failedKey=body.changes?.find(change=>failedPuts.has(change.key))?.key;
          if (failedKey) {
            const status = failedPuts.get(failedKey);
            failedPuts.delete(failedKey);
            return jsonResponse({ error: "forced_test_failure", requestId: "ui-test-request" }, status);
          }
          if(body.changes){
            try{
              validateTransaction(body);
              if(body.generation!==generation)return jsonResponse({error:"workspace_restored",message:"전체 데이터가 복원되었습니다."},409);
              if(requests.has(body.requestId))return jsonResponse(requests.get(body.requestId));
              const pending=new Map(body.changes.map(change=>[change.key,applyChange(getDocument(change.key),change)]));
              const contacts=pending.get("tinico:contacts");
              if(contacts)for(const [stageKey,values] of records){
                if(!stageKey.startsWith("tinico:stage:")||stageKey.endsWith(":roadmap")||!Array.isArray(values))continue;
                const current=pending.get(stageKey)||getDocument(stageKey),mutations=[];
                for(const item of current.value||[]){
                  if(!(item.linkedContactIds||[]).some(id=>body.changes.find(change=>change.key==="tinico:contacts").mutations.some(m=>m.id===id)))continue;
                  const linked=(item.linkedContactIds||[]).map(id=>(contacts.value||[]).find(ct=>ct.id===id)).filter(Boolean),primary=linked[0];
                  const value={...item,contactName:linked.map(ct=>ct.name||"").filter(Boolean).join(", "),contactRole:primary?[primary.department,primary.jobTitle].filter(Boolean).join(" / "):"",contactPhone:primary?.mobilePhone||primary?.businessPhone||primary?.phone||"",contactEmail:primary?.email||""};
                  mutations.push({id:item.id,version:current.items.find(i=>i.id===item.id).version,value});
                }
                if(mutations.length)pending.set(stageKey,applyChange(current,{mutations}));
              }
              const result={status:"saved",records:{}};
              for(const changedKey of pending.keys())if(failedPuts.has(changedKey)){const status=failedPuts.get(changedKey);failedPuts.delete(changedKey);return jsonResponse({error:"forced_test_failure"},status);}
              for(const [changedKey,doc] of pending){auditLogs.push(...buildAuditEntries({storageKey:changedKey,beforeValue:records.get(changedKey)??null,afterValue:doc.value}));documents.set(changedKey,doc);records.set(changedKey,clone(doc.value));revisions.set(changedKey,doc.revision);result.records[changedKey]=publicDocument(doc,generation);}
              requests.set(body.requestId,result);return jsonResponse(result);
            }catch(error){return jsonResponse({error:error.publicCode,message:error.message,conflicts:error.conflicts},error.statusCode||500);}
          }
          records.set(key, clone(body.value));
          const revision = (revisions.get(key) || 0) + 1;
          revisions.set(key, revision);
          auditLogs.push({
            eventId: "ui-audit-" + auditLogs.length,
            eventAt: new Date().toISOString(),
            screen: key === "tinico:contacts" ? "연락처" : key.startsWith("tinico:stage:") ? "파이프라인" : "설정",
            action: revision === 1 ? "입력" : "수정",
            entityType: "테스트 데이터",
            entityId: key,
            entityLabel: key,
            storageKey: key,
            changedFields: [],
            beforeValue: null,
            afterValue: clone(body.value),
            summary: "UI 테스트 변경"
          });
          return jsonResponse({ status: "saved", revision, updatedAt: new Date().toISOString() });
        }

        if (method === "DELETE") {
          const deleted = records.delete(key);
          return jsonResponse({ status: "deleted", deleted });
        }
      }

      return jsonResponse({ error: "not_found" }, 404);
    }
  };
}

/* alert 대신 표시되는 상단 알림(showToast)의 마지막 메시지 */
function lastNotice(document) {
  return [...document.querySelectorAll(".tn-notice")].at(-1)?.textContent || "";
}

async function saveEditor(window,kind){
  const button=window.document.getElementById(kind+"-drawer-save");
  assert.equal(button.disabled,false,kind+" save is available");button.click();
  await waitFor(()=>window.document.getElementById(kind+"-save-status").textContent==="저장됨"&&button.textContent==="저장",kind+" explicitly saved");
}

async function waitFor(predicate, message, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for " + message);
}

function input(window, element, value) {
  element.value = value;
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}

async function createBrowser(initialRecords = {}, setupWindow = null) {
  /* jsdom은 외부 리소스를 내려받지 않으므로 분리된 app.js/styles.css를 다시 인라인해 로드 */
  const [rawHtml, appJs, stylesCss, heavyJs] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/heavy.js", import.meta.url), "utf8")
  ]);
  const html = rawHtml
    .replace(/<link rel="stylesheet" href="styles\.css[^"]*">/, () => `<style>${stylesCss}</style>`)
    /* 운영에서는 heavy.js를 쓸 때 내려받지만, 테스트 화면은 외부 파일을 받을 수 없어 함께 넣어 둔다 */
    .replace(/<script src="app\.js[^"]*"><\/script>/, () => `<script>${appJs}</script><script>${heavyJs}</script>`);
  if (!html.includes("async function init()")) throw new Error("app.js inlining failed in test harness");
  const api = createMockApi({
    "tinico:app:settings": { onboardingSeen: true, beginnerMode: true },
    ...initialRecords
  });
  const runtimeErrors = [];
  const alerts = [];
  const downloads = [];
  const openedUrls = [];
  const listenerBindings = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => runtimeErrors.push(error));
  virtualConsole.on("error", (...args) => runtimeErrors.push(new Error(args.map(String).join(" "))));

  const dom = new JSDOM(html, {
    url: "https://tiniko.test/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      const originalAddEventListener = window.EventTarget.prototype.addEventListener;
      window.EventTarget.prototype.addEventListener = function addEventListener(type, listener, options) {
        if (this && this.id) listenerBindings.push({ id: this.id, type: String(type) });
        return originalAddEventListener.call(this, type, listener, options);
      };
      window.localStorage.setItem("tinico:cloud:access-key", accessKey);
      window.fetch = api.fetch;
      window.Response = Response;
      window.Headers = Headers;
      window.Request = Request;
      window.AbortController = AbortController;
      window.confirm = () => true;
      window.alert = (message) => alerts.push(String(message));
      window.prompt = () => "";
      window.open = (url) => { openedUrls.push(String(url)); return null; };
      window.scrollTo = () => {};
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
      window.URL.createObjectURL = () => "blob:ui-test";
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function click() {
        if (this.download) downloads.push({ filename: this.download, href: this.href });
      };
      window.navigator.clipboard = { writeText: async () => {} };
      /* 실제 브라우저처럼 압축 기능을 제공해 Excel이 다시 저장한 형태까지 검증할 수 있게 한다 */
      window.CompressionStream = CompressionStream;
      window.DecompressionStream = DecompressionStream;
      window.HTMLElement.prototype.scrollIntoView = () => {};
      if (setupWindow) setupWindow(window);
      window.addEventListener("unhandledrejection", (event) => {
        runtimeErrors.push(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
        event.preventDefault();
      });
    }
  });

  try {
    await waitFor(
      () => dom.window.document.querySelectorAll("#ai-persona-select option").length > 0,
      "CRM initialization"
    );
  } catch (error) {
    const gateMessage = dom.window.document.getElementById("cloud-login-status")?.textContent || "";
    const details = runtimeErrors.map((runtimeError) => runtimeError.message).join(" | ");
    const savedKey = dom.window.localStorage.getItem("tinico:cloud:access-key") || "";
    const gateHidden = dom.window.document.getElementById("cloud-gate")?.hidden;
    const dbState = dom.window.document.getElementById("cloud-db-state")?.textContent || "";
    let scriptState = "";
    try { scriptState = dom.window.eval("JSON.stringify({read:readSavedCloudAccessKey(),cloud:cloudAccessKey})"); } catch (stateError) { scriptState = stateError.message; }
    throw new Error(`${error.message}; gate=${gateMessage}; hidden=${gateHidden}; db=${dbState}; keyLength=${savedKey.length}; script=${scriptState}; requests=${JSON.stringify(api.allRequests.slice(0,5))}; runtime=${details}`);
  }
  return { dom, api, runtimeErrors, alerts, downloads, openedUrls, listenerBindings };
}

test("browser UI persists contact, pipeline, and calendar changes safely", async (t) => {
  const { dom, api, runtimeErrors, alerts, downloads } = await createBrowser();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const refreshedManual = await dom.window.eval("loadManualSections()");
  const migratedManual = refreshedManual.find((section) => section.id === "manual_troubleshooting");
  assert.match(migratedManual.content, /상단 ‘저장’을 눌러야 반영/);
  assert.match(
    refreshedManual.find((section) => section.id === "manual_cloud_db")?.content || "",
    /CRM_ACCESS_KEY는 필수/
  );
  assert.match(
    refreshedManual.find((section) => section.id === "manual_settings")?.content || "",
    /화면별 변경 로그/
  );

  assert.equal(document.getElementById("settings-admin-actions").hidden, true);
  document.getElementById("settings-admin-open").click();
  assert.equal(document.getElementById("settings-admin-overlay").hidden, false);
  document.getElementById("settings-admin-code").value = "wrong-code";
  document.getElementById("settings-admin-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => /일치하지 않습니다/.test(document.getElementById("settings-admin-status").textContent), "wrong administrator code message");
  assert.equal(document.getElementById("settings-admin-actions").hidden, true);

  document.getElementById("settings-admin-code").value = requestedAdminCode;
  document.getElementById("settings-admin-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => document.getElementById("settings-admin-overlay").hidden, "administrator unlock");
  assert.equal(document.getElementById("settings-admin-actions").hidden, false);
  assert.equal(document.getElementById("settings-admin-open").textContent, "활성화됨");
  document.getElementById("settings-backup-export").click();
  await waitFor(() => downloads.length === 1, "administrator backup download");
  assert.match(downloads[0].filename, /^hlb_busisup_crm_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.xlsx$/);
  assert.ok(api.adminRequests.some((request) => request.path === "/api/admin/backup"));

  document.getElementById("contact-manual-btn").click();
  await waitFor(() => !document.getElementById("contact-drawer").hidden, "contact drawer");
  input(dom.window, document.querySelector('#contact-drawer-body [data-field="name"]'), "테스트 담당자");
  await saveEditor(dom.window,"contact");
  document.getElementById("contact-drawer-close").click();
  await waitFor(
    () => (api.records.get("tinico:contacts") || []).some((contact) => contact.name === "테스트 담당자"),
    "contact explicit save"
  );

  const contactIdsBeforeDeleteTest = new Set((api.records.get("tinico:contacts") || []).map((contact) => contact.id));
  document.getElementById("contact-manual-btn").click();
  await waitFor(() => !document.getElementById("contact-drawer").hidden, "second contact drawer");
  await saveEditor(dom.window,"contact");
  const deletingContact = await waitFor(
    () => (api.records.get("tinico:contacts") || []).find((contact) => !contactIdsBeforeDeleteTest.has(contact.id)),
    "new contact persistence"
  );
  input(dom.window, document.querySelector('#contact-drawer-body [data-field="name"]'), "즉시 삭제 연락처");
  document.querySelector("#contact-drawer-body [data-delete]").click();
  await waitFor(
    () => !(api.records.get("tinico:contacts") || []).some((contact) => contact.id === deletingContact.id),
    "contact deletion with an unsaved draft"
  );
  await new Promise((resolve) => setTimeout(resolve, 550));

  document.getElementById("pipe-new-deal").click();
  await waitFor(() => !document.getElementById("deal-drawer").hidden, "deal drawer");
  input(dom.window, document.querySelector('#deal-drawer-body [data-f="title"]'), "명시적 저장 검증 영업 건");
  await saveEditor(dom.window,"deal");
  document.getElementById("deal-drawer-close").click();
  await waitFor(
    () => [...api.records.entries()]
      .filter(([key]) => key.startsWith("tinico:stage:") && key !== "tinico:stage:roadmap")
      .some(([, deals]) => Array.isArray(deals) && deals.some((deal) => deal.title === "명시적 저장 검증 영업 건")),
    "deal explicit save before closing"
  );

  const dealIdsBeforeDeleteTest = new Set(
    [...api.records.entries()]
      .filter(([key]) => key.startsWith("tinico:stage:") && key !== "tinico:stage:roadmap")
      .flatMap(([, deals]) => Array.isArray(deals) ? deals.map((deal) => deal.id) : [])
  );
  document.getElementById("pipe-new-deal").click();
  await waitFor(() => !document.getElementById("deal-drawer").hidden, "second deal drawer");
  await saveEditor(dom.window,"deal");
  const deletingDeal = await waitFor(
    () => [...api.records.entries()]
      .filter(([key]) => key.startsWith("tinico:stage:") && key !== "tinico:stage:roadmap")
      .flatMap(([, deals]) => Array.isArray(deals) ? deals : [])
      .find((deal) => !dealIdsBeforeDeleteTest.has(deal.id)),
    "new deal persistence"
  );
  input(dom.window, document.querySelector('#deal-drawer-body [data-f="title"]'), "즉시 삭제 영업 건");
  document.querySelector("#deal-drawer-body [data-delete]").click();
  await waitFor(
    () => ![...api.records.entries()]
      .filter(([key]) => key.startsWith("tinico:stage:") && key !== "tinico:stage:roadmap")
      .some(([, deals]) => Array.isArray(deals) && deals.some((deal) => deal.id === deletingDeal.id)),
    "deal deletion with an unsaved draft"
  );
  await new Promise((resolve) => setTimeout(resolve, 550));

  document.getElementById("calendar-add").click();
  input(dom.window, document.getElementById("calendar-event-title"), "기능 테스트 일정");
  document.getElementById("calendar-event-save").click();
  await waitFor(
    () => (api.records.get("tinico:calendar:events") || []).some((event) => event.title === "기능 테스트 일정"),
    "calendar creation"
  );

  const eventButton = await waitFor(
    () => [...document.querySelectorAll(".tn-calendar-event.manual")].find((button) => button.textContent.includes("기능 테스트 일정")),
    "rendered calendar event"
  );
  eventButton.click();
  input(dom.window, document.getElementById("calendar-event-title"), "수정된 기능 테스트 일정");
  document.getElementById("calendar-event-save").click();
  await waitFor(
    () => (api.records.get("tinico:calendar:events") || []).some((event) => event.title === "수정된 기능 테스트 일정"),
    "calendar update"
  );

  /* 화면 조작 결과가 메모리 상태에 반영됐는지 확인 (최상위 let 바인딩은 window에 붙지 않아 eval로 읽는다) */
  const state = dom.window.eval(
    "JSON.stringify({contactsData: stripContactImages(contactsData), stageData, calendarEntries})"
  );
  const snapshot = JSON.parse(state);
  assert.ok(snapshot.contactsData.some((contact) => contact.name === "테스트 담당자"));
  assert.ok(Object.values(snapshot.stageData).flat().some((deal) => deal.title === "명시적 저장 검증 영업 건"));
  assert.ok(snapshot.calendarEntries.some((event) => event.title === "수정된 기능 테스트 일정"));

  const updatedButton = await waitFor(
    () => [...document.querySelectorAll(".tn-calendar-event.manual")].find((button) => button.textContent.includes("수정된 기능 테스트 일정")),
    "updated calendar event"
  );
  updatedButton.click();
  input(dom.window, document.getElementById("calendar-event-title"), "저장 실패 시도");
  api.failNextPut("tinico:calendar:events");
  document.getElementById("calendar-event-save").click();
  await waitFor(() => !document.getElementById("calendar-event-save").disabled, "calendar save button recovery");
  assert.equal(document.getElementById("calendar-event-overlay").hidden, false);
  assert.equal(
    (api.records.get("tinico:calendar:events") || [])[0].title,
    "수정된 기능 테스트 일정",
    "a failed CRM save must not replace the last persisted calendar value"
  );
  assert.match(lastNotice(document), /저장하지 못했습니다/);

  document.getElementById("calendar-event-save").click();
  await waitFor(
    () => (api.records.get("tinico:calendar:events") || []).some((event) => event.title === "저장 실패 시도"),
    "calendar retry"
  );

  const retryButton = await waitFor(
    () => [...document.querySelectorAll(".tn-calendar-event.manual")].find((button) => button.textContent.includes("저장 실패 시도")),
    "retried calendar event"
  );
  retryButton.click();
  dom.window.eval('googleCalendarAccessToken="google-test-token";googleCalendarTokenExpiresAt=Date.now()+3600000;updateGoogleCalendarUi();');
  input(dom.window, document.getElementById("calendar-event-title"), "Google 연동 일정");
  document.getElementById("calendar-event-save").click();
  await waitFor(() => api.googleRequests.some((request) => request.method === "POST"), "Google Calendar creation");
  await waitFor(
    () => (api.records.get("tinico:calendar:events") || []).some((event) => event.googleEventId === "google-event-1"),
    "Google event ID persistence"
  );
  const googleCreate = api.googleRequests.find((request) => request.method === "POST");
  assert.equal(googleCreate.authorization, "Bearer google-test-token");
  assert.equal(googleCreate.body.summary, "Google 연동 일정");

  const googleEventButton = await waitFor(
    () => [...document.querySelectorAll(".tn-calendar-event.manual")].find((button) => button.textContent.includes("Google 연동 일정")),
    "Google-linked calendar event"
  );
  googleEventButton.click();
  input(dom.window, document.getElementById("calendar-event-title"), "Google 수정 일정");
  const googleRequestCountBeforeCrmEdit = api.googleRequests.length;
  document.getElementById("calendar-event-save").click();
  await waitFor(
    () => (api.records.get("tinico:calendar:events") || []).some((event) => event.title === "Google 수정 일정"),
    "CRM-only update for a Google-linked event"
  );
  assert.equal(api.googleRequests.length, googleRequestCountBeforeCrmEdit, "an already-sent event must not call Google again");
  assert.equal(api.googleRequests.some((request) => request.method === "PATCH"), false);

  const googleUpdatedButton = await waitFor(
    () => [...document.querySelectorAll(".tn-calendar-event.manual")].find((button) => button.textContent.includes("Google 수정 일정")),
    "updated Google-linked event"
  );
  googleUpdatedButton.click();
  const googleRequestCountBeforeCrmDelete = api.googleRequests.length;
  document.getElementById("calendar-event-delete").click();
  await waitFor(() => (api.records.get("tinico:calendar:events") || []).length === 0, "calendar deletion");
  assert.equal(api.googleRequests.length, googleRequestCountBeforeCrmDelete, "CRM deletion must preserve the Google original");
  assert.equal(api.googleRequests.some((request) => request.method === "DELETE"), false);

  document.getElementById("google-calendar-refresh").click();
  await waitFor(() => api.googleRequests.some((request) => request.method === "GET"), "Google selected-month import");
  await waitFor(
    () => [...document.querySelectorAll(".tn-calendar-event.google")].some((button) => button.textContent.includes("Google에서 불러온 일정")),
    "rendered Google imported event"
  );
  const googleGetCountAfterImport = api.googleRequests.filter((request) => request.method === "GET").length;
  await dom.window.eval("loadGoogleCalendarEvents(false,false)");
  assert.equal(api.googleRequests.filter((request) => request.method === "GET").length, googleGetCountAfterImport, "same-month results must be cached");
  document.getElementById("google-calendar-refresh").click();
  await waitFor(
    () => api.googleRequests.filter((request) => request.method === "GET").length === googleGetCountAfterImport + 1,
    "manual Google refresh"
  );

  const rotatedAccessKey = "rotated-browser-test-key-1234567890";
  api.setExpectedAccessKey(rotatedAccessKey);
  document.getElementById("cloud-db-button").click();
  const cloudForm = document.getElementById("cloud-login-form");
  cloudForm.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => document.getElementById("cloud-db-state").textContent === "확인 필요", "rejected stale access key");
  assert.equal(dom.window.localStorage.getItem("tinico:cloud:access-key"), null);
  assert.equal(document.getElementById("cloud-login-cancel").hidden, true);

  document.getElementById("cloud-access-key").value = rotatedAccessKey;
  cloudForm.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => document.getElementById("cloud-db-state").textContent === "연결됨", "rotated access key connection");
  assert.equal(dom.window.localStorage.getItem("tinico:cloud:access-key"), rotatedAccessKey);

  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("every static button is referenced by logic and every direct listener target exists", async () => {
  const html = await readFile(htmlPath, "utf8");
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const parsed = new JSDOM(html);
  const { document } = parsed.window;
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate element IDs can bind a button to the wrong target");

  /* 앱 로직이 외부 app.js로 분리되었으므로 그 내용까지 합쳐 검사 */
  const script = [...document.scripts].map((element) => element.textContent || "").join("\n") + "\n" + appJs;
  assert.equal(/tiniko:/.test(script), false, "all persisted keys must use the server-approved tinico: namespace");
  const unreferenced = [...document.querySelectorAll("button[id]")].filter((button) => {
    if (script.includes(`\"${button.id}\"`) || script.includes(`'${button.id}'`)) return false;
    const formId = button.closest("form")?.id;
    return !formId || (!script.includes(`\"${formId}\"`) && !script.includes(`'${formId}'`));
  }).map((button) => button.id);
  assert.deepEqual(unreferenced, [], "static buttons without matching UI logic");

  const listenerTargetPattern = /document\.getElementById\((['\"])([^'\"]+)\1\)\.addEventListener/g;
  const missingTargets = [];
  for (const match of script.matchAll(listenerTargetPattern)) {
    if (!document.getElementById(match[2])) missingTargets.push(match[2]);
  }
  assert.deepEqual(missingTargets, [], "a removed button must not leave an initialization-breaking listener");
  parsed.window.close();
});

test("every static button receives an active runtime event binding", async (t) => {
  const { dom, runtimeErrors, listenerBindings } = await createBrowser();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const bound = new Set(listenerBindings.map(({ id, type }) => `${id}:${type}`));
  const missing = [...document.querySelectorAll("button[id]")].filter((button) => {
    if (bound.has(`${button.id}:click`)) return false;
    const form = button.closest("form[id]");
    return !form || !bound.has(`${form.id}:submit`);
  }).map((button) => button.id);
  assert.deepEqual(missing, [], "buttons rendered without a click or form-submit handler");
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("navigation, guidance, calendar, Google, AI, upload, and recovery controls work", async (t) => {
  const { dom, api, runtimeErrors, alerts, openedUrls } = await createBrowser({}, (window) => {
    const oauth2 = {
      initTokenClient(config) {
        const client = {
          ...config,
          requestAccessToken() {
            window.queueMicrotask(() => client.callback({ access_token: "google-ui-control-token", expires_in: 3600 }));
          }
        };
        return client;
      },
      revoke(_token, callback) { callback?.(); }
    };
    window.google = { accounts: { oauth2 } };
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;

  for (const key of ["pipeline", "contacts", "roadmap", "calendar", "settings", "home"]) {
    document.querySelector(`#tn-tabs [data-key="${key}"]`).click();
    assert.equal(document.getElementById(`view-${key}`).classList.contains("active"), true, `${key} desktop navigation`);
  }
  document.querySelector('#tn-bottombar [data-key="contacts"]').click();
  assert.equal(document.getElementById("view-contacts").classList.contains("active"), true, "mobile navigation");
  document.getElementById("tn-home-logo").click();
  assert.equal(document.getElementById("view-home").classList.contains("active"), true);

  const todayCollapse = document.getElementById("tn-today-collapse");
  todayCollapse.click();
  assert.equal(todayCollapse.getAttribute("aria-expanded"), "false");
  todayCollapse.click();
  assert.equal(todayCollapse.getAttribute("aria-expanded"), "true");
  const groupsCollapse = document.getElementById("tn-groups-collapse");
  groupsCollapse.click();
  groupsCollapse.click();
  assert.equal(groupsCollapse.getAttribute("aria-expanded"), "true");

  const layout = document.getElementById("tn-dashboard-layout");
  const visibleItems = [...layout.querySelectorAll(":scope > [data-dashboard-item]")].filter((element) => !element.hidden);
  if (visibleItems.length > 1) {
    const firstKey = visibleItems[0].dataset.dashboardItem;
    visibleItems[0].querySelector(".tn-dashboard-drag-handle").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await waitFor(() => (api.records.get("tinico:app:settings")?.dashboardOrder || [])[1] === firstKey, "keyboard dashboard reordering");
  }

  document.getElementById("top-help-btn").click();
  assert.equal(document.getElementById("onboarding-overlay").hidden, false);
  document.getElementById("onboarding-close").click();
  await waitFor(() => document.getElementById("onboarding-overlay").hidden, "onboarding close");

  document.querySelector('#tn-tabs [data-key="pipeline"]').click();
  document.getElementById("pipe-view-table").click();
  assert.equal(document.getElementById("pipe-table-wrap").hidden, false);
  assert.equal(document.getElementById("tn-kanban").hidden, true);
  document.getElementById("pipe-view-board").click();
  assert.equal(document.getElementById("tn-kanban").hidden, false);
  document.getElementById("importance-config-btn").click();
  assert.equal(document.getElementById("importance-modal-overlay").hidden, false);
  document.getElementById("importance-reset").click();
  document.getElementById("importance-save").click();
  await waitFor(() => api.records.has("tinico:importance:config"), "importance settings save");
  document.getElementById("importance-config-btn").click();
  document.getElementById("importance-cancel").click();
  assert.equal(document.getElementById("importance-modal-overlay").hidden, true);

  document.querySelector('#tn-tabs [data-key="calendar"]').click();
  const googlePanel=document.getElementById("google-calendar-panel"),googleDetails=document.getElementById("google-calendar-connect-details"),googleToggle=document.getElementById("google-calendar-toggle");
  assert.equal(googleDetails.hidden,false);
  googleToggle.click();
  assert.equal(googleDetails.hidden,true);
  assert.equal(googlePanel.classList.contains("is-collapsed"),true);
  assert.equal(googleToggle.getAttribute("aria-expanded"),"false");
  assert.equal(googleToggle.textContent,"펼치기");
  await waitFor(()=>api.records.get("tinico:app:settings")?.googleCalendar?.collapsed===true,"Google panel collapsed state save");
  googleToggle.click();
  assert.equal(googleDetails.hidden,false);
  assert.equal(googleToggle.getAttribute("aria-expanded"),"true");
  assert.equal(googleToggle.textContent,"접기");
  await waitFor(()=>api.records.get("tinico:app:settings")?.googleCalendar?.collapsed===false,"Google panel expanded state save");
  const originalMonth = document.getElementById("calendar-month-label").textContent;
  document.getElementById("calendar-prev").click();
  assert.notEqual(document.getElementById("calendar-month-label").textContent, originalMonth);
  document.getElementById("calendar-next").click();
  assert.equal(document.getElementById("calendar-month-label").textContent, originalMonth);
  document.querySelector(".tn-calendar-day-add").click();
  assert.equal(document.getElementById("calendar-event-overlay").hidden, false);
  document.getElementById("calendar-event-cancel").click();
  assert.equal(document.getElementById("calendar-event-overlay").hidden, true);

  document.getElementById("google-calendar-client-help").click();
  assert.equal(document.getElementById("google-calendar-help-overlay").hidden, false);
  document.getElementById("google-calendar-copy-origin").click();
  await waitFor(() => document.getElementById("google-calendar-copy-origin").textContent === "복사됨", "OAuth origin copy");
  document.getElementById("google-calendar-open-console").click();
  document.getElementById("google-calendar-open-docs").click();
  document.getElementById("google-calendar-open-quota").click();
  assert.ok(openedUrls.some((url) => url.includes("console.cloud.google.com/apis/credentials")));
  assert.ok(openedUrls.some((url) => url.includes("calendar/api/quickstart/js")));
  assert.ok(openedUrls.some((url) => url.includes("calendar/api/guides/quota")));
  document.getElementById("google-calendar-help-close").click();
  assert.equal(document.getElementById("google-calendar-help-overlay").hidden, true);

  input(dom.window, document.getElementById("google-calendar-client-id"), "invalid-client-id");
  document.getElementById("google-calendar-save-client").click();
  assert.match(document.getElementById("google-calendar-sync-result").textContent, /형식/);
  input(dom.window, document.getElementById("google-calendar-client-id"), "ui-test.apps.googleusercontent.com");
  document.getElementById("google-calendar-save-client").click();
  await waitFor(() => api.records.get("tinico:app:settings")?.googleCalendar?.clientId === "ui-test.apps.googleusercontent.com", "Google client ID save");
  document.getElementById("google-calendar-connect").click();
  await waitFor(() => document.getElementById("google-calendar-status").textContent === "Google Calendar 연결됨", "Google connection");
  await waitFor(() => api.googleRequests.some((request) => request.method === "GET"), "Google month import after connection");
  document.getElementById("google-calendar-disconnect").click();
  assert.equal(document.getElementById("google-calendar-status").textContent, "연결 안 됨");
  assert.equal(document.getElementById("google-calendar-refresh").disabled, true);

  let contactUploadClicks = 0;
  let csvUploadClicks = 0;
  let restoreClicks = 0;
  document.getElementById("contact-file-input").addEventListener("click", () => { contactUploadClicks += 1; });
  document.getElementById("contact-csv-input").addEventListener("click", () => { csvUploadClicks += 1; });
  document.getElementById("settings-backup-input").addEventListener("click", () => { restoreClicks += 1; });
  document.getElementById("contact-upload-btn").click();
  document.getElementById("contact-csv-upload-btn").click();
  document.getElementById("settings-backup-import").click();
  assert.equal(contactUploadClicks, 1);
  assert.equal(csvUploadClicks, 1);
  assert.equal(restoreClicks, 1);
  document.getElementById("contact-export-btn").click();
  assert.match(lastNotice(document), /내보낼 연락처/);

  document.getElementById("ai-fab").click();
  assert.equal(document.getElementById("ai-chat").hidden, false);
  document.getElementById("ai-help-open").click();
  assert.equal(document.getElementById("ai-help-overlay").hidden, false);
  document.getElementById("ai-help-close").click();
  document.getElementById("ai-persona-manage").click();
  assert.equal(document.getElementById("ai-persona-overlay").hidden, false);
  document.getElementById("ai-persona-close").click();
  document.getElementById("ai-persona-manage").click();
  input(dom.window, document.getElementById("ai-p-name"), "기능 검증 AI");
  input(dom.window, document.getElementById("ai-p-desc"), "버튼과 데이터를 점검합니다.");
  document.getElementById("ai-persona-add").click();
  await waitFor(() => (api.records.get("tinico:ai:personas") || []).some((persona) => persona.name === "기능 검증 AI"), "AI persona creation");
  input(dom.window, document.getElementById("ai-input"), "파이프라인 현황");
  document.getElementById("ai-send").click();
  await waitFor(() => [...document.querySelectorAll(".tn-ai-msg.me")].some((message) => message.textContent.includes("파이프라인 현황")), "AI send button");
  document.getElementById("ai-chat-clear").click();
  document.getElementById("ai-chat-close").click();
  assert.equal(document.getElementById("ai-chat").hidden, true);

  document.getElementById("cloud-db-button").click();
  assert.equal(document.getElementById("cloud-gate").hidden, false);
  assert.equal(document.getElementById("cloud-login-cancel").hidden, false);
  document.getElementById("cloud-login-cancel").click();
  assert.equal(document.getElementById("cloud-gate").hidden, true);
  dom.window.showInitializationFailure(new dom.window.TypeError("listener target missing"));
  assert.equal(document.getElementById("cloud-login-form").hidden, true);
  assert.equal(document.getElementById("cloud-recovery-actions").hidden, false);
  assert.match(document.getElementById("cloud-recovery-code").textContent, /UI-BIND/);
  document.getElementById("cloud-db-button").click();
  assert.equal(document.getElementById("cloud-login-form").hidden, false, "DB button restores the normal connection form");
  document.getElementById("cloud-login-cancel").click();

  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("contact, pipeline activity, and support-task CRUD buttons persist and recover data", async (t) => {
  const { dom, api, runtimeErrors, downloads } = await createBrowser();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const storedDeals = () => [...api.records.entries()]
    .filter(([key]) => key.startsWith("tinico:stage:") && key !== "tinico:stage:roadmap")
    .flatMap(([, deals]) => Array.isArray(deals) ? deals : []);

  document.getElementById("contact-manual-btn").click();
  await waitFor(() => !document.getElementById("contact-drawer").hidden, "contact create drawer");
  input(dom.window, document.querySelector('#contact-drawer-body [data-field="name"]'), "CRUD 검증 담당자");
  input(dom.window, document.querySelector('#contact-drawer-body [data-field="company"]'), "티니코 테스트");
  input(dom.window, document.querySelector('#contact-drawer-body [data-field="email"]'), "crud@example.com");
  await saveEditor(dom.window,"contact");
  await waitFor(() => (api.records.get("tinico:contacts") || []).some((contact) => contact.email === "crud@example.com"), "contact create and update");
  document.querySelector("#contact-drawer-body [data-fav]").click();
  await saveEditor(dom.window,"contact");
  await waitFor(() => api.records.get("tinico:contacts")?.[0]?.fav === true, "contact favorite update");
  document.getElementById("contact-export-btn").click();
  await waitFor(() => downloads.some((download) => /^remember_outlook_contacts_.*\.csv$/.test(download.filename)), "contact CSV export");
  document.getElementById("contact-drawer-close").click();

  document.querySelector("#contact-tbody [data-check]").click();
  assert.equal(document.getElementById("contact-bulk-delete-btn").disabled, false);
  document.getElementById("contact-bulk-delete-btn").click();
  await waitFor(() => (api.records.get("tinico:contacts") || []).length === 0, "contact bulk delete");
  assert.equal(document.getElementById("tn-undo-toast").hidden, false);
  document.getElementById("tn-undo-btn").click();
  await waitFor(() => (api.records.get("tinico:contacts") || []).some((contact) => contact.email === "crud@example.com"), "contact undo restore");

  document.getElementById("pipe-new-deal").click();
  await waitFor(() => !document.getElementById("deal-drawer").hidden, "pipeline create drawer");
  input(dom.window, document.querySelector('#deal-drawer-body [data-f="title"]'), "CRUD 검증 영업 건");
  input(dom.window, document.querySelector('#deal-drawer-body [data-f="internalOwner"]'), "검증 담당");
  assert.equal(document.querySelectorAll('#deal-drawer-body [data-f="contactPhone"]').length,1,"customer contact phone must have one visible storage field");
  input(dom.window, document.querySelector('#deal-drawer-body [data-f="contactName"]'), "고객 직접 담당자");
  input(dom.window, document.querySelector('#deal-drawer-body [data-f="contactPhone"]'), "010-9876-5432");
  await saveEditor(dom.window,"deal");
  await waitFor(() => storedDeals().some((deal) => deal.title === "CRUD 검증 영업 건" && deal.internalOwner === "검증 담당" && deal.contactName === "고객 직접 담당자" && deal.contactPhone === "010-9876-5432"), "pipeline create, owner, and direct customer phone update");

  document.querySelector("#deal-drawer-body [data-add-activity]").click();
  const activityOverlay=document.getElementById("activity-overlay"),dealDrawer=document.getElementById("deal-drawer");
  assert.equal(activityOverlay.hidden, false);
  assert.equal(activityOverlay.dataset.keepDrawerOpen,"true");
  assert.equal(dealDrawer.hidden,false,"deal detail must remain open behind the activity modal");
  assert.ok(Number(dom.window.getComputedStyle(activityOverlay).zIndex)>Number(dom.window.getComputedStyle(dealDrawer).zIndex),"activity modal must be active above the deal detail drawer");
  document.getElementById("activity-cancel").click();
  assert.equal(activityOverlay.hidden,true);
  assert.equal(dealDrawer.hidden,false,"cancelling activity must preserve the deal detail drawer");
  document.querySelector("#deal-drawer-body [data-add-activity]").click();
  input(dom.window, document.getElementById("activity-content"), "고객에게 기능 검증 연락");
  input(dom.window, document.getElementById("activity-result"), "정상 응답 확인");
  document.getElementById("activity-save").click();
  await waitFor(() => storedDeals().some((deal) => (deal.activities || []).some((activity) => activity.content === "고객에게 기능 검증 연락")), "activity create");
  assert.equal(dealDrawer.hidden,false,"saving activity must return to the same deal detail drawer");
  document.querySelector("#deal-drawer-body [data-del-activity]").click();
  await waitFor(() => storedDeals().some((deal) => deal.title === "CRUD 검증 영업 건" && (deal.activities || []).length === 0), "activity delete");

  document.querySelector("#deal-drawer-body [data-add-support-task]").click();
  assert.equal(document.getElementById("roadmap-modal-overlay").hidden, false);
  input(dom.window, document.getElementById("roadmap-modal-name"), "연결 지원 업무 검증");
  input(dom.window, document.getElementById("roadmap-modal-purpose"), "영업 지원 버튼과 저장 로직을 확인합니다.");
  input(dom.window, document.getElementById("roadmap-modal-deliverable"), "검증 결과 기록 완료");
  document.getElementById("roadmap-modal-save").click();
  await waitFor(() => (api.records.get("tinico:stage:roadmap") || []).some((task) => task.title === "연결 지원 업무 검증"), "support task creation");
  document.getElementById("deal-drawer-close").click();

  document.querySelector('#tn-tabs [data-key="roadmap"]').click();
  const createdTask = (api.records.get("tinico:stage:roadmap") || []).find((task) => task.title === "연결 지원 업무 검증");
  document.querySelector(`[data-task-edit="${createdTask.id}"]`).click();
  input(dom.window, document.getElementById("roadmap-modal-name"), "수정된 연결 지원 업무");
  document.getElementById("roadmap-modal-save").click();
  await waitFor(() => (api.records.get("tinico:stage:roadmap") || []).some((task) => task.title === "수정된 연결 지원 업무"), "support task update");

  const statusSelect = document.querySelector(`[data-task-status="${createdTask.id}"]`);
  statusSelect.value = "완료";
  statusSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await waitFor(() => (api.records.get("tinico:stage:roadmap") || []).find((task) => task.id === createdTask.id)?.status === "완료", "support task quick status");
  document.querySelector(`[data-task-edit="${createdTask.id}"]`).click();
  document.getElementById("roadmap-modal-delete").click();
  await waitFor(() => !(api.records.get("tinico:stage:roadmap") || []).some((task) => task.id === createdTask.id), "support task delete");
  document.getElementById("tn-undo-btn").click();
  await waitFor(() => (api.records.get("tinico:stage:roadmap") || []).some((task) => task.id === createdTask.id), "support task undo restore");
  document.getElementById("roadmap-open-pipeline").click();
  assert.equal(document.getElementById("view-pipeline").classList.contains("active"), true);

  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("manual, stage, classification, group, mode, and trash controls complete CRUD flows", async (t) => {
  const { dom, api, runtimeErrors, alerts } = await createBrowser();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  document.querySelector('#tn-tabs [data-key="settings"]').click();

  const originalBeginnerMode = api.records.get("tinico:app:settings")?.beginnerMode;
  document.getElementById("settings-beginner-toggle").click();
  await waitFor(() => api.records.get("tinico:app:settings")?.beginnerMode === !originalBeginnerMode, "beginner mode toggle");
  document.getElementById("settings-beginner-toggle").click();
  await waitFor(() => api.records.get("tinico:app:settings")?.beginnerMode === originalBeginnerMode, "beginner mode restore");
  document.getElementById("settings-onboarding-open").click();
  assert.equal(document.getElementById("onboarding-overlay").hidden, false);
  document.getElementById("onboarding-close").click();
  await waitFor(() => document.getElementById("onboarding-overlay").hidden, "settings onboarding close");
  document.getElementById("settings-admin-open").click();
  document.getElementById("settings-admin-cancel").click();
  assert.equal(document.getElementById("settings-admin-overlay").hidden, true);

  document.getElementById("settings-mode-manual").click();
  assert.equal(document.getElementById("settings-manual-panel").hidden, false);
  document.getElementById("manual-add-btn").click();
  document.getElementById("manual-modal-save").click();
  assert.match(lastNotice(document), /매뉴얼 제목/);
  input(dom.window, document.getElementById("manual-modal-category"), "기능 검증");
  input(dom.window, document.getElementById("manual-modal-name"), "CRUD 버튼 검증 매뉴얼");
  input(dom.window, document.getElementById("manual-modal-content"), "추가 버튼 확인\n수정 버튼 확인\n삭제 버튼 확인");
  document.getElementById("manual-modal-save").click();
  const manualKey = "tinico:manual:sections";
  const createdManual = await waitFor(() => (api.records.get(manualKey) || []).find((section) => section.title === "CRUD 버튼 검증 매뉴얼"), "manual create");
  document.querySelector(`[data-manual-edit="${createdManual.id}"]`).click();
  input(dom.window, document.getElementById("manual-modal-name"), "수정된 CRUD 버튼 매뉴얼");
  document.getElementById("manual-modal-save").click();
  await waitFor(() => (api.records.get(manualKey) || []).some((section) => section.title === "수정된 CRUD 버튼 매뉴얼"), "manual update");
  const indexBeforeMove = (api.records.get(manualKey) || []).findIndex((section) => section.id === createdManual.id);
  document.querySelector(`[data-manual-up="${createdManual.id}"]`).click();
  await waitFor(() => (api.records.get(manualKey) || []).findIndex((section) => section.id === createdManual.id) === indexBeforeMove - 1, "manual reorder up");
  document.querySelector(`[data-manual-edit="${createdManual.id}"]`).click();
  document.getElementById("manual-modal-delete").click();
  await waitFor(() => !(api.records.get(manualKey) || []).some((section) => section.id === createdManual.id), "manual delete");
  document.getElementById("manual-reset-btn").click();
  await waitFor(() => (api.records.get(manualKey) || []).some((section) => section.id === "manual_troubleshooting"), "manual reset");

  document.getElementById("settings-mode-config").click();
  assert.equal(document.getElementById("settings-config-panel").hidden, false);
  document.getElementById("settings-stage-add").click();
  input(dom.window, document.getElementById("stage-modal-name"), "검증단계");
  document.getElementById("stage-modal-save").click();
  const stageKey = "tinico:settings:stages";
  await waitFor(() => (api.records.get(stageKey) || []).some((stage) => stage.label === "검증단계"), "stage create");
  document.querySelector('[data-edit-stage="검증단계"]').click();
  input(dom.window, document.getElementById("stage-modal-name"), "수정검증단계");
  document.getElementById("stage-modal-save").click();
  await waitFor(() => (api.records.get(stageKey) || []).some((stage) => stage.label === "수정검증단계"), "stage update");
  document.querySelector('[data-delete-stage="수정검증단계"]').click();
  await waitFor(() => !(api.records.get(stageKey) || []).some((stage) => stage.label === "수정검증단계"), "stage delete");

  document.getElementById("settings-bucket-add").click();
  input(dom.window, document.getElementById("bucket-modal-label"), "검증 분류");
  input(dom.window, document.getElementById("bucket-modal-desc"), "분류 버튼 검증");
  input(dom.window, document.getElementById("bucket-modal-weight"), "0.8");
  document.getElementById("bucket-modal-save").click();
  const bucketKey = "tinico:settings:buckets";
  const createdBucket = await waitFor(() => (api.records.get(bucketKey) || []).find((bucket) => bucket.label === "검증 분류"), "classification create");
  document.querySelector(`[data-edit-bucket="${createdBucket.key}"]`).click();
  input(dom.window, document.getElementById("bucket-modal-label"), "수정 검증 분류");
  document.getElementById("bucket-modal-save").click();
  await waitFor(() => (api.records.get(bucketKey) || []).some((bucket) => bucket.key === createdBucket.key && bucket.label === "수정 검증 분류"), "classification update");
  document.querySelector(`[data-delete-bucket="${createdBucket.key}"]`).click();
  await waitFor(() => !(api.records.get(bucketKey) || []).some((bucket) => bucket.key === createdBucket.key), "classification delete");

  document.getElementById("settings-group-add").click();
  input(dom.window, document.getElementById("area-modal-title-input"), "CRUD 검증 그룹");
  input(dom.window, document.getElementById("area-modal-subtitle"), "그룹 추가·수정·삭제 확인");
  document.getElementById("area-modal-save").click();
  const areaKey = "tinico:areas";
  const createdArea = await waitFor(() => (api.records.get(areaKey) || []).find((area) => area.title === "CRUD 검증 그룹"), "group create");
  document.querySelector(`[data-edit-group="${createdArea.key}"]`).click();
  input(dom.window, document.getElementById("area-modal-title-input"), "수정된 CRUD 검증 그룹");
  document.getElementById("area-modal-save").click();
  await waitFor(() => (api.records.get(areaKey) || []).some((area) => area.key === createdArea.key && area.title === "수정된 CRUD 검증 그룹"), "group update");
  document.querySelector(`[data-delete-group="${createdArea.key}"]`).click();
  await waitFor(() => !(api.records.get(areaKey) || []).some((area) => area.key === createdArea.key), "group delete");
  assert.ok((api.records.get("tinico:trash") || []).some((entry) => entry.type === "group"));
  document.getElementById("settings-trash-empty").click();
  await waitFor(() => (api.records.get("tinico:trash") || []).length === 0, "trash empty");

  document.getElementById("settings-clear-seed").click();
  assert.match(lastNotice(document), /정리할 기본 예시 항목|기본 예시 영업 항목/);
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("camera permission is reused, quality warnings appear, and capture is immediate", async (t) => {
  const camera = { requests: 0, stops: 0, confirms: 0, constraints: [] };
  const track = {
    enabled: true,
    readyState: "live",
    stop() { camera.stops += 1; this.readyState = "ended"; },
    getCapabilities() { return { focusMode: ["continuous"], exposureMode: ["continuous"], whiteBalanceMode: ["continuous"], torch: false }; },
    async applyConstraints(value) { camera.constraints.push(value); },
    addEventListener() {}
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const { dom, api, runtimeErrors, alerts } = await createBrowser({}, (window) => {
    Object.defineProperty(window.navigator, "mediaDevices", { configurable: true, value: {
      async getUserMedia() { camera.requests += 1; track.readyState = "live"; return stream; }
    } });
    Object.defineProperties(window.HTMLVideoElement.prototype, {
      videoWidth: { configurable: true, get: () => 1920 },
      videoHeight: { configurable: true, get: () => 1080 },
      readyState: { configurable: true, get: () => 4 }
    });
    window.HTMLMediaElement.prototype.play = async function play() {};
    window.HTMLMediaElement.prototype.pause = function pause() {};
    window.HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvas = this;
      return {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
        fillStyle: "#fff",
        fillRect() {},
        drawImage() {},
        createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
        putImageData() {},
        getImageData() {
          const data = new Uint8ClampedArray(Math.max(1, canvas.width * canvas.height * 4));
          for (let i = 0; i < data.length; i += 4) { data[i] = 22; data[i + 1] = 22; data[i + 2] = 22; data[i + 3] = 255; }
          return { data, width: canvas.width, height: canvas.height };
        }
      };
    };
    window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,dGVzdA==";
    window.confirm = () => { camera.confirms += 1; return true; };
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  dom.window.eval("applyOcrToContact=async()=>{}");
  const sessionRequestsBeforeCamera = api.allRequests.filter((request) => new URL(request.url).pathname === "/api/session").length;

  document.getElementById("contact-scan-btn").click();
  await waitFor(() => !document.getElementById("scan-modal-overlay").hidden && !document.getElementById("scan-capture").disabled, "camera opening");
  assert.equal(camera.requests, 1);
  assert.equal(document.getElementById("cloud-gate").hidden, true, "camera opening must never reopen the database gate");
  assert.equal(api.allRequests.filter((request) => new URL(request.url).pathname === "/api/session").length, sessionRequestsBeforeCamera, "camera opening must not re-run database authentication");
  await waitFor(() => !document.getElementById("scan-quality-popup").hidden, "low-light warning popup", 3_000);
  assert.match(document.getElementById("scan-quality-popup-title").textContent, /조명이 부족/);

  const capturePromise = dom.window.eval("captureScan()");
  assert.equal(document.getElementById("scan-modal-overlay").hidden, true, "capture closes the preview without waiting for OCR");
  assert.equal(camera.confirms, 0, "a quality warning must not delay capture with a confirm dialog");
  await capturePromise;
  assert.equal(alerts.length, 0);
  assert.equal(dom.window.eval("contactsData.length"), 0, "capture stays a draft until Save");
  assert.equal(document.getElementById("contact-drawer").hidden,false);
  assert.equal(track.enabled, false);
  assert.equal(camera.stops, 0, "closing the scanner keeps the session stream reusable");

  document.getElementById("contact-scan-btn").click();
  await waitFor(() => !document.getElementById("scan-modal-overlay").hidden && !document.getElementById("scan-capture").disabled, "reopened camera");
  assert.equal(camera.requests, 1, "reopening in the same page must not call getUserMedia again");
  document.getElementById("scan-cancel").click();
  assert.equal(track.enabled, false);
  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  assert.equal(camera.stops, 1, "leaving the page must release the retained camera track");
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("camera denial or unsupported media falls back without a global initialization error", async (t) => {
  const denied = await createBrowser({}, (window) => {
    Object.defineProperty(window.navigator, "mediaDevices", { configurable: true, value: {
      async getUserMedia() { throw new window.DOMException("Permission denied", "NotAllowedError"); }
    } });
    window.HTMLMediaElement.prototype.pause = function pause() {};
  });
  t.after(() => denied.dom.window.close());
  let deniedFallbackClicks = 0;
  denied.dom.window.document.getElementById("contact-camera-input").addEventListener("click", () => { deniedFallbackClicks += 1; });
  denied.dom.window.document.getElementById("contact-scan-btn").click();
  await waitFor(() => deniedFallbackClicks === 1, "permission-denied file capture fallback");
  assert.equal(denied.dom.window.document.getElementById("scan-modal-overlay").hidden, true);
  assert.equal(denied.dom.window.document.getElementById("cloud-gate").hidden, true);
  assert.deepEqual(denied.runtimeErrors.map((error) => error.message), []);

  const unsupported = await createBrowser({}, (window) => {
    Object.defineProperty(window.navigator, "mediaDevices", { configurable: true, value: undefined });
    window.HTMLMediaElement.prototype.pause = function pause() {};
  });
  t.after(() => unsupported.dom.window.close());
  let unsupportedFallbackClicks = 0;
  unsupported.dom.window.document.getElementById("contact-camera-input").addEventListener("click", () => { unsupportedFallbackClicks += 1; });
  unsupported.dom.window.document.getElementById("contact-scan-btn").click();
  assert.equal(unsupportedFallbackClicks, 1);
  assert.equal(unsupported.dom.window.document.getElementById("scan-modal-overlay").hidden, true);
  assert.equal(unsupported.dom.window.document.getElementById("cloud-gate").hidden, true);
  assert.deepEqual(unsupported.runtimeErrors.map((error) => error.message), []);
});

test("camera video readiness timeout releases the stream and opens the safe fallback", async (t) => {
  const camera = { stops: 0 };
  const track = {
    enabled: true,
    readyState: "live",
    stop() { camera.stops += 1; this.readyState = "ended"; },
    getCapabilities() { return {}; },
    async applyConstraints() {},
    addEventListener() {}
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const { dom, runtimeErrors } = await createBrowser({}, (window) => {
    Object.defineProperty(window.navigator, "mediaDevices", { configurable: true, value: {
      async getUserMedia() { track.readyState = "live"; return stream; }
    } });
    Object.defineProperties(window.HTMLVideoElement.prototype, {
      videoWidth: { configurable: true, get: () => 0 },
      videoHeight: { configurable: true, get: () => 0 }
    });
    window.HTMLMediaElement.prototype.play = async function play() {};
    window.HTMLMediaElement.prototype.pause = function pause() {};
  });
  t.after(() => dom.window.close());
  dom.window.eval('waitForScannerVideo=async()=>{throw new Error("camera readiness timeout")};');
  let fallbackClicks = 0;
  dom.window.document.getElementById("contact-camera-input").addEventListener("click", () => { fallbackClicks += 1; });
  dom.window.document.getElementById("contact-scan-btn").click();
  await waitFor(() => fallbackClicks === 1, "camera readiness fallback");
  assert.equal(camera.stops, 1);
  assert.equal(dom.window.document.getElementById("scan-modal-overlay").hidden, true);
  assert.equal(dom.window.document.getElementById("cloud-gate").hidden, true);
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("mobile OCR runs adaptive and region passes only when identity fields are missing", async (t) => {
  const { dom, runtimeErrors } = await createBrowser();
  t.after(() => dom.window.close());
  dom.window.eval(`
    window.__ocrCalls=[];
    prepareOcrVariants=async()=>({enhanced:"enhanced",adaptive:"adaptive",binary:"binary",upper:"upper",lower:"lower"});
    getOcrWorkerPool=async()=>[{
      setParameters:async()=>{},
      recognize:async(image)=>{
        window.__ocrCalls.push(image);
        const text={
          enhanced:"TINIKO",
          adaptive:"제품 솔루션",
          binary:"sales@example.com",
          upper:"홍길동\\n주식회사 티니코",
          lower:"Mobile 010-1234-5678"
        }[image]||"";
        return {data:{text,confidence:72}};
      }
    }];
  `);

  const result = await dom.window.ocrCardImage("data:image/jpeg;base64,dGVzdA==");
  assert.equal(result.passes, 5);
  assert.deepEqual([...dom.window.__ocrCalls], ["enhanced", "adaptive", "binary", "upper", "lower"]);
  assert.equal(result.parsed.name, "홍길동");
  assert.equal(result.parsed.email, "sales@example.com");
  assert.equal(result.parsed.mobilePhone, "010-1234-5678");
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("stored and restored values cannot break out of dynamic HTML attributes", async (t) => {
  const maliciousAreaKey = 'group\"><img id="xss-marker" src="x" onerror="window.__xss=1">';
  const maliciousId = 'item\"><img id="xss-marker-2" src="x" onerror="window.__xss=2">';
  const { dom, api, runtimeErrors } = await createBrowser({
    "tinico:settings:stages": [{
      key: '리드\" onmouseover="window.__xss=3',
      label: '리드\" onmouseover="window.__xss=3',
      color: '#fff\";background-image:url(https://example.com/leak)'
    }],
    "tinico:areas": [{
      key: maliciousAreaKey,
      title: '<img id="xss-marker-3" src="x" onerror="window.__xss=4">',
      subtitle: '안전성 검사',
      color: '#fff\";background-image:url(https://example.com/leak)',
      colorSoft: '#fff\";background-image:url(https://example.com/leak)',
      bucket: "future"
    }],
    ["tinico:stage:" + maliciousAreaKey]: [{
      id: "safe-deal-id",
      title: "속성 안전성 검사",
      stage: '리드\" onmouseover="window.__xss=3',
      activities: [{ id: maliciousId, type: "기타", date: "2026-08-03", content: "검사" }]
    }],
    "tinico:contacts": [{
      id: maliciousId,
      name: '<img id="xss-marker-4" src="x" onerror="window.__xss=5">',
      cardImage: 'x\" onerror="window.__xss=6"'
    }],
    "tinico:manual:sections": [{
      id: maliciousId,
      category: "검사",
      title: '<img id="xss-marker-5" src="x" onerror="window.__xss=7">',
      format: "list",
      content: '<img id="xss-marker-6" src="x" onerror="window.__xss=8">'
    }]
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;

  dom.window.openDealDrawer(maliciousAreaKey, "safe-deal-id");
  await waitFor(() => !document.getElementById("deal-drawer").hidden, "security test deal drawer");

  const migratedSections = api.records.get("tinico:manual:sections") || [];
  assert.ok(migratedSections.some((section) => section.id === maliciousId), "custom manual sections must be preserved");
  assert.ok(migratedSections.some((section) => section.id === "manual_troubleshooting"));

  assert.equal(dom.window.__xss, undefined);
  assert.equal(document.querySelector('[id^="xss-marker"]'), null);
  assert.equal(document.querySelector(".tn-card-mini")?.getAttribute("onerror"), null);
  assert.equal(document.querySelector('[style*="example.com"]'), null);
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("a repeat visit loads without re-uploading unchanged data", async (t) => {
  /* 첫 접속은 기본값을 저장한다. 그 결과를 그대로 둔 채 다시 접속하면
     정규화 결과가 저장본과 같으므로 저장(PUT) 왕복이 한 건도 없어야 한다. */
  const first = await createBrowser();
  t.after(() => first.dom.window.close());
  await waitFor(() => first.api.records.has("tinico:manual:sections"), "first boot seeding");
  assert.ok(first.api.allRequests.some((request) => request.method === "PUT"), "first boot stores defaults");

  const seeded = Object.fromEntries(first.api.records);
  const repeat = await createBrowser(seeded);
  t.after(() => repeat.dom.window.close());

  await new Promise((resolve) => setTimeout(resolve, 300));
  const writes = repeat.api.allRequests.filter((request) => request.method !== "GET");
  assert.deepEqual(writes, [], "a repeat visit must not write anything back");
  assert.deepEqual(repeat.runtimeErrors.map((error) => error.message), []);

  /* 매뉴얼 마이그레이션 진행 기록은 키 하나에 모아 두므로, 재접속에서는 그 키만 읽어야 한다 */
  const separateFlagReads = repeat.api.allRequests.filter((request) => request.url.includes("tinico%3Amanual%3Amigration%3A"));
  assert.deepEqual(separateFlagReads, [], "재접속 때 예전 방식의 표시 키를 다시 읽으면 안 된다");
  const consolidatedReads = repeat.api.allRequests.filter((request) => request.url.includes("tinico%3Amanual%3Amigrations"));
  assert.equal(consolidatedReads.length, 1, "모아 둔 진행 기록만 한 번 읽어야 한다");
});

const rememberCsvPath = new URL("./fixtures/remember_outlook_contacts.csv", import.meta.url);

async function importRememberCsv(dom) {
  const buffer = await readFile(rememberCsvPath);
  const file = new dom.window.File([buffer], "remember_outlook_contacts.csv", { type: "text/csv" });
  await dom.window.eval("importContactsCsv")(file);
}

test("navigation shows 대시보드 · 파이프라인 · 지원 업무 · 연락처 · 캘린더 · 설정 in order", async (t) => {
  const { dom } = await createBrowser();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const expected = ["home", "pipeline", "roadmap", "contacts", "calendar", "settings"];
  const expectedLabels = ["대시보드", "파이프라인", "지원 업무", "연락처", "캘린더", "설정"];

  assert.deepEqual([...document.querySelectorAll("#tn-tabs .tn-tab")].map((tab) => tab.dataset.key), expected);
  assert.deepEqual([...document.querySelectorAll("#tn-tabs .tn-tab")].map((tab) => tab.textContent), expectedLabels);
  /* 모바일 하단 메뉴도 같은 순서여야 한다 */
  assert.deepEqual([...document.querySelectorAll("#tn-bottombar .tn-btab")].map((tab) => tab.dataset.key), expected);

  /* 순서를 바꿔도 각 탭이 자기 화면을 여는지 확인 */
  for (const key of expected) {
    document.querySelector('#tn-tabs [data-key="' + key + '"]').click();
    assert.equal(document.getElementById("view-" + key).classList.contains("active"), true, key + " view");
  }
});

test("contact list pages 20 rows at a time and the size dropdown offers 20/30/40/50", async (t) => {
  const { dom, api, runtimeErrors } = await createBrowser();
  t.after(() => dom.window.close());
  const { document } = dom.window;
  await importRememberCsv(dom);
  await waitFor(() => dom.window.eval("contactsData.length") === 32, "CSV import");

  const rows = () => document.querySelectorAll("#contact-tbody .tn-contact-row").length;
  const pageButtons = () => [...document.querySelectorAll("#contact-page-numbers .tn-pager-btn")].map((b) => b.textContent);
  const activePage = () => document.querySelector("#contact-page-numbers .tn-pager-btn.active")?.textContent;

  assert.deepEqual([...document.querySelectorAll("#contact-page-size option")].map((o) => o.value), ["20", "30", "40", "50"]);
  assert.equal(document.getElementById("contact-page-size").value, "20", "기본 20줄");
  assert.equal(rows(), 20);
  assert.deepEqual(pageButtons(), ["1", "2"]);
  assert.equal(activePage(), "1");
  assert.match(document.getElementById("contact-page-range").textContent, /1–20 \/ 전체 32명/);
  assert.equal(document.getElementById("contact-page-first").disabled, true);
  assert.equal(document.getElementById("contact-page-prev").disabled, true);
  assert.equal(document.getElementById("contact-page-next").disabled, false);

  document.getElementById("contact-page-next").click();
  assert.equal(activePage(), "2");
  assert.equal(rows(), 12, "마지막 페이지는 남은 12건");
  assert.match(document.getElementById("contact-page-range").textContent, /21–32 \/ 전체 32명/);
  assert.equal(document.getElementById("contact-page-next").disabled, true);
  assert.equal(document.getElementById("contact-page-last").disabled, true);

  document.getElementById("contact-page-first").click();
  assert.equal(activePage(), "1");
  document.getElementById("contact-page-last").click();
  assert.equal(activePage(), "2");
  document.querySelector('#contact-page-numbers [data-page="1"]').click();
  assert.equal(activePage(), "1");

  /* "모두 선택"은 지금 보이는 페이지만 대상으로 한다 */
  document.getElementById("contact-select-all").click();
  assert.equal(dom.window.eval("selectedContactIds.size"), 20);
  document.getElementById("contact-select-all").click();
  assert.equal(dom.window.eval("selectedContactIds.size"), 0);

  /* 줄 수를 바꾸면 첫 페이지부터 다시 보여 주고 선택값은 외부 DB에 저장된다 */
  document.getElementById("contact-page-next").click();
  const sizeSelect = document.getElementById("contact-page-size");
  sizeSelect.value = "50";
  sizeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await waitFor(() => (api.records.get("tinico:app:settings") || {}).contactPageSize === 50, "page size persisted");
  assert.equal(rows(), 32);
  assert.deepEqual(pageButtons(), ["1"]);
  assert.equal(document.getElementById("contact-page-next").disabled, true);

  /* 검색하면 결과가 달라지므로 1페이지로 되돌아간다 */
  sizeSelect.value = "20";
  sizeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await waitFor(() => rows() === 20, "back to 20 rows");
  document.getElementById("contact-page-next").click();
  assert.equal(activePage(), "2");
  input(dom.window, document.getElementById("contact-search"), "가온테크");
  await waitFor(() => activePage() === "1", "search resets to first page");
  assert.ok(rows() > 0 && rows() < 20);

  /* 설정 > 매뉴얼의 연락처 안내에도 페이지 이동과 CSV 사용법이 들어가야 한다 */
  const contactManual = (api.records.get("tinico:manual:sections") || []).find((section) => section.id === "manual_contacts");
  assert.match(contactManual.content, /20줄씩/);
  assert.match(contactManual.content, /20·30·40·50줄/);
  assert.match(contactManual.content, /리멤버의 Outlook CSV와 같은 열 구성/);
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("Remember CSV uploads into the same fields and exports back in Remember's layout", async (t) => {
  const blobs = [];
  const { dom, runtimeErrors } = await createBrowser({}, (window) => {
    window.URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:csv-test"; };
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;

  await importRememberCsv(dom);
  await waitFor(() => dom.window.eval("contactsData.length") === 32, "CSV import");
  const contacts = JSON.parse(dom.window.eval("JSON.stringify(contactsData)"));
  const byName = (name) => contacts.find((contact) => contact.name === name);

  /* 리멤버가 채우는 열이 CRM의 같은 입력 칸으로 들어가는지 */
  const first = byName("이아름");
  assert.equal(first.company, "나래바이오");
  assert.equal(first.department, "영업팀");
  assert.equal(first.jobTitle, "과장");
  assert.equal(first.mobilePhone, "010-1037-2053");
  assert.equal(first.email, "user02@example.com");
  /* "2026년 07월 16일"도 등록일로 읽어 YYYY-MM-DD로 통일 */
  assert.equal(first.createdAt, "2026-07-16");
  /* 국가번호가 붙은 해외 번호는 그대로 보존 */
  assert.equal(byName("Taro Yamada").mobilePhone, "+81 80-1234-5678");
  /* 메일·전화가 없는 명함도 버리지 않는다 */
  assert.equal(byName("한이름").company, "이름만테크");
  assert.equal(byName("한이름").department, "총무팀");
  assert.equal(contacts.filter((contact) => !contact.name || !contact.company).length, 0);

  /* 같은 파일을 다시 올려도 중복이 생기지 않아야 한다 */
  await importRememberCsv(dom);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(dom.window.eval("contactsData.length"), 32, "re-upload must not duplicate");
  assert.match(document.getElementById("ocr-status").textContent, /신규 0명/);

  /* 내보낸 파일이 리멤버 export와 같은 열 구성인지 */
  document.getElementById("contact-export-btn").click();
  await waitFor(() => blobs.length > 0, "CSV export blob");
  const exported = (await blobs[0].text()).replace(/^﻿/, "");
  const exportedRows = exported.split("\r\n").filter((line) => line.trim());
  const fixture = (await readFile(rememberCsvPath, "utf8")).replace(/^﻿/, "");
  const fixtureRows = fixture.split(/\r?\n/).filter((line) => line.trim());

  assert.equal(exportedRows[0], fixtureRows[0], "header must match Remember's Outlook layout exactly");
  assert.equal(exportedRows.length - 1, 32);
  const headers = exportedRows[0].split(",");
  const cells = exportedRows.slice(1).map((line) => line.split(","));
  const column = (row, name) => row[headers.indexOf(name)];
  const exportedFirst = cells.find((row) => column(row, "First Name") === "이아름");
  assert.equal(column(exportedFirst, "Company"), "나래바이오");
  assert.equal(column(exportedFirst, "Department"), "영업팀");
  assert.equal(column(exportedFirst, "Job Title"), "과장");
  assert.equal(column(exportedFirst, "Mobile Phone"), "010-1037-2053");
  assert.equal(column(exportedFirst, "Primary Phone"), "010-1037-2053");
  assert.equal(column(exportedFirst, "E-mail Address"), "user02@example.com");
  assert.equal(column(exportedFirst, "E-mail Type"), "SMTP");
  assert.equal(column(exportedFirst, "E-mail Display Name"), "이아름");
  assert.equal(column(exportedFirst, "User 2"), "2026-07-16");
  /* 리멤버는 성/이름을 나누지 않고 First Name 한 칸만 쓴다 */
  assert.equal(column(exportedFirst, "Last Name"), "");
  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

const comboContacts = [
  { id: "ct-gaon", name: "김가온", company: "가온테크", department: "영업팀", jobTitle: "과장", mobilePhone: "010-1111-2222", email: "gaon@example.com", createdAt: "2026-07-16" },
  { id: "ct-narae", name: "김나래", company: "나래바이오", department: "연구소", jobTitle: "책임", mobilePhone: "010-3333-4444", email: "narae@example.com", createdAt: "2026-07-16" },
  { id: "ct-haneul", name: "이하늘", company: "하늘상사", department: "", jobTitle: "대표", mobilePhone: "010-5555-6666", email: "haneul@example.com", createdAt: "2026-07-16" }
];

test("customer contact combobox filters as you type, takes several people, and keeps free text", async (t) => {
  const { dom, api, runtimeErrors } = await createBrowser({ "tinico:contacts": comboContacts });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const storedDeals = () => [...api.records.entries()]
    .filter(([key]) => key.startsWith("tinico:stage:") && key !== "tinico:stage:roadmap")
    .flatMap(([, deals]) => Array.isArray(deals) ? deals : []);
  const deal = () => storedDeals().find((item) => item.title === "콤보 검증 영업 건");

  document.getElementById("pipe-new-deal").click();
  await waitFor(() => !document.getElementById("deal-drawer").hidden, "deal drawer");
  input(dom.window, document.querySelector('#deal-drawer-body [data-f="title"]'), "콤보 검증 영업 건");
  await saveEditor(dom.window,"deal");
  await waitFor(() => deal(), "deal created");

  /* 두 칸이던 담당자 입력이 하나로 합쳐졌는지 */
  assert.equal(document.querySelectorAll("#deal-drawer-body [data-contact-links]").length, 0, "the separate select must be gone");
  assert.equal(document.querySelectorAll("#deal-drawer-body [data-contact-combo]").length, 1);
  assert.equal(document.querySelector('#deal-drawer-body label[for="deal-contact-name"]').textContent, "고객 담당자 입력");

  const combo = document.querySelector("#deal-drawer-body [data-contact-combo]");
  const comboInput = combo.querySelector(".tn-combo-input");
  const comboList = combo.querySelector(".tn-combo-list");
  const linkedWrap = document.querySelector("#deal-drawer-body [data-linked-contacts]");
  const options = () => [...comboList.querySelectorAll(".tn-combo-option")].map((el) => el.querySelector("b").textContent);
  const picked = () => [...linkedWrap.querySelectorAll(".tn-linked-contact")].map((row) => ({
    name: row.querySelector(".tn-linked-contact-name").textContent.replace("대표", "").trim(),
    sub: row.querySelector(".tn-linked-contact-sub").textContent,
    phone: row.querySelector(".tn-linked-contact-phone").textContent,
    lead: !!row.querySelector(".tn-linked-contact-badge")
  }));
  const choose = (index) => comboList.querySelectorAll(".tn-combo-option")[index]
    .dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));

  /* 아직 아무도 고르지 않은 상태 */
  assert.match(linkedWrap.textContent, /선택한 담당자가 없습니다/);
  assert.equal(comboList.hidden, true);
  comboInput.focus();
  assert.equal(comboList.hidden, false);
  assert.equal(comboInput.getAttribute("aria-expanded"), "true");
  assert.deepEqual(options().sort(), ["김가온", "김나래", "이하늘"]);

  /* 입력한 글자와 일치하는 항목만 남는다 */
  input(dom.window, comboInput, "김");
  assert.deepEqual(options(), ["김가온", "김나래"]);
  input(dom.window, comboInput, "나래바이오");
  assert.deepEqual(options(), ["김나래"], "회사명으로도 찾을 수 있어야 한다");

  /* 첫 번째 담당자를 고르면 목록에 쌓이고 검색어 칸은 비워진다 */
  input(dom.window, comboInput, "가온");
  choose(0);
  assert.equal(comboInput.value, "", "고른 뒤에는 다음 사람을 이어서 찾을 수 있게 비워야 한다");
  assert.deepEqual(picked(), [{ name: "김가온", sub: "가온테크 · 영업팀 / 과장", phone: "010-1111-2222", lead: true }]);
  assert.equal(document.querySelector('#deal-drawer-body [data-f="contactPhone"]').value, "010-1111-2222");
  await saveEditor(dom.window,"deal");
  await waitFor(() => deal()?.contactName === "김가온", "first contact saved");
  assert.deepEqual(deal().linkedContactIds, ["ct-gaon"]);
  assert.equal(deal().contactRole, "영업팀 / 과장");
  assert.equal(deal().contactEmail, "gaon@example.com");

  /* 이미 고른 사람은 목록에서 빠지고, 두 번째 담당자를 이어서 고를 수 있다 */
  input(dom.window, comboInput, "김");
  assert.deepEqual(options(), ["김나래"], "이미 고른 김가온은 목록에서 빠져야 한다");
  choose(0);
  assert.deepEqual(picked(), [
    { name: "김가온", sub: "가온테크 · 영업팀 / 과장", phone: "010-1111-2222", lead: true },
    { name: "김나래", sub: "나래바이오 · 연구소 / 책임", phone: "010-3333-4444", lead: false }
  ]);
  await saveEditor(dom.window,"deal");
  await waitFor(() => deal()?.contactName === "김가온, 김나래", "both names saved");
  assert.deepEqual(deal().linkedContactIds, ["ct-gaon", "ct-narae"]);
  assert.equal(deal().contactPhone, "010-1111-2222", "대표 담당자의 연락처는 그대로 유지");

  /* 대표를 해제하면 다음 사람이 대표가 되고 연락처도 함께 옮겨진다 */
  linkedWrap.querySelector('[data-remove-contact="ct-gaon"]').click();
  assert.deepEqual(picked(), [{ name: "김나래", sub: "나래바이오 · 연구소 / 책임", phone: "010-3333-4444", lead: true }]);
  await saveEditor(dom.window,"deal");
  await waitFor(() => deal()?.contactName === "김나래", "remaining name saved");
  assert.deepEqual(deal().linkedContactIds, ["ct-narae"]);
  assert.equal(deal().contactPhone, "010-3333-4444");
  assert.equal(document.querySelector('#deal-drawer-body [data-f="contactPhone"]').value, "010-3333-4444");

  /* 모두 해제하면 직접 입력 칸으로 되돌아간다 */
  linkedWrap.querySelector('[data-remove-contact="ct-narae"]').click();
  assert.match(linkedWrap.textContent, /선택한 담당자가 없습니다/);
  await saveEditor(dom.window,"deal");
  await waitFor(() => deal()?.contactName === "", "clearing every pick empties the name");
  assert.deepEqual(deal().linkedContactIds, []);

  /* 고르지 않은 입력은 그대로 저장된다 */
  input(dom.window, comboInput, "등록되지 않은 담당자");
  assert.deepEqual(options(), []);
  assert.match(comboList.querySelector(".tn-combo-empty").textContent, /입력한 이름 그대로 저장됩니다/);
  await saveEditor(dom.window,"deal");
  await waitFor(() => deal()?.contactName === "등록되지 않은 담당자", "free text saved as typed");
  assert.deepEqual(deal().linkedContactIds, [], "free text must not link a contact");
  comboInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert.equal(comboInput.value, "등록되지 않은 담당자", "고르지 않은 Enter는 입력값을 그대로 둔다");

  /* 키보드로도 고를 수 있다 */
  input(dom.window, comboInput, "이하");
  assert.deepEqual(options(), ["이하늘"]);
  comboInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  assert.equal(comboList.querySelector(".tn-combo-option").getAttribute("aria-selected"), "true");
  comboInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert.deepEqual(picked().map((row) => row.name), ["이하늘"]);
  await saveEditor(dom.window,"deal");
  await waitFor(() => deal()?.contactName === "이하늘", "keyboard selection saved");
  assert.deepEqual(deal().linkedContactIds, ["ct-haneul"]);
  assert.equal(deal().contactPhone, "010-5555-6666");

  /* 매뉴얼에서도 없어진 두 칸 안내를 지우고 합쳐진 입력 방식을 설명해야 한다 */
  const manual = api.records.get("tinico:manual:sections") || [];
  assert.match(manual.find((section) => section.id === "manual_contacts").content, /‘고객 담당자 입력’은 직접 입력과/);
  assert.match(manual.find((section) => section.id === "manual_contacts").content, /‘선택한 담당자’에 이름·소속·직함과 연락처로 쌓이며/);
  assert.match(manual.find((section) => section.id === "manual_pipeline").content, /‘선택한 담당자’에 이름·소속·직함과 연락처로 쌓이며/);
  manual.forEach((section) => {
    assert.equal(/고객 담당자 직접 입력/.test(section.content), false, section.id + " must not describe the removed field");
  });

  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("a chosen primary contact survives reload and removal; manual phone edits are preserved", async (t) => {
  const key = "tinico:stage:existing_accounts";
  const first = await createBrowser({
    "tinico:contacts": comboContacts,
    [key]: [{ id: "primary-deal", title: "대표 지정 검증", stage: "제안",
      linkedContactIds: ["ct-gaon", "ct-narae"], contactName: "김가온, 김나래",
      contactPhone: "010-1111-2222", contactEmail: "gaon@example.com", contactRole: "영업팀 / 과장" }]
  });
  t.after(() => first.dom.window.close());
  first.dom.window.openDealDrawer("existing_accounts", "primary-deal");
  first.dom.window.document.querySelector('[data-primary-contact="ct-narae"]').click();
  await saveEditor(first.dom.window,"deal");
  await waitFor(() => first.api.records.get(key)?.[0]?.linkedContactIds[0] === "ct-narae", "chosen primary saved");
  const saved = first.api.records.get(key)[0];
  assert.deepEqual(saved.linkedContactIds, ["ct-narae", "ct-gaon"]);
  assert.equal(saved.contactPhone, "010-3333-4444");
  assert.equal(saved.contactEmail, "narae@example.com");
  assert.equal(saved.contactRole, "연구소 / 책임");

  const repeat = await createBrowser(Object.fromEntries(first.api.records));
  t.after(() => repeat.dom.window.close());
  repeat.dom.window.openDealDrawer("existing_accounts", "primary-deal");
  const doc = repeat.dom.window.document;
  assert.match(doc.querySelector('.tn-linked-contact-badge').parentElement.textContent, /김나래/);
  doc.querySelector('[data-remove-contact="ct-narae"]').click();
  await saveEditor(repeat.dom.window,"deal");
  await waitFor(() => repeat.api.records.get(key)[0].linkedContactIds.length === 1, "primary removal saved");
  assert.equal(repeat.api.records.get(key)[0].contactPhone, "010-1111-2222");

  const search = doc.querySelector('[data-contact-combo] input');
  input(repeat.dom.window, search, "나래");
  doc.querySelector('[data-contact-id="ct-narae"]').dispatchEvent(new repeat.dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  input(repeat.dom.window, doc.querySelector('#deal-drawer-body [data-f="contactPhone"]'), "02-1234-5678");
  doc.querySelector('[data-primary-contact="ct-narae"]').click();
  await saveEditor(repeat.dom.window,"deal");
  await waitFor(() => repeat.api.records.get(key)[0].linkedContactIds[0] === "ct-narae", "primary with override saved");
  assert.equal(repeat.api.records.get(key)[0].contactPhone, "02-1234-5678");
  assert.deepEqual(first.runtimeErrors.concat(repeat.runtimeErrors).map(error => error.message), []);
});

const calendarWorkRecords = {
  "tinico:stage:existing_accounts": [{ id: "calendar-deal", title: "샘플 공급 협의", stage: "제안", internalOwner: "영업 담당", nextAction: "2026-09-15", action: "견적 전달" }],
  "tinico:stage:roadmap": [{ id: "calendar-task", title: "샘플 자료 준비", status: "진행중", owner: "지원 담당", dueDate: "2026-09-14", nextAction: "자료 확인" }]
};

test("pipeline analysis KPIs list their calculation sources and navigate to matching details", async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,runtimeErrors}=await createBrowser({
    [key]:[
      {id:"kpi-won",title:"수주 고객",stage:"수주",nextAction:"2000-01-01"},
      {id:"kpi-lost",title:"실주 고객",stage:"실주"},
      {id:"kpi-hold",title:"보류 고객",stage:"보류"},
      {id:"kpi-late",title:"<img src=x onerror=alert(1)>",stage:"제안",nextAction:"2000-01-01",internalOwner:"영업 담당",action:"견적 확인"},
      {id:"kpi-active",title:"진행 고객",stage:"상담",nextAction:"2099-01-01"}
    ],
    "tinico:stage:roadmap":[{id:"kpi-done",title:"완료한 자료",status:"완료"},{id:"kpi-task",title:"작성할 자료",status:"진행중"}]
  });t.after(()=>dom.window.close());
  const doc=dom.window.document,rows=()=>[...doc.querySelectorAll("#kpi-modal-list button")];
  const open=kind=>doc.querySelector(`[data-kpi="${kind}"]`).click();
  open("win");assert.equal(rows().length,3);assert.match(doc.getElementById("kpi-modal-summary").textContent,/수주 1건 \/ 종료 항목 3건/);
  rows()[0].click();assert.equal(doc.getElementById("kpi-overlay").hidden,true);
  assert.equal(doc.querySelector('#deal-drawer-body [data-f="title"]').value,"수주 고객");
  assert.equal(doc.getElementById("deal-drawer-save").disabled,true,"merely opening an older item must not create edits");
  assert.ok(doc.getElementById("view-pipeline").classList.contains("active"));doc.getElementById("deal-drawer-close").click();
  open("active");assert.equal(rows().length,2);
  assert.equal(doc.querySelectorAll("#kpi-modal-list img").length,0);
  open("overdue");assert.equal(rows().length,1);assert.match(rows()[0].textContent,/영업 담당.*2000-01-01/);
  const close=doc.getElementById("kpi-modal-close");close.focus();
  close.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Tab",shiftKey:true,bubbles:true,cancelable:true}));
  assert.equal(doc.activeElement,rows().at(-1));
  rows()[0].dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  assert.equal(doc.getElementById("kpi-overlay").hidden,true);assert.equal(doc.activeElement,doc.querySelector('[data-kpi="overdue"]'));
  open("tasks");assert.equal(rows().length,2);assert.match(doc.getElementById("kpi-modal-summary").textContent,/완료 1건 \/ 전체 2건/);
  rows()[0].click();assert.equal(doc.getElementById("roadmap-modal-name").value,"완료한 자료");
  assert.ok(doc.getElementById("view-roadmap").classList.contains("active"));
  dom.window.eval('stageData.existing_accounts=[];roadmapData=[];renderHome();');
  open("overdue");assert.equal(rows().length,0);assert.match(doc.getElementById("kpi-modal-list").textContent,/해당하는 항목이 없습니다/);
  doc.getElementById("kpi-overlay").click();assert.equal(doc.getElementById("kpi-overlay").hidden,true);
  assert.deepEqual(runtimeErrors.map(e=>e.message),[]);
});

test("new pipeline and contact inputs stay unsaved, support cancel, retry, and survive reload only after Save",async t=>{
  const {dom,api,runtimeErrors}=await createBrowser();t.after(()=>dom.window.close());
  const win=dom.window,doc=win.document;
  const before=api.allRequests.filter(r=>r.method==="PUT").length;
  doc.getElementById("pipe-new-deal").click();input(win,doc.querySelector('[data-f="title"]'),"저장할 영업");
  doc.getElementById("contact-manual-btn").click();input(win,doc.querySelector('[data-field="name"]'),"저장할 담당자");
  await new Promise(r=>setTimeout(r,650));
  assert.equal(api.allRequests.filter(r=>r.method==="PUT").length,before,"typing must not trigger any save request");
  assert.equal(win.eval('allDeals().some(d=>d.item.title==="저장할 영업")'),false);
  assert.equal(win.eval('contactsData.some(c=>c.name==="저장할 담당자")'),false);
  win.confirm=()=>false;doc.getElementById("contact-drawer-cancel").click();assert.equal(doc.getElementById("contact-drawer").hidden,false);
  win.confirm=()=>true;doc.getElementById("contact-drawer-cancel").click();assert.equal(doc.getElementById("contact-drawer").hidden,true);
  assert.equal((api.records.get("tinico:contacts")||[]).length,0);
  const ref=JSON.parse(win.eval('JSON.stringify(selectedDealRef)')),key="tinico:stage:"+ref.areaKey;
  api.failNextPut(key);doc.getElementById("deal-drawer-save").click();
  await waitFor(()=>/저장 실패/.test(doc.getElementById("deal-save-status").textContent),"deal save failure");
  assert.equal(doc.querySelector('[data-f="title"]').value,"저장할 영업");
  assert.equal(win.eval('allDeals().some(d=>d.item.title==="저장할 영업")'),false);
  await saveEditor(win,"deal");doc.getElementById("deal-drawer-close").click();
  doc.getElementById("contact-manual-btn").click();input(win,doc.querySelector('[data-field="name"]'),"저장할 담당자");
  api.failNextPut("tinico:contacts");doc.getElementById("contact-drawer-save").click();
  await waitFor(()=>/저장 실패/.test(doc.getElementById("contact-save-status").textContent),"contact save failure");
  assert.equal(win.eval("contactsData.length"),0);assert.equal(doc.querySelector('[data-field="name"]').value,"저장할 담당자");
  await saveEditor(win,"contact");
  const repeat=await createBrowser(Object.fromEntries(api.records));t.after(()=>repeat.dom.window.close());
  assert.equal(repeat.dom.window.eval('allDeals().some(d=>d.item.title==="저장할 영업")'),true);
  assert.equal(repeat.dom.window.eval('contactsData.some(c=>c.name==="저장할 담당자")'),true);
  assert.deepEqual(runtimeErrors.concat(repeat.runtimeErrors).map(e=>e.message),[]);
});

test("pipeline row saves isolate other drafts and kanban changes require confirmation through Save",async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,api,runtimeErrors}=await createBrowser({[key]:[{id:"row-a",title:"A 고객",stage:"상담",amount:"10"},{id:"row-b",title:"B 고객",stage:"제안",amount:"20"}]});
  t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  win.showView("pipeline");
  const row=id=>doc.querySelector(`[data-row-save="${id}"]`).closest("tr");
  input(win,row("row-a").querySelector('input[type="number"]'),"100");input(win,row("row-b").querySelector('input[type="number"]'),"200");
  doc.querySelector('[data-row-save="row-a"]').click();
  await waitFor(()=>api.records.get(key).find(i=>i.id==="row-a").amount==="100","row A saved");
  assert.equal(api.records.get(key).find(i=>i.id==="row-b").amount,"20");
  assert.equal(win.eval('findDeal("existing_accounts","row-b").item.amount'),"20");
  assert.equal(row("row-b").querySelector('input[type="number"]').value,"200");
  win.openDealDrawer("existing_accounts","row-b");assert.equal(doc.querySelector('[data-f="amount"]').value,"200");
  doc.getElementById("deal-drawer-cancel").click();assert.equal(row("row-b").querySelector('input[type="number"]').value,"20");
  doc.getElementById("pipe-view-board").click();
  const drop=new win.Event("drop",{bubbles:true,cancelable:true});Object.defineProperty(drop,"dataTransfer",{value:{getData:()=>JSON.stringify({areaKey:"existing_accounts",id:"row-a"})}});
  doc.querySelector('.tn-kcol[data-stage="수주"]').dispatchEvent(drop);
  assert.equal(doc.querySelector('#deal-drawer-body [data-stage]').value,"수주");assert.equal(api.records.get(key)[0].stage,"상담");
  await saveEditor(win,"deal");assert.equal(api.records.get(key)[0].stage,"수주");assert.equal(Number(api.records.get(key)[0].prob),100);
  assert.deepEqual(runtimeErrors.map(e=>e.message),[]);
});

test("contact and linked-deal failures roll back together and dirty deal edits require explicit conflict resolution",async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,api,runtimeErrors}=await createBrowser({"tinico:contacts":comboContacts,[key]:[{id:"mirror",title:"연결 영업",stage:"제안",linkedContactIds:["ct-gaon"],contactName:"김가온",contactPhone:"010-1111-2222"}]});
  t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  win.openDealDrawer("existing_accounts","mirror");input(win,doc.querySelector('[data-f="title"]'),"아직 저장 안 한 제목");
  win.openContactDetail(win.eval('contactsData.find(c=>c.id==="ct-gaon")'));
  input(win,doc.querySelector('[data-field="mobilePhone"]'),"010-9999-0000");
  assert.equal(win.eval('findDeal("existing_accounts","mirror").item.contactPhone'),"010-1111-2222");
  api.failNextPut(key);doc.getElementById("contact-drawer-save").click();
  await waitFor(()=>/저장 실패/.test(doc.getElementById("contact-save-status").textContent),"atomic mirror failure");
  assert.equal(api.records.get("tinico:contacts")[0].mobilePhone,"010-1111-2222");assert.equal(api.records.get(key)[0].contactPhone,"010-1111-2222");
  assert.equal(win.eval('findDeal("existing_accounts","mirror").item.contactPhone'),"010-1111-2222");
  await saveEditor(win,"contact");assert.equal(api.records.get(key)[0].contactPhone,"010-9999-0000");
  assert.equal(api.records.get(key)[0].title,"연결 영업","contact save must not leak the open deal draft");
  doc.getElementById("contact-drawer-close").click();
  doc.getElementById("deal-drawer-save").click();
  await waitFor(()=>doc.getElementById("save-conflict-overlay"),"dirty deal token stays pinned");
  const overlay=doc.getElementById("save-conflict-overlay");assert.match(overlay.textContent,/010-9999-0000/);
  overlay.querySelector("select").value="mine";[...overlay.querySelectorAll("button")].find(button=>button.textContent==="선택한 내용으로 저장").click();
  await waitFor(()=>doc.getElementById("deal-save-status").textContent==="저장됨","explicit overwrite");
  assert.equal(api.records.get(key)[0].title,"아직 저장 안 한 제목");assert.equal(api.records.get(key)[0].contactPhone,"010-1111-2222","only explicit mine choice may replace the latest fields");
  assert.deepEqual(runtimeErrors.map(e=>e.message),[]);
});

test("a remote edit to another item is not overwritten by later local saves",async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,api}=await createBrowser({[key]:[{id:"a",title:"A",stage:"제안"},{id:"b",title:"B",stage:"제안"}]});t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  api.remoteSave(key,api.records.get(key).map(item=>item.id==="b"?{...item,title:"다른 사용자 B"}:item));
  win.openDealDrawer("existing_accounts","a");input(win,doc.querySelector('[data-f="title"]'),"내 A");await saveEditor(win,"deal");
  input(win,doc.querySelector('[data-f="title"]'),"내 A 두 번째");await saveEditor(win,"deal");
  assert.equal(api.records.get(key).find(item=>item.id==="b").title,"다른 사용자 B");assert.equal(doc.getElementById("save-conflict-overlay"),null);
});

test("same-item conflicts retain input, recheck a second race, and reflect the selected server value",async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,api}=await createBrowser({[key]:[{id:"a",title:"원본",stage:"제안"}]});t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  win.openDealDrawer("existing_accounts","a");input(win,doc.querySelector('[data-f="title"]'),"내 입력");
  const remote=title=>api.remoteSave(key,api.records.get(key).map(item=>({...item,title})));
  remote("서버 1");doc.getElementById("deal-drawer-save").click();
  let overlay=await waitFor(()=>doc.getElementById("save-conflict-overlay"),"first conflict");
  assert.match(overlay.textContent,/원본/);assert.match(overlay.textContent,/내 입력/);assert.match(overlay.textContent,/서버 1/);
  [...overlay.querySelectorAll("button")].find(button=>button.textContent==="돌아가서 계속 편집").click();
  await waitFor(()=>!doc.getElementById("deal-drawer-save").disabled,"draft retry enabled");assert.equal(doc.querySelector('[data-f="title"]').value,"내 입력");
  doc.getElementById("deal-drawer-save").click();overlay=await waitFor(()=>doc.getElementById("save-conflict-overlay"),"retry conflict");
  remote("서버 2");overlay.querySelector("select").value="mine";[...overlay.querySelectorAll("button")].find(button=>button.textContent==="선택한 내용으로 저장").click();
  overlay=await waitFor(()=>{const el=doc.getElementById("save-conflict-overlay");return el?.textContent.includes("서버 2")&&el;},"second race rechecked");
  assert.equal(api.records.get(key)[0].title,"서버 2");assert.equal(overlay.querySelector("select").value,"server");
  [...overlay.querySelectorAll("button")].find(button=>button.textContent==="선택한 내용으로 저장").click();
  await waitFor(()=>doc.getElementById("deal-save-status").textContent==="저장됨","server choice saved");
  assert.equal(doc.querySelector('[data-f="title"]').value,"서버 2");assert.equal(win.eval('findDeal("existing_accounts","a").item.title'),"서버 2");
});

test("a stale delete creates no trash entry and a restored workspace keeps unsaved input",async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,api}=await createBrowser({[key]:[{id:"a",title:"원본",stage:"제안"}]});t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  api.remoteSave(key,api.records.get(key).map(item=>({...item,title:"삭제 전 수정"})));
  const deleting=win.moveDealToTrash("existing_accounts","a");let overlay=await waitFor(()=>doc.getElementById("save-conflict-overlay"),"delete conflict");
  assert.equal((api.records.get("tinico:trash")||[]).length,0);
  [...overlay.querySelectorAll("button")].find(button=>button.textContent==="돌아가서 계속 편집").click();await deleting;
  assert.equal(api.records.get(key)[0].title,"삭제 전 수정");
  win.openDealDrawer("existing_accounts","a");input(win,doc.querySelector('[data-f="title"]'),"복원 전에 작성한 내용");api.simulateRestore();
  doc.getElementById("deal-drawer-save").click();overlay=await waitFor(()=>doc.getElementById("save-conflict-overlay"),"restore protection");
  assert.match(overlay.textContent,/복원/);assert.ok([...overlay.querySelectorAll("button")].some(button=>button.textContent==="내 입력 복사"));
  [...overlay.querySelectorAll("button")].find(button=>button.textContent==="돌아가서 계속 편집").click();
  await waitFor(()=>!doc.getElementById("deal-drawer-save").disabled,"restore draft retained");assert.equal(doc.querySelector('[data-f="title"]').value,"복원 전에 작성한 내용");
});

test("a lost successful response retries the same save without duplication",async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,api}=await createBrowser({[key]:[{id:"a",title:"원본",stage:"제안"}]});t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  const fetch=win.fetch,requests=[];let lost=false;
  win.fetch=async(url,options)=>{const response=await fetch(url,options);if(options?.method==="PUT"&&decodeURIComponent(String(url)).endsWith(key)){requests.push(JSON.parse(options.body).requestId);if(!lost){lost=true;throw new Error("lost response");}}return response;};
  win.openDealDrawer("existing_accounts","a");input(win,doc.querySelector('[data-f="title"]'),"한 번 저장");await saveEditor(win,"deal");
  assert.equal(requests.length,2);assert.equal(new Set(requests).size,1);assert.equal(api.records.get(key).length,1);assert.equal(doc.getElementById("save-conflict-overlay"),null);
});

test("manual retry of a new calendar event after an uncertain response reuses its ID and request",async t=>{
  const {dom,api}=await createBrowser();t.after(()=>dom.window.close());const win=dom.window,doc=win.document,key="tinico:calendar:events";
  const fetch=win.fetch,requests=[];let lost=false;
  win.fetch=async(url,options)=>{const response=await fetch(url,options);if(options?.method==="PUT"&&decodeURIComponent(String(url)).endsWith(key)){requests.push(JSON.parse(options.body).requestId);if(!lost){lost=true;return jsonResponse({error:"uncertain_response"},500);}}return response;};
  win.openCalendarEventModal("","2026-09-11");input(win,doc.getElementById("calendar-event-title"),"중복 방지 일정");
  await win.saveCalendarEventModal();assert.equal(api.records.get(key).length,1);assert.equal(doc.getElementById("calendar-event-overlay").hidden,false);
  await win.saveCalendarEventModal();assert.equal(api.records.get(key).length,1);assert.equal(new Set(requests).size,1);assert.equal(doc.getElementById("calendar-event-overlay").hidden,true);
});

test("in-flight saves block closing and serialize row writes without overwriting another item",async t=>{
  const key="tinico:stage:existing_accounts";
  const {dom,api,runtimeErrors}=await createBrowser({[key]:[{id:"pending-a",title:"A",stage:"제안",amount:"10"},{id:"pending-b",title:"B",stage:"상담",amount:"20"}]});
  t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  const realFetch=win.fetch;let release;
  win.fetch=(url,options)=>{
    if(options?.method==="PUT"&&decodeURIComponent(String(url)).endsWith(key)&&!release){
      return new Promise(resolve=>{release=()=>resolve(realFetch(url,options));});
    }
    return realFetch(url,options);
  };
  win.showView("pipeline");win.openDealDrawer("existing_accounts","pending-a");
  input(win,doc.querySelector('[data-f="amount"]'),"110");doc.getElementById("deal-drawer-save").click();
  await waitFor(()=>release,"delayed PUT");
  doc.getElementById("deal-drawer-close").click();assert.equal(doc.getElementById("deal-drawer").hidden,false);
  assert.equal(doc.getElementById("deal-drawer-save").disabled,true);
  assert.equal(win.eval('findDeal("existing_accounts","pending-a").item.amount'),"10","canonical data stays unchanged while the network request is pending");
  const second=doc.querySelector('[data-row-save="pending-b"]').closest("tr");input(win,second.querySelector('input[type="number"]'),"220");second.querySelector('[data-row-save]').click();
  release();await waitFor(()=>api.records.get(key).every(i=>i.amount===(i.id==="pending-a"?"110":"220")),"both serialized writes");
  assert.equal(win.eval('findDeal("existing_accounts","pending-a").item.amount'),"110");
  assert.equal(win.eval('findDeal("existing_accounts","pending-b").item.amount'),"220");
  doc.getElementById("deal-drawer-close").click();assert.equal(doc.getElementById("deal-drawer").hidden,true);
  assert.deepEqual(runtimeErrors.map(e=>e.message),[]);
});

test("OCR and uploaded card images remain drafts and failed record saves restore the prior image",async t=>{
  const {dom,api,runtimeErrors}=await createBrowser();t.after(()=>dom.window.close());const win=dom.window,doc=win.document;
  win.eval('makeCardThumb=async image=>image;ocrCardImage=async()=>({text:"명함",parsed:{name:"명함 담당",company:"회사",mobilePhone:"010-1234-1234",email:"card@example.com"}});');
  await win.stageContactImage("data:image/jpeg;base64,b2xk");
  assert.equal((api.records.get("tinico:contacts")||[]).length,0);assert.equal(win.eval("contactsData.length"),0);
  assert.equal(doc.querySelector('[data-field="name"]').value,"명함 담당");await saveEditor(win,"contact");
  const id=api.records.get("tinico:contacts")[0].id,imageKey=win.contactImageKey(id);assert.equal(api.records.get(imageKey),"data:image/jpeg;base64,b2xk");
  win.openCompanySearchModal(win.eval('contactDrafts.get(selectedContactId).value'));
  input(win,doc.getElementById("company-search-name"),"확인한 회사명");doc.getElementById("company-search-save").click();
  await waitFor(()=>doc.getElementById("company-search-overlay").hidden,"apply company name to draft");
  assert.equal(doc.querySelector('[data-field="company"]').value,"확인한 회사명");
  assert.equal(win.eval('contactsData[0].company'),"회사");assert.equal(api.records.get("tinico:contacts")[0].company,"회사");
  await saveEditor(win,"contact");assert.equal(api.records.get("tinico:contacts")[0].company,"확인한 회사명");
  await win.stageContactImage("data:image/jpeg;base64,bmV3",id);assert.equal(api.records.get(imageKey),"data:image/jpeg;base64,b2xk");
  api.failNextPut("tinico:contacts");doc.getElementById("contact-drawer-save").click();
  await waitFor(()=>/저장 실패/.test(doc.getElementById("contact-save-status").textContent),"image-linked record save failure");
  assert.equal(api.records.get(imageKey),"data:image/jpeg;base64,b2xk");
  await saveEditor(win,"contact");assert.equal(api.records.get(imageKey),"data:image/jpeg;base64,bmV3");
  assert.equal(api.records.get("tinico:contacts")[0].cardThumb,"data:image/jpeg;base64,bmV3");
  assert.deepEqual(runtimeErrors.map(e=>e.message),[]);
});

test("calendar owner and both work links persist, reload, and recover from a failed save", async (t) => {
  const first = await createBrowser(calendarWorkRecords);
  t.after(() => first.dom.window.close());
  const { document: doc } = first.dom.window;
  const change = (dom, id, value) => {
    const el = dom.window.document.getElementById(id);
    el.value = value;
    el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  };
  first.dom.window.openCalendarEventModal();
  assert.equal(doc.getElementById("calendar-event-owner").value, "");
  assert.equal(doc.getElementById("calendar-event-deal").value, "");
  assert.ok([...doc.querySelectorAll('#calendar-event-owner-options option')].some(option => option.value === "영업 담당"));
  input(first.dom.window, doc.getElementById("calendar-event-title"), "연관 업무 일정 검증");
  input(first.dom.window, doc.getElementById("calendar-event-owner"), "새 일정 담당자");
  change(first.dom, "calendar-event-deal", JSON.stringify(["existing_accounts", "calendar-deal"]));
  change(first.dom, "calendar-event-task", "calendar-task");
  assert.match(doc.getElementById("calendar-event-deal-preview").textContent, /제안[\s\S]*영업 담당[\s\S]*견적 전달/);
  assert.match(doc.getElementById("calendar-event-task-preview").textContent, /진행중[\s\S]*지원 담당[\s\S]*자료 확인/);
  assert.equal(doc.getElementById("calendar-event-owner").value, "새 일정 담당자", "choosing work must not overwrite an entered owner");
  doc.getElementById("calendar-event-save").click();
  const key = "tinico:calendar:events";
  await waitFor(() => doc.getElementById("calendar-event-overlay").hidden, "event saved");
  const saved = first.api.records.get(key)[0];
  assert.equal(saved.owner, "새 일정 담당자");
  assert.equal(saved.relatedAreaKey, "existing_accounts");
  assert.equal(saved.relatedDealId, "calendar-deal");
  assert.equal(saved.relatedTaskId, "calendar-task");
  assert.match(doc.getElementById("calendar-upcoming-list").textContent, /새 일정 담당자[\s\S]*샘플 공급 협의[\s\S]*샘플 자료 준비/);

  const repeat = await createBrowser(Object.fromEntries(first.api.records));
  t.after(() => repeat.dom.window.close());
  repeat.dom.window.openCalendarEventModal(saved.id);
  const editDoc = repeat.dom.window.document;
  assert.equal(editDoc.getElementById("calendar-event-owner").value, saved.owner);
  assert.equal(editDoc.getElementById("calendar-event-deal").value, JSON.stringify([saved.relatedAreaKey, saved.relatedDealId]));
  assert.equal(editDoc.getElementById("calendar-event-task").value, saved.relatedTaskId);
  input(repeat.dom.window, editDoc.getElementById("calendar-event-owner"), "수정 담당자");
  change(repeat.dom, "calendar-event-deal", "");
  change(repeat.dom, "calendar-event-task", "");
  repeat.api.failNextPut(key);
  editDoc.getElementById("calendar-event-save").click();
  await waitFor(() => !editDoc.getElementById("calendar-event-save").disabled, "failed save recovery");
  assert.equal(editDoc.getElementById("calendar-event-overlay").hidden, false);
  assert.equal(repeat.api.records.get(key)[0].owner, saved.owner);
  assert.equal(repeat.api.records.get(key)[0].relatedTaskId, saved.relatedTaskId);
  assert.equal(repeat.dom.window.eval("calendarEntries[0].relatedDealId"), saved.relatedDealId);
  assert.equal(editDoc.getElementById("calendar-event-owner").value, "수정 담당자", "failed input retained for retry");
  editDoc.getElementById("calendar-event-save").click();
  await waitFor(() => editDoc.getElementById("calendar-event-overlay").hidden, "retry saved");
  assert.equal(repeat.api.records.get(key)[0].owner, "수정 담당자");
  assert.equal(repeat.api.records.get(key)[0].relatedAreaKey, "");
  assert.equal(repeat.api.records.get(key)[0].relatedDealId, "");
  assert.equal(repeat.api.records.get(key)[0].relatedTaskId, "");
  repeat.dom.window.openCalendarEventModal();
  assert.equal(editDoc.getElementById("calendar-event-owner").value, "", "new event does not inherit last edited fields");
  assert.deepEqual(first.runtimeErrors.map(error => error.message), []);
});

test("calendar preserves missing work references and safely previews a moved deal", async (t) => {
  const { dom, api, runtimeErrors } = await createBrowser({
    "tinico:stage:sample_validation": [{ id: "moved-deal", title: '<img id="work-xss" src=x onerror=alert(1)>', stage: "제안" }],
    "tinico:calendar:events": [{ id: "linked-event", title: "참고 일정", owner: "담당자", relatedAreaKey: "existing_accounts", relatedDealId: "moved-deal", relatedTaskId: "missing-task" }]
  });
  t.after(() => dom.window.close());
  dom.window.openCalendarEventModal("linked-event");
  const doc = dom.window.document;
  assert.equal(doc.getElementById("calendar-event-deal").value, JSON.stringify(["sample_validation", "moved-deal"]));
  assert.match(doc.getElementById("calendar-event-deal-preview").textContent, /<img/);
  assert.equal(doc.getElementById("work-xss"), null);
  assert.equal(doc.getElementById("calendar-event-task").value, "missing-task");
  assert.match(doc.getElementById("calendar-event-task-preview").textContent, /찾을 수 없습니다/);
  doc.getElementById("calendar-event-save").click();
  await waitFor(() => doc.getElementById("calendar-event-overlay").hidden, "missing reference preserved");
  assert.equal(api.records.get("tinico:calendar:events")[0].relatedTaskId, "missing-task");
  assert.equal(api.records.get("tinico:calendar:events")[0].relatedAreaKey, "sample_validation");
  assert.deepEqual(runtimeErrors.map(error => error.message), []);
});

test("admin backup downloads an .xlsx workbook that restores back losslessly", async (t) => {
  const blobs = [];
  const bigMemo = "가".repeat(45000); /* Excel 한 칸 상한을 넘겨 여러 줄로 나뉘는 경우 */
  const { dom, api, runtimeErrors } = await createBrowser({
    "tinico:contacts": [{ id: "ct-1", name: "김가온", company: "가온테크", memo: bigMemo, createdAt: "2026-07-16" }]
  }, (window) => {
    window.URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:xlsx-test"; };
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;

  document.getElementById("settings-admin-open").click();
  document.getElementById("settings-admin-code").value = requestedAdminCode;
  document.getElementById("settings-admin-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => document.getElementById("settings-admin-overlay").hidden, "administrator unlock");

  document.getElementById("settings-backup-export").click();
  await waitFor(() => blobs.length > 0, "backup workbook");
  const bytes = new Uint8Array(await blobs[0].arrayBuffer());
  /* Excel 파일은 ZIP이라 PK로 시작한다 */
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  assert.ok(bytes.length > 500, "통합 문서에 내용이 들어 있어야 한다");

  /* 시트 구성과 내용이 Excel에서 읽을 수 있는 형태인지 */
  const sheets = await dom.window.eval("workbookSheetRows")(bytes.buffer);
  assert.deepEqual(Array.from(sheets.keys()).map(String), ["백업정보", "저장데이터", "변경로그"]);
  const info = new Map(sheets.get("백업정보").slice(1).map((row) => [row[0], row[1]]));
  assert.equal(info.get("형식"), "tiniko-crm-admin-backup-v3");
  assert.equal(info.get("버전"), "3");
  const recordSheet = sheets.get("저장데이터");
  assert.deepEqual(Array.from(recordSheet[0]).map(String), ["저장키", "리비전", "수정시각", "값(JSON)", "조각"]);
  assert.ok(recordSheet.some((row) => row[0] === "tinico:contacts"));
  /* 큰 값은 상한을 넘지 않게 나뉘어야 한다 */
  recordSheet.slice(1).forEach((row) => assert.ok(String(row[3] || "").length <= 30000, "한 칸이 Excel 상한을 넘으면 안 된다"));
  assert.ok(recordSheet.some((row) => Number(row[4]) > 1), "긴 값은 여러 줄로 나뉘어야 한다");

  /* 되읽으면 원래 백업 내용으로 돌아와야 한다 */
  const restored = await dom.window.eval("readBackupWorkbook")(bytes.buffer);
  assert.equal(restored.tinikoCRMBackupVersion, 3);
  assert.equal(restored.format, "tiniko-crm-admin-backup-v3");
  const contacts = restored.data.records.find((record) => record.key === "tinico:contacts");
  assert.equal(contacts.value[0].name, "김가온");
  assert.equal(contacts.value[0].memo, bigMemo, "나뉘어 저장된 긴 값이 원래대로 합쳐져야 한다");
  assert.ok(restored.data.auditLogs.length >= 1);
  const auditEntry = restored.data.auditLogs[0];
  assert.ok(auditEntry.eventId && auditEntry.screen && auditEntry.action);
  assert.ok(Array.isArray(auditEntry.changedFields));

  /* 까다로운 값도 통합 문서를 거쳐 그대로 돌아와야 한다 */
  const nasty = {
    trailingSpace: "끝에 공백 ", leadingSpace: " 앞에 공백",
    quotes: 'he said "hi" & <tag>', newlines: "첫 줄\n둘째 줄\t탭",
    unicode: "이모지 😀 한자 漢字 ü", empty: "", nullValue: null,
    numbers: [0, -1, 3.14159, Number.MAX_SAFE_INTEGER], bools: [true, false],
    nested: { a: { b: { c: ["깊은 값 ", ""] } } }, huge: "긴값 ".repeat(20000)
  };
  const sample = {
    format: "tiniko-crm-admin-backup-v3", tinikoCRMBackupVersion: 3, workspaceId: "hlbbusisup",
    exportedAt: "2026-09-10T05:00:00.000Z", description: '설명 & <문자> "따옴표"',
    summary: { recordCount: 2, auditLogCount: 1 },
    data: {
      records: [
        { key: "tinico:contacts", value: [nasty], revision: 7, updatedAt: "2026-09-10T05:00:00.000Z" },
        { key: "tinico:app:settings", value: null, revision: 2, updatedAt: "2026-09-10T05:00:00.000Z" }
      ],
      auditLogs: [{
        eventId: "evt-round", eventAt: "2026-09-10T05:00:00.000Z", screen: "연락처", action: "입력",
        entityType: "연락처", entityId: null, entityLabel: "김가온 · 가온테크 ", storageKey: "tinico:contacts",
        changedFields: [{ field: "memo", label: "메모", before: null, after: "값 " }],
        beforeValue: null, afterValue: nasty, summary: "연락처에서 연락처 '김가온' 입력 & <검증>"
      }]
    }
  };
  const sampleBlob = await dom.window.eval("buildBackupWorkbook")(sample);
  const sampleBytes = new Uint8Array(await sampleBlob.arrayBuffer());
  const sampleBack = await dom.window.eval("readBackupWorkbook")(sampleBytes.buffer);
  assert.equal(sampleBack.workspaceId, sample.workspaceId);
  assert.equal(sampleBack.exportedAt, sample.exportedAt);
  assert.equal(sampleBack.description, sample.description);
  sample.data.records.forEach((record, index) => {
    const got = sampleBack.data.records[index];
    assert.equal(got.key, record.key);
    assert.equal(got.revision, record.revision);
    assert.equal(got.updatedAt, record.updatedAt);
    assert.equal(JSON.stringify(got.value), JSON.stringify(record.value), record.key + " 값이 그대로 보존되어야 한다");
  });
  const gotLog = sampleBack.data.auditLogs[0];
  const sourceLog = sample.data.auditLogs[0];
  ["eventId", "eventAt", "screen", "action", "entityType", "entityLabel", "storageKey", "summary"].forEach((field) => {
    assert.equal(gotLog[field], sourceLog[field], "변경 로그 " + field);
  });
  assert.equal(gotLog.entityId, null);
  assert.equal(JSON.stringify(gotLog.changedFields), JSON.stringify(sourceLog.changedFields));
  assert.equal(JSON.stringify(gotLog.afterValue), JSON.stringify(sourceLog.afterValue));

  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});

test("restore accepts the .xlsx workbook and older .json backups", async (t) => {
  const blobs = [];
  const { dom, api, runtimeErrors } = await createBrowser({}, (window) => {
    window.URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:xlsx-test"; };
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;

  document.getElementById("settings-admin-open").click();
  document.getElementById("settings-admin-code").value = requestedAdminCode;
  document.getElementById("settings-admin-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => document.getElementById("settings-admin-overlay").hidden, "administrator unlock");
  document.getElementById("settings-backup-export").click();
  await waitFor(() => blobs.length > 0, "backup workbook");
  const workbookBytes = new Uint8Array(await blobs[0].arrayBuffer());

  const restoreCalls = () => api.adminRequests.filter((request) => request.path === "/api/admin/restore").length;
  const before = restoreCalls();

  /* Excel 파일로 복원 */
  const xlsxFile = new dom.window.File([workbookBytes], "backup.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await dom.window.eval("importFullBackup")(xlsxFile);
  await waitFor(() => restoreCalls() === before + 1, "xlsx restore request");

  /* 예전에 내려받은 .json 백업도 그대로 복원돼야 한다 */
  const legacy = JSON.stringify({
    format: "tiniko-crm-admin-backup-v3", tinikoCRMBackupVersion: 3, workspaceId: "test",
    exportedAt: new Date().toISOString(), data: { records: [{ key: "tinico:areas", value: [], revision: 1, updatedAt: new Date().toISOString() }], auditLogs: [] }
  });
  const jsonFile = new dom.window.File([legacy], "backup.json", { type: "application/json" });
  await dom.window.eval("importFullBackup")(jsonFile);
  await waitFor(() => restoreCalls() === before + 2, "json restore request");

  /* 백업이 아닌 파일은 안내만 하고 복원을 시도하지 않는다 */
  const junk = new dom.window.File(["이건 백업이 아닙니다"], "memo.txt", { type: "text/plain" });
  await dom.window.eval("importFullBackup")(junk);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(restoreCalls(), before + 2, "잘못된 파일로는 복원을 시도하지 않아야 한다");
  assert.match(document.querySelector(".tn-notice-stack")?.textContent || "", /백업 파일을 읽을 수 없습니다|not valid JSON/,
    "읽을 수 없는 파일은 사용자에게 알려야 한다");
  /* 복원 뒤 화면 새로 부르기(jsdom 미지원)와 잘못된 파일에 대한 진단 기록은 예상된 출력이다 */
  assert.deepEqual(
    runtimeErrors.map((error) => error.message)
      .filter((message) => !/Not implemented: navigation|backup file read failed/.test(message)),
    []
  );
});

test("trash list collapses and expands, and the state is stored", async (t) => {
  const { dom, api, runtimeErrors } = await createBrowser();
  t.after(() => dom.window.close());
  const { document } = dom.window;

  const list = document.getElementById("settings-trash-list");
  const toggle = document.getElementById("settings-trash-collapse");
  assert.equal(list.hidden, false);
  assert.equal(toggle.textContent, "접기");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  /* 휴지통에 항목이 있을 때 접으면 개수를 함께 보여 준다 */
  document.getElementById("contact-manual-btn").click();
  await waitFor(() => !document.getElementById("contact-drawer").hidden, "contact drawer");
  input(dom.window, document.querySelector('#contact-drawer-body [data-field="name"]'), "휴지통 검증 담당자");
  document.getElementById("contact-drawer-save").click();
  await waitFor(() => (api.records.get("tinico:contacts") || []).some((contact) => contact.name === "휴지통 검증 담당자"), "contact saved");
  document.getElementById("contact-drawer-close").click();
  document.querySelector("#contact-tbody [data-check]").click();
  document.getElementById("contact-bulk-delete-btn").click();
  await waitFor(() => (api.records.get("tinico:trash") || []).length === 1, "moved to trash");
  document.querySelector('#tn-tabs [data-key="settings"]').click();
  await waitFor(() => document.querySelectorAll("#settings-trash-list .tn-trash-row").length === 1, "trash row");

  toggle.click();
  assert.equal(list.hidden, true);
  assert.equal(toggle.textContent, "펼치기 · 1개");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  await waitFor(() => (api.records.get("tinico:app:settings") || {}).trashCollapsed === true, "collapsed state stored");

  toggle.click();
  assert.equal(list.hidden, false);
  assert.equal(toggle.textContent, "접기");
  await waitFor(() => (api.records.get("tinico:app:settings") || {}).trashCollapsed === false, "expanded state stored");

  /* 접어 둔 채로 다시 접속하면 접힌 상태가 유지된다 */
  toggle.click();
  await waitFor(() => (api.records.get("tinico:app:settings") || {}).trashCollapsed === true, "collapsed again");
  const seeded = Object.fromEntries(api.records);
  const repeat = await createBrowser(seeded);
  t.after(() => repeat.dom.window.close());
  assert.equal(repeat.dom.window.document.getElementById("settings-trash-list").hidden, true);
  assert.equal(repeat.dom.window.document.getElementById("settings-trash-collapse").textContent, "펼치기 · 1개");

  assert.deepEqual(runtimeErrors.map((error) => error.message), []);
});
