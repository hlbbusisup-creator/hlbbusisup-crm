import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { ensureSchema, createPostgresRepository } from "../src/db.js";
import { createApp } from "../src/app.js";
import { createRestoreAuditEntry } from "../src/audit.js";

// PGlite is PostgreSQL compiled to WASM. Its single connection is leased per
// transaction, like a pg pool of size 1; production also takes a DB advisory lock.
const db=new PGlite();
let lease=Promise.resolve(),repo,server,url;
const query=async(sql,params)=>{
  if(sql.includes("CREATE TABLE")){await db.exec(sql);return {rows:[],rowCount:0};}
  const result=await db.query(sql,params);return {...result,rowCount:result.rows.length||result.affectedRows||0};
};
const pool={query,async connect(){const previous=lease;let unlock;lease=new Promise(resolve=>unlock=resolve);await previous;return {query,release:()=>unlock()};}};
const accessKey="concurrency-test-access-key";
before(async()=>{
  await ensureSchema(pool);repo=createPostgresRepository(pool);
  server=createApp({repository:repo,accessKey,adminCode:"concurrency-test-admin"}).listen(0,"127.0.0.1");await once(server,"listening");url="http://127.0.0.1:"+server.address().port;
});
after(async()=>{if(server){server.close();await once(server,"close");}await db.close();});
const read=(key,workspace="test")=>repo.getConcurrent(workspace,key);
function request(base,key,mutations){return {requestId:randomUUID(),generation:base.generation,changes:[{key,mutations}]};}
const mutation=(base,id,value)=>({id,version:base.versions[id]??null,...(value===undefined?{deleted:true}:{value})});
async function seed(key,values){await repo.set("test",key,values);return read(key);}

