import crypto from "node:crypto";

const FIELD_LABELS = {
  id: "ID",
  key: "키",
  title: "제목",
  name: "이름",
  company: "회사명",
  role: "직함",
  phone: "전화번호",
  mobile: "휴대전화",
  email: "이메일",
  address: "주소",
  memo: "메모",
  stage: "영업 단계",
  amount: "예상 매출",
  prob: "성사 확률",
  internalOwner: "내부 담당자",
  contactName: "고객 담당자",
  linkedContactIds: "연결 연락처",
  nextAction: "다음 연락일",
  action: "다음 할 일",
  activities: "활동 기록",
  status: "상태",
  priority: "우선순위",
  progress: "진행률",
  dueDate: "마감일",
  startDate: "시작일",
  purpose: "목적",
  deliverable: "완료 기준",
  owner: "담당자",
  collaborators: "협업자",
  blocker: "장애 요소",
  notes: "비고",
  date: "날짜",
  startTime: "시작 시간",
  endTime: "종료 시간",
  allDay: "종일 일정",
  location: "장소",
  description: "상세 내용",
  googleEventId: "Google 일정 ID",
  category: "분류",
  content: "내용",
  format: "표시 형식",
  order: "순서",
  color: "색상",
  colorSoft: "보조 색상",
  subtitle: "설명",
  bucket: "매출 분류",
  weight: "가중치",
  beginnerMode: "초보 모드",
  dashboardOrder: "대시보드 순서",
  dashboardCollapse: "대시보드 접기 상태",
  googleCalendar: "Google Calendar 설정",
  value: "값"
};

const EXACT_DESCRIPTORS = new Map([
  ["tinico:contacts", { screen: "연락처", entityType: "연락처", labelFields: ["name", "company"] }],
  ["tinico:stage:roadmap", { screen: "지원 업무", entityType: "지원 업무", labelFields: ["title"] }],
  ["tinico:calendar:events", { screen: "캘린더", entityType: "일정", labelFields: ["title"] }],
  ["tinico:manual:sections", { screen: "설정 > 매뉴얼", entityType: "매뉴얼", labelFields: ["title"] }],
  ["tinico:areas", { screen: "설정", entityType: "그룹", labelFields: ["title"] }],
  ["tinico:settings:stages", { screen: "설정", entityType: "영업 단계", labelFields: ["label", "key"] }],
  ["tinico:settings:buckets", { screen: "설정", entityType: "그룹 분류", labelFields: ["label", "key"] }],
  ["tinico:importance:config", { screen: "설정", entityType: "중요도 기준", labelFields: [] }],
  ["tinico:app:settings", { screen: "설정", entityType: "사용 환경", labelFields: [] }],
  ["tinico:trash", { screen: "설정 > 휴지통", entityType: "휴지통 항목", labelFields: ["label", "type"] }],
  ["tinico:ai:personas", { screen: "AI 지식 도우미", entityType: "AI 담당자", labelFields: ["name", "title"] }]
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, comparable(value[key])]));
}

function valuesMatch(left, right) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function descriptorFor(storageKey) {
  if (EXACT_DESCRIPTORS.has(storageKey)) return EXACT_DESCRIPTORS.get(storageKey);
  if (storageKey.startsWith("tinico:stage:")) {
    return { screen: "파이프라인", entityType: "영업 항목", labelFields: ["title", "company"] };
  }
  return { screen: "시스템", entityType: "저장 데이터", labelFields: ["title", "name", "label"] };
}

function shouldAudit(storageKey) {
  return storageKey.startsWith("tinico:") && !storageKey.includes(":migration:");
}

function safeAuditValue(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    if (/^data:image\//i.test(value)) return `[이미지 데이터 ${value.length.toLocaleString("en-US")}자]`;
    if (value.length > 2000) return value.slice(0, 2000) + `… (총 ${value.length.toLocaleString("en-US")}자)`;
    return value;
  }
  if (["number", "boolean"].includes(typeof value)) return value;
  if (depth >= 5) return "[하위 데이터 생략]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => safeAuditValue(item, depth + 1));
    if (value.length > 100) items.push(`[나머지 ${value.length - 100}개 생략]`);
    return items;
  }
  if (isObject(value)) {
    const entries = Object.entries(value).slice(0, 100).map(([key, item]) => {
      if (/image|photo|base64/i.test(key) && typeof item === "string" && item.length > 200) {
        return [key, `[이미지 데이터 ${item.length.toLocaleString("en-US")}자]`];
      }
      return [key, safeAuditValue(item, depth + 1)];
    });
    return Object.fromEntries(entries);
  }
  return String(value);
}

function itemIdentity(item, index) {
  if (isObject(item)) {
    for (const key of ["id", "key", "googleEventId"]) {
      if (item[key] !== undefined && item[key] !== null && String(item[key]).trim()) return String(item[key]);
    }
  }
  return `index:${index}`;
}

function itemLabel(item, descriptor, fallback) {
  if (isObject(item)) {
    const labels = descriptor.labelFields.map((field) => String(item[field] ?? "").trim()).filter(Boolean);
    if (labels.length) return labels.join(" · ");
  }
  if (["string", "number", "boolean"].includes(typeof item)) return String(item);
  return fallback;
}

