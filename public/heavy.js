/* 명함 인식(OCR·카메라 스캐너)과 Excel 백업 파일 만들기·읽기.
   첫 화면에는 필요하지 않아 app.js 가 실제로 쓸 때 내려받는다. */
/* OCR (Tesseract.js) 지연 로드 — API 키 없이 브라우저에서 처리 */
let ocrLoaderPromise = null;
let ocrWorkerPoolPromise = null;
let ocrProgressLabel = "명함 인식";
let ocrPassProgress = null;
let ocrJobActive = false;
function promiseWithTimeout(promise, ms, message){
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>reject(new Error(message)), ms);
    promise.then(
      value=>{ clearTimeout(timer); resolve(value); },
      error=>{ clearTimeout(timer); reject(error); }
    );
  });
}
function loadTesseract(){
  if(window.Tesseract) return Promise.resolve();
  if(!ocrLoaderPromise){
    ocrLoaderPromise = new Promise((resolve, reject)=>{
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = resolve;
      s.onerror = ()=>{ ocrLoaderPromise = null; reject(new Error("OCR 라이브러리 로드 실패")); };
      document.head.appendChild(s);
    });
  }
  return ocrLoaderPromise;
}



function reportOcrPassProgress(){
  if(!ocrPassProgress || !ocrPassProgress.total) return;
  let active = 0;
  ocrPassProgress.current.forEach(v=>{ active += v; });
  const ratio = Math.min(1, (ocrPassProgress.done + active) / ocrPassProgress.total);
  setOcrStatus(`${ocrProgressLabel} 중... ${Math.min(99, Math.round(ratio * 100))}%`);
}
/* 저사양 기기는 1개, 그 외에는 2개 워커로 보정본 여러 장을 동시에 인식 */
function ocrWorkerCount(){
  const memory = Number(navigator.deviceMemory || 4);
  const cores = Number(navigator.hardwareConcurrency || 4);
  return memory <= 3 || cores <= 2 ? 1 : 2;
}
function describeOcrEngineStatus(m){
  const progress = Math.round(Math.max(0, Math.min(1, m.progress || 0)) * 100);
  if(m.status === "loading language traineddata") return `한국어·영어 인식 데이터를 내려받는 중... ${progress}% (최초 1회만 걸립니다)`;
  if(/loading tesseract core|initializing tesseract|initializing api/i.test(m.status || "")) return "문자 인식 엔진을 준비하는 중...";
  return "";
}
async function getOcrWorkerPool(){
  await loadTesseract();
  if(!ocrWorkerPoolPromise){
    ocrWorkerPoolPromise = Promise.all(Array.from({length: ocrWorkerCount()}, (_, index)=>
      Tesseract.createWorker("kor+eng", 1, {
        logger: m=>{
          if(m.status === "recognizing text"){
            if(ocrPassProgress){
              ocrPassProgress.current.set(index, Math.max(0, Math.min(1, m.progress || 0)));
              reportOcrPassProgress();
            }
            return;
          }
          /* 엔진·언어 데이터 다운로드 단계도 표시해 멈춘 것처럼 보이지 않게 함 */
          if(ocrJobActive){
            const message = describeOcrEngineStatus(m);
            if(message) setOcrStatus(message);
          }
        }
      })
    )).catch(e=>{
      ocrWorkerPoolPromise = null;
      throw e;
    });
  }
  return ocrWorkerPoolPromise;
}


function percentileFromHistogram(hist, total, ratio){
  const target = total * ratio;
  let sum = 0;
  for(let i=0;i<256;i++){
    sum += hist[i];
    if(sum >= target) return i;
  }
  return ratio < .5 ? 0 : 255;
}
function otsuThreshold(hist, total){
  let sum = 0;
  for(let i=0;i<256;i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 150;
  for(let i=0;i<256;i++){
    wB += hist[i];
    if(!wB) continue;
    const wF = total - wB;
    if(!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if(between > best){ best = between; threshold = i; }
  }
  return threshold;
}
async function prepareOcrVariants(dataUrl){
  const img = await loadImageFromDataUrl(dataUrl);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const longest = Math.max(naturalW, naturalH);
  /* 명함 크롭 기준 약 450~650dpi를 유지하는 범위에서 픽셀 수를 줄여 인식 시간을 단축 */
  const deviceMemory = Number(navigator.deviceMemory || 4);
  const maxLongest = deviceMemory <= 3 ? 1700 : deviceMemory <= 6 ? 2000 : 2300;
  const targetLongest = Math.min(maxLongest, Math.max(1600, longest));
  const scale = targetLongest / longest;
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const base = document.createElement("canvas");
  base.width = width; base.height = height;
  const bctx = base.getContext("2d", {willReadFrequently:true, alpha:false});
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.fillStyle = "#fff";
  bctx.fillRect(0,0,width,height);
  bctx.drawImage(img,0,0,width,height);

  const source = bctx.getImageData(0,0,width,height).data;
  const hist = new Uint32Array(256);
  const gray = new Uint8Array(width * height);
  let avg = 0;
  for(let p=0,i=0;i<source.length;i+=4,p++){
    const v = Math.round(source[i]*.299 + source[i+1]*.587 + source[i+2]*.114);
    gray[p]=v; hist[v]++; avg+=v;
  }
  avg /= Math.max(1,gray.length);
  const low = percentileFromHistogram(hist,gray.length,.008);
  const high = Math.max(low+36,percentileFromHistogram(hist,gray.length,.992));

  /* 명암 확장 + 약한 언샤프 마스크: 얇은 명함 글자 획을 살림 */
  const stretched = new Uint8Array(gray.length);
  for(let p=0;p<gray.length;p++){
    let v=(gray[p]-low)*255/(high-low);
    v=(v-128)*1.22+128;
    stretched[p]=Math.max(0,Math.min(255,Math.round(v)));
  }
  const sharpened = new Uint8Array(gray.length);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const p=y*width+x;
      const c=stretched[p];
      if(x===0||y===0||x===width-1||y===height-1){sharpened[p]=c;continue;}
      const lap=4*c-stretched[p-1]-stretched[p+1]-stretched[p-width]-stretched[p+width];
      sharpened[p]=Math.max(0,Math.min(255,Math.round(c+lap*.26)));
    }
  }

  const enhancedCanvas=document.createElement("canvas");
  enhancedCanvas.width=width; enhancedCanvas.height=height;
  const ectx=enhancedCanvas.getContext("2d",{alpha:false});
  const enhanced=ectx.createImageData(width,height);
  const enhancedHist=new Uint32Array(256);
  for(let p=0,i=0;p<sharpened.length;p++,i+=4){
    const v=sharpened[p]; enhancedHist[v]++;
    enhanced.data[i]=enhanced.data[i+1]=enhanced.data[i+2]=v; enhanced.data[i+3]=255;
  }
  ectx.putImageData(enhanced,0,0);

  /* 전체 명암이 고른 명함용 Otsu 이진화 */
  const threshold=otsuThreshold(enhancedHist,sharpened.length);
  const binaryCanvas=document.createElement("canvas");
  binaryCanvas.width=width; binaryCanvas.height=height;
  const xctx=binaryCanvas.getContext("2d",{alpha:false});
  const binary=xctx.createImageData(width,height);
  const invert=avg<108;
  for(let p=0,i=0;p<sharpened.length;p++,i+=4){
    let v=sharpened[p]>threshold?255:0;
    if(invert)v=255-v;
    binary.data[i]=binary.data[i+1]=binary.data[i+2]=v; binary.data[i+3]=255;
  }
  xctx.putImageData(binary,0,0);

  /* 그림자·조명 편차가 있는 촬영본용 지역 적응형 이진화 */
  const adaptiveCanvas=document.createElement("canvas");
  adaptiveCanvas.width=width; adaptiveCanvas.height=height;
  const actx=adaptiveCanvas.getContext("2d",{alpha:false});
  const adaptive=actx.createImageData(width,height);
  const stride=width+1;
  const integral=new Uint32Array((width+1)*(height+1));
  for(let y=1;y<=height;y++){
    let row=0;
    for(let x=1;x<=width;x++){
      row+=sharpened[(y-1)*width+(x-1)];
      integral[y*stride+x]=integral[(y-1)*stride+x]+row;
    }
  }
  const radius=Math.max(12,Math.round(Math.min(width,height)/70));
  const bias=11;
  for(let y=0,p=0;y<height;y++){
    const y0=Math.max(0,y-radius), y1=Math.min(height-1,y+radius);
    for(let x=0;x<width;x++,p++){
      const x0=Math.max(0,x-radius), x1=Math.min(width-1,x+radius);
      const A=integral[y0*stride+x0], B=integral[y0*stride+(x1+1)];
      const C=integral[(y1+1)*stride+x0], D=integral[(y1+1)*stride+(x1+1)];
      const mean=(D-B-C+A)/((x1-x0+1)*(y1-y0+1));
      let v=sharpened[p] > mean-bias ? 255 : 0;
      if(invert)v=255-v;
      const i=p*4; adaptive.data[i]=adaptive.data[i+1]=adaptive.data[i+2]=v; adaptive.data[i+3]=255;
    }
  }
  actx.putImageData(adaptive,0,0);

  /* 명함 상·하단을 겹쳐 잘라 작은 이름/연락처를 더 큰 글자로 인식하는 보조 영상 */
  function regionDataUrl(startRatio,heightRatio){
    const y=Math.max(0,Math.round(height*startRatio));
    const h=Math.max(1,Math.min(height-y,Math.round(height*heightRatio)));
    const region=document.createElement("canvas");
    region.width=width;region.height=Math.round(width*(h/width));
    const rctx=region.getContext("2d",{alpha:false});
    rctx.fillStyle="#fff";rctx.fillRect(0,0,region.width,region.height);
    rctx.drawImage(enhancedCanvas,0,y,width,h,0,0,region.width,region.height);
    return region.toDataURL("image/jpeg",.96);
  }

  return {
    enhanced: enhancedCanvas.toDataURL("image/jpeg",.96),
    binary: binaryCanvas.toDataURL("image/png"),
    adaptive: adaptiveCanvas.toDataURL("image/png"),
    upper: regionDataUrl(0,.62),
    lower: regionDataUrl(.38,.62)
  };
}


