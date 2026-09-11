/* HLB-현장지원팀 CRM 로직 — index.html에서 분리 */
/* CRM 영업 단계 */
let STAGE_OPTIONS = ["리드","상담","제안","협상","수주","보류","실주"];
let STAGE_COLORS = {리드:"#A79E9D", 상담:"#3B6FA8", 제안:"#C2762A", 협상:"#7A5B9B", 수주:"#059669", 보류:"#D97706", 실주:"#DC2626"};
/* 수주율·확률·마감 판정 로직이 이름으로 직접 참조하는 기본 단계 — 이름 변경·삭제 불가 */
const RESERVED_STAGES = ["수주","보류","실주"];
const RESERVED_STAGE_COLORS = {수주:"#059669", 보류:"#D97706", 실주:"#DC2626"};
const LEGACY_STATUS_MAP = {"검토중":"리드","진행중":"제안","완료":"수주","보류":"보류"};
function normalizeStage(s){
  if(STAGE_OPTIONS.includes(s)) return s;
  /* 알 수 없는 단계는 마감 단계(수주·보류·실주)가 아닌 첫 진행 단계로 보정 */
  return LEGACY_STATUS_MAP[s] || STAGE_OPTIONS.find(x=>!RESERVED_STAGES.includes(x)) || STAGE_OPTIONS[0] || "리드";
}

const MODULES = [
  {key:"home",     label:"대시보드"},
  {key:"pipeline", label:"파이프라인"},
  {key:"activity", label:"활동"},
  {key:"roadmap",  label:"지원 업무"},
  {key:"contacts", label:"연락처"},
  {key:"calendar", label:"캘린더"},
  {key:"settings", label:"설정"},
];

const PALETTE = [
  {color:"#C7382D", colorSoft:"#FFF2F0"},
  {color:"#3B6FA8", colorSoft:"#EFF4F9"},
  {color:"#2F7F79", colorSoft:"#ECF6F5"},
  {color:"#C2762A", colorSoft:"#FBF2E6"},
  {color:"#7A5B9B", colorSoft:"#F4F0F8"},
  {color:"#3F7F5B", colorSoft:"#EDF5F0"},
];

let REVENUE_BUCKETS = {
  direct:{key:"direct", label:"매출 직결", desc:"기존 거래처, 단기 발주, 견적·수주 전환이 가까운 그룹", weight:1.25},
  future:{key:"future", label:"추후 매출 가능", desc:"샘플 검증, 해외 채널, 전략 후보 등 향후 매출 가능성이 있는 그룹", weight:1.0},
  support:{key:"support", label:"연구·검토·지원", desc:"연구, 홍보자료, 국책·재무 확인처럼 직접 매출과 거리가 있는 그룹", weight:0.6},
};
let BUCKET_ORDER = ["direct","future","support"];
const DEFAULT_IMPORTANCE_CONFIG = {
  highScore:50, highAmount:100, highProb:80,
  midScore:10, midProb:50,
  bucketWeights:{direct:1.25, future:1.0, support:0.6},
  stageWeights:{리드:0.7, 상담:0.9, 제안:1.1, 협상:1.3, 수주:1.0, 보류:0.5, 실주:0},
};
let importanceConfig = JSON.parse(JSON.stringify(DEFAULT_IMPORTANCE_CONFIG));

const LEGACY_DEFAULT_AREAS = [
  {
    key:"existing_accounts", bucket:"direct", icon:"", color:"#059669", colorSoft:"#ECFDF5",
    title:"기존 거래처·단기매출", subtitle:"추가 발주와 매출 전환 우선",
    seed:[
      {id:"defense_ring", title:"방산용 열수축링 기존 품목 점검", tag:"기존 매출 / 방산", stage:"제안",
       contactName:"", contactRole:"구매팀", contactPhone:"", contactEmail:"",
       amount:"", prob:"70", lastContact:"", nextAction:"2026-07-25",
       desc:"현재 매출 기반이 되는 기존 품목. 거래처별 물량, 단가, 납기와 재주문 가능성을 확인한다.", goal:"3개월 내 현금화 가능한 품목과 고객을 우선 정리", action:"최근 발주 이력과 하반기 예상 물량을 HLB-현장지원팀로부터 수령", internalNote:"단가 조정은 매출 증가뿐 아니라 공헌이익과 가격 정상화 가능성까지 함께 확인"},
      {id:"existing_wire_spring", title:"기존 와이어·스프링 납품처 확대", tag:"기존 거래처 / 추가 발주", stage:"상담",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"50", lastContact:"", nextAction:"2026-07-29",
       desc:"기존 소량 납품처 중 추가 발주 또는 적용 품목 확대 가능성이 있는 고객을 선별한다.", goal:"신규 장기 과제보다 단기 매출 가능성이 높은 기존 고객을 먼저 확보", action:"거래처별 최근 컨택, 샘플 이력, 예상 물량, 장애요인을 CRM에 입력", internalNote:"고객별 공개 가능 사례와 비공개 정보를 분리해 홍보자료와 혼선이 없도록 관리"}
    ]
  },
  {
    key:"sample_validation", bucket:"future", icon:"", color:"#3B6FA8", colorSoft:"#EFF4F9",
    title:"샘플·검증 진행건", subtitle:"시험 장기화 건의 다음 액션 관리",
    seed:[
      {id:"medical_electronics_tests", title:"의료·전자 고객 샘플 시험 현황 정리", tag:"샘플 / 고객 검증", stage:"상담",
       contactName:"", contactRole:"기술·구매 담당", contactPhone:"", contactEmail:"",
       amount:"", prob:"40", lastContact:"", nextAction:"2026-07-31",
       desc:"니티놀은 고객사의 시험과 검증 기간이 길어 협의가 실제 매출로 이어지기까지 시간이 필요하다.", goal:"검증 중인 건별로 매출 전환 가능 시점과 병목을 명확히 관리", action:"샘플 제공일, 시험 항목, 고객 담당자, 다음 회신 예정일을 건별 입력", internalNote:"NDA, 고객사명 공개 가능 여부, 시험자료 공개 가능 범위를 함께 확인"},
      {id:"oem_custom_process", title:"니티놀 OEM 맞춤가공 문의 대응 표준화", tag:"OEM / 맞춤 가공", stage:"리드",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"30", lastContact:"", nextAction:"2026-08-02",
       desc:"원재료부터 가공·OEM까지 대응 가능한 제조 역량을 문의 전환에 활용한다.", goal:"신규 문의가 들어왔을 때 검토 누락 없이 빠르게 견적·샘플 단계로 전환", action:"형상, 규격, 수량, 공차, 용도, 납기, 비밀유지 필요 여부 등 필수 문의 항목 정리", internalNote:"불명확한 문의는 바로 견적보다 기술 미팅 또는 샘플 조건 확인으로 유도"}
    ],
  },
  {
    key:"marketing_assets", bucket:"support", icon:"", color:"#2F7F79", colorSoft:"#ECF6F5",
    title:"홍보자료·온라인 문의", subtitle:"회사·제품 자료 정비 및 문의 확보",
    seed:[
      {id:"company_materials", title:"최신 회사소개서·제품사진 수령", tag:"자료 확보 / 공개등급", stage:"제안",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"60", lastContact:"", nextAction:"2026-07-24",
       desc:"홈페이지, 블로그, 영상, 해외 채널에 사용할 회사·제품·공정 자료를 먼저 확보한다.", goal:"고객이 HLB-현장지원팀 제조 역량을 쉽게 이해할 수 있는 홍보 기반 마련", action:"제품 사진, 원재료·중간재·완제품, 설비·공정 이미지, 시험자료, 공개 가능 등급 요청", internalNote:"검증되지 않은 최상급 표현과 공개 불가 고객사명은 사용하지 않도록 사전 확인"},
      {id:"homepage_content", title:"홈페이지·블로그·LinkedIn 콘텐츠 정비", tag:"온라인 노출 / 문의 전환", stage:"리드",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"35", lastContact:"", nextAction:"2026-08-05",
       desc:"HLB-현장지원팀와 니티놀의 활용 가능성을 꾸준히 노출하여 신규 문의를 늘린다.", goal:"조회수보다 유효 문의, 샘플 요청, 기술 미팅, 견적 전환을 KPI로 관리", action:"회사 신뢰, 제품군, 응용 분야, 문의 절차 중심으로 1차 콘텐츠 6건 기획", internalNote:"홍보 콘텐츠는 고객 문제와 HLB-현장지원팀의 해결 가능성을 짧고 명확하게 설명"},
      {id:"ai_video_intro", title:"AI 영상·제품 소개 콘텐츠 1편 제작", tag:"영상 / 제조역량", stage:"리드",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"30", lastContact:"", nextAction:"2026-08-09",
       desc:"니티놀 원재료, 합금 조성, 와이어·판재·튜브·스프링, OEM 가공 흐름을 시각화한다.", goal:"영업 초기 단계에서 HLB-현장지원팀의 제조 범위를 빠르게 설명할 자료 확보", action:"공개 가능한 사진·영상 소스를 받은 뒤 1분 내외 소개 영상 초안 제작", internalNote:"기술수치와 인증 표현은 근거 자료 확인 후 반영"}
    ],
  },
  {
    key:"gov_finance", bucket:"support", icon:"", color:"#D97706", colorSoft:"#FEF3C7",
    title:"국책과제·재무 확인", subtitle:"자본잠식·비용 구조 확인",
    seed:[
      {id:"capital_impairment", title:"자본잠식에 따른 국책과제 참여 제한 확인", tag:"자본잠식 / 국책과제", stage:"상담",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"80", lastContact:"", nextAction:"2026-07-25",
       desc:"HLB-현장지원팀는 자본잠식으로 은행 업무와 국책과제 신청·수행에 제한이 있다고 설명했다.", goal:"참여 제한 요건, 현재 과제 영향, 예외·보완 가능성, 재신청 조건을 확인", action:"관련 부서에 발생 원인, 해소 수단, 예상 일정, 사업 참여 영향 확인 요청", internalNote:"HLB-현장지원팀 설명상 실적 부진보다 지분 양도 과정의 회계상 영향이라는 점을 함께 확인"},
      {id:"finance_costs", title:"재무·회계 지원비 및 공통비 부담 기준 확인", tag:"비용 구조 / 내부 확인", stage:"리드",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"50", lastContact:"", nextAction:"2026-07-30",
       desc:"재무·회계 지원비, 외부 기장비, 겸직 인력비, 그룹 공통비 부담 기준 확인 요청이 있었다.", goal:"비용 부담 근거와 조정 필요성을 항목별로 정리", action:"항목별 담당부서, 산정 근거, 중복 여부, 조정 가능성을 확인", internalNote:"HLB-현장지원팀 측 공유용 답변은 사실 확인 후 별도 정리"}
    ],
  },
  {
    key:"medical_strategy", bucket:"future", icon:"", color:"#7A5B9B", colorSoft:"#F4F0F8",
    title:"의료기기·완제품 검토", subtitle:"허가·시장성 별도 검토 트랙",
    seed:[
      {id:"medical_finished_device", title:"의료기기 완제품 사업성 검토 미팅", tag:"완제품 / 전략 검토", stage:"리드",
       contactName:"", contactRole:"전략·전문 임원", contactPhone:"", contactEmail:"",
       amount:"", prob:"25", lastContact:"", nextAction:"2026-08-07",
       desc:"의료기기 완제품은 허가와 검증 기간이 길어 단기 매출 과제와 분리해 검토한다.", goal:"시장성, 경쟁, 허가, 투자, 수익성, 그룹 시너지 기준으로 후보 1~2개 선별", action:"관련 전문 임원 및 전략부서 미팅을 연결하고 사전 안건을 정리", internalNote:"단기 영업지원 실행을 지연시키지 않도록 별도 트랙으로 관리"},
      {id:"network_candidates", title:"의료기기·소재 네트워크 연결 후보 정리", tag:"그룹 네트워크 / 강소기업협회", stage:"리드",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"30", lastContact:"", nextAction:"2026-08-10",
       desc:"그룹 네트워크와 강소기업협회 등을 활용해 의료기기·소재 관련 업체 연결 가능성을 검토한다.", goal:"HLB-현장지원팀가 바로 접촉 가능한 협력 후보 목록 확보", action:"의료기기 도매·제조사, 소재 적용 가능 기업, 내부 수요처 후보를 정리", internalNote:"소개 전에는 HLB-현장지원팀가 제공 가능한 제품·기술 범위와 공개자료를 먼저 확정"}
    ],
  },
  {
    key:"global_channel", bucket:"future", icon:"", color:"#B4517A", colorSoft:"#F9EFF4",
    title:"해외채널·알리바바", subtitle:"최소비용 해외 문의 테스트",
    seed:[
      {id:"alibaba_check", title:"알리바바 입점 비용·운영조건 확인", tag:"해외 문의 / 비용 검토", stage:"상담",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"50", lastContact:"", nextAction:"2026-07-28",
       desc:"해외 문의 확보 가능성을 보기 위해 알리바바 입점 비용과 운영조건을 확인한다.", goal:"최소 비용으로 테스트 가능한 해외 채널 실행안 마련", action:"가입비, 수수료, 상품 등록 방식, 문의 응대 담당, KPI 기준을 조사", internalNote:"KPI는 조회수보다 유효 문의, 샘플 요청, 견적, 기술 미팅으로 관리"},
      {id:"english_inquiry_template", title:"영문 제품 문의 응대 템플릿 작성", tag:"영문 문의 / 응대 기준", stage:"리드",
       contactName:"", contactRole:"", contactPhone:"", contactEmail:"",
       amount:"", prob:"30", lastContact:"", nextAction:"2026-08-04",
       desc:"해외 문의 발생 시 필요한 기술 조건을 빠짐없이 확인할 수 있도록 응대 양식을 준비한다.", goal:"문의 수신 후 초기 답변 시간을 줄이고 기술 검토 품질을 균일화", action:"제품군별 필수 확인 항목과 회신 템플릿을 작성", internalNote:"답변 가능 언어, 담당자, 목표 응답시간을 HLB-현장지원팀와 사전에 확정"}
    ],
  },
];

/* 이전 버전의 예시 영업 항목은 지원 업무와 중복되고 필수 정보가 비어 있어 신규 파이프라인에는 넣지 않습니다. */
const DEFAULT_AREAS = LEGACY_DEFAULT_AREAS.map(area=>({...area,seed:[]}));
const LEGACY_PIPELINE_SEED_BY_ID = new Map(
  LEGACY_DEFAULT_AREAS.flatMap(area=>(area.seed||[]).map(item=>[item.id,{areaKey:area.key,item}]))
);

const SUPPORT_TASK_TYPES = ["자료 확보","홍보·콘텐츠","내부 확인","영업 기반","시스템·데이터","기타"];
const SUPPORT_TASK_STATUSES = ["미착수","진행중","검토대기","완료","보류"];
const SUPPORT_TASK_PRIORITIES = ["높음","중간","낮음"];
const ROADMAP_SEED = [
  {id:"internal_report", title:"회의 결과 내부 보고 및 확인 요청", type:"내부 확인", purpose:"회의에서 확인된 자본잠식·국책과제·비용 구조 이슈의 담당부서와 대응 방향을 명확히 합니다.", deliverable:"담당부서, 회신기한, 확인 결과가 정리된 내부 보고 자료", owner:"", collaborators:"재무·회계 및 관련 부서", status:"미착수", priority:"높음", startDate:"", dueDate:"", progress:0, nextAction:"담당부서와 회신 요청 항목을 확정", blocker:"", notes:""},
  {id:"request_materials", title:"HLB-현장지원팀 자료 요청·공개등급 확정", type:"자료 확보", purpose:"홈페이지·영업자료·해외 홍보에 사용할 신뢰도 높은 자료를 확보합니다.", deliverable:"회사소개서, 제품·공정 사진, 시험성적서 및 자료별 공개 가능 등급 목록", owner:"", collaborators:"HLB-현장지원팀 대표 및 기술 담당", status:"미착수", priority:"높음", startDate:"", dueDate:"", progress:0, nextAction:"필요 자료 목록과 공개 범위 확인표 전달", blocker:"고객사명과 시험자료의 외부 공개 가능 범위 확인", notes:""},
  {id:"pipeline_mapping", title:"거래처·제품군별 매출 및 영업 현황 입력", type:"시스템·데이터", purpose:"단기 매출 가능 고객과 장기 검증 건을 구분하여 다음 영업 행동이 누락되지 않게 합니다.", deliverable:"고객·제품별 단계, 예상매출, 확률, 내부 담당자, 다음 액션일이 입력된 CRM", owner:"", collaborators:"HLB-현장지원팀 영업·기술 담당", status:"미착수", priority:"높음", startDate:"", dueDate:"", progress:0, nextAction:"기존 거래처와 진행 중 샘플 목록 수령", blocker:"최근 접촉일과 예상 물량 자료 부족", notes:""},
  {id:"content_plan", title:"홍보 콘텐츠 1차 기획", type:"홍보·콘텐츠", purpose:"HLB-현장지원팀의 제조 역량과 제품 적용 가능성을 고객이 짧은 시간 안에 이해하도록 합니다.", deliverable:"회사 신뢰, 제품군, 응용분야, 문의 전환을 주제로 한 콘텐츠 기획안과 우선 제작 목록", owner:"", collaborators:"HLB-현장지원팀 및 콘텐츠 담당", status:"미착수", priority:"중간", startDate:"", dueDate:"", progress:0, nextAction:"공개 가능한 사진·영상 소스 확인", blocker:"기술 수치와 인증 표현의 근거자료 확인 필요", notes:""},
  {id:"alibaba_plan", title:"알리바바 해외 문의 테스트 실행안 작성", type:"영업 기반", purpose:"최소 비용으로 해외 유효 문의와 샘플 요청 가능성을 검증합니다.", deliverable:"입점 비용, 운영조건, 상품 등록안, 문의 응대 담당, KPI가 포함된 실행안", owner:"", collaborators:"HLB-현장지원팀 해외영업 담당", status:"미착수", priority:"중간", startDate:"", dueDate:"", progress:0, nextAction:"비용·수수료·계정 운영 조건 조사", blocker:"영문 문의 대응 담당과 목표 응답시간 미확정", notes:""},
  {id:"network_list", title:"그룹 네트워크 연결 후보 정리", type:"영업 기반", purpose:"HLB-현장지원팀 제품과 기술을 소개할 수 있는 의료기기·소재 관련 잠재 협력사를 확보합니다.", deliverable:"연결 사유, 예상 수요, 소개 가능 담당자가 포함된 후보 기업 목록", owner:"", collaborators:"그룹 전략조직 및 관련 네트워크", status:"미착수", priority:"중간", startDate:"", dueDate:"", progress:0, nextAction:"후보군 선정 기준과 소개 자료 확정", blocker:"HLB-현장지원팀 제공 가능 제품·기술 범위 자료 필요", notes:""},
  {id:"next_meeting_questions", title:"다음 회의 확인 질문 준비", type:"내부 확인", purpose:"회의에서 필요한 사실과 의사결정을 한 번에 확보하여 후속 업무 지연을 줄입니다.", deliverable:"3개월 내 매출 전환 품목, 공개 가능 자료, 장애요인, 담당자와 기한을 묻는 질문지", owner:"", collaborators:"회의 참석자", status:"미착수", priority:"중간", startDate:"", dueDate:"", progress:0, nextAction:"미확인 사항과 결정 필요 항목 취합", blocker:"", notes:""},
];

const DEFAULT_MANUAL_SECTIONS = [
  {
    "id": "manual_flow",
    "category": "시작하기",
    "title": "처음 사용하는 순서",
    "format": "list",
    "content": "1. Render로 배포된 CRM 주소를 열고 외부 DB 연결 창에 CRM_ACCESS_KEY를 입력합니다. Neon 비밀번호나 DATABASE_URL을 입력하는 곳이 아닙니다.\n2. 화면 위쪽 외부 DB 표시가 초록색 ‘연결됨’인지 확인합니다.\n3. 연락처에서 고객 담당자를 추가하고, 파이프라인의 ‘+ 새 항목’에서 실제 영업 건을 등록합니다.\n4. 영업 상세에서 단계, 내부 담당자, 고객 담당자의 이름·연락처, 예상 매출, 다음 할 일과 다음 연락일을 입력합니다. 입력 후 상단 ‘저장’을 누르고 ‘저장됨’ 표시를 확인합니다.\n5. 전화·이메일·미팅 후에는 ‘활동 추가’를 누릅니다. 팝업이 상세 화면 위에 열리며 입력하는 동안 원래 상세 화면은 그대로 유지됩니다.\n6. 회사소개서 제작이나 내부 확인처럼 고객과 직접 진행하지 않는 일은 지원 업무에 등록합니다.\n7. 직접 일정은 캘린더에서 추가·수정·삭제합니다. Google Calendar 간편 동기화 영역은 ‘접기/펼치기’로 열고 닫을 수 있으며, 연결하면 아직 전송하지 않은 직접 일정을 처음 저장할 때 한 번 등록하고 선택한 달의 Google 일정을 필요할 때만 불러옵니다.\n8. 매일 업무 시작 시 대시보드의 오늘 할 일과 영업지원 브리핑을 확인합니다. 빨간 ‘긴급’ 배지가 깜빡이면 우선 처리합니다.\n9. 업무 종료 전 ‘저장 실패’ 표시가 없는지 확인합니다. 중요한 변경 전후에는 설정의 ‘관리자’를 눌러 인증한 뒤 데이터와 변경 로그가 포함된 백업을 내려받습니다."
  },
  {
    "id": "manual_terms",
    "category": "기본 개념",
    "title": "CRM 핵심 용어",
    "format": "list",
    "content": "외부 DB 연결키: 같은 CRM 작업공간에 들어가기 위한 공용 접속키입니다. Render의 CRM_ACCESS_KEY 값이며 Neon 비밀번호와 다릅니다.\n파이프라인: 실제 고객사별 영업 진행 상태, 예상 매출과 다음 연락 일정을 관리하는 화면입니다.\n그룹: 영업 건의 업무 영역입니다. 목록의 왼쪽 색상선과 보드 카드 상단 색상으로 구분합니다.\n매출 분류: 매출 직결, 추후 매출 가능, 연구·검토·지원처럼 매출과의 거리를 나타내는 배지입니다.\n중요도: 예상 매출, 단계와 성사 확률 등을 반영한 높음·중간·낮음 표시입니다.\n단계: 리드, 상담, 제안, 협상, 수주, 보류, 실주로 현재 진행 상태를 나타냅니다.\n예상 매출: 영업이 성사될 경우의 예상 금액이며 백만원 단위로 입력합니다.\n다음 연락일: 다시 연락하거나 자료를 전달할 날짜이며 오늘 할 일, 긴급 알림과 캘린더의 기준입니다.\n활동 기록: 전화, 이메일, 미팅의 내용과 결과를 시간순으로 남긴 이력입니다.\n지원 업무: 자료 제작, 제도 확인 등 고객 영업을 위해 내부에서 처리하는 업무입니다.\n저장: 파이프라인·연락처는 저장 버튼으로 입력값을 외부 DB에 반영합니다. ‘저장 중’ 다음 ‘저장됨’이 표시되어야 완료된 것입니다."
  },
  {
    "id": "manual_dashboard",
    "category": "대시보드",
    "title": "대시보드 확인 방법",
    "format": "list",
    "content": "상단 메뉴는 대시보드·파이프라인·지원 업무·연락처·캘린더·설정으로 이동하는 버튼입니다. 외부 DB 배지가 초록색 ‘연결됨’이면 저장 서버가 정상입니다.\n요약 카드에서 전체 영업 건수, 진행 상태와 예상 매출을 확인합니다. 파이프라인 분석 지표를 누르면 계산 대상 목록이 팝업으로 열립니다.\n오늘 할 일에는 다음 연락일이 지났거나 임박한 영업 건과 마감이 가까운 지원 업무가 표시됩니다. 항목을 누르면 원본 상세 화면이 열립니다.\n영업지원 브리핑은 긴급·주의·제안 항목을 모아 보여줍니다. 긴급 항목이 있을 때는 브리핑 전체가 아니라 빨간색 ‘긴급’ 배지만 깜빡입니다.\n화면 오른쪽 아래 AI 봇 아이콘의 숫자는 즉시 확인할 긴급 항목 수입니다.\n오늘 할 일은 접거나 펼칠 수 있고, 각 영역의 이동 손잡이로 대시보드 순서를 바꿀 수 있습니다.\n숫자가 예상과 다르면 외부 DB 연결 상태를 확인한 뒤 새로고침하여 다른 사용자의 최신 변경을 불러옵니다.\n[현재 화면 안내] 화면 배치와 메뉴 구성은 유지하고 HLB 로고의 붉은색(#EF4036)과 차콜·흰색을 적용했습니다. 제목·메뉴는 굵은 Pretendard로 표시합니다. 우측 상단 ‘간편 모드’ 표시는 없습니다. 붉은 저장 버튼·선택 표시는 일반 조작 상태이며, 지연·오류는 문구와 상태 배지를 함께 확인합니다. 파이프라인 분석의 수주율·활성 항목 비중·후속조치 지연·실행과제 완료를 누르면 목록이 열리고, 항목을 누르면 파이프라인 또는 지원 업무 상세로 이동합니다. 수주율 목록은 수주·보류·실주, 실행과제 완료 목록은 전체 과제를 표시합니다."
  },
  {
    "id": "manual_pipeline",
    "category": "파이프라인",
    "title": "파이프라인 화면과 영업 항목 관리",
    "format": "list",
    "content": "파이프라인은 실제 고객사 또는 구체적인 영업 기회만 등록합니다. 같은 고객·제품·목적의 중복 항목과 제목·담당자·다음 할 일이 없는 빈 항목은 만들지 않습니다.\n목록 보기의 각 행은 하나의 영업 건입니다. 왼쪽 색상선은 그룹, 둥근 배지는 그룹·매출 분류·중요도·담당자를 뜻합니다. 단계, 예상 매출, 다음 연락일과 다음 할 일은 목록에서 바로 수정할 수 있습니다.\n보드 보기는 영업 단계를 열로 나눕니다. 카드를 다른 열로 끌어 놓으면 상세 화면이 열립니다. 변경할 단계와 성사 확률을 확인하고 저장해야 반영됩니다.\n상단 검색창은 고객사·제품·이슈·담당자를 검색하며 내부 담당자와 단계 필터로 범위를 좁힙니다. ‘목록/보드’ 버튼으로 보기를 바꿉니다.\n‘+ 새 항목’을 누른 뒤 제목, 그룹과 기본 단계부터 입력합니다. 상세 화면의 필수 입력 막대가 채워지도록 내부 담당자, 고객 담당자, 예상 매출, 다음 연락일과 다음 할 일을 입력합니다. ‘고객 담당자 입력’에 이름을 입력하면 등록된 연락처 중 일치하는 사람이 목록에 나타나고, 목록에서 고르면 ‘선택한 담당자’에 이름과 연락처가 쌓입니다. 여러 명을 고를 수 있고 맨 위 대표 담당자의 직함·연락처·이메일이 입력칸에 반영됩니다. 등록되지 않은 담당자는 이름과 바로 아래 ‘고객 담당자 연락처’를 직접 기록합니다.\n입력 중에는 ‘미저장 변경’, 저장 버튼을 누르면 ‘저장 중…’, 성공하면 ‘저장됨’이 표시됩니다. ‘저장 실패’가 보이면 상세 화면을 닫지 말고 네트워크와 외부 DB 상태를 확인한 뒤 입력을 유지한 채 저장 버튼으로 재시도합니다.\n상세 화면의 X 버튼이나 바깥 영역으로 닫을 수 있습니다. 미저장 변경이 있으면 버릴지 확인하고, 저장 중에는 완료될 때까지 닫을 수 없습니다.\n전화·이메일·미팅 후에는 ‘활동 추가’를 눌러 결과를 남깁니다. 활동 팝업은 상세 화면보다 위에서 활성화되며 입력·취소·저장 중에도 상세 화면은 닫히지 않습니다. 저장하면 활동 목록과 다음 할 일·다음 연락일이 갱신됩니다.\n자료 제작·제도 확인·내부 검토처럼 고객과 직접 진행하지 않는 일은 지원 업무에 등록합니다.\n[입력·저장 기준] 내부 담당자 입력 예시는 ‘홍길동’입니다. 새 항목과 상세 변경은 상단 저장, 표 수정은 해당 행의 저장 버튼으로 반영합니다. 고객 담당자는 여러 명 선택할 수 있으며 ‘대표로 지정’ 변경도 저장해야 유지됩니다. 선택한 담당자의 이름과 연락처는 고객 담당자 연락처 아래에 표시됩니다. 저장 전 값은 대시보드 집계에 반영되지 않습니다. 활동 추가·지원 업무 연결·전환은 영업 항목을 먼저 저장한 뒤 사용합니다."
  },
  {
    "id": "manual_stages",
    "category": "파이프라인",
    "title": "영업 단계 사용 기준",
    "format": "list",
    "content": "리드(자동 확률 10%): 고객 또는 영업 가능성을 처음 확인한 상태입니다.\n상담(자동 확률 30%): 고객 요구사항, 적용 가능성 또는 첫 미팅을 진행하는 상태입니다.\n제안(자동 확률 50%): 견적, 제안서, 샘플 또는 조건을 전달한 상태입니다.\n협상(자동 확률 70%): 가격, 납기, 규격 또는 계약 조건을 조율하는 상태입니다.\n수주(자동 확률 100%): 발주서, 계약 또는 구매 의사가 확정된 상태입니다.\n보류(자동 확률 10%): 현재는 멈췄으나 재개 가능성이 있어 재확인 날짜를 관리하는 상태입니다.\n실주(자동 확률 0%): 고객 거절이나 경쟁사 선정 등으로 종료된 상태입니다.\n단계를 변경하면 성사 확률도 자동으로 변경됩니다. 단계 기준을 임의로 다르게 해석하지 말고 모든 사용자가 동일하게 적용합니다."
  },
  {
    "id": "manual_contacts",
    "category": "연락처",
    "title": "연락처와 명함 관리",
    "format": "list",
    "content": "‘+ 연락처 추가’에서 직접 입력하거나 카메라 스캔·명함 이미지 업로드로 등록합니다. 이름과 회사명을 우선 입력하면 영업 건 연결과 검색이 쉬워집니다.\n카메라 스캔을 처음 열 때 카메라 사용을 허용합니다. 같은 페이지를 열어 둔 동안에는 승인받은 카메라를 재사용하므로 다시 스캔해도 권한을 반복 요청하지 않습니다. 새로고침하거나 브라우저를 완전히 닫은 뒤에도 계속 허용하려면 브라우저의 이 사이트 권한에서 카메라를 ‘허용’으로 설정합니다.\n가로형 명함의 네 모서리를 프레임에 맞추고 카메라를 명함과 평행하게 유지합니다. 조명 부족·강한 반사·흐림이 약 1초간 계속되면 화면 위쪽에 원인과 조치 방법이 표시됩니다. 흐릴 때는 명함 화면을 한 번 눌러 다시 초점을 맞춥니다.\n‘명함 촬영’을 누르면 그 순간의 화면이 즉시 촬영되고 스캐너가 닫힙니다. 문자 인식 결과를 확인하고 연락처 상세의 ‘저장’을 눌러 등록합니다.\nOCR은 조명·그림자·고대비 보정 후 이름·회사 영역과 전화·이메일 영역을 필요할 때 추가 인식합니다. 결과의 이름, 회사명, 전화번호와 이메일은 원본 명함과 비교하여 반드시 확인합니다. 검색 결과는 참고용이며 자동 입력되지 않습니다.\n목록의 검색창은 이름·회사·직함·연락처를 찾습니다. 행을 누르면 상세 화면에서 명함 이미지, 기본 정보, 연결 영업 건과 활동 이력을 확인할 수 있습니다.\n상세 입력은 상단 ‘저장’을 눌러 반영합니다. ‘취소’나 닫기를 누르면 미저장 변경을 버릴지 확인합니다. 저장 실패 시 입력을 유지한 채 다시 저장합니다.\n영업 항목 상세에서 등록된 고객 담당자를 여러 명 연결하거나 연락처에 없는 담당자 이름을 직접 입력할 수 있습니다.\n체크박스로 여러 연락처를 선택한 뒤 선택 삭제를 누르면 휴지통으로 이동합니다. 삭제 전 연결된 영업 건을 확인합니다.\nCSV 업로드·내보내기는 연락처 이관과 별도 보관에 사용하며, 업로드 후 한글과 필드 대응 상태를 확인합니다.\n[연락처 입력과 목록] 직접 추가·명함 인식·회사명 ‘입력에 적용’·즐겨찾기 변경은 연락처 상세에서 저장해야 반영됩니다. 저장 후 연결 영업 정보 갱신에 실패하면 안내에 따라 저장을 다시 누릅니다. 목록은 기본 20줄이며 20·30·40·50줄 중 선택하고 하단 페이지 번호로 이동합니다. 전체 선택은 현재 페이지에 적용됩니다. CSV 업로드·내보내기는 리멤버 Outlook의 92개 열 구성과 호환되며 CSV 업로드는 별도의 실행 작업입니다."
  },
  {
    "id": "manual_tasks",
    "category": "지원 업무",
    "title": "영업지원 업무 등록 기준",
    "format": "list",
    "content": "고객과 직접 진행하는 상담, 견적, 샘플 검증과 수주 건은 파이프라인에 등록합니다. 회사소개서 작성, 자료 확보, 홈페이지 정비, 제도·재무 확인처럼 내부에서 처리하는 일은 지원 업무에 등록합니다.\n‘+ 새 업무’에서 과제명, 분류, 상태, 담당자, 우선순위, 시작일·마감일, 다음 행동과 완료 기준을 입력합니다.\n특정 고객 영업을 지원하면 관련 영업 건을 연결하고 필요할 때 ‘영업 담당자를 이 과제의 담당자로 사용’을 선택합니다.\n화면 상단의 요약 숫자로 전체 과제, 진행·검토 중, 기한 초과와 완료율을 확인합니다. 마감일이 지난 미완료 업무는 우선 처리합니다.\n검색창과 분류·상태·담당자·우선순위 필터로 필요한 업무를 찾고 카드의 상태 선택창에서 진행 상태를 바로 변경합니다.\n완료는 결과물이나 확인 결과가 확정된 경우에만 선택합니다. 완료로 변경하면 진행률은 100%가 됩니다.\n수정 후 ‘저장됨’을 확인합니다. 다른 사용자의 최신 변경을 보려면 새로고침합니다.\n[담당자 입력 예시] 지원 업무 담당자 예시는 ‘홍길동’입니다. 담당자를 직접 입력하거나 연결한 영업 항목의 내부 담당자를 따르도록 지정하고, 지원 업무의 저장 버튼으로 반영합니다."
  },
  {
    "id": "manual_cloud_db",
    "category": "외부 DB",
    "title": "Neon 외부 DB 연결과 데이터 이전",
    "format": "list",
    "content": "이 배포판의 CRM 데이터는 현재 브라우저 안이 아니라 Render API를 거쳐 Neon PostgreSQL에 저장됩니다. PC를 바꾸어도 같은 주소·작업공간·연결키를 사용하면 같은 데이터를 봅니다.\n첫 접속 창에는 Neon 비밀번호나 DATABASE_URL이 아니라 Render 환경변수 CRM_ACCESS_KEY 값을 입력합니다. 이 키는 16자 이상으로 직접 만든 공용 비밀문자열입니다.\nCRM_ACCESS_KEY는 필수입니다. 인터넷에 공개된 CRM 주소에서 허가되지 않은 읽기·쓰기를 막는 최소 접근 장치이므로 비워 두거나 짧게 만들지 않습니다.\n상단의 외부 DB 배지가 초록색 ‘연결됨’이면 Render 서버와 Neon DB를 정상적으로 사용할 수 있습니다. 배지를 누르면 이 브라우저의 연결키를 다시 확인하거나 변경할 수 있습니다.\nDATABASE_URL, CRM_ACCESS_KEY와 CRM_WORKSPACE_ID는 GitHub 파일에 입력하지 않고 Render의 Environment에만 저장합니다. 관리자 코드를 변경해 운영하려면 선택 환경변수 CRM_ADMIN_CODE를 추가합니다. 비밀값은 대화·이메일·화면 캡처에 노출하지 않습니다.\n키를 바꾸려면 Render에서 CRM_ACCESS_KEY 값을 새 키로 교체하고 재배포가 끝난 뒤, 모든 사용자가 상단 외부 DB 배지를 눌러 새 키를 입력합니다.\n기존 단일 HTML의 데이터를 옮기려면 기존 CRM의 설정에서 버전 2 백업을 내려받고, 배포된 CRM의 설정에서 관리자로 인증한 뒤 ‘복원하기’를 실행합니다. 복원 전에 현재 외부 DB 상태도 먼저 내려받습니다.\n여러 사람이 같은 Render 주소, CRM_ACCESS_KEY와 CRM_WORKSPACE_ID를 사용하면 같은 CRM 데이터를 봅니다. 화면은 실시간 공동 편집이 아니므로 다른 사용자의 변경을 보려면 새로고침합니다. 같은 항목을 동시에 수정하면 나중 저장 값이 우선될 수 있습니다.\n연결 오류가 나면 Render 서비스 상태, Environment의 DATABASE_URL·CRM_ACCESS_KEY, Neon 상태와 /api/health 응답을 차례로 확인합니다."
  },
  {
    "id": "manual_settings",
    "category": "설정",
    "title": "설정·매뉴얼·백업 관리",
    "format": "list",
    "content": "설정 화면 상단의 ‘설정/매뉴얼’ 버튼으로 두 화면을 전환합니다. 현재 화면에 표시된 설정을 사용합니다. 우측 상단의 ‘간편 모드’ 표시는 제거되었습니다.\n파이프라인 단계의 이름과 색상을 추가·수정·삭제할 수 있습니다. 단계 변경은 보드 구성과 기존 영업 항목 값에 영향을 주므로 관리자와 협의합니다.\n단계나 분류 설정을 변경할 때는 기존 영업 항목에 미치는 영향을 먼저 확인합니다.\n사용 환경에서는 시작 안내를 다시 열거나 이전 기본 예시 중 중복·미입력 항목을 정리할 수 있습니다. 실제 사용자가 입력한 항목은 삭제 후보를 먼저 확인합니다.\n매뉴얼 화면에서는 제목·내용 검색, 항목 추가·수정·삭제와 순서 변경을 합니다. 수정 내용은 AI 봇의 기능 사용법 답변에도 반영됩니다.\n‘기본 매뉴얼 복원’은 현재 매뉴얼을 이 버전의 기본 내용으로 교체합니다. 직접 작성한 매뉴얼이 필요하면 먼저 관리자 백업을 내려받습니다.\n관리자 기능: 설정 화면 상단의 ‘관리자’를 누르고 관리자 코드를 입력합니다. 인증되면 백업 영역에 ‘내려받기’와 ‘복원하기’가 나타납니다. 인증 정보는 브라우저 저장소에 남기지 않으며 새로고침하거나 인증 시간이 끝나면 다시 입력합니다.\n‘내려받기’는 연락처, 영업 건과 활동, 지원 업무, 직접 일정, 매뉴얼, 설정 등 전체 데이터와 화면별 변경 로그를 Excel 파일(.xlsx)로 저장합니다. 로그에는 시각, 화면, 입력·수정·삭제 동작, 항목명, 바뀐 필드와 변경 전·후 값이 포함됩니다. 공용 연결키 방식이므로 변경한 사람의 이름은 구분하지 않습니다.\n파일명은 hlb_busisup_crm_backup_년-월-일_시-분-초.xlsx 형식입니다. Windows 파일명에서 콜론을 사용할 수 없어 시·분·초 사이에는 하이픈을 사용하지만 여섯 시간 정보가 모두 들어갑니다.\n‘복원하기’는 내려받은 백업 파일의 데이터와 변경 로그로 외부 DB 전체를 해당 시점으로 되돌립니다. 복원 직전에 현재 상태를 먼저 내려받고, 작업 중인 다른 사용자에게 알린 뒤 실행합니다. 이전 버전 2 백업 파일도 복원할 수 있습니다.\n삭제한 영업 항목·연락처·그룹·지원 업무는 휴지통에서 복구할 수 있습니다. 휴지통 비우기와 영구 삭제 후에는 백업 복원 외에는 되돌릴 수 없습니다.\n[현재 백업·복원] 관리자 ‘내려받기’는 .xlsx 백업을 만듭니다. 백업정보·저장데이터·변경로그의 세 시트로 구성되며, 긴 값은 조각으로 나뉘므로 직접 편집하지 않습니다. 복원하기는 .xlsx와 이전 .json 백업을 받습니다. 휴지통은 접기·펼치기가 가능하고 접은 상태가 저장됩니다."
  },
  {
    "id": "manual_operation",
    "category": "운영 기준",
    "title": "HLB-현장지원팀 CRM 운영 기준",
    "format": "list",
    "content": "파이프라인에는 고객사명 또는 구체적인 영업 건이 확인된 항목만 등록하고, 단순 아이디어나 내부 준비 업무는 지원 업무에 등록합니다.\n새 영업 건은 제목, 단계, 내부 담당자, 고객 담당자, 예상 매출, 다음 할 일과 다음 연락일을 우선 입력합니다.\n고객과 연락한 뒤에는 활동 기록에 내용과 결과를 남기고 다음 할 일과 다음 연락일을 즉시 갱신합니다.\n업무 시작 시 대시보드의 오늘 할 일과 빨간 긴급 배지를 확인하고, 지연된 일정부터 처리합니다.\n담당자가 바뀌어도 과거 활동 기록은 삭제하지 않고 유지하여 영업 이력을 이어갑니다. 지원 업무는 담당자, 마감일과 완료 기준 없이 방치하지 않습니다.\n여러 사용자가 같은 항목을 동시에 열어 수정하지 않습니다. 화면은 실시간 동기화가 아니므로 작업 전 새로고침하고 ‘저장됨’을 확인합니다.\n매일 또는 중요한 변경 전후에 관리자가 백업을 내려받고, 주 단위로 복원 가능한 파일인지 보관 상태를 확인합니다. Excel의 ‘백업정보’와 ‘변경로그’ 시트에서 화면별 입력·수정·삭제 내역을 확인합니다.\nCRM_ACCESS_KEY와 관리자 코드는 담당자에게만 안전하게 전달하고 퇴사·분실·외부 노출이 의심되면 즉시 새 값으로 교체합니다."
  },
  {
    "id": "manual_ai_knowledge",
    "category": "AI 봇",
    "title": "AI 봇과 영업지원 브리핑",
    "format": "list",
    "content": "영업지원 브리핑은 저장된 일정과 입력 상태를 기준으로 긴급·주의·제안 항목을 표시합니다. 항목을 누르면 관련 영업 건 또는 지원 업무가 열립니다.\n긴급 항목이 있으면 목록 안의 빨간색 ‘긴급’ 배지만 깜빡이며 브리핑 상자 전체는 깜빡이지 않습니다. 깜빡임은 장애가 아니라 우선 확인 신호입니다.\n오른쪽 아래 AI 봇 아이콘의 숫자는 기한 초과, 오늘 마감, 중요 영업 건의 장기 미접촉처럼 즉시 확인해야 할 항목 수입니다.\nAI 봇 상단의 긴급·주의·진행 버튼을 누르거나 질문을 입력하면 현재 CRM 데이터와 저장된 내부 매뉴얼을 기준으로 답합니다.\n특정 영업 건 상세에서 ‘AI에게 이 영업 건 질문’을 누르면 해당 항목의 다음 행동과 누락 정보를 확인합니다.\n답변 아래 버튼으로 관련 매뉴얼, 영업 항목, 연락처, 지원 업무와 활동 기록 화면을 열 수 있습니다. 답변 하단에는 사용한 정보 종류와 확인 시각이 표시됩니다.\nAI 답변은 업무 확인을 돕는 요약입니다. 계약·금액·일정 같은 중요한 결정은 원본 상세와 담당자 확인을 기준으로 합니다.\n매뉴얼 또는 저장 데이터에 근거가 없으면 임의로 만들지 않고 정보가 부족하다고 안내합니다."
  },
  {
    "id": "manual_calendar",
    "category": "캘린더",
    "title": "CRM 일정과 Google Calendar 연동",
    "format": "list",
    "content": "캘린더에서는 직접 등록 일정, 파이프라인의 다음 연락일, 지원 업무 마감일과 Google Calendar에서 불러온 일정을 한 화면에서 확인합니다.\n보라색은 직접 등록 일정, 연한 붉은색은 CRM 다음 연락일, 노란색은 지원 업무 마감일, 초록색은 Google에서 불러온 일정입니다.\n새 일정: ‘+ 일정 추가’ 또는 날짜 오른쪽 + 버튼을 누르고 제목·날짜를 입력합니다. 종일 또는 시작·종료 시간을 선택하고 장소·내용을 넣은 뒤 저장합니다.\n수정·삭제: 보라색 직접 일정을 누른 뒤 값을 바꾸어 저장하거나 삭제합니다. 연한 붉은색·노란색 일정은 연결된 영업 건 또는 지원 업무 상세에서 원본 날짜를 수정합니다.\n일정 저장 중에는 버튼이 비활성화되고 상태가 표시됩니다. 외부 DB 저장에 실패하면 창이 닫히지 않고 오류가 표시되므로 값을 확인하고 다시 저장합니다.\nGoogle 연결 상태에서 Google에 아직 보내지 않은 직접 일정을 저장하면 Google 기본 캘린더에 한 번 생성됩니다. 이미 Google에 등록된 일정은 다시 저장해도 중복 생성하거나 자동 수정하지 않습니다.\n무료 최소 동기화 모드에서는 CRM에서 이미 전송된 일정을 수정·삭제해도 Google 원본은 자동으로 수정·삭제되지 않습니다. 필요한 변경은 Google Calendar에서 직접 처리합니다. CRM에서 삭제한 뒤 Google 일정 불러오기를 누르면 남아 있는 Google 원본이 초록색으로 다시 보일 수 있습니다.\n‘Google 일정 불러오기’는 현재 선택한 달만 조회합니다. 같은 달은 결과를 재사용하며 자동 반복 조회하지 않습니다. 이전·다음 달로 이동할 때는 이동한 달을 한 번 불러옵니다.\n초록색 Google 일정을 누르면 Google Calendar 원본 화면이 열립니다. 오른쪽 다가오는 일정에서는 앞으로 45일의 가까운 일정을 확인합니다.\nGoogle OAuth 웹 클라이언트 ID가 없으면 입력란 옆 ‘ID 확인 방법’을 눌러 Calendar API 사용 설정, Google Auth Platform 설정, 웹 클라이언트 생성과 승인된 JavaScript 원본 등록 순서를 확인합니다.\n현재 CRM 주소의 https://도메인을 승인된 JavaScript 원본에 정확히 등록합니다. 경로(/calendar 등)는 넣지 않습니다. HTTPS 주소 또는 localhost에서만 Google 로그인이 가능합니다.\n표준 Google Calendar API 사용은 현재 추가 비용이 없습니다. 이 CRM은 비용과 할당량을 아끼기 위해 새 일정 1회 등록과 선택한 달 조회만 사용합니다. Google 정책과 할당량은 변경될 수 있으므로 운영자는 Google Cloud의 할당량 안내를 확인합니다.\nGoogle 액세스 토큰은 CRM에 영구 저장하지 않으며 만료되면 Google 계정 연결을 다시 실행합니다.\n[담당자와 연관 업무] 새 일정과 일정 수정에서 담당자를 입력하고 파이프라인·지원 업무를 각각 선택해 관련 내용을 참고할 수 있습니다. 두 종류를 함께 연결하거나 연결 안 함을 선택할 수 있으며 일정 저장 버튼으로 반영합니다."
  },
  {
    "id": "manual_troubleshooting",
    "category": "문제 해결",
    "title": "오류가 보일 때 확인 순서",
    "format": "list",
    "content": "외부 DB ‘확인 필요’: 상단 배지를 눌러 Render의 CRM_ACCESS_KEY를 다시 입력합니다. 계속 실패하면 Render 서비스가 실행 중인지와 /api/health 응답을 확인합니다.\n‘화면 초기화 오류’ 또는 UI-BIND/UI-DATA 코드: 카메라 권한 문제가 아니며 연결키를 반복 입력할 필요가 없습니다. ‘화면 새로고침’을 누르고, 계속되면 오류 코드·발생 시각·Render 로그를 관리자에게 전달합니다.\n카메라 스캔을 눌렀는데 외부 DB 연결창이 뜸: 이전 배포 파일이 브라우저에 남았거나 화면 버튼 연결이 중단된 경우입니다. 새 버전 배포가 완료됐는지 확인하고 강력 새로고침한 뒤 다시 실행합니다. 현재 버전은 삭제된 버튼 참조를 자동 검사하며 카메라 오류가 DB 창을 열지 않도록 분리되어 있습니다.\n‘저장 실패’: 상세 창을 닫지 말고 인터넷 연결과 외부 DB 상태를 확인합니다. 입력을 유지한 채 저장 버튼으로 재시도하고 ‘저장됨’을 확인합니다.\n카메라 권한을 매번 물음: 새로고침하지 않은 같은 페이지에서는 최초 스트림을 재사용합니다. 그래도 반복되면 주소가 HTTPS인지 확인하고 브라우저의 사이트 설정에서 카메라 권한을 ‘허용’으로 고정합니다. 시크릿 모드, 브라우저 종료 또는 회사 보안 정책에서는 다시 물을 수 있습니다.\n카메라가 열리지 않음: 휴대폰 설정과 브라우저 사이트 권한에서 카메라가 차단되지 않았는지 확인합니다. 다른 앱이 카메라를 사용 중이면 닫고 다시 시도합니다. 지원되지 않거나 영상이 준비되지 않으면 최대 6초 뒤 휴대폰 기본 촬영·파일 선택으로 자동 전환됩니다.\n‘조명이 부족합니다’ 또는 ‘글자가 흐릿합니다’ 팝업: 밝은 곳으로 이동하거나 조명 버튼을 사용하고, 명함을 프레임에 크게 맞춘 뒤 화면의 명함을 눌러 초점을 다시 잡습니다. 반사가 강하면 명함이나 휴대폰 각도를 조금 바꿉니다.\n명함 인식 결과가 부족함: 가로형 명함을 평평한 바닥에 놓고 그림자 없이 프레임을 가득 채워 다시 촬영합니다. OCR이 끝난 뒤 이름·회사·전화·이메일을 원본과 비교하고 잘못된 값은 직접 수정합니다.\n관리자 코드 오류: 대소문자, 숫자와 특수문자를 정확히 입력합니다. 인증 시간이 끝났거나 새로고침한 경우 설정의 ‘관리자’를 눌러 다시 인증합니다.\n백업 내려받기 실패: 관리자 인증 상태와 외부 DB 연결을 확인하고 다시 시도합니다. 브라우저가 다운로드를 차단했다면 이 사이트의 다운로드를 허용합니다.\n백업 복원 실패: 선택한 .xlsx 또는 이전 .json 파일이 HLB-현장지원팀 CRM 백업인지, 같은 작업공간에서 만든 파일인지 확인합니다. 실패한 경우 기존 데이터는 트랜잭션으로 유지되므로 오류를 해결한 뒤 다시 실행합니다.\n다른 사람의 변경이 안 보임: 이 CRM은 실시간 공동 편집 화면이 아니므로 새로고침합니다. 같은 항목 동시 수정은 피합니다.\n캘린더 저장 실패: 제목·날짜·시간 순서를 확인한 뒤 다시 저장합니다. 오류 창이 유지되면 DB 연결을 먼저 복구합니다.\nGoogle 연결 실패: OAuth 클라이언트 ID, 승인된 JavaScript 원본의 정확한 https://도메인, Calendar API 사용 설정과 권한 동의 상태를 확인합니다. 토큰 만료 시 다시 연결합니다.\nGoogle 일정이 수정되지 않음: 무료 최소 동기화 모드는 새 일정 1회 등록과 선택한 달 조회만 수행합니다. 이미 전송한 일정의 수정·삭제는 Google Calendar 원본에서 직접 처리합니다.\nGoogle 일정이 중복으로 보임: 같은 일정을 Google에서 직접 복사했거나 연결 ID가 없는 과거 일정일 수 있습니다. 제목·날짜를 확인하고 Google Calendar에서 불필요한 원본을 삭제한 뒤 ‘Google 일정 불러오기’를 누릅니다.\nRender 무료 서비스가 잠든 경우 첫 접속이 늦을 수 있습니다. 잠시 기다린 뒤 새로고침하고 Render 로그에서 서버 시작과 DB 오류를 확인합니다.\n데이터가 예상과 다름: 즉시 덮어쓰지 말고 최근 백업 파일과 휴지통을 확인합니다. 복원 전 현재 상태를 새 백업으로 보관합니다.\n오류가 반복되면 발생 시각, 사용 메뉴, 화면 메시지와 Render 로그를 함께 기록하여 관리자에게 전달합니다. CRM_ACCESS_KEY, 관리자 코드와 DATABASE_URL 전체 값은 캡처에 포함하지 않습니다."
  }
];

/* 기본 매뉴얼 복원과 기존 저장 매뉴얼에 같은 최신 안내를 적용한다.
   알려진 과거 안내만 교체하고 사용자가 추가한 문장·섹션은 유지한다. */
function refreshCurrentManualContent(sections){
  const replacements=[
    ["같은 항목 동시 수정은 피합니다.","같은 항목을 먼저 저장한 사용자가 있으면 충돌 비교창이 열립니다. 입력 내용은 유지되며, 내 입력 또는 서버 최신 값을 선택해 저장합니다. 삭제 충돌은 입력을 복사하고 최신 데이터를 다시 불러온 뒤 처리합니다."],
    ["저장 후 연결 영업 정보 갱신에 실패하면 안내에 따라 저장을 다시 누릅니다.","연락처·명함 이미지·연결 영업 정보는 함께 저장되며 하나라도 실패하면 전체가 취소됩니다. 입력을 유지한 채 다시 저장합니다."],
    ["설정 화면 상단의 ‘관리자’를 누르고","‘관리자 백업·복원’ 제목 옆 ‘활성화’를 누르고"],
    ["설정의 ‘관리자’를 눌러","‘관리자 백업·복원’ 제목 옆 ‘활성화’를 눌러"],
    ["대시보드·파이프라인·연락처·지원 업무·캘린더·설정","대시보드·파이프라인·지원 업무·연락처·캘린더·설정"],
    ["입력할 때마다 자동 저장되며 ‘저장됨’ 표시를 확인합니다.","입력 후 상단 ‘저장’을 누르고 ‘저장됨’ 표시를 확인합니다."],
    ["자동 저장: 입력값을 외부 DB에 보내는 기능입니다.","저장: 파이프라인·연락처는 저장 버튼으로 입력값을 외부 DB에 반영합니다."],
    ["입력 중에는 ‘자동 저장 중…’, 완료되면 ‘저장됨’이 표시됩니다.","입력 중에는 ‘미저장 변경’, 저장 버튼을 누르면 ‘저장 중…’, 성공하면 ‘저장됨’이 표시됩니다."],
    ["해당 값을 다시 수정하여 저장을 재시도합니다.","입력을 유지한 채 저장 버튼으로 재시도합니다."],
    ["진행 중인 저장은 완료된 뒤 닫히므로 ‘저장됨’을 확인하면 안전합니다.","미저장 변경이 있으면 버릴지 확인하고, 저장 중에는 완료될 때까지 닫을 수 없습니다."],
    ["상세 입력은 자동 저장됩니다. ‘저장됨’을 확인한 뒤 닫고, ‘저장 실패’가 보이면 연결을 확인한 뒤 값을 다시 입력합니다.","상세 입력은 상단 ‘저장’을 눌러 반영합니다. ‘취소’나 닫기를 누르면 미저장 변경을 버릴지 확인합니다. 저장 실패 시 입력을 유지한 채 다시 저장합니다."],
    ["자동 저장 ‘저장 실패’:","‘저장 실패’:"],
    ["입력값을 다시 수정하여 저장을 재시도하고","입력을 유지한 채 저장 버튼으로 재시도하고"],
    ["저장과 문자 인식은 이어서 진행되므로 연락처 화면의 인식 상태를 확인합니다.","문자 인식 결과를 확인하고 연락처 상세의 ‘저장’을 눌러 등록합니다."],
    ["카드를 다른 열로 끌어 놓으면 단계와 자동 성사 확률이 함께 변경됩니다.","카드를 다른 열로 끌어 놓으면 상세 화면이 열립니다. 변경할 단계와 성사 확률을 확인하고 저장해야 반영됩니다."],
    ["대표로 저장됩니다.","상단 ‘저장’을 누르면 대표로 반영됩니다."],
    ["지정한 담당자는 맨 위로 이동하며 다시 접속해도 유지됩니다.","지정한 담당자는 맨 위로 이동하며 상단 ‘저장’을 눌러야 다시 접속해도 유지됩니다."],
    ["카드를 누르면 관련 목록으로 이동합니다.","파이프라인 분석 지표를 누르면 계산 대상 목록이 팝업으로 열립니다."],
    ["오늘 할 일과 관리 그룹은 접거나 펼칠 수 있고,","오늘 할 일은 접거나 펼칠 수 있고,"],
    ["초보 모드는 자주 쓰는 항목을 간단히 보여주고, 상세 모드는 그룹 분류와 세부 운영 설정까지 보여줍니다.","현재 화면에 표시된 설정을 사용합니다. 우측 상단의 ‘간편 모드’ 표시는 제거되었습니다."],
    ["상세 모드에서는 그룹 분류의 설명·중요도 가중치와 그룹 이름·색상·기본 분류를 관리합니다.","단계나 분류 설정을 변경할 때는 기존 영업 항목에 미치는 영향을 먼저 확인합니다."],
    ["전체 데이터와 화면별 변경 로그를 JSON 파일 하나로 저장합니다.","전체 데이터와 화면별 변경 로그를 Excel 파일(.xlsx)로 저장합니다."],
    ["hlb_busisup_crm_backup_년-월-일_시-분-초.json","hlb_busisup_crm_backup_년-월-일_시-분-초.xlsx"],
    ["JSON 파일이 HLB-현장지원팀 CRM 백업인지","선택한 .xlsx 또는 이전 .json 파일이 HLB-현장지원팀 CRM 백업인지"],
    ["파일을 열어 summary와 data.auditLogs에서 화면별 입력·수정·삭제 건수를 확인할 수 있습니다.","Excel의 ‘백업정보’와 ‘변경로그’ 시트에서 화면별 입력·수정·삭제 내역을 확인합니다."],
    ["파란색은 CRM 다음 연락일","연한 붉은색은 CRM 다음 연락일"],
    ["파란색·노란색 일정은","연한 붉은색·노란색 일정은"],
    ["예: 강지훈","예: 홍길동"]
  ];
  const guides={
    manual_dashboard:"[현재 화면 안내] 화면 배치와 메뉴 구성은 유지하고 HLB 로고의 붉은색(#EF4036)과 차콜·흰색을 적용했습니다. 제목·메뉴는 굵은 Pretendard로 표시합니다. 우측 상단 ‘간편 모드’ 표시는 없습니다. 붉은 저장 버튼·선택 표시는 일반 조작 상태이며, 지연·오류는 문구와 상태 배지를 함께 확인합니다. 파이프라인 분석의 수주율·활성 항목 비중·후속조치 지연·실행과제 완료를 누르면 목록이 열리고, 항목을 누르면 파이프라인 또는 지원 업무 상세로 이동합니다. 수주율 목록은 수주·보류·실주, 실행과제 완료 목록은 전체 과제를 표시합니다.",
    manual_pipeline:"[입력·저장 기준] 내부 담당자 입력 예시는 ‘홍길동’입니다. 새 항목과 상세 변경은 상단 저장, 표 수정은 해당 행의 저장 버튼으로 반영합니다. 고객 담당자는 여러 명 선택할 수 있으며 ‘대표로 지정’ 변경도 저장해야 유지됩니다. 선택한 담당자의 이름과 연락처는 고객 담당자 연락처 아래에 표시됩니다. 저장 전 값은 대시보드 집계에 반영되지 않습니다. 활동 추가·지원 업무 연결·전환은 영업 항목을 먼저 저장한 뒤 사용합니다.",
    manual_contacts:"[연락처 입력과 목록] 직접 추가·명함 인식·회사명 ‘입력에 적용’·즐겨찾기 변경은 연락처 상세에서 저장해야 반영됩니다. 연락처·명함 이미지·연결 영업 정보는 함께 저장되며 하나라도 실패하면 전체가 취소됩니다. 입력을 유지한 채 다시 저장합니다. 목록은 기본 20줄이며 20·30·40·50줄 중 선택하고 하단 페이지 번호로 이동합니다. 전체 선택은 현재 페이지에 적용됩니다. CSV 업로드·내보내기는 리멤버 Outlook의 92개 열 구성과 호환되며 CSV 업로드는 별도의 실행 작업입니다.",
    manual_tasks:"[담당자 입력 예시] 지원 업무 담당자 예시는 ‘홍길동’입니다. 담당자를 직접 입력하거나 연결한 영업 항목의 내부 담당자를 따르도록 지정하고, 지원 업무의 저장 버튼으로 반영합니다.",
    manual_calendar:"[담당자와 연관 업무] 새 일정과 일정 수정에서 담당자를 입력하고 파이프라인·지원 업무를 각각 선택해 관련 내용을 참고할 수 있습니다. 두 종류를 함께 연결하거나 연결 안 함을 선택할 수 있으며 일정 저장 버튼으로 반영합니다.",
    manual_settings:"[현재 백업·복원] 관리자 ‘내려받기’는 .xlsx 백업을 만듭니다. 백업정보·저장데이터·변경로그의 세 시트로 구성되며, 긴 값은 조각으로 나뉘므로 직접 편집하지 않습니다. 복원하기는 .xlsx와 이전 .json 백업을 받습니다. 휴지통은 접기·펼치기가 가능하고 접은 상태가 저장됩니다."
  };
  guides.manual_troubleshooting="[동시 저장] 서로 다른 항목은 독립적으로 저장됩니다. 같은 항목은 먼저 저장한 값이 보호되며 수정 전·내 입력·서버 최신 값을 비교하는 창이 열립니다. 기본 선택은 서버 최신 값이며, ‘내 입력 사용’은 해당 항목의 서버 값을 덮어쓰는 명시적 선택입니다. ‘돌아가서 계속 편집’은 저장하지 않고 입력을 유지합니다. 다시 저장하는 동안에도 다른 변경이 있으면 다시 비교합니다. 삭제 또는 그룹 삭제 충돌은 최신 데이터를 불러와 확인 후 다시 처리합니다. 전체 백업 복원 뒤 열린 이전 화면의 저장은 차단되므로 ‘내 입력 복사’ 후 페이지를 다시 엽니다. 화면을 닫거나 새로고침하면 미저장 입력은 사라질 수 있습니다.";
  for(const section of sections){
    if(!/^manual_/.test(section.id))continue;
    for(const [oldText,newText] of replacements)section.content=section.content.replaceAll(oldText,newText);
    const guide=guides[section.id];if(guide&&!section.content.includes(guide))section.content+="\n"+guide;
  }
}
refreshCurrentManualContent(DEFAULT_MANUAL_SECTIONS);

let AREAS = [];
let stageData = {};
let roadmapData = [];
let manualSections = [];
let settingsMode = "config";
let editingRoadmapId = "";
let editingManualId = "";

function uid(){ return 'id_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

/* CRM 데이터는 같은 주소의 Render API를 거쳐 Neon PostgreSQL에 저장합니다. */
const CLOUD_API_BASE = "/api";
const CLOUD_ACCESS_STORAGE_KEY = "tinico:cloud:access-key";
function readSavedCloudAccessKey(){
  try{return localStorage.getItem(CLOUD_ACCESS_STORAGE_KEY) || "";}catch(e){return "";}
}
function saveCloudAccessKey(value){
  try{
    if(value)localStorage.setItem(CLOUD_ACCESS_STORAGE_KEY,value);
    else localStorage.removeItem(CLOUD_ACCESS_STORAGE_KEY);
  }catch(e){}
}
let cloudAccessKey = readSavedCloudAccessKey();
let cloudReady = false;
let cloudConnectionPromise = null;
let resolveCloudConnection = null;

function setCloudConnectionState(state,label){
  const button=document.getElementById("cloud-db-button");
  const text=document.getElementById("cloud-db-state");
  if(button)button.dataset.state=state;
  if(text)text.textContent=label;
}
function resetCloudGateUi(){
  const gate=document.getElementById("cloud-gate");
  const icon=document.getElementById("cloud-gate-icon");
  const title=document.getElementById("cloud-gate-title");
  const copy=document.getElementById("cloud-gate-copy");
  const form=document.getElementById("cloud-login-form");
  const recovery=document.getElementById("cloud-recovery-actions");
  if(gate)delete gate.dataset.mode;
  if(icon)icon.textContent="DB";
  if(title)title.textContent="HLB-현장지원팀 CRM 외부 DB 연결";
  if(copy)copy.innerHTML="Render 서버에 설정한 CRM 연결키를 입력하세요. Neon 데이터베이스 비밀번호가 아니라 <b>CRM_ACCESS_KEY</b> 값입니다.";
  if(form)form.hidden=false;
  if(recovery)recovery.hidden=true;
}
function showCloudGate(message,allowCancel){
  resetCloudGateUi();
  const gate=document.getElementById("cloud-gate");
  const input=document.getElementById("cloud-access-key");
  const status=document.getElementById("cloud-login-status");
  const cancel=document.getElementById("cloud-login-cancel");
  if(!gate)return;
  gate.hidden=false;
  if(input)input.value=cloudAccessKey;
  if(status){
    status.textContent=message || "연결키를 확인한 뒤 외부 DB에 연결합니다.";
    status.classList.toggle("error",Boolean(message));
  }
  if(cancel)cancel.hidden=!allowCancel;
  setTimeout(()=>{if(input)input.focus();},30);
}
function showInitializationFailure(error){
  const gate=document.getElementById("cloud-gate");
  const icon=document.getElementById("cloud-gate-icon");
  const title=document.getElementById("cloud-gate-title");
  const copy=document.getElementById("cloud-gate-copy");
  const form=document.getElementById("cloud-login-form");
  const recovery=document.getElementById("cloud-recovery-actions");
  const code=document.getElementById("cloud-recovery-code");
  const type=error&&error.name==="TypeError"?"UI-BIND":"UI-DATA";
  if(gate){gate.dataset.mode="initialization-error";gate.hidden=false;}
  if(icon)icon.textContent="!";
  if(title)title.textContent="HLB-현장지원팀 CRM 화면 초기화 오류";
  if(copy)copy.textContent="카메라 권한 문제가 아니며, 화면 구성 또는 데이터 로딩 중 오류가 발생했습니다. 연결키를 반복 입력하지 말고 화면을 새로고침해 주세요. 계속되면 아래 오류 코드와 Render 로그를 관리자에게 전달하세요.";
  if(form)form.hidden=true;
  if(recovery)recovery.hidden=false;
  if(code)code.textContent=`오류 코드: ${type} · DB 연결 상태: ${cloudReady?"연결됨":"확인 필요"}`;
}
function hideCloudGate(){
  const gate=document.getElementById("cloud-gate");
  if(gate)gate.hidden=true;
}
function waitForCloudConnection(){
  if(!cloudConnectionPromise){
    cloudConnectionPromise=new Promise(resolve=>{resolveCloudConnection=resolve;});
  }
  return cloudConnectionPromise;
}
function completeCloudConnection(){
  if(resolveCloudConnection)resolveCloudConnection(true);
  cloudConnectionPromise=null;
  resolveCloudConnection=null;
}
function cloudError(message,code){
  const error=new Error(message);
  error.code=code;
  return error;
}
/* 개별 처리에서 누락된 저장 실패가 조용히 사라지지 않도록 하는 최종 안전망 */
let lastUnhandledSaveNoticeAt=0;
window.addEventListener("unhandledrejection",(event)=>{
  const error=event.reason;
  console.error("unhandled promise rejection",error);
  if(!(error && error.code))return;
  const now=Date.now();
  if(now-lastUnhandledSaveNoticeAt<4000)return;
  lastUnhandledSaveNoticeAt=now;
  showToast("저장 또는 서버 요청이 완료되지 않았습니다. 네트워크 확인 후 같은 작업을 다시 시도해 주세요.\n("+(error.message||"알 수 없는 오류")+")");
});
async function verifyCloudAccessKey(candidate){
  const controller=new AbortController();
  /* 무료 Render는 절전 후 첫 응답까지 30초 이상 걸릴 수 있어 여유 있게 대기 */
  const timer=setTimeout(()=>controller.abort(),30000);
  /* 절전 해제가 길어지면 멈춘 것으로 오해하지 않도록 경과를 안내 */
  const startedAt=Date.now();
  const wakeTicker=setInterval(()=>{
    const seconds=Math.round((Date.now()-startedAt)/1000);
    if(seconds<4)return;
    setCloudConnectionState("checking","서버 깨우는 중");
    const message=`무료 서버를 깨우는 중입니다... ${seconds}초 경과 (절전 해제에 최대 1분 정도 걸릴 수 있습니다)`;
    const gate=document.getElementById("cloud-gate");
    const status=document.getElementById("cloud-login-status");
    if(gate && !gate.hidden && status){
      status.textContent=message;
      status.classList.remove("error");
    }else if(seconds===4||seconds===20){
      showToast(message,"info");
    }
  },1000);
  let response;
  try{
    response=await fetch(CLOUD_API_BASE+"/session",{
      method:"GET",
      headers:memberToken?{"X-CRM-Key":candidate,"X-CRM-User":memberToken}:{"X-CRM-Key":candidate},
      cache:"no-store",
      signal:controller.signal
    });
  }catch(error){
    throw cloudError("Render 서버에 연결할 수 없습니다. 배포 상태와 네트워크를 확인한 뒤 다시 시도하세요.","network");
  }finally{
    clearTimeout(timer);
    clearInterval(wakeTicker);
  }
  if(response.status===401)throw cloudError("연결키가 일치하지 않습니다. Render의 CRM_ACCESS_KEY 값을 확인하세요.","auth");
  if(!response.ok)throw cloudError("서버 또는 Neon DB 연결을 확인할 수 없습니다. Render 로그를 확인하세요.","server");
  try{
    return await response.json();
  }catch(error){
    /* 프록시·포털이 HTML을 200으로 돌려주는 경우: SyntaxError 대신 안내 가능한 오류로 변환 */
    throw cloudError("서버 응답을 해석할 수 없습니다. 네트워크(프록시) 상태를 확인해 주세요.","server");
  }
}
async function activateCloudAccessKey(candidate){
  const session=await verifyCloudAccessKey(candidate);
  cloudAccessKey=candidate;
  saveCloudAccessKey(candidate);
  cloudReady=true;
  setCloudConnectionState("ready","연결됨");
  hideCloudGate();
  applySessionMemberInfo(session);
  completeCloudConnection();
  return session;
}
function setupCloudStorageUi(){
  const form=document.getElementById("cloud-login-form");
  const input=document.getElementById("cloud-access-key");
  const submit=document.getElementById("cloud-login-submit");
  const cancel=document.getElementById("cloud-login-cancel");
  const status=document.getElementById("cloud-login-status");
  if(form)form.addEventListener("submit",async e=>{
    e.preventDefault();
    const candidate=(input?.value || "").trim();
    if(candidate.length<16){
      if(status){status.textContent="16자 이상의 CRM_ACCESS_KEY를 입력하세요.";status.classList.add("error");}
      return;
    }
    if(submit){submit.disabled=true;submit.textContent="연결 확인 중…";}
    if(status){status.textContent="Render 서버와 Neon DB 연결을 확인하고 있습니다.";status.classList.remove("error");}
    try{
      await activateCloudAccessKey(candidate);
    }catch(error){
      if(error.code==="auth" && candidate===cloudAccessKey){
        cloudAccessKey="";
        cloudReady=false;
        saveCloudAccessKey("");
      }
      setCloudConnectionState("error","확인 필요");
      if(status){status.textContent=error.message;status.classList.add("error");}
      if(cancel)cancel.hidden=!cloudReady;
    }finally{
      if(submit){submit.disabled=false;submit.textContent="외부 DB 연결";}
    }
  });
  if(cancel)cancel.addEventListener("click",()=>{if(cloudReady)hideCloudGate();});
  document.getElementById("cloud-db-button")?.addEventListener("click",()=>{
    showCloudGate("새 연결키를 확인하면 이 브라우저의 DB 연결이 변경됩니다.",cloudReady);
  });
  document.getElementById("cloud-reload-button")?.addEventListener("click",()=>location.reload());
}
async function ensureCloudConnection(options){
  const config=options || {};
  if(cloudReady && !config.forcePrompt)return true;
  if(config.clearKey){
    cloudAccessKey="";
    saveCloudAccessKey("");
  }
  setCloudConnectionState(config.message?"error":"checking",config.message?"확인 필요":"확인 중");
  if(cloudAccessKey && !config.forcePrompt){
    try{
      await activateCloudAccessKey(cloudAccessKey);
      return true;
    }catch(error){
      if(error.code==="auth"){
        cloudAccessKey="";
        saveCloudAccessKey("");
      }
      config.message=error.message;
    }
  }
  cloudReady=false;
  showCloudGate(config.message || "Render에 설정한 CRM_ACCESS_KEY를 입력하세요.",false);
  return waitForCloudConnection();
}
async function cloudStorageRequest(method,key,value,allowRetry){
  const retry=allowRetry!==false;
  await ensureCloudConnection();
  let response;
  /* 절전 해제 중인 서버·순간적인 네트워크 끊김은 연결 화면을 띄우기 전에 조용히 한 번 재시도 */
  for(let attempt=0;attempt<2 && !response;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    try{
      const options={
        method,
        headers:cloudRequestHeaders(),
        cache:"no-store",
        signal:controller.signal
      };
      if(method==="PUT"){
        options.headers["Content-Type"]="application/json";
        options.body=JSON.stringify(value);
      }
      response=await fetch(CLOUD_API_BASE+"/storage/"+encodeURIComponent(key),options);
    }catch(error){
      if(attempt===0){
        await new Promise(resolve=>setTimeout(resolve,2500));
        continue;
      }
      if(retry){
        cloudReady=false;
        await ensureCloudConnection({forcePrompt:true,message:"서버 연결이 끊겼습니다. 네트워크 또는 Render 상태를 확인한 뒤 다시 연결하세요."});
        return cloudStorageRequest(method,key,value,false);
      }
      throw cloudError("외부 DB 요청에 실패했습니다.","network");
    }finally{
      clearTimeout(timer);
    }
  }
  if(response.status===401 && retry){
    cloudReady=false;
    await ensureCloudConnection({forcePrompt:true,clearKey:true,message:"연결키가 변경되었거나 만료되었습니다. 새 CRM_ACCESS_KEY를 입력하세요."});
    return cloudStorageRequest(method,key,value,false);
  }
  /* 사용자 계정을 쓰는 작업공간에서 로그인이 풀렸거나 열람 권한일 때 */
  if(response.status===403){
    let denial={};
    try{denial=await response.clone().json();}catch(e){}
    if(denial.error==="member_session_required"&&retry){
      memberToken="";saveMemberToken("");currentMember=null;memberAccountsEnabled=true;updateMemberUi();
      const signedIn=await showMemberGate("저장하려면 사용자 로그인이 필요합니다.");
      if(signedIn)return cloudStorageRequest(method,key,value,false);
    }
    if(denial.error==="member_read_only"){
      memberAccountsEnabled=true;
      if(currentMember)currentMember={...currentMember,role:"viewer"};
      updateMemberUi();
    }
  }
  if(!response.ok){
    let payload={};
    try{payload=await response.json();}catch(e){}
    const error=cloudError(payload.message||"외부 DB 저장 중 오류가 발생했습니다"+(payload.requestId?" (요청 "+payload.requestId+")":"")+".",response.status===409?"conflict":"server");
    error.code=payload.error;error.conflicts=payload.conflicts;throw error;
  }
  try{
    return await response.json();
  }catch(error){
    throw cloudError("서버 응답을 해석할 수 없습니다. 네트워크(프록시) 상태를 확인해 주세요.","server");
  }
}
/* Read baselines are private copies. Only acknowledged items advance their tokens. */
const storageSnapshots=new Map(),pendingStorageRequests=new Map();
let storageWriteQueue=Promise.resolve();
async function storageGet(key){
  const result=await cloudStorageRequest("GET",key,undefined,true);
  storageSnapshots.set(key,deepCopy(result));
  return Object.prototype.hasOwnProperty.call(result,"value") ? result.value : null;
}
function storageMutation(key,value,remove=false,expected){
  const base=storageSnapshots.get(key),mutations=[];
  if(base.collection){
    const before=new Map((base.value||[]).map(item=>[item.id,item]));
    const after=new Map((value||[]).map(item=>[item.id,item]));
    for(const [id,item] of before)if(!after.has(id))mutations.push({id,version:base.versions[id]??null,deleted:true});
    (value||[]).forEach((item,index)=>{if(!sameStoredValue(before.get(item.id),item))mutations.push({id:item.id,version:base.versions[item.id]??null,value:item,index});});
  }else if(!sameStoredValue(base.value,value)||remove)mutations.push({id:"",version:base.versions[""]??null,...(remove?{deleted:true}:{value})});
  if(expected)for(const mutation of mutations)if(mutation.id===expected.id)mutation.version=expected.version;
  return {key,mutations,...(remove?{remove:true,head:base.head}:{})};
}
function mergeStorageAcknowledgement(base,record,change){
  const next=deepCopy(base);
  next.head=record.head;next.revision=record.revision;next.updatedAt=record.updatedAt;
  if(change.remove){next.value=null;next.versions=record.versions;return next;}
  for(const mutation of change.mutations){
    next.versions[mutation.id]=record.versions[mutation.id];
    if(!base.collection){next.value=record.value;continue;}
    const saved=(record.value||[]).find(item=>item.id===mutation.id),index=(next.value||[]).findIndex(item=>item.id===mutation.id);
    if(!next.value)next.value=[];
    if(saved){if(index>=0)next.value[index]=saved;else next.value.splice(mutation.index??next.value.length,0,saved);}
    else if(index>=0)next.value.splice(index,1);
  }
  if(base.collection&&next.value===null&&Array.isArray(record.value)&&!record.value.length)next.value=[];
  if(!sameStoredValue(next.value,record.value))next.head=base.head;
  return next;
}
function reconcileStoredArray(target,values){
  const existing=new Map(target.map(item=>[item.id,item]));
  target.splice(0,target.length,...(values||[]).map(value=>{
    const item=existing.get(value.id);if(!item)return deepCopy(value);
    const image=item.cardImage,keepImage=item.cardThumb===value.cardThumb;
    Object.keys(item).forEach(key=>{if(!Object.prototype.hasOwnProperty.call(value,key))delete item[key];});Object.assign(item,deepCopy(value));
    if(image&&keepImage)item.cardImage=image;return item;
  }));
}
function reflectStoredValue(key,value){
  if(key==="tinico:contacts")reconcileStoredArray(contactsData,value);
  else if(key==="tinico:stage:roadmap")reconcileStoredArray(roadmapData,value);
  else if(key==="tinico:calendar:events")reconcileStoredArray(calendarEntries,value);
  else if(key==="tinico:trash")reconcileStoredArray(trashData,value);
  else if(key.startsWith("tinico:stage:")){const areaKey=key.slice(13);if(stageData[areaKey])reconcileStoredArray(stageData[areaKey],value);}
}
/* 접속 초기화 중에는 정규화·마이그레이션 저장이 키마다 따로 나가 왕복이 쌓인다.
   초기화가 끝날 때까지 모아 두었다가 한 번의 트랜잭션으로 보낸다. */
let bootWrites = null;
function beginBootWrites(){ bootWrites = []; }
function queueBootWrite(key, value){
  if(!bootWrites) return storageSet(key, value);
  bootWrites.push({key, value});
  return Promise.resolve();
}
async function flushBootWrites(){
  const queued = bootWrites;
  bootWrites = null;
  if(!queued || !queued.length) return;
  /* 열람 권한은 서버가 저장을 거부하므로 정규화 저장도 시도하지 않는다 */
  if(!canEditData()) return;
  /* 같은 키를 여러 번 담았으면 마지막 값만 보낸다 (한 요청에 같은 키를 두 번 담을 수 없다) */
  const merged = new Map();
  queued.forEach(entry=>merged.set(entry.key, entry));
  await storageTransaction([...merged.values()]);
}
function storageSet(key,value,expected){return storageTransaction([{key,value,expected}]).then(result=>{reflectStoredValue(key,result.records[key].value);return result.records[key];});}
function storageDelete(key){return storageTransaction([{key,value:null,remove:true}]);}
function storageTransaction(entries){
  const captured=deepCopy(entries);
  const run=storageWriteQueue.catch(()=>{}).then(()=>performStorageTransaction(captured));
  storageWriteQueue=run;return run;
}
async function performStorageTransaction(entries){
  for(const entry of entries)if(!storageSnapshots.has(entry.key))await storageGet(entry.key);
  const changes=entries.map(entry=>storageMutation(entry.key,entry.value,entry.remove,entry.expected));
  const generation=entries[0].expected?.generation||storageSnapshots.get(entries[0].key).generation;
  if(entries.some(entry=>(entry.expected?.generation||storageSnapshots.get(entry.key).generation)!==generation))throw new Error("복원 전후의 데이터가 섞여 있습니다. 입력 내용을 복사한 뒤 페이지를 다시 열어 주세요.");
  const signature=JSON.stringify({generation,changes},(key,value)=>key==="updatedAt"?undefined:value);
  let body=pendingStorageRequests.get(signature)||{requestId:crypto.randomUUID(),generation,changes};
  pendingStorageRequests.set(signature,body);
  for(;;){
    try{
      const result=await cloudStorageRequest("PUT",entries[0].key,body,true);
      pendingStorageRequests.delete(signature);
      const accepted={records:{}};
      for(const change of body.changes){
        const merged=mergeStorageAcknowledgement(storageSnapshots.get(change.key),result.records[change.key],change);
        storageSnapshots.set(change.key,deepCopy(merged));accepted.records[change.key]=merged;
      }
      // Refresh only server-derived linked fields; dirty editor tokens remain pinned.
      for(const [key,record] of Object.entries(result.records))if(!body.changes.some(change=>change.key===key)&&key.startsWith("tinico:stage:")){
        const areaKey=key.slice("tinico:stage:".length),base=storageSnapshots.get(key);
        if(!base)continue;
        const mutations=(record.value||[]).filter(item=>base.versions[item.id]!==record.versions[item.id]).map(item=>({id:item.id,value:item}));
        const merged=mergeStorageAcknowledgement(base,record,{mutations});storageSnapshots.set(key,deepCopy(merged));stageData[areaKey]=deepCopy(merged.value||[]);
        const area=findAreaByKey(areaKey);if(area)renderStageBody(area);
      }
      return accepted;
    }catch(error){
      if(error.code==="revision_conflict"&&error.conflicts?.length){
        pendingStorageRequests.delete(signature);
        const resolution=await showStorageConflict(error,body,entries);
        if(!resolution)throw error;
        body={...body,requestId:crypto.randomUUID(),changes:resolution};pendingStorageRequests.set(signature,body);continue;
      }
      if(error.code==="workspace_restored"||error.code==="version_required")await showStorageConflict(error,body,entries);
      throw error;
    }
  }
}
function showStorageConflict(error,body,entries=[]){
  return new Promise(resolve=>{
    const previousFocus=document.activeElement,overlay=document.createElement("div");overlay.className="tn-modal-overlay";overlay.id="save-conflict-overlay";
    const modal=document.createElement("div");modal.className="tn-modal wide tn-conflict-modal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","save-conflict-title");
    const title=document.createElement("h2");title.id="save-conflict-title";title.textContent="저장 충돌 · 입력 내용은 유지됩니다";modal.appendChild(title);
    const hint=document.createElement("p");hint.textContent=error.message;modal.appendChild(hint);
    const changes=deepCopy(body.changes),choices=[];
    const labels={name:"이름",title:"제목",company:"회사",stage:"단계",internalOwner:"내부 담당자",contactName:"고객 담당자",contactPhone:"고객 담당자 연락처",mobilePhone:"휴대전화",businessPhone:"회사 전화",email:"이메일",department:"부서",jobTitle:"직책",amount:"예상 매출",action:"다음에 할 일",nextAction:"다음 연락일",memo:"메모",activities:"활동",linkedContactIds:"선택한 담당자",dueDate:"마감일",owner:"담당자"};
    const display=value=>value===undefined||value===null?"(없음)":typeof value==="object"?JSON.stringify(value,null,2):String(value);
    for(const conflict of error.conflicts||[]){
      const change=changes.find(item=>item.key===conflict.key),mutation=change?.mutations.find(item=>item.id===conflict.id);
      const base=storageSnapshots.get(conflict.key),pinned=entries.find(entry=>entry.key===conflict.key)?.expected;
      const original=pinned?.id===conflict.id?pinned.original:base?.collection?(base.value||[]).find(item=>item.id===conflict.id):base?.value;
      const mine=mutation?.deleted?null:mutation?.value,latest=conflict.value;
      const heading=document.createElement("h3");heading.textContent=mine?.title||mine?.name||original?.title||original?.name||conflict.key;modal.appendChild(heading);
      const table=document.createElement("table");table.className="tn-conflict-table";
      const header=table.createTHead().insertRow();["항목","수정 전","내 입력","서버 최신 값"].forEach(text=>{const th=document.createElement("th");th.textContent=text;header.appendChild(th);});
      const fields=new Set([...Object.keys(original&&typeof original==="object"?original:{}),...Object.keys(mine&&typeof mine==="object"?mine:{}),...Object.keys(latest&&typeof latest==="object"?latest:{})]);
      if(!fields.size)fields.add("값");
      for(const field of fields){
        if(field!=="값"&&sameStoredValue(original?.[field],mine?.[field])&&sameStoredValue(mine?.[field],latest?.[field]))continue;
        const row=table.insertRow();[labels[field]||field,display(field==="값"?original:original?.[field]),display(field==="값"?mine:mine?.[field]),conflict.deleted?"삭제됨":display(field==="값"?latest:latest?.[field])].forEach(text=>{row.insertCell().textContent=text;});
      }
      modal.appendChild(table);
      if(mutation&&conflict.id!==null&&!change.remove&&!body.changes.some(change=>change.mutations.some(item=>item.deleted))){
        const select=document.createElement("select");select.setAttribute("aria-label",heading.textContent+" 충돌 해결");
        select.add(new Option("서버 최신 값 사용","server"));
        if(!conflict.deleted)select.add(new Option(mutation.deleted?"내 삭제 요청 적용":"내 입력 사용 (서버 값을 덮어씀)","mine"));
        modal.appendChild(select);choices.push({select,mutation,conflict});
      }
    }
    const actions=document.createElement("div");actions.className="tn-modal-actions";
    const finish=value=>{overlay.remove();previousFocus?.focus();resolve(value);};
    const copy=document.createElement("button");copy.className="tn-modal-btn";copy.textContent="내 입력 복사";copy.onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(body.changes,null,2));copy.textContent="복사됨";}catch{showToast("복사 권한을 확인해 주세요.");}};actions.appendChild(copy);
    const cancel=document.createElement("button");cancel.className="tn-modal-btn";cancel.textContent="돌아가서 계속 편집";cancel.onclick=()=>finish(null);actions.appendChild(cancel);
    if(choices.length===(error.conflicts||[]).length&&choices.length){
      const retry=document.createElement("button");retry.className="tn-modal-btn save";retry.textContent="선택한 내용으로 저장";retry.onclick=()=>{
        const ignoredImages=new Set();
        choices.forEach(({select,mutation,conflict})=>{mutation.version=conflict.version;if(select.value==="server"){mutation.deleted=conflict.deleted;mutation.value=conflict.value;if(conflict.key==="tinico:contacts")ignoredImages.add(contactImageKey(conflict.id));}});finish(changes.filter(change=>!ignoredImages.has(change.key)));
      };actions.appendChild(retry);
    }
    modal.appendChild(actions);overlay.appendChild(modal);document.getElementById("tn-root").appendChild(overlay);cancel.focus();
    overlay.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();finish(null);}if(event.key==="Tab"){const focusable=[...modal.querySelectorAll("button,select")];if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===focusable.at(-1)){event.preventDefault();focusable[0].focus();}}});
  });
}

let adminSessionToken="";
let adminSessionExpiresAt=0;
let adminLastBackupAt="";
let adminSessionTimer=null;

function adminSessionActive(){
  return !!adminSessionToken && adminSessionExpiresAt > Date.now()+1000;
}
function updateAdminUi(){
  const unlocked=adminSessionActive();
  const button=document.getElementById("settings-admin-open");
  const actions=document.getElementById("settings-admin-actions");
  const lockedNote=document.getElementById("settings-admin-lock-note");
  const backupStatus=document.getElementById("settings-backup-status");
  if(button){
    button.dataset.unlocked=unlocked?"true":"false";
    button.textContent=unlocked?"활성화됨":"활성화";
    button.title=unlocked?"관리자 인증 완료 · 클릭하면 인증 시간을 갱신합니다.":"관리자 코드로 백업·복원을 활성화합니다.";
    button.setAttribute("aria-label",unlocked?"관리자 백업·복원 활성화됨 · 인증 갱신":"관리자 백업·복원 활성화");
  }
  if(actions)actions.hidden=!unlocked;
  if(lockedNote)lockedNote.hidden=unlocked;
  setAuditControlsEnabled(canViewAudit());
  const memberAddButton=document.getElementById("settings-member-add");
  if(memberAddButton)memberAddButton.disabled=!unlocked;
  if(!unlocked){
    adminMemberList=[];
    memberAdminError="";
    renderMemberSettings();
  }
  /* 인증을 켜거나 끄면 볼 수 있는 범위가 달라지므로 이전 결과는 버린다 */
  auditState.entries=[];auditState.total=0;auditState.loaded=false;auditState.page=1;auditState.error="";auditState.actors=[];
  auditState.scope=unlocked?"all":"mine";
  renderAuditTable();
  /* 휴지통에 보이는 범위도 관리자 인증 여부에 따라 달라진다 */
  renderTrash();
  if(backupStatus){
    if(!unlocked)backupStatus.textContent="관리자 인증 후 전체 데이터와 변경 로그를 내려받을 수 있습니다.";
    else if(adminLastBackupAt)backupStatus.textContent=`마지막 내려받기: ${formatDateTime(adminLastBackupAt)} · 데이터와 변경 로그 포함`;
    else backupStatus.textContent="인증되었습니다. 내려받기는 전체 데이터와 화면별 입력·수정·삭제 로그를 포함합니다.";
  }
}
function lockAdmin(){
  clearTimeout(adminSessionTimer);
  adminSessionTimer=null;
  adminSessionToken="";
  adminSessionExpiresAt=0;
  updateAdminUi();
}
function openAdminModal(){
  const overlay=document.getElementById("settings-admin-overlay");
  const input=document.getElementById("settings-admin-code");
  const status=document.getElementById("settings-admin-status");
  if(status){status.textContent=adminSessionActive()?"이미 관리자 인증이 완료되었습니다. 코드를 다시 입력하면 인증 시간이 갱신됩니다.":"";status.className="tn-admin-status";}
  if(input)input.value="";
  if(overlay)overlay.hidden=false;
  setTimeout(()=>input?.focus(),0);
}
function closeAdminModal(){
  const overlay=document.getElementById("settings-admin-overlay");
  const input=document.getElementById("settings-admin-code");
  const status=document.getElementById("settings-admin-status");
  if(input)input.value="";
  if(status){status.textContent="";status.className="tn-admin-status";}
  if(overlay)overlay.hidden=true;
}
async function authenticateAdmin(code){
  await ensureCloudConnection();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  let response;
  try{
    response=await fetch(CLOUD_API_BASE+"/admin/session",{
      method:"POST",
      headers:{"X-CRM-Key":cloudAccessKey,"Content-Type":"application/json"},
      body:JSON.stringify({code}),
      cache:"no-store",
      signal:controller.signal
    });
  }catch(error){
    throw cloudError("관리자 인증 요청에 실패했습니다. 네트워크와 Render 상태를 확인하세요.","network");
  }finally{
    clearTimeout(timer);
  }
  if(response.status===401)throw cloudError("CRM 연결키가 만료되었거나 변경되었습니다. 외부 DB를 다시 연결하세요.","auth");
  if(response.status===403)throw cloudError("관리자 코드가 일치하지 않습니다.","admin");
  if(!response.ok)throw cloudError("관리자 인증 중 서버 오류가 발생했습니다.","server");
  let payload;
  try{
    payload=await response.json();
  }catch(error){
    throw cloudError("관리자 인증 응답을 해석할 수 없습니다. 네트워크 상태를 확인해 주세요.","server");
  }
  if(!payload.token || !payload.expiresAt)throw cloudError("관리자 인증 응답이 올바르지 않습니다.","server");
  adminSessionToken=payload.token;
  adminSessionExpiresAt=new Date(payload.expiresAt).getTime();
  clearTimeout(adminSessionTimer);
  adminSessionTimer=setTimeout(lockAdmin,Math.max(0,adminSessionExpiresAt-Date.now()));
  updateAdminUi();
  /* 인증이 끝나면 사용자 목록과 변경 이력을 바로 쓸 수 있게 준비한다 (실패해도 조용히 두고, 새로고침 버튼으로 다시 시도한다) */
  refreshMemberAdminList({silent:true});
  loadAuditPage({silent:true});
  return payload;
}
async function submitAdminAuthentication(event){
  event?.preventDefault();
  const input=document.getElementById("settings-admin-code");
  const status=document.getElementById("settings-admin-status");
  const submit=document.getElementById("settings-admin-submit");
  const code=input?.value||"";
  if(!code){
    if(status){status.textContent="관리자 코드를 입력하세요.";status.className="tn-admin-status error";}
    input?.focus();
    return;
  }
  if(submit){submit.disabled=true;submit.textContent="확인 중…";}
  if(status){status.textContent="관리자 코드를 확인하고 있습니다.";status.className="tn-admin-status";}
  try{
    const session=await authenticateAdmin(code);
    if(input)input.value="";
    if(status){status.textContent=`인증되었습니다. ${formatDateTime(session.expiresAt)}까지 사용할 수 있습니다.`;status.className="tn-admin-status success";}
    setTimeout(closeAdminModal,350);
  }catch(error){
    if(status){status.textContent=error.message||"관리자 인증에 실패했습니다.";status.className="tn-admin-status error";}
    if(input){input.select();input.focus();}
  }finally{
    if(submit){submit.disabled=false;submit.textContent="확인";}
  }
}
async function adminApiRequest(path,options={}){
  if(!adminSessionActive()){
    lockAdmin();
    throw cloudError("관리자 인증 시간이 만료되었습니다. 관리자 코드를 다시 입력하세요.","admin");
  }
  await ensureCloudConnection();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  let response;
  try{
    const requestOptions={
      method:options.method||"GET",
      headers:{"X-CRM-Key":cloudAccessKey,"Authorization":"Bearer "+adminSessionToken},
      cache:"no-store",
      signal:controller.signal
    };
    if(Object.prototype.hasOwnProperty.call(options,"body")){
      requestOptions.headers["Content-Type"]="application/json";
      requestOptions.body=JSON.stringify(options.body);
    }
    response=await fetch(CLOUD_API_BASE+path,requestOptions);
  }catch(error){
    throw cloudError("관리자 요청에 실패했습니다. 네트워크와 Render 상태를 확인하세요.","network");
  }finally{
    clearTimeout(timer);
  }
  if(response.status===403){lockAdmin();throw cloudError("관리자 인증 시간이 만료되었습니다. 관리자 코드를 다시 입력하세요.","admin");}
  if(response.status===401)throw cloudError("CRM 연결키가 변경되었습니다. 외부 DB를 다시 연결하세요.","auth");
  let payload={};
  try{payload=await response.json();}catch(error){}
  if(!response.ok)throw cloudError(payload.message||"관리자 요청을 처리하지 못했습니다.",payload.error||"server");
  return payload;
}

const DEFAULT_APP_SETTINGS = {beginnerMode:true, onboardingSeen:false, lastBackupAt:"", dashboardCollapse:{today:false,groups:false}, dashboardOrder:["analytics","summary","today","ai","groups"], contactPageSize:20, pipelinePageSize:20, trashCollapsed:false, googleCalendar:{clientId:"",eventMap:{},collapsed:false}};
let appSettings = {...DEFAULT_APP_SETTINGS};
let trashData = [];
let undoTrashId = "";
let undoToastTimer = null;

const DEFAULT_STAGE_GUIDE = {
  리드:"고객 또는 영업 가능성을 처음 확인한 상태입니다. 첫 미팅이나 요구사항 확인 일정을 잡습니다.",
  상담:"고객 요구사항, 적용 가능성, 수량과 기술 조건을 확인하는 상태입니다.",
  제안:"견적·샘플·제안서 등 구체적인 제안을 전달한 상태입니다.",
  협상:"가격·납기·계약 조건을 조율하고 수주 확정을 준비하는 상태입니다.",
  수주:"발주서 또는 계약이 확정된 상태입니다. 실제 수주 금액과 납품 일정을 기록합니다.",
  보류:"진행 가능성은 있으나 일정이나 조건 때문에 잠시 중단된 상태입니다. 재확인 날짜를 정합니다.",
  실주:"경쟁사 선정, 고객 거절 또는 프로젝트 종료로 이번 기회가 종료된 상태입니다. 실주 사유를 남깁니다."
};
function stageGuide(stage){ return DEFAULT_STAGE_GUIDE[stage] || `${stage} 단계의 내부 운영 기준을 설정에서 합의해 사용합니다.`; }
function isClosedStage(stage){ return RESERVED_STAGES.includes(normalizeStage(stage)); }
function deepCopy(value){ return JSON.parse(JSON.stringify(value)); }
function nowIso(){ return new Date().toISOString(); }
function formatDateTime(value){
  if(!value) return "";
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
async function loadAppSettings(){
  const raw=await storageGet("tinico:app:settings");
  /* 손상된 값(문자열·배열)이 spread로 설정을 오염시키지 않게 객체만 허용 */
  const saved=raw && typeof raw==="object" && !Array.isArray(raw) ? raw : {};
  appSettings={...DEFAULT_APP_SETTINGS,...saved,dashboardCollapse:{...DEFAULT_APP_SETTINGS.dashboardCollapse,...(saved.dashboardCollapse||{})},dashboardOrder:Array.isArray(saved.dashboardOrder)?saved.dashboardOrder:[...DEFAULT_APP_SETTINGS.dashboardOrder],googleCalendar:{...DEFAULT_APP_SETTINGS.googleCalendar,...(saved.googleCalendar||{}),eventMap:{...(DEFAULT_APP_SETTINGS.googleCalendar.eventMap||{}),...((saved.googleCalendar&&saved.googleCalendar.eventMap)||{})}}};
}
async function saveAppSettings(){ await storageSet("tinico:app:settings", appSettings); }
async function loadTrash(){ trashData = (await storageGet("tinico:trash")) || []; }
async function saveTrash(){
  /* 명함 이미지가 포함된 휴지통이 무한정 커져 저장 실패를 일으키지 않도록 상한 유지 */
  if(trashData.length>200) trashData.length=200;
  await storageSet("tinico:trash", trashData);
}
function activityDateValue(a){ return a && (a.date || a.createdAt || ""); }
function normalizeActivity(a){ return {id:uid(), type:"기타", date:todayStr(), content:"", result:"", nextAction:"", nextDate:"", createdAt:nowIso(), ...a}; }
/* 영업 항목에 연결된 등록 연락처 (연락처가 삭제됐으면 자동으로 빠진다) */
function linkedContactsOf(item){
  return ((item && item.linkedContactIds) || []).map(id=>contactsData.find(c=>c.id === id)).filter(Boolean);
}
/* 선택한 담당자 이름을 한 줄로 (contactName에 그대로 저장되어 목록·검색·AI에서 함께 쓰인다) */
function linkedContactNamesOf(item){
  return linkedContactsOf(item).map(c=>String(c.name || "").trim()).filter(Boolean).join(", ");
}
function dealCompletion(item){
  const checks = [
    ["고객사/영업 건", String(item.title || "").trim() && item.title !== "새 항목"],
    ["현재 단계", !!item.stage],
    ["내부 담당자", !!String(item.internalOwner || "").trim()],
    ["고객 담당자", !!((item.linkedContactIds || []).some(id=>contactsData.some(c=>c.id===id)) || item.contactName)],
    ["예상 매출", item.amount !== "" && item.amount !== null && item.amount !== undefined],
    ["다음에 할 일", !!String(item.action || "").trim()],
    ["다음 연락일", !!item.nextAction]
  ];
  const done = checks.filter(x=>x[1]).length;
  return {done,total:checks.length,percent:Math.round(done/checks.length*100),missing:checks.filter(x=>!x[1]).map(x=>x[0])};
}
function allDeals(){
  return AREAS.flatMap(area=>(stageData[area.key] || []).map(item=>({area,item,stage:normalizeStage(item.stage)})));
}
function findDeal(areaKey,id){
  const area = findAreaByKey(areaKey);
  const item = area ? (stageData[areaKey] || []).find(x=>x.id === id) : null;
  return area && item ? {area,item} : null;
}
function showUndo(message, trashId){
  const toast = document.getElementById("tn-undo-toast");
  if(!toast) return;
  undoTrashId = trashId || "";
  document.getElementById("tn-undo-message").textContent = message;
  toast.hidden = false;
  clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(()=>{ toast.hidden = true; undoTrashId = ""; }, 6000);
}
/* 휴지통 항목에 지운 사람을 남긴다. 사용자 계정을 쓰지 않으면 null (예전과 같이 모두에게 보인다). */
function trashActor(){ return currentMember ? {id:currentMember.id, name:currentMember.name} : null; }
/* 관리자 인증을 마쳤거나 사용자 계정을 쓰지 않으면 전부, 아니면 내가 지운 것만 본다.
   누가 지웠는지 기록이 없는 예전 항목은 복구할 길이 막히지 않도록 모두에게 보여 준다. */
function canSeeAllTrash(){ return adminSessionActive() || !memberAccountsEnabled || !currentMember; }
function visibleTrashEntries(){
  if(canSeeAllTrash()) return trashData;
  return trashData.filter(entry=>!entry.deletedBy || entry.deletedBy.id === currentMember.id);
}
async function addTrash(type,label,payload,meta={}){
  const entry = {id:uid(), type, label:label || "삭제 항목", deletedAt:nowIso(), deletedBy:trashActor(), payload:deepCopy(payload), meta:deepCopy(meta)};
  trashData.unshift(entry);
  await saveTrash();
  showUndo(`${label || "항목"}을(를) 휴지통으로 이동했습니다.`, entry.id);
  renderTrash();
  return entry;
}
async function restoreTrashEntry(id){
  const entry = trashData.find(x=>x.id === id);
  if(!entry) return;
  try{
  const changes=[{key:"tinico:trash",value:trashData.filter(x=>x.id!==id)}];
  let restoredArea=null;
  if(entry.type === "deal") {
    const target = findAreaByKey(entry.meta.areaKey) || AREAS[0];
    if(!target) return;
    const restored = normalizeItem(entry.payload);
    if((stageData[target.key] || []).some(x=>x.id === restored.id)) restored.id = uid();
    changes.push({key:"tinico:stage:"+target.key,value:[...(stageData[target.key]||[]),restored]});
  } else if(entry.type === "contact") {
    const restored = normalizeContact(entry.payload);
    if(contactsData.some(x=>x.id === restored.id)) restored.id = uid();
    changes.push({key:"tinico:contacts",value:stripContactImages([restored,...contactsData])});
  } else if(entry.type === "roadmap") {
    const restored = normalizeSupportTask(entry.payload);
    if(roadmapData.some(x=>x.id === restored.id)) restored.id = uid();
    changes.push({key:"tinico:stage:roadmap",value:[...roadmapData,restored]});
  } else if(entry.type === "group") {
    const area = normalizeArea(entry.payload.area);
    if(AREAS.some(a=>a.key === area.key)) area.key = uid();
    restoredArea=area;
    changes.push({key:"tinico:areas",value:[...AREAS,area].map(storedAreaValue)},{key:"tinico:stage:"+area.key,value:(entry.payload.items||[]).map(normalizeItem)});
  }
  const result=await storageTransaction(changes);
  if(restoredArea){AREAS.push(restoredArea);stageData[restoredArea.key]=[];}
  for(const [key,record] of Object.entries(result.records))reflectStoredValue(key,record.value);
  AREAS.forEach(area=>{buildStageView(area);renderStageBody(area);});
  renderRoadmap(); renderContacts(); renderPipeline(true); renderHome(); renderSettings();
  const toast = document.getElementById("tn-undo-toast"); if(toast) toast.hidden = true;
  }catch(error){
    console.error("trash restore failed", error);
    showToast(error?.message||"복구 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
    renderTrash(); renderPipeline(true); renderContacts(); renderRoadmap(); renderHome();
  }
}
async function permanentlyDeleteTrash(id){
  if(!confirm("휴지통에서 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
  const previous = trashData;
  const entry = trashData.find(x=>x.id === id);
  trashData = trashData.filter(x=>x.id !== id);
  try{
    await saveTrash();
    /* 연락처 영구 삭제 시 분리 저장된 명함 원본도 함께 정리 (실패해도 삭제 자체는 유지) */
    if(entry?.type === "contact" && entry.payload?.id) deleteContactCardImageKey(entry.payload.id);
  }catch(error){
    trashData = previous;
    console.error("trash delete failed", error);
    showToast(error?.message||"영구 삭제 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
  renderTrash();
}
async function emptyTrash(){
  const targets = visibleTrashEntries();
  if(!targets.length) return;
  /* 남의 항목까지 지우지 않도록, 지금 화면에 보이는 것만 비운다 */
  const scoped = targets.length !== trashData.length;
  if(!confirm(`휴지통의 ${targets.length}개 항목을 영구 삭제할까요?${scoped ? "\n(내가 지운 항목만 비웁니다)" : ""}`)) return;
  const previous = trashData;
  const removing = new Set(targets.map(entry=>entry.id));
  const contactImageIds = targets.filter(x=>x.type === "contact" && x.payload?.id).map(x=>x.payload.id);
  trashData = trashData.filter(entry=>!removing.has(entry.id));
  try{
    await saveTrash();
    contactImageIds.forEach(id=>deleteContactCardImageKey(id));
  }catch(error){
    trashData = previous;
    console.error("trash empty failed", error);
    showToast(error?.message||"휴지통 비우기 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
  renderTrash();
}
async function moveDealToTrash(areaKey,id){
  const found = findDeal(areaKey,id); if(!found) return;
  if(dealDrafts.get(dealDrawerSaveKey(areaKey,id))?.saving){showToast("저장 완료 후 삭제해 주세요.");return;}
  const previousStage = stageData[areaKey];
  const previousTrash = [...trashData];
  try{
    const entry={id:uid(),type:"deal",label:found.item.title||"영업 항목",deletedAt:nowIso(),deletedBy:trashActor(),payload:deepCopy(found.item),meta:{areaKey}};
    const key="tinico:stage:"+areaKey;
    const result=await storageTransaction([{key:"tinico:trash",value:[entry,...trashData].slice(0,200)},{key,value:stageData[areaKey].filter(x=>x.id!==id)}]);
    trashData=result.records["tinico:trash"].value;stageData[areaKey]=result.records[key].value;
    showUndo(`${entry.label}을(를) 휴지통으로 이동했습니다.`,entry.id);
    dealDrafts.delete(dealDrawerSaveKey(areaKey,id));
    if(selectedDealRef && selectedDealRef.id === id) closeDealDrawer(true);
  }catch(error){
    stageData[areaKey] = previousStage;
    trashData = previousTrash;
    console.error("deal trash failed", error);
    showToast(error?.message||"영업 항목 삭제 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
  renderStageBody(found.area); renderPipeline(true); renderHome(); renderTrash();
}
async function moveContactsToTrash(ids){
  const idSet = new Set(ids);
  if(ids.some(id=>contactDrafts.get(id)?.saving)){showToast("저장 완료 후 삭제해 주세요.");return;}
  const targets = contactsData.filter(c=>idSet.has(c.id));
  if(!targets.length) return;
  const previousTrash = [...trashData];
  const previousContacts = contactsData;
  try{
    /* 연락처 수만큼 전체 휴지통을 반복 업로드하지 않도록 한 번에 담아 1회만 저장.
       명함 원본은 별도 키에 남아 있으므로 휴지통에는 썸네일까지만 보관 */
    const entries = targets.map(ct=>({id:uid(), type:"contact", label:ct.name || ct.company || "연락처", deletedAt:nowIso(), deletedBy:trashActor(), payload:deepCopy({...ct, cardImage:undefined}), meta:{}}));
    const result=await storageTransaction([{key:"tinico:trash",value:[...entries,...trashData].slice(0,200)},{key:"tinico:contacts",value:stripContactImages(contactsData.filter(c=>!idSet.has(c.id)))}]);
    trashData=result.records["tinico:trash"].value;contactsData=result.records["tinico:contacts"].value;
    selectedContactIds.clear();
    ids.forEach(id=>contactDrafts.delete(id));
    if(selectedContactId && idSet.has(selectedContactId)) closeContactDetail(true);
    showUndo(`연락처 ${targets.length}개를 휴지통으로 이동했습니다.`, entries[0]?.id || "");
  }catch(error){
    trashData = previousTrash;
    contactsData = previousContacts;
    console.error("contacts trash failed", error);
    showToast(error?.message||"연락처 삭제 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
  renderTrash(); renderContacts(); renderHome();
}
/* 휴지통 목록 접기·펼치기 — 접은 상태는 외부 DB의 앱 설정에 남아 다음 접속에도 유지된다 */
function applyTrashCollapsed(){
  const wrap = document.getElementById("settings-trash-list");
  const button = document.getElementById("settings-trash-collapse");
  if(!wrap || !button) return;
  const collapsed = !!appSettings.trashCollapsed;
  const count = visibleTrashEntries().length;
  wrap.hidden = collapsed;
  button.textContent = collapsed ? (count ? `펼치기 · ${count}개` : "펼치기") : "접기";
  button.setAttribute("aria-expanded", String(!collapsed));
}
async function toggleTrashCollapsed(){
  const previous = !!appSettings.trashCollapsed;
  appSettings.trashCollapsed = !previous;
  /* 저장 실패와 무관하게 화면을 먼저 반영하고, 실패하면 되돌린다 */
  applyTrashCollapsed();
  try{
    await saveAppSettings();
  }catch(error){
    appSettings.trashCollapsed = previous;
    applyTrashCollapsed();
    console.error("trash collapse save failed", error);
    showToast(error?.message || "휴지통 접기 상태 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
}
function renderTrash(){
  const wrap = document.getElementById("settings-trash-list");
  const note = document.getElementById("trash-scope-note");
  const visible = visibleTrashEntries();
  if(note){
    const scoped = memberAccountsEnabled && currentMember && !adminSessionActive();
    note.hidden = !scoped;
    if(scoped) note.textContent = `내가 지운 항목만 보입니다. 전체를 보려면 위의 관리자 백업·복원을 활성화하세요. (전체 ${trashData.length}건 중 ${visible.length}건)`;
  }
  if(!wrap) return;
  wrap.innerHTML = "";
  if(!visible.length){
    wrap.innerHTML = `<div class="tn-empty-compact">${trashData.length ? "내가 지운 항목이 없습니다." : "휴지통이 비어 있습니다."}</div>`;
    applyTrashCollapsed();
    return;
  }
  visible.slice(0,50).forEach(entry=>{
    const row = document.createElement("div"); row.className = "tn-trash-row";
    const typeLabel = {deal:"영업 항목",contact:"연락처",group:"그룹",roadmap:"영업지원 실행과제"}[entry.type] || entry.type;
    const who = canSeeAllTrash() && entry.deletedBy && entry.deletedBy.name ? " · " + escapeHtml(entry.deletedBy.name) : "";
    row.innerHTML = `<div><div class="tn-trash-title">${escapeHtml(entry.label)}</div><div class="tn-trash-meta">${escapeHtml(typeLabel)} · ${escapeHtml(formatDateTime(entry.deletedAt))}${who}</div></div><div class="tn-trash-actions"><button class="tn-btn small" data-restore-trash="${escapeHtml(entry.id)}">복구</button><button class="tn-btn small danger" data-delete-trash="${escapeHtml(entry.id)}">영구 삭제</button></div>`;
    wrap.appendChild(row);
  });
  applyTrashCollapsed();
}
function updateBeginnerControls(){
  const on = !!appSettings.beginnerMode;
  const top = document.getElementById("top-beginner-toggle"); if(top){ top.classList.toggle("on",on); top.innerHTML = on ? '초보 <span>모드</span>' : '상세 <span>모드</span>'; }
  const set = document.getElementById("settings-beginner-toggle"); if(set) set.classList.toggle("on",on);
}
async function setBeginnerMode(on){
  const previous = appSettings.beginnerMode;
  appSettings.beginnerMode = !!on;
  /* 저장 실패와 무관하게 버튼 상태를 먼저 반영하고, 실패 시 되돌림 */
  updateBeginnerControls();
  if(selectedDealRef) renderDealDrawer(false);
  try{
    await saveAppSettings();
  }catch(error){
    appSettings.beginnerMode = previous;
    updateBeginnerControls();
    console.error("beginner mode save failed", error);
    showToast(error?.message||"모드 설정 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
}
/* 명함 인식(OCR·스캐너)과 Excel 백업 코드는 첫 화면에 필요하지 않다.
   실제로 그 기능을 쓸 때만 heavy.js 를 내려받아 첫 로딩을 가볍게 유지한다. */
let heavyFeaturesPromise = null;
function heavyFeaturesSrc(){
  const tag = [...document.querySelectorAll("script[src]")].find(script=>/(^|\/)app\.js(\?|$)/.test(script.getAttribute("src")||""));
  const version = tag ? (tag.getAttribute("src").split("?")[1]||"") : "";
  return "heavy.js" + (version ? "?" + version : "");
}
function heavyFeaturesReady(){ return typeof openScanner === "function" && typeof buildBackupWorkbook === "function"; }
function loadHeavyFeatures(){
  if(heavyFeaturesReady()) return Promise.resolve();
  if(!heavyFeaturesPromise){
    heavyFeaturesPromise = new Promise((resolve,reject)=>{
      const script = document.createElement("script");
      script.src = heavyFeaturesSrc();
      script.onload = ()=>resolve();
      script.onerror = ()=>{ heavyFeaturesPromise = null; reject(new Error("명함 인식·백업 기능을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.")); };
      document.head.appendChild(script);
    });
  }
  return heavyFeaturesPromise;
}
/* 기능을 불러온 뒤 실행한다. 이미 불러와 있으면 기다리지 않고 바로 실행해
   버튼을 누른 즉시 반응하도록 한다. 불러오지 못하면 알리고 아무 것도 하지 않는다. */
function withHeavyFeatures(run){
  if(heavyFeaturesReady()) return run();
  return loadHeavyFeatures().then(run, error=>{ showToast(error.message); });
}
async function exportFullBackup(){
  const button=document.getElementById("settings-backup-export");
  if(button){button.disabled=true;button.textContent="준비 중…";}
  try{
    await loadHeavyFeatures();
    const backup=await adminApiRequest("/admin/backup");
    const blob=await buildBackupWorkbook(backup);
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`hlb_busisup_crm_backup_${formatBackupFileStamp(new Date(backup.exportedAt))}.xlsx`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    adminLastBackupAt=backup.exportedAt||nowIso();
    updateAdminUi();
  }catch(error){
    showToast(error.message||"백업 파일을 내려받지 못했습니다.");
  }finally{
    if(button){button.disabled=false;button.textContent="내려받기";}
  }
}
/* Excel(.xlsx)은 ZIP이라 항상 PK로 시작한다. 예전에 내려받은 .json 백업도 그대로 복원할 수 있게 둘 다 받는다. */
async function readBackupFile(file){
  const buffer=await file.arrayBuffer();
  const head=new Uint8Array(buffer.slice(0,2));
  if(head[0]===0x50 && head[1]===0x4B){ await loadHeavyFeatures(); return readBackupWorkbook(buffer); }
  return JSON.parse(new TextDecoder().decode(buffer));
}
async function importFullBackup(file){
  let backup;
  try{ backup = await readBackupFile(file); }
  catch(error){ console.error("backup file read failed", error); showToast(error?.message||"백업 파일을 읽을 수 없습니다."); return; }
  if(!backup || ![2,3].includes(backup.tinikoCRMBackupVersion)){showToast("지원하지 않는 백업 파일입니다.");return;}
  const point=backup.exportedAt?formatDateTime(backup.exportedAt):"날짜 확인 불가";
  if(!confirm(`${point} 시점으로 전체 데이터를 되돌릴까요?\n\n현재 데이터와 변경 로그가 모두 교체됩니다. 복원 전에 현재 상태를 먼저 내려받는 것을 권장합니다.`))return;
  const button=document.getElementById("settings-backup-import");
  if(button){button.disabled=true;button.textContent="복원 중…";}
  try{
    await adminApiRequest("/admin/restore",{method:"POST",body:{backup}});
    showToast(`${point} 시점으로 복원했습니다. 화면을 새로 불러옵니다.`);
    location.reload();
  }catch(error){
    showToast(error.message||"백업 파일을 복원하지 못했습니다.");
  }finally{
    if(button){button.disabled=false;button.textContent="복원하기";}
  }
}
function formatBackupFileStamp(value){
  const date=value instanceof Date&&!Number.isNaN(value.getTime())?value:new Date();
  const pad=number=>String(number).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function validBucketKey(key){ return REVENUE_BUCKETS[key] ? key : ""; }
function safeKeyFromLabel(label, prefix){
  const base = String(label || "").trim().toLowerCase().replace(/[^0-9a-z가-힣]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || prefix) + "_" + Math.random().toString(36).slice(2,6);
}
function safeCssColor(value,fallback="#64748B"){
  const text=String(value||"").trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)?text:fallback;
}
function inferAreaBucket(area){
  if(area && validBucketKey(area.bucket)) return area.bucket;
  const key = area && area.key;
  const fallback = BUCKET_ORDER[0] || "";
  if(["existing_accounts","sales_mgmt"].includes(key)) return validBucketKey("direct") || fallback;
  if(["sample_validation","medical_strategy","global_channel","medical","industrial","jdp","global"].includes(key)) return validBucketKey("future") || fallback;
  if(["marketing_assets","gov_finance","academic","roadmap"].includes(key)) return validBucketKey("support") || fallback;
  return validBucketKey("future") || fallback;
}
function normalizeArea(area){
  const source=area&&typeof area==="object"?area:{};
  return {
    ...source,
    key:String(source.key||safeKeyFromLabel(source.title,"group")),
    icon:String(source.icon||"📁"),
    color:safeCssColor(source.color),
    colorSoft:safeCssColor(source.colorSoft,"#F1F5F9"),
    title:String(source.title||"이름 없는 그룹"),
    subtitle:String(source.subtitle||""),
    bucket:inferAreaBucket(source)
  };
}
function areaBucketKey(area){ return inferAreaBucket(area); }
function itemBucketKey(item, area){
  return validBucketKey(item && item.bucket) || areaBucketKey(area);
}
function bucketMetaByKey(key){
  return REVENUE_BUCKETS[validBucketKey(key)] || REVENUE_BUCKETS[BUCKET_ORDER[0]] || {key:"", label:"분류 없음", desc:""};
}
function bucketClass(key){
  return ["direct","future","support"].includes(key) ? key : "future";
}
function bucketChipForKey(key, extraClass=""){
  const meta = bucketMetaByKey(key);
  const cls = bucketClass(meta.key);
  return `<span class="tn-bucket-chip ${cls}${extraClass ? " " + extraClass : ""}" title="${escapeHtml(meta.desc)}">${escapeHtml(meta.label)}</span>`;
}
function bucketChipHtml(area, extraClass=""){
  return bucketChipForKey(areaBucketKey(area), extraClass);
}
function cloneImportanceConfig(config){
  const base = JSON.parse(JSON.stringify(DEFAULT_IMPORTANCE_CONFIG));
  const src = config && typeof config === "object" ? config : {};
  ["highScore","highAmount","highProb","midScore","midProb"].forEach(k=>{
    const v = Number(src[k]);
    if(Number.isFinite(v) && v >= 0) base[k] = v;
  });
  base.bucketWeights = {...base.bucketWeights, ...(src.bucketWeights || {})};
  BUCKET_ORDER.forEach(k=>{
    const v = Number(base.bucketWeights[k]);
    const metaWeight = Number(REVENUE_BUCKETS[k] && REVENUE_BUCKETS[k].weight);
    base.bucketWeights[k] = Number.isFinite(v) && v >= 0 ? v : (Number.isFinite(metaWeight) ? metaWeight : (DEFAULT_IMPORTANCE_CONFIG.bucketWeights[k] ?? 1));
  });
  base.stageWeights = {...base.stageWeights, ...(src.stageWeights || {})};
  return base;
}
/* dealImportance()는 항목 하나하나, 그리고 렌더링할 때마다 호출된다. 그때마다 기본 설정을
   통째로 깊은 복사하면 목록이 커질수록 렌더링이 눈에 띄게 느려지므로 정규화 결과를 캐시한다.
   importanceConfig를 새 객체로 교체하면 자동으로, 직접 수정했다면 invalidateImportanceCache()로 무효화한다. */
let importanceConfigCache = null;
let importanceConfigCacheSource = null;
function invalidateImportanceCache(){ importanceConfigCache = null; importanceConfigCacheSource = null; }
function effectiveImportanceConfig(){
  if(importanceConfigCache && importanceConfigCacheSource === importanceConfig) return importanceConfigCache;
  importanceConfigCache = cloneImportanceConfig(importanceConfig);
  importanceConfigCacheSource = importanceConfig;
  return importanceConfigCache;
}
async function loadImportanceConfig(){
  importanceConfig = cloneImportanceConfig(await storageGet("tinico:importance:config"));
}
async function loadStageSettings(){
  const saved = await storageGet("tinico:settings:stages");
  if(Array.isArray(saved) && saved.length){
    STAGE_OPTIONS = saved.map(s=>String(s.label || s.key || "").trim()).filter(Boolean);
    STAGE_COLORS = {};
    saved.forEach((s, idx)=>{
      const label = String(s.label || s.key || "").trim();
      if(label) STAGE_COLORS[label] = safeCssColor(s.color,PALETTE[idx % PALETTE.length].color);
    });
  }
  if(!STAGE_OPTIONS.length) STAGE_OPTIONS = ["리드"];
  /* 통계·확률 로직이 참조하는 기본 단계(수주·보류·실주)는 저장 데이터에 없더라도 항상 복원 */
  let reservedRestored = false;
  for(const label of RESERVED_STAGES){
    if(!STAGE_OPTIONS.includes(label)){
      STAGE_OPTIONS.push(label);
      STAGE_COLORS[label] = RESERVED_STAGE_COLORS[label];
      reservedRestored = true;
    }
  }
  if(reservedRestored) await saveStageSettings();
}
/* 화면 값을 먼저 바꾼 뒤 저장하는 동작의 공통 처리.
   저장이 실패하면 바꾸기 전으로 되돌리고 알려 화면과 DB가 어긋난 채 남지 않게 한다. */
async function saveOrRollback(save, undo, failureMessage){
  try{
    await save();
    return true;
  }catch(error){
    undo();
    console.error("save failed", error);
    showToast(error?.message || failureMessage || "저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
    return false;
  }
}
function stageSettingsValue(){
  return STAGE_OPTIONS.map((label, idx)=>({
    key:label, label, color:safeCssColor(STAGE_COLORS[label],PALETTE[idx % PALETTE.length].color)
  }));
}
async function saveStageSettings(){
  await storageSet("tinico:settings:stages", stageSettingsValue());
}
/* ---------- 설정 저장의 원자성 ----------
   단계·분류·그룹·영업 항목은 서로를 참조한다. 예를 들어 분류를 지우면 그 분류를 쓰던
   그룹과 영업 항목도 함께 옮겨야 하는데, 저장을 나눠 보내면 중간에 실패했을 때
   "설정에는 없는 분류를 항목이 가리키는" 상태가 DB에 남는다.
   그래서 한 번의 트랜잭션으로 함께 저장하고, 실패하면 화면 값도 원래대로 되돌린다. */
function settingsSnapshot(){
  return {
    stageOptions:[...STAGE_OPTIONS], stageColors:{...STAGE_COLORS},
    buckets:deepCopy(REVENUE_BUCKETS), bucketOrder:[...BUCKET_ORDER],
    importance:deepCopy(importanceConfig),
    areas:deepCopy(AREAS), stageData:deepCopy(stageData)
  };
}
function restoreSettingsSnapshot(snapshot){
  STAGE_OPTIONS=snapshot.stageOptions; STAGE_COLORS=snapshot.stageColors;
  REVENUE_BUCKETS=snapshot.buckets; BUCKET_ORDER=snapshot.bucketOrder;
  importanceConfig=snapshot.importance; invalidateImportanceCache();
  AREAS=snapshot.areas;
  Object.keys(stageData).forEach(key=>{ if(!Object.hasOwn(snapshot.stageData,key)) delete stageData[key]; });
  Object.entries(snapshot.stageData).forEach(([key,value])=>{ stageData[key]=value; });
}
/* parts: {stages, buckets, importance, areas, areaKeys:[...]} 중 바뀐 것만 지정한다 */
async function saveSettingsTogether(parts, snapshot, failureMessage){
  const entries=[];
  if(parts.stages) entries.push({key:"tinico:settings:stages", value:stageSettingsValue()});
  if(parts.buckets) entries.push({key:"tinico:settings:buckets", value:bucketSettingsValue()});
  if(parts.importance){ importanceConfig=cloneImportanceConfig(importanceConfig); invalidateImportanceCache(); entries.push({key:"tinico:importance:config", value:importanceConfig}); }
  if(parts.areas) entries.push({key:"tinico:areas", value:AREAS.map(storedAreaValue)});
  (parts.areaKeys||[]).forEach(areaKey=>entries.push({key:"tinico:stage:"+areaKey, value:stageData[areaKey]||[]}));
  if(!entries.length) return true;
  try{
    await storageTransaction(entries);
    return true;
  }catch(error){
    restoreSettingsSnapshot(snapshot);
    console.error("settings save failed", error);
    showToast(error?.message || failureMessage || "설정 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
    return false;
  }
}
async function loadBucketSettings(){
  const saved = await storageGet("tinico:settings:buckets");
  if(Array.isArray(saved) && saved.length){
    REVENUE_BUCKETS = {};
    BUCKET_ORDER = [];
    saved.forEach((b, idx)=>{
      const key = String(b.key || safeKeyFromLabel(b.label, "bucket")).trim();
      const label = String(b.label || key).trim();
      if(!key || !label || REVENUE_BUCKETS[key]) return;
      const weight = Number(b.weight);
      REVENUE_BUCKETS[key] = {
        key, label,
        desc:String(b.desc || "").trim(),
        weight:Number.isFinite(weight) && weight >= 0 ? weight : (idx === 0 ? 1.25 : idx === 1 ? 1 : 0.6),
      };
      BUCKET_ORDER.push(key);
    });
  }
  if(!BUCKET_ORDER.length){
    REVENUE_BUCKETS = {
      direct:{key:"direct", label:"매출 직결", desc:"기존 거래처, 단기 발주, 견적·수주 전환이 가까운 그룹", weight:1.25},
      future:{key:"future", label:"추후 매출 가능", desc:"샘플 검증, 해외 채널, 전략 후보 등 향후 매출 가능성이 있는 그룹", weight:1.0},
      support:{key:"support", label:"연구·검토·지원", desc:"연구, 홍보자료, 국책·재무 확인처럼 직접 매출과 거리가 있는 그룹", weight:0.6},
    };
    BUCKET_ORDER = ["direct","future","support"];
  }
  importanceConfig.bucketWeights = {...importanceConfig.bucketWeights};
  BUCKET_ORDER.forEach(key=>{
    if(!Number.isFinite(Number(importanceConfig.bucketWeights[key]))){
      importanceConfig.bucketWeights[key] = REVENUE_BUCKETS[key].weight ?? 1;
    }
  });
  invalidateImportanceCache();
}
function bucketSettingsValue(){
  return BUCKET_ORDER.map(key=>({
    key,
    label:REVENUE_BUCKETS[key].label,
    desc:REVENUE_BUCKETS[key].desc,
    weight:Number(importanceConfig.bucketWeights[key] ?? REVENUE_BUCKETS[key].weight ?? 1),
  }));
}

/* ---------- 네비게이션 / 라우팅 ---------- */
function activeTabKeyFor(viewKey){
  if(MODULES.some(m=>m.key === viewKey)) return viewKey;
  return "pipeline"; /* 그룹 상세는 파이프라인 소속으로 표시 */
}
function updateNavActive(viewKey){
  const tabKey = activeTabKeyFor(viewKey);
  document.querySelectorAll("#tn-tabs .tn-tab").forEach(t=>t.classList.toggle("active", t.dataset.key === tabKey));
  document.querySelectorAll("#tn-bottombar .tn-btab").forEach(t=>t.classList.toggle("active", t.dataset.key === tabKey));
}
function showView(key){
  document.querySelectorAll("#tn-root .tn-view").forEach(v=>v.classList.remove("active"));
  const target = document.getElementById("view-" + key);
  if(target) target.classList.add("active");
  updateNavActive(key);
  if(key === "pipeline") renderPipeline();
  if(key === "activity") renderActivityView();
  if(key === "roadmap") renderRoadmap();
  if(key === "calendar"){ renderCalendar(); if(googleCalendarAccessToken) loadGoogleCalendarEvents(false,false); }
  if(key === "home") applyDashboardCollapse();
  if(key === "settings") setSettingsMode(settingsMode);
  window.scrollTo({top:0, behavior:"smooth"});
  /* location.hash 대입은 hashchange를 재발화시켜 같은 화면을 두 번 렌더링하므로 replaceState 사용 */
  const nextHash = key === "home" ? "" : "#" + key;
  if((location.hash || "") !== nextHash) history.replaceState(null, "", location.pathname + location.search + nextHash);
}
function routeFromHash(){
  const key = location.hash.replace("#","") || "home";
  showView(document.getElementById("view-"+key) ? key : "home");
}
function buildNav(){
  const tabs = document.getElementById("tn-tabs");
  const bottom = document.getElementById("tn-bottombar");
  tabs.innerHTML = ""; bottom.innerHTML = "";
  MODULES.forEach(m=>{
    const t = document.createElement("button");
    t.className = "tn-tab";
    t.dataset.key = m.key;
    t.textContent = m.label;
    t.addEventListener("click", ()=>showView(m.key));
    tabs.appendChild(t);

    const b = document.createElement("button");
    b.className = "tn-btab";
    b.dataset.key = m.key;
    b.textContent = m.label;
    b.addEventListener("click", ()=>showView(m.key));
    bottom.appendChild(b);
  });
}

/* 대시보드를 다시 그릴 때마다 속성 선택자로 화면 전체를 훑지 않도록 찾은 요소를 기억해 둔다 */
const dashboardPanelCache=new Map();
function dashboardPanel(section){
  const cached=dashboardPanelCache.get(section);
  if(cached&&cached.isConnected)return cached;
  const found=document.querySelector(`[data-collapse-section="${section}"]`);
  if(found)dashboardPanelCache.set(section,found);
  return found;
}
function setDashboardCollapsed(section,collapsed,persist=false){
  const panel=dashboardPanel(section);
  const button=document.getElementById(section==="today"?"tn-today-collapse":"tn-groups-collapse");
  if(!panel||!button)return;
  panel.classList.toggle("collapsed",!!collapsed);
  button.setAttribute("aria-expanded",String(!collapsed));
  const label=button.querySelector("span"); if(label)label.textContent=collapsed?"펼치기":"접기";
  if(persist){
    appSettings.dashboardCollapse={...(appSettings.dashboardCollapse||{}),[section]:!!collapsed};
    saveAppSettings().catch(error=>console.error("dashboard collapse save failed", error));
  }
}
function toggleDashboardSection(section){
  const panel=document.querySelector(`[data-collapse-section="${section}"]`); if(!panel)return;
  setDashboardCollapsed(section,!panel.classList.contains("collapsed"),true);
}
function applyDashboardCollapse(){
  const state=appSettings.dashboardCollapse||{};
  setDashboardCollapsed("today",!!state.today,false);
  setDashboardCollapsed("groups",!!state.groups,false);
}

/* ---------- 대시보드 영역 순서 변경 ---------- */
const DASHBOARD_ITEM_KEYS=["analytics","summary","today","ai","groups"];
function normalizedDashboardOrder(){
  const saved=Array.isArray(appSettings.dashboardOrder)?appSettings.dashboardOrder:[];
  return [...new Set([...saved,...DASHBOARD_ITEM_KEYS])].filter(k=>DASHBOARD_ITEM_KEYS.includes(k));
}
function applyDashboardOrder(){
  const layout=document.getElementById("tn-dashboard-layout");if(!layout)return;
  const wanted=normalizedDashboardOrder();
  const current=[...layout.querySelectorAll(":scope > [data-dashboard-item]")];
  /* 이미 원하는 순서면 DOM을 건드리지 않는다 (옮기면 매번 화면 재배치가 일어난다) */
  if(current.length===wanted.length&&current.every((el,index)=>el.dataset.dashboardItem===wanted[index]))return;
  const byKey=new Map(current.map(el=>[el.dataset.dashboardItem,el]));
  wanted.forEach(key=>{const item=byKey.get(key);if(item)layout.appendChild(item);});
}
async function saveDashboardOrderFromDom(){
  const layout=document.getElementById("tn-dashboard-layout");if(!layout)return;
  appSettings.dashboardOrder=[...layout.querySelectorAll(":scope > [data-dashboard-item]")].map(el=>el.dataset.dashboardItem).filter(Boolean);
  await saveAppSettings();
}
function moveDashboardItemByKeyboard(item,direction){
  const layout=document.getElementById("tn-dashboard-layout");if(!layout||!item)return;
  const visible=[...layout.querySelectorAll(":scope > [data-dashboard-item]")].filter(el=>!el.hidden);
  const idx=visible.indexOf(item);if(idx<0)return;
  if(direction<0&&idx>0)layout.insertBefore(item,visible[idx-1]);
  else if(direction>0&&idx<visible.length-1)layout.insertBefore(visible[idx+1],item);
  else return;
  saveDashboardOrderFromDom().catch(error=>console.error("dashboard order save failed", error));
  item.querySelector(".tn-dashboard-drag-handle")?.focus();
}
function initDashboardReorder(){
  const layout=document.getElementById("tn-dashboard-layout");if(!layout||layout.dataset.reorderReady==="1")return;
  layout.dataset.reorderReady="1";
  applyDashboardOrder();
  let drag=null;
  const reset=()=>{
    if(!drag)return;
    const {item,placeholder,handle}=drag;
    placeholder.replaceWith(item);
    item.classList.remove("tn-dashboard-dragging");
    Object.assign(item.style,{position:"",left:"",top:"",width:"",height:"",margin:"",pointerEvents:"",transform:""});
    try{handle.releasePointerCapture?.(drag.pointerId);}catch(e){}
    drag=null;saveDashboardOrderFromDom().catch(error=>console.error("dashboard order save failed", error));
  };
  layout.addEventListener("pointerdown",e=>{
    const handle=e.target.closest(".tn-dashboard-drag-handle");if(!handle)return;
    if(e.button!==undefined&&e.button!==0)return;
    const item=handle.closest("[data-dashboard-item]");if(!item||item.hidden)return;
    e.preventDefault();
    const rect=item.getBoundingClientRect();
    const placeholder=document.createElement("div");
    placeholder.className="tn-dashboard-placeholder";
    placeholder.style.height=rect.height+"px";
    placeholder.dataset.dashboardPlaceholder="1";
    item.after(placeholder);
    drag={item,placeholder,handle,pointerId:e.pointerId,offsetY:e.clientY-rect.top};
    item.classList.add("tn-dashboard-dragging");
    Object.assign(item.style,{position:"fixed",left:rect.left+"px",top:rect.top+"px",width:rect.width+"px",height:rect.height+"px",margin:"0",pointerEvents:"none"});
    try{handle.setPointerCapture?.(e.pointerId);}catch(err){}
  });
  window.addEventListener("pointermove",e=>{
    if(!drag||e.pointerId!==drag.pointerId)return;
    e.preventDefault();
    const {item,placeholder,offsetY}=drag;
    const nextTop=Math.max(8,Math.min(window.innerHeight-item.offsetHeight-8,e.clientY-offsetY));
    item.style.top=nextTop+"px";
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.("[data-dashboard-item]");
    if(target&&target!==item&&target!==placeholder&&target.parentElement===layout&&!target.hidden){
      const r=target.getBoundingClientRect();
      if(e.clientY<r.top+r.height/2)layout.insertBefore(placeholder,target);
      else layout.insertBefore(placeholder,target.nextSibling);
    }
    const edge=64;
    if(e.clientY<edge)window.scrollBy({top:-12,behavior:"auto"});
    else if(e.clientY>window.innerHeight-edge)window.scrollBy({top:12,behavior:"auto"});
  },{passive:false});
  window.addEventListener("pointerup",e=>{if(drag&&e.pointerId===drag.pointerId)reset();});
  window.addEventListener("pointercancel",e=>{if(drag&&e.pointerId===drag.pointerId)reset();});
  layout.addEventListener("keydown",e=>{
    const handle=e.target.closest(".tn-dashboard-drag-handle");if(!handle)return;
    const item=handle.closest("[data-dashboard-item]");
    if(e.key==="ArrowUp"){e.preventDefault();moveDashboardItemByKeyboard(item,-1);}
    if(e.key==="ArrowDown"){e.preventDefault();moveDashboardItemByKeyboard(item,1);}
  });
}

/* ---------- 공통 유틸 ---------- */
function fmtAmount(mil){
  if(!mil && mil !== 0) return "0";
  if(mil >= 10000) return (mil/10000).toFixed(1).replace(/\.0$/,"") + "조";
  if(mil >= 100) return (mil/100).toFixed(1).replace(/\.0$/,"") + "억";
  return mil + "백만";
}
function todayStr(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function daysUntil(dateStr){
  if(!dateStr) return null;
  const t = new Date(todayStr());
  const d = new Date(dateStr);
  /* 손상된 날짜 문자열이 NaN으로 번져 알림·정렬을 깨뜨리지 않게 null 처리 */
  if(Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return null;
  return Math.round((d - t) / 86400000);
}
function escapeHtml(s){
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
/* 브라우저 기본 alert 대신 흐름을 끊지 않는 상단 알림 표시 (클릭 시 닫힘, 최대 3개 유지) */
let toastStackEl=null;
function showToast(message, type="warn", duration=6000){
  const text=String(message ?? "").trim();
  if(!text) return;
  if(!toastStackEl || !toastStackEl.isConnected){
    toastStackEl=document.createElement("div");
    toastStackEl.className="tn-notice-stack";
    toastStackEl.setAttribute("role","status");
    toastStackEl.setAttribute("aria-live","polite");
    (document.getElementById("tn-root") || document.body).appendChild(toastStackEl);
  }
  const item=document.createElement("div");
  item.className="tn-notice"+(type==="info"?" info":"");
  item.textContent=text;
  item.title="클릭하면 닫힙니다";
  item.addEventListener("click",()=>item.remove());
  toastStackEl.appendChild(item);
  while(toastStackEl.children.length>3) toastStackEl.firstElementChild.remove();
  setTimeout(()=>item.remove(), duration);
}
/* PostgreSQL jsonb는 객체 키 순서를 보존하지 않으므로, 서버에서 읽어온 값과 정규화 결과를
   단순 JSON.stringify로 비교하면 항상 다르다고 판정된다. 키를 정렬한 표준형으로 비교해
   실제 내용이 같으면 불필요한 저장(왕복)을 건너뛴다. */
function canonicalJson(value){
  if(value === undefined) return "null";
  if(Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if(value !== null && typeof value === "object"){
    return "{" + Object.keys(value)
      .filter(key=>value[key] !== undefined)
      .sort()
      .map(key=>JSON.stringify(key) + ":" + canonicalJson(value[key]))
      .join(",") + "}";
  }
  return JSON.stringify(value ?? null);
}
function sameStoredValue(left, right){ return canonicalJson(left) === canonicalJson(right); }

/* 타이핑마다 무거운 목록을 다시 그리지 않도록 검색 입력을 짧게 모아서 처리 */
function debounce(fn, wait=200){
  let timer=null;
  return (...args)=>{
    clearTimeout(timer);
    timer=setTimeout(()=>fn(...args), wait);
  };
}

/* ---------- 그룹 / 딜 데이터 ---------- */
async function loadAreas(){
  const stored = await storageGet("tinico:areas");
  const source = stored || DEFAULT_AREAS.map(({seed, ...rest})=>rest);
  const areas = source.map(normalizeArea);
  /* 정규화 결과가 저장본과 같으면 접속할 때마다 같은 값을 다시 올리지 않는다 */
  if(!sameStoredValue(stored, areas)) await queueBootWrite("tinico:areas", areas);
  return areas;
}
async function saveAreas(){
  await storageSet("tinico:areas", AREAS.map(storedAreaValue));
}
function storedAreaValue(a){return {
    key:a.key, icon:a.icon, color:a.color, colorSoft:a.colorSoft,
    title:a.title, subtitle:a.subtitle, bucket:areaBucketKey(a)
  };}
async function moveGroupToTrash(area){
  const key="tinico:stage:"+area.key;
  const entry={id:uid(),type:"group",label:area.title,deletedAt:nowIso(),deletedBy:trashActor(),payload:deepCopy({area,items:stageData[area.key]||[]}),meta:{}};
  const result=await storageTransaction([{key:"tinico:trash",value:[entry,...trashData].slice(0,200)},{key:"tinico:areas",value:AREAS.filter(item=>item.key!==area.key).map(storedAreaValue)},{key,value:null,remove:true}]);
  trashData=result.records["tinico:trash"].value;AREAS=result.records["tinico:areas"].value.map(normalizeArea);delete stageData[area.key];
  showUndo(`${area.title}을(를) 휴지통으로 이동했습니다.`,entry.id);
}

function normalizeItem(item){
  /* 저장 데이터에 null·문자열이 섞여 있어도 부팅이 중단되지 않게 방어 */
  item = item && typeof item === "object" ? item : {};
  const base = {
    contactName:"", contactRole:"", contactPhone:"", contactEmail:"", linkedContactIds:[],
    internalOwner:"", collaborators:"",
    amount:"", prob:"", lastContact:"", nextAction:"",
    goal:"", action:"", internalNote:"", note:"", desc:"", tag:"", bucket:"", importanceOverride:"",
    activities:[], closeReason:"", closeAmount:"", closeDate:"", deliveryDate:"", reopenDate:"", competitor:"", advancedOpen:false,
    ...item,
  };
  base.stage = normalizeStage(item.stage || item.status);
  base.bucket = validBucketKey(item.bucket) ? item.bucket : "";
  base.importanceOverride = ["high","mid","low"].includes(item.importanceOverride) ? item.importanceOverride : "";
  base.linkedContactIds = Array.isArray(item.linkedContactIds) ? [...new Set(item.linkedContactIds.filter(Boolean))] : [];
  base.activities = Array.isArray(item.activities) ? item.activities.map(normalizeActivity).sort((a,b)=>activityDateValue(b).localeCompare(activityDateValue(a))) : [];
  return base;
}

function legacyPipelineSeedWasEdited(item, legacySeed){
  if(!item||!legacySeed)return true;
  const textFields=[
    "title","tag","contactName","contactRole","contactPhone","contactEmail",
    "internalOwner","collaborators","amount","prob","lastContact","nextAction",
    "desc","goal","action","internalNote","note","importanceOverride",
    "closeReason","closeAmount","closeDate","deliveryDate","reopenDate","competitor"
  ];
  if(normalizeStage(item.stage)!==normalizeStage(legacySeed.stage))return true;
  if(textFields.some(field=>String(item[field]??"").trim()!==String(legacySeed[field]??"").trim()))return true;
  if(Array.isArray(item.activities)&&item.activities.length)return true;
  if(Array.isArray(item.linkedContactIds)&&item.linkedContactIds.length)return true;
  return false;
}
async function cleanupLegacyDefaultPipelineItems(){
  const migrationKey="tinico:pipeline:migration:remove_incomplete_default_seeds_v1";
  if(await storageGet(migrationKey))return 0;
  let removed=0;
  for(const area of AREAS){
    const current=stageData[area.key]||[];
    const kept=current.filter(item=>{
      const legacy=LEGACY_PIPELINE_SEED_BY_ID.get(item.id);
      if(!legacy||legacy.areaKey!==area.key)return true;
      if(legacyPipelineSeedWasEdited(item,legacy.item))return true;
      removed++;
      return false;
    });
    if(kept.length!==current.length){
      stageData[area.key]=kept;
      await queueBootWrite("tinico:stage:"+area.key,kept);
    }
  }
  await queueBootWrite(migrationKey,{appliedAt:nowIso(),removed});
  return removed;
}

async function loadStageItems(areaKey){
  let data = await storageGet("tinico:stage:" + areaKey);
  const stored = data;
  if(!data){
    const defaultDef = DEFAULT_AREAS.find(a=>a.key === areaKey);
    data = [];
    if(defaultDef){
      for(const seedItem of defaultDef.seed){
        const legacy = await storageGet("tinico:" + seedItem.id);
        data.push({ ...seedItem, ...(legacy || {}) });
      }
    }
  }
  const area = findAreaByKey(areaKey) || DEFAULT_AREAS.find(a=>a.key === areaKey);
  data = data.map(x=>{
    const item = normalizeItem(x);
    if(!validBucketKey(item.bucket)) item.bucket = areaBucketKey(area);
    return item;
  });
  if(!sameStoredValue(stored, data)) await queueBootWrite("tinico:stage:" + areaKey, data);
  return data;
}
function normalizeSupportTask(raw){
  const item = raw && typeof raw === "object" ? raw : {};
  const status = SUPPORT_TASK_STATUSES.includes(item.status) ? item.status : (item.checked ? "완료" : "미착수");
  let progress = Number(item.progress);
  if(!Number.isFinite(progress)) progress = status === "완료" ? 100 : 0;
  progress = Math.max(0, Math.min(100, Math.round(progress)));
  if(status === "완료") progress = 100;
  return {
    id:item.id || uid(), title:item.title || "새 실행과제",
    type:SUPPORT_TASK_TYPES.includes(item.type) ? item.type : "내부 확인",
    purpose:item.purpose || item.desc || "", deliverable:item.deliverable || "",
    owner:item.owner || "", collaborators:item.collaborators || "",
    status, priority:SUPPORT_TASK_PRIORITIES.includes(item.priority) ? item.priority : "중간",
    startDate:item.startDate || "", dueDate:item.dueDate || "", progress,
    nextAction:item.nextAction || "", blocker:item.blocker || "", notes:item.notes || "",
    relatedAreaKey:item.relatedAreaKey || "", relatedDealId:item.relatedDealId || "", inheritOwner:!!item.inheritOwner,
    completedAt:item.completedAt || (status === "완료" ? todayStr() : ""),
    createdAt:item.createdAt || nowIso(), updatedAt:item.updatedAt || nowIso(), checked:status === "완료"
  };
}
function isSupportTaskDone(item){ return normalizeSupportTask(item).status === "완료"; }
async function saveRoadmapData(){ await storageSet("tinico:stage:roadmap", roadmapData); }
async function loadRoadmap(){
  let data = await storageGet("tinico:stage:roadmap");
  const stored = data;
  if(!Array.isArray(data)){
    data = [];
    for(const seedItem of ROADMAP_SEED){
      const legacy = await storageGet("tinico:roadmap:" + seedItem.id);
      data.push({ ...seedItem, ...(legacy || {}) });
    }
  }
  data = data.map(normalizeSupportTask);
  if(!sameStoredValue(stored, data)) await queueBootWrite("tinico:stage:roadmap", data);
  return data;
}
function normalizeManualSection(raw, idx=0){
  const item = raw && typeof raw === "object" ? raw : {};
  return {id:item.id || uid(), category:item.category || "기타", title:item.title || "새 매뉴얼", format:item.format === "paragraph" ? "paragraph" : "list", content:String(item.content || ""), order:Number.isFinite(Number(item.order)) ? Number(item.order) : idx, updatedAt:item.updatedAt || nowIso()};
}
/* 매뉴얼 마이그레이션 표시 키 — 접속마다 하나씩 순차 조회하면 왕복이 그만큼 쌓이므로
   한 번에 병렬로 읽고, 새로 기록할 표시도 마지막에 모아서 한 번에 저장한다. */
const MANUAL_MIGRATION_STATE_KEY = "tinico:manual:migrations";
const MANUAL_MIGRATION_KEYS = [
  "tinico:manual:migration:calendar_v1",
  "tinico:manual:migration:simple_ui_v4",
  "tinico:manual:migration:calendar_crud_v1",
  "tinico:manual:migration:illustrated_guide_202608_v1",
  "tinico:manual:migration:admin_backup_audit_202608_v1",
  "tinico:manual:migration:camera_ocr_202608_v1",
  "tinico:manual:migration:google_light_sync_202608_v1",
  "tinico:manual:migration:ui_reliability_202608_v1",
  "tinico:manual:migration:calendar_fold_contact_activity_202608_v1",
  "tinico:manual:migration:contact_paging_csv_202609_v1",
  "tinico:manual:migration:deal_contact_combo_202609_v1",
  "tinico:manual:migration:deal_contact_multi_202609_v1",
  "tinico:manual:migration:xlsx_backup_trash_fold_202609_v1"
];
async function loadManualSections(){
  /* 어떤 매뉴얼 마이그레이션이 끝났는지는 키 하나에 모아 둔다.
     예전 버전은 키 13개로 나눠 저장했으므로, 모아 둔 기록이 없을 때만 한 번 읽어 합친다. */
  const [stored, consolidated] = await Promise.all([
    storageGet("tinico:manual:sections"),
    storageGet(MANUAL_MIGRATION_STATE_KEY)
  ]);
  let applied = consolidated && typeof consolidated === "object" && !Array.isArray(consolidated) ? {...consolidated} : null;
  const upgradingFromSeparateKeys = !applied;
  if(upgradingFromSeparateKeys){
    const legacy = await Promise.all(MANUAL_MIGRATION_KEYS.map(key=>storageGet(key)));
    applied = {};
    MANUAL_MIGRATION_KEYS.forEach((key, index)=>{ if(legacy[index]) applied[key] = legacy[index]; });
  }
  const migrationFlags = new Map(MANUAL_MIGRATION_KEYS.map(key=>[key, applied[key]]));
  let migrationsChanged = upgradingFromSeparateKeys;
  const markMigrationApplied = (key, value)=>{ applied[key] = value; migrationsChanged = true; };
  let data = stored;
  if(!Array.isArray(data) || !data.length) data = deepCopy(DEFAULT_MANUAL_SECTIONS);
  data = data.map(normalizeManualSection).sort((a,b)=>a.order-b.order);
  const migrationKey = "tinico:manual:migration:calendar_v1";
  const migrated = migrationFlags.get(migrationKey);
  if(!migrated){
    ["manual_stages","manual_ai_knowledge","manual_calendar"].forEach(id=>{const def=DEFAULT_MANUAL_SECTIONS.find(x=>x.id===id);if(def&&!data.some(x=>x.id===id))data.push(normalizeManualSection(deepCopy(def),data.length));});
    const flow = data.find(x=>x.id === "manual_flow");
    if(flow && !/AI 봇에서 기능 사용법/.test(flow.content)) flow.content += "\nAI 봇에서 기능 사용법은 매뉴얼로, 현재 현황은 저장 데이터로 확인하고 관련 화면을 바로 엽니다.";
    const contacts = data.find(x=>x.id === "manual_contacts");
    if(contacts && !/가로형 명함의 네 모서리/.test(contacts.content)) contacts.content = "카메라 스캔에서는 가로형 명함의 네 모서리를 프레임에 맞추고 카메라를 명함과 평행하게 유지합니다.\n반사광과 그림자를 줄이고 글자가 선명해진 상태에서 촬영해야 OCR 정확도가 높아집니다.\n" + contacts.content;
    const settings = data.find(x=>x.id === "manual_settings");
    if(settings && !/AI 봇은 현재 저장된 매뉴얼/.test(settings.content)) settings.content += "\nAI 봇은 현재 저장된 매뉴얼의 제목·분류·내용을 검색하므로 운영 기준을 변경하면 매뉴얼도 함께 수정합니다.";
    markMigrationApplied(migrationKey,{appliedAt:nowIso()});
  }
  const uiManualMigrationKey = "tinico:manual:migration:simple_ui_v4";
  const uiManualMigrated = migrationFlags.get(uiManualMigrationKey);
  if(!uiManualMigrated){
    const updatedIds = [];
    DEFAULT_MANUAL_SECTIONS.forEach(def=>{
      const existingIndex = data.findIndex(item=>item.id === def.id);
      if(existingIndex >= 0){
        data[existingIndex] = normalizeManualSection({...deepCopy(def), order:data[existingIndex].order}, data[existingIndex].order);
      }else{
        data.push(normalizeManualSection(deepCopy(def), data.length));
      }
      updatedIds.push(def.id);
    });
    markMigrationApplied(uiManualMigrationKey,{appliedAt:nowIso(),updatedIds});
  }
  const calendarCrudManualMigrationKey = "tinico:manual:migration:calendar_crud_v1";
  const calendarCrudManualMigrated = migrationFlags.get(calendarCrudManualMigrationKey);
  if(!calendarCrudManualMigrated){
    const updatedIds=[];
    ["manual_settings","manual_calendar"].forEach(id=>{
      const def=DEFAULT_MANUAL_SECTIONS.find(item=>item.id===id);if(!def)return;
      const existingIndex=data.findIndex(item=>item.id===id);
      if(existingIndex>=0)data[existingIndex]=normalizeManualSection({...deepCopy(def),order:data[existingIndex].order},data[existingIndex].order);
      else data.push(normalizeManualSection(deepCopy(def),data.length));
      updatedIds.push(id);
    });
    markMigrationApplied(calendarCrudManualMigrationKey,{appliedAt:nowIso(),updatedIds});
  }
  const illustratedGuideManualMigrationKey = "tinico:manual:migration:illustrated_guide_202608_v1";
  const illustratedGuideManualMigrated = migrationFlags.get(illustratedGuideManualMigrationKey);
  if(!illustratedGuideManualMigrated){
    const updatedIds=[];
    DEFAULT_MANUAL_SECTIONS.forEach(def=>{
      const existingIndex=data.findIndex(item=>item.id===def.id);
      if(existingIndex>=0){
        data[existingIndex]=normalizeManualSection({...deepCopy(def),order:data[existingIndex].order},data[existingIndex].order);
      }else{
        data.push(normalizeManualSection(deepCopy(def),data.length));
      }
      updatedIds.push(def.id);
    });
    markMigrationApplied(illustratedGuideManualMigrationKey,{appliedAt:nowIso(),updatedIds});
  }
  const adminBackupManualMigrationKey="tinico:manual:migration:admin_backup_audit_202608_v1";
  const adminBackupManualMigrated=migrationFlags.get(adminBackupManualMigrationKey);
  if(!adminBackupManualMigrated){
    const updatedIds=[];
    ["manual_flow","manual_cloud_db","manual_settings","manual_operation","manual_troubleshooting"].forEach(id=>{
      const def=DEFAULT_MANUAL_SECTIONS.find(item=>item.id===id);if(!def)return;
      const existingIndex=data.findIndex(item=>item.id===id);
      if(existingIndex>=0)data[existingIndex]=normalizeManualSection({...deepCopy(def),order:data[existingIndex].order},data[existingIndex].order);
      else data.push(normalizeManualSection(deepCopy(def),data.length));
      updatedIds.push(id);
    });
    markMigrationApplied(adminBackupManualMigrationKey,{appliedAt:nowIso(),updatedIds});
  }
  const cameraOcrManualMigrationKey="tinico:manual:migration:camera_ocr_202608_v1";
  const cameraOcrManualMigrated=migrationFlags.get(cameraOcrManualMigrationKey);
  if(!cameraOcrManualMigrated){
    const additions={
      manual_contacts:"[카메라 스캔 개선 안내]\n카메라를 처음 열 때 허용하면 같은 페이지를 열어 둔 동안 승인받은 스트림을 재사용합니다. 새로고침·브라우저 종료 뒤에도 계속 허용하려면 브라우저의 이 사이트 카메라 권한을 ‘허용’으로 설정합니다.\n조명 부족·강한 반사·흐림이 약 1초간 계속되면 화면 위쪽 팝업에서 원인과 조치 방법을 안내합니다. 흐릴 때는 명함 화면을 한 번 눌러 다시 초점을 맞춥니다.\n‘명함 촬영’을 누르면 그 순간의 프레임이 즉시 저장되고 화면이 닫힌 뒤 OCR이 이어집니다. OCR 결과는 원본 명함과 비교하여 확인합니다.",
      manual_troubleshooting:"[카메라·명함 인식 문제 해결]\n권한창이 반복되면 HTTPS 주소인지 확인하고 브라우저 사이트 설정에서 카메라를 ‘허용’으로 고정합니다. 시크릿 모드·브라우저 종료·회사 보안 정책에서는 다시 물을 수 있습니다.\n인식률이 낮으면 명함을 평평하게 놓고 프레임을 가득 채우며 그림자·반사를 줄입니다. 흐림 팝업이 뜨면 화면의 명함을 눌러 초점을 다시 맞춘 뒤 촬영합니다."
    };
    Object.entries(additions).forEach(([id,content])=>{
      const existing=data.find(item=>item.id===id);
      if(existing){if(!existing.content.includes(content.split("\n")[0]))existing.content += "\n\n"+content;}
      else{const def=DEFAULT_MANUAL_SECTIONS.find(item=>item.id===id);if(def)data.push(normalizeManualSection(deepCopy(def),data.length));}
    });
    markMigrationApplied(cameraOcrManualMigrationKey,{appliedAt:nowIso(),updatedIds:Object.keys(additions)});
  }
  const googleLightSyncManualMigrationKey="tinico:manual:migration:google_light_sync_202608_v1";
  const googleLightSyncManualMigrated=migrationFlags.get(googleLightSyncManualMigrationKey);
  if(!googleLightSyncManualMigrated){
    const updatedIds=[];
    ["manual_flow","manual_calendar","manual_troubleshooting"].forEach(id=>{
      const def=DEFAULT_MANUAL_SECTIONS.find(item=>item.id===id);if(!def)return;
      const existingIndex=data.findIndex(item=>item.id===id);
      if(existingIndex>=0)data[existingIndex]=normalizeManualSection({...deepCopy(def),order:data[existingIndex].order},data[existingIndex].order);
      else data.push(normalizeManualSection(deepCopy(def),data.length));
      updatedIds.push(id);
    });
    markMigrationApplied(googleLightSyncManualMigrationKey,{appliedAt:nowIso(),updatedIds});
  }
  const uiReliabilityManualMigrationKey="tinico:manual:migration:ui_reliability_202608_v1";
  const uiReliabilityManualMigrated=migrationFlags.get(uiReliabilityManualMigrationKey);
  if(!uiReliabilityManualMigrated){
    const id="manual_troubleshooting",def=DEFAULT_MANUAL_SECTIONS.find(item=>item.id===id);
    if(def){
      const existingIndex=data.findIndex(item=>item.id===id);
      if(existingIndex>=0)data[existingIndex]=normalizeManualSection({...deepCopy(def),order:data[existingIndex].order},data[existingIndex].order);
      else data.push(normalizeManualSection(deepCopy(def),data.length));
    }
    const reliability=data.find(item=>item.id===id);
    if(reliability&&!/저장 키 접두사/.test(reliability.content))reliability.content += "\n초기화 오류의 과거 원인 중 하나였던 카메라·Google 매뉴얼 저장 키 오타를 수정했습니다. 현재 버전은 모든 저장 키가 서버 승인 tinico: 접두사를 사용하는지 자동 테스트합니다.";
    markMigrationApplied(uiReliabilityManualMigrationKey,{appliedAt:nowIso(),updatedIds:[id]});
  }
  const workflowUiManualMigrationKey="tinico:manual:migration:calendar_fold_contact_activity_202608_v1";
  const workflowUiManualMigrated=migrationFlags.get(workflowUiManualMigrationKey);
  if(!workflowUiManualMigrated){
    const updatedIds=[];
    ["manual_flow","manual_pipeline"].forEach(id=>{
      const def=DEFAULT_MANUAL_SECTIONS.find(item=>item.id===id);if(!def)return;
      const existingIndex=data.findIndex(item=>item.id===id);
      if(existingIndex>=0)data[existingIndex]=normalizeManualSection({...deepCopy(def),order:data[existingIndex].order},data[existingIndex].order);
      else data.push(normalizeManualSection(deepCopy(def),data.length));
      updatedIds.push(id);
    });
    const calendarManual=data.find(item=>item.id==="manual_calendar");
    if(calendarManual&&!calendarManual.content.includes("간편 동기화 영역 오른쪽의 ‘접기/펼치기’"))calendarManual.content += "\nGoogle Calendar 간편 동기화 영역 오른쪽의 ‘접기/펼치기’를 누르면 연결 설정과 안내를 접거나 다시 열 수 있습니다. 접은 상태는 외부 DB에 저장되어 다음 접속에도 유지됩니다.";
    if(calendarManual)updatedIds.push("manual_calendar");
    const contactsManual=data.find(item=>item.id==="manual_contacts");
    if(contactsManual&&!contactsManual.content.includes("고객 담당자 연락처 직접 입력"))contactsManual.content += "\n파이프라인 상세에서는 등록된 연락처를 선택하거나 ‘고객 담당자 직접 입력’과 ‘고객 담당자 연락처 직접 입력’에 이름과 전화번호를 직접 기록할 수 있습니다.";
    if(contactsManual)updatedIds.push("manual_contacts");
    markMigrationApplied(workflowUiManualMigrationKey,{appliedAt:nowIso(),updatedIds});
  }
  const contactPagingManualMigrationKey="tinico:manual:migration:contact_paging_csv_202609_v1";
  if(!migrationFlags.get(contactPagingManualMigrationKey)){
    const addition="[목록 페이지와 리멤버 CSV 안내]\n연락처 목록은 한 화면에 20줄씩 보여 주고, 표 아래 페이지 번호로 이동합니다. « 첫 페이지, ‹ 이전, › 다음, » 마지막 페이지이며 오른쪽 드롭다운에서 20·30·40·50줄 중에 고를 수 있습니다. 고른 줄 수는 외부 DB에 저장되어 다음 접속에도 유지됩니다.\n표 머리글의 전체 선택은 지금 보고 있는 페이지의 연락처만 선택합니다. 다른 페이지까지 함께 선택하려면 페이지를 옮겨 다시 선택합니다.\n‘CSV 내보내기’는 리멤버의 Outlook CSV와 같은 열 구성으로 저장하므로 리멤버에 그대로 올릴 수 있습니다. 선택한 연락처가 있으면 그 연락처만, 없으면 전체를 내보냅니다.\n‘CSV 업로드’는 리멤버에서 내려받은 파일을 그대로 읽습니다. 이름·회사·부서·직함·휴대전화·이메일·등록일이 같은 칸으로 들어가며, 이메일이나 전화가 같은 연락처는 새로 만들지 않고 비어 있는 값만 채웁니다.";
    const contactsManual=data.find(item=>item.id==="manual_contacts");
    if(contactsManual){ if(!contactsManual.content.includes("[목록 페이지와 리멤버 CSV 안내]")) contactsManual.content += "\n\n"+addition; }
    else{ const def=DEFAULT_MANUAL_SECTIONS.find(item=>item.id==="manual_contacts"); if(def) data.push(normalizeManualSection(deepCopy(def),data.length)); }
    markMigrationApplied(contactPagingManualMigrationKey,{appliedAt:nowIso(),updatedIds:["manual_contacts"]});
  }
  const dealContactComboMigrationKey="tinico:manual:migration:deal_contact_combo_202609_v1";
  if(!migrationFlags.get(dealContactComboMigrationKey)){
    /* '고객 담당자 선택'과 '고객 담당자 직접 입력'이 '고객 담당자 입력' 한 칸으로 합쳐진 내용을 반영.
       사용자가 고친 다른 문장은 남기고 없어진 두 칸을 설명하던 문장만 교체한다 */
    const staleLine=/파이프라인 상세에서는 등록된 연락처를 선택하거나[^\n]*\n?/g;
    const staleSentence=/등록된 연락처를 선택하거나[^.\n]*직접 기록할 수 있습니다\./g;
    const inlineGuide="‘고객 담당자 입력’에 이름을 입력하면 등록된 연락처 중 일치하는 사람이 목록에 나타나고, 목록에서 고르면 ‘선택한 담당자’에 이름과 연락처가 쌓입니다. 여러 명을 고를 수 있고 맨 위 대표 담당자의 직함·연락처·이메일이 입력칸에 반영됩니다. 등록되지 않은 담당자는 이름과 바로 아래 ‘고객 담당자 연락처’를 직접 기록합니다.";
    const comboGuide="파이프라인 항목 상세의 ‘고객 담당자 입력’은 직접 입력과 등록된 연락처 선택을 겸합니다. 이름을 입력하면 이름·회사·직함·연락처·이메일이 일치하는 등록 연락처만 아래 목록에 나타나고, 목록에서 고르면 이름이 자동으로 완성되면서 직함·연락처·이메일이 함께 채워집니다. 목록에서 고르지 않으면 입력한 이름 그대로 저장됩니다.";
    ["manual_contacts","manual_pipeline"].forEach(id=>{
      const section=data.find(entry=>entry.id===id);
      if(!section)return;
      section.content=section.content.replace(staleLine,"").replace(staleSentence,inlineGuide);
      if(!section.content.includes("‘고객 담당자 입력’은 직접 입력과")) section.content=section.content.replace(/\s*$/,"")+"\n"+comboGuide;
    });
    markMigrationApplied(dealContactComboMigrationKey,{appliedAt:nowIso(),updatedIds:["manual_contacts","manual_pipeline"]});
  }
  const dealContactMultiMigrationKey="tinico:manual:migration:deal_contact_multi_202609_v1";
  if(!migrationFlags.get(dealContactMultiMigrationKey)){
    /* 고객 담당자를 여러 명 고를 수 있게 되면서 '선택한 담당자' 목록이 생긴 내용을 반영 */
    const multiGuide="목록에서 고른 담당자는 ‘고객 담당자 연락처’ 아래 ‘선택한 담당자’에 이름·소속·직함과 연락처로 쌓이며, 여러 명을 넣을 수 있습니다. 각 줄 오른쪽 ×로 선택을 해제하고, 맨 위 ‘대표’ 담당자의 직함·연락처·이메일이 위 입력칸에 반영됩니다. 한 명도 고르지 않으면 입력한 이름 그대로 저장됩니다.";
    ["manual_contacts","manual_pipeline"].forEach(id=>{
      const section=data.find(entry=>entry.id===id);
      if(section && !section.content.includes("‘선택한 담당자’에 이름·소속·직함과 연락처로 쌓이며")) section.content=section.content.replace(/\s*$/,"")+"\n"+multiGuide;
    });
    markMigrationApplied(dealContactMultiMigrationKey,{appliedAt:nowIso(),updatedIds:["manual_contacts","manual_pipeline"]});
  }
  const featureGuides={
    manual_contacts:"[대표 담당자 지정] 선택한 담당자 중 ‘대표로 지정’을 누르면 그 사람이 맨 위로 이동하고 상단 ‘저장’을 누르면 대표로 반영됩니다. 자동으로 채워진 직함·연락처·이메일도 새 대표 기준으로 바뀌며, 직접 수정한 값은 유지됩니다. 대표를 해제하면 다음 담당자가 대표가 됩니다.",
    manual_pipeline:"[대표 담당자 지정] ‘선택한 담당자’의 ‘대표로 지정’ 버튼으로 대표를 변경합니다. 지정한 담당자는 맨 위로 이동하며 상단 ‘저장’을 눌러야 다시 접속해도 유지됩니다.",
    manual_calendar:"[일정 담당자와 연관 업무] 새 일정 또는 일정 수정에서 담당자를 직접 입력하거나 기존 업무 담당자 목록에서 선택합니다. 연관 업무의 파이프라인과 지원 업무를 각각 선택하면 상태·담당자·연락일 또는 마감일·다음 할 일을 참고할 수 있습니다. 두 업무를 함께 연결하거나 ‘연결 안 함’을 선택할 수 있습니다. 일정의 담당자는 업무 선택으로 바뀌지 않습니다. 원본 업무가 이동되면 유일한 ID로 찾아 표시하고, 삭제된 업무는 찾을 수 없다는 안내와 함께 연결을 유지합니다. 이 정보는 CRM 일정에 저장됩니다."
  };
  Object.entries(featureGuides).forEach(([id,guide])=>{
    const section=data.find(item=>item.id===id);
    if(section&&!section.content.includes(guide))section.content+="\n"+guide;
  });
  const saveGuide="파이프라인·연락처는 입력 후 상단 ‘저장’을 눌러야 반영됩니다. 파이프라인 표에서는 행별 ‘저장’을 사용합니다. 신규 항목, 담당자 선택·대표 변경, 명함 인식 결과도 저장 전까지 임시 입력입니다. ‘취소’나 닫기를 누르면 미저장 변경을 버릴지 확인하며, ‘저장 실패’가 보이면 입력을 유지한 채 ‘저장’을 다시 누릅니다.";
  data.forEach(section=>{
    if(!["manual_flow","manual_terms","manual_pipeline","manual_contacts","manual_troubleshooting"].includes(section.id))return;
    section.content=section.content.split("\n").map(line=>{
      if(/자동.?저장|진행 중인 저장은 완료된 뒤 닫/.test(line))return saveGuide;
      return line.replace("저장과 문자 인식은 이어서 진행되므로 연락처 화면의 인식 상태를 확인합니다.","문자 인식 결과를 확인한 뒤 연락처의 ‘저장’을 눌러 등록합니다.");
    }).filter((line,index,lines)=>line!==saveGuide||lines.indexOf(line)===index).join("\n");
    if(!section.content.includes(saveGuide))section.content+="\n"+saveGuide;
  });
  const pipelineManual=data.find(section=>section.id==="manual_pipeline");
  const kpiGuide="[파이프라인 분석 목록] 대시보드의 수주율·활성 항목 비중·후속조치 지연·실행과제 완료를 누르면 계산 대상 목록이 열립니다. 수주율은 수주·보류·실주, 실행과제 완료는 전체 과제의 상태를 표시하며 각 항목을 눌러 상세 화면으로 이동합니다. 보드에서 카드를 끌어 단계를 바꾼 뒤에는 상세 화면에서 저장해야 반영됩니다.";
  if(pipelineManual&&!pipelineManual.content.includes(kpiGuide))pipelineManual.content+="\n"+kpiGuide;
  const xlsxBackupMigrationKey="tinico:manual:migration:xlsx_backup_trash_fold_202609_v1";
  if(!migrationFlags.get(xlsxBackupMigrationKey)){
    const guides={
      manual_settings:"[백업 파일과 휴지통 안내]\n관리자 인증 뒤 ‘내려받기’를 누르면 백업이 Excel 파일(.xlsx)로 저장됩니다. ‘백업정보’, ‘저장데이터’, ‘변경로그’ 세 시트로 되어 있어 Excel에서 바로 열어 볼 수 있습니다. 한 칸에 들어가지 않는 긴 값은 ‘조각’ 번호를 붙여 여러 줄로 나뉘며 복원할 때 자동으로 합쳐집니다. 셀을 직접 고치면 복원되지 않을 수 있으니 확인 용도로만 사용합니다.\n‘복원하기’는 내려받은 .xlsx 파일을 선택하면 됩니다. 예전 버전에서 내려받은 .json 백업도 그대로 선택할 수 있습니다.\n휴지통 오른쪽의 ‘접기/펼치기’로 삭제 목록을 접어 둘 수 있습니다. 접으면 버튼에 남은 항목 수가 함께 표시되고, 접은 상태는 외부 DB에 저장되어 다음 접속에도 유지됩니다.",
      manual_operation:"백업은 Excel 파일(.xlsx)로 내려받아 별도 폴더에 보관합니다. 파일명의 날짜·시각으로 시점을 구분하고, 복원 전에는 반드시 현재 상태를 먼저 내려받습니다."
    };
    const updatedIds=[];
    Object.entries(guides).forEach(([id,guide])=>{
      const section=data.find(entry=>entry.id===id);
      if(!section)return;
      const firstLine=guide.split("\n")[0];
      if(!section.content.includes(firstLine)) section.content=section.content.replace(/\s*$/,"")+"\n"+guide;
      updatedIds.push(id);
    });
    markMigrationApplied(xlsxBackupMigrationKey,{appliedAt:nowIso(),updatedIds});
  }
  const cloudManualDef=DEFAULT_MANUAL_SECTIONS.find(item=>item.id==="manual_cloud_db");
  if(cloudManualDef&&!data.some(item=>item.id==="manual_cloud_db")){
    data.push(normalizeManualSection(deepCopy(cloudManualDef),data.length));
  }
  refreshCurrentManualContent(data);
  data.forEach((x,idx)=>x.order=idx);
  const writes = [];
  if(migrationsChanged) writes.push({key:MANUAL_MIGRATION_STATE_KEY, value:applied});
  if(!sameStoredValue(stored, data)) writes.push({key:"tinico:manual:sections", value:data});
  /* 매뉴얼 본문과 진행 기록을 한 번에 저장해 한쪽만 남는 상태를 막는다 */
  if(writes.length){
    if(bootWrites) writes.forEach(entry=>queueBootWrite(entry.key, entry.value));
    else await storageTransaction(writes);
  }
  return data;
}
async function saveManualSections(){
  manualSections.forEach((x,idx)=>x.order=idx);
  await storageSet("tinico:manual:sections", manualSections);
}

/* ---------- 딜 공통 저장/헬퍼 ---------- */
function saveArea(areaKey){ return storageSet("tinico:stage:" + areaKey, stageData[areaKey]); }
function findAreaByKey(key){ return AREAS.find(a=>a.key === key); }
function simpleImportanceLabel(level){ return ({high:"높음",mid:"중간",low:"낮음"})[level] || "낮음"; }
function simpleImportancePillHtml(imp){
  const level=["high","mid","low"].includes(imp && imp.level) ? imp.level : "low";
  return `<span class="tn-importance-pill ${level}">중요도 ${simpleImportanceLabel(level)}</span>`;
}
function applyPipelineStageStyle(select, stage){
  const normalized=normalizeStage(stage);
  const color=STAGE_COLORS[normalized] || "#64748B";
  select.style.setProperty("--stage-color",color);
  select.title=`현재 영업 단계: ${normalized}`;
}

/* ---------- 딜 행 렌더러 (그룹 페이지·파이프라인 목록 공용) ---------- */
/* 편집본은 화면에서만 사용한다. DB 저장 성공 전에는 집계·내보내기 원본에 넣지 않는다. */
const dealDrafts=new Map(),contactDrafts=new Map(),editSaveQueues=new Map();
function draftChanges(base,value){
  return Object.fromEntries(Object.entries(value).filter(([key,v])=>key!=="cardImage"&&!sameStoredValue(base?.[key],v)));
}
function editDraft(map,key,original,seed){
  let draft=map.get(key);
  if(!draft){
    if(!original&&!seed)return null;
    draft={base:deepCopy(original||{}),value:deepCopy(original||seed),isNew:!original,saving:false,message:""};map.set(key,draft);
  }else if(original&&!draft.saving&&!draftDirty(draft)&&!sameStoredValue(original,draft.base)){
    const changes=draftChanges(draft.base,draft.value);
    const pendingImage=draft.pendingImage?draft.value.cardImage:null;
    Object.assign(draft.value,deepCopy(original),changes);if(pendingImage)draft.value.cardImage=pendingImage;
    draft.base=deepCopy(original);
    draft.expected=null;
  }
  return draft;
}
function pinDraftVersion(draft,key,id){if(draft&&!draft.expected){const base=storageSnapshots.get(key),{cardImage,...original}=draft.base;draft.expected={id,version:base?.versions?.[id]??null,generation:base?.generation,original:deepCopy(original)};}return draft;}
function dealDraft(areaKey,id,seed){return pinDraftVersion(editDraft(dealDrafts,dealDrawerSaveKey(areaKey,id),findDeal(areaKey,id)?.item,seed),"tinico:stage:"+areaKey,id);}
function contactDraft(id,seed){return pinDraftVersion(editDraft(contactDrafts,id,contactsData.find(c=>c.id===id),seed),"tinico:contacts",id);}
function draftDirty(draft){return !!draft&&(draft.isNew||!!draft.pendingImage||Object.keys(draftChanges(draft.base,draft.value)).length>0);}
function updateEditStatus(kind,draft){
  const dirty=draftDirty(draft)||draft?.syncPending,saving=!!draft?.saving,processing=!!draft?.processing;
  const button=document.getElementById(`${kind}-drawer-save`);
  button.disabled=saving||processing||!dirty;button.textContent=saving?"저장 중…":"저장";
  document.getElementById(`${kind}-save-status`).textContent=draft?.message||(processing?"명함 인식 중…":saving?"저장 중…":dirty?"미저장 변경":"저장됨");
  document.getElementById(`${kind}-drawer-cancel`).disabled=saving;
  document.getElementById(`${kind}-drawer-body`).inert=saving;
}
function markDraft(kind,draft){draft.message="";updateEditStatus(kind,draft);}
function enqueueEditSave(key,action){
  const previous=editSaveQueues.get(key)||Promise.resolve();
  const next=previous.catch(()=>{}).then(action);editSaveQueues.set(key,next);
  next.finally(()=>{if(editSaveQueues.get(key)===next)editSaveQueues.delete(key);}).catch(()=>{});
  return next;
}
async function commitDealDraft(areaKey,id){
  const draft=dealDraft(areaKey,id);if(!draft||draft.saving)return false;
  const snapshot=deepCopy(draft.value),changes=draftChanges(draft.base,snapshot);
  draft.saving=true;draft.message="";
  if(selectedDealRef?.id===id)updateEditStatus("deal",draft);
  try{
    await enqueueEditSave("tinico:stage:"+areaKey,async()=>{
      const existing=findDeal(areaKey,id)?.item;
      if(!existing&&!draft.isNew)throw new Error("항목이 삭제되었습니다. 입력 내용을 확인해 주세요.");
      let saved=snapshot;
      const next=existing?stageData[areaKey].map(item=>item.id===id?saved:item):[...(stageData[areaKey]||[]),saved];
      const key="tinico:stage:"+areaKey;
      const result=await storageTransaction([{key,value:next,expected:draft.expected}]);
      stageData[areaKey]=deepCopy(result.records[key].value||[]);
      saved=stageData[areaKey].find(item=>item.id===id);
      if(!saved){dealDrafts.delete(dealDrawerSaveKey(areaKey,id));if(selectedDealRef?.id===id)closeDealDrawer(true);return;}
      draft.refreshAfterSave=!sameStoredValue(saved,snapshot);
      const later=draftChanges(snapshot,draft.value);
      if(draft.refreshAfterSave)Object.keys(draft.value).forEach(key=>{if(!Object.hasOwn(saved,key)&&!Object.hasOwn(later,key))delete draft.value[key];});
      Object.assign(draft.value,deepCopy(saved),later);draft.base=deepCopy(saved);draft.isNew=false;
      draft.expected=null;pinDraftVersion(draft,key,id);
    });
    draft.message=draftDirty(draft)?"미저장 변경":"저장됨";
    renderHome();
    return true;
  }catch(error){draft.message="저장 실패 · 다시 저장하세요";showToast(error?.message||draft.message);return false;}
  finally{draft.saving=false;renderStageBody(findAreaByKey(areaKey));renderPipeline(true);if(selectedDealRef?.id===id){if(draft.refreshAfterSave&&draft.message==="저장됨")renderDealDrawer(false);updateEditStatus("deal",draft);updateDealActionButtons(draft);}}
}
async function commitContactDraft(id){
  const draft=contactDraft(id);if(!draft||draft.saving||draft.processing)return false;
  const snapshot=deepCopy(draft.value),changes=draftChanges(draft.base,snapshot);
  draft.saving=true;draft.message="";updateEditStatus("contact",draft);
  try{
    await enqueueEditSave("tinico:contacts",async()=>{
      const existing=contactsData.find(ct=>ct.id===id);
      if(!existing&&!draft.isNew)throw new Error("연락처가 삭제되었습니다. 입력 내용을 확인해 주세요.");
      let saved=snapshot;
      if(draft.pendingImage){saved.cardImage=snapshot.cardImage;saved.cardThumb=(await makeCardThumb(snapshot.cardImage))||saved.cardThumb||"";}
      const next=existing?contactsData.map(ct=>ct.id===id?saved:ct):[saved,...contactsData];
      const entries=[{key:"tinico:contacts",value:stripContactImages(next),expected:draft.expected}];
      if(draft.pendingImage)entries.push({key:contactImageKey(id),value:snapshot.cardImage});
      const result=await storageTransaction(entries);
      contactsData=deepCopy(result.records["tinico:contacts"].value||[]);
      saved=contactsData.find(ct=>ct.id===id);
      if(!saved){contactDrafts.delete(id);closeContactDetail(true);return;}
      if(draft.pendingImage&&result.records[contactImageKey(id)])saved.cardImage=result.records[contactImageKey(id)].value;
      else if(draft.pendingImage)delete draft.value.cardImage;
      const later=draftChanges(snapshot,draft.value);
      Object.assign(draft.value,deepCopy(saved),later);draft.base=deepCopy(saved);draft.isNew=false;draft.pendingImage=false;
      draft.expected=null;pinDraftVersion(draft,"tinico:contacts",id);
    });
    draft.message=draftDirty(draft)?"미저장 변경":"저장됨";
    draft.syncPending=false;
    renderContacts();renderPipeline(true);renderHome();return true;
  }catch(error){draft.message="저장 실패 · 다시 저장하세요";showToast(error?.message||draft.message);return false;}
  finally{draft.saving=false;if(selectedContactId===id){if(draft.message==="저장됨")renderContactDrawer(false);updateEditStatus("contact",draft);if(draft.syncPending)document.getElementById("contact-drawer-save").disabled=false;}}
}
function updateDealActionButtons(draft){
  document.querySelectorAll('#deal-drawer-body [data-add-activity],#deal-drawer-body [data-add-support-task],#deal-drawer-body [data-ai-analyze],#deal-drawer-body [data-convert-support],#deal-drawer-body [data-next-action]').forEach(button=>{
    button.disabled=draft.isNew||draft.saving||draftDirty(draft);
    button.title=button.disabled?"항목을 먼저 저장해 주세요.":"";
  });
}

function makeDealRow(area, item, opts){
  const draft=dealDraft(area.key,item.id);item=draft.value;
  const refresh = (opts && opts.refresh) || function(){};
  const tr = document.createElement("tr");
  tr.className = "tn-deal-row";
  const stage=normalizeStage(item.stage);
  const imp=dealImportance(item,area.key);
  const bucketKey=itemBucketKey(item,area);
  const areaColor=area.color || "#64748B";
  const areaSoft=area.colorSoft || "#F1F5F9";
  tr.style.setProperty("--deal-color",areaColor);
  tr.style.setProperty("--deal-soft",areaSoft);

  const tdTitle=document.createElement("td");
  const groupPill=opts&&opts.showGroup?`<span class="tn-deal-group-pill">그룹 · ${escapeHtml(area.title)}</span>`:"";
  const tagText=String(item.tag||"").trim();
  tdTitle.innerHTML=`
    <div class="tn-deal-title-line">
      <span class="tn-deal-color-dot" aria-hidden="true"></span>
      <div class="tn-deal-title-copy">
        <div class="tn-remember-name">${escapeHtml(item.title)||"(제목 없음)"}</div>
        <div class="tn-deal-tag${tagText?"":" missing"}">${tagText?escapeHtml(tagText):"제품·이슈 구분 미입력"}</div>
      </div>
    </div>
    <div class="tn-deal-badges">
      ${groupPill}
      ${bucketChipForKey(bucketKey,"mini")}
      ${simpleImportancePillHtml(imp)}
      <span class="tn-deal-owner-pill${item.internalOwner?"":" missing"}">${item.internalOwner?"담당 · "+escapeHtml(item.internalOwner):"담당자 미지정"}</span>
    </div>`;
  tr.appendChild(tdTitle);
  function refreshRowImportance(){
    const nextImp=dealImportance(item,area.key);
    const pill=tr.querySelector(".tn-importance-pill");
    if(!pill)return;
    pill.className=`tn-importance-pill ${nextImp.level}`;
    pill.textContent=`중요도 ${simpleImportanceLabel(nextImp.level)}`;
  }

  const tdStage=document.createElement("td");
  const sel=document.createElement("select");
  sel.className="tn-stage "+stage;
  STAGE_OPTIONS.forEach(opt=>{const o=document.createElement("option");o.value=opt;o.textContent=opt;if(opt===stage)o.selected=true;sel.appendChild(o);});
  applyPipelineStageStyle(sel,stage);
  sel.addEventListener("click",e=>e.stopPropagation());
  sel.addEventListener("change",()=>{item.stage=sel.value;item.prob=SIMPLE_STAGE_PROB[sel.value]??item.prob;sel.className="tn-stage "+sel.value;applyPipelineStageStyle(sel,sel.value);refreshRowImportance();saveSoon();});
  tdStage.appendChild(sel);tr.appendChild(tdStage);

  function saveSoon(){draft.message="";rowSave.disabled=!draftDirty(draft);rowSave.textContent="저장";tr.classList.toggle("tn-unsaved-row",draftDirty(draft));}
  function addInput(type,field,placeholder=""){const td=document.createElement("td");const inp=document.createElement("input");inp.type=type;inp.className="tn-cell-input";inp.value=item[field]||"";inp.placeholder=placeholder;if(type==="number")inp.min="0";inp.addEventListener("click",e=>e.stopPropagation());inp.addEventListener("input",()=>{item[field]=inp.value;if(field==="amount")refreshRowImportance();saveSoon();});td.appendChild(inp);tr.appendChild(td);return inp;}
  addInput("number","amount","0");
  const next=addInput("date","nextAction");
  const action=addInput("text","action","예: 견적서 보내기");
  const dd=daysUntil(item.nextAction);next.classList.toggle("overdue",!isClosedStage(item.stage)&&dd!==null&&dd<0);
  next.addEventListener("input",()=>{const d=daysUntil(next.value);next.classList.toggle("overdue",!isClosedStage(item.stage)&&d!==null&&d<0);});

  const tdDel=document.createElement("td");tdDel.className="tn-deal-save-cell";
  const rowSave=document.createElement("button");rowSave.type="button";rowSave.className="tn-btn primary small";rowSave.dataset.rowSave=item.id;rowSave.textContent=draft.saving?"저장 중…":draft.message.startsWith("저장 실패")?"다시 저장":"저장";rowSave.disabled=draft.saving||!draftDirty(draft);rowSave.title=draft.message||"이 항목의 변경 저장";
  rowSave.addEventListener("click",async()=>{tr.querySelectorAll("input,select,button").forEach(el=>el.disabled=true);rowSave.textContent="저장 중…";await commitDealDraft(area.key,item.id);refresh();});tdDel.appendChild(rowSave);
  const del=document.createElement("button");del.className="tn-row-del";del.textContent="×";del.title="휴지통으로 이동";del.addEventListener("click",async e=>{e.stopPropagation();if(!confirm("이 항목을 휴지통으로 이동할까요?"))return;await moveDealToTrash(area.key,item.id);});tdDel.appendChild(del);tr.appendChild(tdDel);
  tr.classList.toggle("tn-unsaved-row",draftDirty(draft));
  tr.addEventListener("click",e=>{if(e.target.closest("input,select,button"))return;openDealDrawer(area.key,item.id);});
  return tr;
}

/* ---------- 딜 상세 드로어 (구조화된 입력 폼) ---------- */
let selectedDealRef = null;
function dealDrawerSaveKey(areaKey,id){return areaKey+"\u0000"+id;}
function openDealDrawer(areaKey,id,seed){
  if(selectedDealRef&&(selectedDealRef.areaKey!==areaKey||selectedDealRef.id!==id)&&!closeDealDrawer())return false;
  if(!dealDraft(areaKey,id,seed))return false;
  selectedDealRef={areaKey,id};renderDealDrawer(true);return true;
}
function closeDealDrawer(force=false){
  const ref=selectedDealRef,draft=ref?dealDrafts.get(dealDrawerSaveKey(ref.areaKey,ref.id)):null;
  if(force!==true){
    if(draft?.saving){showToast("저장 중입니다. 완료 후 닫아 주세요.");return false;}
    if(draftDirty(draft)&&!confirm("저장하지 않은 변경을 버리고 닫을까요?"))return false;
  }
  if(ref)dealDrafts.delete(dealDrawerSaveKey(ref.areaKey,ref.id));
  selectedDealRef=null;
  document.getElementById("deal-drawer").hidden=true;
  document.getElementById("deal-drawer-backdrop").hidden=true;
  document.getElementById("deal-drawer-body").innerHTML="";
  if(ref){renderStageBody(findAreaByKey(ref.areaKey));renderPipeline(true);}return true;
}
function renderDealActivities(container,item,areaKey){
  if(!container) return;
  container.innerHTML = "";
  const activities = (item.activities || []).slice().sort((a,b)=>activityDateValue(b).localeCompare(activityDateValue(a)));
  if(!activities.length){ container.innerHTML = '<div class="tn-empty-compact">등록된 활동이 없습니다. 전화·메일·미팅 후 활동을 추가해 주세요.</div>'; return; }
  activities.forEach(a=>{
    const row = document.createElement("div"); row.className = "tn-activity";
    row.innerHTML = `<div class="tn-activity-head"><span class="tn-activity-type">${escapeHtml(a.type)}</span><span>${escapeHtml(a.date)}</span>${a.nextDate ? `<span>다음 ${escapeHtml(a.nextDate)}</span>` : ""}</div><div class="tn-activity-content">${escapeHtml(a.content || "내용 없음")}</div>${a.result ? `<div class="tn-activity-result">결과: ${escapeHtml(a.result)}</div>` : ""}${a.nextAction ? `<div class="tn-activity-result">다음 업무: ${escapeHtml(a.nextAction)}</div>` : ""}<button class="tn-activity-del" type="button" data-del-activity="${escapeHtml(a.id)}" title="활동 삭제">×</button>`;
    row.querySelector("[data-del-activity]").addEventListener("click",async()=>{
      if(!confirm("이 활동 기록을 삭제할까요?")) return;
      const found=findDeal(areaKey,item.id);if(!found)return;
      const previous=found.item.activities;found.item.activities=previous.filter(x=>x.id!==a.id);
      try{await saveArea(areaKey);renderDealDrawer(false);renderHome();}
      catch(error){found.item.activities=previous;showToast(error?.message||"활동 삭제에 실패했습니다.");}
    });
    container.appendChild(row);
  });
}

function renderDealRelatedTasks(container,item,areaKey){
  if(!container)return;
  const tasks=roadmapData.filter(t=>t.relatedAreaKey===areaKey&&t.relatedDealId===item.id);
  container.innerHTML="";
  if(!tasks.length){container.innerHTML='<div class="tn-empty-compact">연결된 실행과제가 없습니다. 고객 영업을 위해 필요한 내부 업무가 있을 때만 추가하세요.</div>';return;}
  tasks.sort((a,b)=>(a.dueDate||"9999-12-31").localeCompare(b.dueDate||"9999-12-31"));
  tasks.forEach(task=>{
    const row=document.createElement("div");row.className="tn-related-task-row";
    row.innerHTML=`<div><div class="tn-related-task-name">${escapeHtml(task.title)}</div><div class="tn-related-task-meta">${escapeHtml(task.status)} · 담당 ${escapeHtml(effectiveSupportTaskOwner(task)||"미지정")} · ${escapeHtml(supportTaskDueText(task))}</div></div><button class="tn-btn small" type="button">열기</button>`;
    row.querySelector("button").addEventListener("click",()=>openRoadmapModal(task.id));container.appendChild(row);
  });
}
function inferSupportTaskType(area,item){
  const text=[area?.key,area?.title,item?.title,item?.tag].join(" ");
  if(/자료|사진|소개서/.test(text))return "자료 확보";
  if(/홍보|콘텐츠|영상|홈페이지|블로그|LinkedIn/.test(text))return "홍보·콘텐츠";
  if(/시스템|CRM|데이터|목록|템플릿/.test(text))return "시스템·데이터";
  if(/재무|회계|국책|확인|제한|비용/.test(text))return "내부 확인";
  return "영업 기반";
}
async function convertDealToSupportTask(areaKey,id){
  const found=findDeal(areaKey,id);if(!found)return;
  const {area,item}=found;
  if(!confirm(`"${item.title}" 항목을 파이프라인에서 제거하고 영업지원 실행과제로 이동할까요?\n\n고객 영업기회가 아니라 내부 준비·확인 업무인 경우에만 이동하세요.`))return;
  const imp=dealImportance(item,areaKey);
  const status=normalizeStage(item.stage)==="수주"?"완료":(["보류","실주"].includes(normalizeStage(item.stage))?"보류":normalizeStage(item.stage)==="리드"?"미착수":"진행중");
  const task=normalizeSupportTask({
    id:uid(),title:item.title,type:inferSupportTaskType(area,item),
    purpose:item.goal||item.desc||"내부 준비 업무를 완료하여 관련 영업 활동을 지원합니다.",
    deliverable:item.action?`${item.action} 완료 및 결과 확인`:"완료 여부를 확인할 수 있는 결과물 또는 내부 확인 결과",
    owner:item.internalOwner||"",collaborators:item.collaborators||"",status,
    priority:imp.level==="high"?"높음":imp.level==="mid"?"중간":"낮음",
    startDate:item.lastContact||"",dueDate:item.nextAction||"",progress:status==="완료"?100:0,
    nextAction:item.action||"",blocker:item.internalNote||"",
    notes:[item.note,item.desc?`기존 파이프라인 현황: ${item.desc}`:"",item.contactName?`기존 입력 담당자: ${item.contactName} ${item.contactRole||""}`:""].filter(Boolean).join("\n"),
    createdAt:nowIso(),updatedAt:nowIso(),completedAt:status==="완료"?todayStr():""
  });
  const previousStage=stageData[areaKey];
  roadmapData.push(task);
  stageData[areaKey]=stageData[areaKey].filter(x=>x.id!==id);
  try{
    const key="tinico:stage:"+areaKey;
    const result=await storageTransaction([{key:"tinico:stage:roadmap",value:roadmapData},{key,value:stageData[areaKey]}]);
    roadmapData=result.records["tinico:stage:roadmap"].value;stageData[areaKey]=result.records[key].value;
  }catch(error){
    roadmapData=roadmapData.filter(x=>x.id!==task.id);
    stageData[areaKey]=previousStage;
    console.error("deal to support task conversion failed", error);
    showToast(error?.message||"지원 업무 전환 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
    return;
  }
  closeDealDrawer();renderStageBody(area);renderPipeline(true);renderRoadmap();renderHome();showView("roadmap");openRoadmapModal(task.id);
}

const SIMPLE_STAGE_PROB={"리드":10,"상담":30,"제안":50,"협상":70,"수주":100,"보류":10,"실주":0};
function renderDealDrawer(resetScroll){
  const ref=selectedDealRef;
  if(!ref)return;
  const area=findAreaByKey(ref.areaKey);
  const draft=area?dealDraft(ref.areaKey,ref.id):null;
  const item=draft?.value;
  if(!area||!item){closeDealDrawer();return;}
  const drawer=document.getElementById("deal-drawer"),backdrop=document.getElementById("deal-drawer-backdrop"),body=document.getElementById("deal-drawer-body");
  const stage=normalizeStage(item.stage);
  const completion=dealCompletion(item);

  body.innerHTML=`
    <div>
      <input class="tn-drawer-name" data-f="title" placeholder="고객사 / 영업 건 이름" value="${escapeHtml(item.title)}">
      <div class="tn-drawer-summary"><strong data-sum></strong></div>
      <div class="tn-completion">
        <div class="tn-completion-head"><span>필수 입력</span><b data-completion-text>${completion.done}/${completion.total}</b></div>
        <div class="tn-completion-bar"><span data-completion-bar style="width:${completion.percent}%"></span></div>
        <div class="tn-completion-missing" data-completion-missing>${completion.missing.length?"확인 필요: "+escapeHtml(completion.missing.join(", ")):"필수 정보가 모두 입력되었습니다."}</div>
      </div>
    </div>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">영업 기본정보</div>
      <div class="tn-drawer-fields">
        <div class="tn-drawer-field"><label>현재 단계</label><select data-stage class="tn-stage ${escapeHtml(stage)}"></select></div>
        <div class="tn-guide-box" data-stage-guide>${escapeHtml(stageGuide(stage))}<br><b>성사 확률은 단계에 따라 자동으로 계산됩니다.</b></div>
        <div class="tn-drawer-field"><label>내부 담당자</label><input data-f="internalOwner" placeholder="예: 홍길동" value="${escapeHtml(item.internalOwner)}"></div>
        <div class="tn-drawer-field">
          <label for="deal-contact-name">고객 담당자 입력</label>
          <div class="tn-combo" data-contact-combo>
            <input id="deal-contact-name" class="tn-combo-input" type="text" role="combobox" aria-expanded="false" aria-controls="deal-contact-options" aria-autocomplete="list" autocomplete="off" placeholder="이름을 입력하세요. 목록에서 고르면 여러 명까지 추가됩니다" value="${escapeHtml((item.linkedContactIds||[]).length ? "" : item.contactName)}">
            <button class="tn-combo-toggle" type="button" data-contact-toggle tabindex="-1" aria-label="등록된 연락처 목록 열기">▾</button>
            <div class="tn-combo-list" id="deal-contact-options" role="listbox" aria-label="등록된 고객 담당자" hidden></div>
          </div>
        </div>
        <div class="tn-drawer-field"><label>고객 담당자 연락처</label><input data-f="contactPhone" type="tel" inputmode="tel" placeholder="예: 010-0000-0000" value="${escapeHtml(item.contactPhone)}"></div>
        <div class="tn-drawer-field"><label>선택한 담당자</label><div class="tn-linked-contacts" data-linked-contacts></div></div>
        <div class="tn-drawer-field"><label>예상 매출</label><div class="tn-input-with-unit"><input data-f="amount" type="number" min="0" placeholder="0" value="${escapeHtml(item.amount)}"><span>백만원</span></div></div>
      </div>
      <div class="tn-drawer-group-hint">이름을 입력하면 등록된 연락처 중 일치하는 사람만 아래 목록에 나타납니다. 목록에서 고르면 ‘선택한 담당자’에 이름과 연락처가 쌓이며 여러 명을 넣을 수 있습니다. 한 명도 고르지 않으면 입력한 이름 그대로 저장합니다.</div>
    </section>

    <section class="tn-drawer-section tn-simple-next-section">
      <div class="tn-drawer-section-title">다음 영업 행동</div>
      <div class="tn-drawer-fields">
        <div class="tn-drawer-field"><label>다음에 할 일</label><input data-f="action" placeholder="예: 견적서 보내기, 샘플 결과 확인 전화" value="${escapeHtml(item.action)}"></div>
        <div class="tn-drawer-field"><label>다음 연락일</label><input data-f="nextAction" type="date" value="${escapeHtml(item.nextAction)}"></div>
      </div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-section-head"><div><div class="tn-drawer-section-title" style="margin:0;">활동 기록</div><div class="tn-drawer-group-hint">전화, 이메일, 미팅 결과를 시간순으로 남깁니다.</div></div><button class="tn-btn small" data-next-action type="button" title="단계와 최근 접촉을 보고 다음에 할 일을 제안합니다">다음 액션 추천</button><button class="tn-btn primary small" data-add-activity type="button">활동 추가</button></div>
      <div class="tn-activity-list" data-activity-list></div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-section-head"><div><div class="tn-drawer-section-title" style="margin:0;">관련 지원 업무</div><div class="tn-drawer-group-hint">자료 제작과 내부 확인 업무를 연결합니다.</div></div><button class="tn-btn small" data-add-support-task type="button">지원 업무 추가</button></div>
      <div class="tn-related-task-list" data-related-task-list></div>
    </section>

    <div class="tn-simple-hidden-fields" hidden>
      <select data-area></select><select data-bucket-select></select><select data-importance></select><span data-imp></span>
      <input data-f="tag" value="${escapeHtml(item.tag)}"><input data-f="prob" value="${escapeHtml(item.prob)}"><input data-f="lastContact" value="${escapeHtml(item.lastContact)}"><input data-f="collaborators" value="${escapeHtml(item.collaborators)}">
      <input data-f="contactName" value="${escapeHtml(item.contactName)}"><input data-f="contactRole" value="${escapeHtml(item.contactRole)}"><input data-f="contactEmail" value="${escapeHtml(item.contactEmail)}">
      <input data-f="desc" value="${escapeHtml(item.desc)}"><input data-f="goal" value="${escapeHtml(item.goal)}"><input data-f="internalNote" value="${escapeHtml(item.internalNote)}">
      <input data-f="closeDate" value="${escapeHtml(item.closeDate)}"><input data-f="closeAmount" value="${escapeHtml(item.closeAmount)}"><input data-f="deliveryDate" value="${escapeHtml(item.deliveryDate)}"><input data-f="reopenDate" value="${escapeHtml(item.reopenDate)}"><input data-f="competitor" value="${escapeHtml(item.competitor)}"><input data-f="closeReason" value="${escapeHtml(item.closeReason)}"><textarea data-f="note">${escapeHtml(item.note)}</textarea>
      <section data-close-section hidden><i data-close-won></i><i data-close-hold></i><i data-close-lost></i></section>
      <button data-toggle-advanced type="button" hidden></button><button data-open-group type="button" hidden></button>
    </div>

    <div class="tn-drawer-save" data-save-hint></div>
    <div class="tn-drawer-footer">
      <button class="tn-btn primary" data-ai-analyze type="button">AI에게 이 영업 건 질문</button>
      <button class="tn-btn" data-convert-support type="button" title="고객 영업 건이 아니라 내부 준비·확인 업무인 경우 지원 업무로 이동합니다">지원 업무로 전환</button>
      <button class="tn-btn" data-delete style="color:var(--danger-500);">휴지통으로 이동</button>
    </div>`;

  const stageSel=body.querySelector("[data-stage]");
  STAGE_OPTIONS.forEach(opt=>{const o=document.createElement("option");o.value=opt;o.textContent=opt;if(opt===stage)o.selected=true;stageSel.appendChild(o);});
  const areaSel=body.querySelector("[data-area]");AREAS.forEach(a=>{const o=document.createElement("option");o.value=a.key;o.textContent=a.title;if(a.key===ref.areaKey)o.selected=true;areaSel.appendChild(o);});
  const bucketSel=body.querySelector("[data-bucket-select]");BUCKET_ORDER.forEach(key=>{const meta=bucketMetaByKey(key);const o=document.createElement("option");o.value=key;o.textContent=meta.label;if(itemBucketKey(item,area)===key)o.selected=true;bucketSel.appendChild(o);});
  const importanceSel=body.querySelector("[data-importance]");[["","자동 산정"],["high","높음"],["mid","중간"],["low","낮음"]].forEach(([value,label])=>{const o=document.createElement("option");o.value=value;o.textContent=label;if((item.importanceOverride||"")===value)o.selected=true;importanceSel.appendChild(o);});
  const nextInput=body.querySelector('[data-f="nextAction"]');
  function updateComputed(){
    const st=normalizeStage(item.stage),prob=item.prob===""||item.prob==null?(SIMPLE_STAGE_PROB[st]??0):item.prob;
    body.querySelector("[data-sum]").textContent=`${st} · 담당 ${item.internalOwner||"미지정"} · 자동 확률 ${prob}%`;
    body.querySelector("[data-stage-guide]").innerHTML=`${escapeHtml(stageGuide(st))}<br><b>성사 확률은 단계에 따라 자동으로 계산됩니다.</b>`;
    if(nextInput){const dd=daysUntil(item.nextAction);nextInput.classList.toggle("overdue",!isClosedStage(st)&&dd!==null&&dd<0);}
    const c=dealCompletion(item);body.querySelector("[data-completion-text]").textContent=`${c.done}/${c.total}`;body.querySelector("[data-completion-bar]").style.width=c.percent+"%";body.querySelector("[data-completion-missing]").textContent=c.missing.length?"확인 필요: "+c.missing.join(", "):"필수 정보가 모두 입력되었습니다.";
  }
  updateComputed();renderDealActivities(body.querySelector("[data-activity-list]"),item,ref.areaKey);renderDealRelatedTasks(body.querySelector("[data-related-task-list]"),item,ref.areaKey);
  const hint=body.querySelector("[data-save-hint]"),drawerAreaKey=ref.areaKey;
  function persist(){
    body.querySelectorAll("[data-f]").forEach(el=>{item[el.dataset.f]=el.value;});
    item.stage=stageSel.value;item.bucket=bucketSel.value;item.importanceOverride=importanceSel.value;
    stageSel.className="tn-stage "+stageSel.value;updateComputed();
    hint.textContent="저장 버튼을 눌러 변경을 반영하세요.";markDraft("deal",draft);updateDealActionButtons(draft);
  }
  updateEditStatus("deal",draft);updateDealActionButtons(draft);
  body.querySelectorAll("[data-f]").forEach(el=>el.addEventListener("input",persist));
  stageSel.addEventListener("change",()=>{item.prob=SIMPLE_STAGE_PROB[stageSel.value]??item.prob;body.querySelector('[data-f="prob"]').value=item.prob;persist();});
  bucketSel.addEventListener("change",persist);importanceSel.addEventListener("change",persist);

  /* ---- 고객 담당자 입력: 직접 입력과 등록된 연락처 선택을 하나로 합친 콤보박스 ----
     입력한 글자와 일치하는 등록 연락처만 목록에 보여 주고, 고르면 '선택한 담당자'에 여러 명까지 쌓인다.
     한 명도 고르지 않으면 입력한 글자를 그대로 contactName에 저장한다.
     한 명 이상 고르면 contactName은 선택한 담당자 이름을 모은 값이 되고, 대표(첫 번째) 담당자의
     직함·연락처·이메일이 아래 입력칸에 반영된다. */
  const contactInput=body.querySelector("[data-contact-combo] .tn-combo-input");
  const contactToggle=body.querySelector("[data-contact-toggle]");
  const contactList=body.querySelector("[data-contact-combo] .tn-combo-list");
  const linkedWrap=body.querySelector("[data-linked-contacts]");
  const hiddenContactName=body.querySelector('.tn-simple-hidden-fields [data-f="contactName"]');
  let contactMatches=[];
  let contactActiveIndex=-1;

  function linkedContacts(){ return linkedContactsOf(item); }
  function contactMirror(ct){
    return {
      contactRole:ct?[ct.department,ct.jobTitle].filter(Boolean).join(" / "):"",
      contactPhone:ct?contactPrimaryPhone(ct):"",
      contactEmail:ct?ct.email||"":""
    };
  }
  /* 대표 담당자가 바뀌면 직함·연락처·이메일을 새 담당자 값으로 옮긴다.
     사용자가 직접 고쳐 둔 값은 건드리지 않고, 이전 대표에서 자동으로 채워졌던 값만 바꾼다. */
  function applyLinkedContactMirror(previousFirst){
    const before=contactMirror(previousFirst),after=contactMirror(linkedContacts()[0]||null);
    ["contactRole","contactPhone","contactEmail"].forEach(field=>{
      if(!String(item[field]||"").trim() || item[field]===before[field]) item[field]=after[field];
    });
    if(linkedContacts().length) item.contactName=linkedContactNamesOf(item);
    else if(previousFirst) item.contactName="";
  }
  /* persist()가 숨은 입력칸에서 값을 다시 읽으므로 화면 값과 항상 맞춰 둔다 */
  function syncContactFields(){
    if(hiddenContactName) hiddenContactName.value=item.contactName||"";
    const phoneInput=body.querySelector('[data-f="contactPhone"]'); if(phoneInput)phoneInput.value=item.contactPhone||"";
    const roleInput=body.querySelector('[data-f="contactRole"]'); if(roleInput)roleInput.value=item.contactRole||"";
    const emailInput=body.querySelector('[data-f="contactEmail"]'); if(emailInput)emailInput.value=item.contactEmail||"";
  }
  function setPrimaryContact(id){
    const previousFirst=linkedContacts()[0]||null;
    if(previousFirst?.id===id || !linkedContacts().some(ct=>ct.id===id))return;
    // 기존 첫 번째 ID를 대표로 읽는 저장·동기화 경로와 동일한 순서를 유지한다.
    item.linkedContactIds=[id,...item.linkedContactIds.filter(value=>value!==id)];
    applyLinkedContactMirror(previousFirst);
    syncContactFields();
    renderLinkedContacts();
    closeContactCombo();
    persist();
  }
  function renderLinkedContacts(){
    const linked=linkedContacts();
    linkedWrap.innerHTML="";
    if(!linked.length){
      linkedWrap.innerHTML='<div class="tn-linked-empty">선택한 담당자가 없습니다. 위 칸에 이름을 입력해 목록에서 고르세요.</div>';
      return;
    }
    linked.forEach((ct,index)=>{
      const row=document.createElement("div");
      row.className="tn-linked-contact";
      const phone=contactPrimaryPhone(ct);
      const detail=[ct.company,[ct.department,ct.jobTitle].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
      row.innerHTML=`<div class="tn-linked-contact-main"><div class="tn-linked-contact-name">${escapeHtml(ct.name||"이름 없는 연락처")}${index===0?'<span class="tn-linked-contact-badge" title="대표 담당자의 직함·연락처·이메일이 위 입력칸에 반영됩니다">대표</span>':""}</div><div class="tn-linked-contact-sub">${escapeHtml(detail||"소속 정보 없음")}</div></div><div class="tn-linked-contact-phone${phone?"":" missing"}">${escapeHtml(phone||"연락처 미입력")}</div><button class="tn-linked-contact-remove" type="button" data-remove-contact="${escapeHtml(ct.id)}" title="선택 해제" aria-label="${escapeHtml((ct.name||"담당자")+" 선택 해제")}">×</button>`;
      row.querySelector("[data-remove-contact]").addEventListener("click",()=>removeLinkedContact(ct.id));
      if(index>0){
        const primaryButton=document.createElement("button");
        primaryButton.type="button";
        primaryButton.className="tn-linked-contact-primary";
        primaryButton.dataset.primaryContact=ct.id;
        primaryButton.textContent="대표로 지정";
        primaryButton.setAttribute("aria-label",`${ct.name||"이름 없는 연락처"} 대표로 지정`);
        primaryButton.addEventListener("click",()=>setPrimaryContact(ct.id));
        row.querySelector(".tn-linked-contact-main").appendChild(primaryButton);
      }
      linkedWrap.appendChild(row);
    });
  }
  function matchingContacts(query){
    const q=String(query||"").trim().toLowerCase();
    const chosen=new Set(item.linkedContactIds||[]);
    /* 이미 고른 사람은 아래 '선택한 담당자'에 있으므로 목록에서 뺀다 */
    const matched=contactsData.filter(ct=>!chosen.has(ct.id) && (!q || [ct.name,ct.company,ct.jobTitle,ct.department,ct.email,contactPrimaryPhone(ct)]
      .some(value=>String(value||"").toLowerCase().includes(q))));
    /* 입력한 글자로 이름이 시작하는 사람을 먼저 보여 준다 */
    return matched
      .map((ct,index)=>({ct,index,starts:q && String(ct.name||"").toLowerCase().startsWith(q)?0:1}))
      .sort((a,b)=>a.starts-b.starts || String(a.ct.name||"").localeCompare(String(b.ct.name||""),"ko") || a.index-b.index)
      .slice(0,50)
      .map(entry=>entry.ct);
  }
  function closeContactCombo(){
    contactList.hidden=true;
    contactInput.setAttribute("aria-expanded","false");
    contactInput.removeAttribute("aria-activedescendant");
    contactActiveIndex=-1;
  }
  function highlightContactOption(index){
    contactActiveIndex=index;
    const options=[...contactList.querySelectorAll(".tn-combo-option")];
    options.forEach((el,i)=>{
      const on=i===index;
      el.classList.toggle("active",on);
      el.setAttribute("aria-selected",on?"true":"false");
    });
    const active=index>=0?options[index]:null;
    if(active){
      contactInput.setAttribute("aria-activedescendant",active.id);
      active.scrollIntoView({block:"nearest"});
    }else contactInput.removeAttribute("aria-activedescendant");
  }
  function openContactCombo(query){
    contactMatches=matchingContacts(query);
    contactList.innerHTML="";
    if(!contactMatches.length){
      const empty=document.createElement("div");
      empty.className="tn-combo-empty";
      empty.textContent=!contactsData.length
        ? "등록된 연락처가 없습니다. 입력한 이름 그대로 저장됩니다."
        : (item.linkedContactIds||[]).length && !String(query||"").trim()
          ? "등록된 연락처를 모두 골랐습니다."
          : "일치하는 등록 연락처가 없습니다. 입력한 이름 그대로 저장됩니다.";
      contactList.appendChild(empty);
    }else{
      contactMatches.forEach((ct,index)=>{
        const option=document.createElement("div");
        option.className="tn-combo-option";
        option.id="deal-contact-option-"+index;
        option.setAttribute("role","option");
        option.setAttribute("aria-selected","false");
        option.dataset.contactId=ct.id;
        option.innerHTML=`<b>${escapeHtml(ct.name||"이름 없는 연락처")}</b><span>${escapeHtml([ct.company,ct.jobTitle||ct.department,contactPrimaryPhone(ct)].filter(Boolean).join(" · ")||"추가 정보 없음")}</span>`;
        /* mousedown으로 처리해야 입력창이 포커스를 잃어 목록이 닫히기 전에 선택된다.
           mousedown이 없는 환경을 위해 click도 받되, 이미 처리돼 목록이 닫혔으면 무시한다 */
        option.addEventListener("mousedown",event=>{event.preventDefault();addLinkedContact(ct);});
        option.addEventListener("click",()=>{ if(!contactList.hidden) addLinkedContact(ct); });
        contactList.appendChild(option);
      });
    }
    contactList.hidden=false;
    contactInput.setAttribute("aria-expanded","true");
    highlightContactOption(-1);
  }
  function addLinkedContact(ct){
    if((item.linkedContactIds||[]).includes(ct.id)) return;
    const previousFirst=linkedContacts()[0]||null;
    item.linkedContactIds=[...(item.linkedContactIds||[]),ct.id];
    applyLinkedContactMirror(previousFirst);
    /* 다음 담당자를 이어서 찾을 수 있게 검색어를 비운다 */
    contactInput.value="";
    syncContactFields();
    renderLinkedContacts();
    persist();
    contactInput.focus();
    openContactCombo("");
  }
  function removeLinkedContact(id){
    const previousFirst=linkedContacts()[0]||null;
    item.linkedContactIds=(item.linkedContactIds||[]).filter(value=>value!==id);
    applyLinkedContactMirror(previousFirst);
    if(!linkedContacts().length) contactInput.value=item.contactName||"";
    syncContactFields();
    renderLinkedContacts();
    closeContactCombo();
    persist();
  }
  renderLinkedContacts();
  contactInput.addEventListener("input",()=>{
    /* 아무도 고르지 않았을 때만 입력한 글자가 곧 고객 담당자 이름이다.
       한 명이라도 골랐으면 이 칸은 검색용이므로 저장값을 건드리지 않는다 */
    if(!linkedContacts().length){
      item.contactName=contactInput.value;
      syncContactFields();
      persist();
    }
    openContactCombo(contactInput.value);
  });
  contactInput.addEventListener("focus",()=>openContactCombo(contactInput.value));
  contactInput.addEventListener("blur",()=>closeContactCombo());
  contactInput.addEventListener("keydown",event=>{
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      if(contactList.hidden){openContactCombo(contactInput.value);return;}
      if(!contactMatches.length)return;
      event.preventDefault();
      const last=contactMatches.length-1;
      let next=contactActiveIndex+(event.key==="ArrowDown"?1:-1);
      if(next<0)next=last; else if(next>last)next=0;
      highlightContactOption(next);
    }else if(event.key==="Enter"){
      /* 목록에서 고른 항목이 있을 때만 추가하고, 아니면 입력한 값을 그대로 둔다 */
      if(!contactList.hidden && contactMatches[contactActiveIndex]){
        event.preventDefault();
        addLinkedContact(contactMatches[contactActiveIndex]);
      }else closeContactCombo();
    }else if(event.key==="Escape"){
      if(!contactList.hidden){event.stopPropagation();closeContactCombo();}
    }
  });
  contactToggle.addEventListener("mousedown",event=>{
    event.preventDefault();
    if(contactList.hidden){contactInput.focus();openContactCombo(contactInput.value);}
    else closeContactCombo();
  });
  body.querySelector("[data-toggle-advanced]").addEventListener("click",()=>{});
  body.querySelector("[data-add-activity]").addEventListener("click",()=>openActivityModal(drawerAreaKey,item.id));
  body.querySelector("[data-next-action]").addEventListener("click",()=>applyAiNextAction(drawerAreaKey,item.id));
  body.querySelector("[data-add-support-task]").addEventListener("click",()=>openRoadmapModal("",{relatedAreaKey:drawerAreaKey,relatedDealId:item.id,inheritOwner:true,owner:"",purpose:"",nextAction:"",dueDate:""}));
  areaSel.addEventListener("change",async()=>{});
  body.querySelector("[data-ai-analyze]").addEventListener("click",()=>openAiForDeal(drawerAreaKey,item.id));
  body.querySelector("[data-open-group]").addEventListener("click",()=>{});
  body.querySelector("[data-delete]").addEventListener("click",async()=>{if(!confirm("이 항목을 휴지통으로 이동할까요?"))return;if(draft.isNew){closeDealDrawer(true);return;}await moveDealToTrash(drawerAreaKey,item.id);});
  body.querySelector("[data-convert-support]").addEventListener("click",()=>convertDealToSupportTask(drawerAreaKey,item.id));
  drawer.hidden=false;backdrop.hidden=false;if(resetScroll)drawer.querySelector(".tn-drawer-scroll").scrollTop=0;
}

function renderStageBody(area){
  if(!area) return;
  const tbody = document.getElementById("grid-" + area.key);
  const countEl = document.getElementById("count-" + area.key);
  if(!tbody) return;
  tbody.innerHTML = "";
  const items = stageData[area.key] || [];
  if(countEl) countEl.textContent = items.length + "건";
  if(items.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align:center; color:var(--ink-300); padding:26px 10px;">항목이 없습니다. "항목 추가"로 등록해 주세요.</td>`;
    tbody.appendChild(tr);
    return;
  }
  items.forEach(item=>tbody.appendChild(makeDealRow(area, item, {showGroup:false, refresh:()=>renderStageBody(area)})));
}

function buildStageView(area){
  const existing = document.getElementById("view-" + area.key);
  if(existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.className = "tn-view";
  wrap.id = "view-" + area.key;
  const areaKeyAttr=escapeHtml(area.key),areaColor=safeCssColor(area.color);
  wrap.innerHTML = `
    <div class="tn-page-head">
      <button class="tn-btn small" data-back>← 대시보드</button>
      <button class="tn-btn small" data-board>보드</button>
      <div class="tn-page-title-wrap">
        <span class="tn-dot" id="pagedot-${areaKeyAttr}" style="background:${areaColor};"></span>
        <div>
          <div class="tn-page-title" id="pagetitle-${areaKeyAttr}">${escapeHtml(area.title)}</div>
          <div class="tn-page-sub" id="pagesub-${areaKeyAttr}">${escapeHtml(area.subtitle)}</div>
          ${bucketChipHtml(area, "mini").replace("<span", `<span id="pagebucket-${areaKeyAttr}"`)}
        </div>
      </div>
      <span class="tn-count tn-page-spacer" id="count-${areaKeyAttr}">0건</span>
      <button class="tn-btn small" data-edit-area="${areaKeyAttr}">편집</button>
      <button class="tn-btn primary small" id="add-${areaKeyAttr}">항목 추가</button>
    </div>
    <div class="tn-table-wrap">
      <table class="tn-table tn-simple-pipeline-table" style="min-width:900px;">
        <thead>
          <tr>
            <th>고객사 / 영업 건</th>
            <th style="width:126px;">단계</th>
            <th style="width:138px;">예상 매출(백만)</th>
            <th style="width:160px;">다음 연락일</th>
            <th style="width:220px;">다음에 할 일</th>
            <th style="width:132px;"></th>
          </tr>
        </thead>
        <tbody id="grid-${areaKeyAttr}"></tbody>
      </table>
    </div>
    <div class="tn-kanban-hint">표에서 값을 수정한 뒤 해당 행의 저장 버튼을 눌러 반영하세요.</div>
  `;
  document.getElementById("tn-stage-views").appendChild(wrap);

  wrap.querySelector("[data-back]").addEventListener("click", ()=>showView("home"));
  wrap.querySelector("[data-board]").addEventListener("click", ()=>showView("pipeline"));
  wrap.querySelector("[data-edit-area]").addEventListener("click", ()=>openAreaModal("edit", area.key));
  document.getElementById("add-" + area.key).addEventListener("click", async ()=>{
    const newItem = normalizeItem({id:uid(), title:"새 항목", tag:"", stage:STAGE_OPTIONS[0] || "리드", bucket:areaBucketKey(area), internalOwner:"", action:"", prob:SIMPLE_STAGE_PROB[STAGE_OPTIONS[0] || "리드"] || 10});
    openDealDrawer(area.key,newItem.id,newItem);
  });
}

/* ---------- 파이프라인 (보드/목록 + 검색·필터·정렬) ---------- */
let pipeViewMode = "table";

/* 파이프라인 내부 입력 중에는 자동 재렌더로 포커스를 잃지 않도록 보호 */
function pipelineFocusGuard(){
  const view = document.getElementById("view-pipeline");
  const ae = document.activeElement;
  return view && ae && view.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
}
function pipeFilterState(){
  return {
    q: (document.getElementById("pipe-search").value || "").trim().toLowerCase(),
    bucket: document.getElementById("pipe-bucket-filter").value,
    areaKey: document.getElementById("pipe-area-filter").value,
    owner: document.getElementById("pipe-owner-filter").value,
    stage: document.getElementById("pipe-stage-filter").value,
    sort: document.getElementById("pipe-sort").value,
  };
}
function pipeDeals(){
  const {q, bucket, areaKey, owner, stage, sort} = pipeFilterState();
  const list = [];
  AREAS.forEach(area=>{
    if(areaKey && area.key !== areaKey) return;
    (stageData[area.key] || []).forEach(item=>{
      const st = normalizeStage(item.stage);
      if(bucket && itemBucketKey(item, area) !== bucket) return;
      if(stage && st !== stage) return;
      if(owner && (item.internalOwner || "") !== owner) return;
      if(q && ![item.title, item.tag, item.contactName, item.desc, item.internalOwner, item.collaborators, item.action].join(" ").toLowerCase().includes(q)) return;
      list.push({area, item, stage: st, imp: dealImportance(item, area.key)});
    });
  });
  if(sort === "importance") list.sort(compareImportanceDeals);
  else if(sort === "amount") list.sort((a,b)=>(parseFloat(b.item.amount)||0) - (parseFloat(a.item.amount)||0));
  else if(sort === "next") list.sort((a,b)=>(a.item.nextAction || "9999-12-31").localeCompare(b.item.nextAction || "9999-12-31"));
  else if(sort === "name") list.sort((a,b)=>(a.item.title||"").localeCompare(b.item.title||"", "ko"));
  return list;
}
function renderPipeBucketFilter(){
  const sel = document.getElementById("pipe-bucket-filter");
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">모든 분류</option>' + BUCKET_ORDER.map(key=>`<option value="${escapeHtml(key)}">${escapeHtml(REVENUE_BUCKETS[key].label)}</option>`).join("");
  if([...sel.options].some(o=>o.value === cur)) sel.value = cur;
}
function renderPipeStageFilter(){
  const sel = document.getElementById("pipe-stage-filter");
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">모든 단계</option>' + STAGE_OPTIONS.map(stage=>`<option value="${escapeHtml(stage)}">${escapeHtml(stage)}</option>`).join("");
  if([...sel.options].some(o=>o.value === cur)) sel.value = cur;
  else sel.value = "";
}
function renderPipeAreaFilter(){
  const sel = document.getElementById("pipe-area-filter"); if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">모든 그룹</option>' + AREAS.map(a=>`<option value="${escapeHtml(a.key)}">${escapeHtml(a.title)}</option>`).join("");
  if([...sel.options].some(o=>o.value === cur)) sel.value = cur;
  else sel.value = "";
}
function renderPipeOwnerFilter(){
  const sel = document.getElementById("pipe-owner-filter"); if(!sel) return;
  const cur = sel.value;
  const owners = [...new Set(allDeals().map(d=>(d.item.internalOwner || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko"));
  sel.innerHTML = '<option value="">모든 내부 담당자</option>' + owners.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if(owners.includes(cur)) sel.value = cur; else sel.value = "";
}
async function pipeCreateDeal(stage){
  const {bucket, areaKey} = pipeFilterState();
  const targetArea = findAreaByKey(areaKey) || findAreaByKey("existing_accounts") || AREAS[0];
  if(!targetArea) return;
  const newItem = normalizeItem({id:uid(), title:"새 항목", tag:"", stage: stage || STAGE_OPTIONS[0], bucket: validBucketKey(bucket) || areaBucketKey(targetArea), internalOwner:"", action:"", prob:SIMPLE_STAGE_PROB[stage || STAGE_OPTIONS[0]] || 10});
  openDealDrawer(targetArea.key,newItem.id,newItem);
}

function renderPipeBoard(list){
  const board = document.getElementById("tn-kanban");
  board.innerHTML = "";
  STAGE_OPTIONS.forEach(stage=>{
    const col = document.createElement("div");
    col.className = "tn-kcol";
    col.dataset.stage = stage;
    const stageColor=STAGE_COLORS[stage] || "#64748B";
    col.style.setProperty("--stage-color",stageColor);

    const items = list.filter(d=>d.stage === stage);
    const colAmt = items.reduce((s,d)=>s + (parseFloat(d.item.amount)||0), 0);

    const head = document.createElement("div");
    head.className = "tn-kcol-head";
    head.innerHTML = `
      <span class="tn-dot" style="background:${escapeHtml(stageColor)};"></span>
      <span class="tn-kcol-name">${escapeHtml(stage)}</span>
      <span class="tn-kcol-count">${items.length}</span>
    `;
    const addBtn = document.createElement("button");
    addBtn.className = "tn-kcol-add";
    addBtn.textContent = "+";
    addBtn.title = "이 단계에 새 항목 추가";
    addBtn.addEventListener("click", ()=>pipeCreateDeal(stage));
    head.appendChild(addBtn);
    col.appendChild(head);

    const sum = document.createElement("div");
    sum.className = "tn-kcol-sum";
    sum.textContent = "합계 " + fmtAmount(Math.round(colAmt));
    col.appendChild(sum);

    const body = document.createElement("div");
    body.className = "tn-kcol-body";
    if(items.length === 0){
      const empty = document.createElement("div");
      empty.className = "tn-kcol-empty";
      empty.textContent = "항목 없음";
      body.appendChild(empty);
    }
    items.forEach(({area, item, imp})=>{
      const k = document.createElement("div");
      k.className = "tn-kcard";
      k.draggable = true;
      k.style.setProperty("--deal-color",area.color || "#64748B");
      k.style.setProperty("--deal-soft",area.colorSoft || "#F1F5F9");
      const dd = daysUntil(item.nextAction);
      const isActive = !isClosedStage(stage);
      const overdue=isActive&&dd!==null&&dd<0;
      const dateStatus=overdue?` · ${Math.abs(dd)}일 지연`:dd===0&&isActive?" · 오늘":dd!==null&&dd>0&&dd<=7&&isActive?` · D-${dd}`:"";
      const amount=(parseFloat(item.amount)||0)>0?fmtAmount(Math.round(parseFloat(item.amount))):"미입력";
      const tagText=String(item.tag||"").trim();
      const ownerText=String(item.internalOwner||"").trim();
      const actionText=String(item.action||"").trim();
      k.innerHTML=`
        <div class="tn-kcard-top">
          <span class="tn-kcard-group"><span class="tn-kcard-group-dot" aria-hidden="true"></span>${escapeHtml(area.title)}</span>
          ${simpleImportancePillHtml(imp)}
        </div>
        <div class="tn-kcard-title">${escapeHtml(item.title)||"(제목 없음)"}</div>
        <div class="tn-kcard-tag${tagText?"":" missing"}">${tagText?escapeHtml(tagText):"제품·이슈 구분 미입력"}</div>
        ${bucketChipForKey(itemBucketKey(item,area),"mini")}
        <div class="tn-kcard-facts">
          <div class="tn-kcard-fact"><span>예상 매출</span><b>${escapeHtml(amount)}</b></div>
          <div class="tn-kcard-fact${overdue?" overdue":""}"><span>다음 연락${dateStatus}</span><b>${item.nextAction?escapeHtml(item.nextAction):"미입력"}</b></div>
        </div>
        <div class="tn-kcard-next${actionText?"":" missing"}"><span>다음 할 일</span><b>${actionText?escapeHtml(actionText):"등록 필요"}</b></div>
        <div class="tn-kcard-owner${ownerText?"":" missing"}"><span>내부 담당자</span><b>${ownerText?escapeHtml(ownerText):"미지정"}</b></div>
      `;
      k.addEventListener("dragstart", (e)=>{
        k.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify({areaKey: area.key, id: item.id}));
      });
      k.addEventListener("dragend", ()=>k.classList.remove("dragging"));
      k.addEventListener("click", ()=>openDealDrawer(area.key, item.id));
      body.appendChild(k);
    });
    col.appendChild(body);

    col.addEventListener("dragover", (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = "move"; col.classList.add("dragover"); });
    col.addEventListener("dragleave", ()=>col.classList.remove("dragover"));
    col.addEventListener("drop", async (e)=>{
      e.preventDefault();
      col.classList.remove("dragover");
      let payload;
      try{ payload = JSON.parse(e.dataTransfer.getData("text/plain")); }catch(err){ return; }
      if(!payload || !payload.areaKey) return;
      const item = (stageData[payload.areaKey] || []).find(x=>x.id === payload.id);
      if(!item || normalizeStage(item.stage) === stage) return;
      if(!openDealDrawer(payload.areaKey,item.id))return;
      const draft=dealDraft(payload.areaKey,item.id);
      draft.value.stage=stage;draft.value.prob=SIMPLE_STAGE_PROB[stage]??draft.value.prob;
      renderDealDrawer(false);showToast("단계 변경을 확인한 뒤 저장해 주세요.","info");
    });

    board.appendChild(col);
  });
}

/* 항목이 많을 때 표 전체를 한 번에 만들면 화면이 멈칫한다. 연락처와 같은 방식으로 나눠 그린다. */
let pipePage = 1;
function pipePageSize(){
  const saved = Number(appSettings.pipelinePageSize);
  return CONTACT_PAGE_SIZES.includes(saved) ? saved : CONTACT_PAGE_SIZES[0];
}
function pipePageCount(total){ return Math.max(1, Math.ceil(total / pipePageSize())); }
function pipePageItems(list){
  const size = pipePageSize();
  pipePage = Math.max(1, Math.min(pipePage, pipePageCount(list.length)));
  const start = (pipePage - 1) * size;
  return list.slice(start, start + size);
}
function goToPipePage(page){
  const next = Math.max(1, Math.min(pipePageCount(pipeDeals().length), Number(page) || 1));
  if(next === pipePage) return;
  pipePage = next;
  renderPipeline(true);
  document.getElementById("pipe-table-wrap")?.scrollIntoView({block:"start", behavior:"smooth"});
}
async function setPipePageSize(value){
  const size = CONTACT_PAGE_SIZES.includes(Number(value)) ? Number(value) : CONTACT_PAGE_SIZES[0];
  if(size === pipePageSize()) return;
  const previous = appSettings.pipelinePageSize;
  appSettings.pipelinePageSize = size;
  pipePage = 1;
  renderPipeline(true);
  await saveOrRollback(saveAppSettings,()=>{appSettings.pipelinePageSize = previous; renderPipeline(true);},"표시 줄 수 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
}
function renderPipePager(total){
  const pager = document.getElementById("pipe-pager");
  if(!pager) return;
  /* 보드 화면이거나 한 페이지에 다 들어가면 숨긴다 */
  const pages = pipePageCount(total);
  pager.hidden = pipeViewMode !== "table" || (pages <= 1 && total <= pipePageSize());
  if(pager.hidden) return;
  const size = pipePageSize();
  const numbers = document.getElementById("pipe-page-numbers");
  numbers.innerHTML = "";
  contactPagerNumbers(pipePage, pages).forEach(entry=>{
    if(entry === "gap"){
      const gap = document.createElement("span");
      gap.className = "tn-pager-gap"; gap.textContent = "…"; gap.setAttribute("aria-hidden", "true");
      numbers.appendChild(gap); return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tn-pager-btn" + (entry === pipePage ? " active" : "");
    button.dataset.page = String(entry);
    button.textContent = String(entry);
    if(entry === pipePage) button.setAttribute("aria-current", "page");
    button.addEventListener("click", ()=>goToPipePage(entry));
    numbers.appendChild(button);
  });
  document.getElementById("pipe-page-first").disabled = pipePage <= 1;
  document.getElementById("pipe-page-prev").disabled = pipePage <= 1;
  document.getElementById("pipe-page-next").disabled = pipePage >= pages;
  document.getElementById("pipe-page-last").disabled = pipePage >= pages;
  const sizeSelect = document.getElementById("pipe-page-size");
  if(sizeSelect && Number(sizeSelect.value) !== size) sizeSelect.value = String(size);
  const range = document.getElementById("pipe-page-range");
  if(range){
    const from = total ? (pipePage - 1) * size + 1 : 0;
    const to = Math.min(total, pipePage * size);
    range.textContent = total ? `${from}–${to} / 전체 ${total}건` : "표시할 항목이 없습니다.";
  }
}
function renderPipeTable(list){
  const tbody = document.getElementById("pipe-tbody");
  tbody.innerHTML = "";
  if(list.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align:center; color:var(--ink-300); padding:26px 10px;">조건에 맞는 항목이 없습니다. 검색 조건을 확인하거나 "새 항목"을 추가해 보세요.</td>`;
    tbody.appendChild(tr);
    return;
  }
  /* 화면에 보이는 페이지만 실제 행으로 만든다 */
  const fragment = document.createDocumentFragment();
  list.forEach(d=>fragment.appendChild(makeDealRow(d.area, d.item, {showGroup:true, refresh:()=>renderPipeline(true)})));
  tbody.appendChild(fragment);
}

function renderPipeline(force){
  const board = document.getElementById("tn-kanban");
  if(!board) return;
  if(!force && pipelineFocusGuard()) return;
  renderPipeBucketFilter();
  renderPipeStageFilter();
  renderPipeAreaFilter();
  renderPipeOwnerFilter();
  const list = pipeDeals();

  const totalCnt = list.length;
  renderPipePager(totalCnt);
  const totalAmt = list.filter(d=>!isClosedStage(d.stage)).reduce((s,d)=>s + (parseFloat(d.item.amount)||0), 0);
  document.getElementById("pipeline-total").textContent = `항목 ${totalCnt}건 · 활성 ${fmtAmount(Math.round(totalAmt))}`;

  const tableWrap = document.getElementById("pipe-table-wrap");
  const hint = document.getElementById("pipe-hint");
  document.getElementById("pipe-view-board").classList.toggle("active", pipeViewMode === "board");
  document.getElementById("pipe-view-table").classList.toggle("active", pipeViewMode === "table");
  if(pipeViewMode === "table"){
    board.hidden = true;
    tableWrap.hidden = false;
    hint.textContent = "표에서 값을 수정한 뒤 해당 행의 저장 버튼을 눌러 반영하세요. 행을 클릭하면 상세 화면이 열립니다.";
    renderPipeTable(pipePageItems(list));
  }else{
    board.hidden = false;
    tableWrap.hidden = true;
    hint.textContent = "카드를 드래그한 뒤 상세 화면에서 저장하면 단계가 변경됩니다. 카드를 클릭하면 상세 입력창이 열립니다. 각 열의 + 로 새 항목을 추가합니다.";
    renderPipeBoard(list);
  }
}

/* ---------- 그룹 편집 모달 ---------- */
let modalMode = "add";
let modalEditingKey = null;
let modalSelectedColorIdx = 0;

function renderSwatches(){
  const wrap = document.getElementById("area-modal-swatches");
  wrap.innerHTML = "";
  PALETTE.forEach((p, idx)=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tn-swatch" + (idx === modalSelectedColorIdx ? " selected" : "");
    b.style.background = p.color;
    b.addEventListener("click", ()=>{
      modalSelectedColorIdx = idx;
      renderSwatches();
    });
    wrap.appendChild(b);
  });
}

function renderBucketSelect(select, selected){
  if(!select) return;
  select.innerHTML = "";
  BUCKET_ORDER.forEach(key=>{
    const meta = REVENUE_BUCKETS[key];
    const o = document.createElement("option");
    o.value = key;
    o.textContent = `${meta.label} — ${meta.desc}`;
    if(key === selected) o.selected = true;
    select.appendChild(o);
  });
}

function openAreaModal(mode, areaKey){
  modalMode = mode;
  modalEditingKey = areaKey || null;
  const overlay = document.getElementById("area-modal-overlay");
  const titleEl = document.getElementById("area-modal-title");
  const titleInput = document.getElementById("area-modal-title-input");
  const subInput = document.getElementById("area-modal-subtitle");
  const bucketInput = document.getElementById("area-modal-bucket");
  const deleteBtn = document.getElementById("area-modal-delete");

  if(mode === "edit"){
    const area = AREAS.find(a=>a.key === areaKey);
    if(!area){ showToast("편집할 그룹을 찾지 못했습니다. 화면을 새로고침해 주세요."); return; }
    titleEl.textContent = "그룹 편집";
    titleInput.value = area.title;
    subInput.value = area.subtitle;
    renderBucketSelect(bucketInput, areaBucketKey(area));
    modalSelectedColorIdx = Math.max(0, PALETTE.findIndex(p=>p.color === area.color));
    deleteBtn.hidden = false;
  }else{
    titleEl.textContent = "새 그룹";
    titleInput.value = "";
    subInput.value = "";
    renderBucketSelect(bucketInput, validBucketKey("future") || BUCKET_ORDER[0]);
    modalSelectedColorIdx = AREAS.length % PALETTE.length;
    deleteBtn.hidden = true;
  }
  renderSwatches();
  overlay.hidden = false;
  titleInput.focus();
}
function closeAreaModal(){
  document.getElementById("area-modal-overlay").hidden = true;
}

async function saveAreaModal(){
  const title = document.getElementById("area-modal-title-input").value.trim();
  const subtitle = document.getElementById("area-modal-subtitle").value.trim();
  const bucket = validBucketKey(document.getElementById("area-modal-bucket").value) || BUCKET_ORDER[0];
  if(!title){ showToast("이름을 입력하세요."); return; }
  const chosen = PALETTE[modalSelectedColorIdx];

  const snapshot = settingsSnapshot();
  if(modalMode === "add"){
    const newArea = {key:uid(), bucket, icon:"", color:chosen.color, colorSoft:chosen.colorSoft, title, subtitle};
    AREAS.push(newArea);
    stageData[newArea.key] = [];
    /* 그룹 목록과 그 그룹의 빈 항목함을 함께 만들어 목록에만 있고 항목함이 없는 그룹을 막는다 */
    if(!await saveSettingsTogether({areas:true, areaKeys:[newArea.key]}, snapshot, "그룹 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){
      refreshConfiguredViews();
      return;
    }
    buildStageView(newArea);
    renderStageBody(newArea);
  }else{
    const area = AREAS.find(a=>a.key === modalEditingKey);
    if(!area){ closeAreaModal(); showToast("편집 중이던 그룹이 삭제되었거나 찾을 수 없습니다."); return; }
    area.title = title; area.subtitle = subtitle; area.bucket = bucket;
    area.color = chosen.color; area.colorSoft = chosen.colorSoft;
    if(!await saveSettingsTogether({areas:true}, snapshot, "그룹 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){
      refreshConfiguredViews();
      return;
    }
    const pageDot = document.getElementById("pagedot-"+area.key);
    if(pageDot) pageDot.style.background = area.color;
    const pageTitle = document.getElementById("pagetitle-"+area.key);
    if(pageTitle) pageTitle.textContent = area.title;
    const pageSub = document.getElementById("pagesub-"+area.key);
    if(pageSub) pageSub.textContent = area.subtitle;
    const pageBucket = document.getElementById("pagebucket-"+area.key);
    if(pageBucket) pageBucket.outerHTML = bucketChipHtml(area, "mini").replace("<span", `<span id="pagebucket-${escapeHtml(area.key)}"`);
    renderStageBody(area);
  }
  closeAreaModal();
  renderPipeline(true);
  renderHome();
  renderSettings();
}

async function deleteAreaFromModal(){
  const area = AREAS.find(a=>a.key === modalEditingKey);
  if(!area) return;
  if(!confirm("그룹과 안의 항목을 휴지통으로 이동할까요?")) return;
  try{await moveGroupToTrash(area);}catch(error){showToast(error.message);return;}
  const view=document.getElementById("view-"+area.key);if(view)view.remove();closeAreaModal();showView("home");renderHome();renderSettings();
}

function setNumValue(id, value){
  const el = document.getElementById(id);
  if(el) el.value = value;
}
function numValue(id, fallback){
  const el = document.getElementById(id);
  const v = el ? Number(el.value) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}
function fillImportanceForm(config){
  const cfg = cloneImportanceConfig(config);
  setNumValue("imp-high-score", cfg.highScore);
  setNumValue("imp-high-amount", cfg.highAmount);
  setNumValue("imp-high-prob", cfg.highProb);
  setNumValue("imp-mid-score", cfg.midScore);
  setNumValue("imp-mid-prob", cfg.midProb);
  setNumValue("imp-weight-direct", cfg.bucketWeights.direct);
  setNumValue("imp-weight-future", cfg.bucketWeights.future);
  setNumValue("imp-weight-support", cfg.bucketWeights.support);
}
function openImportanceModal(){
  fillImportanceForm(importanceConfig);
  document.getElementById("importance-modal-overlay").hidden = false;
}
function closeImportanceModal(){
  document.getElementById("importance-modal-overlay").hidden = true;
}
async function saveImportanceModal(){
  const snapshot = settingsSnapshot();
  importanceConfig = cloneImportanceConfig({
    highScore:numValue("imp-high-score", DEFAULT_IMPORTANCE_CONFIG.highScore),
    highAmount:numValue("imp-high-amount", DEFAULT_IMPORTANCE_CONFIG.highAmount),
    highProb:Math.min(100, numValue("imp-high-prob", DEFAULT_IMPORTANCE_CONFIG.highProb)),
    midScore:numValue("imp-mid-score", DEFAULT_IMPORTANCE_CONFIG.midScore),
    midProb:Math.min(100, numValue("imp-mid-prob", DEFAULT_IMPORTANCE_CONFIG.midProb)),
    bucketWeights:{
      direct:numValue("imp-weight-direct", DEFAULT_IMPORTANCE_CONFIG.bucketWeights.direct),
      future:numValue("imp-weight-future", DEFAULT_IMPORTANCE_CONFIG.bucketWeights.future),
      support:numValue("imp-weight-support", DEFAULT_IMPORTANCE_CONFIG.bucketWeights.support),
    }
  });
  if(!await saveSettingsTogether({importance:true}, snapshot, "중요도 기준 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){
    refreshConfiguredViews();
    return;
  }
  closeImportanceModal();
  AREAS.forEach(a=>renderStageBody(a));
  renderPipeline(true);
  renderHome();
  renderSettings();
}

async function saveAllStageData(){
  /* 그룹마다 저장 키가 달라 순차 대기할 이유가 없다 — 한 번에 올려 대기 시간을 줄인다 */
  await Promise.all(AREAS.map(area=>saveArea(area.key)));
}
function refreshConfiguredViews(){
  AREAS.forEach(area=>{
    buildStageView(area);
    renderStageBody(area);
  });
  renderPipeline(true);
  renderHome();
  renderSettings();
}

/* ---------- 설정 화면 ---------- */
function setSettingsMode(mode){
  settingsMode = mode === "manual" ? "manual" : "config";
  const configPanel = document.getElementById("settings-config-panel");
  const manualPanel = document.getElementById("settings-manual-panel");
  const configBtn = document.getElementById("settings-mode-config");
  const manualBtn = document.getElementById("settings-mode-manual");
  if(!configPanel || !manualPanel || !configBtn || !manualBtn) return;
  configPanel.hidden = settingsMode !== "config";
  manualPanel.hidden = settingsMode !== "manual";
  configBtn.classList.toggle("active", settingsMode === "config");
  manualBtn.classList.toggle("active", settingsMode === "manual");
  if(settingsMode === "config") renderSettings();
  else renderManualSettings();
}

function renderSettings(){
  const stageList = document.getElementById("settings-stage-list");
  const bucketList = document.getElementById("settings-bucket-list");
  const groupList = document.getElementById("settings-group-list");
  if(!stageList || !bucketList || !groupList) return;

  stageList.innerHTML = "";
  STAGE_OPTIONS.forEach((stage, idx)=>{
    const row = document.createElement("div");
    const reserved = RESERVED_STAGES.includes(stage);
    row.className = "tn-settings-row tn-stage-row";
    row.innerHTML = `
      <div class="tn-settings-row-main">
        <span class="tn-stage-drag-handle" title="끌어서 파이프라인 표시 순서 변경" aria-hidden="true">⠿</span>
        <span class="tn-color-dot" style="background:${safeCssColor(STAGE_COLORS[stage],PALETTE[idx % PALETTE.length].color)};"></span>
        <div class="tn-settings-row-title">${escapeHtml(stage)}${reserved ? ' <span class="tn-reserved-badge" title="수주율·확률·마감 판정에 사용됩니다">기본</span>' : ""}</div>
      </div>
      <div class="tn-settings-row-sub">${escapeHtml(stageGuide(stage))}</div>
      <div class="tn-settings-row-actions">
        ${reserved
          ? `<button class="tn-btn small" disabled title="통계·확률 계산에 사용되는 기본 단계라 수정할 수 없습니다">수정</button>
             <button class="tn-btn small" disabled title="통계·확률 계산에 사용되는 기본 단계라 삭제할 수 없습니다">삭제</button>`
          : `<button class="tn-btn small" data-edit-stage="${escapeHtml(stage)}">수정</button>
             <button class="tn-btn small" data-delete-stage="${escapeHtml(stage)}" style="color:var(--danger-500);">삭제</button>`}
      </div>`;
    /* 드래그 앤 드롭으로 STAGE_OPTIONS 순서 변경 → 파이프라인 칸반 열 순서에 그대로 반영 */
    row.draggable = true;
    row.addEventListener("dragstart", e=>{
      stageDragName = stage;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try{ e.dataTransfer.setData("text/plain", stage); }catch(err){}
    });
    row.addEventListener("dragend", ()=>{
      stageDragName = "";
      row.classList.remove("dragging");
      stageList.querySelectorAll(".drag-over").forEach(el=>el.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", e=>{
      if(!stageDragName || stageDragName === stage) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", ()=>row.classList.remove("drag-over"));
    row.addEventListener("drop", async e=>{
      e.preventDefault();
      row.classList.remove("drag-over");
      await reorderStages(stageDragName, stage);
    });
    stageList.appendChild(row);
  });

  bucketList.innerHTML = "";
  BUCKET_ORDER.forEach((key, idx)=>{
    const meta = bucketMetaByKey(key);
    const row = document.createElement("div");
    row.className = "tn-settings-row";
    row.innerHTML = `
      <div class="tn-settings-row-main">
        ${bucketChipForKey(key, "mini")}
        <div class="tn-settings-row-title">${escapeHtml(meta.label)}</div>
      </div>
      <div class="tn-settings-row-sub">${escapeHtml(meta.desc || "설명 없음")} · 가중치 ${importanceConfig.bucketWeights[key] ?? meta.weight ?? 1}</div>
      <div class="tn-settings-row-actions">
        <button class="tn-btn small" data-edit-bucket="${escapeHtml(key)}">수정</button>
        <button class="tn-btn small" data-delete-bucket="${escapeHtml(key)}" style="color:var(--danger-500);">삭제</button>
      </div>`;
    bucketList.appendChild(row);
  });

  groupList.innerHTML = "";
  AREAS.forEach(area=>{
    const row = document.createElement("div");
    row.className = "tn-settings-row";
    row.innerHTML = `
      <div class="tn-settings-row-main">
        <span class="tn-color-dot" style="background:${safeCssColor(area.color)};"></span>
        <div class="tn-settings-row-title">${escapeHtml(area.title)}</div>
      </div>
      <div class="tn-settings-row-sub">${escapeHtml(area.subtitle || "설명 없음")} · 신규 기본 ${escapeHtml(bucketMetaByKey(areaBucketKey(area)).label)}</div>
      <div class="tn-settings-row-actions">
        <button class="tn-btn small" data-edit-group="${escapeHtml(area.key)}">수정</button>
        <button class="tn-btn small" data-delete-group="${escapeHtml(area.key)}" style="color:var(--danger-500);">삭제</button>
      </div>`;
    groupList.appendChild(row);
  });
  updateBeginnerControls();
  updateAdminUi();
  renderMemberSettings();
  renderAuditTable();
  renderTrash();
  if(canViewAudit() && !auditState.loaded && !auditState.loading) loadAuditPage({silent:true});
}

function manualLines(content){ return String(content || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean); }
function renderManualSettings(){
  const wrap = document.getElementById("settings-manual-list");
  if(!wrap) return;
  const q = String((document.getElementById("manual-search") || {}).value || "").trim().toLowerCase();
  const list = manualSections.filter(item=>!q || [item.category,item.title,item.content].join(" ").toLowerCase().includes(q));
  wrap.innerHTML = "";
  if(!list.length){ wrap.innerHTML = '<div class="tn-manual-empty">조건에 맞는 매뉴얼이 없습니다.</div>'; return; }
  list.forEach(item=>{
    const section = document.createElement("section");
    section.className = "tn-manual-card" + (item.format === "paragraph" ? " wide" : "");
    const lines = manualLines(item.content);
    const contentHtml = item.format === "paragraph"
      ? lines.map(line=>`<p>${escapeHtml(line)}</p>`).join("")
      : `<ul>${lines.map(line=>`<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
    section.innerHTML = `<div class="tn-manual-card-head"><div class="tn-manual-card-copy"><div class="tn-manual-category">${escapeHtml(item.category)}</div><div class="tn-manual-title">${escapeHtml(item.title)}</div></div><div class="tn-manual-actions"><button class="tn-btn small" data-manual-up="${escapeHtml(item.id)}" title="위로">↑</button><button class="tn-btn small" data-manual-down="${escapeHtml(item.id)}" title="아래로">↓</button><button class="tn-btn small" data-manual-edit="${escapeHtml(item.id)}">수정</button><button class="tn-btn small danger" data-manual-delete="${escapeHtml(item.id)}">삭제</button></div></div><div class="tn-manual-content">${contentHtml || '<p style="color:var(--ink-300);">내용이 없습니다.</p>'}</div>`;
    wrap.appendChild(section);
  });
}
function fillSelectOptions(select, values, selected){
  select.innerHTML = "";
  values.forEach(value=>{ const o=document.createElement("option");o.value=value;o.textContent=value;o.selected=value===selected;select.appendChild(o); });
}
function openManualModal(id=""){
  editingManualId = id;
  const item = manualSections.find(x=>x.id===id);
  document.getElementById("manual-modal-title").textContent = item ? "매뉴얼 수정" : "매뉴얼 추가";
  document.getElementById("manual-modal-category").value = item ? item.category : "";
  document.getElementById("manual-modal-name").value = item ? item.title : "";
  document.getElementById("manual-modal-format").value = item ? item.format : "list";
  document.getElementById("manual-modal-content").value = item ? item.content : "";
  document.getElementById("manual-modal-delete").hidden = !item;
  document.getElementById("manual-modal-overlay").hidden = false;
  document.getElementById("manual-modal-name").focus();
}
function closeManualModal(){ document.getElementById("manual-modal-overlay").hidden = true; editingManualId = ""; }
async function saveManualModal(){
  const title=document.getElementById("manual-modal-name").value.trim();
  const category=document.getElementById("manual-modal-category").value.trim() || "기타";
  const format=document.getElementById("manual-modal-format").value === "paragraph" ? "paragraph" : "list";
  const content=document.getElementById("manual-modal-content").value.trim();
  if(!title){ showToast("매뉴얼 제목을 입력하세요."); return; }
  if(!content){ showToast("매뉴얼 내용을 입력하세요."); return; }
  const previous=deepCopy(manualSections);
  if(editingManualId){
    const item=manualSections.find(x=>x.id===editingManualId); if(!item) return;
    Object.assign(item,{title,category,format,content,updatedAt:nowIso()});
  }else manualSections.push(normalizeManualSection({id:uid(),title,category,format,content,updatedAt:nowIso()},manualSections.length));
  if(!await saveOrRollback(saveManualSections,()=>{manualSections=previous;},"매뉴얼 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){renderManualSettings();return;}
  closeManualModal(); renderManualSettings();
}
async function deleteManualSection(id){
  const item=manualSections.find(x=>x.id===id); if(!item) return;
  if(!confirm(`"${item.title}" 매뉴얼을 삭제할까요?`)) return;
  const previous=deepCopy(manualSections);
  manualSections=manualSections.filter(x=>x.id!==id);
  if(!await saveOrRollback(saveManualSections,()=>{manualSections=previous;},"매뉴얼 삭제 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){renderManualSettings();return;}
  closeManualModal(); renderManualSettings();
}
async function moveManualSection(id,dir){
  const idx=manualSections.findIndex(x=>x.id===id); if(idx<0) return;
  const to=idx+dir; if(to<0 || to>=manualSections.length) return;
  const previous=deepCopy(manualSections);
  [manualSections[idx],manualSections[to]]=[manualSections[to],manualSections[idx]];
  await saveOrRollback(saveManualSections,()=>{manualSections=previous;},"매뉴얼 순서 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  renderManualSettings();
}
async function resetManualSections(){
  if(!confirm("현재 매뉴얼을 기본 내용으로 교체할까요? 직접 추가하거나 수정한 내용은 삭제됩니다.")) return;
  const previous=deepCopy(manualSections);
  manualSections=deepCopy(DEFAULT_MANUAL_SECTIONS).map(normalizeManualSection);
  await saveOrRollback(saveManualSections,()=>{manualSections=previous;},"매뉴얼 초기화 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  renderManualSettings();
}

let stageModalMode = "add";
let stageEditingName = "";
let stageSelectedColorIdx = 0;
let stageDragName = "";
/* 설정>단계에서 끌어다 놓은 순서를 저장하고 파이프라인 열 순서에 반영 */
async function reorderStages(moving, target){
  if(!moving || !target || moving === target) return;
  const fromIdx = STAGE_OPTIONS.indexOf(moving);
  const toIdx = STAGE_OPTIONS.indexOf(target);
  if(fromIdx < 0 || toIdx < 0) return;
  const previous = [...STAGE_OPTIONS];
  STAGE_OPTIONS.splice(fromIdx, 1);
  const targetIdx = STAGE_OPTIONS.indexOf(target);
  /* 아래로 끌면 대상 뒤에, 위로 끌면 대상 앞에 놓이도록 배치 */
  STAGE_OPTIONS.splice(fromIdx < toIdx ? targetIdx + 1 : targetIdx, 0, moving);
  try{
    await saveStageSettings();
  }catch(error){
    STAGE_OPTIONS = previous;
    console.error("stage reorder save failed", error);
    showToast(error?.message || "단계 순서 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
  refreshConfiguredViews();
}
function renderStageSwatches(){
  const wrap = document.getElementById("stage-modal-swatches");
  wrap.innerHTML = "";
  PALETTE.forEach((p, idx)=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tn-swatch" + (idx === stageSelectedColorIdx ? " selected" : "");
    b.style.background = p.color;
    b.addEventListener("click", ()=>{ stageSelectedColorIdx = idx; renderStageSwatches(); });
    wrap.appendChild(b);
  });
}
function openStageModal(mode, stage){
  if(mode === "edit" && RESERVED_STAGES.includes(stage)){
    showToast("수주·보류·실주는 수주율과 확률 계산에 사용되는 기본 단계라 수정할 수 없습니다.");
    return;
  }
  stageModalMode = mode;
  stageEditingName = stage || "";
  document.getElementById("stage-modal-title").textContent = mode === "edit" ? "단계 편집" : "새 단계";
  document.getElementById("stage-modal-name").value = stage || "";
  const color = stage ? STAGE_COLORS[stage] : "";
  /* 기본 팔레트에 없는 색(리드·실주 기본색 등)은 -1로 두어 저장 시 기존 색을 유지 */
  stageSelectedColorIdx = color ? PALETTE.findIndex(p=>p.color === color) : 0;
  document.getElementById("stage-modal-delete").hidden = mode !== "edit";
  renderStageSwatches();
  document.getElementById("stage-modal-overlay").hidden = false;
  document.getElementById("stage-modal-name").focus();
}
function closeStageModal(){ document.getElementById("stage-modal-overlay").hidden = true; }
async function saveStageModal(){
  const name = document.getElementById("stage-modal-name").value.trim();
  if(!name){ showToast("단계 이름을 입력하세요."); return; }
  const color = stageSelectedColorIdx >= 0
    ? PALETTE[stageSelectedColorIdx].color
    : (STAGE_COLORS[stageEditingName] || PALETTE[0].color);
  const snapshot = settingsSnapshot();
  let renamedAreaKeys = [];
  if(stageModalMode === "add"){
    if(STAGE_OPTIONS.includes(name)){ showToast("이미 있는 단계입니다."); return; }
    STAGE_OPTIONS.push(name);
    STAGE_COLORS[name] = color;
  }else{
    const old = stageEditingName;
    if(RESERVED_STAGES.includes(old)){ showToast("수주·보류·실주는 통계 계산에 사용되는 기본 단계라 수정할 수 없습니다."); closeStageModal(); return; }
    if(name !== old && STAGE_OPTIONS.includes(name)){ showToast("이미 있는 단계입니다."); return; }
    const idx = STAGE_OPTIONS.indexOf(old);
    if(idx >= 0) STAGE_OPTIONS[idx] = name;
    delete STAGE_COLORS[old];
    STAGE_COLORS[name] = color;
    if(name !== old){
      /* 이름을 바꾸면 그 단계를 쓰던 영업 항목도 함께 옮겨야 하므로 한 번에 저장한다 */
      renamedAreaKeys = AREAS.filter(area=>(stageData[area.key] || []).some(item=>item.stage === old)).map(area=>area.key);
      AREAS.forEach(area=>(stageData[area.key] || []).forEach(item=>{ if(item.stage === old) item.stage = name; }));
    }
  }
  if(!await saveSettingsTogether({stages:true, areaKeys:renamedAreaKeys}, snapshot, "단계 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){
    refreshConfiguredViews();
    return;
  }
  closeStageModal();
  refreshConfiguredViews();
}
async function deleteStageFromSettings(stage){
  if(RESERVED_STAGES.includes(stage)){ showToast("수주·보류·실주는 수주율과 확률 계산에 사용되는 기본 단계라 삭제할 수 없습니다."); return; }
  if(STAGE_OPTIONS.length <= 1){ showToast("단계는 최소 1개가 필요합니다."); return; }
  if(!confirm(`"${stage}" 단계를 삭제할까요? 해당 단계의 항목은 남은 첫 진행 단계로 이동합니다.`)) return;
  const snapshot = settingsSnapshot();
  STAGE_OPTIONS = STAGE_OPTIONS.filter(s=>s !== stage);
  delete STAGE_COLORS[stage];
  /* 삭제된 단계의 항목이 수주·보류·실주로 잘못 집계되지 않게 첫 진행 단계로 이동 */
  const fallback = STAGE_OPTIONS.find(s=>!RESERVED_STAGES.includes(s)) || STAGE_OPTIONS[0];
  const movedAreaKeys = AREAS.filter(area=>(stageData[area.key] || []).some(item=>item.stage === stage)).map(area=>area.key);
  AREAS.forEach(area=>(stageData[area.key] || []).forEach(item=>{ if(item.stage === stage) item.stage = fallback; }));
  /* 단계 설정과 옮겨진 항목을 한 번에 저장해 없는 단계를 가리키는 항목이 남지 않게 한다 */
  if(!await saveSettingsTogether({stages:true, areaKeys:movedAreaKeys}, snapshot, "단계 삭제 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){
    refreshConfiguredViews();
    return;
  }
  closeStageModal();
  refreshConfiguredViews();
}

let bucketModalMode = "add";
let bucketEditingKey = "";
function openBucketModal(mode, key){
  bucketModalMode = mode;
  bucketEditingKey = key || "";
  const meta = key ? bucketMetaByKey(key) : null;
  document.getElementById("bucket-modal-title").textContent = mode === "edit" ? "그룹 분류 편집" : "새 그룹 분류";
  document.getElementById("bucket-modal-label").value = meta ? meta.label : "";
  document.getElementById("bucket-modal-desc").value = meta ? meta.desc : "";
  document.getElementById("bucket-modal-weight").value = meta ? (importanceConfig.bucketWeights[key] ?? meta.weight ?? 1) : "1";
  document.getElementById("bucket-modal-delete").hidden = mode !== "edit";
  document.getElementById("bucket-modal-overlay").hidden = false;
  document.getElementById("bucket-modal-label").focus();
}
function closeBucketModal(){ document.getElementById("bucket-modal-overlay").hidden = true; }
async function saveBucketModal(){
  const label = document.getElementById("bucket-modal-label").value.trim();
  const desc = document.getElementById("bucket-modal-desc").value.trim();
  const weight = numValue("bucket-modal-weight", 1);
  if(!label){ showToast("분류 이름을 입력하세요."); return; }
  const snapshot = settingsSnapshot();
  if(bucketModalMode === "add"){
    const key = safeKeyFromLabel(label, "bucket");
    REVENUE_BUCKETS[key] = {key, label, desc, weight};
    BUCKET_ORDER.push(key);
    importanceConfig.bucketWeights[key] = weight;
  }else{
    const key = bucketEditingKey;
    REVENUE_BUCKETS[key] = {...REVENUE_BUCKETS[key], label, desc, weight};
    importanceConfig.bucketWeights[key] = weight;
  }
  invalidateImportanceCache();
  /* 분류 목록과 가중치는 서로를 참조하므로 함께 저장한다 */
  if(!await saveSettingsTogether({buckets:true, importance:true}, snapshot, "분류 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){
    refreshConfiguredViews();
    return;
  }
  closeBucketModal();
  refreshConfiguredViews();
}
async function deleteBucketFromSettings(key){
  if(BUCKET_ORDER.length <= 1){ showToast("그룹 분류는 최소 1개가 필요합니다."); return; }
  const meta = bucketMetaByKey(key);
  if(!confirm(`"${meta.label}" 분류를 삭제할까요? 해당 분류의 항목은 남은 첫 분류로 이동합니다.`)) return;
  const snapshot = settingsSnapshot();
  const fallback = BUCKET_ORDER.find(k=>k !== key);
  const movedAreaKeys = [];
  AREAS.forEach(area=>{
    if(area.bucket === key) area.bucket = fallback;
    if((stageData[area.key] || []).some(item=>item.bucket === key)) movedAreaKeys.push(area.key);
    (stageData[area.key] || []).forEach(item=>{ if(item.bucket === key) item.bucket = fallback; });
  });
  BUCKET_ORDER = BUCKET_ORDER.filter(k=>k !== key);
  delete REVENUE_BUCKETS[key];
  delete importanceConfig.bucketWeights[key];
  invalidateImportanceCache();
  /* 분류·가중치·그룹·옮겨진 항목을 한 번에 저장한다. 중간에 끊기면 없는 분류를 가리키는 항목이 남는다 */
  if(!await saveSettingsTogether({buckets:true, importance:true, areas:true, areaKeys:movedAreaKeys}, snapshot, "분류 삭제 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){
    refreshConfiguredViews();
    return;
  }
  closeBucketModal();
  refreshConfiguredViews();
}
async function deleteGroupFromSettings(key){
  const area=findAreaByKey(key);if(!area)return;
  if(!confirm(`"${area.title}" 그룹과 안의 항목을 휴지통으로 이동할까요?`))return;
  try{await moveGroupToTrash(area);}catch(error){showToast(error.message);return;}
  const view=document.getElementById("view-"+key);if(view)view.remove();showView("settings");renderHome();renderPipeline(true);renderSettings();
}

/* ---------- 영업지원 실행과제 ---------- */
function supportTaskStatusClass(status){ return {"진행중":"progress","검토대기":"review","완료":"done","보류":"hold"}[status] || ""; }
function supportTaskPriorityRank(priority){ return {"높음":0,"중간":1,"낮음":2}[priority] ?? 9; }
function supportTaskDueDays(item){ return item.dueDate ? daysUntil(item.dueDate) : null; }
function supportTaskIsOverdue(item){ const d=supportTaskDueDays(item); return item.status!=="완료" && item.status!=="보류" && d!==null && d<0; }
function supportTaskDueText(item){
  if(!item.dueDate) return "마감일 미지정";
  const d=supportTaskDueDays(item);
  if(item.status==="완료") return `완료 ${item.completedAt || item.dueDate}`;
  if(d===null) return "마감일 확인 필요";
  if(d<0) return `${Math.abs(d)}일 초과`;
  if(d===0) return "오늘 마감";
  return `D-${d}`;
}
function supportTaskLinkedDeal(item){
  return item.relatedAreaKey && item.relatedDealId ? findDeal(item.relatedAreaKey,item.relatedDealId) : null;
}
function effectiveSupportTaskOwner(item){
  const linked=supportTaskLinkedDeal(item);
  if(item.inheritOwner && linked) return String(linked.item.internalOwner||"").trim();
  return String(item.owner||"").trim();
}
function supportTaskRelationLabel(item){
  const linked=supportTaskLinkedDeal(item);
  return linked ? `${linked.item.title} · ${linked.area.title} · ${normalizeStage(linked.item.stage)}` : "";
}
function taskDealValue(item){ return item.relatedAreaKey && item.relatedDealId ? `${item.relatedAreaKey}::${item.relatedDealId}` : ""; }
function parseTaskDealValue(value){
  const idx=String(value||"").indexOf("::");
  return idx<0 ? {areaKey:"",dealId:""} : {areaKey:value.slice(0,idx),dealId:value.slice(idx+2)};
}
function updateRoadmapFilterOptions(){
  const configs=[["roadmap-type-filter",SUPPORT_TASK_TYPES],["roadmap-status-filter",SUPPORT_TASK_STATUSES],["roadmap-priority-filter",SUPPORT_TASK_PRIORITIES]];
  configs.forEach(([id,values])=>{ const sel=document.getElementById(id); if(!sel)return; const cur=sel.value; const first=sel.options[0]?.textContent || "전체"; sel.innerHTML=`<option value="">${escapeHtml(first)}</option>`; values.forEach(v=>sel.insertAdjacentHTML("beforeend",`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)); sel.value=values.includes(cur)?cur:""; });
  const ownerSel=document.getElementById("roadmap-owner-filter");
  if(ownerSel){ const cur=ownerSel.value; const owners=[...new Set(roadmapData.map(effectiveSupportTaskOwner).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko")); ownerSel.innerHTML='<option value="">모든 담당자</option>'+owners.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(""); ownerSel.value=owners.includes(cur)?cur:""; }
}
function roadmapFilteredData(){
  const q=(document.getElementById("roadmap-search")?.value || "").trim().toLowerCase();
  const type=document.getElementById("roadmap-type-filter")?.value || "";
  const status=document.getElementById("roadmap-status-filter")?.value || "";
  const owner=document.getElementById("roadmap-owner-filter")?.value || "";
  const priority=document.getElementById("roadmap-priority-filter")?.value || "";
  const sort=document.getElementById("roadmap-sort")?.value || "due";
  const list=roadmapData.filter(item=>{
    const hay=[item.title,item.type,item.purpose,item.deliverable,effectiveSupportTaskOwner(item),item.collaborators,item.nextAction,item.blocker,item.notes,supportTaskRelationLabel(item)].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && (!type || item.type===type) && (!status || item.status===status) && (!owner || effectiveSupportTaskOwner(item)===owner) && (!priority || item.priority===priority);
  });
  list.sort((a,b)=>{
    if(sort==="priority") return supportTaskPriorityRank(a.priority)-supportTaskPriorityRank(b.priority) || (a.dueDate||"9999").localeCompare(b.dueDate||"9999");
    if(sort==="updated") return String(b.updatedAt||"").localeCompare(String(a.updatedAt||""));
    if(sort==="title") return String(a.title||"").localeCompare(String(b.title||""),"ko");
    const aClosed=["완료","보류"].includes(a.status), bClosed=["완료","보류"].includes(b.status);
    return Number(aClosed)-Number(bClosed) || (a.dueDate||"9999-12-31").localeCompare(b.dueDate||"9999-12-31") || supportTaskPriorityRank(a.priority)-supportTaskPriorityRank(b.priority);
  });
  return list;
}
function makeRoadmapCard(item){
  const card=document.createElement("article");
  const overdue=supportTaskIsOverdue(item),done=item.status==="완료",relation=supportTaskRelationLabel(item),owner=effectiveSupportTaskOwner(item);
  card.className="tn-task-card"+(overdue?" overdue":"")+(done?" done":"");
  card.innerHTML=`
    <div class="tn-task-card-head"><div class="tn-task-card-title">${escapeHtml(item.title)}</div><span class="tn-task-chip ${supportTaskStatusClass(item.status)}">${escapeHtml(item.status)}</span></div>
    ${relation?`<div><span class="tn-related-chip">연결 영업 · <span>${escapeHtml(relation)}</span></span></div>`:""}
    <div class="tn-task-card-purpose">${escapeHtml(item.purpose||"해야 할 일이 입력되지 않았습니다.")}</div>
    <div class="tn-task-meta"><span>담당 <b>${escapeHtml(owner||"미지정")}</b></span><span class="${overdue?"overdue":""}">마감 <b>${escapeHtml(supportTaskDueText(item))}</b></span></div>
    <div class="tn-task-card-foot"><select data-task-status="${escapeHtml(item.id)}" aria-label="상태 변경">${SUPPORT_TASK_STATUSES.map(v=>`<option value="${escapeHtml(v)}" ${v===item.status?"selected":""}>${escapeHtml(v)}</option>`).join("")}</select><div class="tn-task-card-actions"><button class="tn-btn small" data-task-edit="${escapeHtml(item.id)}">열기</button><button class="tn-btn small danger" data-task-delete="${escapeHtml(item.id)}">삭제</button></div></div>`;
  card.addEventListener("click",e=>{if(e.target.closest("button,select"))return;openRoadmapModal(item.id);});
  return card;
}

function renderRoadmap(){
  updateRoadmapFilterOptions();
  const total=roadmapData.length, done=roadmapData.filter(isSupportTaskDone).length;
  const active=roadmapData.filter(x=>["진행중","검토대기"].includes(x.status)).length;
  const overdue=roadmapData.filter(supportTaskIsOverdue).length;
  const rate=total?Math.round(done/total*100):0;
  document.getElementById("task-summary-total").textContent=total;
  document.getElementById("task-summary-active").textContent=active;
  document.getElementById("task-summary-overdue").textContent=overdue;
  document.getElementById("task-summary-rate").textContent=rate+"%";
  document.getElementById("roadmap-progress-label").textContent=`완료 ${done} / ${total}`;
  const wrap=document.getElementById("roadmap-list"); wrap.innerHTML="";
  const list=roadmapFilteredData();
  if(!list.length){ wrap.innerHTML='<div class="tn-task-empty">조건에 맞는 실행과제가 없습니다. 고객과 진행하는 영업은 파이프라인에, 내부 준비 업무는 이 화면에 등록하세요.</div>'; return; }
  list.forEach(item=>wrap.appendChild(makeRoadmapCard(item)));
}
function fillRoadmapDealSelect(selected=""){
  const sel=document.getElementById("roadmap-modal-deal"); if(!sel)return;
  const list=allDeals().slice().sort((a,b)=>(a.item.title||"").localeCompare(b.item.title||"","ko"));
  sel.innerHTML='<option value="">연결하지 않음 · 전체 영업을 위한 공통 과제</option>';
  list.forEach(({area,item})=>{
    const value=`${area.key}::${item.id}`;
    const o=document.createElement("option");o.value=value;o.textContent=`${item.title} · ${area.title} · ${normalizeStage(item.stage)}`;o.selected=value===selected;sel.appendChild(o);
  });
}
function updateRoadmapRelationUi(){
  const value=document.getElementById("roadmap-modal-deal").value;
  const ref=parseTaskDealValue(value); const linked=ref.areaKey&&ref.dealId?findDeal(ref.areaKey,ref.dealId):null;
  const preview=document.getElementById("roadmap-modal-related-preview");
  const inherit=document.getElementById("roadmap-modal-inherit-owner");
  const owner=document.getElementById("roadmap-modal-owner");
  inherit.disabled=!linked;
  if(!linked){ inherit.checked=false; preview.className="tn-related-preview"; preview.textContent="특정 고객 영업과 관련된 과제라면 연결하세요. 연결된 고객사·그룹·단계는 자동으로 표시됩니다."; owner.disabled=false;owner.classList.remove("tn-owner-inherited"); if(owner.dataset.manualOwner!==undefined)owner.value=owner.dataset.manualOwner; return; }
  preview.className="tn-related-preview linked";
  preview.innerHTML=`<b>${escapeHtml(linked.item.title)}</b><br>${escapeHtml(linked.area.title)} · ${escapeHtml(normalizeStage(linked.item.stage))} · 고객 후속일 ${escapeHtml(linked.item.nextAction||"미지정")}`;
  if(inherit.checked){
    if(!owner.disabled) owner.dataset.manualOwner=owner.value;
    owner.disabled=true;owner.classList.add("tn-owner-inherited");owner.value=linked.item.internalOwner||"";owner.placeholder=linked.item.internalOwner?"파이프라인 담당자를 사용합니다.":"연결된 영업 항목의 내부 담당자가 비어 있습니다.";
  }else{
    owner.disabled=false;owner.classList.remove("tn-owner-inherited");owner.value=owner.dataset.manualOwner!==undefined?owner.dataset.manualOwner:owner.value;owner.placeholder="예: 홍길동";
  }
}
let roadmapEditorSeed=null,roadmapSaving=false;
function openRoadmapModal(id="",defaults={}){
  if(roadmapSaving)return;
  editingRoadmapId=id;
  const item=id?roadmapData.find(x=>x.id===id):normalizeSupportTask({id:uid(),title:"",type:"내부 확인",status:"미착수",priority:"중간",progress:0,...defaults});
  if(!item)return;
  roadmapEditorSeed=deepCopy(item);
  document.getElementById("roadmap-modal-title").textContent=id?"지원 업무 수정":"새 지원 업무";
  document.getElementById("roadmap-modal-name").value=item.title||"";
  fillSelectOptions(document.getElementById("roadmap-modal-type"),SUPPORT_TASK_TYPES,item.type);
  fillSelectOptions(document.getElementById("roadmap-modal-status"),SUPPORT_TASK_STATUSES,item.status);
  fillSelectOptions(document.getElementById("roadmap-modal-priority"),SUPPORT_TASK_PRIORITIES,item.priority);
  document.getElementById("roadmap-modal-progress").value=item.progress;
  document.getElementById("roadmap-modal-purpose").value=item.purpose||"";
  document.getElementById("roadmap-modal-deliverable").value=item.deliverable||"";
  const owner=document.getElementById("roadmap-modal-owner");owner.value=item.owner||"";owner.dataset.manualOwner=item.owner||"";
  document.getElementById("roadmap-modal-collaborators").value=item.collaborators||"";
  document.getElementById("roadmap-modal-start").value=item.startDate||"";
  document.getElementById("roadmap-modal-due").value=item.dueDate||"";
  document.getElementById("roadmap-modal-next").value=item.nextAction||"";
  document.getElementById("roadmap-modal-blocker").value=item.blocker||"";
  document.getElementById("roadmap-modal-notes").value=item.notes||"";
  fillRoadmapDealSelect(taskDealValue(item));
  document.getElementById("roadmap-modal-inherit-owner").checked=!!item.inheritOwner;
  updateRoadmapRelationUi();
  document.getElementById("roadmap-modal-delete").hidden=!id;
  document.getElementById("roadmap-modal-ai").hidden=!id;
  document.getElementById("roadmap-modal-overlay").hidden=false;
  document.getElementById("roadmap-modal-name").focus();
}
function closeRoadmapModal(){if(roadmapSaving)return;document.getElementById("roadmap-modal-overlay").hidden=true;editingRoadmapId="";}
async function saveRoadmapModal(){
  if(roadmapSaving)return;
  const title=document.getElementById("roadmap-modal-name").value.trim();
  const purpose=document.getElementById("roadmap-modal-purpose").value.trim();
  const deliverable=document.getElementById("roadmap-modal-deliverable").value.trim();
  if(!title){ showToast("과제명을 입력하세요."); return; }
  if(!purpose){ showToast("추진 목적을 입력하세요."); return; }
  if(!deliverable){ showToast("완료 기준 또는 산출물을 입력하세요."); return; }
  const status=document.getElementById("roadmap-modal-status").value;
  const progress={"미착수":0,"진행중":50,"검토대기":80,"완료":100,"보류":0}[status] ?? 0;
  const relation=parseTaskDealValue(document.getElementById("roadmap-modal-deal").value);
  const inheritOwner=!!relation.dealId && document.getElementById("roadmap-modal-inherit-owner").checked;
  const values={title,type:document.getElementById("roadmap-modal-type").value,status,priority:document.getElementById("roadmap-modal-priority").value,progress,purpose,deliverable,owner:inheritOwner?"":document.getElementById("roadmap-modal-owner").value.trim(),collaborators:document.getElementById("roadmap-modal-collaborators").value.trim(),startDate:document.getElementById("roadmap-modal-start").value,dueDate:document.getElementById("roadmap-modal-due").value,nextAction:document.getElementById("roadmap-modal-next").value.trim(),blocker:document.getElementById("roadmap-modal-blocker").value.trim(),notes:document.getElementById("roadmap-modal-notes").value.trim(),relatedAreaKey:relation.areaKey,relatedDealId:relation.dealId,inheritOwner,updatedAt:nowIso(),checked:status==="완료"};
  const existing=roadmapData.find(item=>item.id===editingRoadmapId);
  const item=normalizeSupportTask({...roadmapEditorSeed,...values,completedAt:status==="완료"?(existing?.completedAt||todayStr()):""});
  const next=existing?roadmapData.map(task=>task.id===item.id?item:task):[...roadmapData,item];
  const button=document.getElementById("roadmap-modal-save");roadmapSaving=true;button.disabled=true;
  try{await storageSet("tinico:stage:roadmap",next);roadmapSaving=false;closeRoadmapModal();renderRoadmap();renderHome();if(selectedDealRef)renderDealDrawer(false);}
  catch(error){showToast(error.message||"지원 업무 저장에 실패했습니다. 입력 내용은 유지됩니다.");}
  finally{roadmapSaving=false;button.disabled=false;}
}
async function deleteRoadmapTask(id){
  const item=roadmapData.find(x=>x.id===id); if(!item)return;
  if(!confirm(`"${item.title}" 실행과제를 휴지통으로 이동할까요?`))return;
  try{
    const entry={id:uid(),type:"roadmap",label:item.title||"영업지원 실행과제",deletedAt:nowIso(),deletedBy:trashActor(),payload:deepCopy(item),meta:{}};
    const result=await storageTransaction([{key:"tinico:trash",value:[entry,...trashData].slice(0,200)},{key:"tinico:stage:roadmap",value:roadmapData.filter(x=>x.id!==id)}]);
    trashData=result.records["tinico:trash"].value;roadmapData=result.records["tinico:stage:roadmap"].value;
    showUndo(`${entry.label}을(를) 휴지통으로 이동했습니다.`,entry.id);renderTrash();
    closeRoadmapModal();renderRoadmap();renderHome();if(selectedDealRef)renderDealDrawer(false);
  }catch(error){showToast(error.message||"지원 업무 삭제에 실패했습니다.");}
}
async function quickChangeRoadmapStatus(id,status){
  const item=roadmapData.find(x=>x.id===id); if(!item)return;
  const previous=deepCopy(roadmapData);
  item.status=status; item.checked=status==="완료"; item.updatedAt=nowIso();
  if(status==="완료"){item.progress=100;item.completedAt=item.completedAt||todayStr();}else{item.completedAt="";if(item.progress===100)item.progress=75;}
  await saveOrRollback(saveRoadmapData,()=>roadmapData.splice(0,roadmapData.length,...previous),"지원 업무 상태 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  renderRoadmap(); renderHome(); if(selectedDealRef)renderDealDrawer(false);
}

/* ================= 연락처 (Contacts CRUD) ================= */
let contactsData = [];
let pendingImageTargetId = null;
let contactViewMode = "table";
let selectedContactId = null;
let pendingCompanyContactId = null;

function splitLegacyRole(role){
  const text = String(role || "").trim();
  if(!text) return {jobTitle:"", department:""};
  const parts = text.split(/\s*[|/]\s*/).map(s=>s.trim()).filter(Boolean);
  const deptRe = /(팀|부|실|본부|센터|사업부|연구소|Department|Division|Team|Center|Office)$/i;
  if(parts.length >= 2){
    /* "과장 | 현장지원팀"처럼 직책·부서 순서가 명함마다 달라 어미로 부서를 판별 */
    const deptParts = parts.filter(p=>deptRe.test(p));
    if(deptParts.length && deptParts.length < parts.length){
      return {department:deptParts.join(" / "), jobTitle:parts.filter(p=>!deptRe.test(p)).join(" / ")};
    }
    return {department:parts[0], jobTitle:parts.slice(1).join(" / ")};
  }
  return deptRe.test(text) ? {department:text, jobTitle:""} : {jobTitle:text, department:""};
}
function syncContactLegacyFields(contact){
  contact.role = [contact.jobTitle, contact.department].filter(Boolean).join(" / ") || contact.role || "";
  contact.phone = contact.mobilePhone || contact.businessPhone || contact.phone || "";
  return contact;
}
function normalizeContact(c){
  const contact = {
    name:"", company:"", department:"", jobTitle:"", mobilePhone:"", businessPhone:"", fax:"",
    email:"", address:"", birthday:"", website:"", group:"", registrar:"", memo:"", cardImage:"", cardThumb:"",
    tags:"", fav:false, role:"", phone:"", createdAt:"", companyLookupAt:"", companyLookupSource:"",
    ocrRaw:"", ocrConfidence:0, ocrUpdatedAt:"", ...c
  };
  if(!contact.jobTitle && !contact.department && contact.role){
    const parsed = splitLegacyRole(contact.role);
    contact.jobTitle = parsed.jobTitle;
    contact.department = parsed.department;
  }
  if(!contact.mobilePhone && !contact.businessPhone && contact.phone){
    const normalized = normalizePhoneNumber(contact.phone);
    if(/^01[016789]-/.test(normalized)) contact.mobilePhone = normalized;
    else contact.businessPhone = normalized;
  }
  if(!contact.group && contact.tags) contact.group = "";
  return syncContactLegacyFields(contact);
}
function migrateSystemTextOutOfMemo(contact){
  const marker = "[OCR 인식 원문]";
  let memo = String(contact.memo || "");
  if(memo.startsWith(marker)){
    let raw = memo.slice(marker.length).replace(/^\s+/, "");
    raw = raw.replace(/(?:^|\n)\[회사명 이미지 검색 확인\][^\n]*/g, "").trim();
    if(!contact.ocrRaw) contact.ocrRaw = raw;
    memo = "";
  }
  memo = memo.replace(/(?:^|\n)\[회사명 이미지 검색 확인\][^\n]*/g, "").trim();
  contact.memo = memo;
  return contact;
}
/* ---- 명함 원본 이미지: 연락처 배열과 분리해 연락처별 키로 저장 ----
   목록·저장에는 소형 썸네일만 포함해, 이름 한 글자 수정에도 전체 이미지가 재업로드되던 문제를 해소 */
function setOcrStatus(msg, actionLabel = "", actionHandler = null){
  const el = document.getElementById("ocr-status");
  if(!msg){ el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = "";
  const text = document.createElement("span");
  text.className = "tn-status-text";
  text.textContent = msg;
  el.appendChild(text);
  if(actionLabel && typeof actionHandler === "function"){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tn-status-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", actionHandler, {once:true});
    el.appendChild(btn);
  }
}
function normalizePhoneNumber(value){
  let digits = String(value || "").replace(/\D/g, "");
  if(digits.startsWith("82")) digits = "0" + digits.slice(2);
  if(/^01[016789]\d{7,8}$/.test(digits)){
    return digits.length === 11 ? `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}` : `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if(/^02\d{7,8}$/.test(digits)) return digits.length === 10 ? `${digits.slice(0,2)}-${digits.slice(2,6)}-${digits.slice(6)}` : `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5)}`;
  if(/^0\d{8,10}$/.test(digits)) return `${digits.slice(0,3)}-${digits.slice(3,-4)}-${digits.slice(-4)}`;
  return String(value || "").trim();
}
function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
function contactImageKey(id){ return "tinico:contact:image:" + id; }
function contactHasCardImage(ct){ return !!(ct && (ct.cardImage || ct.cardThumb)); }
function stripContactImages(contacts){ return contacts.map(({cardImage, ...rest})=>rest); }
async function makeCardThumb(dataUrl){
  try{
    /* 이미지 로드가 불가능한 환경(테스트 등)에서 멈추지 않도록 시간 제한을 둠 */
    const img = await Promise.race([
      loadImageFromDataUrl(dataUrl),
      new Promise(resolve=>setTimeout(()=>resolve(null), 1500))
    ]);
    if(!img) return "";
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if(!w || !h) return "";
    const scale = Math.min(1, 360 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d", {alpha:false});
    if(!ctx) return "";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const thumb = canvas.toDataURL("image/jpeg", .72);
    return typeof thumb === "string" && thumb.startsWith("data:image") ? thumb : "";
  }catch(e){
    return "";
  }
}
async function loadContactCardImage(ct){
  if(!ct) return "";
  if(ct.cardImage) return ct.cardImage;
  if(!contactHasCardImage(ct)) return "";
  try{
    const stored = await storageGet(contactImageKey(ct.id));
    if(typeof stored === "string" && stored.startsWith("data:")) ct.cardImage = stored;
  }catch(error){
    console.error("card image load failed", error);
  }
  return ct.cardImage || "";
}
async function deleteContactCardImageKey(id){
  try{ await storageDelete(contactImageKey(id)); }
  catch(error){ console.error("card image delete failed", error); }
}
async function loadContacts(){
  const data = (await storageGet("tinico:contacts")) || [];
  const contacts = data.map(c=>migrateSystemTextOutOfMemo(normalizeContact(c)));
  /* 이전 버전에서 메모 칸에 자동 삽입된 OCR 원문을 별도 필드로 이동.
     jsonb는 객체 키 순서를 보존하지 않고 저장본에는 명함 원본이 빠져 있으므로,
     저장 형태(썸네일까지)로 맞춘 뒤 키 정렬 표준형으로 비교해야 실제 변경만 감지된다. */
  const memoMigrated = !sameStoredValue(stripContactImages(contacts), stripContactImages(data));
  /* 연락처 배열 안에 저장돼 있던 명함 원본을 연락처별 키로 분리 (최초 1회, 실패 시 다음 접속에서 재시도) */
  const legacyImages = contacts.filter(c=>typeof c.cardImage === "string" && c.cardImage.startsWith("data:"));
  if(legacyImages.length){
    showToast(`명함 이미지 저장 구조를 개선하는 중입니다... (${legacyImages.length}장, 최초 1회)`, "info");
    for(const ct of legacyImages){
      await storageSet(contactImageKey(ct.id), ct.cardImage);
      if(!ct.cardThumb) ct.cardThumb = (await makeCardThumb(ct.cardImage)) || "";
    }
  }
  if(memoMigrated || legacyImages.length) await storageSet("tinico:contacts", stripContactImages(contacts));
  return contacts;
}
async function saveContacts(){
  /* 명함 원본은 별도 키에 있으므로 목록 저장에는 썸네일까지만 포함 */
  await storageSet("tinico:contacts", stripContactImages(contactsData));
}

/* 업로드/촬영 이미지를 고해상도로 보존하여 작은 글자 손실을 줄임 */
function fileToResizedDataUrl(file, maxW = 1800, quality = 0.9){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        /* 세로로 매우 긴 사진이 원본 크기로 남아 메모리·저장 한도를 넘지 않게 긴 변 기준으로 축소 */
        const scale = Math.min(1, maxW / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d", {alpha:false});
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


/* getUserMedia 미지원 시 열린 휴대폰 기본 카메라 사진도 중앙의 명함 비율로 정리 */
function fileToCenteredCardDataUrl(file, maxW=2400, quality=.95){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
        const targetAspect=1.8;
        let sx=0,sy=0,sw=iw,sh=ih;
        if(iw/ih>targetAspect){sw=ih*targetAspect;sx=(iw-sw)/2;}
        else{sh=iw/targetAspect;sy=(ih-sh)/2;}
        const scale=Math.min(1,maxW/sw);
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(sw*scale));
        canvas.height=Math.max(1,Math.round(sh*scale));
        const ctx=canvas.getContext("2d",{alpha:false});
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
        ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.onerror=reject;img.src=reader.result;
    };
    reader.onerror=reject;reader.readAsDataURL(file);
  });
}

async function convertContactToDeal(ct){
  const targetArea = AREAS.find(a=>a.key === "existing_accounts") || AREAS[0];
  if(!targetArea){ showToast("항목을 추가할 그룹이 없습니다."); return; }
  if(!confirm(`"${ct.name || ct.company || "이 연락처"}"를 [${targetArea.title}] 그룹의 영업 항목으로 전환할까요?`)) return;
  const newItem = normalizeItem({
    id: uid(),
    title: ct.company ? `${ct.company}${ct.name ? " (" + ct.name + ")" : ""}` : (ct.name || "새 항목"),
    stage: "리드",
    bucket: areaBucketKey(targetArea),
    contactName: ct.name, contactRole: [ct.department, ct.jobTitle].filter(Boolean).join(" / "), contactPhone: ct.mobilePhone || ct.businessPhone, contactEmail: ct.email,
    note: ct.memo ? "[연락처에서 전환됨]\n" + ct.memo : "[연락처에서 전환됨]",
    lastContact: todayStr(), linkedContactIds:[ct.id],
  });
  if(!closeContactDetail())return;
  showView(targetArea.key);
  openDealDrawer(targetArea.key,newItem.id,newItem);
}

/* 리멤버식 연락처 목록·우측 상세 */
const selectedContactIds = new Set();
const OUTLOOK_CSV_HEADERS = ["Title", "First Name", "Middle Name", "Last Name", "Suffix", "Company", "Department", "Job Title", "Business Street", "Business Street 2", "Business Street 3", "Business City", "Business State", "Business Postal Code", "Business Country/Region", "Home Street", "Home Street 2", "Home Street 3", "Home City", "Home State", "Home Postal Code", "Home Country/Region", "Other Street", "Other Street 2", "Other Street 3", "Other City", "Other State", "Other Postal Code", "Other Country/Region", "Assistant's Phone", "Business Fax", "Business Phone", "Business Phone 2", "Callback", "Car Phone", "Company Main Phone", "Home Fax", "Home Phone", "Home Phone 2", "ISDN", "Mobile Phone", "Other Fax", "Other Phone", "Pager", "Primary Phone", "Radio Phone", "TTY/TDD Phone", "Telex", "Account", "Anniversary", "Assistant's Name", "Billing Information", "Birthday", "Business Address PO Box", "Categories", "Children", "Directory Server", "E-mail Address", "E-mail Type", "E-mail Display Name", "E-mail 2 Address", "E-mail 2 Type", "E-mail 2 Display Name", "E-mail 3 Address", "E-mail 3 Type", "E-mail 3 Display Name", "Gender", "Government ID Number", "Hobby", "Home Address PO Box", "Initials", "Internet Free Busy", "Keywords", "Language", "Location", "Manager's Name", "Mileage", "Notes", "Office Location", "Organizational ID Number", "Other Address PO Box", "Priority", "Private", "Profession", "Referred By", "Sensitivity", "Spouse", "User 1", "User 2", "User 3", "User 4", "Web Page"];

function updateContactBulkDeleteButton(){
  const btn = document.getElementById("contact-bulk-delete-btn");
  if(!btn) return;
  const n = selectedContactIds.size;
  btn.disabled = n === 0 || !canEditData();
  btn.textContent = n ? `선택 ${n}명 삭제` : "선택 삭제";
}

async function deleteSelectedContacts(){
  const ids=[...selectedContactIds];if(!ids.length)return;
  if(!confirm(`선택한 연락처 ${ids.length}명을 휴지통으로 이동할까요?`))return;
  await moveContactsToTrash(ids);
  setOcrStatus(`선택한 연락처 ${ids.length}명을 휴지통으로 이동했습니다.`);setTimeout(()=>setOcrStatus(""),3500);
}

function contactPrimaryPhone(ct){ return ct.mobilePhone || ct.businessPhone || ct.phone || ""; }
function contactInitial(ct){ return (ct.name || ct.company || "-").trim().charAt(0).toUpperCase() || "-"; }
function formatRememberDate(value){
  const v = String(value || "").trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.replace(/-/g,".");
  return v || "날짜 미입력";
}

function contactCompanyPeers(ct){
  const company=(ct.company||"").trim();
  return company ? contactsData.filter(c=>(c.company||"").trim()===company) : [ct];
}
function contactRelatedDeals(ct){
  const ids=new Set(contactCompanyPeers(ct).map(c=>c.id));
  return allDeals().filter(d=>(d.item.linkedContactIds||[]).some(id=>ids.has(id)) || (!!ct.company && (d.item.title||"").includes(ct.company)));
}
function renderContactCompanyOverview(container,ct){
  if(!container)return;const peers=contactCompanyPeers(ct),deals=contactRelatedDeals(ct),active=deals.filter(d=>!isClosedStage(d.stage));
  if(!ct.company){container.innerHTML='<div class="tn-empty-compact">회사명을 입력하면 같은 회사의 담당자와 영업 항목을 함께 확인할 수 있습니다.</div>';return;}
  container.innerHTML=`<div class="tn-guide-box"><b>${escapeHtml(ct.company)}</b><br>등록 담당자 ${peers.length}명 · 연결 영업 ${deals.length}건 · 진행 중 ${active.length}건</div><div class="tn-drawer-group-hint">같은 회사 담당자: ${escapeHtml(peers.map(c=>c.name||"이름 미입력").join(", "))}</div>`;
}
function renderContactLinkedDeals(container,ct){
  if(!container)return;container.innerHTML="";
  const linked=contactRelatedDeals(ct);
  if(!linked.length){container.innerHTML='<div class="tn-empty-compact">연결된 영업 항목이 없습니다.</div>';return;}
  linked.forEach(({area,item,stage})=>{const row=document.createElement("div");row.className="tn-linked-deal";row.innerHTML=`<div class="tn-linked-deal-main"><div class="tn-linked-deal-title">${escapeHtml(item.title)}</div><div class="tn-linked-deal-meta">${escapeHtml(area.title)} · ${escapeHtml(stage)}${item.internalOwner?" · 담당 "+escapeHtml(item.internalOwner):""}</div></div><button class="tn-btn small" type="button">열기</button>`;row.querySelector("button").addEventListener("click",()=>{closeContactDetail();openDealDrawer(area.key,item.id);});container.appendChild(row);});
}
function renderContactActivities(container,ct){
  if(!container)return;container.innerHTML="";
  const rows=contactRelatedDeals(ct).flatMap(d=>(d.item.activities||[]).map(a=>({a,d}))).sort((x,y)=>activityDateValue(y.a).localeCompare(activityDateValue(x.a))).slice(0,12);
  if(!rows.length){container.innerHTML='<div class="tn-empty-compact">연결된 영업 항목에 등록된 활동이 없습니다.</div>';return;}
  rows.forEach(({a,d})=>{const row=document.createElement("div");row.className="tn-activity";row.innerHTML=`<div class="tn-activity-head"><span class="tn-activity-type">${escapeHtml(a.type)}</span><span>${escapeHtml(a.date)}</span><span>${escapeHtml(d.item.title)}</span></div><div class="tn-activity-content">${escapeHtml(a.content)}</div>${a.result?`<div class="tn-activity-result">결과: ${escapeHtml(a.result)}</div>`:""}`;container.appendChild(row);});
}

function renderDrawerQuick(container, ct){
  container.innerHTML = "";
  const phone = contactPrimaryPhone(ct);
  if(phone){
    const tel=document.createElement("a"); tel.href="tel:"+phone.replace(/[^+\d]/g,""); tel.textContent="전화"; container.appendChild(tel);
    if(ct.mobilePhone){ const sms=document.createElement("a"); sms.href="sms:"+ct.mobilePhone.replace(/[^+\d]/g,""); sms.textContent="문자"; container.appendChild(sms); }
  }
  if(ct.email){ const mail=document.createElement("a"); mail.href="mailto:"+ct.email; mail.textContent="메일"; container.appendChild(mail); }
}

function renderContactDrawer(scrollIntoView=false){
  const drawer=document.getElementById("contact-drawer");
  const backdrop=document.getElementById("contact-drawer-backdrop");
  const body=document.getElementById("contact-drawer-body");
  const draft=contactDraft(selectedContactId);
  const ct=draft?.value;
  if(!ct){ drawer.hidden=true; backdrop.hidden=true; body.innerHTML=""; selectedContactId=null; return; }

  body.innerHTML=`
    <div class="tn-drawer-hero">
      <div>
        <div class="tn-drawer-profile">
          <div class="tn-drawer-avatar">${escapeHtml(contactInitial(ct))}</div>
          <div class="tn-drawer-identity">
            <input class="tn-drawer-name" data-field="name" placeholder="이름" value="${escapeHtml(ct.name)}">
            <div class="tn-drawer-summary"><strong data-summary-role>${escapeHtml([ct.jobTitle,ct.department].filter(Boolean).join(" / ") || "직책·직무 미입력")}</strong><br><span data-summary-company>${escapeHtml(ct.company || "회사 미입력")}</span></div>
          </div>
        </div>
        <div class="tn-drawer-quick" data-quick></div>
      </div>
      <div data-card-slot></div>
    </div>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">정보</div>
      <div class="tn-drawer-fields">
        <div class="tn-drawer-field"><label>휴대전화</label><input data-field="mobilePhone" type="tel" placeholder="010-0000-0000" value="${escapeHtml(ct.mobilePhone)}"></div>
        <div class="tn-drawer-field"><label>이메일</label><input data-field="email" type="email" placeholder="email@company.com" value="${escapeHtml(ct.email)}"></div>
        <div class="tn-drawer-field"><label>유선전화</label><input data-field="businessPhone" type="tel" placeholder="02-0000-0000" value="${escapeHtml(ct.businessPhone)}"></div>
        <div class="tn-drawer-field"><label>팩스번호</label><input data-field="fax" type="tel" placeholder="02-0000-0000" value="${escapeHtml(ct.fax)}"></div>
        <div class="tn-drawer-field"><label>회사</label><input data-field="company" placeholder="회사명" value="${escapeHtml(ct.company)}"></div>
        <div class="tn-drawer-field"><label>직책</label><input data-field="jobTitle" placeholder="예: 과장" value="${escapeHtml(ct.jobTitle)}"></div>
        <div class="tn-drawer-field"><label>직무/부서</label><input data-field="department" placeholder="예: 현장지원팀" value="${escapeHtml(ct.department)}"></div>
        <div class="tn-drawer-field"><label>주소</label><input data-field="address" placeholder="회사 주소" value="${escapeHtml(ct.address)}"></div>
        <div class="tn-drawer-field"><label>생일</label><input data-field="birthday" placeholder="YYYY-MM-DD" value="${escapeHtml(ct.birthday)}"></div>
        <div class="tn-drawer-field"><label>웹사이트</label><input data-field="website" placeholder="https://" value="${escapeHtml(ct.website)}"></div>
      </div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">그룹</div>
      <input class="tn-drawer-group-input" data-field="group" placeholder="그룹을 쉼표로 구분해 입력" value="${escapeHtml(ct.group)}">
      <div class="tn-drawer-group-hint">리멤버 CSV의 Categories 항목으로 내보냅니다.</div>
      <div class="tn-drawer-fields" style="margin-top:10px;">
        <div class="tn-drawer-field"><label>태그</label><input data-field="tags" placeholder="VIP, 구매처 등" value="${escapeHtml(ct.tags)}"></div>
      </div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">명함 등록 정보</div>
      <div class="tn-drawer-fields">
        <div class="tn-drawer-field"><label>등록자</label><input data-field="registrar" placeholder="등록자" value="${escapeHtml(ct.registrar)}"></div>
        <div class="tn-drawer-field"><label>등록일</label><input data-field="createdAt" placeholder="YYYY-MM-DD" value="${escapeHtml(ct.createdAt)}"></div>
      </div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">회사 연결 현황</div>
      <div data-company-overview></div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">연결된 영업 항목</div>
      <div class="tn-linked-deals" data-linked-deals></div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">고객 활동 이력</div>
      <div class="tn-activity-list" data-contact-activities></div>
    </section>

    <section class="tn-drawer-section">
      <div class="tn-drawer-section-title">메모</div>
      <div class="tn-drawer-field" style="grid-template-columns:1fr;"><textarea data-field="memo" placeholder="명함과 관련한 메모를 남겨보세요.">${escapeHtml(ct.memo)}</textarea></div>
      <div class="tn-drawer-save" data-save-hint></div>
      <div class="tn-drawer-footer">
        <button class="tn-btn small" data-change-card>${contactHasCardImage(ct) ? "명함 변경" : "명함 추가"}</button>
        <button class="tn-btn small" data-company-search>${ct.company ? "회사명 확인/수정" : "회사명 이미지 검색"}</button>
        <button class="tn-btn small" data-reocr ${contactHasCardImage(ct) ? "" : "disabled"}>텍스트 다시 인식</button>
        <button class="tn-btn small" data-deal>영업 항목 전환</button>
        <button class="tn-btn small" data-fav>${ct.fav ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기"}</button>
        <button class="tn-btn small" data-delete style="color:var(--danger-500);">삭제</button>
      </div>
    </section>`;

  const cardSlot=body.querySelector("[data-card-slot]");
  if(contactHasCardImage(ct)){
    /* 우선 썸네일을 보여주고 원본은 백그라운드에서 불러와 교체 */
    const img=document.createElement("img"); img.className="tn-drawer-cardimage"; img.src=ct.cardImage||ct.cardThumb; img.alt="명함 이미지";
    img.addEventListener("click",async()=>{
      const full=(await loadContactCardImage(ct))||ct.cardThumb;
      if(!full)return;
      document.getElementById("img-viewer").src=full;
      document.getElementById("img-viewer-overlay").hidden=false;
    });
    if(!ct.cardImage) loadContactCardImage(ct).then(full=>{ if(full && img.isConnected) img.src=full; }).catch(()=>{});
    cardSlot.appendChild(img);
  }else{ const empty=document.createElement("div"); empty.className="tn-drawer-cardimage empty"; empty.textContent="명함 이미지 없음"; cardSlot.appendChild(empty); }
  renderDrawerQuick(body.querySelector("[data-quick]"),ct);
  renderContactCompanyOverview(body.querySelector("[data-company-overview]"),ct);
  renderContactLinkedDeals(body.querySelector("[data-linked-deals]"),ct);
  renderContactActivities(body.querySelector("[data-contact-activities]"),ct);

  const hint=body.querySelector("[data-save-hint]");
  const persist=()=>{
    body.querySelectorAll("[data-field]").forEach(el=>{ ct[el.dataset.field]=el.value; });
    syncContactLegacyFields(ct);
    body.querySelector("[data-summary-role]").textContent=[ct.jobTitle,ct.department].filter(Boolean).join(" / ")||"직책·직무 미입력";
    body.querySelector("[data-summary-company]").textContent=ct.company||"회사 미입력";
    renderDrawerQuick(body.querySelector("[data-quick]"),ct);
    renderContactCompanyOverview(body.querySelector("[data-company-overview]"),ct);
    renderContactLinkedDeals(body.querySelector("[data-linked-deals]"),ct);
    renderContactActivities(body.querySelector("[data-contact-activities]"),ct);
    hint.textContent="저장 버튼을 눌러 변경을 반영하세요.";markDraft("contact",draft);
  };
  updateEditStatus("contact",draft);
  body.querySelectorAll("[data-field]").forEach(el=>el.addEventListener("input",persist));
  body.querySelector("[data-change-card]").addEventListener("click",()=>{pendingImageTargetId=ct.id; document.getElementById("contact-file-input").click();});
  body.querySelector("[data-company-search]").addEventListener("click",async()=>{
    const image=await loadContactCardImage(ct);
    withHeavyFeatures(()=>resolveCompanyFromImage(ct,image,ct.ocrRaw||"",{force:true}));
  });
  body.querySelector("[data-reocr]").addEventListener("click",async(e)=>{
    if(!contactHasCardImage(ct))return;
    /* e.currentTarget은 await 이후 null이 되므로 먼저 붙잡아 둠 */
    const button=e.currentTarget;
    button.disabled=true;
    try{
      const image=await loadContactCardImage(ct);
      if(!image){ showToast("명함 원본 이미지를 불러오지 못했습니다. 네트워크 확인 후 다시 시도해 주세요."); return; }
      await withHeavyFeatures(()=>applyOcrToContact(ct,image));
    }finally{button.disabled=false;}
  });
  body.querySelector("[data-deal]").addEventListener("click",()=>{if(draftDirty(draft)){showToast("연락처를 먼저 저장해 주세요.");return;}convertContactToDeal(ct);});
  body.querySelector("[data-fav]").addEventListener("click",()=>{ct.fav=!ct.fav;markDraft("contact",draft);renderContactDrawer(false);});
  body.querySelector("[data-delete]").addEventListener("click",async()=>{if(!confirm("이 연락처를 휴지통으로 이동할까요?"))return;if(draft.isNew){closeContactDetail(true);return;}await moveContactsToTrash([ct.id]);});

  drawer.hidden=false; backdrop.hidden=false;
  if(scrollIntoView) drawer.querySelector(".tn-drawer-scroll").scrollTop=0;
}
function openContactDetail(ct){
  if(selectedContactId&&selectedContactId!==ct.id&&!closeContactDetail())return false;
  contactDraft(ct.id,ct);selectedContactId=ct.id;renderContacts();renderContactDrawer(true);return true;
}
function closeContactDetail(force=false){
  const draft=contactDrafts.get(selectedContactId);
  if(force!==true){
    if(draft?.saving){showToast("저장 중입니다. 완료 후 닫아 주세요.");return false;}
    if(draftDirty(draft)&&!confirm("저장하지 않은 변경을 버리고 닫을까요?"))return false;
  }
  contactDrafts.delete(selectedContactId);selectedContactId=null;
  document.getElementById("contact-drawer").hidden=true;document.getElementById("contact-drawer-backdrop").hidden=true;
  document.getElementById("contact-drawer-body").innerHTML="";renderContacts();return true;
}

/* ---------- 연락처 목록 페이지 이동 ---------- */
const CONTACT_PAGE_SIZES = [20, 30, 40, 50];
let contactPage = 1;
function contactPageSize(){
  const saved = Number(appSettings.contactPageSize);
  return CONTACT_PAGE_SIZES.includes(saved) ? saved : CONTACT_PAGE_SIZES[0];
}
function contactPageCount(total){ return Math.max(1, Math.ceil(total / contactPageSize())); }
/* 현재 페이지에 보일 항목만 잘라 낸다. 검색·삭제로 목록이 줄면 마지막 페이지로 당겨 빈 화면을 막는다. */
function contactPageItems(list){
  const size = contactPageSize();
  contactPage = Math.max(1, Math.min(contactPage, contactPageCount(list.length)));
  const start = (contactPage - 1) * size;
  return list.slice(start, start + size);
}
/* 첫·마지막 페이지는 항상 보여 주고 현재 페이지 주변을 최대 10개까지 나열, 끊긴 구간은 … 로 표시 */
function contactPagerNumbers(current, pages){
  const maxButtons = 10;
  if(pages <= maxButtons) return Array.from({length: pages}, (_, index)=>index + 1);
  const start = Math.max(1, Math.min(current - 4, pages - maxButtons + 1));
  const end = Math.min(pages, start + maxButtons - 1);
  const shown = new Set([1, pages]);
  for(let page = start; page <= end; page++) shown.add(page);
  const sorted = [...shown].sort((a, b)=>a - b);
  const items = [];
  sorted.forEach((page, index)=>{
    if(index && page - sorted[index - 1] > 1) items.push("gap");
    items.push(page);
  });
  return items;
}
function goToContactPage(page){
  const next = Math.max(1, Math.min(contactPageCount(filteredContacts().length), Number(page) || 1));
  if(next === contactPage) return;
  contactPage = next;
  renderContacts();
  document.getElementById("contact-table-wrap")?.scrollIntoView({block:"start", behavior:"smooth"});
}
async function setContactPageSize(value){
  const size = CONTACT_PAGE_SIZES.includes(Number(value)) ? Number(value) : CONTACT_PAGE_SIZES[0];
  if(size === contactPageSize()) return;
  const previous = appSettings.contactPageSize;
  /* 저장 실패와 무관하게 화면을 먼저 반영하고, 실패하면 되돌린다 */
  appSettings.contactPageSize = size;
  contactPage = 1;
  renderContacts();
  try{
    await saveAppSettings();
  }catch(error){
    appSettings.contactPageSize = previous;
    renderContacts();
    console.error("contact page size save failed", error);
    showToast(error?.message || "표시 줄 수 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
}
function renderContactPager(total){
  const pager = document.getElementById("contact-pager");
  if(!pager) return;
  const size = contactPageSize();
  const pages = contactPageCount(total);
  const numbers = document.getElementById("contact-page-numbers");
  numbers.innerHTML = "";
  contactPagerNumbers(contactPage, pages).forEach(entry=>{
    if(entry === "gap"){
      const gap = document.createElement("span");
      gap.className = "tn-pager-gap";
      gap.textContent = "…";
      gap.setAttribute("aria-hidden", "true");
      numbers.appendChild(gap);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tn-pager-btn" + (entry === contactPage ? " active" : "");
    button.dataset.page = String(entry);
    button.textContent = String(entry);
    if(entry === contactPage) button.setAttribute("aria-current", "page");
    button.addEventListener("click", ()=>goToContactPage(entry));
    numbers.appendChild(button);
  });
  document.getElementById("contact-page-first").disabled = contactPage <= 1;
  document.getElementById("contact-page-prev").disabled = contactPage <= 1;
  document.getElementById("contact-page-next").disabled = contactPage >= pages;
  document.getElementById("contact-page-last").disabled = contactPage >= pages;
  const sizeSelect = document.getElementById("contact-page-size");
  if(sizeSelect && Number(sizeSelect.value) !== size) sizeSelect.value = String(size);
  const range = document.getElementById("contact-page-range");
  if(range){
    const from = total ? (contactPage - 1) * size + 1 : 0;
    const to = Math.min(total, contactPage * size);
    range.textContent = total ? `${from}–${to} / 전체 ${total}명` : "표시할 연락처가 없습니다.";
  }
}
/* 검색어·정렬을 바꾸면 결과가 완전히 달라지므로 첫 페이지부터 다시 본다 */
function resetContactPage(){ contactPage = 1; renderContacts(); }
function filteredContacts(){
  const q=(document.getElementById("contact-search").value||"").trim().toLowerCase();
  const sort=document.getElementById("contact-sort").value;
  let list=contactsData.filter(c=>!q||[c.name,c.company,c.department,c.jobTitle,c.mobilePhone,c.businessPhone,c.fax,c.email,c.address,c.group,c.tags,c.memo].join(" ").toLowerCase().includes(q));
  list=list.slice().sort((a,b)=>{
    if(sort==="name")return(a.name||"").localeCompare(b.name||"","ko");
    if(sort==="company")return(a.company||"").localeCompare(b.company||"","ko");
    return(b.createdAt||"").localeCompare(a.createdAt||"");
  });
  return list;
}
function renderContactStats(){
  const el=document.getElementById("tn-contacts-stats");
  const withCard=contactsData.filter(contactHasCardImage).length;
  const favs=contactsData.filter(c=>c.fav).length;
  const companies=new Set(contactsData.map(c=>(c.company||"").trim()).filter(Boolean)).size;
  const selected=selectedContactIds.size;
  el.innerHTML=`<span>전체 <b>${contactsData.length}</b>명</span><span>즐겨찾기 <b>${favs}</b></span><span>명함 보유 <b>${withCard}</b></span><span>회사 <b>${companies}</b>곳</span>${selected?`<span>선택 <b>${selected}</b>명</span>`:""}`;
  updateContactBulkDeleteButton();
}
/* 표 전체를 다시 그리지 않고 "모두 선택" 상태만 갱신 */
function updateContactSelectAll(list){
  const selectAll=document.getElementById("contact-select-all"); if(!selectAll) return;
  const selectedVisible=list.filter(c=>selectedContactIds.has(c.id)).length;
  selectAll.checked=list.length>0&&selectedVisible===list.length;
  selectAll.indeterminate=selectedVisible>0&&selectedVisible<list.length;
}
function renderContactTable(list){
  const tbody=document.getElementById("contact-tbody"); tbody.innerHTML="";
  updateContactSelectAll(list);
  if(!list.length){ const tr=document.createElement("tr"); tr.innerHTML=`<td colspan="7" style="text-align:center;color:var(--ink-300);padding:30px 10px;">연락처가 없습니다. 명함을 스캔하거나 CSV를 업로드해 보세요.</td>`; tbody.appendChild(tr); return; }
  const recent=document.getElementById("contact-sort").value==="recent";
  let lastDate=null;
  list.forEach(ct=>{
    if(recent&&ct.createdAt!==lastDate){ lastDate=ct.createdAt; const d=document.createElement("tr"); d.className="tn-contact-date-row"; d.innerHTML=`<td colspan="7">${escapeHtml(formatRememberDate(ct.createdAt))}</td>`; tbody.appendChild(d); }
    const tr=document.createElement("tr"); tr.className="tn-contact-row"+(ct.id===selectedContactId?" selected":"");
    const miniSrc=ct.cardThumb||ct.cardImage;
    const mini=miniSrc?`<img class="tn-card-mini" src="${escapeHtml(miniSrc)}" alt="명함" loading="lazy" decoding="async">`:`<div class="tn-card-mini empty">이미지 없음</div>`;
    tr.innerHTML=`
      <td><input type="checkbox" class="tn-contact-check" data-check ${selectedContactIds.has(ct.id)?"checked":""}></td>
      <td>${mini}</td>
      <td><div class="tn-remember-name">${escapeHtml(ct.name)||"(이름 없음)"}</div><span class="tn-remember-company">${escapeHtml(ct.company)||"회사 미입력"}</span></td>
      <td><div class="tn-remember-main">${escapeHtml(ct.jobTitle)||"-"}</div><span class="tn-remember-sub">${escapeHtml(ct.department)||"-"}</span></td>
      <td><div class="tn-remember-main">${escapeHtml(ct.mobilePhone)||"-"}</div><span class="tn-remember-sub">${escapeHtml(ct.businessPhone)||"-"}</span></td>
      <td><div class="tn-remember-main">${escapeHtml(ct.email)||"-"}</div></td>
      <td><div class="tn-row-actions"><button class="tn-fav-btn ${ct.fav?"on":""}" data-fav>★</button><button class="tn-row-del" data-del>×</button></div></td>`;
    tr.addEventListener("click",e=>{if(e.target.closest("[data-check],[data-fav],[data-del]"))return; openContactDetail(ct);});
    /* 체크 하나 때문에 목록 전체를 다시 만들지 않고 요약과 "모두 선택"만 갱신 */
    tr.querySelector("[data-check]").addEventListener("change",e=>{e.stopPropagation(); if(e.target.checked)selectedContactIds.add(ct.id);else selectedContactIds.delete(ct.id); renderContactStats(); updateContactSelectAll(list);});
    tr.querySelector("[data-fav]").addEventListener("click",async e=>{e.stopPropagation();if(!openContactDetail(ct))return;const draft=contactDrafts.get(ct.id);draft.value.fav=!draft.value.fav;markDraft("contact",draft);renderContactDrawer(false);});
    tr.querySelector("[data-del]").addEventListener("click",async e=>{e.stopPropagation();if(!confirm("이 연락처를 휴지통으로 이동할까요?"))return;await moveContactsToTrash([ct.id]);});
    tbody.appendChild(tr);
  });
}
function renderContacts(){
  const list = filteredContacts();
  renderContactStats();
  renderContactTable(contactPageItems(list));
  renderContactPager(list.length);
  if(selectedContactId) renderContactDrawer(false);
}

function csvEscape(value){
  let v=String(value??"");
  /* Excel에서 =·+·-·@로 시작하는 셀이 수식으로 실행되는 것(CSV 수식 주입)을 차단 */
  if(/^[=+\-@]/.test(v)) v="'"+v;
  return /[",\r\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
}
function contactToOutlookRow(c){
  const row=Object.fromEntries(OUTLOOK_CSV_HEADERS.map(h=>[h,""]));
  row["First Name"]=c.name||""; row["Company"]=c.company||""; row["Department"]=c.department||""; row["Job Title"]=c.jobTitle||"";
  row["Business Street"]=c.address||""; row["Business Fax"]=c.fax||""; row["Business Phone"]=c.businessPhone||""; row["Company Main Phone"]=c.businessPhone||"";
  row["Mobile Phone"]=c.mobilePhone||""; row["Primary Phone"]=contactPrimaryPhone(c); row["Categories"]=c.group||"";
  row["E-mail Address"]=c.email||""; row["E-mail Type"]=c.email?"SMTP":""; row["E-mail Display Name"]=c.name||c.email||"";
  row["Birthday"]=c.birthday||""; row["Notes"]=c.memo||""; row["Keywords"]=c.tags||""; row["User 1"]=c.registrar||""; row["User 2"]=c.createdAt||"";
  row["User 3"]=c.fav?"Y":""; row["User 4"]="HLB-BUSISUP CRM"; row["Web Page"]=c.website||"";
  return OUTLOOK_CSV_HEADERS.map(h=>row[h]);
}
function exportContactsCsv(){
  const targets=selectedContactIds.size?contactsData.filter(c=>selectedContactIds.has(c.id)):contactsData;
  if(!targets.length){showToast("내보낼 연락처가 없습니다.");return;}
  const lines=[OUTLOOK_CSV_HEADERS.map(csvEscape).join(","),...targets.map(c=>contactToOutlookRow(c).map(csvEscape).join(","))];
  const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=`remember_outlook_contacts_${todayStr()}.csv`; document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
  setOcrStatus(`${targets.length}명의 연락처를 리멤버의 Outlook CSV 구성으로 내보냈습니다.`); setTimeout(()=>setOcrStatus(""),4500);
}
function parseCsvRows(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"')quoted=true; else if(ch===','){row.push(cell);cell="";} else if(ch==='\n'){row.push(cell.replace(/\r$/, ""));rows.push(row);row=[];cell="";} else cell+=ch;
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/, ""));rows.push(row);} return rows.filter(r=>r.some(v=>String(v).trim()));
}
function decodeCsvBuffer(buffer){
  const bytes = new Uint8Array(buffer);
  /* 1) BOM(\uBC14\uC774\uD2B8 \uC21C\uC11C \uD45C\uC2DD)\uC774 \uC788\uC73C\uBA74 \uADF8 \uC778\uCF54\uB529\uC744 \uADF8\uB300\uB85C \uC2E0\uB8B0 */
  if(bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder("utf-16le").decode(buffer).replace(/^\uFEFF/,"");
  if(bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder("utf-16be").decode(buffer).replace(/^\uFEFF/,"");
  if(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/,"");
  /* 2) BOM \uC5C6\uB294 UTF-16LE(\uC5D1\uC140 '\uC720\uB2C8\uCF54\uB4DC \uD14D\uC2A4\uD2B8' \uC800\uC7A5): NUL \uBC14\uC774\uD2B8 \uBE44\uC728\uB85C \uAC10\uC9C0 */
  const sample = Math.min(bytes.length, 4096);
  let zeros = 0;
  for(let i = 0; i < sample; i++) if(bytes[i] === 0) zeros++;
  if(sample && zeros / sample > 0.2) return new TextDecoder("utf-16le").decode(buffer).replace(/^\uFEFF/,"");
  /* 3) \uBC14\uC774\uD2B8\uAC00 \uC720\uD6A8\uD55C UTF-8\uC774\uBA74 UTF-8\uB85C \uD655\uC815 (fatal \uBAA8\uB4DC\uB85C \uC5C4\uACA9 \uAC80\uC99D) */
  try{ return new TextDecoder("utf-8", {fatal:true}).decode(buffer); }catch(e){}
  /* 4) \uADF8 \uC678\uC5D0\uB294 \uD55C\uAD6D\uC5B4 Windows \uAE30\uBCF8 \uC778\uCF54\uB529(CP949/EUC-KR) */
  try{ return new TextDecoder("euc-kr").decode(buffer).replace(/^\uFEFF/,""); }catch(e){}
  return new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/,"");
}
function valueByAliases(obj,aliases){for(const a of aliases){const key=Object.keys(obj).find(k=>k.trim().toLowerCase()===a.toLowerCase());if(key&&String(obj[key]??"").trim())return String(obj[key]).trim();}return "";}
/* "2026년 07월 16일", "2026.7.16", "2026/07/16" 등을 YYYY-MM-DD로 통일 */
function normalizeDateString(value){
  const s = String(value || "").trim();
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  return s;
}
function contactFromCsvObject(obj){
  const first=valueByAliases(obj,["First Name","이름","성명","Name"]), middle=valueByAliases(obj,["Middle Name","중간 이름"]), last=valueByAliases(obj,["Last Name","성"]);
  let name=[first,middle,last].filter(Boolean).join(" ").trim(); if(!name)name=valueByAliases(obj,["E-mail Display Name","표시 이름"]);
  const legacyPhone=valueByAliases(obj,["연락처","전화번호"]); let mobile=valueByAliases(obj,["Mobile Phone","휴대전화","휴대폰"]), business=valueByAliases(obj,["Business Phone","유선전화","전화","회사 전화"]);
  if(legacyPhone&&!mobile&&!business){const n=normalizePhoneNumber(legacyPhone);if(/^01[016789]-/.test(n))mobile=n;else business=n;}
  const categories=valueByAliases(obj,["Categories","그룹","카테고리"]), keywords=valueByAliases(obj,["Keywords","태그"]);
  const contact=normalizeContact({id:uid(),name,company:valueByAliases(obj,["Company","회사","회사명"]),department:valueByAliases(obj,["Department","부서","직무"]),jobTitle:valueByAliases(obj,["Job Title","직책","직급"]),mobilePhone:normalizePhoneNumber(mobile),businessPhone:normalizePhoneNumber(business),fax:normalizePhoneNumber(valueByAliases(obj,["Business Fax","팩스","팩스번호"])),email:valueByAliases(obj,["E-mail Address","Email Address","이메일","전자 메일 주소"]),address:[valueByAliases(obj,["Business Street","주소"]),valueByAliases(obj,["Business Street 2"]),valueByAliases(obj,["Business Street 3"]),valueByAliases(obj,["Business City"]),valueByAliases(obj,["Business State"]),valueByAliases(obj,["Business Postal Code"]),valueByAliases(obj,["Business Country/Region"])].filter(Boolean).join(" "),birthday:normalizeDateString(valueByAliases(obj,["Birthday","생일"])),website:valueByAliases(obj,["Web Page","웹사이트","홈페이지"]),group:categories,tags:keywords||valueByAliases(obj,["태그"]),memo:valueByAliases(obj,["Notes","메모"]),registrar:valueByAliases(obj,["User 1","명함 등록자","등록자"]),createdAt:normalizeDateString(valueByAliases(obj,["User 2","명함 등록일","등록일"]))||todayStr(),fav:/^(y|yes|true|1|즐겨찾기)$/i.test(valueByAliases(obj,["User 3","즐겨찾기"]))});
  return contact;
}
function normalizedIdentity(value){return String(value||"").toLowerCase().replace(/[^0-9a-z가-힣@]/g,"");}
/* 인코딩 오판으로 깨진 텍스트 감지: U+FFFD 또는 한자·한글이 뒤섞인 전형적 모지바케 패턴.
   외부 편집기 재저장 시 리터럴이 다시 깨지지 않도록 문자 코드 숫자로만 판정한다. */
function looksBroken(value){
  const s = String(value || "");
  if(!s) return false;
  let cjk = 0, hangul = 0;
  for(const ch of s){
    const cp = ch.codePointAt(0);
    if(cp === 0xFFFD) return true;                 /* 대체 문자(깨진 글자) */
    if(cp >= 0x3400 && cp <= 0x9FFF) cjk++;        /* 한자 블록 */
    if(cp >= 0xAC00 && cp <= 0xD7A3) hangul++;     /* 한글 음절 */
  }
  return cjk > 0 && hangul > 0;
}
function mergeImportedContact(target,incoming){
  let changed=false;
  for(const key of ["name","company","department","jobTitle","mobilePhone","businessPhone","fax","email","address","birthday","website","group","tags","memo","registrar","createdAt"]){
    if(!incoming[key]) continue;
    /* 비어 있거나, 기존 값이 깨져 있고 새 값은 정상일 때 덮어쓰기 (깨진 데이터 자동 복구) */
    if(!target[key] || (looksBroken(target[key]) && !looksBroken(incoming[key]))){
      if(target[key] !== incoming[key]){ target[key]=incoming[key]; changed=true; }
    }
  }
  if(incoming.fav&&!target.fav){target.fav=true;changed=true;}
  syncContactLegacyFields(target);
  return changed;
}
async function importContactsCsv(file){
  try{
    const text=decodeCsvBuffer(await file.arrayBuffer()); const rows=parseCsvRows(text); if(rows.length<2)throw new Error("데이터 행이 없습니다.");
    const headers=rows[0].map(h=>String(h).trim()); let added=0,updated=0,skipped=0;
    for(const values of rows.slice(1)){
      const obj={};headers.forEach((h,i)=>obj[h]=values[i]??""); const incoming=contactFromCsvObject(obj);
      if(!incoming.name&&!incoming.company&&!incoming.email&&!contactPrimaryPhone(incoming)){skipped++;continue;}
      const emailKey=normalizedIdentity(incoming.email), phoneKey=normalizedIdentity(contactPrimaryPhone(incoming));
      /* 메일·전화가 모두 없는 행(이름과 회사만 있는 명함)도 같은 파일을 다시 올렸을 때 중복되지 않게 이름+회사로 대조 */
      const nameKey=!emailKey&&!phoneKey?normalizedIdentity(incoming.name)+"|"+normalizedIdentity(incoming.company):"";
      const duplicate=contactsData.find(c=>(emailKey&&normalizedIdentity(c.email)===emailKey)
        ||(phoneKey&&normalizedIdentity(contactPrimaryPhone(c))===phoneKey)
        ||(nameKey&&nameKey!=="|"&&!normalizedIdentity(c.email)&&!normalizedIdentity(contactPrimaryPhone(c))&&normalizedIdentity(c.name)+"|"+normalizedIdentity(c.company)===nameKey));
      if(duplicate){if(mergeImportedContact(duplicate,incoming))updated++;else skipped++;}else{contactsData.push(incoming);added++;}
    }
    await saveContacts();renderContacts();renderHome();setOcrStatus(`CSV 업로드 완료: 신규 ${added}명, 기존 보완 ${updated}명, 건너뜀 ${skipped}명.`);setTimeout(()=>setOcrStatus(""),7000);
  }catch(e){console.error(e);showToast("CSV 파일을 읽지 못했습니다. 리멤버/Outlook CSV 형식인지 확인해 주세요.\n"+(e.message||e));}
}

/* ================= 영업 AI ================= */
const IMPORTANCE_LABEL = {high:"높음", mid:"중간", low:"낮음"};
const AI_SEV_LABEL = {urgent:"긴급", warn:"주의", info:"제안"};
const DEFAULT_PERSONAS = [
  {id:"sales_focus", name:"매출전환 코치", desc:"기존 거래처와 진행 건의 다음 액션을 우선 정리", focus:"coaching", builtin:true},
  {id:"risk_check",  name:"재무·과제 체크", desc:"자본잠식, 국책과제, 비용 부담 이슈를 보수적으로 점검", focus:"analysis", builtin:true},
  {id:"followup",    name:"후속조치 비서", desc:"자료 요청과 회신 일정을 꼼꼼히 관리", focus:"schedule", builtin:true},
];
let aiPersonas = [];
let currentPersonaId = "sales_focus";
let aiChatHistories = {}; /* personaId -> [{role, text, name, actions}] */
let aiContextRef = null;  /* {kind:"deal"|"task", areaKey?, itemId, title} */

/* 매출(예상 금액)과 성사 확률, 단계·그룹 분류 가중치로 중요도를 판단 */
function dealImportance(item, areaKey){
  const amt = parseFloat(item.amount) || 0;                 /* 백만원 */
  const rawProb = String(item.prob ?? "").trim();
  const prob = rawProb === "" ? 0 : Math.min(100, Math.max(0, parseFloat(rawProb) || 0));
  const probFactor = rawProb === "" ? 0.3 : prob / 100;
  const stage = normalizeStage(item.stage);
  const area = findAreaByKey(areaKey);
  const bucket = itemBucketKey(item, area);
  const cfg = effectiveImportanceConfig();
  const stageW = cfg.stageWeights[stage] || 1;
  const bucketW = cfg.bucketWeights[bucket] ?? 1;
  const score = amt * probFactor * stageW * bucketW;
  let level = "low";
  if(score >= cfg.highScore || (bucket === "direct" && amt >= cfg.highAmount) || (bucket === "direct" && prob >= cfg.highProb)) level = "high";
  else if(score >= cfg.midScore || (bucket !== "support" && prob >= cfg.midProb)) level = "mid";
  const manual = ["high","mid","low"].includes(item.importanceOverride);
  return {
    score, autoLevel:level, level: manual ? item.importanceOverride : level, manual,
    amt, prob, probMissing:rawProb === "", stage, stageW, bucket, bucketW,
  };
}
function compareImportanceDeals(a,b){
  const rank = {high:3, mid:2, low:1};
  return (rank[b.imp.level]-rank[a.imp.level]) || (b.imp.score - a.imp.score);
}


/* ---------- 초보 안내 / 오늘 할 일 / 활동 기록 ---------- */
function openOnboarding(){ document.getElementById("onboarding-overlay").hidden=false; }
async function closeOnboarding(){
  document.getElementById("onboarding-overlay").hidden=true;
  const previous=appSettings.onboardingSeen;appSettings.onboardingSeen=true;
  await saveOrRollback(saveAppSettings,()=>{appSettings.onboardingSeen=previous;},"사용 안내 설정 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
}
function handleStartAction(action){
  if(action==="contact"){showView("contacts");document.getElementById("contact-manual-btn").click();}
  else if(action==="deal"){showView("pipeline");pipeCreateDeal(STAGE_OPTIONS[0]||"리드");}
  else if(action==="pipeline")showView("pipeline");
  else if(action==="activity"){
    const d=allDeals().find(x=>!isClosedStage(x.stage));if(d)openDealDrawer(d.area.key,d.item.id);else showView("pipeline");
  }
}
async function clearSeedDeals(){
  const seedIds=new Set(LEGACY_DEFAULT_AREAS.flatMap(a=>a.seed.map(x=>x.id)));const targets=allDeals().filter(d=>seedIds.has(d.item.id));
  if(!targets.length){showToast("정리할 기본 예시 항목이 없습니다.");return;}
  if(!confirm(`기본 예시 영업 항목 ${targets.length}건을 휴지통으로 이동할까요? 직접 추가한 항목은 유지됩니다.`))return;
  const previousStage=deepCopy(stageData);
  try{
    for(const d of targets){await addTrash("deal",d.item.title,d.item,{areaKey:d.area.key});stageData[d.area.key]=stageData[d.area.key].filter(x=>x.id!==d.item.id);}
    await saveAllStageData();
  }catch(error){
    Object.keys(stageData).forEach(key=>{if(!Object.hasOwn(previousStage,key))delete stageData[key];});
    Object.entries(previousStage).forEach(([key,value])=>{stageData[key]=value;});
    console.error("clear seed deals failed",error);
    showToast(error?.message||"기본 예시 항목 정리에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
  }
  AREAS.forEach(renderStageBody);renderPipeline(true);renderHome();renderSettings();
}
function collectTodayTasks(){
  const rows=[];
  allDeals().forEach(({area,item,stage})=>{
    if(isClosedStage(stage))return;
    const reasons=[];let sev="info",score=3;const dd=daysUntil(item.nextAction);const imp=dealImportance(item,area.key);
    if(dd!==null&&dd<0){reasons.push(`다음 액션 ${Math.abs(dd)}일 지연`);sev="urgent";score=0;}
    else if(dd===0){reasons.push("오늘이 다음 액션일");sev="urgent";score=0;}
    else if(dd!==null&&dd<=7){reasons.push(`다음 액션 D-${dd}`);sev="warn";score=Math.min(score,1);}
    else if(!item.nextAction&&imp.level!=="low"){reasons.push("다음 액션일 미입력");sev="warn";score=Math.min(score,1);}
    if(item.lastContact){const since=-daysUntil(item.lastContact);const limit=imp.level==="high"?14:imp.level==="mid"?30:60;if(since>=limit){reasons.push(`최근 컨택 후 ${since}일 경과`);if(sev!=="urgent")sev="warn";score=Math.min(score,1);}}
    if(!item.internalOwner){reasons.push("내부 담당자 미지정");score=Math.min(score,2);}
    if(reasons.length)rows.push({kind:"deal",area,item,stage,sev,score,reasons,dd:dd??9999,rank:{high:0,mid:1,low:2}[imp.level]??2});
  });
  roadmapData.forEach(task=>{
    if(["완료","보류"].includes(task.status))return;
    const reasons=[];let sev="info",score=3;const dd=supportTaskDueDays(task);
    if(dd!==null&&dd<0){reasons.push(`마감 ${Math.abs(dd)}일 초과`);sev="urgent";score=0;}
    else if(dd===0){reasons.push("오늘 마감");sev="urgent";score=0;}
    else if(dd!==null&&dd<=7){reasons.push(`마감 D-${dd}`);sev="warn";score=1;}
    else if(!task.dueDate&&task.priority==="높음"){reasons.push("마감일 미지정");sev="warn";score=1;}
    if(!task.owner){reasons.push("내부 담당자 미지정");score=Math.min(score,2);}
    if(!task.nextAction&&task.priority==="높음"){reasons.push("다음 실행 미입력");score=Math.min(score,2);}
    if(reasons.length)rows.push({kind:"support",task,sev,score,reasons,dd:dd??9999,rank:supportTaskPriorityRank(task.priority)});
  });
  return rows.sort((a,b)=>a.score-b.score||a.dd-b.dd||a.rank-b.rank).slice(0,12);
}
function renderTodayTasks(){
  const wrap=document.getElementById("tn-today-list");if(!wrap)return;const tasks=collectTodayTasks();
  document.getElementById("tn-today-summary").textContent=tasks.length?`확인이 필요한 업무 ${tasks.length}건입니다.`:"오늘 기준으로 지연되거나 누락된 업무가 없습니다.";wrap.innerHTML="";
  if(!tasks.length){wrap.innerHTML='<div class="tn-empty-compact">모든 일정이 정상입니다. 새로운 연락 결과가 생기면 활동을 기록해 주세요.</div>';return;}
  tasks.forEach(t=>{
    const row=document.createElement("div");row.className=`tn-task-row ${t.sev}`;
    const title=t.kind==="support"?t.task.title:t.item.title;
    const owner=t.kind==="support"?effectiveSupportTaskOwner(t.task):t.item.internalOwner;
    row.innerHTML=`<span class="tn-task-badge ${t.sev}">${t.sev==="urgent"?"긴급":t.sev==="warn"?"확인":"정보"}</span><div class="tn-task-main"><div class="tn-task-title">${escapeHtml(title)}</div><div class="tn-task-desc">${escapeHtml(t.reasons.join(" · "))}${owner?" · 담당 "+escapeHtml(owner):""}${t.kind==="support"?' · 영업지원 실행과제':''}</div></div><div class="tn-task-actions"></div>`;
    const actions=row.querySelector(".tn-task-actions");
    const open=document.createElement("button");open.className="tn-btn small";open.textContent="열기";open.addEventListener("click",()=>t.kind==="support"?openRoadmapModal(t.task.id):openDealDrawer(t.area.key,t.item.id));actions.appendChild(open);
    if(t.kind==="support"){
      const done=document.createElement("button");done.className="tn-btn small";done.textContent="완료 처리";done.addEventListener("click",()=>quickChangeRoadmapStatus(t.task.id,"완료"));actions.appendChild(done);
      const date=document.createElement("button");date.className="tn-btn small";date.textContent="일정 변경";date.addEventListener("click",async()=>{const v=prompt("변경할 마감일을 YYYY-MM-DD 형식으로 입력하세요.",t.task.dueDate||todayStr());if(v===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){showToast("YYYY-MM-DD 형식으로 입력하세요.");return;}const previous=deepCopy(roadmapData);t.task.dueDate=v;t.task.updatedAt=nowIso();await saveOrRollback(saveRoadmapData,()=>roadmapData.splice(0,roadmapData.length,...previous),"마감일 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");renderRoadmap();renderHome();});actions.appendChild(date);
    }else{
      const contact=document.createElement("button");contact.className="tn-btn small";contact.textContent="연락 완료";contact.addEventListener("click",()=>openActivityModal(t.area.key,t.item.id,{type:"전화",content:"고객 연락 완료"}));actions.appendChild(contact);
      const date=document.createElement("button");date.className="tn-btn small";date.textContent="일정 변경";date.addEventListener("click",async()=>{const v=prompt("변경할 다음 액션일을 YYYY-MM-DD 형식으로 입력하세요.",t.item.nextAction||todayStr());if(v===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){showToast("YYYY-MM-DD 형식으로 입력하세요.");return;}const previousDate=t.item.nextAction;t.item.nextAction=v;await saveOrRollback(()=>saveArea(t.area.key),()=>{t.item.nextAction=previousDate;},"다음 연락일 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");renderStageBody(t.area);renderPipeline(true);renderHome();});actions.appendChild(date);
    }
    wrap.appendChild(row);
  });
}
let activityDealRef=null;
function openActivityModal(areaKey,id,preset={}){
  const found=findDeal(areaKey,id);if(!found)return;
  const drawer=document.getElementById("deal-drawer"),backdrop=document.getElementById("deal-drawer-backdrop");
  const keepDrawerOpen=!!(selectedDealRef&&selectedDealRef.areaKey===areaKey&&selectedDealRef.id===id&&!drawer.hidden);
  activityDealRef={areaKey,id,keepDrawerOpen,activityId:uid(),createdAt:nowIso()};
  document.getElementById("activity-deal-label").textContent=`${found.item.title} · 활동과 후속 업무를 기록합니다.`;
  document.getElementById("activity-type").value=preset.type||"전화";
  document.getElementById("activity-date").value=preset.date||todayStr();
  document.getElementById("activity-content").value=preset.content||"";
  document.getElementById("activity-result").value=preset.result||"";
  document.getElementById("activity-next-action").value=found.item.action||"";
  document.getElementById("activity-next-date").value=found.item.nextAction||"";
  if(keepDrawerOpen){drawer.hidden=false;backdrop.hidden=false;}
  const overlay=document.getElementById("activity-overlay");overlay.hidden=false;overlay.dataset.keepDrawerOpen=String(keepDrawerOpen);
  requestAnimationFrame(()=>document.getElementById("activity-content").focus());
}
function closeActivityModal(){
  if(activityDealRef?.saving)return;
  const ref=activityDealRef,overlay=document.getElementById("activity-overlay");overlay.hidden=true;delete overlay.dataset.keepDrawerOpen;
  if(ref&&ref.keepDrawerOpen&&selectedDealRef&&selectedDealRef.areaKey===ref.areaKey&&selectedDealRef.id===ref.id){document.getElementById("deal-drawer").hidden=false;document.getElementById("deal-drawer-backdrop").hidden=false;}
  activityDealRef=null;
}
async function saveActivityModal(){
  if(!activityDealRef||activityDealRef.saving)return;
  const found=findDeal(activityDealRef.areaKey,activityDealRef.id);
  if(!found){closeActivityModal();return;}
  const content=document.getElementById("activity-content").value.trim();
  if(!content){showToast("활동 내용을 입력하세요.");return;}
  const a=normalizeActivity({id:activityDealRef.activityId,createdAt:activityDealRef.createdAt,type:document.getElementById("activity-type").value,date:document.getElementById("activity-date").value||todayStr(),content,result:document.getElementById("activity-result").value.trim(),nextAction:document.getElementById("activity-next-action").value.trim(),nextDate:document.getElementById("activity-next-date").value});
  const previous={lastContact:found.item.lastContact,action:found.item.action,nextAction:found.item.nextAction};
  found.item.activities.unshift(a);
  found.item.lastContact=a.date;
  if(a.nextAction)found.item.action=a.nextAction;
  if(a.nextDate)found.item.nextAction=a.nextDate;
  activityDealRef.saving=true;document.getElementById("activity-save").disabled=true;
  try{
    await saveArea(found.area.key);
  }catch(error){
    /* 저장 실패 시 방금 추가한 활동을 되돌려, 재시도 때 같은 활동이 중복 저장되지 않게 함 */
    found.item.activities=found.item.activities.filter(x=>x.id!==a.id);
    found.item.lastContact=previous.lastContact;
    found.item.action=previous.action;
    found.item.nextAction=previous.nextAction;
    console.error("activity save failed", error);
    showToast(error?.message||"활동 기록 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
    return;
  }finally{if(activityDealRef)activityDealRef.saving=false;document.getElementById("activity-save").disabled=false;}
  closeActivityModal();
  renderStageBody(found.area);
  renderPipeline(true);
  renderHome();
  if(selectedDealRef&&selectedDealRef.id===found.item.id)renderDealDrawer(false);
}

/* 중요도에 따라 컨택일·액션 예정일을 점검해 단계별 알림 생성 */
function collectAiAlerts(){
  const alerts = [];
  AREAS.forEach(area=>{
    (stageData[area.key] || []).forEach(item=>{
      const stage = normalizeStage(item.stage);
      if(isClosedStage(stage)) return;
      const imp = dealImportance(item, area.key);
      const title = item.title || "(제목 없음)";
      const impTxt = IMPORTANCE_LABEL[imp.level];
      const base={kind:"deal",title,imp:imp.level,areaKey:area.key,itemId:item.id};

      const dd = daysUntil(item.nextAction);
      const leadDays = imp.level === "high" ? 7 : imp.level === "mid" ? 3 : 1;
      if(dd !== null && dd < 0){
        alerts.push({...base,sev:"urgent",reasonCode:"overdue",
          msg:`${title} (${stage} · 중요도 ${impTxt}) — 액션 예정일이 ${Math.abs(dd)}일 지났습니다. 우선 대응하세요.`});
      }else if(dd !== null && dd <= leadDays){
        alerts.push({...base,sev:"warn",reasonCode:"dueSoon",
          msg:`${title} (${stage} · 중요도 ${impTxt}) — 다음 액션 ${dd === 0 ? "오늘" : "D-" + dd}. 준비가 필요합니다.`});
      }else if(!item.nextAction && imp.level !== "low"){
        alerts.push({...base,sev:"info",reasonCode:"noNextDate",
          msg:`${title} (${stage} · 중요도 ${impTxt}) — 다음 액션 일정이 비어 있습니다. 일정을 등록하세요.`});
      }

      if(item.lastContact){
        const since = -daysUntil(item.lastContact);
        const staleDays = imp.level === "high" ? 14 : imp.level === "mid" ? 30 : 60;
        if(since >= staleDays){
          alerts.push({...base,sev:imp.level === "high" ? "urgent" : "warn",reasonCode:"stale",
            msg:`${title} (${stage}) — 마지막 컨택 후 ${since}일 경과. 접촉을 재개하세요.`});
        }
      }

      if(stage === "협상" && (parseFloat(item.prob)||0) >= 70){
        alerts.push({...base,sev:"info",reasonCode:"closeReady",
          msg:`${title} — 협상 단계, 성사 확률 ${item.prob}%. 계약 조건 확정과 수주 전환을 검토하세요.`});
      }
      if(stage === "리드" && imp.level === "high"){
        alerts.push({...base,sev:"info",reasonCode:"highLead",
          msg:`${title} — 중요도 높은 리드입니다. 상담 단계로 진전시킬 첫 미팅을 잡으세요.`});
      }
    });
  });
  roadmapData.forEach(task=>{
    if(["완료","보류"].includes(task.status)) return;
    const dd=supportTaskDueDays(task);
    const imp=task.priority==="높음"?"high":task.priority==="중간"?"mid":"low";
    const title=task.title||"(제목 없음)";
    const base={kind:"task",title,imp,areaKey:"roadmap",itemId:task.id};
    if(dd!==null&&dd<0) alerts.push({...base,sev:"urgent",reasonCode:"overdue",msg:`[실행과제] ${title} — 마감일이 ${Math.abs(dd)}일 지났습니다. 담당자와 다음 실행을 확인하세요.`});
    else if(dd!==null&&dd<=3) alerts.push({...base,sev:"warn",reasonCode:"dueSoon",msg:`[실행과제] ${title} — ${dd===0?"오늘 마감":"마감 D-"+dd}. 산출물과 진행률을 확인하세요.`});
    else if(!task.dueDate&&task.priority==="높음") alerts.push({...base,sev:"info",reasonCode:"noDueDate",msg:`[실행과제] ${title} — 높은 우선순위지만 마감일이 없습니다.`});
  });
  const sevOrder = {urgent:0, warn:1, info:2};
  const impOrder = {high:0, mid:1, low:2};
  alerts.sort((a,b)=> (sevOrder[a.sev]-sevOrder[b.sev]) || (impOrder[a.imp]-impOrder[b.imp]));
  return alerts;
}

function aiAlertSubjectKey(a){ return `${a.kind||a.areaKey}:${a.areaKey||""}:${a.itemId||a.title||a.msg}`; }
function aiAggregateAlerts(alerts=collectAiAlerts()){
  const sevRank={urgent:0,warn:1,info:2};
  const map=new Map();
  alerts.forEach(a=>{
    const key=aiAlertSubjectKey(a);
    if(!map.has(key)) map.set(key,{...a,reasons:[a.msg],reasonCodes:[a.reasonCode]});
    else{
      const cur=map.get(key);cur.reasons.push(a.msg);cur.reasonCodes.push(a.reasonCode);
      if(sevRank[a.sev]<sevRank[cur.sev]) Object.assign(cur,{sev:a.sev,imp:a.imp,msg:a.msg});
    }
  });
  return [...map.values()].sort((a,b)=>(sevRank[a.sev]-sevRank[b.sev])||({high:0,mid:1,low:2}[a.imp]-({high:0,mid:1,low:2}[b.imp])));
}
function aiAlertSummary(){
  const items=aiAggregateAlerts();
  return {items,urgent:items.filter(a=>a.sev==="urgent"),warn:items.filter(a=>a.sev==="warn"),info:items.filter(a=>a.sev==="info")};
}

/* ---- 내부 데이터 집계 (질의응답용) ---- */
function aiDeals(){
  const out = [];
  AREAS.forEach(area=>(stageData[area.key]||[]).forEach(item=>{
    out.push({area, item, stage: normalizeStage(item.stage), imp: dealImportance(item, area.key)});
  }));
  return out;
}
function aiStats(){
  const deals = aiDeals();
  const active = deals.filter(d=>!isClosedStage(d.stage));
  let pipeline = 0, weighted = 0, won = 0, wonCnt = 0;
  deals.forEach(d=>{
    const amt = parseFloat(d.item.amount)||0;
    const prob = Math.min(100, Math.max(0, parseFloat(d.item.prob)||0));
    if(d.stage === "수주"){ won += amt; wonCnt++; }
    else if(d.stage !== "보류"){ pipeline += amt; weighted += amt*prob/100; }
  });
  return {deals, active, pipeline, weighted, won, wonCnt};
}
function fmtDealLine(d){
  const {item, area, stage, imp} = d;
  const parts = [`${item.title || "(제목 없음)"} — ${stage} · ${area.title} · 중요도 ${IMPORTANCE_LABEL[imp.level]}`];
  const amt = parseFloat(item.amount)||0;
  if(amt) parts.push(`예상 ${fmtAmount(Math.round(amt))}${item.prob ? " · 확률 " + item.prob + "%" : ""}`);
  else if(item.prob) parts.push(`확률 ${item.prob}%`);
  if(item.nextAction) parts.push(`다음 액션 ${item.nextAction}`);
  return "· " + parts.join(" / ");
}
function fmtDealDetail(d){
  const {item, area, stage, imp} = d;
  const resolvedImp = imp || dealImportance(item, area.key);
  const L = [`"${item.title}" 상세:`];
  L.push(`· 단계 ${stage} · 그룹 ${area.title} · 중요도 ${IMPORTANCE_LABEL[resolvedImp.level]}`);
  const amt = parseFloat(item.amount)||0;
  L.push(`· 예상 매출 ${amt ? fmtAmount(Math.round(amt)) : "미입력"} · 성사 확률 ${item.prob ? item.prob + "%" : "미입력"}`);
  if(item.contactName) L.push(`· 담당자 ${item.contactName}${item.contactRole ? " (" + item.contactRole + ")" : ""}`);
  if(item.lastContact) L.push(`· 최근 컨택 ${item.lastContact}`);
  if(item.nextAction){
    const dd = daysUntil(item.nextAction);
    L.push(`· 다음 액션 ${item.nextAction}${dd !== null && dd < 0 ? " (" + Math.abs(dd) + "일 지연)" : ""}`);
  }
  if(item.desc) L.push(`· 현황: ${item.desc}`);
  if(item.action) L.push(`· 예정 업무: ${item.action}`);
  return L.join("\n");
}
function fmtContactDetail(ct){
  const L = [`연락처 "${ct.name || ct.company}" 정보:`];
  if(ct.company || ct.jobTitle || ct.department) L.push(`· 소속 ${ct.company || "-"}${ct.jobTitle ? " · " + ct.jobTitle : ""}${ct.department ? " / " + ct.department : ""}`);
  if(ct.mobilePhone) L.push(`· 휴대전화 ${ct.mobilePhone}`);
  if(ct.businessPhone) L.push(`· 유선전화 ${ct.businessPhone}`);
  if(ct.email) L.push(`· 이메일 ${ct.email}`);
  if(ct.group || ct.tags) L.push(`· 그룹/태그 ${[ct.group,ct.tags].filter(Boolean).join(" / ")}`);
  if(ct.createdAt) L.push(`· 등록일 ${ct.createdAt}`);
  if(ct.memo) L.push(`· 메모: ${ct.memo.slice(0,120)}${ct.memo.length > 120 ? "..." : ""}`);
  return L.join("\n");
}
function aiBriefingText(){
  const s = aiStats();
  const alerts = collectAiAlerts();
  const urgent = alerts.filter(a=>a.sev === "urgent");
  const warn = alerts.filter(a=>a.sev === "warn");
  const tops = s.active.slice().sort(compareImportanceDeals).slice(0,3);
  const L = ["HLB-현장지원팀 영업지원 브리핑:"];
  L.push("· 운영 기준: 기존 거래처·진행 영업 건은 단기 매출 전환 중심, 장기 완제품 검토는 별도 트랙");
  L.push(`· 활성 항목 ${s.active.length}건 · 파이프라인 ${fmtAmount(Math.round(s.pipeline))} · 가중 예상 ${fmtAmount(Math.round(s.weighted))}`);
  L.push(`· 수주 ${s.wonCnt}건 (${fmtAmount(Math.round(s.won))}) · 연락처 ${contactsData.length}명`);
  if(urgent.length || warn.length) L.push(`· 알림: 긴급 ${urgent.length}건 · 주의 ${warn.length}건`);
  if(urgent.length) L.push("\n가장 급한 건:\n" + urgent.slice(0,2).map(a=>"· " + a.msg).join("\n"));
  if(tops.length) L.push("\n집중 추천:\n" + tops.map(fmtDealLine).join("\n"));
  return L.join("\n");
}


function aiDealMissingFields(item){
  const missing=[];
  if(!String(item.internalOwner||"").trim())missing.push("내부 담당자");
  if(!String(item.action||"").trim())missing.push("고객 후속 업무");
  if(!item.nextAction)missing.push("고객 후속일");
  if(!String(item.amount??"").trim())missing.push("예상 매출");
  if(!String(item.prob??"").trim())missing.push("성사 확률");
  if(!(item.linkedContactIds||[]).length&&!item.contactName&&!item.contactPhone&&!item.contactEmail)missing.push("고객 연락처");
  return missing;
}
function aiDataQualityIssues(){
  const out=[];
  aiDeals().filter(d=>!isClosedStage(d.stage)).forEach(d=>{
    const missing=aiDealMissingFields(d.item);
    if(missing.length)out.push({kind:"deal",areaKey:d.area.key,itemId:d.item.id,title:d.item.title||"(제목 없음)",missing,score:missing.length+(missing.includes("고객 후속일")?2:0)+(missing.includes("내부 담당자")?1:0)});
  });
  roadmapData.filter(t=>!["완료","보류"].includes(t.status)).forEach(t=>{
    const missing=[];if(!effectiveSupportTaskOwner(t))missing.push("과제 담당자");if(!t.dueDate)missing.push("마감일");if(!String(t.nextAction||"").trim())missing.push("내부 다음 실행");
    if(missing.length)out.push({kind:"task",areaKey:"roadmap",itemId:t.id,title:t.title||"(제목 없음)",missing,score:missing.length+(missing.includes("마감일")?2:0)});
  });
  return out.sort((a,b)=>b.score-a.score);
}
function aiPipelineHealth(){
  const active=aiStats().active;
  const urgent=aiAlertSummary().urgent.length;
  const noNext=active.filter(d=>!d.item.nextAction).length;
  const noOwner=active.filter(d=>!String(d.item.internalOwner||"").trim()).length;
  const noValue=active.filter(d=>!String(d.item.amount??"").trim()||!String(d.item.prob??"").trim()).length;
  let score=100-Math.min(35,urgent*7)-Math.min(25,noNext*4)-Math.min(20,noOwner*3)-Math.min(15,noValue*2);
  score=Math.max(0,Math.round(score));
  const grade=score>=85?"양호":score>=70?"보통":score>=50?"주의":"개선 필요";
  return {score,grade,urgent,noNext,noOwner,noValue};
}
function aiFindDeal(q){
  if(aiContextRef?.kind==="task"&&/이 실행과제|이 과제|현재 과제|선택 과제/.test(q))return null;
  if(aiContextRef?.kind==="deal"&&(/이 항목|현재 항목|선택 항목|이 영업|분석|다음 행동|후속|메일|문구/.test(q)||!q.trim()))return findDeal(aiContextRef.areaKey,aiContextRef.itemId);
  const low=String(q||"").toLowerCase();
  const deals=allDeals();
  let best=null,bestLen=0;
  deals.forEach(d=>{
    const fields=[d.item.title,d.item.contactName,d.item.contactEmail].filter(Boolean);
    fields.forEach(v=>{const x=String(v).toLowerCase();if(x.length>=2&&low.includes(x)&&x.length>bestLen){best=d;bestLen=x.length;}});
  });
  if(best)return best;
  const tokens=String(q||"").replace(/[^0-9A-Za-z가-힣 ]/g," ").split(/\s+/).filter(t=>t.length>=2&&!/^(분석|메일|작성|후속|연락|문구|다음|행동|고객|회사|항목|데이터|누락|점검|긴급|일정|브리핑)$/.test(t));
  for(const tk of tokens){const d=deals.find(x=>(x.item.title||"").includes(tk)||(x.item.contactName||"").includes(tk));if(d)return d;}
  return null;
}
function aiFindTask(q){
  if(aiContextRef?.kind==="deal"&&/이 영업|이 항목|현재 항목|선택 항목/.test(q))return null;
  if(aiContextRef?.kind==="task"&&(/이 실행과제|이 과제|현재 과제|선택 과제|분석|점검|다음 행동/.test(q)||!q.trim()))return roadmapData.find(t=>t.id===aiContextRef.itemId)||null;
  const low=String(q||"").toLowerCase();let best=null,bestLen=0;
  roadmapData.forEach(t=>{const x=String(t.title||"").toLowerCase();if(x.length>=2&&low.includes(x)&&x.length>bestLen){best=t;bestLen=x.length;}});return best;
}
function aiFindContact(q){
  const low=String(q||"").toLowerCase();let best=null,bestLen=0;
  contactsData.forEach(c=>[c.name,c.company,c.email].filter(Boolean).forEach(v=>{const x=String(v).toLowerCase();if(x.length>=2&&low.includes(x)&&x.length>bestLen){best=c;bestLen=x.length;}}));return best;
}
function aiDealAdvice(d){
  const item=d.item,stage=normalizeStage(item.stage),missing=aiDealMissingFields(item);
  const guide={
    "리드":"고객의 적용 목적·예상 물량·의사결정 담당자를 확인하고 첫 상담 일정을 확정하세요.",
    "상담":"요구 규격, 샘플 조건, 판단 기준과 회신 예정일을 구체화하세요.",
    "제안":"견적·제안 수신 여부를 확인하고 이견, 승인 절차, 답변 기한을 기록하세요.",
    "협상":"가격·납기·품질 조건과 최종 승인자를 확인하고 계약 또는 발주 목표일을 정하세요.",
    "보류":"보류 사유와 재확인 날짜를 명확히 하여 장기 방치를 방지하세요.",
    "수주":"실제 수주 금액과 납품일을 기록하고 후속 발주 가능성을 관리하세요.",
    "실주":"실주 사유·경쟁사·재접촉 가능 시점을 기록하여 다음 영업에 활용하세요."
  }[stage]||"다음 행동과 기한을 명확히 입력하세요.";
  const L=[`"${item.title}" AI 점검:`,`· 현재 단계: ${stage} · 중요도 ${IMPORTANCE_LABEL[d.imp?.level||dealImportance(item,d.area.key).level]}`,`· 추천 행동: ${guide}`];
  if(item.action)L.push(`· 현재 등록된 후속 업무: ${item.action}${item.nextAction?` (${item.nextAction})`:" · 날짜 미지정"}`);
  if(missing.length)L.push(`· 데이터 보완: ${missing.join(", ")}`);
  const related=roadmapData.filter(t=>t.relatedAreaKey===d.area.key&&t.relatedDealId===item.id&&!isSupportTaskDone(t));
  if(related.length)L.push(`· 연결된 미완료 실행과제: ${related.length}건 — ${related.slice(0,3).map(t=>t.title).join(", ")}`);
  return L.join("\n");
}
function aiTaskAdvice(t){
  const dd=supportTaskDueDays(t);const owner=effectiveSupportTaskOwner(t)||"미지정";const L=[`"${t.title}" 실행과제 점검:`,`· 상태 ${t.status} · 우선순위 ${t.priority} · 진행률 ${t.progress}%`,`· 담당자 ${owner} · 마감 ${t.dueDate||"미지정"}${dd!==null&&dd<0?` (${Math.abs(dd)}일 지연)`:""}`];
  if(t.purpose)L.push(`· 목적: ${t.purpose}`);if(t.deliverable)L.push(`· 완료 기준: ${t.deliverable}`);
  if(t.nextAction)L.push(`· 현재 다음 실행: ${t.nextAction}`);else L.push("· 추천: 다음 실행을 한 문장으로 정하고 담당자와 기한을 지정하세요.");
  if(t.blocker)L.push(`· 장애요인: ${t.blocker}`);return L.join("\n");
}
function aiDraftFollowupEmail(d){
  const i=d.item;const contact=i.contactName?`${i.contactName} ${i.contactRole||""}`.trim()+"님":"담당자님";const next=i.action||"진행 상황과 향후 일정을 확인";
  return `[후속 이메일 초안]\n제목: [HLB-현장지원팀] ${i.title} 관련 진행 상황 확인\n\n안녕하세요, ${contact}.\nHLB-현장지원팀입니다.\n\n${i.title} 관련하여 ${next}드리고자 연락드립니다.\n현재 검토 상황과 추가로 필요한 자료 또는 확인사항이 있으시면 회신 부탁드립니다.\n가능하시다면 향후 일정도 함께 공유해 주시면 후속 대응에 반영하겠습니다.\n\n감사합니다.\nHLB-현장지원팀 드림\n\n※ 발송 전 고객명, 제품명, 요청 내용과 기한을 실제 상황에 맞게 확인하세요.`;
}
function aiDraftShortMessage(d){
  const i=d.item;const name=i.contactName?`${i.contactName}님, `:"";return `[짧은 연락 문구]\n${name}안녕하세요. HLB-현장지원팀입니다. ${i.title} 관련 진행 상황과 추가 확인이 필요한 사항이 있는지 문의드립니다. 가능하실 때 현재 검토 일정과 회신 가능 시점을 알려주시면 감사하겠습니다.`;
}
function aiOwnerOverview(q){
  const owners=new Map();
  aiDeals().filter(d=>!isClosedStage(d.stage)).forEach(d=>{const o=String(d.item.internalOwner||"미지정").trim()||"미지정";if(!owners.has(o))owners.set(o,{deals:[],tasks:[]});owners.get(o).deals.push(d);});
  roadmapData.filter(t=>!["완료","보류"].includes(t.status)).forEach(t=>{const o=effectiveSupportTaskOwner(t)||"미지정";if(!owners.has(o))owners.set(o,{deals:[],tasks:[]});owners.get(o).tasks.push(t);});
  const named=[...owners.keys()].filter(x=>x!=="미지정").sort((a,b)=>b.length-a.length).find(o=>q.includes(o));
  if(named){const x=owners.get(named);return `${named} 담당 현황:\n· 진행 영업 ${x.deals.length}건 · 미완료 실행과제 ${x.tasks.length}건\n`+[...x.deals.slice(0,5).map(fmtDealLine),...x.tasks.slice(0,5).map(t=>`· [실행과제] ${t.title} — ${t.status} · ${supportTaskDueText(t)}`)].join("\n");}
  return "담당자별 진행 현황:\n"+[...owners.entries()].sort((a,b)=>(b[1].deals.length+b[1].tasks.length)-(a[1].deals.length+a[1].tasks.length)).map(([o,x])=>`· ${o}: 영업 ${x.deals.length}건 · 실행과제 ${x.tasks.length}건`).join("\n");
}
function aiAlertText(filterSev=""){
  const sum=aiAlertSummary();const list=filterSev?sum.items.filter(a=>a.sev===filterSev):sum.items;
  if(!list.length)return filterSev==="urgent"?"긴급 확인 항목이 없습니다.":"확인할 일정 알림이 없습니다.";
  return `${filterSev==="urgent"?"긴급 확인":"일정·업무 알림"} ${list.length}건:\n`+list.slice(0,10).map(a=>`· [${AI_SEV_LABEL[a.sev]}] ${a.title}\n  ${a.reasons.map(x=>x.replace(/^\[실행과제\]\s*/,"")).join(" / ")}`).join("\n")+(list.length>10?`\n외 ${list.length-10}건`:"");
}
const AI_MANUAL_STOPWORDS = new Set(["무엇","뭐야","뭐지","어떻게","방법","사용","사용법","기능","설명","알려줘","보여줘","현재","관련","대한","있는","하는","하면","해주세요","해줘","CRM","HLB-현장지원팀","질문","없는","완전히","내용","답변"]);
const AI_MANUAL_ALIASES = [
  [/메뉴얼/g,"매뉴얼"],[/로드맵/g,"실행과제"],[/후속일/g,"다음 액션일"],[/후속 업무/g,"고객 후속 업무"],
  [/다음 행동/g,"다음 액션"],[/명함 인식/g,"OCR"],[/뱃지|배지/g,"아이콘 숫자 긴급 항목"],
  [/영업기회/g,"파이프라인"],[/거래처/g,"고객"],[/할 일/g,"오늘 할 일"]
];
function aiNormalizeKnowledgeText(value){
  let s=String(value||"").toLowerCase().replace(/[^0-9a-z가-힣% ]/g," ");
  AI_MANUAL_ALIASES.forEach(([re,to])=>{s=s.replace(re,String(to).toLowerCase());});
  return s.replace(/\s+/g," ").trim();
}
function aiKnowledgeTokens(q){
  const normalized=aiNormalizeKnowledgeText(q);
  const raw=normalized.split(" ").map(x=>x.replace(/(으로|에서|에게|까지|부터|하고|이며|이고|인가|나요|해줘|해주세요|이야|야|가|이|을|를|은|는|와|과|로)$/g,"")).filter(x=>x.length>=2&&!AI_MANUAL_STOPWORDS.has(x));
  const expanded=[...raw];
  if(/그룹 분류/.test(normalized))expanded.push("그룹 분류");
  if(/다음 액션/.test(normalized))expanded.push("다음 액션");
  if(/실행과제/.test(normalized))expanded.push("영업지원 실행과제");
  if(/아이콘 숫자|긴급 항목/.test(normalized))expanded.push("AI 봇","긴급");
  return [...new Set(expanded)];
}
function aiSearchManual(q,limit=3){
  const normalized=aiNormalizeKnowledgeText(q),tokens=aiKnowledgeTokens(q);
  if(!manualSections.length)return [];
  return manualSections.map(section=>{
    const category=aiNormalizeKnowledgeText(section.category),title=aiNormalizeKnowledgeText(section.title),content=aiNormalizeKnowledgeText(section.content);
    let score=0;
    if(normalized&&title&&normalized.includes(title))score+=18;
    if(normalized&&category&&normalized.includes(category))score+=8;
    tokens.forEach(t=>{if(title.includes(t))score+=7;if(category.includes(t))score+=4;if(content.includes(t))score+=2;});
    if(/차이|구분/.test(normalized)&&/차이|구분|분리/.test(content))score+=4;
    if(/왜|목적|의미/.test(normalized)&&/목적|기준|의미|이유/.test(content))score+=2;
    return {section,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.section.order-b.section.order).slice(0,limit);
}
function aiManualExcerpt(section,q){
  const lines=manualLines(section.content),tokens=aiKnowledgeTokens(q);
  let selected=lines.filter(line=>tokens.some(t=>aiNormalizeKnowledgeText(line).includes(t)));
  if(!selected.length)selected=lines.slice(0,section.format==="paragraph"?2:4);
  return selected.slice(0,4);
}
function aiManualAnswer(matches,q){
  if(!matches.length)return "";
  const blocks=matches.slice(0,2).map(({section})=>{
    const lines=aiManualExcerpt(section,q);
    return `${section.title}\n${lines.map(x=>"· "+x).join("\n")}`;
  });
  return blocks.join("\n\n");
}
function aiManualScreenKey(section){
  const s=`${section.category} ${section.title}`;
  if(/대시보드|시작/.test(s))return "home";
  if(/파이프라인|영업 항목|단계|중요도/.test(s))return "pipeline";
  if(/연락처|명함|OCR/.test(s))return "contacts";
  if(/실행과제|로드맵/.test(s))return "roadmap";
  if(/캘린더|Google Calendar|일정/.test(s))return "calendar";
  if(/설정|백업|휴지통|매뉴얼/.test(s))return "settings";
  return "";
}
function aiQuestionIntent(q,manualMatches=[]){
  const normalized=aiNormalizeKnowledgeText(q);
  const explicitManual=/사용법|어떻게|방법|무엇|뭐야|뭐지|왜|의미|목적|차이|구분|기준|기능|설명|등록|수정|삭제|복원|백업|스캔|ocr|매뉴얼|메뉴얼/.test(normalized);
  const currentData=/현재|몇 ?건|목록|보여|찾아|현황|오늘|이번 ?주|지연|긴급|누락|미입력|매출|금액|수주율|실적|우선|top ?5|브리핑|보고|건강도|미접촉|내 담당|담당자별|일정 없는|액션 없는/.test(normalized);
  const entity=!!(aiFindDeal(q)||aiFindTask(q)||aiFindContact(q));
  const generation=/메일|이메일|문자|카톡|연락 문구|초안/.test(normalized);
  const icon=/아이콘.*숫자|숫자.*왜|배지|뱃지/.test(normalized);
  const manual=manualMatches.length>0&&((explicitManual&&manualMatches[0].score>=2)||manualMatches[0].score>=7);
  const data=currentData||generation||icon||(entity&&(!explicitManual||/분석|다음 액션|다음 행동|후속|메일|문구|현황|현재 항목|이 영업|이 과제/.test(normalized)));
  return {manual,data,explicitManual,currentData,entity,generation,icon};
}
function aiDataSourceLabels(q){
  const labels=[];const s=aiNormalizeKnowledgeText(q);
  if(/매출|파이프라인|영업|단계|리드|상담|제안|협상|수주|보류|실주|액션|미접촉|담당/.test(s)||aiFindDeal(q))labels.push("파이프라인");
  if(/연락처|명함|전화|이메일|회사 정보/.test(s)||aiFindContact(q))labels.push("연락처");
  if(/실행과제|로드맵|내부 과제|마감/.test(s)||aiFindTask(q))labels.push("영업지원 실행과제");
  if(/긴급|주의|알림|오늘|이번 주|브리핑|건강도|누락/.test(s))labels.push("일정·알림 집계");
  return [...new Set(labels.length?labels:["CRM 전체 저장 데이터"])];
}
function aiKnowledgeTimestamp(){
  try{return new Date().toLocaleString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}catch(e){return todayStr();}
}
function aiKnowledgeRecommendation(q,intent){
  const d=aiFindDeal(q),t=aiFindTask(q),sum=aiAlertSummary();
  const stageHit=STAGE_OPTIONS.find(st=>String(q||"").includes(st));
  if(intent.data&&d)return `아래 버튼에서 "${d.item.title||"영업 항목"}"을 열어 원본 데이터와 다음 액션을 확인하세요.`;
  if(intent.data&&t)return `아래 버튼에서 "${t.title||"실행과제"}"을 열어 담당자, 마감일과 다음 실행을 확인하세요.`;
  if(stageHit)return `파이프라인 화면에서 ${stageHit} 단계 필터를 열어 항목의 단계와 다음 액션을 확인하세요.`;
  if(intent.data&&sum.urgent.length){const x=sum.urgent[0];return `긴급 항목 ${sum.urgent.length}건 중 "${x.title}"부터 확인하는 것이 좋습니다.`;}
  if(intent.manual)return "아래 매뉴얼 보기 또는 관련 화면 버튼으로 이동해 실제 입력 위치를 확인하세요.";
  return "질문에 고객사명, 화면명, 단계, 담당자 또는 기간 조건을 추가하면 더 정확하게 찾을 수 있습니다.";
}
function aiComposeKnowledgeAnswer(q){
  q=String(q||"").trim();
  const matches=aiSearchManual(q,3),intent=aiQuestionIntent(q,matches),parts=[];
  if(intent.manual&&matches.length)parts.push(`[매뉴얼 안내]\n${aiManualAnswer(matches,q)}`);
  if(intent.data)parts.push(`[CRM 저장 데이터]\n${aiDataAnswer(q)}`);
  if(!parts.length){
    if(matches.length)parts.push(`[매뉴얼 안내]\n${aiManualAnswer(matches,q)}`);
    else return `매뉴얼과 CRM 저장 데이터에서 질문의 근거를 찾지 못했습니다.\n화면명, 고객사명, 단계, 담당자, 기간 또는 알고 싶은 기능을 조금 더 구체적으로 입력해 주세요.\n\n예: "그룹 분류와 그룹의 차이", "현재 협상 단계 몇 건", "A사 다음 행동"`;
  }
  parts.push(`[추천 행동]\n${aiKnowledgeRecommendation(q,intent)}`);
  const manualRefs=intent.manual&&matches.length?matches.slice(0,2).map(x=>`${x.section.category} > ${x.section.title}`).join(" / "):"사용하지 않음";
  const dataRefs=intent.data?`${aiDataSourceLabels(q).join(" · ")} (${aiKnowledgeTimestamp()} 기준)`:"사용하지 않음";
  parts.push(`[답변 근거]\n· 매뉴얼: ${manualRefs}\n· 저장 데이터: ${dataRefs}`);
  return parts.join("\n\n");
}

function aiResponseActions(q){
  const actions=[];const manualMatches=aiSearchManual(q,2),intent=aiQuestionIntent(q,manualMatches);
  if(intent.manual&&manualMatches.length){
    manualMatches.forEach(({section})=>actions.push({type:"openManual",itemId:section.id,query:section.title,label:`매뉴얼 보기 · ${section.title}`}));
    const key=aiManualScreenKey(manualMatches[0].section);if(key)actions.push({type:"view",key,label:`관련 화면 열기 · ${manualMatches[0].section.category}`});
  }
  const pushOpen=(x)=>{if(x.kind==="task")actions.push({type:"openTask",itemId:x.itemId,label:`과제 열기 · ${x.title}`});else actions.push({type:"openDeal",areaKey:x.areaKey,itemId:x.itemId,label:`영업 열기 · ${x.title}`});};
  const globalQuery=/긴급|지연|밀린|숫자|배지|뱃지|누락|미입력|데이터 품질|완성도|이번 ?주|일정|오늘 브리핑|전체 브리핑|현황 요약|회의.*보고|보고.*요약|매출전환|TOP ?5|파이프라인 현황|담당자별|담당 현황/.test(q);
  if(/긴급|지연|밀린|숫자|배지|뱃지/.test(q))aiAlertSummary().urgent.slice(0,6).forEach(pushOpen);
  else if(/누락|미입력|데이터 품질|완성도/.test(q))aiDataQualityIssues().slice(0,6).forEach(pushOpen);
  else if(/이번 ?주|일정|오늘 브리핑|전체 브리핑|현황 요약/.test(q))aiAlertSummary().items.slice(0,6).forEach(pushOpen);
  else if(/실행과제|로드맵/.test(q)&&!aiContextRef)roadmapData.filter(t=>!isSupportTaskDone(t)).slice(0,5).forEach(t=>pushOpen({kind:"task",itemId:t.id,title:t.title}));
  if(intent.data&&(!globalQuery||/이 영업|이 항목|현재 항목|후속 메일|연락 문구/.test(q))){
    const d=aiFindDeal(q);if(d){actions.unshift({type:"openDeal",areaKey:d.area.key,itemId:d.item.id,label:"영업 항목 열기"});actions.push({type:"activity",areaKey:d.area.key,itemId:d.item.id,label:"활동 기록"});}
  }
  if(intent.data&&(!globalQuery||/이 실행과제|이 과제|현재 과제/.test(q))){
    const t=aiFindTask(q);if(t&&!actions.some(a=>a.type==="openTask"&&a.itemId===t.id))actions.unshift({type:"openTask",itemId:t.id,label:"실행과제 열기"});
  }
  if(intent.data&&!globalQuery){const c=aiFindContact(q);if(c)actions.unshift({type:"openContact",itemId:c.id,label:`연락처 열기 · ${c.name||c.company}`});}
  if(!actions.length)actions.push({type:"ask",query:"긴급 알림",label:"긴급 알림"},{type:"ask",query:"데이터 누락 점검",label:"데이터 누락 점검"},{type:"ask",query:"매출전환 TOP5",label:"매출전환 TOP5"});
  const unique=[];const seen=new Set();actions.forEach(a=>{const k=[a.type,a.itemId||"",a.areaKey||"",a.key||"",a.query||""].join("|");if(!seen.has(k)){seen.add(k);unique.push(a);}});
  return unique.slice(0,8);
}
/* ---- 질의 해석: 내부 데이터를 기반으로 답변 생성 ---- */
function aiDataAnswer(q){
  q=String(q||"").trim();
  const s=aiStats(),alerts=collectAiAlerts();
  const deal=aiFindDeal(q),task=aiFindTask(q),contact=aiFindContact(q);

  if(/아이콘.*숫자|숫자.*왜|배지|뱃지/.test(q)){
    const sum=aiAlertSummary();
    return `AI 봇 아이콘의 숫자는 즉시 확인해야 하는 긴급 항목 수입니다.\n현재 긴급 ${sum.urgent.length}건 · 주의 ${sum.warn.length}건입니다.\n기한이 지난 고객 후속 업무, 높은 중요도의 장기 미접촉 영업 건, 마감일이 지난 실행과제가 긴급으로 계산됩니다. 같은 항목에 사유가 여러 개 있어도 숫자는 한 건으로 표시합니다.`;
  }
  if(/AI ?봇.*(도움|사용법|기능|할 수)|도움말|무엇을 할 수/.test(q))return ["AI 봇 활용 예시:","· 오늘 브리핑 / 긴급 알림 / 이번 주 일정","· 매출전환 TOP5 / 파이프라인 건강도 / 회의 보고 요약","· 데이터 누락 점검 / 다음 액션 없는 항목 / 담당자별 현황","· 실행과제 지연 점검 / 장기 미접촉 고객","· 고객사명 + 분석 / 후속 메일 작성 / 연락 문구","· 검색 결과의 버튼으로 해당 항목을 바로 열거나 활동을 기록할 수 있습니다."].join("\n");
  if(/오늘 브리핑|전체 브리핑|현황 요약/.test(q))return aiBriefingText();
  if(/회의.*보고|보고.*요약|임원.*보고/.test(q)){
    const h=aiPipelineHealth(),sum=aiAlertSummary(),top=s.active.slice().sort(compareImportanceDeals).slice(0,3),lateTasks=roadmapData.filter(t=>!isSupportTaskDone(t)&&supportTaskDueDays(t)!==null&&supportTaskDueDays(t)<0);
    return `회의 보고 요약:\n· 파이프라인 건강도 ${h.score}점 (${h.grade})\n· 활성 영업 ${s.active.length}건 · 예상 매출 ${fmtAmount(Math.round(s.pipeline))} · 가중 예상 ${fmtAmount(Math.round(s.weighted))}\n· 긴급 ${sum.urgent.length}건 · 주의 ${sum.warn.length}건 · 지연 실행과제 ${lateTasks.length}건\n· 우선 영업:\n${top.map(fmtDealLine).join("\n")||"· 등록 없음"}`;
  }
  if(/건강도|데이터 품질|완성도/.test(q)){
    const h=aiPipelineHealth();return `파이프라인 건강도 ${h.score}점 · ${h.grade}\n· 긴급 확인 ${h.urgent}건\n· 다음 액션일 미입력 ${h.noNext}건\n· 내부 담당자 미지정 ${h.noOwner}건\n· 예상 매출 또는 확률 미입력 ${h.noValue}건\n점수가 낮을수록 일정과 핵심 데이터 보완이 필요합니다.`;
  }
  if(/누락|미입력|정보 부족/.test(q)){
    const issues=aiDataQualityIssues();if(!issues.length)return "핵심 정보 누락 항목이 없습니다.";
    return `데이터 보완 필요 ${issues.length}건:\n`+issues.slice(0,10).map(x=>`· ${x.kind==="task"?"[실행과제] ":""}${x.title} — ${x.missing.join(", ")}`).join("\n")+(issues.length>10?`\n외 ${issues.length-10}건`:"");
  }
  const requestedStage=STAGE_OPTIONS.find(st=>q.includes(st));
  if(requestedStage&&/몇|건|목록|보여|현재|어떤|알려/.test(q)){const list=s.deals.filter(d=>d.stage===requestedStage);if(!list.length)return `${requestedStage} 단계의 항목이 없습니다.`;return `${requestedStage} 단계 항목 ${list.length}건:\n`+list.map(fmtDealLine).join("\n");}
  if(/다음 액션.*없|일정.*없|후속일.*없/.test(q)){const list=s.active.filter(d=>!d.item.nextAction);if(!list.length)return "다음 액션일이 비어 있는 활성 영업 항목이 없습니다.";return `다음 액션일 미입력 ${list.length}건:\n`+list.map(fmtDealLine).join("\n");}
  if(/장기.*미접촉|오래.*연락|미접촉/.test(q)){const list=alerts.filter(a=>a.reasonCode==="stale");if(!list.length)return "장기 미접촉으로 분류된 영업 항목이 없습니다.";return `장기 미접촉 ${list.length}건:\n`+list.map(a=>`· ${a.msg}`).join("\n");}
  if(/담당자별|담당 현황|내 담당|누가 담당/.test(q))return aiOwnerOverview(q);
  if(/긴급|지연|밀린|늦은|늦었/.test(q))return aiAlertText("urgent");
  if(/알림|일정|액션|컨택|스케줄|오늘|이번 ?주/.test(q))return aiAlertText();
  if(/국책|자본|재무|회계|기장|공통비/.test(q)){const list=s.deals.filter(d=>d.area.key==="gov_finance");if(!list.length)return "국책과제·재무 확인 그룹에 등록된 항목이 없습니다.";return "국책과제·재무 확인 항목:\n"+list.map(fmtDealLine).join("\n");}
  if(/자료|홍보|홈페이지|블로그|링크드인|LinkedIn|영상|콘텐츠|알리바바|해외/.test(q)){const list=s.deals.filter(d=>d.area.key==="marketing_assets"||d.area.key==="global_channel");if(!list.length)return "홍보자료·해외채널 관련 항목이 없습니다.";return "자료·홍보·해외채널 항목:\n"+list.map(fmtDealLine).join("\n");}
  if(/단기|기존 거래처|추가 발주|매출 전환|매출전환|우선순위|TOP ?5/.test(q)){const list=s.deals.filter(d=>!isClosedStage(d.stage)&&["direct","future"].includes(itemBucketKey(d.item,d.area))).sort(compareImportanceDeals).slice(0,5);if(!list.length)return "단기 매출 전환 대상이 아직 등록되지 않았습니다.";return `단기 매출 전환 우선순위 TOP ${list.length}:\n`+list.map(fmtDealLine).join("\n");}
  if(/중요|우선|집중|추천/.test(q)){const tops=s.active.slice().sort(compareImportanceDeals).slice(0,5);if(!tops.length)return "활성 항목이 없습니다.";return `매출·확률 기준으로 지금 집중할 항목 TOP ${tops.length}:\n`+tops.map(fmtDealLine).join("\n");}
  if(/매출|금액|파이프라인|얼마/.test(q))return `파이프라인 현황:\n· 활성 항목 ${s.active.length}건 · 예상 매출 합계 ${fmtAmount(Math.round(s.pipeline))}\n· 가중 예상 매출(확률 반영) ${fmtAmount(Math.round(s.weighted))}\n· 수주 실적 ${s.wonCnt}건 · ${fmtAmount(Math.round(s.won))}`;
  if(/수주율|성과|실적/.test(q)){const wonN=s.deals.filter(d=>d.stage==="수주").length,holdN=s.deals.filter(d=>d.stage==="보류").length,lostN=s.deals.filter(d=>d.stage==="실주").length,rate=(wonN+lostN)?Math.round(wonN/(wonN+lostN)*100):0;return `성과 요약:\n· 수주 ${wonN}건 / 실주 ${lostN}건 / 보류 ${holdN}건 → 종료건 기준 수주율 ${rate}%\n· 수주 금액 ${fmtAmount(Math.round(s.won))}\n· 진행 중 항목 ${s.active.length}건 (가중 예상 ${fmtAmount(Math.round(s.weighted))})`;}

  if(task&&/분석|점검|다음 행동|어떻게|현재 과제|이 과제|이 실행과제/.test(q))return aiTaskAdvice(task);
  if(deal&&/메일|이메일/.test(q))return aiDraftFollowupEmail(deal);
  if(deal&&/문자|메시지|연락 문구|카톡/.test(q))return aiDraftShortMessage(deal);
  if(deal&&/분석|다음 행동|어떻게|코칭|점검|현재 항목|이 항목|이 영업/.test(q))return aiDealAdvice(deal);

  const stageHit=STAGE_OPTIONS.find(st=>q.includes(st));if(stageHit){const list=s.deals.filter(d=>d.stage===stageHit);if(!list.length)return `${stageHit} 단계의 항목이 없습니다.`;return `${stageHit} 단계 항목 ${list.length}건:\n`+list.map(fmtDealLine).join("\n");}
  if(/연락처|명함|담당자/.test(q)){if(contact)return fmtContactDetail(contact);return `연락처 ${contactsData.length}명 등록 (명함 보유 ${contactsData.filter(contactHasCardImage).length}건, 즐겨찾기 ${contactsData.filter(c=>c.fav).length}명).\n이름이나 회사명을 함께 입력하면 상세 정보를 찾아드립니다.`;}
  if(/로드맵|실행과제/.test(q)){if(task)return aiTaskAdvice(task);const done=roadmapData.filter(isSupportTaskDone).length,remain=roadmapData.filter(r=>!isSupportTaskDone(r)).sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999")).slice(0,7);return `영업지원 실행과제 진행: ${done}/${roadmapData.length} 완료.`+(remain.length?"\n우선 확인:\n"+remain.map(r=>`· ${r.title} — ${r.status} · 담당 ${effectiveSupportTaskOwner(r)||"미지정"} · ${supportTaskDueText(r)}`).join("\n"):"");}
  if(deal)return fmtDealDetail(deal);if(contact)return fmtContactDetail(contact);if(task)return aiTaskAdvice(task);return aiBriefingText();
}

function aiAnswer(q){ return aiComposeKnowledgeAnswer(q); }

/* ---- 페르소나(컨셉)별 응답 성향 반영 ---- */
function personaReply(persona, q){
  const body=aiAnswer(q),parts=[];
  if(persona.focus==="schedule"&&!/알림|일정|지연|액션|컨택|오늘|이번|사용법|방법|무엇|뭐야|차이|기능|매뉴얼/.test(q)){const sum=aiAlertSummary();if(sum.urgent.length+sum.warn.length>0)parts.push(`일정 점검: 긴급 ${sum.urgent.length}건, 주의 ${sum.warn.length}건이 있습니다.`);}
  parts.push(body);
  if(persona.focus==="analysis"&&!/매출|금액|파이프라인|수주율|건강도|보고|사용법|방법|무엇|뭐야|차이|기능|매뉴얼/.test(q)){const h=aiPipelineHealth(),st=aiStats();parts.push(`수치 참고: 건강도 ${h.score}점 · 활성 ${st.active.length}건 · 파이프라인 ${fmtAmount(Math.round(st.pipeline))} · 가중 ${fmtAmount(Math.round(st.weighted))}`);}
  if(persona.focus==="coaching"&&!/다음 행동|분석|메일|문구|숫자|배지|뱃지|도움|기능|사용법|누락|점검|건강도|브리핑|보고|긴급|지연|일정|현황/.test(q)){const st=aiStats(),top=st.active.slice().sort(compareImportanceDeals)[0];if(top)parts.push(`실행 제안: "${top.item.title}"부터 확인하세요. ${top.item.action?top.item.action:"다음 후속 업무와 날짜를 먼저 지정하세요."}`);}
  return {text:parts.join("\n\n"),actions:aiResponseActions(q)};
}

/* ---- 페르소나 저장/불러오기 ---- */
async function loadPersonas(){
  const custom = (await storageGet("tinico:ai:personas")) || [];
  return [...DEFAULT_PERSONAS, ...custom];
}
async function savePersonas(){
  await storageSet("tinico:ai:personas", aiPersonas.filter(p=>!p.builtin));
}
function currentPersona(){
  return aiPersonas.find(p=>p.id === currentPersonaId) || aiPersonas[0];
}
function renderPersonaSelect(){
  const sel = document.getElementById("ai-persona-select");
  sel.innerHTML = "";
  aiPersonas.forEach(p=>{
    const o = document.createElement("option");
    o.value = p.id; o.textContent = p.name;
    if(p.id === currentPersonaId) o.selected = true;
    sel.appendChild(o);
  });
}
function renderPersonaList(){
  const ul = document.getElementById("ai-persona-list");
  ul.innerHTML = "";
  aiPersonas.forEach(p=>{
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "p-name"; name.textContent = p.name;
    const desc = document.createElement("span");
    desc.className = "p-desc"; desc.textContent = p.desc + (p.builtin ? " (기본)" : "");
    li.appendChild(name); li.appendChild(desc);
    if(!p.builtin){
      const del = document.createElement("button");
      del.className = "p-del"; del.textContent = "×";
      del.addEventListener("click", async ()=>{
        if(!confirm(`AI "${p.name}"을(를) 삭제할까요?`)) return;
        const previousPersonas=deepCopy(aiPersonas),previousHistory=aiChatHistories[p.id],previousCurrent=currentPersonaId;
        aiPersonas = aiPersonas.filter(x=>x.id !== p.id);
        delete aiChatHistories[p.id];
        if(currentPersonaId === p.id) currentPersonaId = aiPersonas[0].id;
        await saveOrRollback(savePersonas,()=>{aiPersonas=previousPersonas;if(previousHistory)aiChatHistories[p.id]=previousHistory;currentPersonaId=previousCurrent;},"AI 담당자 삭제 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
        renderPersonaSelect();
        renderPersonaList();
        renderChatHistory();
      });
      li.appendChild(del);
    }
    ul.appendChild(li);
  });
}

/* ---- 대화창 ---- */
function appendAiActions(actions){
  if(!Array.isArray(actions)||!actions.length)return;
  const wrap=document.getElementById("ai-msgs"),box=document.createElement("div");box.className="tn-ai-actions";
  actions.forEach(action=>{const b=document.createElement("button");b.className="tn-ai-action";b.type="button";b.textContent=action.label||"열기";b.title=action.label||"";b.addEventListener("click",()=>runAiAction(action));box.appendChild(b);});wrap.appendChild(box);wrap.scrollTop=wrap.scrollHeight;
}
function appendMsg(role, text, name, actions){
  const wrap = document.getElementById("ai-msgs");
  const div = document.createElement("div");div.className="tn-ai-msg "+role;
  if(role === "bot" && name){const n=document.createElement("span");n.className="tn-ai-msg-name";n.textContent=name;div.appendChild(n);}
  div.appendChild(document.createTextNode(text));wrap.appendChild(div);if(role==="bot")appendAiActions(actions);wrap.scrollTop=wrap.scrollHeight;
}
function appendChips(){
  const wrap=document.getElementById("ai-msgs"),label=document.createElement("div");label.className="tn-ai-quick-label";label.textContent="바로 확인";wrap.appendChild(label);
  const box=document.createElement("div");box.className="tn-ai-chips";
  [
    ["오늘 브리핑",true],["CRM 사용 흐름",true],["파이프라인과 실행과제 차이",false],["현재 협상 단계 몇 건",false],["데이터 누락 점검",false],["회의 보고 요약",false]
  ].forEach(([txt,strong])=>{const b=document.createElement("button");b.className="tn-ai-chip"+(strong?" strong":"");b.textContent=txt;b.addEventListener("click",()=>sendAiMessage(txt));box.appendChild(b);});wrap.appendChild(box);
}
function renderAiContext(){
  const box=document.getElementById("ai-context"),title=document.getElementById("ai-context-title");if(!box)return;
  if(!aiContextRef){box.hidden=true;title.textContent="";return;}box.hidden=false;title.textContent=`${aiContextRef.kind==="task"?"실행과제":"영업"} · ${aiContextRef.title}`;
}
function setAiContext(ref){aiContextRef=ref||null;renderAiContext();}
function renderChatHistory(){
  const persona=currentPersona(),wrap=document.getElementById("ai-msgs");wrap.innerHTML="";
  if(!aiChatHistories[persona.id]){
    aiChatHistories[persona.id]=[{role:"bot",name:persona.name,text:`안녕하세요, ${persona.name}입니다. 설정의 매뉴얼과 CRM 저장 데이터를 함께 검색해 기능 사용법, 현재 현황과 다음 행동을 답합니다.\nAI 아이콘의 숫자는 즉시 확인할 긴급 항목 수입니다.`,actions:[{type:"ask",query:"AI 봇 기능과 답변 근거",label:"사용 가능한 기능 보기"},{type:"ask",query:"아이콘 숫자는 왜 뜨나요",label:"숫자 배지 설명"},{type:"ask",query:"CRM 사용 흐름",label:"매뉴얼로 사용 흐름 확인"}]}];
  }
  const hist=aiChatHistories[persona.id];hist.forEach(m=>appendMsg(m.role,m.text,m.name,m.actions));if(hist.length<=1)appendChips();renderAiContext();
}
function sendAiMessage(text){
  const q=(text||"").trim();if(!q)return;const persona=currentPersona(),hist=aiChatHistories[persona.id]||(aiChatHistories[persona.id]=[]);
  hist.push({role:"me",text:q});appendMsg("me",q);const result=personaReply(persona,q);hist.push({role:"bot",text:result.text,name:persona.name,actions:result.actions});setTimeout(()=>appendMsg("bot",result.text,persona.name,result.actions),160);
}
function runAiAction(action){
  if(!action)return;
  if(action.type==="ask"){sendAiMessage(action.query);return;}
  if(action.type==="openDeal"){toggleAiChat(false);openDealDrawer(action.areaKey,action.itemId);return;}
  if(action.type==="activity"){toggleAiChat(false);openActivityModal(action.areaKey,action.itemId);return;}
  if(action.type==="openTask"){toggleAiChat(false);showView("roadmap");setTimeout(()=>openRoadmapModal(action.itemId),100);return;}
  if(action.type==="openContact"){const c=contactsData.find(x=>x.id===action.itemId);if(c){toggleAiChat(false);showView("contacts");setTimeout(()=>openContactDetail(c),100);}return;}
  if(action.type==="openManual"){
    toggleAiChat(false);showView("settings");setTimeout(()=>{setSettingsMode("manual");const input=document.getElementById("manual-search");if(input){input.value=action.query||"";renderManualSettings();input.focus();}document.getElementById("settings-manual-panel")?.scrollIntoView({behavior:"smooth",block:"start"});},100);return;
  }
  if(action.type==="view"){toggleAiChat(false);showView(action.key);}
}
function updateAiStatusUi(){
  const sum=aiAlertSummary(),stats=aiStats();
  const u=document.getElementById("ai-status-urgent"),w=document.getElementById("ai-status-warn"),a=document.getElementById("ai-status-active");
  if(u)u.textContent=`긴급 ${sum.urgent.length}`;if(w)w.textContent=`주의 ${sum.warn.length}`;if(a)a.textContent=`진행 ${stats.active.length}`;
}
function openAiForDeal(areaKey,itemId){
  const found=findDeal(areaKey,itemId);if(!found)return;if(selectedDealRef)closeDealDrawer();setAiContext({kind:"deal",areaKey,itemId,title:found.item.title||"제목 없음"});toggleAiChat(true);sendAiMessage("이 영업 항목 분석");
}
function openAiForTask(itemId){
  const t=roadmapData.find(x=>x.id===itemId);if(!t)return;if(!document.getElementById("roadmap-modal-overlay").hidden)closeRoadmapModal();setAiContext({kind:"task",itemId,title:t.title||"제목 없음"});toggleAiChat(true);sendAiMessage("이 실행과제 점검");
}
function toggleAiChat(open){
  const panel=document.getElementById("ai-chat"),fab=document.getElementById("ai-fab"),willOpen=open!==undefined?open:panel.hidden;panel.hidden=!willOpen;if(fab)fab.hidden=willOpen;
  if(willOpen){updateAiStatusUi();renderChatHistory();setTimeout(()=>document.getElementById("ai-input").focus(),50);}
}

/* ---- 대시보드 AI 브리핑 + 플로팅 버튼 배지 ---- */
function renderAiBrief(){
  const sum=aiAlertSummary(),items=sum.items,urgent=sum.urgent.length,warn=sum.warn.length;
  const badge=document.getElementById("ai-fab-badge"),fab=document.getElementById("ai-fab"),caption=document.getElementById("ai-fab-caption");
  if(badge){if(urgent>0){badge.hidden=false;badge.textContent=urgent;}else badge.hidden=true;}
  const badgeText=urgent>0?`긴급 확인 항목 ${urgent}건. 아이콘을 열어 확인하세요.`:`긴급 항목 없음. AI 봇으로 CRM 현황을 분석할 수 있습니다.`;
  if(fab){fab.title=badgeText;fab.setAttribute("aria-label",badgeText);}
  if(caption)caption.textContent=urgent>0?`숫자 ${urgent} = 즉시 확인할 긴급 항목 수입니다. 클릭하면 목록과 원인을 확인할 수 있습니다.`:"현재 긴급 항목은 없습니다. 클릭하면 브리핑과 데이터 점검을 사용할 수 있습니다.";
  updateAiStatusUi();

  const box=document.getElementById("tn-ai-brief");if(!box)return;if(!items.length){box.hidden=true;box.classList.remove("has-urgent");return;}box.hidden=false;box.classList.toggle("has-urgent",urgent>0);
  document.getElementById("ai-brief-count").textContent=`긴급 ${urgent} · 주의 ${warn} · 제안 ${sum.info.length}`;
  const list=document.getElementById("ai-brief-list");list.innerHTML="";
  items.slice(0,6).forEach(a=>{const li=document.createElement("li"),b=document.createElement("span"),t=document.createElement("span");b.className="tn-ai-sev "+a.sev;b.textContent=AI_SEV_LABEL[a.sev];t.textContent=a.reasons[0]+(a.reasons.length>1?` 외 ${a.reasons.length-1}개 확인 사유`:"");li.appendChild(b);li.appendChild(t);li.addEventListener("click",()=>a.kind==="task"?openRoadmapModal(a.itemId):openDealDrawer(a.areaKey,a.itemId));list.appendChild(li);});
  document.getElementById("ai-brief-more").textContent=items.length>6?`외 ${items.length-6}건 — AI 봇에서 "긴급 알림" 또는 "이번 주 일정"을 확인하세요.`:"";
}


/* ---------- 캘린더·Google Calendar 연동 ---------- */
let calendarCursor = new Date();
calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
let googleCalendarAccessToken = "";
let googleCalendarTokenExpiresAt = 0;
let googleCalendarTokenClient = null;
let googleCalendarEvents = [];
let googleCalendarLoading = false;
let googleCalendarLoadedMonth = "";
let calendarEntries = [];
let editingCalendarEventId = "";

function validCalendarTime(value,fallback){
  const text=String(value||"");
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(text))return fallback;
  return text;
}
function normalizeCalendarEntry(raw){
  const item=raw&&typeof raw==="object"?raw:{};
  return {
    id:item.id||uid(),
    title:String(item.title||"").trim(),
    date:calendarDateKey(item.date)||todayStr(),
    allDay:item.allDay!==false,
    startTime:validCalendarTime(item.startTime,"09:00"),
    endTime:validCalendarTime(item.endTime,"10:00"),
    location:String(item.location||""),
    description:String(item.description||""),
    owner:String(item.owner||""),
    relatedAreaKey:String(item.relatedAreaKey||""),
    relatedDealId:String(item.relatedDealId||""),
    relatedTaskId:String(item.relatedTaskId||""),
    googleEventId:String(item.googleEventId||""),
    googleHtmlLink:String(item.googleHtmlLink||""),
    googlePayloadHash:String(item.googlePayloadHash||""),
    googleSyncedAt:String(item.googleSyncedAt||""),
    googleSyncPending:!!item.googleSyncPending,
    createdAt:item.createdAt||nowIso(),
    updatedAt:item.updatedAt||nowIso()
  };
}
function calendarRelatedDeal(item){
  if(!item.relatedDealId)return null;
  const deals=allDeals();
  const exact=deals.find(({area,item:deal})=>area.key===item.relatedAreaKey && deal.id===item.relatedDealId);
  if(exact)return exact;
  // 다른 그룹으로 이동한 항목도 ID가 유일하면 계속 참조한다.
  const matches=deals.filter(({item:deal})=>deal.id===item.relatedDealId);
  return matches.length===1?matches[0]:null;
}
function calendarRelatedTask(item){return roadmapData.find(task=>task.id===item.relatedTaskId)||null;}
function calendarWorkSummary(item){
  const parts=[];
  if(item.relatedDealId){
    const deal=calendarRelatedDeal(item);
    parts.push(deal?`파이프라인: ${deal.item.title||"제목 없는 항목"}`:"파이프라인: 연결된 항목을 찾을 수 없습니다");
  }
  if(item.relatedTaskId){
    const task=calendarRelatedTask(item);
    parts.push(task?`지원 업무: ${task.title||"제목 없는 업무"}`:"지원 업무: 연결된 업무를 찾을 수 없습니다");
  }
  return parts;
}
function readCalendarWorkSelection(){
  let pair=[];
  try{pair=JSON.parse(document.getElementById("calendar-event-deal").value||"[]");}catch(e){}
  const valid=Array.isArray(pair)&&pair.length===2&&pair.every(value=>typeof value==="string");
  return {
    relatedAreaKey:valid?pair[0]:"",
    relatedDealId:valid?pair[1]:"",
    relatedTaskId:document.getElementById("calendar-event-task").value
  };
}
function renderCalendarWorkPreview(){
  const selected=readCalendarWorkSelection();
  const deal=calendarRelatedDeal(selected),task=calendarRelatedTask(selected);
  const dealBox=document.getElementById("calendar-event-deal-preview");
  const taskBox=document.getElementById("calendar-event-task-preview");
  dealBox.hidden=!selected.relatedDealId;
  taskBox.hidden=!selected.relatedTaskId;
  dealBox.textContent=deal?[
    deal.item.title||"제목 없는 항목",
    `그룹: ${deal.area.title} · 단계: ${normalizeStage(deal.item.stage)}`,
    `담당자: ${deal.item.internalOwner||"미지정"} · 다음 연락일: ${deal.item.nextAction||"미지정"}`,
    `다음 할 일: ${deal.item.action||"미입력"}`
  ].join("\n"):"연결된 파이프라인 항목을 찾을 수 없습니다. 연결을 유지하거나 다른 항목을 선택할 수 있습니다.";
  taskBox.textContent=task?[
    task.title||"제목 없는 업무",
    `상태: ${task.status} · 담당자: ${effectiveSupportTaskOwner(task)||"미지정"}`,
    `마감일: ${task.dueDate||"미지정"}`,
    `다음 할 일: ${task.nextAction||task.deliverable||"미입력"}`
  ].join("\n"):"연결된 지원 업무를 찾을 수 없습니다. 연결을 유지하거나 다른 업무를 선택할 수 있습니다.";
}
function populateCalendarWorkFields(item={}){
  const dealSelect=document.getElementById("calendar-event-deal");
  const taskSelect=document.getElementById("calendar-event-task");
  function option(select,value,label){
    const el=document.createElement("option");el.value=value;el.textContent=label;select.appendChild(el);
  }
  dealSelect.replaceChildren();taskSelect.replaceChildren();
  option(dealSelect,"","연결 안 함");option(taskSelect,"","연결 안 함");
  allDeals().forEach(({area,item:deal})=>{
    option(dealSelect,JSON.stringify([area.key,deal.id]),`${area.title} / ${deal.title||"제목 없는 항목"} · ${deal.internalOwner||"담당자 미지정"}`);
  });
  roadmapData.forEach(task=>option(taskSelect,task.id,`${task.title||"제목 없는 업무"} · ${effectiveSupportTaskOwner(task)||"담당자 미지정"}`));
  if(item.relatedDealId){
    const found=calendarRelatedDeal(item);
    const value=JSON.stringify([found?found.area.key:item.relatedAreaKey||"",item.relatedDealId]);
    if(!found)option(dealSelect,value,"연결된 파이프라인 항목을 찾을 수 없습니다");
    dealSelect.value=value;
  }
  if(item.relatedTaskId){
    if(!calendarRelatedTask(item))option(taskSelect,item.relatedTaskId,"연결된 지원 업무를 찾을 수 없습니다");
    taskSelect.value=item.relatedTaskId;
  }
  const owners=document.getElementById("calendar-event-owner-options");
  owners.replaceChildren();
  const names=[item.owner,...calendarEntries.map(entry=>entry.owner),...allDeals().map(deal=>deal.item.internalOwner),...roadmapData.map(effectiveSupportTaskOwner)];
  [...new Set(names.map(value=>String(value||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko")).forEach(name=>option(owners,name,name));
  renderCalendarWorkPreview();
}
async function loadCalendarEntries(){
  const data=await storageGet("tinico:calendar:events");
  return Array.isArray(data)?data.map(normalizeCalendarEntry):[];
}
async function saveCalendarEntries(){await storageSet("tinico:calendar:events",calendarEntries);}
function calendarEntryDetail(item){
  const time=item.allDay?"종일":`종료 ${item.endTime}`;
  const description=String(item.description||"").replace(/\s+/g," ").trim();
  return [time,item.owner?`담당자: ${item.owner}`:"",...calendarWorkSummary(item),item.location,description].filter(Boolean).join(" · ");
}
function manualCalendarSourceEvents(){
  return calendarEntries.map(item=>({
    id:`manual:${item.id}`,sourceKey:`manual:${item.id}`,source:"manual",date:item.date,
    title:item.title||"제목 없는 일정",detail:calendarEntryDetail(item),timeText:item.allDay?"":item.startTime,
    calendarEntryId:item.id,googleId:item.googleEventId,htmlLink:item.googleHtmlLink
  }));
}
function calendarSourceLabel(source){
  return source==="crm"?"CRM 다음 연락일":source==="support"?"지원 업무 마감일":source==="manual"?"직접 등록 일정":"Google Calendar";
}
function calendarEventButtonText(event){return `${event.timeText?event.timeText+" ":""}${event.title}`;}

function calendarDateKey(value){
  if(!value) return "";
  if(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d=new Date(value); if(Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function calendarTimeKey(value){
  if(!value)return "";
  const d=new Date(value);if(Number.isNaN(d.getTime()))return "";
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function calendarNextDate(dateStr){
  const d=new Date(dateStr+"T12:00:00"); d.setDate(d.getDate()+1); return calendarDateKey(d);
}
function calendarSourceEvents(){
  const events=[];
  AREAS.forEach(area=>(stageData[area.key]||[]).forEach(item=>{
    if(!item.nextAction || isClosedStage(item.stage)) return;
    events.push({id:`deal:${area.key}:${item.id}`,sourceKey:`deal:${area.key}:${item.id}`,source:"crm",date:item.nextAction,title:item.title||"영업 항목",detail:item.action||"고객 후속 연락",areaKey:area.key,itemId:item.id});
  }));
  roadmapData.forEach(task=>{
    if(!task.dueDate || isSupportTaskDone(task)) return;
    events.push({id:`support:${task.id}`,sourceKey:`support:${task.id}`,source:"support",date:task.dueDate,title:task.title||"지원 업무",detail:task.nextAction||task.deliverable||"지원 업무 마감",taskId:task.id});
  });
  return events;
}
function combinedCalendarEvents(){
  const linkedGoogleIds=new Set(calendarEntries.map(item=>item.googleEventId).filter(Boolean));
  Object.values((appSettings.googleCalendar&&appSettings.googleCalendar.eventMap)||{}).forEach(saved=>{if(saved&&saved.eventId)linkedGoogleIds.add(saved.eventId);});
  const externalGoogleEvents=googleCalendarEvents.filter(event=>!linkedGoogleIds.has(event.googleId));
  return [...calendarSourceEvents(),...manualCalendarSourceEvents(),...externalGoogleEvents].filter(e=>e.date).sort((a,b)=>a.date.localeCompare(b.date)||(a.timeText||"").localeCompare(b.timeText||"")||a.title.localeCompare(b.title,"ko"));
}
function openCalendarEvent(event){
  if(event.source==="crm") openDealDrawer(event.areaKey,event.itemId);
  else if(event.source==="support") openRoadmapModal(event.taskId);
  else if(event.source==="manual") openCalendarEventModal(event.calendarEntryId);
  else if(event.htmlLink) window.open(event.htmlLink,"_blank","noopener");
}
function renderCalendar(){
  const grid=document.getElementById("calendar-grid"); if(!grid)return;
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  document.getElementById("calendar-month-label").textContent=`${y}년 ${m+1}월`;
  const all=combinedCalendarEvents();
  const byDate=new Map(); all.forEach(e=>{if(!byDate.has(e.date))byDate.set(e.date,[]);byDate.get(e.date).push(e);});
  grid.innerHTML="";
  ["일","월","화","수","목","금","토"].forEach(w=>{const el=document.createElement("div");el.className="tn-calendar-weekday";el.textContent=w;grid.appendChild(el);});
  const first=new Date(y,m,1), last=new Date(y,m+1,0), startOffset=first.getDay();
  const prevLast=new Date(y,m,0).getDate();
  const today=calendarDateKey(new Date());
  for(let cell=0;cell<42;cell++){
    let d, outside=false;
    if(cell<startOffset){d=new Date(y,m-1,prevLast-startOffset+cell+1);outside=true;}
    else if(cell>=startOffset+last.getDate()){d=new Date(y,m+1,cell-(startOffset+last.getDate())+1);outside=true;}
    else d=new Date(y,m,cell-startOffset+1);
    const key=calendarDateKey(d), day=document.createElement("div");
    day.className="tn-calendar-day"+(outside?" outside":"")+(key===today?" today":"");
    day.innerHTML=`<div class="tn-calendar-day-head"><div class="tn-calendar-daynum">${d.getDate()}</div><button class="tn-calendar-day-add" type="button" aria-label="${key} 일정 추가" title="${key} 일정 추가">+</button></div>`;
    day.querySelector(".tn-calendar-day-add").addEventListener("click",()=>openCalendarEventModal("",key));
    const items=byDate.get(key)||[];
    items.slice(0,3).forEach(ev=>{const btn=document.createElement("button");btn.type="button";btn.className=`tn-calendar-event ${ev.source}`;btn.textContent=calendarEventButtonText(ev);btn.title=`${ev.title}${ev.detail?" · "+ev.detail:""}`;btn.addEventListener("click",()=>openCalendarEvent(ev));day.appendChild(btn);});
    if(items.length>3){const more=document.createElement("div");more.className="tn-calendar-more";more.textContent=`+${items.length-3}개 더 있음`;day.appendChild(more);}
    grid.appendChild(day);
  }
  renderCalendarUpcoming(all);
  updateGoogleCalendarUi();
}
function renderCalendarUpcoming(events){
  const list=document.getElementById("calendar-upcoming-list"); if(!list)return;
  const today=calendarDateKey(new Date()), until=new Date();until.setDate(until.getDate()+45);const max=calendarDateKey(until);
  const rows=events.filter(e=>e.date>=today&&e.date<=max).slice(0,14);list.innerHTML="";
  if(!rows.length){list.innerHTML='<div class="tn-calendar-empty">앞으로 45일 안에 등록된 일정이 없습니다.<br>‘+ 일정 추가’를 누르거나 날짜의 + 버튼을 눌러 일정을 등록해 주세요.</div>';return;}
  rows.forEach(ev=>{const row=document.createElement("div");row.className="tn-calendar-list-item";const source=calendarSourceLabel(ev.source);row.innerHTML=`<div class="tn-calendar-list-date">${escapeHtml(ev.date)}${ev.timeText?" · "+escapeHtml(ev.timeText):""}</div><div class="tn-calendar-list-title">${escapeHtml(ev.title)}</div><div class="tn-calendar-list-source">${source}${ev.detail?" · "+escapeHtml(ev.detail):""}</div>`;row.addEventListener("click",()=>openCalendarEvent(ev));list.appendChild(row);});
}
function googleCalendarClientId(){return String(appSettings.googleCalendar&&appSettings.googleCalendar.clientId||"").trim();}
function googleCalendarEnvironmentReady(){return location.protocol==="https:" || location.hostname==="localhost" || location.hostname==="127.0.0.1";}
function googleCalendarTokenValid(){return !!googleCalendarAccessToken && Date.now()<googleCalendarTokenExpiresAt-30000;}
function googleCalendarPanelCollapsed(){return !!(appSettings.googleCalendar&&appSettings.googleCalendar.collapsed);}
function updateGoogleCalendarPanelUi(){
  const collapsed=googleCalendarPanelCollapsed(),panel=document.getElementById("google-calendar-panel"),details=document.getElementById("google-calendar-connect-details"),toggle=document.getElementById("google-calendar-toggle");
  if(panel)panel.classList.toggle("is-collapsed",collapsed);
  if(details)details.hidden=collapsed;
  if(toggle){toggle.textContent=collapsed?"펼치기":"접기";toggle.setAttribute("aria-expanded",String(!collapsed));toggle.title=collapsed?"Google Calendar 간편 동기화 설정 펼치기":"Google Calendar 간편 동기화 설정 접기";}
}
async function toggleGoogleCalendarPanel(){
  const previous=googleCalendarPanelCollapsed();
  appSettings.googleCalendar={...(appSettings.googleCalendar||{}),collapsed:!previous};
  updateGoogleCalendarPanelUi();
  try{await saveAppSettings();}
  catch(error){appSettings.googleCalendar={...(appSettings.googleCalendar||{}),collapsed:previous};updateGoogleCalendarPanelUi();console.error("Google Calendar 패널 상태 저장 실패",error);}
}
function setGoogleCalendarStatus(message,state=""){
  const el=document.getElementById("google-calendar-status");if(!el)return;el.textContent=message;el.className="tn-calendar-status"+(state?" "+state:"");
}
function setGoogleCalendarResult(message,isError=false){const el=document.getElementById("google-calendar-sync-result");if(el){el.textContent=message||"";el.style.color=isError?"#B91C1C":"var(--ink-700)";}}
function updateGoogleCalendarUi(){
  updateGoogleCalendarPanelUi();
  const input=document.getElementById("google-calendar-client-id");if(input && document.activeElement!==input)input.value=googleCalendarClientId();
  const connected=googleCalendarTokenValid();
  const connect=document.getElementById("google-calendar-connect"),disconnect=document.getElementById("google-calendar-disconnect");
  if(connect)connect.textContent=connected?"권한 다시 받기":"Google 계정 연결";
  if(disconnect)disconnect.hidden=!connected;
  const refresh=document.getElementById("google-calendar-refresh");
  if(refresh)refresh.disabled=!connected;
  setGoogleCalendarStatus(connected?"Google Calendar 연결됨":"연결 안 됨",connected?"connected":"");
  const note=document.getElementById("google-calendar-origin-note");
  if(note&&!googleCalendarEnvironmentReady()) note.innerHTML='<b style="color:#B91C1C">현재 파일 직접 실행 환경에서는 Google 로그인이 제한됩니다.</b> CRM을 HTTPS 웹주소 또는 localhost에서 열고 그 주소를 Google Cloud의 승인된 JavaScript 원본에 등록해 주세요.';
  const eventOverlay=document.getElementById("calendar-event-overlay");if(eventOverlay&&!eventOverlay.hidden)updateCalendarEventSyncState();
}
function loadGoogleIdentity(){
  if(window.google&&google.accounts&&google.accounts.oauth2)return Promise.resolve();
  return new Promise((resolve,reject)=>{let count=0;const timer=setInterval(()=>{count++;if(window.google&&google.accounts&&google.accounts.oauth2){clearInterval(timer);resolve();}else if(count>50){clearInterval(timer);reject(new Error("Google 로그인 라이브러리를 불러오지 못했습니다."));}},100);});
}
async function initializeGoogleTokenClient(){
  const clientId=googleCalendarClientId();if(!clientId)throw new Error("Google OAuth 웹 클라이언트 ID를 먼저 입력하고 저장해 주세요.");
  if(!googleCalendarEnvironmentReady())throw new Error("Google 계정 연결은 HTTPS 웹주소 또는 localhost에서만 사용할 수 있습니다.");
  await loadGoogleIdentity();
  googleCalendarTokenClient=google.accounts.oauth2.initTokenClient({
    client_id:clientId,
    scope:"https://www.googleapis.com/auth/calendar.events.owned",
    callback:()=>{},
    /* 로그인 팝업이 닫히거나 차단되면 "승인 대기 중" 상태로 영원히 멈추지 않게 안내 */
    error_callback:(err)=>{
      setGoogleCalendarStatus("연결 실패","error");
      setGoogleCalendarResult("Google 로그인 창이 닫혔거나 차단되었습니다. 팝업 허용 후 다시 시도해 주세요."+(err&&err.type?` (${err.type})`:""),true);
    }
  });
}
async function connectGoogleCalendar(){
  try{
    await initializeGoogleTokenClient();setGoogleCalendarResult("Google 계정 선택과 권한 승인을 기다리는 중입니다.");
    googleCalendarTokenClient.callback=async response=>{
      if(response.error){setGoogleCalendarStatus("연결 실패","error");setGoogleCalendarResult(`Google 연결 실패: ${response.error}`,true);return;}
      googleCalendarAccessToken=response.access_token||"";googleCalendarTokenExpiresAt=Date.now()+(Number(response.expires_in)||3600)*1000;googleCalendarLoadedMonth="";updateGoogleCalendarUi();setGoogleCalendarResult("Google Calendar가 연결되었습니다. 선택한 달의 일정을 불러옵니다.");await loadGoogleCalendarEvents(true,true);
    };
    googleCalendarTokenClient.requestAccessToken({prompt:googleCalendarAccessToken?"":"consent"});
  }catch(e){setGoogleCalendarStatus("연결 불가","error");setGoogleCalendarResult(e.message||String(e),true);}
}
function disconnectGoogleCalendar(){
  const token=googleCalendarAccessToken;googleCalendarAccessToken="";googleCalendarTokenExpiresAt=0;googleCalendarEvents=[];googleCalendarLoadedMonth="";
  if(token&&window.google&&google.accounts&&google.accounts.oauth2)google.accounts.oauth2.revoke(token,()=>{});
  updateGoogleCalendarUi();renderCalendar();setGoogleCalendarResult("이 브라우저의 Google 연결을 해제했습니다. CRM과 Google에 저장된 일정은 삭제되지 않습니다.");
}
async function googleCalendarRequest(path,options={}){
  if(!googleCalendarTokenValid())throw new Error("Google 연결 시간이 만료되었습니다. Google 계정 연결 버튼을 다시 눌러 주세요.");
  const res=await fetch("https://www.googleapis.com/calendar/v3"+path,{...options,headers:{"Authorization":"Bearer "+googleCalendarAccessToken,"Content-Type":"application/json",...(options.headers||{})}});
  let data=null;try{data=await res.json();}catch(e){}
  if(!res.ok){const error=new Error((data&&data.error&&data.error.message)||`Google Calendar 요청 실패 (${res.status})`);error.status=res.status;throw error;}
  return data;
}
async function loadGoogleCalendarEvents(showMessage=true,force=false){
  const monthKey=`${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth()+1).padStart(2,"0")}`;
  if(googleCalendarLoading||!googleCalendarTokenValid()||(!force&&googleCalendarLoadedMonth===monthKey))return;
  googleCalendarLoading=true;if(showMessage)setGoogleCalendarResult("Google 일정을 불러오는 중입니다.");
  try{
    const start=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1);const end=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);
    const qs=new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:"true",orderBy:"startTime",maxResults:"250"});
    const data=await googleCalendarRequest(`/calendars/primary/events?${qs}`);
    /* 로딩 중 사용자가 다른 달로 이동했으면 이전 달 응답을 현재 화면에 씌우지 않고 새로 불러옴 */
    const currentKey=`${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth()+1).padStart(2,"0")}`;
    if(currentKey!==monthKey){
      googleCalendarLoading=false;
      return loadGoogleCalendarEvents(showMessage,true);
    }
    googleCalendarEvents=(data.items||[]).filter(x=>x.status!=="cancelled").map(x=>{const startValue=(x.start&&(x.start.dateTime||x.start.date))||"";return {id:"google:"+x.id,source:"google",date:calendarDateKey(startValue),timeText:x.start&&x.start.dateTime?calendarTimeKey(x.start.dateTime):"",title:x.summary||"제목 없는 Google 일정",detail:[x.location,String(x.description||"").replace(/\s+/g," ").trim()].filter(Boolean).join(" · "),htmlLink:x.htmlLink||"",googleId:x.id};}).filter(x=>x.date);
    googleCalendarLoadedMonth=monthKey;if(showMessage)setGoogleCalendarResult(`Google 일정 ${googleCalendarEvents.length}건을 불러왔습니다. 자동 반복 조회 없이 이 달의 결과를 재사용합니다.`);renderCalendar();
  }catch(e){
    googleCalendarLoadedMonth="";
    /* Google은 만료·회수된 토큰에 상태 401을 반환하므로 메시지 문구가 아닌 상태 코드로 판정 */
    if(e.status===401||/만료|401/.test(e.message||"")){googleCalendarAccessToken="";googleCalendarTokenExpiresAt=0;}
    setGoogleCalendarStatus("불러오기 실패","error");setGoogleCalendarResult(e.message||String(e),true);updateGoogleCalendarUi();
  }
  finally{googleCalendarLoading=false;}
}
function googlePayloadHash(payload){return JSON.stringify([payload.summary,payload.description||"",payload.location||"",payload.start.date||payload.start.dateTime||"",payload.end.date||payload.end.dateTime||""]);}
function calendarEntryGooglePayload(item){
  const description=[item.description,"HLB-BUSISUP CRM 직접 등록 일정",`원본 키: manual:${item.id}`].filter(Boolean).join("\n\n");
  const payload={summary:item.title,description,location:item.location||"",extendedProperties:{private:{tinikoCrmKey:`manual:${item.id}`,tinikoCrmType:"manual"}}};
  if(item.allDay){
    payload.start={date:item.date};payload.end={date:calendarNextDate(item.date)};
  }else{
    const start=new Date(`${item.date}T${item.startTime}:00`),end=new Date(`${item.date}T${item.endTime}:00`);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)throw new Error("종료 시간은 시작 시간보다 늦게 입력해 주세요.");
    payload.start={dateTime:start.toISOString()};payload.end={dateTime:end.toISOString()};
  }
  return payload;
}
async function syncManualCalendarEventToGoogle(item){
  if(!googleCalendarTokenValid())throw new Error("Google 연결 시간이 만료되었습니다. Google 계정 연결 버튼을 다시 눌러 주세요.");
  if(item.googleEventId)return "skipped";
  const payload=calendarEntryGooglePayload(item),hash=googlePayloadHash(payload);
  const result=await googleCalendarRequest('/calendars/primary/events',{method:"POST",body:JSON.stringify(payload)});
  item.googleEventId=String((result&&result.id)||item.googleEventId||"");
  item.googleHtmlLink=String((result&&result.htmlLink)||item.googleHtmlLink||"");
  item.googlePayloadHash=hash;item.googleSyncedAt=nowIso();item.googleSyncPending=false;
  return "created";
}
function toggleCalendarEventTimeFields(){
  const allDay=document.getElementById("calendar-event-all-day").checked;
  document.getElementById("calendar-event-time-row").hidden=allDay;
}
function updateCalendarEventSyncState(){
  const box=document.getElementById("calendar-event-sync-state");if(!box)return;
  const item=calendarEntries.find(x=>x.id===editingCalendarEventId),connected=googleCalendarTokenValid();
  box.classList.toggle("connected",connected);
  if(item&&item.googleEventId)box.textContent="Google Calendar에 한 번 등록된 일정입니다. 무료 최소 동기화 모드에서는 이후 CRM 수정·삭제가 Google 원본에 자동 반영되지 않습니다.";
  else if(connected)box.textContent="Google Calendar가 연결되어 있습니다. 이 일정을 처음 저장하면 Google 기본 캘린더에 한 번 생성됩니다.";
  else box.textContent="현재 Google 연결이 해제되어 있어 CRM에만 저장됩니다. 연결 후 이 일정을 다시 저장하면 Google에 한 번 등록할 수 있습니다.";
}
let calendarEditorSeed=null,calendarEditorExpected=null;
function openCalendarEventModal(id="",presetDate=""){
  if(document.getElementById("calendar-event-save").disabled)return;
  editingCalendarEventId=id||"";
  const item=id?calendarEntries.find(x=>x.id===id):null;
  calendarEditorSeed={id:item?.id||uid(),createdAt:item?.createdAt||nowIso()};
  const base=storageSnapshots.get("tinico:calendar:events");calendarEditorExpected={id:calendarEditorSeed.id,version:base?.versions?.[calendarEditorSeed.id]??null,generation:base?.generation,original:deepCopy(item||{})};
  const date=presetDate||item?.date||calendarDateKey(new Date());
  document.getElementById("calendar-event-modal-title").textContent=item?"일정 수정":"새 일정";
  document.getElementById("calendar-event-title").value=item?.title||"";
  document.getElementById("calendar-event-date").value=date;
  document.getElementById("calendar-event-all-day").checked=item?item.allDay:true;
  document.getElementById("calendar-event-start-time").value=item?.startTime||"09:00";
  document.getElementById("calendar-event-end-time").value=item?.endTime||"10:00";
  document.getElementById("calendar-event-location").value=item?.location||"";
  document.getElementById("calendar-event-description").value=item?.description||"";
  document.getElementById("calendar-event-owner").value=item?.owner||"";
  populateCalendarWorkFields(item||{});
  document.getElementById("calendar-event-delete").hidden=!item;
  document.getElementById("calendar-event-overlay").hidden=false;
  toggleCalendarEventTimeFields();updateCalendarEventSyncState();
  setTimeout(()=>document.getElementById("calendar-event-title").focus(),30);
}
function closeCalendarEventModal(force=false){if(!force&&document.getElementById("calendar-event-save").disabled)return;document.getElementById("calendar-event-overlay").hidden=true;editingCalendarEventId="";}
async function saveCalendarEventModal(){
  if(document.getElementById("calendar-event-save").disabled)return;
  const title=document.getElementById("calendar-event-title").value.trim(),date=document.getElementById("calendar-event-date").value;
  const allDay=document.getElementById("calendar-event-all-day").checked,startTime=document.getElementById("calendar-event-start-time").value,endTime=document.getElementById("calendar-event-end-time").value;
  if(!title){showToast("일정 제목을 입력해 주세요.");document.getElementById("calendar-event-title").focus();return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){showToast("일정 날짜를 입력해 주세요.");return;}
  if(!allDay&&(!validCalendarTime(startTime,"")||!validCalendarTime(endTime,"")||endTime<=startTime)){showToast("종료 시간은 시작 시간보다 늦게 입력해 주세요.");return;}
  const button=document.getElementById("calendar-event-save"),originalText=button.textContent;button.disabled=true;button.textContent="저장 중...";
  const previousEntries=deepCopy(calendarEntries),previousEditingId=editingCalendarEventId;
  try{
    let item=calendarEntries.find(x=>x.id===editingCalendarEventId);
    if(!item){item=normalizeCalendarEntry(calendarEditorSeed);calendarEntries.push(item);editingCalendarEventId=item.id;}
    Object.assign(item,{title,date,allDay,startTime:validCalendarTime(startTime,"09:00"),endTime:validCalendarTime(endTime,"10:00"),location:document.getElementById("calendar-event-location").value.trim(),description:document.getElementById("calendar-event-description").value.trim(),googleSyncPending:true,updatedAt:nowIso()});
    Object.assign(item,{owner:document.getElementById("calendar-event-owner").value.trim(),...readCalendarWorkSelection()});
    try{
      await storageSet("tinico:calendar:events",calendarEntries,calendarEditorExpected);
    }catch(error){
      calendarEntries=previousEntries.map(normalizeCalendarEntry);editingCalendarEventId=previousEditingId;renderCalendar();updateCalendarEventSyncState();
      const message=`일정을 저장하지 못했습니다: ${error.message||error}`;setGoogleCalendarResult(message,true);showToast(message);return;
    }
    item=calendarEntries.find(entry=>entry.id===item.id);
    closeCalendarEventModal(true);if(!item)return;
    calendarCursor=new Date(Number(date.slice(0,4)),Number(date.slice(5,7))-1,1);renderCalendar();
    try{
      if(googleCalendarTokenValid()&&!item.googleEventId){await syncManualCalendarEventToGoogle(item);await saveCalendarEntries();googleCalendarLoadedMonth="";setGoogleCalendarResult(`‘${item.title}’ 일정을 CRM에 저장하고 Google Calendar에 한 번 등록했습니다.`);}
      else if(item.googleEventId)setGoogleCalendarResult(`‘${item.title}’ 일정을 CRM에 저장했습니다. 이미 등록된 Google 일정은 자동 수정하지 않습니다.`);
      else setGoogleCalendarResult(`‘${item.title}’ 일정을 CRM에 저장했습니다. Google 연결 상태에서 다시 저장하면 Google에 한 번 등록됩니다.`);
    }catch(error){
      item.googleSyncPending=true;
      try{await saveCalendarEntries();}catch(saveError){console.error("Google 동기화 상태 저장 실패",saveError);}
      if(error.status===401){googleCalendarAccessToken="";googleCalendarTokenExpiresAt=0;updateGoogleCalendarUi();}
      setGoogleCalendarResult(`CRM에는 저장했지만 Google Calendar 반영에 실패했습니다: ${error.message||error}`,true);
    }
    /* 저장한 일정의 달로 이동하므로 이전 달 Google 일정이 새 달 화면에 남지 않게 비움 (추가 API 호출 없이, 재조회는 월 이동·새로고침 시) */
    googleCalendarEvents=[];googleCalendarLoadedMonth="";
  }
  finally{button.disabled=false;button.textContent=originalText;renderCalendar();}
}
async function deleteCalendarEventModal(){
  const item=calendarEntries.find(x=>x.id===editingCalendarEventId);if(!item)return;
  const linked=!!item.googleEventId;
  const question=linked?`‘${item.title}’ 일정을 CRM에서 삭제할까요? Google Calendar에 등록된 원본은 남아 있으므로 필요하면 Google Calendar에서 직접 삭제해야 합니다.`:`‘${item.title}’ 일정을 삭제할까요?`;
  if(!confirm(question))return;
  const button=document.getElementById("calendar-event-delete"),originalText=button.textContent,previousEntries=deepCopy(calendarEntries);button.disabled=true;button.textContent="삭제 중...";
  try{
    calendarEntries=calendarEntries.filter(x=>x.id!==item.id);
    try{await saveCalendarEntries();}
    catch(error){calendarEntries=previousEntries.map(normalizeCalendarEntry);const message=`일정을 삭제하지 못했습니다: ${error.message||error}`;setGoogleCalendarResult(message,true);showToast(message);return;}
    closeCalendarEventModal();renderCalendar();setGoogleCalendarResult(linked?`‘${item.title}’ 일정을 CRM에서 삭제했습니다. Google 원본은 유지됩니다.`:`‘${item.title}’ 일정을 CRM에서 삭제했습니다.`);
  }finally{
    button.disabled=false;button.textContent=originalText;
  }
}
function currentGoogleCalendarOrigin(){return googleCalendarEnvironmentReady()?location.origin:"HTTPS 또는 localhost에서 CRM을 연 뒤 다시 확인하세요.";}
function openGoogleCalendarHelp(){document.getElementById("google-calendar-current-origin").textContent=currentGoogleCalendarOrigin();document.getElementById("google-calendar-help-overlay").hidden=false;}
function closeGoogleCalendarHelp(){document.getElementById("google-calendar-help-overlay").hidden=true;}
async function copyGoogleCalendarOrigin(){
  const value=currentGoogleCalendarOrigin();
  if(!googleCalendarEnvironmentReady()){showToast(value);return;}
  try{await navigator.clipboard.writeText(value);document.getElementById("google-calendar-copy-origin").textContent="복사됨";setTimeout(()=>document.getElementById("google-calendar-copy-origin").textContent="현재 주소 복사",1200);}
  catch(e){prompt("아래 주소를 복사해 승인된 JavaScript 원본에 등록하세요.",value);}
}
async function saveGoogleCalendarClientId(){
  const value=document.getElementById("google-calendar-client-id").value.trim();
  if(value&&!/\.apps\.googleusercontent\.com$/.test(value)){setGoogleCalendarResult("클라이언트 ID 형식을 확인해 주세요. 일반적으로 .apps.googleusercontent.com으로 끝납니다.",true);return;}
  const previousAppSettings=appSettings,previousCalendarEntries=calendarEntries;
  const changed=value!==googleCalendarClientId(),eventMap=(appSettings.googleCalendar&&appSettings.googleCalendar.eventMap)||{};appSettings.googleCalendar={...(appSettings.googleCalendar||{}),clientId:value,eventMap};
  const previousSettings=deepCopy(previousAppSettings),previousEntries=deepCopy(previousCalendarEntries);
  if(changed){Object.values(eventMap).forEach(saved=>{if(saved)saved.hash="";});calendarEntries.forEach(item=>{item.googleSyncPending=true;});}
  const entries=[{key:"tinico:app:settings",value:appSettings}];
  if(changed)entries.push({key:"tinico:calendar:events",value:calendarEntries});
  if(!await saveOrRollback(()=>storageTransaction(entries),()=>{appSettings=previousSettings;calendarEntries.splice(0,calendarEntries.length,...previousEntries);},"Google 클라이언트 ID 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.")){updateGoogleCalendarUi();renderCalendar();return;}
  googleCalendarAccessToken="";googleCalendarTokenExpiresAt=0;googleCalendarTokenClient=null;googleCalendarEvents=[];googleCalendarLoadedMonth="";updateGoogleCalendarUi();renderCalendar();setGoogleCalendarResult(value?"클라이언트 ID를 저장했습니다. Google 계정 연결을 눌러 주세요.":"클라이언트 ID를 삭제했습니다.");
}
function initializeCalendarUi(){
  /* Google 설정 요소가 없어도 캘린더 핵심 기능(월 이동·일정 추가·저장)은 항상 초기화되게 분리 */
  const input=document.getElementById("google-calendar-client-id");
  if(input){
    input.value=googleCalendarClientId();
    updateGoogleCalendarPanelUi();
    document.getElementById("google-calendar-toggle")?.addEventListener("click",toggleGoogleCalendarPanel);
    document.getElementById("google-calendar-save-client")?.addEventListener("click",saveGoogleCalendarClientId);
    document.getElementById("google-calendar-client-help")?.addEventListener("click",openGoogleCalendarHelp);
    document.getElementById("google-calendar-connect")?.addEventListener("click",connectGoogleCalendar);
    document.getElementById("google-calendar-disconnect")?.addEventListener("click",disconnectGoogleCalendar);
    document.getElementById("google-calendar-refresh")?.addEventListener("click",()=>loadGoogleCalendarEvents(true,true));
  }
  document.getElementById("calendar-prev").addEventListener("click",()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);googleCalendarEvents=[];googleCalendarLoadedMonth="";renderCalendar();if(googleCalendarTokenValid())loadGoogleCalendarEvents(false,false);});
  document.getElementById("calendar-next").addEventListener("click",()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);googleCalendarEvents=[];googleCalendarLoadedMonth="";renderCalendar();if(googleCalendarTokenValid())loadGoogleCalendarEvents(false,false);});
  document.getElementById("calendar-today").addEventListener("click",()=>{const d=new Date();calendarCursor=new Date(d.getFullYear(),d.getMonth(),1);googleCalendarEvents=[];googleCalendarLoadedMonth="";renderCalendar();if(googleCalendarTokenValid())loadGoogleCalendarEvents(false,false);});
  document.getElementById("calendar-add").addEventListener("click",()=>openCalendarEventModal("",calendarDateKey(new Date())));
  document.getElementById("calendar-event-all-day").addEventListener("change",toggleCalendarEventTimeFields);
  document.getElementById("calendar-event-deal").addEventListener("change",renderCalendarWorkPreview);
  document.getElementById("calendar-event-task").addEventListener("change",renderCalendarWorkPreview);
  document.getElementById("calendar-event-cancel").addEventListener("click",closeCalendarEventModal);
  document.getElementById("calendar-event-save").addEventListener("click",saveCalendarEventModal);
  document.getElementById("calendar-event-delete").addEventListener("click",deleteCalendarEventModal);
  document.getElementById("calendar-event-overlay").addEventListener("click",e=>{if(e.target.id==="calendar-event-overlay")closeCalendarEventModal();});
  document.getElementById("google-calendar-help-close").addEventListener("click",closeGoogleCalendarHelp);
  document.getElementById("google-calendar-help-overlay").addEventListener("click",e=>{if(e.target.id==="google-calendar-help-overlay")closeGoogleCalendarHelp();});
  document.getElementById("google-calendar-copy-origin").addEventListener("click",copyGoogleCalendarOrigin);
  document.getElementById("google-calendar-open-console").addEventListener("click",()=>window.open("https://console.cloud.google.com/apis/credentials","_blank","noopener"));
  document.getElementById("google-calendar-open-docs").addEventListener("click",()=>window.open("https://developers.google.com/workspace/calendar/api/quickstart/js","_blank","noopener"));
  document.getElementById("google-calendar-open-quota").addEventListener("click",()=>window.open("https://developers.google.com/workspace/calendar/api/guides/quota","_blank","noopener"));
  renderCalendar();
}

/* ---------- 대시보드 ---------- */

let kpiReturnFocus=null;
function closeKpiDetails(){
  document.getElementById("kpi-overlay").hidden=true;
  if(kpiReturnFocus?.isConnected)kpiReturnFocus.focus();
}
function openKpiDetails(kind,trigger){
  const deals=allDeals(),closed=deals.filter(d=>isClosedStage(d.stage));
  const active=deals.filter(d=>!isClosedStage(d.stage));
  let title,summary,rows;
  if(kind==="win"){
    const won=closed.filter(d=>d.stage==="수주").length;
    title="수주율";summary=`수주 ${won}건 / 종료 항목 ${closed.length}건 · 수주·보류·실주 항목을 표시합니다.`;
    rows=closed.slice().sort((a,b)=>Number(b.stage==="수주")-Number(a.stage==="수주"));
  }else if(kind==="active"){
    title="활성 항목 비중";summary=`활성 ${active.length}건 / 전체 ${deals.length}건 · 수주·보류·실주를 제외한 항목입니다.`;rows=active;
  }else if(kind==="overdue"){
    rows=active.filter(d=>{const days=daysUntil(d.item.nextAction);return days!==null&&days<0;})
      .sort((a,b)=>a.item.nextAction.localeCompare(b.item.nextAction));
    title="후속조치 지연";summary=`지연 ${rows.length}건 / 활성 ${active.length}건 · 다음 연락일이 오늘보다 이전인 항목입니다.`;
  }else if(kind==="tasks"){
    title="실행과제 완료";summary=`완료 ${roadmapData.filter(isSupportTaskDone).length}건 / 전체 ${roadmapData.length}건 · 완료 여부를 비교할 수 있도록 모든 실행과제를 표시합니다.`;
    rows=roadmapData.slice().sort((a,b)=>Number(isSupportTaskDone(b))-Number(isSupportTaskDone(a))).map(task=>({task}));
  }else return;
  const overlay=document.getElementById("kpi-overlay"),list=document.getElementById("kpi-modal-list");
  document.getElementById("kpi-modal-title").textContent=title;
  document.getElementById("kpi-modal-summary").textContent=summary+" 항목을 누르면 상세 화면으로 이동합니다.";
  list.replaceChildren();
  if(!rows.length){const empty=document.createElement("p");empty.className="tn-empty-compact";empty.textContent="해당하는 항목이 없습니다.";list.appendChild(empty);}
  rows.forEach(({area,item,stage,task})=>{
    const button=document.createElement("button");button.type="button";button.className="tn-kpi-list-item";
    const name=task?.title||item?.title||"제목 없음",status=task?.status||stage;
    const owner=task?effectiveSupportTaskOwner(task):item.internalOwner;
    const meta=task?`지원 업무 · 담당 ${owner||"미지정"} · ${supportTaskDueText(task)}`:`${area.title} · 담당 ${owner||"미지정"} · 다음 연락 ${item.nextAction||"미정"}`;
    button.innerHTML=`<span class="tn-kpi-item-main"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(meta)}</span>${item?.action?`<span>다음 할 일: ${escapeHtml(item.action)}</span>`:""}</span><span class="tn-kpi-item-status">${escapeHtml(status||"미지정")} →</span>`;
    button.addEventListener("click",()=>{
      if(task){
        if(!roadmapData.some(t=>t.id===task.id)){showToast("해당 실행과제가 삭제되었습니다.");openKpiDetails(kind,trigger);return;}
        closeKpiDetails();showView("roadmap");openRoadmapModal(task.id);
      }else{
        if(!findDeal(area.key,item.id)){showToast("해당 항목이 이동되었거나 삭제되었습니다.");openKpiDetails(kind,trigger);return;}
        if(!openDealDrawer(area.key,item.id))return;
        closeKpiDetails();showView("pipeline");
        document.querySelector('#deal-drawer-body [data-f="title"]')?.focus();
      }
    });list.appendChild(button);
  });
  kpiReturnFocus=trigger;overlay.hidden=false;document.getElementById("kpi-modal-close").focus();
}

function renderHome(){
  applyDashboardOrder();
  applyDashboardCollapse();
  const allStageItems = Object.values(stageData).flat();
  const total = allStageItems.length;
  const stageCounts = {};
  STAGE_OPTIONS.forEach(s=>stageCounts[s] = 0);
  allStageItems.forEach(i=>{ const s = normalizeStage(i.stage); stageCounts[s] = (stageCounts[s]||0)+1; });

  let pipelineAmount = 0, weightedAmount = 0, wonAmount = 0;
  allStageItems.forEach(i=>{
    const amt = parseFloat(i.amount) || 0;
    const prob = Math.min(100, Math.max(0, parseFloat(i.prob) || 0));
    const s = normalizeStage(i.stage);
    if(s === "수주"){ wonAmount += amt; }
    else if(!isClosedStage(s)){ pipelineAmount += amt; weightedAmount += amt * prob / 100; }
  });

  const doneRoadmap = roadmapData.filter(isSupportTaskDone).length;

  const summaryEl = document.getElementById("tn-summary");
  summaryEl.innerHTML = "";
  [
    {label:"관리 항목", value: total, note:"등록 항목 수"},
    {label:"파이프라인 금액", value: fmtAmount(Math.round(pipelineAmount)), note:"활성 항목 예상 매출 합계"},
    {label:"가중 예상 매출", value: fmtAmount(Math.round(weightedAmount)), note:"금액 × 성사확률"},
    {label:"연락처", value: contactsData.length + "명", note:"등록된 고객 연락처"},
  ].forEach(t=>{
    const div = document.createElement("div");
    div.className = "tn-summary-tile";
    div.innerHTML = `<div class="tn-summary-label">${t.label}</div><div class="tn-summary-value">${t.value}</div><div class="tn-summary-note">${t.note}</div>`;
    summaryEl.appendChild(div);
  });

  const bucketSummaryEl = document.getElementById("tn-bucket-summary");
  if(bucketSummaryEl){
    bucketSummaryEl.innerHTML = "";
    BUCKET_ORDER.forEach(key=>{
      const meta = REVENUE_BUCKETS[key];
      const items = AREAS.flatMap(a=>(stageData[a.key] || [])
        .filter(item=>itemBucketKey(item, a) === key)
        .map(item=>({area:a,item})));
      const groupKeys = new Set(items.map(({area})=>area.key));
      const activeItems = items.filter(({item})=>!isClosedStage(item.stage));
      const amount = activeItems.reduce((sum,{item})=>sum + (parseFloat(item.amount)||0), 0);
      const div = document.createElement("div");
      div.className = "tn-bucket-summary-card";
      div.innerHTML = `
        <div class="tn-bucket-summary-top">
          <div class="tn-bucket-summary-title">${escapeHtml(meta.label)}</div>
          ${bucketChipForKey(key, "mini")}
        </div>
        <div class="tn-bucket-summary-desc">${escapeHtml(meta.desc)}</div>
        <div class="tn-bucket-summary-stat">그룹 <b>${groupKeys.size}</b>개 · 항목 <b>${items.length}</b>건 · 활성금액 <b>${fmtAmount(Math.round(amount))}</b></div>
      `;
      bucketSummaryEl.appendChild(div);
    });
  }

  renderAiBrief();
  renderTodayTasks();

  const navEl = document.getElementById("tn-navgrid");
  navEl.innerHTML = "";
  const groupSummary=document.getElementById("tn-groups-summary");if(groupSummary)groupSummary.textContent=`관리 그룹 ${AREAS.length}개 · 영업 항목 ${total}건`;
  AREAS.forEach(area=>{
    const items = stageData[area.key] || [];
    const c = {};
    STAGE_OPTIONS.forEach(s=>c[s] = 0);
    let areaAmt = 0;
    items.forEach(i=>{
      const s = normalizeStage(i.stage);
      c[s] = (c[s]||0)+1;
      if(!isClosedStage(s) || s === "수주") areaAmt += parseFloat(i.amount) || 0;
    });
    const btn = document.createElement("div");
    btn.className = "tn-navcard";
    btn.innerHTML = `
      <div class="tn-navcard-top">
        <span class="tn-dot" style="background:${safeCssColor(area.color)};"></span>
        <div>
          <div class="tn-navcard-title">${escapeHtml(area.title)}</div>
          <div class="tn-navcard-sub">${escapeHtml(area.subtitle)}</div>
        </div>
      </div>
      <div class="tn-navcard-stats">
        <span>항목 <b>${items.length}</b></span>
        <span>협상 <b>${c["협상"]}</b></span>
        <span>수주 <b>${c["수주"]}</b></span>
        <span>금액 <b>${fmtAmount(Math.round(areaAmt))}</b></span>
      </div>
    `;
    btn.addEventListener("click", ()=>showView(area.key));
    navEl.appendChild(btn);
  });

  /* KPI */
  const activeDeals = allStageItems.filter(i=>!isClosedStage(i.stage)).length;
  const closedPool = allStageItems.filter(i=>isClosedStage(i.stage)).length;
  const winRate = closedPool ? Math.round((stageCounts["수주"]/closedPool)*100) : 0;
  let overdueCount = 0;
  allStageItems.forEach(i=>{
    const s = normalizeStage(i.stage);
    if(isClosedStage(s) || !i.nextAction) return;
    const dd = daysUntil(i.nextAction);
    if(dd !== null && dd < 0) overdueCount++;
  });
  const roadmapRate = roadmapData.length ? Math.round((doneRoadmap/roadmapData.length)*100) : 0;
  const activeRate = total ? Math.round((activeDeals/total)*100) : 0;

  const kpiEl = document.getElementById("tn-kpis");
  kpiEl.innerHTML = "";
  [
    {key:"win",label:"수주율", value:`${winRate}%`, r:winRate, color:"var(--ok-500)"},
    {key:"active",label:"활성 항목 비중", value:`${activeDeals}건 (${activeRate}%)`, r:activeRate, color:"var(--warn-500)"},
    {key:"overdue",label:"후속조치 지연", value:`${overdueCount}건`, r: activeDeals ? Math.round((overdueCount/activeDeals)*100) : 0, color:"var(--danger-500)"},
    {key:"tasks",label:"실행과제 완료", value:`${roadmapRate}%`, r:roadmapRate, color:"var(--ink-500)"},
  ].forEach(k=>{
    const div = document.createElement("button");
    div.type="button";div.dataset.kpi=k.key;div.setAttribute("aria-haspopup","dialog");
    div.setAttribute("aria-label",`${k.label} ${k.value} · 항목 목록 보기`);
    div.addEventListener("click",()=>openKpiDetails(k.key,div));
    div.className = "tn-kpi" + (k.label === "후속조치 지연" && overdueCount > 0 ? " urgent-kpi" : "");
    div.innerHTML = `<div class="tn-kpi-label">${k.label}</div><div class="tn-kpi-value">${k.value}</div>
      <div class="tn-kpi-bar"><div class="tn-kpi-bar-fill" style="width:${k.r}%;background:${k.color};"></div></div>`;
    kpiEl.appendChild(div);
  });

  /* 단계별 퍼널 */
  const funnelEl = document.getElementById("tn-funnel");
  funnelEl.innerHTML = "";
  const maxCount = Math.max(1, ...STAGE_OPTIONS.map(s=>stageCounts[s]));
  STAGE_OPTIONS.forEach(s=>{
    const n = stageCounts[s];
    const pct = total ? Math.round((n/total)*100) : 0;
    const row = document.createElement("div");
    row.className = "tn-funnel-row";
    row.innerHTML = `
      <div class="tn-funnel-label">${escapeHtml(s)}</div>
      <div class="tn-funnel-track"><div class="tn-funnel-fill" style="width:${Math.round((n/maxCount)*100)}%;background:${safeCssColor(STAGE_COLORS[s])};">${n > 0 ? n + "건" : ""}</div></div>
      <div class="tn-funnel-count"><b>${n}</b>건 · ${pct}%</div>
    `;
    funnelEl.appendChild(row);
  });

  const pipelineView = document.getElementById("view-pipeline");
  if(pipelineView && pipelineView.classList.contains("active")) renderPipeline();
}

/* ---------- 초기화 ---------- */
/* =========================================================================
   사용자 계정 · 권한
   접속키(CRM_ACCESS_KEY)는 작업공간의 문이고, 사용자 로그인은 그 안에서
   "누가" 작업하는지 구분하는 두 번째 문이다. 사용자를 한 명도 만들지 않은
   작업공간은 예전과 똑같이 접속키만으로 모든 작업이 가능하다.
   ========================================================================= */
const MEMBER_TOKEN_STORAGE_KEY = "tinico:member:token";
const MEMBER_ROLE_LABELS = {admin:"관리자", editor:"편집자", viewer:"열람자"};
const MEMBER_ROLE_HINTS = {admin:"모든 작업", editor:"입력과 수정", viewer:"보기만"};
let memberAccountsEnabled = false;
let currentMember = null;
let memberToken = readSavedMemberToken();
let memberDirectory = [];
let memberDirectoryPromise = null;
let memberGatePromise = null, resolveMemberGate = null;
let adminMemberList = [];
let memberAdminError = "";
let editingMemberId = "";

function readSavedMemberToken(){ try{ return localStorage.getItem(MEMBER_TOKEN_STORAGE_KEY) || ""; }catch(e){ return ""; } }
function saveMemberToken(value){
  try{
    if(value) localStorage.setItem(MEMBER_TOKEN_STORAGE_KEY, value);
    else localStorage.removeItem(MEMBER_TOKEN_STORAGE_KEY);
  }catch(e){}
}
/* 서버가 최종 판단하지만, 화면에서도 미리 막아 헛수고를 줄인다 */
function canEditData(){ return !(memberAccountsEnabled && currentMember && currentMember.role === "viewer"); }
function requireEditPermission(){
  if(canEditData()) return true;
  showToast("열람 권한이어서 변경할 수 없습니다. 관리자에게 편집 권한을 요청하세요.");
  return false;
}
function cloudRequestHeaders(extra){
  const headers = {"X-CRM-Key": cloudAccessKey, ...(extra || {})};
  if(memberToken) headers["X-CRM-User"] = memberToken;
  return headers;
}
function applySessionMemberInfo(session){
  memberAccountsEnabled = !!(session && session.memberAccountsEnabled);
  currentMember = (session && session.member) || null;
  /* 사용자 계정을 쓰는데 토큰이 더는 유효하지 않으면 남겨 두지 않는다 */
  if(memberAccountsEnabled && !currentMember && memberToken){ memberToken = ""; saveMemberToken(""); }
  if(!memberAccountsEnabled && memberToken){ memberToken = ""; saveMemberToken(""); }
  updateMemberUi();
}
/* 열람 권한일 때 눌러도 소용없는 입력 버튼들 */
const WRITE_CONTROL_IDS = ["pipe-new-deal","pipe-import-btn","roadmap-add-btn","contact-scan-btn","contact-upload-btn",
  "contact-manual-btn","contact-csv-upload-btn","contact-dedupe-btn","calendar-add","area-add-btn",
  "settings-stage-add","settings-bucket-add","settings-group-add","manual-add-btn","manual-reset-btn",
  "settings-trash-empty","settings-clear-seed"];
function applyWritePermissionUi(){
  const readOnly = !canEditData();
  WRITE_CONTROL_IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.disabled = readOnly;
    if(readOnly) el.title = "열람 권한이어서 변경할 수 없습니다.";
    else if(el.title === "열람 권한이어서 변경할 수 없습니다.") el.removeAttribute("title");
  });
  updateContactBulkDeleteButton();
}
function updateMemberUi(){
  const chip = document.getElementById("tn-user-chip");
  if(chip){
    chip.hidden = !memberAccountsEnabled;
    chip.dataset.role = currentMember ? currentMember.role : "";
    const name = document.getElementById("tn-user-chip-name");
    const role = document.getElementById("tn-user-chip-role");
    if(name) name.textContent = currentMember ? currentMember.name : "로그인 필요";
    if(role) role.textContent = currentMember ? (MEMBER_ROLE_LABELS[currentMember.role] || currentMember.role) : "";
    chip.title = currentMember
      ? `${currentMember.name} · ${MEMBER_ROLE_LABELS[currentMember.role] || currentMember.role} · 누르면 다른 사용자로 전환합니다.`
      : "사용자 로그인";
  }
  applyWritePermissionUi();
}
async function fetchMemberDirectory(){
  const response = await fetch(CLOUD_API_BASE + "/members", {headers: cloudRequestHeaders(), cache:"no-store"});
  if(!response.ok) throw cloudError("사용자 목록을 불러오지 못했습니다.","server");
  const payload = await response.json();
  memberAccountsEnabled = !!payload.enabled;
  return payload.members || [];
}
async function fillMemberLoginOptions(){
  const select = document.getElementById("member-login-name");
  if(!select) return;
  /* 목록을 동시에 여러 번 불러오면 고르던 이름이 지워진다. 한 번만 요청해 함께 쓴다. */
  if(!memberDirectoryPromise){
    memberDirectoryPromise = fetchMemberDirectory().finally(()=>{ memberDirectoryPromise = null; });
  }
  let loaded = false;
  try{ memberDirectory = await memberDirectoryPromise; loaded = true; }
  catch(error){ memberDirectory = []; }
  if(!loaded){
    /* 새로 고치지 못했다면 이미 떠 있는 목록은 그대로 둔다 */
    if(!select.options.length){
      const status = document.getElementById("member-login-status");
      if(status){
        status.textContent = "사용자 목록을 불러오지 못했습니다. 네트워크를 확인한 뒤 화면을 새로고침해 주세요.";
        status.classList.add("error");
      }
    }
    return;
  }
  const previous = select.value;
  const next = memberDirectory.map(member=>member.id).join("\u0000");
  const current = [...select.options].map(option=>option.value).join("\u0000");
  if(next !== current){
    select.innerHTML = "";
    memberDirectory.forEach(member=>{
      const option = document.createElement("option");
      option.value = member.id;
      option.textContent = `${member.name} · ${MEMBER_ROLE_LABELS[member.role] || member.role}`;
      select.appendChild(option);
    });
    if(previous && memberDirectory.some(member=>member.id === previous)) select.value = previous;
  }
  /* 관리자가 사용자를 모두 지우거나 중지했으면 서버도 로그인을 요구하지 않는다.
     고를 이름이 없는 화면에 갇히지 않도록 그대로 닫고 넘어간다. */
  if(!memberDirectory.length){
    memberAccountsEnabled = false;
    updateMemberUi();
    hideMemberGate(true);
  }
}
function showMemberGate(message){
  const gate = document.getElementById("member-gate");
  if(!gate) return Promise.resolve(false);
  const status = document.getElementById("member-login-status");
  const cancel = document.getElementById("member-login-cancel");
  const password = document.getElementById("member-login-password");
  if(password) password.value = "";
  if(cancel) cancel.hidden = !currentMember;
  if(status){
    status.textContent = message || "이름을 고르고 비밀번호를 입력하세요.";
    status.classList.toggle("error", !!message);
  }
  gate.hidden = false;
  fillMemberLoginOptions();
  setTimeout(()=>document.getElementById("member-login-name")?.focus(), 30);
  if(!memberGatePromise) memberGatePromise = new Promise(resolve=>{ resolveMemberGate = resolve; });
  return memberGatePromise;
}
function hideMemberGate(result){
  const gate = document.getElementById("member-gate");
  if(gate) gate.hidden = true;
  const password = document.getElementById("member-login-password");
  if(password) password.value = "";
  const resolve = resolveMemberGate;
  memberGatePromise = null;
  resolveMemberGate = null;
  if(resolve) resolve(result);
}
async function submitMemberLogin(event){
  event.preventDefault();
  const select = document.getElementById("member-login-name");
  const password = document.getElementById("member-login-password");
  const status = document.getElementById("member-login-status");
  const submit = document.getElementById("member-login-submit");
  let memberId = select ? select.value : "";
  /* 목록이 아직 도착하지 않은 채로 눌렀다면 기다렸다가 한 번 더 읽는다 */
  if(!memberId){
    await fillMemberLoginOptions();
    memberId = select ? select.value : "";
  }
  if(!memberId){
    if(status){ status.textContent="사용할 이름을 고르세요."; status.classList.add("error"); }
    return;
  }
  if(submit){ submit.disabled = true; submit.textContent = "확인 중…"; }
  try{
    const response = await fetch(CLOUD_API_BASE + "/auth/login", {
      method:"POST",
      headers:{"X-CRM-Key":cloudAccessKey, "Content-Type":"application/json"},
      cache:"no-store",
      body: JSON.stringify({memberId, password: password ? password.value : ""})
    });
    let payload = {};
    try{ payload = await response.json(); }catch(e){}
    if(!response.ok) throw cloudError(payload.message || "로그인하지 못했습니다.", payload.error || "auth");
    memberToken = payload.token;
    saveMemberToken(memberToken);
    currentMember = payload.member;
    memberAccountsEnabled = true;
    updateMemberUi();
    hideMemberGate(true);
    /* 보이는 범위가 사용자마다 다르므로 휴지통과 변경 이력을 다시 그린다 */
    auditState.entries=[];auditState.total=0;auditState.loaded=false;auditState.page=1;auditState.error="";auditState.actors=[];
    setAuditControlsEnabled(canViewAudit());
    renderAuditTable();
    renderTrash();
    showToast(`${currentMember.name}님으로 로그인했습니다.`, "info", 3000);
  }catch(error){
    if(status){ status.textContent = error.message || "로그인하지 못했습니다."; status.classList.add("error"); }
  }finally{
    if(submit){ submit.disabled = false; submit.textContent = "로그인"; }
  }
}
function openAccountModal(){
  if(!currentMember) return;
  const overlay = document.getElementById("account-overlay");
  if(!overlay) return;
  document.getElementById("account-sub").textContent =
    `${currentMember.name} · ${MEMBER_ROLE_LABELS[currentMember.role] || currentMember.role}`;
  closeAccountPasswordForm();
  overlay.hidden = false;
  setTimeout(()=>document.getElementById("account-password-open")?.focus(), 0);
}
function closeAccountModal(){
  const overlay = document.getElementById("account-overlay");
  if(overlay) overlay.hidden = true;
  closeAccountPasswordForm();
}
function closeAccountPasswordForm(){
  const form = document.getElementById("account-password-form");
  const actions = document.getElementById("account-actions");
  const closeRow = document.getElementById("account-close-row");
  const status = document.getElementById("account-password-status");
  if(form){
    form.hidden = true;
    ["account-current-password","account-new-password","account-new-password-confirm"].forEach(id=>{
      const input = document.getElementById(id);
      if(input) input.value = "";
    });
  }
  if(actions) actions.hidden = false;
  if(closeRow) closeRow.hidden = false;
  if(status){ status.textContent = ""; status.className = "tn-admin-status"; }
}
function openAccountPasswordForm(){
  const form = document.getElementById("account-password-form");
  const actions = document.getElementById("account-actions");
  const closeRow = document.getElementById("account-close-row");
  if(form) form.hidden = false;
  if(actions) actions.hidden = true;
  if(closeRow) closeRow.hidden = true;
  setTimeout(()=>document.getElementById("account-current-password")?.focus(), 0);
}
async function submitAccountPassword(event){
  if(event) event.preventDefault();
  const status = document.getElementById("account-password-status");
  const save = document.getElementById("account-password-save");
  const current = document.getElementById("account-current-password").value;
  const next = document.getElementById("account-new-password").value;
  const confirmValue = document.getElementById("account-new-password-confirm").value;
  const fail = (message)=>{ if(status){ status.textContent = message; status.className = "tn-admin-status error"; } };
  if(next.length < 6){ fail("새 비밀번호는 6자 이상으로 정해 주세요."); return; }
  if(next !== confirmValue){ fail("새 비밀번호가 서로 다릅니다."); return; }
  if(save){ save.disabled = true; save.textContent = "변경 중…"; }
  try{
    const response = await fetch(CLOUD_API_BASE + "/auth/password", {
      method:"POST",
      headers: cloudRequestHeaders({"Content-Type":"application/json"}),
      cache:"no-store",
      body: JSON.stringify({currentPassword: current, newPassword: next})
    });
    let payload = {};
    try{ payload = await response.json(); }catch(error){}
    if(!response.ok) throw cloudError(payload.message || "비밀번호를 바꾸지 못했습니다.", payload.error || "server");
    closeAccountModal();
    showToast("비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 사용하세요.", "info", 5000);
  }catch(error){
    fail(error.message || "비밀번호를 바꾸지 못했습니다.");
  }finally{
    if(save){ save.disabled = false; save.textContent = "비밀번호 변경"; }
  }
}

/* 처음 주소로 다시 여는 것과 같게 — 보던 화면(#해시)까지 지워 로그인 화면부터 시작한다.
   테스트에서 대신 끼워 넣을 수 있도록 함수로 분리해 둔다. */
function reloadApp(){ location.replace(location.pathname + location.search); }
/* 사용자를 바꿀 때는 관리자 인증, 불러온 목록, 편집 중이던 내용, AI 대화가
   다음 사람에게 그대로 넘어가면 안 된다. 메모리에 남은 상태를 하나씩 지우는 대신
   화면을 처음부터 다시 열어 확실하게 끊는다. */
function signOutMember(){
  const unsaved = [...dealDrafts.values(), ...contactDrafts.values()].some(draft=>draftDirty(draft) || draft.saving);
  if(unsaved && !confirm("저장하지 않은 변경이 있습니다. 사용자를 바꾸면 이 내용은 사라집니다. 계속할까요?")) return;
  lockAdmin();
  adminMemberList = [];
  memberAdminError = "";
  auditState.entries = []; auditState.total = 0; auditState.loaded = false; auditState.page = 1; auditState.error = "";
  aiChatHistories = {};
  memberToken = "";
  saveMemberToken("");
  currentMember = null;
  updateMemberUi();
  reloadApp();
}
/* 이 화면의 버튼은 init()이 사용자 확인을 기다리기 전에 먼저 연결해야 한다.
   기다리는 동안에는 아래쪽 이벤트 연결 코드에 닿지 못해 로그인 버튼이 죽는다. */
function setupMemberGateUi(){
  document.getElementById("member-login-form")?.addEventListener("submit", submitMemberLogin);
  document.getElementById("member-login-cancel")?.addEventListener("click", ()=>hideMemberGate(false));
  document.getElementById("tn-user-chip")?.addEventListener("click", openAccountModal);
  document.getElementById("account-close")?.addEventListener("click", closeAccountModal);
  document.getElementById("account-logout")?.addEventListener("click", ()=>{ closeAccountModal(); signOutMember(); });
  document.getElementById("account-password-open")?.addEventListener("click", openAccountPasswordForm);
  document.getElementById("account-password-cancel")?.addEventListener("click", closeAccountPasswordForm);
  document.getElementById("account-password-form")?.addEventListener("submit", submitAccountPassword);
  document.getElementById("account-overlay")?.addEventListener("click", (event)=>{
    if(event.target.id === "account-overlay") closeAccountModal();
  });
}
async function ensureMemberSession(){
  if(!memberAccountsEnabled || currentMember){ updateMemberUi(); return true; }
  return showMemberGate("");
}

/* ---- 설정 > 사용자 (관리자 인증 후) ---- */
function renderMemberSettings(){
  const list = document.getElementById("settings-member-list");
  const state = document.getElementById("settings-members-state");
  const addButton = document.getElementById("settings-member-add");
  const unlocked = adminSessionActive();
  if(addButton) addButton.disabled = !unlocked;
  if(state){
    const active = adminMemberList.filter(member=>!member.disabled).length;
    state.textContent = memberAccountsEnabled ? `사용 중 · ${active}명` : "사용 안 함";
    state.dataset.state = memberAccountsEnabled ? "on" : "";
  }
  if(!list) return;
  list.innerHTML = "";
  if(!unlocked){
    list.innerHTML = '<div class="tn-empty-compact">관리자 인증 후 사용자 목록을 볼 수 있습니다.</div>';
    return;
  }
  if(!adminMemberList.length){
    list.innerHTML = memberAdminError
      ? '<div class="tn-empty-compact">' + escapeHtml(memberAdminError) + '</div>'
      : '<div class="tn-empty-compact">등록된 사용자가 없습니다. 사용자를 한 명이라도 추가하면 그때부터 로그인과 권한 구분이 시작됩니다.</div>';
    return;
  }
  adminMemberList.forEach(member=>{
    const row = document.createElement("div");
    row.className = "tn-settings-row";
    row.innerHTML = `<div class="tn-settings-row-main">
        <span class="tn-role-chip" data-role="${escapeHtml(member.role)}">${escapeHtml(MEMBER_ROLE_LABELS[member.role] || member.role)}</span>
        <span class="tn-settings-row-title">${escapeHtml(member.name)}</span>
      </div>
      <div class="tn-settings-row-sub">${escapeHtml([member.email || "이메일 없음", member.hasPassword ? "비밀번호 설정됨" : "비밀번호 없음", member.disabled ? "사용 중지" : "사용 중"].join(" · "))}</div>
      <div class="tn-settings-row-actions"><button class="tn-btn small" type="button" data-edit-member="${escapeHtml(member.id)}">수정</button></div>`;
    list.appendChild(row);
  });
}
async function refreshMemberAdminList(options){
  if(!adminSessionActive()) return;
  const silent = !!(options && options.silent);
  try{
    const payload = await adminApiRequest("/admin/members");
    adminMemberList = payload.members || [];
    memberAccountsEnabled = adminMemberList.some(member=>!member.disabled);
    memberAdminError = "";
  }catch(error){
    adminMemberList = [];
    memberAdminError = error.message || "사용자 목록을 불러오지 못했습니다.";
    /* 인증 직후 자동으로 당겨 오는 경우까지 오류를 띄우면 방해만 된다 */
    if(!silent){ console.error("member list failed", error); showToast(memberAdminError); }
  }
  renderMemberSettings();
  updateMemberUi();
}
function openMemberModal(id){
  editingMemberId = id || "";
  const member = adminMemberList.find(entry=>entry.id === editingMemberId);
  document.getElementById("member-modal-title").textContent = member ? "사용자 수정" : "사용자 추가";
  document.getElementById("member-modal-name").value = member ? member.name : "";
  document.getElementById("member-modal-email").value = member ? (member.email || "") : "";
  document.getElementById("member-modal-role").value = member ? member.role : "editor";
  document.getElementById("member-modal-disabled").value = member && member.disabled ? "true" : "false";
  document.getElementById("member-modal-password").value = "";
  document.getElementById("member-modal-password").placeholder = member
    ? "6자 이상 · 비워 두면 바꾸지 않습니다"
    : "6자 이상 · 비워 두면 비밀번호 없이 이름만으로 들어옵니다";
  const status = document.getElementById("member-modal-status");
  if(status){ status.textContent = ""; status.className = "tn-admin-status"; }
  document.getElementById("member-modal-delete").hidden = !member;
  document.getElementById("member-modal-overlay").hidden = false;
  setTimeout(()=>document.getElementById("member-modal-name").focus(), 0);
}
function closeMemberModal(){
  document.getElementById("member-modal-overlay").hidden = true;
  editingMemberId = "";
}
async function saveMemberModal(){
  const status = document.getElementById("member-modal-status");
  const name = document.getElementById("member-modal-name").value.trim();
  if(!name){
    if(status){ status.textContent = "이름을 입력하세요."; status.className = "tn-admin-status error"; }
    return;
  }
  const body = {
    name,
    email: document.getElementById("member-modal-email").value.trim(),
    role: document.getElementById("member-modal-role").value,
    disabled: document.getElementById("member-modal-disabled").value === "true"
  };
  const password = document.getElementById("member-modal-password").value;
  if(password || !editingMemberId) body.password = password;
  try{
    if(editingMemberId) await adminApiRequest("/admin/members/" + encodeURIComponent(editingMemberId), {method:"PATCH", body});
    else await adminApiRequest("/admin/members", {method:"POST", body});
  }catch(error){
    if(status){ status.textContent = error.message || "저장하지 못했습니다."; status.className = "tn-admin-status error"; }
    return;
  }
  closeMemberModal();
  await refreshMemberAdminList();
  showToast("사용자 정보를 저장했습니다.", "info", 3000);
}
async function deleteMemberFromModal(){
  if(!editingMemberId) return;
  const member = adminMemberList.find(entry=>entry.id === editingMemberId);
  if(!confirm(`'${member ? member.name : "이 사용자"}'를 삭제할까요? 이미 남은 변경 이력의 이름은 그대로 유지됩니다.`)) return;
  try{
    await adminApiRequest("/admin/members/" + encodeURIComponent(editingMemberId), {method:"DELETE"});
  }catch(error){
    showToast(error.message || "삭제하지 못했습니다.");
    return;
  }
  const removedSelf = currentMember && currentMember.id === editingMemberId;
  closeMemberModal();
  await refreshMemberAdminList();
  if(removedSelf) signOutMember();
}

/* =========================================================================
   설정 > 변경 이력
   crm_audit_log 에 이미 쌓이고 있던 기록을 백업 파일을 열지 않고 화면에서 본다.
   ========================================================================= */
const auditState = {page:1, size:20, total:0, entries:[], screens:[], actors:[], scope:"mine", loading:false, loaded:false, error:"", pending:false};
/* 관리자 인증을 마쳤으면 전체를, 로그인만 한 사용자는 자기 기록을 볼 수 있다 */
function canViewAudit(){ return adminSessionActive() || (memberAccountsEnabled && !!currentMember); }
function auditControls(){
  return ["audit-search","audit-screen","audit-action","audit-range","audit-actor","audit-page-size","settings-audit-refresh"]
    .map(id=>document.getElementById(id)).filter(Boolean);
}
/* 관리자 인증 유무와 상관없이 쓸 수 있는 조회 — 범위는 서버가 정한다 */
async function auditApiRequest(path){
  await ensureCloudConnection();
  const headers = cloudRequestHeaders();
  if(adminSessionActive()) headers["Authorization"] = "Bearer " + adminSessionToken;
  let response;
  try{
    response = await fetch(CLOUD_API_BASE + path, {headers, cache:"no-store"});
  }catch(error){
    throw cloudError("변경 이력을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.","network");
  }
  let payload = {};
  try{ payload = await response.json(); }catch(error){}
  if(!response.ok){
    if(payload.error === "invalid_or_expired_admin_session" && adminSessionActive()) lockAdmin();
    throw cloudError(payload.message || "변경 이력을 불러오지 못했습니다.", payload.error || "server");
  }
  return payload;
}
function setAuditControlsEnabled(enabled){
  auditControls().forEach(el=>{ el.disabled = !enabled; });
}
function auditRangeFrom(){
  const days = Number(document.getElementById("audit-range")?.value || "");
  if(!days) return "";
  const from = new Date();
  from.setDate(from.getDate() - days);
  return from.toISOString();
}
async function loadAuditPage(options){
  if(!canViewAudit()) return;
  /* 조회 중에 조건이 또 바뀌면 요청을 버리지 말고 끝난 뒤 한 번 더 돌린다 */
  if(auditState.loading){ auditState.pending = true; return; }
  const silent = !!(options && options.silent);
  auditState.loading = true;
  const params = new URLSearchParams();
  params.set("limit", String(auditState.size));
  params.set("offset", String((auditState.page - 1) * auditState.size));
  const q = document.getElementById("audit-search")?.value.trim();
  const screen = document.getElementById("audit-screen")?.value;
  const action = document.getElementById("audit-action")?.value;
  const actor = adminSessionActive() ? document.getElementById("audit-actor")?.value : "";
  const from = auditRangeFrom();
  if(q) params.set("q", q);
  if(screen) params.set("screen", screen);
  if(action) params.set("action", action);
  if(actor) params.set("actorId", actor);
  if(from) params.set("from", from);
  try{
    const payload = await auditApiRequest("/audit?" + params.toString());
    auditState.entries = payload.entries || [];
    auditState.total = Number(payload.total || 0);
    auditState.screens = payload.screens || [];
    auditState.actors = payload.actors || [];
    auditState.scope = payload.scope || "all";
    auditState.loaded = true;
    auditState.error = "";
  }catch(error){
    auditState.entries = [];
    auditState.total = 0;
    auditState.error = error.message || "변경 이력을 불러오지 못했습니다.";
    if(!silent){ console.error("audit query failed", error); showToast(auditState.error); }
  }finally{
    auditState.loading = false;
  }
  /* 응답을 기다리는 동안 화면이 닫혔으면 여기서 멈춘다 */
  if(typeof document === "undefined" || !document.getElementById) return;
  renderAuditScreenOptions();
  renderAuditActorOptions();
  renderAuditTable();
  if(auditState.pending){ auditState.pending = false; await loadAuditPage(options); }
}
function renderAuditScreenOptions(){
  const select = document.getElementById("audit-screen");
  if(!select) return;
  const previous = select.value;
  select.innerHTML = '<option value="">모든 화면</option>';
  auditState.screens.forEach(entry=>{
    const option = document.createElement("option");
    option.value = entry.screen;
    option.textContent = `${entry.screen} (${entry.count})`;
    select.appendChild(option);
  });
  if(previous && auditState.screens.some(entry=>entry.screen === previous)) select.value = previous;
}
function renderAuditActorOptions(){
  const select = document.getElementById("audit-actor");
  if(!select) return;
  /* 사용자 선택은 전체를 볼 수 있을 때만 의미가 있다 */
  select.hidden = auditState.scope !== "all" || !auditState.actors.length;
  const previous = select.value;
  select.innerHTML = '<option value="">모든 사용자</option>';
  auditState.actors.forEach(actor=>{
    const option = document.createElement("option");
    option.value = actor.id;
    option.textContent = `${actor.name} (${actor.count})`;
    select.appendChild(option);
  });
  if(previous && auditState.actors.some(actor=>actor.id === previous)) select.value = previous;
}
function auditChangeSummary(entry){
  const fields = Array.isArray(entry.changedFields) ? entry.changedFields : [];
  /* 새로 만들거나 지운 기록은 항목 전체가 바뀐 것이라 필드를 늘어놓아도 읽히지 않는다 */
  if(entry.action !== "수정" || !fields.length) return entry.summary || "";
  return fields.slice(0, 4).map(field=>field.label || field.field).join(", ") + (fields.length > 4 ? ` 외 ${fields.length - 4}개` : "");
}
function renderAuditTable(){
  const tbody = document.getElementById("audit-tbody");
  const state = document.getElementById("settings-audit-state");
  const note = document.getElementById("audit-scope-note");
  const viewable = canViewAudit();
  const mineOnly = viewable && !adminSessionActive();
  if(note){
    note.hidden = !mineOnly;
    if(mineOnly) note.textContent = "내가 남긴 기록만 보입니다. 다른 사용자의 기록까지 보려면 위의 관리자 백업·복원을 활성화하세요.";
  }
  if(state){
    if(!viewable) state.textContent = "관리자 인증 후 화면·동작·사용자별 변경 기록을 조회할 수 있습니다.";
    else if(auditState.error) state.textContent = auditState.error;
    else state.textContent = auditState.loaded
      ? `${mineOnly ? "내 기록" : "전체"} 중 조건에 맞는 기록 ${auditState.total.toLocaleString("ko-KR")}건`
      : "새로고침을 눌러 기록을 불러오세요.";
  }
  if(!tbody) return;
  tbody.innerHTML = "";
  if(!viewable){
    tbody.innerHTML = '<tr><td colspan="6" class="tn-empty-compact">관리자 인증이 필요합니다.</td></tr>';
    document.getElementById("audit-pager").hidden = true;
    return;
  }
  if(!auditState.entries.length){
    tbody.innerHTML = `<tr><td colspan="6" class="tn-empty-compact">${escapeHtml(auditState.error || (auditState.loaded ? "조건에 맞는 변경 기록이 없습니다." : "새로고침을 눌러 기록을 불러오세요."))}</td></tr>`;
    document.getElementById("audit-pager").hidden = true;
    return;
  }
  const fragment = document.createDocumentFragment();
  auditState.entries.forEach(entry=>{
    const row = document.createElement("tr");
    row.innerHTML = `<td>${escapeHtml(String(entry.eventAtKST || entry.eventAt || "").replace(" KST",""))}</td>
      <td>${escapeHtml(entry.screen || "")}</td>
      <td><span class="tn-audit-action" data-action="${escapeHtml(entry.action || "")}">${escapeHtml(entry.action || "")}</span></td>
      <td><div class="tn-settings-row-title">${escapeHtml(entry.entityLabel || entry.entityType || "")}</div><div class="tn-audit-summary">${escapeHtml(auditChangeSummary(entry))}</div></td>
      <td>${escapeHtml(entry.actorName || "-")}</td>
      <td><button class="tn-btn small" type="button" data-audit-detail="${escapeHtml(entry.eventId)}">상세</button></td>`;
    fragment.appendChild(row);
  });
  tbody.appendChild(fragment);
  renderAuditPager();
}
function auditPageCount(){ return Math.max(1, Math.ceil(auditState.total / auditState.size)); }
function goToAuditPage(page){
  const next = Math.max(1, Math.min(auditPageCount(), Number(page) || 1));
  if(next === auditState.page) return;
  auditState.page = next;
  loadAuditPage();
}
function renderAuditPager(){
  const pager = document.getElementById("audit-pager");
  if(!pager) return;
  pager.hidden = false;
  const pages = auditPageCount();
  const numbers = document.getElementById("audit-page-numbers");
  numbers.innerHTML = "";
  contactPagerNumbers(auditState.page, pages).forEach(entry=>{
    if(entry === "gap"){
      const gap = document.createElement("span");
      gap.className = "tn-pager-gap";
      gap.textContent = "…";
      gap.setAttribute("aria-hidden","true");
      numbers.appendChild(gap);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tn-pager-btn" + (entry === auditState.page ? " active" : "");
    button.textContent = String(entry);
    if(entry === auditState.page) button.setAttribute("aria-current","page");
    button.addEventListener("click", ()=>goToAuditPage(entry));
    numbers.appendChild(button);
  });
  document.getElementById("audit-page-first").disabled = auditState.page <= 1;
  document.getElementById("audit-page-prev").disabled = auditState.page <= 1;
  document.getElementById("audit-page-next").disabled = auditState.page >= pages;
  document.getElementById("audit-page-last").disabled = auditState.page >= pages;
  const range = document.getElementById("audit-page-range");
  if(range){
    const from = auditState.total ? (auditState.page - 1) * auditState.size + 1 : 0;
    const to = Math.min(auditState.total, auditState.page * auditState.size);
    range.textContent = auditState.total ? `${from}–${to} / 전체 ${auditState.total.toLocaleString("ko-KR")}건` : "표시할 기록이 없습니다.";
  }
}
function auditDetailText(value){
  if(value === null || value === undefined) return "(없음)";
  if(typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
function openAuditDetail(eventId){
  const entry = auditState.entries.find(item=>item.eventId === eventId);
  if(!entry) return;
  document.getElementById("audit-detail-sub").textContent =
    `${entry.eventAtKST || entry.eventAt} · ${entry.screen} · ${entry.action} · ${entry.entityLabel || entry.entityType}${entry.actorName ? " · " + entry.actorName : ""}`;
  const tbody = document.getElementById("audit-detail-tbody");
  tbody.innerHTML = "";
  const fields = Array.isArray(entry.changedFields) ? entry.changedFields : [];
  if(!fields.length){
    tbody.innerHTML = `<tr><td colspan="3" class="tn-empty-compact">${escapeHtml(entry.summary || "변경 항목이 기록되지 않았습니다.")}</td></tr>`;
  }else{
    fields.forEach(field=>{
      const row = tbody.insertRow();
      row.insertCell().textContent = field.label || field.field;
      row.insertCell().innerHTML = `<div class="tn-audit-detail-value">${escapeHtml(auditDetailText(field.before))}</div>`;
      row.insertCell().innerHTML = `<div class="tn-audit-detail-value">${escapeHtml(auditDetailText(field.after))}</div>`;
    });
  }
  document.getElementById("audit-detail-overlay").hidden = false;
}

/* =========================================================================
   전체 검색 (Ctrl/⌘ + K)
   화면마다 흩어진 검색창을 하나로 모아 회사명 하나로 전부 찾는다.
   ========================================================================= */
let searchMatches = [], searchActiveIndex = 0;
function collectSearchMatches(query){
  const q = String(query || "").trim().toLowerCase();
  if(q.length < 1) return [];
  const out = [];
  const hit = (...values)=>values.filter(Boolean).join(" ").toLowerCase().includes(q);
  const push = (group, title, sub, run)=>out.push({group, title, sub, run});
  allDeals().forEach(({area, item})=>{
    if(hit(item.title, item.company, item.contactName, item.internalOwner, item.action, item.tag, area.title))
      push("영업 항목", item.title, `${area.title} · ${normalizeStage(item.stage)}${item.internalOwner ? " · " + item.internalOwner : ""}`,
        ()=>{ showView("pipeline"); openDealDrawer(area.key, item.id); });
  });
  contactsData.forEach(ct=>{
    if(hit(ct.name, ct.company, ct.department, ct.jobTitle, ct.email, contactPrimaryPhone(ct), ct.memo))
      push("연락처", ct.name || ct.company || "이름 없음",
        [ct.company, ct.jobTitle, contactPrimaryPhone(ct)].filter(Boolean).join(" · ") || "상세 없음",
        ()=>{ showView("contacts"); openContactDetail(ct); });
  });
  roadmapData.forEach(task=>{
    if(hit(task.title, task.purpose, task.owner, task.deliverable, task.notes))
      push("지원 업무", task.title, `${task.status} · 담당 ${effectiveSupportTaskOwner(task) || "미지정"} · ${supportTaskDueText(task)}`,
        ()=>{ showView("roadmap"); openRoadmapModal(task.id); });
  });
  calendarEntries.forEach(event=>{
    if(hit(event.title, event.description, event.location, event.owner))
      push("일정", event.title, `${event.date}${event.startTime ? " " + event.startTime : ""}${event.location ? " · " + event.location : ""}`,
        ()=>{ showView("calendar"); openCalendarEventModal(event.id); });
  });
  manualSections.forEach(section=>{
    if(hit(section.title, section.category, section.content))
      push("매뉴얼", section.title, section.category || "매뉴얼", ()=>{
        showView("settings");
        setSettingsMode("manual");
        const input = document.getElementById("manual-search");
        if(input){ input.value = section.title; renderManualSettings(); }
      });
  });
  return out.slice(0, 40);
}
function renderGlobalSearch(query){
  const container = document.getElementById("global-search-results");
  if(!container) return;
  searchMatches = collectSearchMatches(query);
  searchActiveIndex = 0;
  container.innerHTML = "";
  if(!String(query || "").trim()){
    container.innerHTML = '<div class="tn-search-empty">고객사·담당자·영업건·지원 업무·일정·매뉴얼을 한 번에 찾습니다.</div>';
    return;
  }
  if(!searchMatches.length){
    container.innerHTML = '<div class="tn-search-empty">검색 결과가 없습니다.</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  let lastGroup = "";
  searchMatches.forEach((match, index)=>{
    if(match.group !== lastGroup){
      lastGroup = match.group;
      const head = document.createElement("div");
      head.className = "tn-search-group";
      head.textContent = match.group;
      fragment.appendChild(head);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tn-search-item" + (index === 0 ? " active" : "");
    button.dataset.index = String(index);
    button.setAttribute("role", "option");
    button.innerHTML = `<span class="tn-search-item-badge">${escapeHtml(match.group)}</span>
      <span class="tn-search-item-body"><span class="tn-search-item-title">${escapeHtml(match.title)}</span><span class="tn-search-item-sub">${escapeHtml(match.sub)}</span></span>`;
    button.addEventListener("click", ()=>runSearchMatch(index));
    fragment.appendChild(button);
  });
  container.appendChild(fragment);
}
function highlightSearchMatch(index){
  const container = document.getElementById("global-search-results");
  if(!container || !searchMatches.length) return;
  searchActiveIndex = (index + searchMatches.length) % searchMatches.length;
  container.querySelectorAll(".tn-search-item").forEach(item=>{
    const active = Number(item.dataset.index) === searchActiveIndex;
    item.classList.toggle("active", active);
    if(active && typeof item.scrollIntoView === "function") item.scrollIntoView({block:"nearest"});
  });
}
function runSearchMatch(index){
  const match = searchMatches[index];
  if(!match) return;
  globalSearchClose();
  match.run();
}
function globalSearchOpen(){
  const overlay = document.getElementById("global-search-overlay");
  const input = document.getElementById("global-search-input");
  if(!overlay) return;
  overlay.hidden = false;
  if(input){ input.value = ""; input.focus(); }
  renderGlobalSearch("");
}
function globalSearchClose(){
  const overlay = document.getElementById("global-search-overlay");
  if(overlay) overlay.hidden = true;
}

/* =========================================================================
   활동 화면
   활동은 지금까지 항목 상세에서만 볼 수 있었다. 기간별로 모아 보고
   접촉이 끊긴 영업건을 찾는다.
   ========================================================================= */
const ACTIVITY_STALE_DAYS = 14;
function activityRangeStart(range){
  const today = new Date();
  today.setHours(0,0,0,0);
  if(range === "all") return "";
  if(range === "month") return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
  if(range === "quarter"){ const d = new Date(today); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0,10); }
  /* 주는 월요일 시작 */
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  if(range === "lastweek"){ const d = new Date(weekStart); d.setDate(d.getDate() - 7); return d.toISOString().slice(0,10); }
  return weekStart.toISOString().slice(0,10);
}
function activityRangeEnd(range){
  if(range !== "lastweek") return "";
  const start = new Date(activityRangeStart("lastweek"));
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0,10);
}
function collectActivityEntries(){
  const rows = [];
  allDeals().forEach(({area, item})=>{
    (item.activities || []).forEach(activity=>{
      rows.push({area, item, activity, date: activityDateValue(activity).slice(0,10), owner: String(item.internalOwner || "").trim() || "미지정"});
    });
  });
  return rows.sort((left, right)=>right.date.localeCompare(left.date));
}
function filteredActivityEntries(){
  const range = document.getElementById("activity-range")?.value || "week";
  const type = document.getElementById("activity-type-filter")?.value || "";
  const owner = document.getElementById("activity-owner-filter")?.value || "";
  const query = (document.getElementById("activity-search")?.value || "").trim().toLowerCase();
  const from = activityRangeStart(range);
  const to = activityRangeEnd(range);
  return collectActivityEntries().filter(row=>{
    if(from && row.date < from) return false;
    if(to && row.date > to) return false;
    if(type && row.activity.type !== type) return false;
    if(owner && row.owner !== owner) return false;
    if(query){
      const haystack = [row.item.title, row.item.company, row.activity.content, row.activity.result, row.activity.nextAction, row.owner, row.area.title]
        .filter(Boolean).join(" ").toLowerCase();
      if(!haystack.includes(query)) return false;
    }
    return true;
  });
}
function updateActivityFilterOptions(){
  const rows = collectActivityEntries();
  const typeSelect = document.getElementById("activity-type-filter");
  const ownerSelect = document.getElementById("activity-owner-filter");
  const fill = (select, values, allLabel)=>{
    if(!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="">${allLabel}</option>`;
    values.forEach(value=>{
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if(previous && values.includes(previous)) select.value = previous;
  };
  fill(typeSelect, [...new Set(rows.map(row=>row.activity.type).filter(Boolean))].sort(), "모든 유형");
  fill(ownerSelect, [...new Set(rows.map(row=>row.owner))].sort(), "모든 담당자");
}
function activityStaleDeals(){
  const today = todayStr();
  const limit = new Date(today);
  limit.setDate(limit.getDate() - ACTIVITY_STALE_DAYS);
  const threshold = limit.toISOString().slice(0,10);
  return allDeals()
    .filter(({item, stage})=>!isClosedStage(stage))
    .map(({area, item})=>{
      const last = [item.lastContact || "", ...(item.activities || []).map(activity=>activityDateValue(activity).slice(0,10))]
        .filter(Boolean).sort().at(-1) || "";
      return {area, item, last};
    })
    .filter(row=>!row.last || row.last < threshold)
    .sort((left, right)=>(left.last || "").localeCompare(right.last || ""))
    .slice(0, 12);
}
function renderActivitySummary(rows){
  const container = document.getElementById("activity-summary");
  if(!container) return;
  const companies = new Set(rows.map(row=>row.item.company || row.item.title));
  const followUps = rows.filter(row=>row.activity.nextDate).length;
  const cards = [
    ["활동 기록", String(rows.length)],
    ["접촉한 영업건", String(new Set(rows.map(row=>row.item.id)).size)],
    ["접촉한 고객사", String(companies.size)],
    ["후속 일정 지정", String(followUps)]
  ];
  container.innerHTML = cards.map(([label, value])=>
    `<div class="tn-task-summary-card"><div class="tn-task-summary-label">${escapeHtml(label)}</div><div class="tn-task-summary-value">${escapeHtml(value)}</div></div>`
  ).join("");
}
function renderActivityBreakdown(rows){
  const container = document.getElementById("activity-breakdown");
  if(!container) return;
  const counts = new Map();
  rows.forEach(row=>counts.set(row.activity.type, (counts.get(row.activity.type) || 0) + 1));
  if(!counts.size){ container.innerHTML = '<div class="tn-empty-compact">기간 내 활동이 없습니다.</div>'; return; }
  const max = Math.max(...counts.values());
  container.innerHTML = [...counts.entries()].sort((left, right)=>right[1] - left[1]).map(([type, count])=>
    `<div class="tn-activity-bar"><span>${escapeHtml(type)}</span><span class="tn-activity-bar-track"><i style="width:${Math.round(count / max * 100)}%"></i></span><b>${count}</b></div>`
  ).join("");
}
function renderActivityStale(){
  const container = document.getElementById("activity-stale");
  if(!container) return;
  const rows = activityStaleDeals();
  container.innerHTML = "";
  if(!rows.length){ container.innerHTML = '<div class="tn-empty-compact">2주 이상 접촉이 끊긴 영업건이 없습니다.</div>'; return; }
  rows.forEach(row=>{
    const button = document.createElement("button");
    button.type = "button";
    const gap = row.last ? Math.abs(daysUntil(row.last)) : null;
    button.innerHTML = `<div class="tn-activity-stale-title">${escapeHtml(row.item.title)}</div>
      <div class="tn-activity-stale-sub">${row.last ? `${gap}일 전 접촉 (${escapeHtml(row.last)})` : "접촉 기록 없음"}</div>`;
    button.addEventListener("click", ()=>{ showView("pipeline"); openDealDrawer(row.area.key, row.item.id); });
    container.appendChild(button);
  });
}
function renderActivityTimeline(rows){
  const container = document.getElementById("activity-timeline");
  if(!container) return;
  container.innerHTML = "";
  if(!rows.length){
    container.innerHTML = '<div class="tn-activity-empty">선택한 기간에 기록된 활동이 없습니다. 항목 상세에서 <b>활동 추가</b>로 기록해 주세요.</div>';
    return;
  }
  const byDate = new Map();
  rows.forEach(row=>{
    if(!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  });
  const fragment = document.createDocumentFragment();
  [...byDate.entries()].forEach(([date, dayRows])=>{
    const section = document.createElement("div");
    section.className = "tn-activity-day";
    const head = document.createElement("div");
    head.className = "tn-activity-day-head";
    head.innerHTML = `<span class="tn-activity-day-date">${escapeHtml(date || "날짜 없음")}</span><span class="tn-activity-day-count">${dayRows.length}건</span>`;
    section.appendChild(head);
    dayRows.forEach(row=>{
      const line = document.createElement("div");
      line.className = "tn-activity-row";
      line.innerHTML = `<span class="tn-activity-type">${escapeHtml(row.activity.type)}</span>
        <div class="tn-activity-main">
          <button class="tn-activity-deal" type="button">${escapeHtml(row.item.title)}</button>
          <div class="tn-activity-content">${escapeHtml(row.activity.content || "내용 없음")}</div>
          ${row.activity.result ? `<div class="tn-activity-result">결과: ${escapeHtml(row.activity.result)}</div>` : ""}
          ${row.activity.nextAction ? `<div class="tn-activity-next">다음: ${escapeHtml(row.activity.nextAction)}${row.activity.nextDate ? ` (${escapeHtml(row.activity.nextDate)})` : ""}</div>` : ""}
        </div>
        <span class="tn-activity-owner">${escapeHtml(row.owner)}</span>`;
      line.querySelector(".tn-activity-deal").addEventListener("click", ()=>{ showView("pipeline"); openDealDrawer(row.area.key, row.item.id); });
      section.appendChild(line);
    });
    fragment.appendChild(section);
  });
  container.appendChild(fragment);
}
function renderActivityView(){
  updateActivityFilterOptions();
  const rows = filteredActivityEntries();
  const total = document.getElementById("activity-total");
  if(total) total.textContent = `${rows.length}건`;
  renderActivitySummary(rows);
  renderActivityTimeline(rows);
  renderActivityBreakdown(rows);
  renderActivityStale();
}
function exportActivitiesCsv(){
  const rows = filteredActivityEntries();
  if(!rows.length){ showToast("내보낼 활동이 없습니다."); return; }
  const header = ["활동일","유형","그룹","영업건","고객사","내부 담당자","활동 내용","결과","다음에 할 일","다음 액션일"];
  const lines = [header.map(csvEscape).join(","), ...rows.map(row=>[
    row.date, row.activity.type, row.area.title, row.item.title, row.item.company || "",
    row.owner, row.activity.content || "", row.activity.result || "", row.activity.nextAction || "", row.activity.nextDate || ""
  ].map(csvEscape).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], {type:"text/csv;charset=utf-8;"});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `hlb_crm_activities_${todayStr()}.csv`;
  document.body.appendChild(link);
  link.click();
  setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove(); }, 500);
  showToast(`활동 ${rows.length}건을 CSV로 내보냈습니다.`, "info", 3500);
}

/* =========================================================================
   중복 연락처 정리
   리멤버 CSV를 여러 번 올리면 같은 사람이 쌓인다. 이름+연락처·이메일로
   묶어 대표를 고르고 빈 칸만 채워 합친다.
   ========================================================================= */
let dedupeGroups = [];
function contactDuplicateKeys(contact){
  const keys = [];
  const email = normalizedIdentity(contact.email);
  const phone = normalizedIdentity(contactPrimaryPhone(contact));
  const name = normalizedIdentity(contact.name);
  if(email) keys.push("email:" + email);
  if(phone) keys.push("phone:" + phone);
  if(name && normalizedIdentity(contact.company)) keys.push("name:" + name + "|" + normalizedIdentity(contact.company));
  return keys;
}
/* 같은 키를 공유하면 한 덩어리로 본다 (A-B가 전화로, B-C가 메일로 같으면 셋이 한 사람) */
function contactDuplicateGroups(){
  const parent = new Map();
  const find = (id)=>{ while(parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  const union = (a, b)=>{ const ra = find(a), rb = find(b); if(ra !== rb) parent.set(ra, rb); };
  contactsData.forEach(contact=>parent.set(contact.id, contact.id));
  const byKey = new Map();
  contactsData.forEach(contact=>{
    contactDuplicateKeys(contact).forEach(key=>{
      if(byKey.has(key)) union(byKey.get(key), contact.id);
      else byKey.set(key, contact.id);
    });
  });
  const groups = new Map();
  contactsData.forEach(contact=>{
    const root = find(contact.id);
    if(!groups.has(root)) groups.set(root, []);
    groups.get(root).push(contact);
  });
  return [...groups.values()]
    .filter(group=>group.length > 1)
    .map(group=>group.slice().sort((left, right)=>String(right.createdAt || "").localeCompare(String(left.createdAt || ""))))
    .sort((left, right)=>right.length - left.length);
}
function contactDedupeMeta(contact){
  return [contact.company, contact.department, contact.jobTitle, contactPrimaryPhone(contact), contact.email,
    contact.createdAt ? `등록 ${contact.createdAt}` : ""].filter(Boolean).join(" · ") || "추가 정보 없음";
}
function renderDedupeGroups(){
  const container = document.getElementById("dedupe-list");
  const hint = document.getElementById("dedupe-hint");
  if(!container) return;
  dedupeGroups = contactDuplicateGroups();
  container.innerHTML = "";
  if(hint) hint.textContent = dedupeGroups.length
    ? "이름·연락처·이메일이 겹치는 연락처를 묶었습니다. 남길 대표를 고르면 나머지 값은 빈칸만 채워 합치고, 합쳐진 연락처는 휴지통으로 갑니다."
    : "중복으로 보이는 연락처가 없습니다.";
  if(!dedupeGroups.length){
    container.innerHTML = '<div class="tn-dedupe-empty">중복으로 보이는 연락처가 없습니다.</div>';
    return;
  }
  dedupeGroups.forEach((group, index)=>{
    const box = document.createElement("div");
    box.className = "tn-dedupe-group";
    const head = document.createElement("div");
    head.className = "tn-dedupe-group-head";
    head.innerHTML = `<span class="tn-dedupe-group-title">${escapeHtml(group[0].name || group[0].company || "이름 없음")}</span>
      <span class="tn-dedupe-group-sub">${group.length}건</span>
      <button class="tn-btn small primary" type="button" data-merge-group="${index}">이 그룹 병합</button>`;
    box.appendChild(head);
    group.forEach((contact, order)=>{
      const option = document.createElement("label");
      option.className = "tn-dedupe-option";
      option.innerHTML = `<input type="radio" name="dedupe-${index}" value="${escapeHtml(contact.id)}"${order === 0 ? " checked" : ""}>
        <span><span class="tn-dedupe-name">${escapeHtml(contact.name || "이름 없음")}</span>
        <span class="tn-dedupe-meta">${escapeHtml(contactDedupeMeta(contact))}</span></span>`;
      box.appendChild(option);
    });
    container.appendChild(box);
  });
}
function openDedupeModal(){
  if(!requireEditPermission()) return;
  renderDedupeGroups();
  document.getElementById("dedupe-overlay").hidden = false;
}
function closeDedupeModal(){ document.getElementById("dedupe-overlay").hidden = true; }
function selectedDedupePrimary(index){
  const checked = document.querySelector(`#dedupe-list input[name="dedupe-${index}"]:checked`);
  return checked ? checked.value : (dedupeGroups[index] ? dedupeGroups[index][0].id : "");
}
async function mergeDedupeGroups(indexes){
  if(!requireEditPermission()) return;
  const removeIds = [];
  let mergedGroups = 0;
  indexes.forEach(index=>{
    const group = dedupeGroups[index];
    if(!group || group.length < 2) return;
    const primaryId = selectedDedupePrimary(index);
    const primary = contactsData.find(contact=>contact.id === primaryId) || group[0];
    group.forEach(contact=>{
      if(contact.id === primary.id) return;
      mergeImportedContact(primary, contact);
      removeIds.push(contact.id);
    });
    mergedGroups++;
  });
  if(!removeIds.length){ showToast("병합할 중복 연락처가 없습니다."); return; }
  try{
    await saveContacts();
    await moveContactsToTrash(removeIds);
  }catch(error){
    console.error("dedupe merge failed", error);
    showToast(error?.message || "중복 정리 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
    return;
  }
  renderDedupeGroups();
  renderContacts();
  renderHome();
  showToast(`${mergedGroups}개 그룹 · 연락처 ${removeIds.length}건을 병합했습니다.`, "info", 4000);
}

/* =========================================================================
   파이프라인 Excel 내보내기 · 가져오기
   연락처에만 있던 일괄 편집을 영업 항목에도 제공한다.
   ========================================================================= */
const PIPELINE_SHEET_NAME = "영업항목";
const PIPELINE_SHEET_HEADERS = ["항목ID","그룹키","그룹","고객사/영업건","고객사","단계","분류","예상매출(백만)","확률(%)",
  "내부 담당자","고객 담당자","고객 연락처","고객 이메일","다음 연락일","다음에 할 일","최근 접촉일","태그","메모"];
function pipelineExportRows(list){
  return list.map(({area, item})=>[
    item.id, area.key, area.title, item.title, item.company || "", normalizeStage(item.stage),
    (bucketMetaByKey(itemBucketKey(item, area)) || {}).label || "",
    item.amount ?? "", item.prob ?? "", item.internalOwner || "", item.contactName || "",
    item.contactPhone || "", item.contactEmail || "", item.nextAction || "", item.action || "",
    item.lastContact || "", item.tag || "", item.memo || ""
  ].map(value=>value === null || value === undefined ? "" : String(value)));
}
async function exportPipelineWorkbook(){
  const list = pipeDeals();
  if(!list.length){ showToast("내보낼 영업 항목이 없습니다."); return; }
  await withHeavyFeatures(async ()=>{
    try{
      const blob = await buildSheetWorkbook([{name:PIPELINE_SHEET_NAME, rows:[PIPELINE_SHEET_HEADERS, ...pipelineExportRows(list)]}]);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `hlb_crm_pipeline_${todayStr()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove(); }, 500);
      showToast(`영업 항목 ${list.length}건을 Excel로 내보냈습니다. 항목ID를 지우지 않으면 다시 가져올 때 같은 항목을 수정합니다.`, "info", 6000);
    }catch(error){
      console.error("pipeline export failed", error);
      showToast(error?.message || "Excel 파일을 만들지 못했습니다.");
    }
  });
}
function pipelineRowToDeal(headers, values){
  const get = (label)=>{
    const index = headers.indexOf(label);
    return index < 0 ? "" : String(values[index] ?? "").trim();
  };
  return {
    id: get("항목ID"),
    areaKey: get("그룹키"),
    areaTitle: get("그룹"),
    title: get("고객사/영업건"),
    company: get("고객사"),
    stage: get("단계"),
    amount: get("예상매출(백만)"),
    prob: get("확률(%)"),
    internalOwner: get("내부 담당자"),
    contactName: get("고객 담당자"),
    contactPhone: get("고객 연락처"),
    contactEmail: get("고객 이메일"),
    nextAction: get("다음 연락일"),
    action: get("다음에 할 일"),
    lastContact: get("최근 접촉일"),
    tag: get("태그"),
    memo: get("메모")
  };
}
async function importPipelineWorkbook(file){
  if(!requireEditPermission()) return;
  await withHeavyFeatures(async ()=>{
    let rows;
    try{
      const sheets = await workbookSheetRows(await file.arrayBuffer());
      rows = sheets.get(PIPELINE_SHEET_NAME) || [...sheets.values()][0];
    }catch(error){
      console.error("pipeline import read failed", error);
      showToast(error?.message || "Excel 파일을 읽지 못했습니다.");
      return;
    }
    if(!rows || rows.length < 2){ showToast("데이터 행이 없습니다. CRM에서 내보낸 Excel 파일인지 확인해 주세요."); return; }
    const headers = rows[0].map(value=>String(value ?? "").trim());
    if(!headers.includes("고객사/영업건")){ showToast("'고객사/영업건' 열이 없습니다. CRM에서 내보낸 Excel 파일인지 확인해 주세요."); return; }
    const touched = new Set();
    let added = 0, updated = 0, skipped = 0;
    for(const values of rows.slice(1)){
      const parsed = pipelineRowToDeal(headers, values);
      if(!parsed.title){ skipped++; continue; }
      const area = findAreaByKey(parsed.areaKey) || AREAS.find(entry=>entry.title === parsed.areaTitle) || AREAS[0];
      if(!area){ skipped++; continue; }
      const patch = {
        title: parsed.title,
        company: parsed.company,
        stage: STAGE_OPTIONS.includes(parsed.stage) ? parsed.stage : "",
        amount: parsed.amount === "" ? null : Number(parsed.amount),
        prob: parsed.prob === "" ? null : Number(parsed.prob),
        internalOwner: parsed.internalOwner,
        contactName: parsed.contactName,
        contactPhone: parsed.contactPhone,
        contactEmail: parsed.contactEmail,
        nextAction: parsed.nextAction,
        action: parsed.action,
        lastContact: parsed.lastContact,
        tag: parsed.tag,
        memo: parsed.memo
      };
      const existing = parsed.id ? findDeal(area.key, parsed.id) : null;
      if(existing){
        Object.entries(patch).forEach(([key, value])=>{
          if(value === "" || value === null || (typeof value === "number" && Number.isNaN(value))) return;
          existing.item[key] = value;
        });
        touched.add(area.key);
        updated++;
      }else{
        const created = normalizeItem({
          id: uid(),
          ...Object.fromEntries(Object.entries(patch).filter(([, value])=>value !== "" && value !== null && !(typeof value === "number" && Number.isNaN(value))))
        });
        if(!created.stage) created.stage = STAGE_OPTIONS[0] || "리드";
        (stageData[area.key] = stageData[area.key] || []).push(created);
        touched.add(area.key);
        added++;
      }
    }
    if(!touched.size){ showToast(`가져올 행이 없습니다. (건너뜀 ${skipped}건)`); return; }
    try{
      await storageTransaction([...touched].map(areaKey=>({key:"tinico:stage:" + areaKey, value:stageData[areaKey]})));
    }catch(error){
      console.error("pipeline import save failed", error);
      showToast(error?.message || "가져온 내용을 저장하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }
    [...touched].forEach(areaKey=>{ const area = findAreaByKey(areaKey); if(area) renderStageBody(area); });
    renderPipeline(true);
    renderHome();
    showToast(`Excel 가져오기 완료: 신규 ${added}건, 수정 ${updated}건, 건너뜀 ${skipped}건.`, "info", 6000);
  });
}

/* =========================================================================
   AI 비서 확장 — 활동 요약 초안과 다음 액션 추천
   외부 모델을 호출하지 않고, 지금 화면에 있는 데이터와 단계별 기준으로
   초안을 만든다. 사용자가 고쳐 쓰는 것을 전제로 한다.
   ========================================================================= */
const AI_ACTIVITY_RESULT_RULES = [
  [/거절|취소|중단|반려|보류/, "고객이 보류·중단 의사를 밝힘. 사유와 재확인 시점 확인 필요"],
  [/견적|단가|가격|비용/, "견적 조건을 검토 중. 금액·납기 회신 예정"],
  [/샘플|시험|테스트|평가/, "샘플·시험 진행 중. 결과 회신 예정"],
  [/계약|발주|수주|구매/, "계약·발주 절차 진행. 내부 승인 일정 확인 필요"],
  [/검토|확인|회신|답변/, "고객 내부 검토 중. 회신 예정"],
  [/미팅|방문|면담|회의/, "미팅에서 요구사항을 공유받음. 후속 자료 정리 필요"]
];
const AI_NEXT_ACTION_BY_STAGE = {
  "리드":"적용 목적·예상 물량·의사결정 담당자를 확인하고 첫 상담 일정을 잡기",
  "상담":"요구 규격과 샘플 조건을 정리해 제안 범위를 확정하기",
  "제안":"제안·견적 수신 여부와 이견을 확인하고 답변 기한을 받기",
  "협상":"가격·납기 조건을 확정하고 최종 승인자와 발주 목표일을 확인하기",
  "보류":"보류 사유를 확인하고 재확인 날짜를 정하기",
  "수주":"납품 일정과 후속 발주 가능성을 확인하기",
  "실주":"실주 사유와 재접촉 가능 시점을 기록하기"
};
function aiActivityResultDraft(type, content){
  const text = String(content || "");
  const rule = AI_ACTIVITY_RESULT_RULES.find(([pattern])=>pattern.test(text));
  if(rule) return rule[1];
  return `${type} 내용 공유 완료. 고객 회신 대기`;
}
function aiNextActionDraft(item, type, content){
  const stage = normalizeStage(item.stage);
  const text = String(content || "");
  if(/샘플|시험|테스트/.test(text)) return "시험·샘플 결과 회신 여부 확인";
  if(/견적|단가|가격/.test(text)) return "견적 조건에 대한 고객 의견 확인";
  if(/자료|카탈로그|소개서|제안서/.test(text)) return "전달한 자료의 검토 결과 확인";
  return AI_NEXT_ACTION_BY_STAGE[stage] || "다음 연락 목적과 기한을 정하기";
}
function aiSuggestedNextDate(days){
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0,10);
}
/* 활동 모달의 "AI 요약 작성" — 결과·다음 할 일·다음 액션일 빈칸을 채운다 */
function fillActivitySummaryDraft(){
  if(!activityDealRef) return;
  const found = findDeal(activityDealRef.areaKey, activityDealRef.id);
  if(!found) return;
  const type = document.getElementById("activity-type").value;
  const content = document.getElementById("activity-content").value.trim();
  if(!content){ showToast("먼저 활동 내용을 입력하면 요약 초안을 만들 수 있습니다."); return; }
  const result = document.getElementById("activity-result");
  const nextAction = document.getElementById("activity-next-action");
  const nextDate = document.getElementById("activity-next-date");
  let filled = 0;
  if(result && !result.value.trim()){ result.value = aiActivityResultDraft(type, content); filled++; }
  if(nextAction && !nextAction.value.trim()){ nextAction.value = aiNextActionDraft(found.item, type, content); filled++; }
  if(nextDate && !nextDate.value){ nextDate.value = aiSuggestedNextDate(isClosedStage(found.item.stage) ? 14 : 7); filled++; }
  showToast(filled ? "AI 초안을 채웠습니다. 실제 상황에 맞게 고쳐 주세요." : "이미 입력된 항목은 덮어쓰지 않습니다. 비운 뒤 다시 눌러 보세요.", "info", 4500);
}
/* 항목 상세의 "다음 액션 추천" — 무엇을 언제 할지 제안하고 원하면 바로 넣는다 */
function aiNextActionRecommendation(areaKey, id){
  const found = findDeal(areaKey, id);
  if(!found) return null;
  const item = found.item;
  const stage = normalizeStage(item.stage);
  const last = [item.lastContact || "", ...(item.activities || []).map(activity=>activityDateValue(activity).slice(0,10))]
    .filter(Boolean).sort().at(-1) || "";
  const gap = last ? Math.abs(daysUntil(last)) : null;
  const latest = (item.activities || [])[0];
  const action = latest ? aiNextActionDraft(item, latest.type, latest.content) : (AI_NEXT_ACTION_BY_STAGE[stage] || "다음 연락 목적과 기한을 정하기");
  const urgent = gap === null || gap >= ACTIVITY_STALE_DAYS || (item.nextAction && daysUntil(item.nextAction) < 0);
  const reasons = [
    `현재 단계 ${stage}`,
    last ? `마지막 접촉 ${last} (${gap}일 전)` : "접촉 기록 없음",
    item.nextAction ? `등록된 다음 연락일 ${item.nextAction}` : "다음 연락일 미지정"
  ];
  return {action, date: aiSuggestedNextDate(urgent ? 2 : 7), reasons, urgent};
}
async function applyAiNextAction(areaKey, id){
  if(!requireEditPermission()) return;
  const found = findDeal(areaKey, id);
  const suggestion = aiNextActionRecommendation(areaKey, id);
  if(!found || !suggestion) return;
  const message = [`추천 다음 액션:`, `· 할 일: ${suggestion.action}`, `· 권장 일자: ${suggestion.date}`, "", "판단 근거:",
    ...suggestion.reasons.map(reason=>`· ${reason}`), "", "이 내용을 항목에 넣을까요?"].join("\n");
  if(!confirm(message)) return;
  const previous = {action: found.item.action, nextAction: found.item.nextAction};
  found.item.action = suggestion.action;
  found.item.nextAction = suggestion.date;
  const saved = await saveOrRollback(
    ()=>saveArea(areaKey),
    ()=>{ found.item.action = previous.action; found.item.nextAction = previous.nextAction; },
    "다음 액션 저장에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요."
  );
  if(!saved) return;
  renderStageBody(found.area);
  renderPipeline(true);
  renderHome();
  if(selectedDealRef && selectedDealRef.id === id) renderDealDrawer(false);
  showToast("추천 다음 액션을 반영했습니다.", "info", 3500);
}

async function init(){
  buildNav();
  setupCloudStorageUi();
  setupMemberGateUi();
  const d = new Date();
  document.getElementById("tn-today-chip").textContent = `${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()}.`;

  await ensureCloudConnection();
  await ensureMemberSession();
  beginBootWrites();
  /* 서로 독립적인 데이터를 병렬로 불러와 부팅 시 서버 왕복 대기를 최소화
     (중요도 설정은 분류(버킷) 정의를 참조하므로 그 둘만 순서 유지) */
  const [loadedCalendarEntries, loadedAreas, loadedRoadmap, loadedManualSections, loadedContacts, loadedPersonas] = await Promise.all([
    loadCalendarEntries(),
    loadAreas(),
    loadRoadmap(),
    loadManualSections(),
    loadContacts(),
    loadPersonas(),
    loadAppSettings(),
    loadTrash(),
    loadStageSettings(),
    loadBucketSettings().then(()=>loadImportanceConfig())
  ]);
  calendarEntries = loadedCalendarEntries;
  AREAS = loadedAreas;
  initializeCalendarUi();

  const missingDefaultAreas = DEFAULT_AREAS
    .filter(def => !AREAS.some(a => a.key === def.key))
    .map(def => ({key:def.key, bucket:def.bucket, icon:def.icon, color:def.color, colorSoft:def.colorSoft, title:def.title, subtitle:def.subtitle}));
  if(missingDefaultAreas.length){
    AREAS = [...missingDefaultAreas, ...AREAS];
    await queueBootWrite("tinico:areas", AREAS.map(storedAreaValue));
  }

  await Promise.all(AREAS.map(async area=>{
    stageData[area.key] = await loadStageItems(area.key);
  }));
  await cleanupLegacyDefaultPipelineItems();
  /* 초기화 중 모아 둔 정규화·마이그레이션 저장을 한 번에 반영 */
  await flushBootWrites();
  for(const area of AREAS){
    buildStageView(area);
    renderStageBody(area);
  }

  roadmapData = loadedRoadmap;
  manualSections = loadedManualSections;
  renderRoadmap();
  renderManualSettings();
  document.getElementById("roadmap-add-btn").addEventListener("click", ()=>openRoadmapModal());
  ["roadmap-search","roadmap-type-filter","roadmap-status-filter","roadmap-owner-filter","roadmap-priority-filter","roadmap-sort"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.addEventListener(id==="roadmap-search"?"input":"change",renderRoadmap);
  });
  document.getElementById("roadmap-list").addEventListener("click",async e=>{
    const edit=e.target.closest("[data-task-edit]"); const del=e.target.closest("[data-task-delete]");
    if(edit) openRoadmapModal(edit.dataset.taskEdit);
    if(del) await deleteRoadmapTask(del.dataset.taskDelete);
  });
  document.getElementById("roadmap-list").addEventListener("change",async e=>{
    const sel=e.target.closest("[data-task-status]"); if(sel) await quickChangeRoadmapStatus(sel.dataset.taskStatus,sel.value);
  });
  document.getElementById("roadmap-modal-cancel").addEventListener("click",closeRoadmapModal);
  document.getElementById("roadmap-modal-save").addEventListener("click",saveRoadmapModal);
  document.getElementById("roadmap-modal-delete").addEventListener("click",()=>deleteRoadmapTask(editingRoadmapId));
  document.getElementById("roadmap-modal-ai").addEventListener("click",()=>{const id=editingRoadmapId;if(!id)return;closeRoadmapModal();openAiForTask(id);});
  document.getElementById("roadmap-modal-status").addEventListener("change",e=>{ if(e.target.value==="완료") document.getElementById("roadmap-modal-progress").value=100; });
  document.getElementById("roadmap-modal-deal").addEventListener("change",updateRoadmapRelationUi);
  document.getElementById("roadmap-modal-inherit-owner").addEventListener("change",updateRoadmapRelationUi);
  document.getElementById("roadmap-modal-owner").addEventListener("input",e=>{if(!e.target.disabled)e.target.dataset.manualOwner=e.target.value;});
  document.getElementById("roadmap-open-pipeline").addEventListener("click",()=>showView("pipeline"));
  document.getElementById("roadmap-modal-overlay").addEventListener("click",e=>{if(e.target.id==="roadmap-modal-overlay")closeRoadmapModal();});

  /* 파이프라인 도구·딜 드로어 이벤트 연결 */
  document.getElementById("pipe-search").addEventListener("input", debounce(()=>{pipePage=1;renderPipeline(true);}, 200));
  document.getElementById("pipe-page-first").addEventListener("click", ()=>goToPipePage(1));
  document.getElementById("pipe-page-prev").addEventListener("click", ()=>goToPipePage(pipePage - 1));
  document.getElementById("pipe-page-next").addEventListener("click", ()=>goToPipePage(pipePage + 1));
  document.getElementById("pipe-page-last").addEventListener("click", ()=>goToPipePage(pipePageCount(pipeDeals().length)));
  document.getElementById("pipe-page-size").addEventListener("change", (e)=>setPipePageSize(e.target.value));
  ["pipe-bucket-filter","pipe-area-filter","pipe-owner-filter","pipe-stage-filter","pipe-sort"].forEach(id=>{
    /* 조건이 바뀌면 결과가 달라지므로 첫 페이지부터 본다 */
    document.getElementById(id).addEventListener("change", ()=>{pipePage=1;renderPipeline(true);});
  });
  document.getElementById("pipe-view-board").addEventListener("click", ()=>{ pipeViewMode = "board"; renderPipeline(true); });
  document.getElementById("pipe-view-table").addEventListener("click", ()=>{ pipeViewMode = "table"; renderPipeline(true); });
  document.getElementById("pipe-new-deal").addEventListener("click", ()=>pipeCreateDeal(STAGE_OPTIONS[0] || "리드"));
  document.getElementById("importance-config-btn").addEventListener("click", openImportanceModal);
  document.getElementById("importance-cancel").addEventListener("click", closeImportanceModal);
  document.getElementById("importance-save").addEventListener("click", saveImportanceModal);
  document.getElementById("importance-reset").addEventListener("click", ()=>fillImportanceForm(DEFAULT_IMPORTANCE_CONFIG));
  document.getElementById("importance-modal-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "importance-modal-overlay") closeImportanceModal();
  });
  document.getElementById("settings-stage-add").addEventListener("click", ()=>openStageModal("add"));
  document.getElementById("settings-bucket-add").addEventListener("click", ()=>openBucketModal("add"));
  document.getElementById("settings-group-add").addEventListener("click", ()=>openAreaModal("add"));
  document.getElementById("settings-mode-config").addEventListener("click", ()=>setSettingsMode("config"));
  document.getElementById("settings-mode-manual").addEventListener("click", ()=>setSettingsMode("manual"));
  document.getElementById("manual-search").addEventListener("input",renderManualSettings);
  document.getElementById("manual-add-btn").addEventListener("click",()=>openManualModal());
  document.getElementById("manual-reset-btn").addEventListener("click",resetManualSections);
  document.getElementById("settings-manual-list").addEventListener("click",async e=>{
    const edit=e.target.closest("[data-manual-edit]"); const del=e.target.closest("[data-manual-delete]"); const up=e.target.closest("[data-manual-up]"); const down=e.target.closest("[data-manual-down]");
    if(edit) openManualModal(edit.dataset.manualEdit);
    if(del) await deleteManualSection(del.dataset.manualDelete);
    if(up) await moveManualSection(up.dataset.manualUp,-1);
    if(down) await moveManualSection(down.dataset.manualDown,1);
  });
  document.getElementById("manual-modal-cancel").addEventListener("click",closeManualModal);
  document.getElementById("manual-modal-save").addEventListener("click",saveManualModal);
  document.getElementById("manual-modal-delete").addEventListener("click",()=>deleteManualSection(editingManualId));
  document.getElementById("manual-modal-overlay").addEventListener("click",e=>{if(e.target.id==="manual-modal-overlay")closeManualModal();});
  document.getElementById("settings-stage-list").addEventListener("click", async (e)=>{
    const edit = e.target.closest("[data-edit-stage]");
    const del = e.target.closest("[data-delete-stage]");
    if(edit) openStageModal("edit", edit.dataset.editStage);
    if(del) await deleteStageFromSettings(del.dataset.deleteStage);
  });
  document.getElementById("settings-bucket-list").addEventListener("click", async (e)=>{
    const edit = e.target.closest("[data-edit-bucket]");
    const del = e.target.closest("[data-delete-bucket]");
    if(edit) openBucketModal("edit", edit.dataset.editBucket);
    if(del) await deleteBucketFromSettings(del.dataset.deleteBucket);
  });
  document.getElementById("settings-group-list").addEventListener("click", async (e)=>{
    const edit = e.target.closest("[data-edit-group]");
    const del = e.target.closest("[data-delete-group]");
    if(edit) openAreaModal("edit", edit.dataset.editGroup);
    if(del) await deleteGroupFromSettings(del.dataset.deleteGroup);
  });
  document.getElementById("stage-modal-save").addEventListener("click", saveStageModal);
  document.getElementById("stage-modal-cancel").addEventListener("click", closeStageModal);
  document.getElementById("stage-modal-delete").addEventListener("click", ()=>deleteStageFromSettings(stageEditingName));
  document.getElementById("stage-modal-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "stage-modal-overlay") closeStageModal();
  });
  document.getElementById("bucket-modal-save").addEventListener("click", saveBucketModal);
  document.getElementById("bucket-modal-cancel").addEventListener("click", closeBucketModal);
  document.getElementById("bucket-modal-delete").addEventListener("click", ()=>deleteBucketFromSettings(bucketEditingKey));
  document.getElementById("bucket-modal-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "bucket-modal-overlay") closeBucketModal();
  });
  document.getElementById("deal-drawer-save").addEventListener("click",()=>{if(selectedDealRef)commitDealDraft(selectedDealRef.areaKey,selectedDealRef.id);});
  document.getElementById("deal-drawer-cancel").addEventListener("click",closeDealDrawer);
  document.getElementById("contact-drawer-save").addEventListener("click",()=>{if(selectedContactId)commitContactDraft(selectedContactId);});
  document.getElementById("contact-drawer-cancel").addEventListener("click",closeContactDetail);
  window.addEventListener("beforeunload",event=>{if([...dealDrafts.values(),...contactDrafts.values()].some(draft=>draftDirty(draft)||draft.saving)){event.preventDefault();event.returnValue="";}});
  document.getElementById("deal-drawer-close").addEventListener("click", closeDealDrawer);
  document.getElementById("deal-drawer-backdrop").addEventListener("click", closeDealDrawer);
  document.getElementById("activity-cancel").addEventListener("click", closeActivityModal);
  document.getElementById("activity-save").addEventListener("click", saveActivityModal);
  document.getElementById("activity-overlay").addEventListener("click",e=>{if(e.target.id==="activity-overlay")closeActivityModal();});
  document.getElementById("top-beginner-toggle").addEventListener("click",()=>setBeginnerMode(!appSettings.beginnerMode));
  document.getElementById("top-help-btn").addEventListener("click",openOnboarding);
  initDashboardReorder();
  document.getElementById("kpi-modal-close").addEventListener("click",closeKpiDetails);
  document.getElementById("kpi-overlay").addEventListener("click",event=>{if(event.target.id==="kpi-overlay")closeKpiDetails();});
  document.getElementById("kpi-overlay").addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeKpiDetails();}
    if(event.key==="Tab"){
      const buttons=[...document.querySelectorAll("#kpi-overlay button:not(:disabled)")],first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  document.getElementById("tn-today-refresh").addEventListener("click",renderTodayTasks);
  document.getElementById("tn-today-collapse").addEventListener("click",()=>toggleDashboardSection("today"));
  document.getElementById("tn-groups-collapse").addEventListener("click",()=>toggleDashboardSection("groups"));
  document.getElementById("tn-home-logo").addEventListener("click",()=>showView("home"));
  document.getElementById("onboarding-close").addEventListener("click",closeOnboarding);
  document.getElementById("onboarding-contact").addEventListener("click",()=>{closeOnboarding();handleStartAction("contact");});
  document.getElementById("onboarding-deal").addEventListener("click",()=>{closeOnboarding();handleStartAction("deal");});
  document.getElementById("onboarding-overlay").addEventListener("click",e=>{if(e.target.id==="onboarding-overlay")closeOnboarding();});
  document.getElementById("tn-undo-btn").addEventListener("click",()=>{if(undoTrashId)restoreTrashEntry(undoTrashId);});
  document.getElementById("settings-beginner-toggle").addEventListener("click",()=>setBeginnerMode(!appSettings.beginnerMode));
  document.getElementById("settings-onboarding-open").addEventListener("click",openOnboarding);
  document.getElementById("settings-clear-seed").addEventListener("click",clearSeedDeals);
  document.getElementById("settings-admin-open").addEventListener("click",openAdminModal);
  document.getElementById("settings-admin-form").addEventListener("submit",submitAdminAuthentication);
  document.getElementById("settings-admin-cancel").addEventListener("click",closeAdminModal);
  document.getElementById("settings-admin-overlay").addEventListener("click",e=>{if(e.target.id==="settings-admin-overlay")closeAdminModal();});
  document.getElementById("settings-backup-export").addEventListener("click",exportFullBackup);
  document.getElementById("settings-backup-import").addEventListener("click",()=>document.getElementById("settings-backup-input").click());
  document.getElementById("settings-backup-input").addEventListener("change",async e=>{const f=e.target.files[0];e.target.value="";if(f)await importFullBackup(f);});
  document.getElementById("settings-trash-collapse").addEventListener("click",toggleTrashCollapsed);
  document.getElementById("settings-trash-empty").addEventListener("click",emptyTrash);
  document.getElementById("settings-trash-list").addEventListener("click",e=>{const r=e.target.closest("[data-restore-trash]");const d=e.target.closest("[data-delete-trash]");if(r)restoreTrashEntry(r.dataset.restoreTrash);if(d)permanentlyDeleteTrash(d.dataset.deleteTrash);});

  /* 연락처 초기화 및 이벤트 연결 */
  contactsData = loadedContacts;
  contactViewMode = "table";
  renderContacts();
  document.getElementById("contact-scan-btn").addEventListener("click", ()=>withHeavyFeatures(()=>openScanner()));
  document.getElementById("contact-upload-btn").addEventListener("click", ()=>{
    pendingImageTargetId = null;
    loadHeavyFeatures().then(()=>getOcrWorkerPool()).catch(()=>{});
    document.getElementById("contact-file-input").click();
  });
  document.getElementById("company-search-google").addEventListener("click", ()=>withHeavyFeatures(()=>openCompanySearchEngine("google")));
  document.getElementById("company-search-naver").addEventListener("click", ()=>withHeavyFeatures(()=>openCompanySearchEngine("naver")));
  document.getElementById("company-search-lens").addEventListener("click", ()=>withHeavyFeatures(()=>openCompanySearchEngine("lens")));
  document.getElementById("company-search-download").addEventListener("click", ()=>withHeavyFeatures(()=>downloadCompanySearchImage()));
  document.getElementById("company-search-cancel").addEventListener("click", ()=>withHeavyFeatures(()=>closeCompanySearchModal()));
  document.getElementById("company-search-save").addEventListener("click", ()=>withHeavyFeatures(()=>saveConfirmedCompanyName()));
  document.getElementById("company-search-name").addEventListener("keydown", (e)=>{
    if(e.key === "Enter") withHeavyFeatures(()=>saveConfirmedCompanyName());
  });
  document.getElementById("company-search-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "company-search-overlay") withHeavyFeatures(()=>closeCompanySearchModal());
  });
  document.getElementById("contact-manual-btn").addEventListener("click", async ()=>{
    const ct = normalizeContact({id:uid(), createdAt: todayStr()});
    openContactDetail(ct);
  });
  document.getElementById("contact-file-input").addEventListener("change", async (e)=>{
    const f = e.target.files[0];
    e.target.value = "";
    if(f) await withHeavyFeatures(()=>handlePickedImage(f));
  });
  document.getElementById("contact-camera-input").addEventListener("change", async (e)=>{
    const f = e.target.files[0];
    e.target.value = "";
    if(f) await withHeavyFeatures(()=>handlePickedImage(f, {cameraFallback:true}));
  });
  document.getElementById("contact-search").addEventListener("input", debounce(resetContactPage, 200));
  document.getElementById("contact-sort").addEventListener("change", resetContactPage);
  /* "모두 선택"은 지금 보이는 페이지의 연락처만 대상으로 한다 */
  document.getElementById("contact-select-all").addEventListener("change", (e)=>{
    contactPageItems(filteredContacts()).forEach(c=>{ if(e.target.checked) selectedContactIds.add(c.id); else selectedContactIds.delete(c.id); });
    renderContacts();
  });
  document.getElementById("contact-page-first").addEventListener("click", ()=>goToContactPage(1));
  document.getElementById("contact-page-prev").addEventListener("click", ()=>goToContactPage(contactPage - 1));
  document.getElementById("contact-page-next").addEventListener("click", ()=>goToContactPage(contactPage + 1));
  document.getElementById("contact-page-last").addEventListener("click", ()=>goToContactPage(contactPageCount(filteredContacts().length)));
  document.getElementById("contact-page-size").addEventListener("change", (e)=>setContactPageSize(e.target.value));
  document.getElementById("contact-csv-upload-btn").addEventListener("click", ()=>document.getElementById("contact-csv-input").click());
  document.getElementById("contact-csv-input").addEventListener("change", async (e)=>{
    const file=e.target.files[0]; e.target.value=""; if(file) await importContactsCsv(file);
  });
  document.getElementById("contact-export-btn").addEventListener("click", exportContactsCsv);
  document.getElementById("contact-bulk-delete-btn").addEventListener("click", deleteSelectedContacts);
  document.getElementById("contact-drawer-close").addEventListener("click", closeContactDetail);
  document.getElementById("contact-drawer-backdrop").addEventListener("click", closeContactDetail);
  document.getElementById("scan-cancel").addEventListener("click", ()=>withHeavyFeatures(()=>closeScanner()));
  document.getElementById("scan-torch").addEventListener("click", ()=>withHeavyFeatures(()=>toggleScannerTorch()));
  document.getElementById("scan-capture").addEventListener("click", ()=>withHeavyFeatures(()=>captureScan()));
  document.getElementById("scan-videowrap").addEventListener("click", ()=>withHeavyFeatures(()=>refocusScanner()));
  document.getElementById("scan-modal-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "scan-modal-overlay") withHeavyFeatures(()=>closeScanner());
  });
  document.getElementById("img-viewer-overlay").addEventListener("click", ()=>{
    document.getElementById("img-viewer-overlay").hidden = true;
  });

  /* AI 봇 초기화 및 이벤트 연결 */
  aiPersonas = loadedPersonas;
  currentPersonaId = aiPersonas[0].id;
  renderPersonaSelect();
  document.getElementById("ai-fab").addEventListener("click", (e)=>{toggleAiChat(true);if(e.target&&e.target.id==="ai-fab-badge")sendAiMessage("긴급 알림");});
  document.getElementById("ai-chat-close").addEventListener("click", ()=>toggleAiChat(false));
  document.getElementById("ai-brief-open").addEventListener("click", ()=>{toggleAiChat(true);sendAiMessage("오늘 브리핑");});
  document.getElementById("ai-chat-clear").addEventListener("click", ()=>{const p=currentPersona();if(!confirm(`${p.name}의 현재 대화를 지울까요?`))return;delete aiChatHistories[p.id];renderChatHistory();});
  document.getElementById("ai-help-open").addEventListener("click", ()=>document.getElementById("ai-help-overlay").hidden=false);
  document.getElementById("ai-help-close").addEventListener("click", ()=>document.getElementById("ai-help-overlay").hidden=true);
  document.getElementById("ai-help-overlay").addEventListener("click", e=>{if(e.target.id==="ai-help-overlay")e.currentTarget.hidden=true;});
  document.getElementById("ai-context-clear").addEventListener("click", ()=>setAiContext(null));
  document.getElementById("ai-status-urgent").addEventListener("click", ()=>sendAiMessage("긴급 알림"));
  document.getElementById("ai-status-warn").addEventListener("click", ()=>sendAiMessage("이번 주 일정"));
  document.getElementById("ai-status-active").addEventListener("click", ()=>sendAiMessage("파이프라인 현황"));
  document.getElementById("ai-send").addEventListener("click", ()=>{
    const input = document.getElementById("ai-input");
    sendAiMessage(input.value);
    input.value = "";
  });
  document.getElementById("ai-input").addEventListener("keydown", (e)=>{
    if(e.key === "Enter" && !e.isComposing){
      sendAiMessage(e.target.value);
      e.target.value = "";
    }
  });
  document.getElementById("ai-persona-select").addEventListener("change", (e)=>{
    currentPersonaId = e.target.value;
    renderChatHistory();
  });
  document.getElementById("ai-persona-manage").addEventListener("click", ()=>{
    renderPersonaList();
    document.getElementById("ai-persona-overlay").hidden = false;
  });
  document.getElementById("ai-persona-close").addEventListener("click", ()=>{
    document.getElementById("ai-persona-overlay").hidden = true;
  });
  document.getElementById("ai-persona-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "ai-persona-overlay") document.getElementById("ai-persona-overlay").hidden = true;
  });
  document.getElementById("ai-persona-add").addEventListener("click", async ()=>{
    const name = document.getElementById("ai-p-name").value.trim();
    const desc = document.getElementById("ai-p-desc").value.trim();
    const focus = document.getElementById("ai-p-focus").value;
    if(!name){ showToast("AI 이름을 입력하세요."); return; }
    const p = {id:uid(), name, desc: desc || "균형 잡힌 조언", focus, builtin:false};
    aiPersonas.push(p);
    await savePersonas();
    currentPersonaId = p.id;
    renderPersonaSelect();
    renderPersonaList();
    document.getElementById("ai-p-name").value = "";
    document.getElementById("ai-p-desc").value = "";
    document.getElementById("ai-persona-overlay").hidden = true;
    toggleAiChat(true);
  });

  /* ---- 사용자 계정 (로그인 화면 자체는 setupMemberGateUi에서 먼저 연결했다) ---- */
  document.getElementById("settings-member-add").addEventListener("click", ()=>openMemberModal(""));
  document.getElementById("settings-member-list").addEventListener("click", (e)=>{
    const edit=e.target.closest("[data-edit-member]");
    if(edit) openMemberModal(edit.dataset.editMember);
  });
  document.getElementById("member-modal-cancel").addEventListener("click", closeMemberModal);
  document.getElementById("member-modal-save").addEventListener("click", saveMemberModal);
  document.getElementById("member-modal-delete").addEventListener("click", deleteMemberFromModal);
  document.getElementById("member-modal-overlay").addEventListener("click", (e)=>{
    if(e.target.id==="member-modal-overlay") closeMemberModal();
  });

  /* ---- 변경 이력 ---- */
  document.getElementById("settings-audit-refresh").addEventListener("click", ()=>{auditState.page=1;loadAuditPage();});
  document.getElementById("audit-search").addEventListener("input", debounce(()=>{auditState.page=1;loadAuditPage();}, 350));
  ["audit-screen","audit-action","audit-range","audit-actor"].forEach(id=>{
    document.getElementById(id).addEventListener("change", ()=>{auditState.page=1;loadAuditPage();});
  });
  document.getElementById("audit-page-size").addEventListener("change", (e)=>{
    auditState.size=Number(e.target.value)||20;auditState.page=1;loadAuditPage();
  });
  document.getElementById("audit-page-first").addEventListener("click", ()=>goToAuditPage(1));
  document.getElementById("audit-page-prev").addEventListener("click", ()=>goToAuditPage(auditState.page-1));
  document.getElementById("audit-page-next").addEventListener("click", ()=>goToAuditPage(auditState.page+1));
  document.getElementById("audit-page-last").addEventListener("click", ()=>goToAuditPage(auditPageCount()));
  document.getElementById("audit-tbody").addEventListener("click", (e)=>{
    const detail=e.target.closest("[data-audit-detail]");
    if(detail) openAuditDetail(detail.dataset.auditDetail);
  });
  document.getElementById("audit-detail-close").addEventListener("click", ()=>{document.getElementById("audit-detail-overlay").hidden=true;});
  document.getElementById("audit-detail-overlay").addEventListener("click", (e)=>{
    if(e.target.id==="audit-detail-overlay") e.currentTarget.hidden=true;
  });

  /* ---- 전체 검색 ---- */
  document.getElementById("tn-search-open").addEventListener("click", globalSearchOpen);
  document.getElementById("global-search-close").addEventListener("click", globalSearchClose);
  document.getElementById("global-search-overlay").addEventListener("click", (e)=>{
    if(e.target.id==="global-search-overlay") globalSearchClose();
  });
  document.getElementById("global-search-input").addEventListener("input", debounce((e)=>renderGlobalSearch(e.target.value), 140));
  document.getElementById("global-search-input").addEventListener("keydown", (e)=>{
    if(e.key==="ArrowDown"){e.preventDefault();highlightSearchMatch(searchActiveIndex+1);}
    else if(e.key==="ArrowUp"){e.preventDefault();highlightSearchMatch(searchActiveIndex-1);}
    else if(e.key==="Enter"){e.preventDefault();runSearchMatch(searchActiveIndex);}
    else if(e.key==="Escape"){e.preventDefault();globalSearchClose();}
  });
  window.addEventListener("keydown", (e)=>{
    if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){
      e.preventDefault();
      if(document.getElementById("global-search-overlay").hidden) globalSearchOpen(); else globalSearchClose();
    }
  });

  /* ---- 활동 화면 ---- */
  document.getElementById("activity-search").addEventListener("input", debounce(renderActivityView, 200));
  ["activity-range","activity-type-filter","activity-owner-filter"].forEach(id=>{
    document.getElementById(id).addEventListener("change", renderActivityView);
  });
  document.getElementById("activity-export-btn").addEventListener("click", exportActivitiesCsv);
  document.getElementById("activity-ai-summary").addEventListener("click", fillActivitySummaryDraft);

  /* ---- 연락처 중복 정리 ---- */
  document.getElementById("contact-dedupe-btn").addEventListener("click", openDedupeModal);
  document.getElementById("dedupe-close").addEventListener("click", closeDedupeModal);
  document.getElementById("dedupe-overlay").addEventListener("click", (e)=>{
    if(e.target.id==="dedupe-overlay") closeDedupeModal();
  });
  document.getElementById("dedupe-list").addEventListener("click", (e)=>{
    const merge=e.target.closest("[data-merge-group]");
    if(merge) mergeDedupeGroups([Number(merge.dataset.mergeGroup)]);
  });
  document.getElementById("dedupe-merge-all").addEventListener("click", ()=>mergeDedupeGroups(dedupeGroups.map((_,index)=>index)));

  /* ---- 파이프라인 Excel ---- */
  document.getElementById("pipe-export-btn").addEventListener("click", exportPipelineWorkbook);
  document.getElementById("pipe-import-btn").addEventListener("click", ()=>document.getElementById("pipe-import-input").click());
  document.getElementById("pipe-import-input").addEventListener("change", async (e)=>{
    const file=e.target.files[0]; e.target.value=""; if(file) await importPipelineWorkbook(file);
  });

  document.getElementById("area-add-btn").addEventListener("click", ()=>openAreaModal("add"));
  document.getElementById("area-modal-cancel").addEventListener("click", closeAreaModal);
  document.getElementById("area-modal-save").addEventListener("click", saveAreaModal);
  document.getElementById("area-modal-delete").addEventListener("click", deleteAreaFromModal);
  document.getElementById("area-modal-overlay").addEventListener("click", (e)=>{
    if(e.target.id === "area-modal-overlay") closeAreaModal();
  });

  updateBeginnerControls();
  applyDashboardCollapse();
  updateMemberUi();
  renderSettings();
  renderHome();
  routeFromHash();
  if(!appSettings.onboardingSeen) setTimeout(openOnboarding, 120);
  window.addEventListener("hashchange", routeFromHash);
}

init().catch(error=>{
  console.error("HLB-BUSISUP CRM initialization failed",error);
  setCloudConnectionState("error","화면 오류");
  showInitializationFailure(error);
});