function meaningfulKeys(beforeValue, afterValue) {
  const keys = new Set([
    ...Object.keys(isObject(beforeValue) ? beforeValue : {}),
    ...Object.keys(isObject(afterValue) ? afterValue : {})
  ]);
  keys.delete("updatedAt");
  return [...keys].sort();
}

function changesFor(beforeValue, afterValue) {
  if (isObject(beforeValue) || isObject(afterValue)) {
    return meaningfulKeys(beforeValue, afterValue)
      .filter((field) => !valuesMatch(beforeValue?.[field], afterValue?.[field]))
      .map((field) => ({
        field,
        label: FIELD_LABELS[field] || field,
        before: safeAuditValue(beforeValue?.[field]),
        after: safeAuditValue(afterValue?.[field])
      }));
  }
  if (valuesMatch(beforeValue, afterValue)) return [];
  return [{
    field: "value",
    label: FIELD_LABELS.value,
    before: safeAuditValue(beforeValue),
    after: safeAuditValue(afterValue)
  }];
}

function makeEntry({ descriptor, storageKey, action, identity, label, beforeValue, afterValue, eventAt, eventIdFactory }) {
  const changes = changesFor(beforeValue, afterValue);
  if (action === "수정" && !changes.length) return null;
  /* 복원 시 검증 한도(entityId·entityLabel 500자, summary 2000자)를 넘긴 항목이 백업을 통째로 복원 불가로 만들지 않도록 잘라서 기록 */
  const displayLabel = String(label || identity || descriptor.entityType).slice(0, 500);
  return {
    eventId: eventIdFactory(),
    eventAt,
    screen: descriptor.screen,
    action,
    entityType: descriptor.entityType,
    entityId: identity ? String(identity).slice(0, 500) : null,
    entityLabel: displayLabel,
    storageKey,
    changedFields: changes,
    beforeValue: safeAuditValue(beforeValue),
    afterValue: safeAuditValue(afterValue),
    summary: `${descriptor.screen}에서 ${descriptor.entityType} '${displayLabel}' ${action}`.slice(0, 2000)
  };
}

function mapArray(value) {
  const result = new Map();
  (Array.isArray(value) ? value : []).forEach((item, index) => {
    let identity = itemIdentity(item, index);
    let suffix = 2;
    while (result.has(identity)) identity = `${itemIdentity(item, index)}#${suffix++}`;
    result.set(identity, item);
  });
  return result;
}

export function buildAuditEntries({
  storageKey,
  beforeValue,
  afterValue,
  eventAt = new Date().toISOString(),
  eventIdFactory = () => crypto.randomUUID()
}) {
  if (!shouldAudit(storageKey) || valuesMatch(beforeValue, afterValue)) return [];
  const descriptor = descriptorFor(storageKey);

  if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
    const beforeItems = mapArray(beforeValue);
    const afterItems = mapArray(afterValue);
    const entries = [];

    for (const [identity, item] of afterItems) {
      const previous = beforeItems.get(identity);
      const action = previous === undefined ? "입력" : "수정";
      const entry = makeEntry({
        descriptor,
        storageKey,
        action,
        identity,
        label: itemLabel(item, descriptor, identity),
        beforeValue: previous,
        afterValue: item,
        eventAt,
        eventIdFactory
      });
      if (entry) entries.push(entry);
    }

    for (const [identity, item] of beforeItems) {
      if (afterItems.has(identity)) continue;
      const entry = makeEntry({
        descriptor,
        storageKey,
        action: "삭제",
        identity,
        label: itemLabel(item, descriptor, identity),
        beforeValue: item,
        afterValue: null,
        eventAt,
        eventIdFactory
      });
      if (entry) entries.push(entry);
    }
    return entries;
  }

  const action = beforeValue === null || beforeValue === undefined
    ? "입력"
    : afterValue === null || afterValue === undefined
      ? "삭제"
      : "수정";
  const identity = storageKey;
  const entry = makeEntry({
    descriptor,
    storageKey,
    action,
    identity,
    label: itemLabel(afterValue ?? beforeValue, descriptor, descriptor.entityType),
    beforeValue,
    afterValue,
    eventAt,
    eventIdFactory
  });
  return entry ? [entry] : [];
}

export function createRestoreAuditEntry({ backupExportedAt, recordCount, auditLogCount, eventAt = new Date().toISOString() }) {
  const backupTime = String(backupExportedAt || "확인 불가");
  return {
    eventId: crypto.randomUUID(),
    eventAt,
    screen: "설정 > 관리자",
    action: "복원",
    entityType: "전체 백업",
    entityId: null,
    entityLabel: backupTime,
    storageKey: "tinico:admin:restore",
    changedFields: [
      { field: "records", label: "복원 데이터 수", before: null, after: recordCount },
      { field: "auditLogs", label: "복원 로그 수", before: null, after: auditLogCount }
    ],
    beforeValue: null,
    afterValue: { backupExportedAt: backupTime, recordCount, auditLogCount },
    summary: `${backupTime} 시점의 전체 백업으로 복원`
  };
}