function editDistanceAtMost(a, b, max){
  if(Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({length: b.length + 1}, (_, j)=>j);
  for(let i = 1; i <= a.length; i++){
    const cur = [i];
    for(let j = 1; j <= b.length; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    }
    if(Math.min(...cur) > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function cleanOcrText(text){
  return String(text || "")
    .replace(/[‐‑‒–—]/g,"-")
    .replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
    .replace(/[＠﹫]/g,"@").replace(/[。｡]/g,".")
    /* 이메일 보정은 줄바꿈을 삼키지 않도록 공백·탭만 제거 */
    .replace(/[ \t]*@[ \t]*/g,"@")
    .replace(/([A-Za-z0-9])[ \t]*\.[ \t]*(?=[A-Za-z0-9])/g,"$1.")
    .replace(/\b(?:e[- ]?mail|메일)[ \t]*[:：]?[ \t]*/ig,"")
    .replace(/([A-Za-z0-9._%+-])[ \t]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/g,"$1$2")
    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)[ \t]+([A-Za-z]{2,})/g,"$1.$2")
    .split(/\n+/)
    .map(v=>v.replace(/[ \t]+/g," ").trim())
    .filter(Boolean)
    .join("\n");
}

function meaningfulOcrScore(text, confidence=0){
  const raw = cleanOcrText(text);
  if(!raw) return -999;
  let score = Number(confidence || 0);
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)) score += 30;
  if(/(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/.test(raw)) score += 22;
  if(/(?:주식회사|\(주\)|㈜|Group|Corp|Inc|Ltd|LLC|병원|대학교|연구소)/i.test(raw)) score += 15;
  if(/(?:^|\n)(?:[가-힣]\s*){2,4}(?:\n|$)/.test(raw)) score += 14;
  const useful = (raw.match(/[A-Za-z0-9가-힣@.+-]/g) || []).length;
  score += Math.min(25, useful / 12);
  const weird = (raw.match(/[^\sA-Za-z0-9가-힣@.,:+()\-\/|&]/g) || []).length;
  score -= weird * 1.5;
  return score;
}
function mergeOcrTexts(primary, secondary){
  const lines = [];
  const seen = new Set();
  [primary, secondary].forEach(text=>{
    cleanOcrText(text).split(/\n+/).forEach(line=>{
      const key = line.toLowerCase().replace(/[^0-9a-z가-힣]/g,"");
      if(key.length < 2 || seen.has(key)) return;
      seen.add(key); lines.push(line);
    });
  });
  return lines.join("\n");
}

/* OCR 인식 텍스트에서 이름·회사·직책·전화·이메일 자동 추출 */
function parseCardText(text){
  const raw = cleanOcrText(text);
  const out = {phone:"", mobilePhone:"", businessPhone:"", fax:"", email:"", name:"", company:"", role:"", department:"", jobTitle:"", raw};
  const emailCompact = raw.replace(/\s+/g, " ");
  const emailM = emailCompact.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if(emailM) out.email = emailM[0].replace(/[.,;:]+$/, "");
  /* 명함의 웹사이트 주소와 대조해 하이픈↔점 오독·한 글자 유실로 어긋난 이메일 도메인을 교정 */
  if(out.email){
    const emailDomain = out.email.split("@")[1] || "";
    const site = raw.match(/www\.([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,})/i);
    const flatten = s=>String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    if(site && emailDomain && site[1].toLowerCase() !== emailDomain.toLowerCase()){
      const a = flatten(site[1]), b = flatten(emailDomain);
      const tolerance = a.length >= 10 ? 2 : 1;
      if(a === b || editDistanceAtMost(a, b, tolerance) <= tolerance){
        out.email = out.email.split("@")[0] + "@" + site[1].toLowerCase();
      }
    }
  }

  const phoneLineMatches = raw.split(/\n+/).map(line=>{
    /* 전화번호 영역에서 자주 혼동되는 O↔0, I/l↔1만 제한적으로 보정 */
    const phoneLike = /(?:tel|mobile|phone|fax|전화|휴대|팩스)/i.test(line) || (line.match(/\d/g)||[]).length >= 7;
    const scanLine = phoneLike ? line.replace(/[Oo]/g,"0").replace(/[Il|]/g,"1") : line;
    return {line, values:scanLine.match(/(?:\+?82[-.\s]?)?(?:0?1[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/g)||[]};
  }).filter(x=>x.values.length);
  for(const entry of phoneLineMatches){
    for(const value of entry.values){
      const normalized = normalizePhoneNumber(value);
      if(/fax|팩스/i.test(entry.line)){ if(!out.fax) out.fax = normalized; continue; }
      if(/^01[016789]-/.test(normalized)){ if(!out.mobilePhone) out.mobilePhone = normalized; }
      else if(!out.businessPhone) out.businessPhone = normalized;
    }
  }
  out.phone = out.mobilePhone || out.businessPhone || "";

  const lines = raw.split(/\n+/).map(l=>l.trim()).filter(Boolean);
  const ROLE_RE = /(대표(?:이사)?|회장|부회장|상무|전무|이사|본부장|부장|차장|과장|대리|주임|사원|팀장|실장|소장|센터장|매니저|연구원|교수|박사|CEO|CTO|CFO|COO|President|Vice President|Manager|Director|Engineer|Researcher)/i;
  const DEPARTMENT_RE = /(팀|부|실|본부|센터|사업부|연구소|Department|Division|Team|Center|Office)$/i;
  /* 영문 법인 접미사는 단어 경계를 요구해 "group.com"의 co 같은 부분 일치를 차단 */
  const COMPANY_RE = /(주식회사|\(주\)|㈜|그룹|병원|의료원|대학교|대학|연구소|연구원|재단|협회|산업|테크|메디칼|메디컬|바이오|제약|건설|전자|솔루션|\b(?:Group|Holdings?|Corporation|Corp|Company|Co|Incorporated|Inc|Limited|Ltd|LLC|GmbH)\b\.?)/i;
  const URLISH_RE = /(?:https?:|www\.|\.(?:com|net|org|io|kr|co\.kr)\b)/i;

  for(const line of lines){
    const l = line.replace(/^[|·•,:;\-\s]+|[|·•,:;\-\s]+$/g, "").trim();
    if(!out.role && ROLE_RE.test(l) && l.length <= 42){
      out.role = l.replace(/\s*[|/]\s*/g, " / ");
      const split = splitLegacyRole(out.role);
      out.jobTitle = split.jobTitle;
      out.department = split.department;
    }
    if(!out.department && DEPARTMENT_RE.test(l) && !ROLE_RE.test(l) && l.length <= 42) out.department = l;
    /* 법인 접미사만 있는 잡음 줄과 주소·URL 줄은 제외하고, 실제 상호가 함께 있는 줄만 회사명으로 인정 */
    if(!out.company && COMPANY_RE.test(l) && l.length <= 48 && !/@/.test(l) && !URLISH_RE.test(l)
      && l.replace(COMPANY_RE, "").replace(/[^A-Za-z0-9가-힣]/g, "").length >= 2) out.company = l;
  }

  for(const line of lines){
    const compact = line.replace(/\s+/g, "");
    if(/^[가-힣]{2,4}$/.test(compact) && !ROLE_RE.test(compact) && !COMPANY_RE.test(compact)){
      out.name = compact; break;
    }
  }
  if(!out.name){
    for(const line of lines){
      const l = line.trim();
      if(/^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}$/.test(l) && !ROLE_RE.test(l) && !COMPANY_RE.test(l)){
        out.name = l; break;
      }
    }
  }
  if(!out.company){
    for(const line of lines){
      const l = line.trim();
      /* 잡음으로 생긴 2~3자 대문자 조각("LB","AAS")을 회사명으로 오인하지 않도록 최소 길이를 요구 */
      if(l.length >= 3 && l.length <= 30 && (l.includes(" ") || l.length >= 4)
        && /^[A-Z][A-Z0-9&.\- ]+(?:Group|GROUP)?$/.test(l) && !ROLE_RE.test(l)){
        out.company = l; break;
      }
    }
  }
  return out;
}

function mergeParsedCards(candidates){
  const merged = {phone:"", mobilePhone:"", businessPhone:"", fax:"", email:"", name:"", company:"", role:"", department:"", jobTitle:"", raw:""};
  for(const c of candidates){
    const p = parseCardText(c.text);
    for(const key of ["email","mobilePhone","businessPhone","fax","phone","name","company","department","jobTitle","role"]){
      if(!merged[key] && p[key]) merged[key] = p[key];
    }
  }
  merged.raw = candidates.map(c=>cleanOcrText(c.text)).filter(Boolean).reduce((acc,text)=>mergeOcrTexts(acc,text),"");
  return merged;
}

let ocrJobQueue=Promise.resolve();
async function ocrCardImage(dataUrl){
  /* 인식 작업 두 개가 동시에 워커·진행 상태를 공유하며 충돌하지 않도록 항상 순차 실행 */
  const job=ocrJobQueue.then(()=>runOcrCardImage(dataUrl));
  ocrJobQueue=job.catch(()=>{});
  return job;
}
async function runOcrCardImage(dataUrl){
  setOcrStatus("명함 이미지를 고해상도로 보정하는 중...");
  ocrJobActive = true;
  try{
  const [workers,variants]=await Promise.all([
    promiseWithTimeout(getOcrWorkerPool(), 90000, "문자 인식 엔진 다운로드가 지연되고 있습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요."),
    prepareOcrVariants(dataUrl)
  ]);
  const candidates=[];

  /* 한 라운드의 보정본들을 워커 수만큼 동시에 인식해 대기 시간을 줄임 */
  async function recognizeRound(label,jobs){
    ocrProgressLabel=label;
    ocrPassProgress={total:jobs.length,done:0,current:new Map()};
    reportOcrPassProgress();
    let next=0;
    try{
      await Promise.all(workers.map(async(worker,index)=>{
        while(next<jobs.length){
          const job=jobs[next++];
          await worker.setParameters({
            tessedit_pageseg_mode:String(job.psm),
            preserve_interword_spaces:"1",
            user_defined_dpi:"300"
          });
          const result=await worker.recognize(job.image);
          const candidate={text:result.data.text||"",confidence:result.data.confidence||0,label:job.label};
          candidate.score=meaningfulOcrScore(candidate.text,candidate.confidence);
          candidates.push(candidate);
          /* 한 워커가 실패해도 남은 워커가 null 진행 상태를 만지지 않도록 방어 */
          if(ocrPassProgress){
            ocrPassProgress.done+=1;
            ocrPassProgress.current.delete(index);
            reportOcrPassProgress();
          }
        }
      }));
    }finally{
      ocrPassProgress=null;
    }
    candidates.sort((a,b)=>b.score-a.score);
    return mergeParsedCards(candidates);
  }

  let parsed=await recognizeRound("명함 인식",[
    {label:"기본 보정 인식",image:variants.enhanced,psm:11},
    {label:"그림자 보정 인식",image:variants.adaptive,psm:11}
  ]);
  /* 이름·회사·전화·이메일 중 하나라도 비었거나 품질이 낮으면 보완 인식을 한 번에 병렬 수행 */
  const missingCore=()=>!parsed.name || !parsed.company || !parsed.email || !(parsed.mobilePhone||parsed.businessPhone);
  if(missingCore() || (candidates[0]?.score||0)<92){
    parsed=await recognizeRound("정밀 보완 인식",[
      {label:"고대비 정밀 인식",image:variants.binary,psm:6},
      {label:"이름·회사 영역 인식",image:variants.upper,psm:11},
      {label:"연락처 영역 인식",image:variants.lower,psm:11}
    ]);
  }

  return {
    text:parsed.raw,
    parsed,
    confidence:Math.round(Math.max(...candidates.map(c=>Number(c.confidence||0)))),
    passes:candidates.length
  };
  }finally{
    ocrJobActive = false;
  }
}

/* 회사명 이미지 검색: API 없이 일반 이미지 검색에서 사용자가 확인 후 저장 */
function compactOcrClues(raw){
  return String(raw || "").split(/\n+/).map(s=>s.trim()).filter(Boolean).slice(0,8).join(" · ").slice(0,300);
}
function extractEmailDomain(email){
  const m = String(email || "").toLowerCase().match(/@([a-z0-9.-]+)$/);
  if(!m) return "";
  const host = m[1].replace(/^www\./, "");
  if(/^(gmail|naver|daum|hanmail|kakao|outlook|hotmail|icloud)\./.test(host)) return "";
  return host;
}
function ocrSearchTerms(raw){
  const stop = /^(manager|director|president|ceo|cto|cfo|team|department|business|support|sales|marketing|engineer|과장|차장|부장|이사|대표|팀장|대리|사원|현장지원팀|전화|팩스|이메일|mobile|tel|fax)$/i;
  return String(raw || "").split(/\n+/)
    .map(v=>v.replace(/[|_*~]+/g," ").replace(/\s+/g," ").trim())
    .filter(v=>v.length >= 2 && v.length <= 36)
    .filter(v=>!/@|https?:|www\.|\d{3,}[-.\s]?\d{3,}/i.test(v))
    .filter(v=>!stop.test(v))
    .slice(0,4);
}
function buildCompanySearchQuery(contact, rawText=""){
  const parts = [];
  if(contact.company) parts.push(contact.company);
  const domain = extractEmailDomain(contact.email);
  if(domain) parts.push(domain, domain.split(".")[0].replace(/[-_]/g," "));
  ocrSearchTerms(rawText || contact.ocrRaw).forEach(v=>parts.push(v));
  if(contact.name) parts.push(contact.name);
  const unique = [...new Set(parts.map(v=>String(v||"").trim()).filter(Boolean))];
  return (unique.slice(0,5).join(" ") + " 회사 로고").trim();
}
function closeCompanySearchModal(){
  document.getElementById("company-search-overlay").hidden = true;
  pendingCompanyContactId = null;
}
function openCompanySearchModal(contact, rawText=""){
  if(!contact){ showToast("검색할 연락처를 찾지 못했습니다."); return; }
  if(!contactHasCardImage(contact)){ showToast("검색할 명함 이미지가 없습니다. 먼저 명함 이미지를 추가해 주세요."); return; }
  pendingCompanyContactId = contact.id;
  const previewEl = document.getElementById("company-search-image");
  previewEl.src = contact.cardImage || contact.cardThumb;
  /* 원본이 아직 메모리에 없으면 백그라운드에서 불러와 선명한 이미지로 교체 */
  if(!contact.cardImage) loadContactCardImage(contact).then(full=>{ if(full && pendingCompanyContactId === contact.id) previewEl.src = full; }).catch(()=>{});
  const clue = compactOcrClues(rawText || contact.ocrRaw);
  const domain = extractEmailDomain(contact.email);
  document.getElementById("company-search-clues").textContent = [
    domain ? `이메일 도메인: ${domain}` : "",
    clue ? `OCR 참고: ${clue}` : ""
  ].filter(Boolean).join(" / ") || "명함 이미지와 로고를 보고 검색어를 조정하세요.";
  document.getElementById("company-search-query").value = buildCompanySearchQuery(contact, rawText);
  document.getElementById("company-search-name").value = contact.company || "";
  document.getElementById("company-search-overlay").hidden = false;
  setTimeout(()=>document.getElementById("company-search-query").focus(), 0);
}
function openCompanySearchEngine(engine){
  const query = document.getElementById("company-search-query").value.trim();
  let url = "";
  if(engine === "google"){
    if(!query){ showToast("이미지 검색어를 입력하세요."); return; }
    url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
  }else if(engine === "naver"){
    if(!query){ showToast("이미지 검색어를 입력하세요."); return; }
    url = `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(query)}`;
  }else{
    url = "https://lens.google.com/";
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
async function downloadCompanySearchImage(){
  const contact = contactDrafts.get(pendingCompanyContactId)?.value;
  if(!contactHasCardImage(contact)){ showToast("저장할 명함 이미지가 없습니다."); return; }
  const image = (await loadContactCardImage(contact)) || contact.cardThumb;
  if(!image){ showToast("명함 원본 이미지를 불러오지 못했습니다. 네트워크 확인 후 다시 시도해 주세요."); return; }
  const a = document.createElement("a");
  a.href = image;
  a.download = `business_card_${(contact.name || contact.company || "contact").replace(/[^0-9A-Za-z가-힣_-]+/g,"_")}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function saveConfirmedCompanyName(){
  const contact = contactDrafts.get(pendingCompanyContactId)?.value;
  if(!contact){ closeCompanySearchModal(); return; }
  const name = document.getElementById("company-search-name").value.trim();
  if(!name){ showToast("이미지 검색에서 확인한 회사명을 입력하세요."); return; }
  if(contact.company && contact.company !== name && !confirm(`기존 회사명 "${contact.company}"을(를) "${name}"(으)로 변경할까요?`)) return;
  contact.company = name;
  contact.companyLookupAt = new Date().toISOString();
  contact.companyLookupSource = "일반 이미지 검색 사용자 확인";
  const log = `[회사명 이미지 검색 확인] ${name}`;
  if(!String(contact.memo || "").includes(log)) contact.memo = (contact.memo ? contact.memo + "\n" : "") + log;
  markDraft("contact",contactDrafts.get(contact.id));
  if(selectedContactId === contact.id) renderContactDrawer(false);
  closeCompanySearchModal();
  setOcrStatus(`회사명 "${name}"을 입력에 적용했습니다. 연락처의 저장 버튼으로 반영하세요.`);
  setTimeout(()=>setOcrStatus(""), 4500);
}
async function resolveCompanyFromImage(contact, dataUrl, rawText="", options={}){
  if(!options.force && contact.company) return true;
  if(!dataUrl){ showToast("검색할 명함 이미지가 없습니다."); return false; }
  openCompanySearchModal(contact, rawText);
  setOcrStatus("회사명이 인식되지 않았습니다. 일반 이미지 검색으로 로고를 확인한 뒤 회사명을 저장해 주세요.", "이미지 검색 열기", ()=>openCompanySearchModal(contact, rawText));
  return false;
}

/* OCR 결과를 비어 있는 필드에만 채움 (사용자 입력 및 메모 보호) */
async function applyOcrToContact(contact, dataUrl){
  const draft=contactDrafts.get(contact.id);
  if(!draft||draft.value!==contact)return false;
  draft.processing=true;if(selectedContactId===contact.id)updateEditStatus("contact",draft);
  let rawText = "";
  let ocrSucceeded = false;
  try{
    const result = await ocrCardImage(dataUrl);
    if(contactDrafts.get(contact.id)!==draft)return false;
    rawText = result.text || "";
    const p = result.parsed || parseCardText(rawText);
    if(!contact.name) contact.name = p.name;
    if(!contact.company) contact.company = p.company;
    if(!contact.jobTitle) contact.jobTitle = p.jobTitle || splitLegacyRole(p.role).jobTitle;
    if(!contact.department) contact.department = p.department || splitLegacyRole(p.role).department;
    if(!contact.mobilePhone) contact.mobilePhone = p.mobilePhone || (/^01[016789]-/.test(p.phone || "") ? p.phone : "");
    if(!contact.businessPhone) contact.businessPhone = p.businessPhone || (p.phone && !/^01[016789]-/.test(p.phone) ? p.phone : "");
    if(!contact.fax) contact.fax = p.fax || "";
    if(!contact.email) contact.email = p.email;
    syncContactLegacyFields(contact);
    /* OCR 원문은 내부 필드에만 보관하고 사용자 메모 칸에는 표시하지 않음 */
    contact.ocrRaw = p.raw || rawText;
    contact.ocrConfidence = result.confidence || 0;
    contact.ocrUpdatedAt = new Date().toISOString();
    ocrSucceeded = true;
    if(selectedContactId === contact.id) renderContactDrawer(false);
    /* 인식된 정보를 먼저 저장·표시한 뒤, 회사명 검색 등 사용자 작업은 버튼으로만 안내 (자동으로 화면을 가로막지 않음) */
    const quality=result.confidence?` · 신뢰도 ${result.confidence}%`:"";
    const saved=[];
    if(contact.name)saved.push("이름");
    if(contact.jobTitle||contact.department)saved.push("직책·부서");
    if(contact.mobilePhone||contact.businessPhone)saved.push("전화번호");
    if(contact.email)saved.push("이메일");
    if(contact.company)saved.push("회사명");
    const missing=[];
    if(!contact.name)missing.push("이름");
    if(!contact.mobilePhone&&!contact.businessPhone)missing.push("전화번호");
    if(!contact.email)missing.push("이메일");
    const savedText=saved.length?` · 인식: ${saved.join(", ")}`:"";
    const missingText=missing.length?` · 미인식: ${missing.join(", ")}`:"";
    if(!contact.company){
      setOcrStatus(`명함 인식 완료${quality}${savedText}${missingText}. 회사명은 인식되지 않아 이미지 검색으로 확인할 수 있습니다.`,"회사명 이미지 검색",()=>openCompanySearchModal(contact, p.raw));
    }else{
      setOcrStatus(`명함 인식 완료${quality}${missingText}. 결과를 확인한 뒤 저장해 주세요.`,"결과 확인",()=>openContactDetail(contact));
    }
  }catch(e){
    console.error("OCR failed", e);
    if(contactDrafts.get(contact.id)!==draft)return false;
    if(selectedContactId === contact.id) renderContactDrawer(false);
    if(!contact.company){
      /* 실패 시에도 화면을 가로막지 않고, 회사명 이미지 검색은 사용자가 버튼으로 열도록 안내만 함 */
      setOcrStatus("문자 인식에 실패했습니다. 명함 이미지는 임시 보관 중입니다. 내용을 확인한 뒤 저장하세요. 회사명은 이미지 검색으로 확인할 수 있습니다.","회사명 이미지 검색",()=>openCompanySearchModal(contact, rawText));
    }else{
      setOcrStatus("자동 문자 인식에 실패했습니다. 내용을 직접 입력한 뒤 저장해 주세요.");
      setTimeout(()=>setOcrStatus(""), 5000);
    }
  }
  draft.processing=false;
  if(contactDrafts.get(contact.id)===draft&&selectedContactId===contact.id)markDraft("contact",draft);
  return ocrSucceeded;
}

/* 업로드·촬영된 이미지 처리: 신규 등록 또는 기존 연락처 명함 교체 */
async function handlePickedImage(file, options={}){
  if(!file) return;
  let dataUrl;
  try{
    dataUrl = options.cameraFallback
      ? await fileToCenteredCardDataUrl(file)
      : await fileToResizedDataUrl(file, 2200, .94);
  }
  catch(e){ showToast("이미지를 읽지 못했습니다. 다른 사진으로 시도해 주세요."); return; }

  const targetId=pendingImageTargetId;pendingImageTargetId=null;
  await stageContactImage(dataUrl,targetId);
}
async function stageContactImage(dataUrl,targetId){
  const ct=(targetId&&contactDrafts.get(targetId)?.value)||(targetId&&contactsData.find(c=>c.id===targetId))||normalizeContact({id:uid(),createdAt:todayStr()});
  if(!openContactDetail(ct))return;
  const draft=contactDrafts.get(ct.id);draft.pendingImage=true;draft.processing=true;
  draft.value.cardImage=dataUrl;updateEditStatus("contact",draft);
  const thumb=await makeCardThumb(dataUrl);
  if(contactDrafts.get(ct.id)!==draft)return;
  draft.value.cardThumb=thumb||"";renderContactDrawer(false);
  await applyOcrToContact(draft.value,dataUrl);
}

/* ---- 카메라 스캐너: 명함 비율 가이드·실시간 품질 진단·고해상도 촬영 ---- */
const BUSINESS_CARD_ASPECT=1.8; // 국내 표준 명함 90×50mm 기준
let scanStream=null;
let scanQualityTimer=null;
let scanLastQuality={level:"warn",severe:false,message:"카메라를 준비하는 중..."};
let scanTorchOn=false;
let scanResizeObserver=null;
let scanOpening=false;
let scanQualityIssue="";
let scanQualityIssueCount=0;

function setScanStatus(level,message,note=""){
  const box=document.getElementById("scan-status");
  const text=document.getElementById("scan-status-text");
  const frame=document.getElementById("scan-frame");
  const quality=document.getElementById("scan-quality-note");
  if(box){box.className="tn-scan-status "+(level||"");}
  if(text)text.textContent=message||"";
  if(frame)frame.className="tn-scan-frame "+(level==="good"?"good":level==="bad"?"bad":"");
  if(quality)quality.textContent=note||message||"명함을 프레임에 맞춰 주세요";
}

function hideScanQualityPopup(){
  const popup=document.getElementById("scan-quality-popup");
  if(popup)popup.hidden=true;
}

function updateScanQualityPopup(issue,message,note){
  if(!issue){scanQualityIssue="";scanQualityIssueCount=0;hideScanQualityPopup();return;}
  if(scanQualityIssue===issue)scanQualityIssueCount+=1;
  else{scanQualityIssue=issue;scanQualityIssueCount=1;hideScanQualityPopup();}
  /* 순간적인 노출 변화는 무시하고 약 1초간 계속 감지된 경우에만 안내 */
  if(scanQualityIssueCount<2)return;
  const popup=document.getElementById("scan-quality-popup");
  const title=document.getElementById("scan-quality-popup-title");
  const detail=document.getElementById("scan-quality-popup-message");
  if(title)title.textContent=message;
  if(detail)detail.textContent=note;
  if(popup)popup.hidden=false;
}

function updateScanFrameLayout(){
  const wrap=document.getElementById("scan-videowrap");
  const frame=document.getElementById("scan-frame");
  if(!wrap||!frame)return;
  const w=wrap.clientWidth,h=wrap.clientHeight;
  if(!w||!h)return;
  let fw=w*.90, fh=fw/BUSINESS_CARD_ASPECT;
  const maxH=h*.72;
  if(fh>maxH){fh=maxH;fw=fh*BUSINESS_CARD_ASPECT;}
  frame.style.width=Math.round(fw)+"px";
  frame.style.height=Math.round(fh)+"px";
  frame.style.left=Math.round((w-fw)/2)+"px";
  frame.style.top=Math.round((h-fh)/2)+"px";
}

/* object-fit:cover 미리보기에서 화면 프레임과 실제 카메라 픽셀을 정확히 대응 */
function scannerSourceRect(sourceWidth,sourceHeight){
  const wrap=document.getElementById("scan-videowrap");
  const frame=document.getElementById("scan-frame");
  const cw=wrap?.clientWidth||1,ch=wrap?.clientHeight||1;
  const left=parseFloat(frame?.style.left)||frame?.offsetLeft||0;
  const top=parseFloat(frame?.style.top)||frame?.offsetTop||0;
  const fw=parseFloat(frame?.style.width)||frame?.offsetWidth||cw*.9;
  const fh=parseFloat(frame?.style.height)||frame?.offsetHeight||fw/BUSINESS_CARD_ASPECT;
  const scale=Math.max(cw/sourceWidth,ch/sourceHeight);
  const renderedW=sourceWidth*scale,renderedH=sourceHeight*scale;
  const offsetX=(renderedW-cw)/2,offsetY=(renderedH-ch)/2;
  let sx=(left+offsetX)/scale,sy=(top+offsetY)/scale;
  let sw=fw/scale,sh=fh/scale;
  sx=Math.max(0,Math.min(sourceWidth-1,sx));
  sy=Math.max(0,Math.min(sourceHeight-1,sy));
  sw=Math.max(1,Math.min(sourceWidth-sx,sw));
  sh=Math.max(1,Math.min(sourceHeight-sy,sh));
  return {sx,sy,sw,sh};
}

function drawScannerCrop(source,sourceWidth,sourceHeight,maxW=2400){
  const {sx,sy,sw,sh}=scannerSourceRect(sourceWidth,sourceHeight);
  const scale=Math.min(1,maxW/sw);
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(sw*scale));
  canvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(source,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  return canvas;
}

function evaluateScannerQuality(){
  const video=document.getElementById("scan-video");
  if(!video||video.readyState<2||!video.videoWidth)return;
  try{
    const crop=drawScannerCrop(video,video.videoWidth,video.videoHeight,360);
    const ctx=crop.getContext("2d",{willReadFrequently:true});
    const {data}=ctx.getImageData(0,0,crop.width,crop.height);
    const gray=new Uint8Array(crop.width*crop.height);
    let sum=0,sumSq=0,glare=0,dark=0;
    for(let p=0,i=0;i<data.length;i+=4,p++){
      const v=data[i]*.299+data[i+1]*.587+data[i+2]*.114;
      gray[p]=v;sum+=v;sumSq+=v*v;if(v>246)glare++;if(v<32)dark++;
    }
    const n=gray.length,mean=sum/n,contrast=Math.sqrt(Math.max(0,sumSq/n-mean*mean));
    let edge=0,count=0;
    for(let y=1;y<crop.height-1;y+=2){
      for(let x=1;x<crop.width-1;x+=2){
        const p=y*crop.width+x;
        edge+=Math.abs(gray[p+1]-gray[p-1])+Math.abs(gray[p+crop.width]-gray[p-crop.width]);count+=2;
      }
    }
    const edgeScore=edge/Math.max(1,count),glareRatio=glare/n,darkRatio=dark/n;
    let level="good",message="촬영하기 좋은 상태입니다",note="선명함 · 밝기 적정",issue="";
    let severe=false;
    if(mean<48||darkRatio>.34){level="bad";message="조명이 부족합니다";note="조명을 켜거나 밝은 곳으로 이동하세요";issue="low-light";severe=true;}
    else if(mean>232||glareRatio>.20){level="bad";message="빛 반사가 너무 강합니다";note="명함이나 휴대폰 각도를 조금 바꿔 주세요";issue="glare";severe=true;}
    else if(edgeScore<6.5){level="bad";message="글자가 흐릿합니다";note="카메라를 고정하고 화면의 명함을 한 번 눌러 초점을 맞춰 주세요";issue="blur";severe=true;}
    else if(edgeScore<10||contrast<24){level="warn";message="조금 더 선명하게 맞춰 주세요";note="명함을 가까이 두고 잠시 고정하세요";}
    else if(glareRatio>.10){level="warn";message="일부 빛 반사가 감지됩니다";note="반사광이 글자를 가리지 않게 조정하세요";}
    scanLastQuality={level,severe,message,note,issue,mean,contrast,edgeScore,glareRatio};
    setScanStatus(level,message,note);
    updateScanQualityPopup(issue,message,note);
  }catch(e){/* 카메라 프레임 분석 실패 시 촬영 자체는 허용 */}
}

async function applyBestCameraSettings(track){
  try{
    const caps=track.getCapabilities?track.getCapabilities():{};
    const advanced=[];
    if(Array.isArray(caps.focusMode)&&caps.focusMode.includes("continuous"))advanced.push({focusMode:"continuous"});
    if(Array.isArray(caps.exposureMode)&&caps.exposureMode.includes("continuous"))advanced.push({exposureMode:"continuous"});
    if(Array.isArray(caps.whiteBalanceMode)&&caps.whiteBalanceMode.includes("continuous"))advanced.push({whiteBalanceMode:"continuous"});
    if(advanced.length)await track.applyConstraints({advanced});
    const torchBtn=document.getElementById("scan-torch");
    if(torchBtn)torchBtn.hidden=!caps.torch;
  }catch(e){console.debug("camera optimization unavailable",e);}
}

function reusableScannerStream(){
  const track=scanStream?.getVideoTracks?.()[0];
  return !!track&&track.readyState==="live";
}

function waitForScannerVideo(video,timeoutMs=6000){
  if(video.videoWidth)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata",onReady);
      video.removeEventListener("canplay",onReady);
      if(error)reject(error);else resolve();
    };
    const onReady=()=>{if(video.videoWidth)finish();};
    const timer=setTimeout(()=>finish(new Error("카메라 영상 준비 시간이 초과되었습니다.")),timeoutMs);
    video.addEventListener("loadedmetadata",onReady);
    video.addEventListener("canplay",onReady);
  });
}

function releaseScannerStream(){
  clearInterval(scanQualityTimer);scanQualityTimer=null;
  scanResizeObserver?.disconnect();scanResizeObserver=null;
  if(scanStream)scanStream.getTracks().forEach(track=>track.stop());
  scanStream=null;scanOpening=false;scanTorchOn=false;
  const video=document.getElementById("scan-video");
  if(video){video.pause();video.srcObject=null;}
}

async function openScanner(){
  /* 카메라를 준비하고 명함을 맞추는 동안 OCR 엔진과 언어 데이터를 미리 내려받아 촬영 후 대기 시간을 줄임 */
  getOcrWorkerPool().catch(()=>{});
  /* 이전에 "명함 변경"을 취소한 흔적이 남아 새 촬영이 다른 연락처를 덮어쓰지 않게 초기화 */
  pendingImageTargetId=null;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    document.getElementById("contact-camera-input").click();return;
  }
  if(scanOpening)return;
  scanOpening=true;
  const overlay=document.getElementById("scan-modal-overlay");
  const capture=document.getElementById("scan-capture");
  overlay.hidden=false;capture.disabled=true;capture.textContent="카메라 준비 중";
  scanQualityIssue="";scanQualityIssueCount=0;hideScanQualityPopup();
  setScanStatus("warn","카메라를 준비하는 중...","후면 카메라를 불러오고 있습니다");
  requestAnimationFrame(updateScanFrameLayout);
  /* 준비 중 사용자가 취소해 모달이 닫혔으면 카메라를 켜 둔 채 방치하지 않음 */
  const cancelledWhileOpening=()=>overlay.hidden;
  try{
    /* 같은 페이지 접속 중에는 최초 허용으로 얻은 스트림을 재사용해 권한 요청을 반복하지 않음 */
    if(!reusableScannerStream()){
      releaseScannerStream();
      scanOpening=true;
      scanStream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:"environment"},width:{ideal:4096,min:1280},height:{ideal:2160,min:720},aspectRatio:{ideal:16/9}},
        audio:false
      });
      const liveTrack=scanStream.getVideoTracks()[0];
      liveTrack?.addEventListener?.("ended",()=>{scanStream=null;},{once:true});
    }
    if(cancelledWhileOpening()){
      scanStream.getTracks().forEach(track=>{track.enabled=false;});
      return;
    }
    scanStream.getTracks().forEach(track=>{track.enabled=true;});
    const video=document.getElementById("scan-video");
    video.srcObject=scanStream;
    await video.play().catch(()=>{});
    await waitForScannerVideo(video);
    if(cancelledWhileOpening()){
      scanStream.getTracks().forEach(track=>{track.enabled=false;});
      video.pause();video.srcObject=null;
      return;
    }
    updateScanFrameLayout();
    await applyBestCameraSettings(scanStream.getVideoTracks()[0]);
    capture.disabled=false;capture.textContent="명함 촬영";
    setScanStatus("warn","명함을 프레임에 맞춰 주세요","네 모서리를 주황색 모서리 선에 맞추세요");
    clearInterval(scanQualityTimer);scanQualityTimer=setInterval(evaluateScannerQuality,550);
    evaluateScannerQuality();
    if(window.ResizeObserver){
      scanResizeObserver?.disconnect();scanResizeObserver=new ResizeObserver(updateScanFrameLayout);
      scanResizeObserver.observe(document.getElementById("scan-videowrap"));
    }
  }catch(e){
    console.warn("camera unavailable, falling back to file capture",e);
    releaseScannerStream();closeScanner();document.getElementById("contact-camera-input").click();
  }finally{
    scanOpening=false;
  }
}

async function toggleScannerTorch(){
  const track=scanStream?.getVideoTracks?.()[0];
  if(!track)return;
  try{
    scanTorchOn=!scanTorchOn;
    await track.applyConstraints({advanced:[{torch:scanTorchOn}]});
    document.getElementById("scan-torch").textContent=scanTorchOn?"조명 끄기":"조명 켜기";
  }catch(e){scanTorchOn=false;document.getElementById("scan-torch").hidden=true;}
}

async function refocusScanner(){
  const track=scanStream?.getVideoTracks?.()[0];if(!track||track.readyState!=="live")return;
  try{
    const caps=track.getCapabilities?track.getCapabilities():{};
    const modes=Array.isArray(caps.focusMode)?caps.focusMode:[];
    const mode=modes.includes("single-shot")?"single-shot":modes.includes("continuous")?"continuous":"";
    if(!mode)return;
    setScanStatus("warn","초점을 다시 맞추는 중...","명함을 움직이지 말고 잠시 기다려 주세요");
    await track.applyConstraints({advanced:[{focusMode:mode}]});
    setTimeout(evaluateScannerQuality,320);
  }catch(e){console.debug("camera refocus unavailable",e);}
}

function closeScanner(){
  clearInterval(scanQualityTimer);scanQualityTimer=null;
  scanResizeObserver?.disconnect();scanResizeObserver=null;
  /* 재실행 시 권한창이 반복되지 않도록 스트림은 유지하고 영상만 일시 중지 */
  if(scanStream)scanStream.getTracks().forEach(track=>{track.enabled=false;});
  const video=document.getElementById("scan-video");if(video){video.pause();video.srcObject=null;}
  scanTorchOn=false;
  const torch=document.getElementById("scan-torch");if(torch){torch.hidden=true;torch.textContent="조명 켜기";}
  scanQualityIssue="";scanQualityIssueCount=0;hideScanQualityPopup();
  document.getElementById("scan-modal-overlay").hidden=true;
}

async function captureScan(){
  const video=document.getElementById("scan-video");
  if(!video.videoWidth||!scanStream)return;
  const button=document.getElementById("scan-capture");
  button.disabled=true;button.textContent="촬영 완료 · 인식 중";
  try{
    /* 클릭한 바로 그 프레임을 동기식으로 먼저 고정하여 셔터 지연 없이 촬영 */
    const canvas=drawScannerCrop(video,video.videoWidth,video.videoHeight,2800);
    navigator.vibrate?.(25);
    closeScanner();
    /* 화면을 먼저 닫아 사용자가 즉시 촬영되었음을 느끼게 한 뒤 JPEG 인코딩 */
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const dataUrl=canvas.toDataURL("image/jpeg",.96);
    await stageContactImage(dataUrl);
  }catch(e){
    console.error("scan capture failed",e);
    button.disabled=false;button.textContent="명함 촬영";
    showToast("명함 촬영에 실패했습니다. 카메라를 다시 열거나 명함 업로드를 이용해 주세요.");
  }
}

window.addEventListener("pagehide",releaseScannerStream);

/* 연락처 → 영업 딜 전환 */

/* ================= 백업 파일(.xlsx) 만들기·읽기 =================
   Excel 파일은 XML 몇 개를 담은 ZIP입니다. 외부 라이브러리를 받아오지 않고
   (보안 정책상 허용 출처가 제한적이고, 백업 기능이 외부 CDN에 의존하면 안 됩니다)
   필요한 최소 구성만 직접 만들고 읽습니다.
   Excel에서 열었다가 다시 저장한 파일도 읽을 수 있도록 공유 문자열과 압축(deflate)을 함께 처리합니다. */

/* Excel 한 칸에 32,767자까지만 들어가므로 그보다 여유 있게 끊어 여러 줄로 나눠 담는다 */
const XLSX_CELL_LIMIT = 30000;
const BACKUP_SHEETS = {info:"백업정보", records:"저장데이터", audit:"변경로그"};

let crcTable = null;
function crc32(bytes){
  if(!crcTable){
    crcTable = new Uint32Array(256);
    for(let i=0;i<256;i++){
      let c=i;
      for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1;
      crcTable[i]=c>>>0;
    }
  }
  let crc=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) crc = crcTable[(crc^bytes[i])&255]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

/* 브라우저 기본 압축 기능. 없으면 null을 돌려주고 압축 없이 저장한다. */
async function streamBytes(bytes, constructorName, format){
  const Ctor = globalThis[constructorName];
  if(typeof Ctor !== "function") return null;
  const stream = new Ctor(format);
  const writer = stream.writable.getWriter();
  /* 큰 데이터에서 쓰기와 읽기가 서로 기다리다 멈추지 않도록 쓰기를 먼저 걸어 두고 읽는다 */
  const pump = (async()=>{ await writer.write(bytes); await writer.close(); })();
  const reader = stream.readable.getReader();
  const chunks=[]; let total=0;
  for(;;){
    const {value,done} = await reader.read();
    if(done) break;
    chunks.push(value); total+=value.length;
  }
  await pump;
  const out=new Uint8Array(total); let at=0;
  chunks.forEach(chunk=>{ out.set(chunk,at); at+=chunk.length; });
  return out;
}

async function zipArchive(entries){
  const encoder=new TextEncoder();
  const parts=[]; const central=[]; let offset=0;
  for(const entry of entries){
    const nameBytes=encoder.encode(entry.name);
    const data=entry.data;
    const crc=crc32(data);
    let method=0, stored=data;
    const packed=await streamBytes(data,"CompressionStream","deflate-raw");
    if(packed && packed.length < data.length){ method=8; stored=packed; }
    const local=new Uint8Array(30+nameBytes.length);
    const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);
    lv.setUint16(4,20,true);
    lv.setUint16(6,0x0800,true); /* 파일 이름을 UTF-8로 적었음을 알림 */
    lv.setUint16(8,method,true);
    lv.setUint32(14,crc,true);
    lv.setUint32(18,stored.length,true);
    lv.setUint32(22,data.length,true);
    lv.setUint16(26,nameBytes.length,true);
    local.set(nameBytes,30);
    parts.push(local,stored);

    const dir=new Uint8Array(46+nameBytes.length);
    const dv=new DataView(dir.buffer);
    dv.setUint32(0,0x02014b50,true);
    dv.setUint16(4,20,true); dv.setUint16(6,20,true);
    dv.setUint16(8,0x0800,true);
    dv.setUint16(10,method,true);
    dv.setUint32(16,crc,true);
    dv.setUint32(20,stored.length,true);
    dv.setUint32(24,data.length,true);
    dv.setUint16(28,nameBytes.length,true);
    dv.setUint32(42,offset,true);
    dir.set(nameBytes,46);
    central.push(dir);
    offset += local.length + stored.length;
  }
  let centralSize=0; central.forEach(dir=>centralSize+=dir.length);
  const end=new Uint8Array(22);
  const ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);
  ev.setUint16(8,central.length,true);
  ev.setUint16(10,central.length,true);
  ev.setUint32(12,centralSize,true);
  ev.setUint32(16,offset,true);
  return new Blob([...parts,...central,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

async function zipEntries(buffer){
  const bytes=new Uint8Array(buffer);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let i=bytes.length-22;i>=0 && i>=bytes.length-22-65535;i--){
    if(view.getUint32(i,true)===0x06054b50){ end=i; break; }
  }
  if(end<0) throw new Error("Excel 파일 구조를 읽을 수 없습니다.");
  const count=view.getUint16(end+10,true);
  let pointer=view.getUint32(end+16,true);
  const decoder=new TextDecoder();
  const files=new Map();
  for(let i=0;i<count;i++){
    if(pointer+46>bytes.length || view.getUint32(pointer,true)!==0x02014b50) break;
    const method=view.getUint16(pointer+10,true);
    const compressed=view.getUint32(pointer+20,true);
    const nameLength=view.getUint16(pointer+28,true);
    const extraLength=view.getUint16(pointer+30,true);
    const commentLength=view.getUint16(pointer+32,true);
    const localOffset=view.getUint32(pointer+42,true);
    const name=decoder.decode(bytes.subarray(pointer+46,pointer+46+nameLength));
    const localNameLength=view.getUint16(localOffset+26,true);
    const localExtraLength=view.getUint16(localOffset+28,true);
    const start=localOffset+30+localNameLength+localExtraLength;
    const raw=bytes.subarray(start,start+compressed);
    let data=raw;
    if(method===8){
      data=await streamBytes(raw,"DecompressionStream","deflate-raw");
      if(!data) throw new Error("이 브라우저에서는 압축된 Excel 파일을 열 수 없습니다. 최신 Chrome 또는 Edge에서 다시 시도해 주세요.");
    }else if(method!==0){
      throw new Error("지원하지 않는 방식으로 압축된 Excel 파일입니다.");
    }
    files.set(name,data);
    pointer += 46+nameLength+extraLength+commentLength;
  }
  return files;
}

function xmlEscape(value){
  return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function columnName(index){
  let name="", n=index;
  for(;;){ name=String.fromCharCode(65+(n%26))+name; n=Math.floor(n/26)-1; if(n<0) break; }
  return name;
}
function columnIndex(reference){
  const letters=String(reference||"").match(/^[A-Z]+/);
  if(!letters) return 0;
  let index=0;
  for(const ch of letters[0]) index = index*26 + (ch.charCodeAt(0)-64);
  return index-1;
}
function sheetXml(rows){
  const body=rows.map((cells,rowIndex)=>{
    const inner=(cells||[]).map((value,colIndex)=>{
      const text=value===null||value===undefined?"":String(value);
      if(!text) return "";
      return `<c r="${columnName(colIndex)}${rowIndex+1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex+1}">${inner}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
function parseXmlDocument(text){
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.getElementsByTagName("parsererror").length) throw new Error("Excel 파일의 내용을 해석할 수 없습니다.");
  return doc;
}
function sharedStringList(text){
  if(!text) return [];
  return [...parseXmlDocument(text).getElementsByTagName("si")].map(si=>
    [...si.getElementsByTagName("t")]
      /* 발음 표기(rPh) 안의 글자는 실제 값이 아니므로 뺀다 */
      .filter(t=>!t.parentNode || t.parentNode.nodeName!=="rPh")
      .map(t=>t.textContent).join("")
  );
}
function sheetRows(text, shared){
  const rows=[];
  [...parseXmlDocument(text).getElementsByTagName("row")].forEach((rowEl,order)=>{
    const rowIndex=Number(rowEl.getAttribute("r")||order+1)-1;
    const cells=[];
    [...rowEl.getElementsByTagName("c")].forEach((cellEl,cellOrder)=>{
      const type=cellEl.getAttribute("t")||"";
      const reference=cellEl.getAttribute("r");
      const at=reference?columnIndex(reference):cellOrder;
      let text="";
      if(type==="inlineStr"){
        text=[...cellEl.getElementsByTagName("t")].map(t=>t.textContent).join("");
      }else if(type==="s"){
        const v=cellEl.getElementsByTagName("v")[0];
        text=v?(shared[Number(v.textContent)] ?? "") : "";
      }else{
        const v=cellEl.getElementsByTagName("v")[0];
        text=v?v.textContent:"";
      }
      cells[at]=text;
    });
    rows[rowIndex]=cells;
  });
  return rows.map(row=>row||[]);
}

/* 긴 JSON 값을 Excel 한 칸 상한에 맞춰 여러 줄로 나눈다 */
function splitLongValue(text){
  const value=String(text ?? "");
  if(value.length<=XLSX_CELL_LIMIT) return [value];
  const pieces=[];
  for(let at=0;at<value.length;at+=XLSX_CELL_LIMIT) pieces.push(value.slice(at,at+XLSX_CELL_LIMIT));
  return pieces;
}
/* 조각 열이 비었거나 1이면 새 줄, 2 이상이면 앞 줄에 이어 붙인 값 */
function joinSplitRows(rows, jsonColumn, partColumn){
  const joined=[];
  rows.forEach(row=>{
    const part=Number(row[partColumn]||1);
    if(part>1 && joined.length){
      joined[joined.length-1][jsonColumn]=(joined[joined.length-1][jsonColumn]||"")+(row[jsonColumn]||"");
      return;
    }
    joined.push(row.slice());
  });
  return joined;
}

function backupWorkbookSheets(backup){
  const summary=backup.summary||{};
  const info=[
    ["항목","값"],
    ["형식",backup.format||"tiniko-crm-admin-backup-v3"],
    ["버전",String(backup.tinikoCRMBackupVersion ?? 3)],
    ["작업공간",backup.workspaceId||""],
    ["내려받은 시각(UTC)",backup.exportedAt||""],
    ["내려받은 시각(KST)",backup.exportedAtKST||""],
    ["설명",backup.description||""],
    ["저장 데이터 수",String(summary.recordCount ?? (backup.data?.records||[]).length)],
    ["변경 로그 수",String(summary.auditLogCount ?? (backup.data?.auditLogs||[]).length)]
  ];
  Object.entries(summary.byScreen||{}).forEach(([screen,count])=>info.push(["화면별 변경 수 · "+screen,String(count)]));
  Object.entries(summary.byAction||{}).forEach(([action,count])=>info.push(["동작별 변경 수 · "+action,String(count)]));

  const records=[["저장키","리비전","수정시각","값(JSON)","조각"]];
  (backup.data?.records||[]).forEach(record=>{
    splitLongValue(JSON.stringify(record.value ?? null)).forEach((piece,index)=>{
      records.push(index===0
        ? [record.key||"",String(record.revision ?? 1),String(record.updatedAt||""),piece,"1"]
        : ["","","",piece,String(index+1)]);
    });
  });

  const audit=[["이벤트 ID","시각","시각(KST)","화면","동작","데이터 종류","데이터 이름","데이터 ID","저장키","변경 요약","상세(JSON)","조각"]];
  (backup.data?.auditLogs||[]).forEach(entry=>{
    const detail=JSON.stringify({
      changedFields:entry.changedFields||[],
      beforeValue:entry.beforeValue ?? null,
      afterValue:entry.afterValue ?? null
    });
    splitLongValue(detail).forEach((piece,index)=>{
      audit.push(index===0
        ? [entry.eventId||"",String(entry.eventAt||""),String(entry.eventAtKST||""),entry.screen||"",entry.action||"",
           entry.entityType||"",entry.entityLabel||"",entry.entityId==null?"":String(entry.entityId),
           entry.storageKey||"",entry.summary||"",piece,"1"]
        : ["","","","","","","","","","",piece,String(index+1)]);
    });
  });
  return {info,records,audit};
}

async function buildBackupWorkbook(backup){
  const sheets=backupWorkbookSheets(backup);
  const order=[
    {name:BACKUP_SHEETS.info,rows:sheets.info},
    {name:BACKUP_SHEETS.records,rows:sheets.records},
    {name:BACKUP_SHEETS.audit,rows:sheets.audit}
  ];
  const encoder=new TextEncoder();
  const file=(name,text)=>({name,data:encoder.encode(text)});
  const sheetTags=order.map((sheet,index)=>`<sheet name="${xmlEscape(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join("");
  const relationTags=order.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join("");
  const overrideTags=order.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");

  const entries=[
    file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrideTags}</Types>`),
    file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    file("xl/workbook.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`),
    file("xl/_rels/workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationTags}</Relationships>`)
  ];
  order.forEach((sheet,index)=>entries.push(file(`xl/worksheets/sheet${index+1}.xml`,sheetXml(sheet.rows))));
  return zipArchive(entries);
}

/* Excel 파일에서 시트 이름 → 표 내용을 뽑는다 (Excel이 다시 저장한 파일도 읽을 수 있게) */
async function workbookSheetRows(buffer){
  const files=await zipEntries(buffer);
  const decoder=new TextDecoder();
  const text=name=>files.has(name)?decoder.decode(files.get(name)):"";
  const workbook=text("xl/workbook.xml");
  if(!workbook) throw new Error("Excel 통합 문서를 찾을 수 없습니다.");
  const shared=sharedStringList(text("xl/sharedStrings.xml"));
  const targets=new Map();
  const relations=text("xl/_rels/workbook.xml.rels");
  if(relations){
    [...parseXmlDocument(relations).getElementsByTagName("Relationship")].forEach(rel=>{
      const target=String(rel.getAttribute("Target")||"").replace(/^\/?xl\//,"").replace(/^\.\//,"");
      targets.set(rel.getAttribute("Id"),"xl/"+target);
    });
  }
  const sheets=new Map();
  [...parseXmlDocument(workbook).getElementsByTagName("sheet")].forEach((sheet,index)=>{
    const id=sheet.getAttribute("r:id")||sheet.getAttribute("id");
    const path=targets.get(id)||`xl/worksheets/sheet${index+1}.xml`;
    const body=text(path);
    if(body) sheets.set(String(sheet.getAttribute("name")||"").trim(),sheetRows(body,shared));
  });
  return sheets;
}

/* Excel 백업 파일을 서버가 이해하는 백업 JSON으로 되돌린다 */
async function readBackupWorkbook(buffer){
  const sheets=await workbookSheetRows(buffer);
  const infoRows=sheets.get(BACKUP_SHEETS.info)||[];
  const recordRows=sheets.get(BACKUP_SHEETS.records);
  if(!recordRows) throw new Error(`'${BACKUP_SHEETS.records}' 시트가 없습니다. CRM에서 내려받은 백업 파일인지 확인해 주세요.`);
  const info=new Map(infoRows.slice(1).map(row=>[String(row[0]||"").trim(),String(row[1]??"").trim()]));

  const records=joinSplitRows(recordRows.slice(1),3,4)
    .filter(row=>String(row[0]||"").trim())
    .map(row=>{
      const key=String(row[0]).trim();
      let value=null;
      try{ value=JSON.parse(row[3]||"null"); }
      catch(error){ throw new Error(`저장키 '${key}'의 값을 해석할 수 없습니다. 파일이 편집되었는지 확인해 주세요.`); }
      const revision=Number(row[1]);
      return {key,value,revision:Number.isSafeInteger(revision)&&revision>0?revision:1,updatedAt:String(row[2]||"")};
    });

  const auditRows=sheets.get(BACKUP_SHEETS.audit)||[];
  const auditLogs=joinSplitRows(auditRows.slice(1),10,11)
    .filter(row=>String(row[0]||"").trim())
    .map(row=>{
      let detail={};
      try{ detail=JSON.parse(row[10]||"{}") || {}; }catch(error){ detail={}; }
      return {
        eventId:String(row[0]).trim(),
        eventAt:String(row[1]||""),
        screen:String(row[3]||""),
        action:String(row[4]||""),
        entityType:String(row[5]||""),
        entityLabel:String(row[6]||""),
        entityId:String(row[7]||"").trim()?String(row[7]):null,
        storageKey:String(row[8]||""),
        summary:String(row[9]||""),
        changedFields:Array.isArray(detail.changedFields)?detail.changedFields:[],
        beforeValue:detail.beforeValue ?? null,
        afterValue:detail.afterValue ?? null
      };
    });

  return {
    format:info.get("형식")||"tiniko-crm-admin-backup-v3",
    tinikoCRMBackupVersion:Number(info.get("버전")||3),
    workspaceId:info.get("작업공간")||"",
    exportedAt:info.get("내려받은 시각(UTC)")||"",
    description:info.get("설명")||"",
    data:{records,auditLogs}
  };
}

