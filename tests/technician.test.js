import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, users } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fields } from '../src/fields.js';
const tech=users.find(u=>u.id==='tech-demo'),ho=users[0],other={id:'unassigned-tech',role:'technician'};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const complete=()=>Object.fromEntries(fields.filter(f=>f.type!=='auto'&&!f.optional).map(f=>[f.key,Array.isArray(f.type)?f.type[0]:f.type==='number'?(f.key==='currentHours'?1200:10):f.type==='attachment'?image:'None']));
test('Visit start is idempotent, scoped and does not count as a performed FSR',()=>{
 const store=createStore(':memory:');try{
  const visit=store.visible(tech)[0];assert.throws(()=>store.start(ho,visit.id),e=>e.status===403);assert.throws(()=>store.start(other,visit.id),e=>e.status===403);
  const first=store.start(tech,visit.id),second=store.start(tech,visit.id);assert.ok(first.startedAt);assert.equal(first.startedAt,second.startedAt);assert.equal(first.startedBy,tech.id);assert.equal(first.fsr,null);assert.equal(first.status,'scheduled');assert.equal(store.audit(tech).length,1);
 }finally{store.close();}
});
test('Drafts persist, enforce ownership/revisions, and clear atomically after valid submission',()=>{
 const dir=mkdtempSync(join(tmpdir(),'amc-draft-')),path=join(dir,'data.sqlite');let store=createStore(path);
 try{
  const visit=store.visible(tech)[0];assert.throws(()=>store.saveDraft(tech,visit.id,{values:{visitPurpose:'AMC'},revision:0}),e=>e.status===409);
  store.start(tech,visit.id);const first=store.saveDraft(tech,visit.id,{values:{visitPurpose:'AMC',beforePhoto:image,issue:''},revision:0});assert.equal(first.revision,1);
  assert.throws(()=>store.draft(ho,visit.id),e=>e.status===403);assert.throws(()=>store.draft(other,visit.id),e=>e.status===403);
  assert.throws(()=>store.saveDraft(tech,visit.id,{values:{visitPurpose:'AMC'},revision:0}),e=>e.status===409);
  assert.throws(()=>store.saveDraft(tech,visit.id,{values:{rate:1},revision:1}),e=>e.status===422);
  assert.throws(()=>store.saveDraft(tech,visit.id,{values:{oilPressure:-1},revision:1}),e=>e.status===422);
  assert.throws(()=>store.submit(tech,visit.id,first.values),e=>e.status===422);assert.equal(store.draft(tech,visit.id).revision,1);
  store.close();store=createStore(path);assert.equal(store.draft(tech,visit.id).values.beforePhoto,image);
  const started=store.get(tech,visit.id).startedAt;const result=store.submit(tech,visit.id,complete());assert.equal(result.fsr.visitStartedAt,started);assert.equal(store.draft(tech,visit.id),null);
  assert.throws(()=>store.start(tech,visit.id),e=>e.status===409);assert.throws(()=>store.saveDraft(tech,visit.id,{values:{},revision:0}),e=>e.status===409);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('Technician API uses its own session, rejects other roles, and shares submissions with HO',async()=>{
 const {server}=createApp({dbPath:':memory:',demoMode:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,cookie,body,method=body?'POST':'GET')=>fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 try{
  const page=await fetch(base+'/technician',{redirect:'manual'});assert.equal(page.status,303);assert.equal(page.headers.get('location'),'/technician/login');assert.equal((await fetch(base+'/technician/manifest.webmanifest')).headers.get('content-type'),'application/manifest+json');
  assert.equal((await request('/api/technician/me')).status,401);
  const hoLogin=await request('/api/session',null,{userId:ho.id}),hc=hoLogin.headers.get('set-cookie').split(';')[0];assert.equal((await request('/api/technician/me',hc)).status,401);
  assert.equal((await request('/api/technician/session',null,{userId:ho.id})).status,403);
  const login=await request('/api/technician/session',null,{userId:tech.id}),tc=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/Path=\/api\/technician;/);assert.equal((await request('/api/me',tc)).status,401);
  const list=await(await request('/api/technician/visits?summary=1',tc)).json(),visit=list[0];assert.equal((await request(`/api/technician/visits/${visit.id}/start`,tc,{})).status,200);assert.equal((await request(`/api/technician/visits/${visit.id}/draft`,tc,{values:{visitPurpose:'AMC'},revision:0})).status,200);
  assert.equal((await request(`/api/technician/visits/${visit.id}/submit`,tc,complete())).status,200);
  const hoList=await(await request('/api/visits?summary=1',hc)).json();assert.ok(hoList.find(v=>v.id===visit.id).fsr);assert.equal((await(await request('/api/me',hc)).json()).role,'ho');
  assert.equal((await request(`/api/technician/visits/${visit.id}/review`,tc,{decision:'acknowledged'})).status,403);assert.equal((await request('/api/technician/payments?month='+visit.month,tc)).status,403);
  assert.equal((await request('/api/technician/session',tc,undefined,'DELETE')).status,200);assert.equal((await request('/api/technician/me',tc)).status,401);assert.equal((await request('/api/me',hc)).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
