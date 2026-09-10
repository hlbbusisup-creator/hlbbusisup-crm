import { randomUUID, createHash } from "node:crypto";

export const isCollectionKey = key => key === "tinico:contacts" || key === "tinico:calendar:events" || key === "tinico:trash" || key.startsWith("tinico:stage:");
export function collectionValue(key, value) {
  return isCollectionKey(key) && (value == null || (Array.isArray(value) && value.every(item => item && typeof item.id === "string" && item.id.length > 0) && new Set(value.map(item => item.id)).size === value.length));
}
export function concurrencyError(code, message, details = {}) {
  return Object.assign(new Error(message), { publicCode: code, statusCode: 409, ...details });
}
export function validateTransaction(body) {
  const bad = () => { throw Object.assign(new Error("저장 요청의 버전 정보가 올바르지 않습니다. 페이지를 다시 열어 주세요."), { publicCode: "invalid_concurrency_request", statusCode: 400 }); };
  if (!body || typeof body.requestId !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId) || typeof body.generation !== "string" || !Array.isArray(body.changes) || !body.changes.length || body.changes.length > 5000) bad();
  const keys = new Set();
  for (const change of body.changes) {
    if (!change || typeof change.key !== "string" || !change.key.startsWith("tinico:") || change.key.length > 240 || keys.has(change.key) || !Array.isArray(change.mutations) || change.mutations.length > 100000) bad();
    keys.add(change.key);
    if (change.remove && typeof change.head !== "string") bad();
    const ids = new Set();
    for (const item of change.mutations) {
      if (!item || typeof item.id !== "string" || item.id.length > 500 || ids.has(item.id) || !(item.version === null || typeof item.version === "string") || (!item.deleted && !Object.hasOwn(item, "value"))) bad();
      ids.add(item.id);
    }
  }
  return body;
}
export const requestFingerprint = body => createHash("sha256").update(JSON.stringify(body)).digest("hex");

// Item tokens survive deletion. Recreating an ID cannot validate an old editor's token.
export function initialDocument(key, record) {
  const value = record?.value ?? null;
  const collection = collectionValue(key, value);
  const items = collection ? (value || []).map(item => ({ id: item.id, value: item, version: randomUUID(), deleted: false })) : record ? [{ id: "", value, version: randomUUID(), deleted: false }] : [];
  return { key, collection, head: randomUUID(), value, items, revision: record?.revision || 0, updatedAt: record?.updatedAt || null };
}
export function publicDocument(doc, generation) {
  return { value: doc.value, revision: doc.revision, updatedAt: doc.updatedAt, collection: doc.collection, head: doc.head, generation, versions: Object.fromEntries(doc.items.map(item => [item.id, item.version])) };
}
export function applyChange(doc, change) {
  const next = structuredClone(doc);
  const byId = new Map(next.items.map(item => [item.id, item]));
  const conflicts = [];
  if (change.remove && change.head !== doc.head) conflicts.push({ key: doc.key, id: null, current: publicDocument(doc, null) });
  for (const mutation of change.mutations) {
    if ((doc.collection && (!mutation.id || (!mutation.deleted && (!mutation.value || Array.isArray(mutation.value) || mutation.value.id !== mutation.id)))) || (!doc.collection && mutation.id !== "")) {
      throw Object.assign(new Error("항목 ID와 저장 값이 일치하지 않습니다."), { publicCode: "invalid_item", statusCode: 400 });
    }
    const previous = byId.get(mutation.id);
    if ((previous?.version ?? null) !== mutation.version) conflicts.push({ key: doc.key, id: mutation.id, version: previous?.version ?? null, value: previous && !previous.deleted ? previous.value : null, deleted: !previous || previous.deleted });
  }
  if (conflicts.length) throw concurrencyError("revision_conflict", "다른 사용자가 먼저 저장했습니다. 입력 내용과 최신 값을 비교해 주세요.", { conflicts });
  if (change.remove) {
    next.items.forEach(item => { item.deleted = true; item.value = null; item.version = randomUUID(); });
    next.value = null;
  } else {
    let values = doc.collection ? [...(doc.value || [])] : null;
    for (const mutation of change.mutations) {
      const item = { id: mutation.id, version: randomUUID(), value: mutation.deleted ? null : mutation.value, deleted: !!mutation.deleted };
      byId.set(item.id, item);
      if (doc.collection) {
        const index = values.findIndex(value => value.id === item.id);
        if (item.deleted) { if (index >= 0) values.splice(index, 1); }
        else if (index >= 0) values[index] = item.value;
        else values.splice(Number.isSafeInteger(mutation.index) ? Math.max(0, Math.min(mutation.index, values.length)) : values.length, 0, item.value);
      } else next.value = item.value;
    }
    next.items = [...byId.values()];
    if (doc.collection) next.value = values;
  }
  next.head = randomUUID(); next.revision++; next.updatedAt = new Date().toISOString();
  return next;
}