test("existing arrays migrate once without changing backups or audit history",async()=>{
  const key="tinico:stage:migration",values=[{id:"a",title:"한글 영업"},{id:"b",title:"두 번째"}];
  const first=await seed(key,values),second=await read(key);
  assert.deepEqual(first.value,values);assert.deepEqual(first.versions,second.versions);
  const items=await query("SELECT value FROM crm_item WHERE workspace_id = $1 AND storage_key = $2 ORDER BY item_id",["test",key]);
  assert.deepEqual(items.rows.map(row=>row.value),values);
  assert.deepEqual((await repo.exportAll("test")).find(record=>record.key===key).value,values);
  assert.equal((await repo.exportAudit("test")).filter(entry=>entry.storageKey===key).length,0);
});
test("concurrent different-item saves in the same collection both survive",async()=>{
  const key="tinico:stage:parallel",base=await seed(key,[{id:"a",title:"A"},{id:"b",title:"B"}]);
  await Promise.all([
    repo.saveConcurrent("test",request(base,key,[mutation(base,"a",{id:"a",title:"A 수정"})])),
    repo.saveConcurrent("test",request(base,key,[mutation(base,"b",{id:"b",title:"B 수정"})]))
  ]);
  assert.deepEqual((await read(key)).value.map(item=>item.title),["A 수정","B 수정"]);
});
test("same-item conflict includes the latest value and rolls back all batch data and audit",async()=>{
  const key="tinico:stage:conflict",base=await seed(key,[{id:"a",title:"A"}]);
  await repo.saveConcurrent("test",request(base,key,[mutation(base,"a",{id:"a",title:"먼저 저장"})]));
  const imageKey="tinico:contact-image:atomic",image=await read(imageKey);
  const body=request(base,key,[mutation(base,"a",{id:"a",title:"덮어쓰기"})]);
  body.changes.unshift({key:imageKey,mutations:[mutation(image,"","data:image/test")]});
  const logs=(await repo.exportAudit("test")).length;
  await assert.rejects(repo.saveConcurrent("test",body),error=>error.publicCode==="revision_conflict"&&error.conflicts[0].value.title==="먼저 저장");
  assert.equal((await read(imageKey)).value,null);assert.equal((await repo.exportAudit("test")).length,logs);
  assert.equal((await read(key)).value[0].title,"먼저 저장");
});
test("creating the same ID concurrently permits exactly one writer",async()=>{
  const key="tinico:stage:create-race",base=await read(key);
  const results=await Promise.allSettled(["A","B"].map(title=>repo.saveConcurrent("test",request(base,key,[mutation(base,"new",{id:"new",title})]))));
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(results.find(result=>result.status==="rejected").reason.publicCode,"revision_conflict");
  assert.equal((await read(key)).value.length,1);
});
test("idempotent retry returns the same tokens and adds no duplicate activity or audit",async()=>{
  const key="tinico:stage:retry",base=await seed(key,[{id:"a",title:"A",activities:[]}]);
  const body=request(base,key,[mutation(base,"a",{id:"a",title:"A",activities:[{id:"activity",content:"통화"}]})]);
  const first=await repo.saveConcurrent("test",body),logs=(await repo.exportAudit("test")).length;
  assert.deepEqual(await repo.saveConcurrent("test",body),first);
  assert.equal((await repo.exportAudit("test")).length,logs);
  const reused=structuredClone(body);reused.changes[0].mutations[0].value.title="다른 요청";
  await assert.rejects(repo.saveConcurrent("test",reused),error=>error.publicCode==="request_id_reused");
});
test("stale deletion and deletion/recreation never allow an old editor to overwrite",async()=>{
  const key="tinico:stage:delete",base=await seed(key,[{id:"a",title:"A"}]);
  await repo.saveConcurrent("test",request(base,key,[mutation(base,"a",{id:"a",title:"B"})]));
  await assert.rejects(repo.saveConcurrent("test",request(base,key,[mutation(base,"a",undefined)])),error=>error.publicCode==="revision_conflict");
  const latest=await read(key);await repo.saveConcurrent("test",request(latest,key,[mutation(latest,"a",undefined)]));
  const deleted=await read(key);assert.deepEqual(deleted.value,[]);assert.ok(deleted.versions.a);
  await repo.saveConcurrent("test",request(deleted,key,[mutation(deleted,"a",{id:"a",title:"복구"})]));
  await assert.rejects(repo.saveConcurrent("test",request(base,key,[mutation(base,"a",{id:"a",title:"오래된 입력"})])),error=>error.publicCode==="revision_conflict");
});
test("contact, image and linked deal updates commit together and preserve other deal fields",async()=>{
  const workspace="linked",contactKey="tinico:contacts",dealKey="tinico:stage:accounts",imageKey="tinico:contact:image:contact";
  await repo.set(workspace,contactKey,[{id:"contact",name:"홍길동",mobilePhone:"010-1111-1111"}]);
  await repo.set(workspace,dealKey,[{id:"deal",title:"영업",amount:500,linkedContactIds:["contact"],contactName:"홍길동",contactPhone:"010-1111-1111"}]);
  const base=await read(contactKey,workspace),image=await read(imageKey,workspace);
  const body=request(base,contactKey,[mutation(base,"contact",{id:"contact",name:"홍길동",businessPhone:"02-123-4567",phone:"오래된 값",cardThumb:"thumb"})]);
  body.changes.push({key:imageKey,mutations:[mutation(image,"","data:image/new")]});
  const result=await repo.saveConcurrent(workspace,body);
  assert.equal(result.records[dealKey].value[0].contactPhone,"02-123-4567");
  assert.equal(result.records[dealKey].value[0].amount,500);assert.equal((await read(imageKey,workspace)).value,"data:image/new");
  const snapshot=await repo.exportSnapshot(workspace);assert.equal(snapshot.auditLogs.filter(entry=>entry.storageKey===contactKey).length,1);assert.equal(snapshot.auditLogs.filter(entry=>entry.storageKey===dealKey).length,1);
});
test("restore invalidates every pre-restore token and request ID even with matching backup revisions",async()=>{
  const workspace="restore",key="tinico:contacts";
  await repo.set(workspace,key,[{id:"a",name:"백업"}]);const backup=await repo.exportSnapshot(workspace),base=await read(key,workspace);
  const body=request(base,key,[mutation(base,"a",{id:"a",name:"저장"})]);await repo.saveConcurrent(workspace,body);
  await repo.restoreSnapshot(workspace,backup.records,backup.auditLogs,createRestoreAuditEntry({backupExportedAt:new Date().toISOString(),recordCount:1,auditLogCount:0}));
  await assert.rejects(repo.saveConcurrent(workspace,body),error=>error.publicCode==="workspace_restored");
  const latest=await read(key,workspace);assert.notEqual(latest.generation,base.generation);assert.equal(latest.value[0].name,"백업");
  await repo.saveConcurrent(workspace,request(latest,key,[mutation(latest,"a",{id:"a",name:"복원 후 수정"})]));
});
test("production API rejects legacy/versionless writes and returns structured conflicts",async()=>{
  const key="tinico:contacts",path=url+"/api/storage/"+encodeURIComponent(key),headers={"x-crm-key":accessKey,"content-type":"application/json"};
  assert.equal((await fetch(path,{method:"PUT",headers,body:JSON.stringify({value:[]})})).status,428);
  assert.equal((await fetch(path,{method:"DELETE",headers})).status,428);
  const base=await (await fetch(path,{headers})).json();
  const body=request(base,key,[mutation(base,"a",{id:"a",name:"A"})]);
  assert.equal((await fetch(path,{method:"PUT",headers,body:JSON.stringify(body)})).status,200);
  const stale=await fetch(path,{method:"PUT",headers,body:JSON.stringify({...body,requestId:randomUUID()})});
  assert.equal(stale.status,409);assert.equal((await stale.json()).conflicts[0].value.name,"A");
  const missing=structuredClone(body);delete missing.changes[0].mutations[0].version;
  assert.equal((await fetch(path,{method:"PUT",headers,body:JSON.stringify(missing)})).status,400);
});
