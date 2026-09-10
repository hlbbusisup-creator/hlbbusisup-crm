import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

/* 명함 OCR 텍스트 파싱 회귀 테스트 — 실제 배포 코드에서 파싱 함수를 그대로 추출해 검증 */
/* 연락처 쪽 도우미는 app.js 에, 명함 글자 해석은 필요할 때 내려받는 heavy.js 에 있다 */
const [appSource, heavySource] = await Promise.all([
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/heavy.js", import.meta.url), "utf8")
]);

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error("start marker not found: " + startMarker);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error("end marker not found: " + endMarker);
  return source.slice(start, end);
}

const code = [
  slice(appSource, "function splitLegacyRole(role){", "function syncContactLegacyFields"),
  slice(appSource, "function normalizePhoneNumber", "function loadImageFromDataUrl"),
  slice(heavySource, "function editDistanceAtMost", "let ocrJobQueue")
].join("\n");

const { parseCardText, mergeParsedCards, normalizePhoneNumber, splitLegacyRole } = new Function(
  code + "\nreturn { parseCardText, mergeParsedCards, normalizePhoneNumber, splitLegacyRole };"
)();

test("HLB card layout (title | department order) parses every field", () => {
  const parsed = parseCardText([
    "HLB",
    "과장 | 현장지원팀",
    "Manager",
    "Business Support Team",
    "배 홍 범",
    "Hong-Beom Bae",
    "HLB Group",
    "+82 10 4037 0825",
    "hong-beom.bae@hlb-group.com",
    "The H Tower 6F, NonHyeonRo 662, Gangnamgu, Seoul",
    "www.hlb-group.com"
  ].join("\n"));
  assert.equal(parsed.name, "배홍범");
  assert.equal(parsed.company, "HLB Group");
  assert.equal(parsed.department, "현장지원팀");
  assert.equal(parsed.jobTitle, "과장");
  assert.equal(parsed.mobilePhone, "010-4037-0825");
  assert.equal(parsed.email, "hong-beom.bae@hlb-group.com");
});

test("department | title order and standalone department lines are recognized", () => {
  const parsed = parseCardText("영업본부 | 부장\n김 철 수\n주식회사 티니코\n02-1234-5678");
  assert.equal(parsed.department, "영업본부");
  assert.equal(parsed.jobTitle, "부장");
  assert.equal(parsed.name, "김철수");
  assert.equal(parsed.company, "주식회사 티니코");
  assert.equal(parsed.businessPhone, "02-1234-5678");
});

test("legacy role strings split by department suffix regardless of order", () => {
  assert.deepEqual(splitLegacyRole("과장 | 현장지원팀"), { department: "현장지원팀", jobTitle: "과장" });
  assert.deepEqual(splitLegacyRole("현장지원팀 / 과장"), { department: "현장지원팀", jobTitle: "과장" });
  assert.deepEqual(splitLegacyRole("대표이사"), { department: "", jobTitle: "대표이사" });
});

test("corporate-suffix noise and URL-ish lines are not misread as the company", () => {
  const parsed = parseCardText([
    "Co",
    "Gangnamgu,8eouhlb-group.com",
    "www.hlb-group.com",
    "이 영 희",
    "주식회사 티니코",
    "sales@tiniko.com"
  ].join("\n"));
  assert.equal(parsed.company, "주식회사 티니코");
  assert.equal(parsed.name, "이영희");
});

test("email domains distorted by hyphen/dot misreads are repaired from the website line", () => {
  const dotted = parseCardText("배 홍 범\nhong-beom.bae@hlb.group.com\nwww.hlb-group.com");
  assert.equal(dotted.email, "hong-beom.bae@hlb-group.com");
  const dropped = parseCardText("배 홍 범\nhong-beom.bae@hlb.roup.com\nwww.hlb-group.com");
  assert.equal(dropped.email, "hong-beom.bae@hlb-group.com");
  /* 개인 메일처럼 도메인이 아예 다르면 교정하지 않음 */
  const personal = parseCardText("배 홍 범\nhbbae@gmail.com\nwww.hlb-group.com");
  assert.equal(personal.email, "hbbae@gmail.com");
});

test("phone numbers normalize across +82, mobile, and Seoul landline formats", () => {
  assert.equal(normalizePhoneNumber("+82 10 4037 0825"), "010-4037-0825");
  assert.equal(normalizePhoneNumber("01040370825"), "010-4037-0825");
  assert.equal(normalizePhoneNumber("0212345678"), "02-1234-5678");
  assert.equal(normalizePhoneNumber("0311234567"), "031-123-4567");
});

test("mergeParsedCards fills missing fields from lower-ranked candidates without overwriting", () => {
  const merged = mergeParsedCards([
    { text: "배 홍 범\nhong-beom.bae@hlb-group.com" },
    { text: "HLB Group\n010-4037-0825\n과장 | 현장지원팀" }
  ]);
  assert.equal(merged.name, "배홍범");
  assert.equal(merged.email, "hong-beom.bae@hlb-group.com");
  assert.equal(merged.company, "HLB Group");
  assert.equal(merged.mobilePhone, "010-4037-0825");
  assert.equal(merged.department, "현장지원팀");
  assert.equal(merged.jobTitle, "과장");
});
