# HLB-현장지원팀 CRM Cloud

기존 `tiniko_crm_simple_mode_v3_calendar.html`을 기반으로, CRM 데이터를 외부 PostgreSQL에 저장하도록 구성한 배포 프로젝트입니다.

브라우저에 DB 비밀번호를 넣지 않습니다. 화면은 같은 Render 서비스의 API를 호출하고, API 서버만 Neon 연결 문자열을 보유합니다.

~~~mermaid
flowchart LR
  U["사용자 브라우저"] -->|HTTPS + CRM 연결키| R["Render · Node/Express"]
  R -->|DATABASE_URL + TLS| N["Neon PostgreSQL"]
  G["GitHub 비공개 저장소"] -->|자동 배포| R
~~~

## 포함된 파일

| 파일 | 역할 |
|---|---|
| `public/index.html` | 기존 HLB-현장지원팀 CRM UI와 외부 DB 저장 어댑터 |
| `server.js` | Render에서 실행되는 서버 시작점 |
| `src/app.js` | 연결키·관리자 인증, 백업·복원 API, 보안 헤더, 정적 파일 제공 |
| `src/audit.js` | 화면별 데이터 비교와 입력·수정·삭제 변경 로그 생성 |
| `src/db.js` | Neon 연결, 감사 로그와 트랜잭션 백업·복원 저장소 |
| `schema.sql` | `crm_kv`, `crm_audit_log` 테이블 정의 |
| `render.yaml` | Render Blueprint 설정 |
| `.env.example` | 로컬 환경변수 예시 |
| `test/api.test.js` | 연결키·관리자 인증, 저장·백업·복원 API와 오류 응답 자동 테스트 |
| `test/audit.test.js` | 화면별 입력·수정·삭제 변경 로그 자동 테스트 |
| `test/db.test.js` | Neon 연결 옵션, 스키마와 PostgreSQL 저장소 자동 테스트 |
| `test/ui.test.js` | 전체 정적 버튼 연결, 메뉴 순서, 화면 이동, CRUD, 연락처 페이지 이동, 리멤버 CSV 업로드·내보내기, 백업, 카메라 예외 경로, 캘린더와 Google 무료 최소 동기화 화면 테스트 |
| `test/fixtures/remember_outlook_contacts.csv` | 리멤버 export와 같은 92개 열 구성의 CSV 시험 파일 (실제 개인정보 없는 가상 데이터) |
| `TEST_REPORT.md` | 오류 수정 내역, 자동 테스트 결과와 배포 후 확인 항목 |

## 1. GitHub 저장소 만들기

권장값은 저장소 이름 `hlbbusisup-crm`, 공개 범위 `Private`입니다. CRM 코드 자체에는 비밀번호가 없지만 사내 시스템은 비공개 저장소로 운영하는 편이 안전합니다.

GitHub 웹에서 직접 만들 때:

1. GitHub 오른쪽 위 `+` → `New repository`를 누릅니다.
2. Repository name에 `hlbbusisup-crm`를 입력합니다.
3. `Private`를 선택합니다.
4. README, `.gitignore`, License 자동 생성을 선택하지 않고 빈 저장소로 만듭니다.
5. 이 프로젝트 폴더에서 아래 명령을 실행합니다.

~~~bash
git init
git branch -M main
git add .
git commit -m "Deploy HLB-BUSISUP CRM with Render and Neon"
git remote add origin https://github.com/YOUR-ACCOUNT/hlbbusisup-crm.git
git push -u origin main
~~~

GitHub CLI가 로그인된 컴퓨터라면 다음 한 줄로 저장소 생성과 업로드를 함께 할 수 있습니다.

~~~bash
gh repo create hlbbusisup-crm --private --source=. --remote=origin --push
~~~

비밀번호, `DATABASE_URL`, `CRM_ACCESS_KEY`는 절대로 GitHub에 커밋하지 않습니다. `.env` 파일은 `.gitignore`에 포함되어 있습니다.

