import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore,users } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fields } from '../src/fields.js';
const tech=users.find(u=>u.role==='technician'),branch=users.find(u=>u.id==='branch-demo'),branch2=users.find(u=>u.id==='branch-two'),ho=users[0];
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
export function completeFsr(){return Object.fromEntries(fields.filter(f=>f.type!=='auto'&&!f.optional).map(f=>[f.key,Array.isArray(f.type)?f.type[0]:f.type==='number'?(f.key==='currentHours'?1200:10):f.type==='attachment'?image:'None']));}
test('Required FSR data, reading validation and scoped submission',()=>{
 const store=createStore(':memory:');try{
  const visit=store.visible(tech)[0];
  assert.throws(()=>store.submit(tech,visit.id,{}),e=>e.status===422);
  assert.throws(()=>store.submit(ho,visit.id,completeFsr()),e=>e.status===403);
  assert.throws(()=>store.submit(tech,visit.id,{...completeFsr(),currentHours:999}),e=>e.status===422);
  assert.throws(()=>store.submit(tech,visit.id,{...completeFsr(),radiatorCondition:'Bad',radiatorBad:''}),/If Bad is required/);
  assert.throws(()=>store.submit(tech,visit.id,{...completeFsr(),complaintLogged:'Yes',complaintNumber:''}),/Complaint Number/);
  const result=store.submit(tech,visit.id,completeFsr());assert.equal(result.status,'submitted');assert.equal(result.fsr.pmRequired,'Yes');assert.equal(result.fsr.warranty,'Warranty');assert.equal(result.fsr.branchCode,visit.branchCode);
  assert.throws(()=>store.submit(tech,visit.id,completeFsr()),e=>e.status===409);
 }finally{store.close();}
});
test('Branch isolation, rejection reason, resubmission, zero-charge warranty and audit',()=>{
 const store=createStore(':memory:');try{
  const visit=store.visible(branch)[0];store.submit(tech,visit.id,completeFsr());
  assert.throws(()=>store.get(branch2,visit.id),e=>e.status===403);
  assert.throws(()=>store.review(branch2,visit.id,'acknowledged'),e=>e.status===403);
  assert.throws(()=>store.review(branch,visit.id,'unacknowledged','  '),e=>e.status===422);
  store.review(branch,visit.id,'unacknowledged','Photo unclear');assert.equal(store.payments(ho,visit.month)[0].payable,0);
  store.submit(tech,visit.id,completeFsr());store.review(branch,visit.id,'acknowledged');
  const line=store.payments(ho,visit.month).find(p=>p.visitId===visit.id);assert.equal(line.eligible,false);assert.equal(line.payable,0);
  assert.throws(()=>store.review(branch,visit.id,'acknowledged'),e=>e.status===409);
  assert.equal(store.history(branch,visit.id).length,2);assert.throws(()=>store.history(branch2,visit.id),e=>e.status===403);assert.equal(store.audit(branch).length,4);assert.equal(store.audit(branch)[0].detail.employeeId,branch.employeeId);
 }finally{store.close();}
});
test('Only acknowledged OOW payable; server asset rate wins and data survives restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'amc-test-')),path=join(dir,'db.sqlite');let store=createStore(path);
 try{
  const visit=store.visible(tech).find(v=>v.warranty==='OOW'),reviewer={...branch,branchCode:visit.branchCode};
  store.submit(tech,visit.id,{...completeFsr(),rate:1,warranty:'Warranty'});
  assert.equal(store.payments(ho,visit.month).find(p=>p.visitId===visit.id).payable,0);
  store.review(reviewer,visit.id,'acknowledged');
  const line=store.payments(ho,visit.month).find(p=>p.visitId===visit.id);assert.equal(line.payable,3500);assert.equal(line.eligible,true);assert.ok(line.fsrId);assert.ok(line.acknowledgedAt);
  store.close();store=createStore(path);assert.equal(store.get(ho,visit.id).status,'acknowledged');assert.equal(store.payments(ho,visit.month).find(p=>p.visitId===visit.id).payable,3500);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('HTTP session, role enforcement, CSV export, static UI and functional submit/review',async()=>{
 const {server}=createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const login=async id=>{const r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:id})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
 const post=async(path,cookie,input)=>fetch(base+path,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(input)});
 try{
  assert.equal((await fetch(base+'/api/visits')).status,401);
  assert.match(await (await fetch(base)).text(),/PowerVision Systems Pvt Ltd/);
  const tc=await login(tech.id),bc=await login(branch.id),hc=await login(ho.id);
  const visits=await(await fetch(base+'/api/visits',{headers:{cookie:tc}})).json(),visit=visits[0];
  assert.equal((await post(`/api/visits/${visit.id}/submit`,tc,completeFsr())).status,200);
  assert.equal((await post(`/api/visits/${visit.id}/review`,bc,{decision:'acknowledged'})).status,200);
  assert.equal((await fetch(base+`/api/payments?month=${visit.month}`,{headers:{cookie:bc}})).status,403);
  const csv=await fetch(base+`/api/export.csv?month=${visit.month}`,{headers:{cookie:hc}});assert.equal(csv.status,200);assert.match(await csv.text(),/FSR-/);
  const bad=await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(bad.status,403);
 }finally{await new Promise(r=>server.close(r));}
});