공식 안내: [기존 로컬 코드를 GitHub에 추가](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

## 2. Neon PostgreSQL 만들기

1. [Neon Console](https://console.neon.tech/)에 로그인합니다.
2. `New project`를 누르고 프로젝트 이름을 `hlbbusisup-crm`으로 지정합니다.
3. Render 서비스와 가까운 리전을 선택합니다. 이 프로젝트의 `render.yaml`은 Singapore 리전을 사용합니다.
4. 프로젝트 Dashboard에서 `Connect`를 누릅니다.
5. 연결 방식은 `Pooled connection`을 선택합니다. 호스트 이름에 `-pooler`가 포함되는지 확인합니다.
6. Database와 Role을 확인한 뒤 연결 문자열 전체를 복사합니다. 끝부분에 `sslmode=require`가 포함되어야 하며, Neon이 `channel_binding=require`도 제공하면 삭제하지 않고 그대로 사용합니다.
7. 이 문자열은 다음 단계에서 Render의 `DATABASE_URL` 비밀 환경변수에만 입력합니다.

서버가 처음 시작될 때 `schema.sql`을 실행하여 `crm_kv` 테이블과 인덱스를 자동 생성합니다. Neon SQL Editor에서 수동으로 실행할 필요는 없습니다.

공식 안내: [Neon 연결 문자열](https://neon.com/docs/connect/connect-from-any-app), [연결 풀링](https://neon.com/docs/connect/connection-pooling)

## 3. CRM 연결키 만들기

`CRM_ACCESS_KEY`는 CRM 사용자와 Render API 사이의 공용 연결키입니다. Neon 비밀번호와는 다른 값입니다.

터미널에서 32바이트 임의 키를 만들 수 있습니다.

~~~bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
~~~

출력된 값을 안전한 암호 관리자에 보관합니다. 이 값은 Render 환경변수와 CRM 첫 접속 화면에 동일하게 입력합니다.

현재 버전은 소규모 내부 팀을 위한 공유 연결키 방식입니다. 사용자별 계정, 권한 분리, 변경 충돌 방지는 포함하지 않습니다.

## 4. Render에 배포하기

1. [Render Dashboard](https://dashboard.render.com/)에 로그인합니다.
2. `New` → `Blueprint`를 선택합니다.
3. GitHub를 연결하고 `hlbbusisup-crm` 저장소 접근을 허용합니다.
4. 저장소를 선택합니다. 루트의 `render.yaml`이 자동으로 인식됩니다.
5. 환경변수 입력 화면에서 아래 두 비밀값을 입력합니다.

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon에서 복사한 pooled connection string |
| `CRM_ACCESS_KEY` | 3단계에서 만든 64자리 임의 키 |

현재 관리자 코드는 서버에서 해시로 검증되며 브라우저 HTML에는 들어 있지 않습니다. 나중에 코드를 바꾸고 싶다면 Render의 `Environment`에 선택 환경변수 `CRM_ADMIN_CODE`를 추가하고 8자 이상의 새 코드를 입력한 뒤 재배포합니다. 환경변수 값은 GitHub에 커밋하지 않습니다.

6. `Apply` 또는 `Create Web Service`를 눌러 배포합니다.
7. Build 로그에서 `npm ci`, Start 로그에서 `HLB-BUSISUP CRM listening on port ...`를 확인합니다.
8. 발급된 주소 뒤에 `/api/health`를 붙여 엽니다. 아래 응답이면 서버와 Neon 연결이 모두 정상입니다.

~~~json
{"status":"ok","database":"connected"}
~~~

9. Render 서비스 주소를 열고 `CRM 연결키`에 `CRM_ACCESS_KEY`를 입력합니다.
10. 화면 상단 `외부 DB · 연결됨` 배지가 초록색인지 확인합니다.

`render.yaml`에는 Singapore 리전, 무료 Web Service, `npm ci`, `npm start`, `/api/health`가 정의되어 있습니다. 유료 플랜을 사용하려면 Render Dashboard 또는 `render.yaml`의 `plan` 값을 변경합니다.

공식 안내: [Render Node/Express 배포](https://render.com/docs/deploy-node-express-app), [환경변수와 비밀값](https://render.com/docs/configure-environment-variables), [Health Check](https://render.com/docs/health-checks)

## 5. 관리자 백업·복원과 기존 데이터 이전

배포된 CRM의 백업·복원은 관리자 인증 뒤에만 사용할 수 있습니다. 백업 파일에는 해당 시점의 전체 저장 데이터와 화면별 입력·수정·삭제 변경 로그가 함께 들어갑니다.

1. Render에 배포된 CRM을 열고 연결키로 접속합니다.
2. `설정` 화면 상단의 `관리자`를 누릅니다.
3. 관리자 코드를 입력하고 `확인`을 누릅니다. 성공하면 `내려받기`, `복원하기` 버튼이 표시됩니다.
4. `내려받기`를 누릅니다. 파일명은 `hlb_busisup_crm_backup_년-월-일_시-분-초.json`입니다. Windows 파일명에서 콜론을 사용할 수 없어 시·분·초 사이에는 하이픈을 사용합니다.
5. JSON의 `summary`에서 데이터·로그 건수와 화면별·동작별 합계를 확인합니다. `data.records`는 복원용 원본 데이터이고 `data.auditLogs`는 시각, 화면, 입력·수정·삭제, 항목, 변경 필드와 전·후 값입니다.
6. 복원할 때는 먼저 현재 상태를 다시 내려받습니다. `복원하기`를 누르고 기존에 내려받은 JSON을 선택한 뒤 확인합니다.
7. 복원이 완료되면 CRM이 새로고침됩니다. 연락처, 파이프라인, 지원 업무, 캘린더와 설정이 백업 시점과 같은지 확인합니다.
8. 기존 단일 HTML에서 만든 버전 2 JSON도 복원할 수 있습니다. 먼저 기존 HTML에서 `전체 백업`을 만든 뒤 배포된 CRM의 관리자 `복원하기`에서 선택합니다.
9. Neon SQL Editor에서 아래 조회로 저장 상태와 최근 변경 로그를 확인할 수 있습니다.

~~~sql
SELECT storage_key, revision, updated_at
FROM crm_kv
WHERE workspace_id = 'hlbbusisup'
ORDER BY updated_at DESC;

SELECT event_at, screen, action, entity_type, entity_label, summary
FROM crm_audit_log
WHERE workspace_id = 'hlbbusisup'
ORDER BY event_at DESC
LIMIT 100;
~~~

복원은 하나의 DB 트랜잭션으로 현재 데이터와 변경 로그 전체를 백업 파일 내용으로 교체합니다. 중간 오류가 나면 기존 상태를 유지합니다. 같은 작업공간에서 만든 버전 3 백업만 허용하며, 복원 성공 자체도 새 변경 로그로 기록합니다.

## 6. Google Calendar 무료 최소 동기화 설정

Google Calendar API의 표준 사용은 현재 추가 비용이 없습니다. 이 CRM은 사용량을 최소화하기 위해 새 직접 일정의 1회 등록과 선택한 달의 일정 조회만 수행합니다. 자동 반복 조회, 전체 일괄 동기화, 이미 전송한 일정의 자동 수정·삭제는 수행하지 않습니다. Google 정책과 할당량은 변경될 수 있으므로 [공식 할당량·가격 안내](https://developers.google.com/workspace/calendar/api/guides/quota)를 운영 중에도 확인합니다.

Render 주소는 기존 로컬 주소와 다른 원본이므로 Google OAuth 설정에 추가해야 합니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 CRM용 프로젝트를 엽니다.
2. Google Calendar API가 활성화되어 있는지 확인합니다.
3. `Google Auth Platform` 또는 `APIs & Services` → `Credentials`에서 사용 중인 OAuth 2.0 웹 클라이언트를 엽니다.
4. `Authorized JavaScript origins`에 Render 주소를 추가합니다. 예: `https://hlbbusisup-crm.onrender.com`
5. 저장 후 CRM의 캘린더에서 `ID 확인 방법`을 눌러 웹 클라이언트 ID를 입력하고 Google 계정을 연결합니다.
6. 테스트 사용자 상태인 OAuth 앱이라면 사용할 Google 계정도 Test users에 포함합니다.

연결 설정을 마친 뒤 공간이 필요하면 `Google Calendar 간편 동기화` 오른쪽의 `접기`를 누릅니다. 제목·연결 상태·`펼치기`만 남고 클라이언트 ID와 연결 버튼은 숨겨집니다. 접기 상태는 외부 DB에 저장되므로 다음 접속에도 유지되며, `펼치기`를 누르면 다시 설정할 수 있습니다.

주소에는 `/calendar` 같은 경로를 넣지 않고 HTTPS 원본만 입력합니다.

연결 후 동작은 다음과 같습니다.

- Google에 아직 보내지 않은 직접 일정을 저장하면 Google 기본 캘린더에 한 번 생성됩니다.
- 이미 Google에 등록된 직접 일정을 CRM에서 다시 저장해도 Google 원본을 자동 수정하지 않고 중복 생성하지 않습니다.
- CRM에서 전송된 일정을 삭제해도 Google 원본은 유지됩니다. 필요한 수정·삭제는 Google Calendar에서 직접 처리합니다.
- `Google 일정 불러오기`는 화면에서 선택한 달만 조회하며, 같은 달은 결과를 재사용합니다. 이전·다음 달로 이동하거나 사용자가 다시 불러오기를 눌렀을 때만 API를 호출합니다.
- Google 액세스 토큰은 영구 저장하지 않습니다. 토큰이 만료되면 계정 연결을 다시 실행합니다.

## 7. 휴대폰 명함 카메라와 OCR 사용

1. 연락처 화면에서 `카메라 스캔`을 누르고 브라우저의 카메라 사용 질문에 `허용`을 선택합니다.
2. 같은 페이지를 열어 둔 동안에는 최초 승인으로 얻은 카메라 스트림을 재사용합니다. 스캐너를 취소하거나 촬영한 뒤 다시 열어도 앱이 `getUserMedia` 권한 요청을 반복하지 않습니다.
3. 브라우저 새로고침·완전 종료 뒤에도 계속 허용하려면 주소창의 사이트 설정에서 이 Render 주소의 카메라 권한을 `허용`으로 지정합니다. 브라우저·운영체제·회사 보안 정책은 앱 코드로 강제할 수 없으며 시크릿 모드나 정책에 따라 다시 물을 수 있습니다.
4. 가로형 명함의 네 모서리를 주황색 프레임에 맞추고 휴대폰을 명함과 평행하게 유지합니다. 명함 글자가 가능한 한 화면을 크게 차지하게 합니다.
5. 저조도, 강한 반사 또는 흐림이 약 1초간 계속 감지되면 화면 위쪽 팝업에 원인과 조치 방법이 표시됩니다. 흐릴 때는 프레임 안의 명함을 한 번 눌러 지원 기기에서 초점을 다시 맞춥니다.
6. `명함 촬영`을 누르면 누른 순간의 프레임을 즉시 고정하고 스캐너를 닫습니다. 고해상도 정지사진 API를 기다리지 않으므로 셔터 지연이나 다른 프레임 저장을 줄입니다.
7. 촬영 뒤에는 브라우저에서 한국어+영어 OCR이 실행됩니다. 전체 이미지의 명암 강화, 선명화, 그림자 보정과 고대비 인식을 수행하고 핵심 정보가 부족하면 이름·회사 상단 영역과 전화·이메일 하단 영역을 추가 인식합니다.
8. OCR이 끝나면 연락처 상세에서 이름, 회사, 부서·직책, 휴대전화·회사전화, 팩스와 이메일을 원본 명함과 비교합니다. 자동 인식 결과는 보조 입력이므로 중요한 값은 반드시 직접 확인합니다.
9. 조명이 부족하면 밝은 곳으로 이동하거나 기기가 지원하는 경우 `조명 켜기`를 사용합니다. 반사가 강하면 휴대폰 또는 명함 각도를 조금 바꾸고, 흐리면 고정한 뒤 화면을 눌러 재초점합니다.

카메라는 HTTPS 또는 localhost에서만 정상적으로 사용할 수 있습니다. 카메라 API를 지원하지 않거나 권한이 차단되면 휴대폰 기본 카메라/이미지 선택 방식으로 자동 전환됩니다. 카메라 스트림을 받았지만 영상 준비가 끝나지 않는 경우에도 최대 6초 뒤 같은 안전한 방식으로 전환합니다. 카메라 오류는 외부 DB 인증과 분리되어 있으므로 `카메라 스캔`을 눌렀다는 이유로 DB 연결창이 다시 열리지 않습니다.

## 8. 일상 운영과 업데이트

- 같은 Render 주소, `CRM_ACCESS_KEY`, `CRM_WORKSPACE_ID`를 사용하는 사람은 같은 Neon 데이터를 사용합니다.
- 상단 메뉴는 `대시보드 · 파이프라인 · 지원 업무 · 연락처 · 캘린더 · 설정` 순서입니다. 모바일 하단 메뉴도 같은 순서를 사용합니다.
- 연락처 목록은 한 화면에 20줄씩 보여 주고 표 아래 페이지 번호로 이동합니다. `«` 첫 페이지, `‹` 이전, `›` 다음, `»` 마지막이며 오른쪽 드롭다운에서 20·30·40·50줄 중에 고릅니다. 고른 줄 수는 외부 DB에 저장되어 다음 접속에도 유지됩니다. 표 머리글의 전체 선택은 지금 보고 있는 페이지만 선택합니다.
- 연락처의 `CSV 내보내기`는 리멤버가 사용하는 Outlook CSV 92개 열 구성 그대로 저장하므로 리멤버에 바로 올릴 수 있습니다. `CSV 업로드`는 리멤버에서 내려받은 파일을 그대로 읽어 이름·회사·부서·직함·휴대전화·이메일·등록일을 같은 입력 칸으로 넣고, 이메일이나 전화가 같은 연락처는 새로 만들지 않고 비어 있는 값만 채웁니다. `2026년 07월 16일` 같은 등록일 표기도 `2026-07-16`으로 통일해 읽습니다.
- 파이프라인 항목 상세의 `고객 담당자 입력`은 직접 입력과 등록된 연락처 선택을 겸하는 콤보박스입니다. 이름을 입력하면 이름·회사·직함·연락처·이메일이 일치하는 등록 연락처만 아래 목록에 나타나고, 목록에서 고르면 이름이 자동으로 완성되면서 직함·연락처·이메일이 함께 채워집니다. 목록에서 고르지 않으면 입력한 이름 그대로 저장되므로 등록되지 않은 담당자도 바로 아래 `고객 담당자 연락처`와 함께 기록할 수 있습니다. `↑`·`↓`와 `Enter`로도 고를 수 있고, 입력창 오른쪽 `▾`를 누르면 전체 목록이 열립니다.
- 항목 상세의 `활동 추가`를 누르면 활동 팝업이 상세 화면보다 앞에 활성화됩니다. 입력·취소·저장 중에는 해당 항목 상세가 닫히지 않으며, 저장 후에도 같은 상세 화면으로 돌아옵니다.
- 저장은 즉시 서버로 전송됩니다. 다른 사용자가 연 화면은 자동 실시간 갱신되지 않으므로 새로고침해야 최신 변경을 확인할 수 있습니다.
- 같은 항목을 동시에 수정하면 마지막 저장이 우선합니다.
- 중요한 변경 전과 정기적으로 관리자가 전체 백업을 내려받아 별도로 보관합니다.
- `main` 브랜치에 새 커밋을 Push하면 Render가 자동 배포합니다.
- 변경 로그는 공용 연결키 방식에서 화면·동작·항목·변경값을 기록합니다. 사용자별 로그인이 없으므로 누가 수정했는지는 구분하지 않습니다.
- 관리자 인증은 브라우저 저장소에 보관하지 않고 기본 30분 뒤 또는 새로고침 시 해제됩니다.

## 9. 로컬 실행과 테스트

1. `.env.example`을 `.env`로 복사합니다.
2. 테스트용 Neon 연결 문자열과 임의 `CRM_ACCESS_KEY`를 입력합니다.
3. 의존성을 설치하고 실행합니다.

~~~bash
npm ci
npm test
npm run dev
~~~

브라우저에서 `http://localhost:3000`을 열고 `.env`의 연결키를 입력합니다.

`npm test`는 실제 Neon이나 Google 계정에 데이터를 만들지 않고 아래 항목을 자동 검증합니다.

- API 상태 확인, 연결키 인증, 저장·조회·수정 revision·삭제
- 관리자 코드 오류 차단, 단기 관리자 세션, 전체 백업 내려받기와 작업공간 검증
- 화면별 입력·수정·삭제 로그, 변경 필드 전·후 값, 이미지 데이터 축약
- 전체 데이터·로그의 시점 복원, 복원 로그와 트랜잭션 처리
- 잘못된 JSON, 과도한 요청 크기, DB 장애 시의 안전한 오류 응답
- 보안 헤더, SPA 직접 접속 경로와 HTML 캐시 정책
- Neon channel binding 전달, 스키마 SQL과 PostgreSQL 저장소 변환
- CRM 화면 초기화, 연락처 추가·자동저장·삭제
- 모든 브라우저 저장·마이그레이션 키의 서버 승인 `tinico:` 접두사와 오타 방지
- HTML의 정적 버튼 107개가 실제 클릭 또는 폼 제출 이벤트를 받는지, 삭제된 버튼 참조와 중복 ID가 없는지
- 상단·모바일 메뉴, 대시보드 키보드 순서 이동, 보드/목록, 도움말·모달 열기/닫기와 입력 검증
- 파이프라인 추가·자동저장·직접 고객 담당자 이름과 연락처 저장·상세창 즉시 닫기·삭제
- 연락처·활동 기록·지원 업무·단계·그룹 분류·그룹·내장 매뉴얼의 추가·수정·삭제와 휴지통 복원, 활동 팝업을 여는 동안 항목 상세 유지
- 관리자 인증 전 버튼 잠금, 인증 후 버튼 노출과 `년-월-일_시-분-초` 파일명
- 캘린더 추가·수정·삭제, 저장 실패 후 복구와 재시도
- 모의 Google Calendar API를 통한 새 일정 1회 생성, 이벤트 ID 저장, 선택 월 조회 캐시와 수동 새로고침, 간편 동기화 접기 상태 저장
- 이미 전송한 CRM 일정 수정·삭제 시 Google API를 추가 호출하지 않는 무료 최소 동기화 정책
- 변경된 `CRM_ACCESS_KEY` 재연결과 동적 HTML 속성 안전성
- 카메라 최초 권한 스트림 재사용, 저조도 품질 팝업, 확인창 없는 즉시 촬영과 스트림 수명주기
- 카메라 권한 거부·API 미지원·영상 준비 시간 초과 시 파일 촬영 전환과 DB 연결창 비노출
- OCR CDN·언어 데이터·웹 워커용 보안 정책과 모바일 다단계 이미지 전처리 경로

현재 자동 테스트 결과는 29건 통과, 실패 0건이며 `npm audit` 결과 알려진 취약점은 0건입니다.

실제 Render·Neon·Google OAuth 연결은 비밀 환경변수와 사용자 승인이 필요한 운영 통합 테스트이므로, 배포 후 `/api/health`와 아래 문제 해결 표를 따라 한 번 더 확인합니다.

## 문제 해결

| 증상 | 확인할 내용 |
|---|---|
| `/api/health`가 500 | Render의 `DATABASE_URL`, Neon 프로젝트 상태, 연결 문자열의 `sslmode=require` |
| 첫 화면에서 연결키 오류 | Render `CRM_ACCESS_KEY`와 입력값이 완전히 같은지 확인 |
| 카메라를 눌렀는데 외부 DB 창이 표시됨 | 최신 배포 완료 여부를 확인하고 강력 새로고침. 새 버전에서는 카메라 오류와 DB 인증을 분리했으며 `UI-BIND`/`UI-DATA`는 연결키 대신 화면 새로고침과 Render 로그 확인 |
| `화면 초기화 오류`가 표시됨 | 연결키를 반복 입력하지 말고 `화면 새로고침`을 누른 뒤, 계속되면 화면의 오류 코드와 발생 시각을 Render 로그와 함께 확인 |
| Render 빌드 실패 | Events의 Deploy 로그, Node 버전, `npm ci` 오류 |
| 저장 후 데이터가 안 보임 | 상단 외부 DB 배지, 브라우저 Network의 `/api/storage/...` 응답, 새로고침 |
| `활동 추가` 팝업이 보이지 않음 | 최신 배포 여부와 강력 새로고침을 확인. 새 버전은 활동 팝업을 항목 상세보다 높은 화면 층에 표시하고 상세 화면을 유지 |
| 관리자 코드가 거절됨 | 대소문자·숫자·특수문자, 선택 환경변수 `CRM_ADMIN_CODE` 변경 여부, Render 재배포 상태 |
| 백업 복원이 거절됨 | HLB-현장지원팀 CRM JSON인지, 버전 2 또는 같은 작업공간의 버전 3 백업인지 확인 |
| Google 로그인이 거절됨 | Render HTTPS 원본 등록, OAuth 클라이언트 유형이 Web application인지, Test users |
| CRM 수정·삭제가 Google에 반영되지 않음 | 정상 동작입니다. 무료 최소 동기화는 새 일정 1회 등록과 선택 월 조회만 수행하므로 Google 원본에서 직접 수정·삭제 |
| 무료 서비스 첫 접속이 느림 | Render 무료 인스턴스 재기동 대기 후 `/api/health` 재확인 |

Render의 문제는 먼저 Deploy/Runtime 로그에서 요청 ID와 오류를 확인합니다. 서버 오류 응답에는 로그와 대조할 수 있는 `requestId`가 포함됩니다.

## 보안 주의사항

- `DATABASE_URL`은 브라우저 코드나 GitHub에 절대 넣지 않습니다.
- `CRM_ACCESS_KEY`는 32바이트 이상의 임의값을 사용하고 암호 관리자로 공유합니다.
- 관리자 코드도 담당자에게만 공유하고 GitHub, 화면 캡처와 업무 메신저에 평문으로 남기지 않습니다. 필요하면 Render의 `CRM_ADMIN_CODE`로 교체합니다.
- 연결키가 노출되면 Render에서 즉시 새 값으로 변경한 뒤 사용자 브라우저에서도 다시 입력합니다.
- 현재 변경 로그는 화면과 데이터 변경을 기록하지만 공용 연결키 사용자를 개별 식별하지 않습니다. 사용자별 책임 추적이 필요하면 정식 로그인과 역할 기반 접근 제어를 추가해야 합니다.
- Neon과 Render 계정에는 다중 요소 인증을 설정합니다.
