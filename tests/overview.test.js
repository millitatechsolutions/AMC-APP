import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { createStore, users, withBranchLocation } from '../src/store.js';
import { serviceSummary, branchLocations } from '../shared/overview.js';
import { fields } from '../src/fields.js';
const ho=users[0],tech=users.find(u=>u.role==='technician'),branch=users.find(u=>u.id==='branch-five');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function fsr(){return Object.fromEntries(fields.filter(f=>f.type!=='auto').map(f=>[f.key,Array.isArray(f.type)?f.type[0]:f.type==='number'?(f.key==='currentHours'?1200:10):f.type==='attachment'?image:'None']));}
test('Overview tracks technician submission separately from branch decisions and payable status',()=>{
 const store=createStore(':memory:');try{
  const initial=serviceSummary(store.visible(ho));
  assert.deepEqual([initial.amc.total,initial.warranty.total,initial.total.total],[8,4,12]);
  assert.equal(initial.total.performed,0);assert.equal(initial.total.remaining,12);
  const visit=store.visible(branch)[0];store.submit(tech,visit.id,fsr());
  let current=serviceSummary(store.visible(ho));
  assert.equal(current.amc.performed,1);assert.equal(current.amc.remaining,7);assert.equal(current.total.remaining,11);assert.equal(current.warranty.performed,0);
  assert.equal(current.total.awaitingReview,1);assert.equal(current.total.acknowledged,0);
  assert.equal(store.payments(ho,visit.month).find(p=>p.visitId===visit.id).payable,0);
  store.review(branch,visit.id,'unacknowledged','A clearer photograph is needed');
  current=serviceSummary(store.visible(ho));assert.equal(current.amc.performed,1);assert.equal(current.amc.needsCorrection,1);assert.equal(current.amc.remaining,7);
  store.submit(tech,visit.id,fsr());store.review(branch,visit.id,'acknowledged');
  current=serviceSummary(store.visible(ho));assert.equal(current.amc.performed,1);assert.equal(current.amc.acknowledged,1);assert.equal(current.amc.needsCorrection,0);
  assert.equal(serviceSummary([]).total.total,0);
  const locations=branchLocations(store.visible(branch),store.assets(branch));assert.equal(locations.length,1);assert.equal(locations[0].branchCode,'0005');assert.equal(locations[0].state,'performed');assert.equal(locations[0].locationSource,'Demo city location');
 }finally{store.close();}
});
test('Branch map groups multiple assets, retains missing-location totals and never invents real coordinates',()=>{
 const visits=[{id:'v1',assetId:'a1',branchCode:'1',branchName:'Branch',status:'submitted',warranty:'OOW',fsr:{}},{id:'v2',assetId:'a2',branchCode:'1',branchName:'Branch',status:'scheduled',warranty:'Warranty',fsr:null},{id:'v3',assetId:'a3',branchCode:'2',branchName:'Unmapped',status:'scheduled',warranty:'OOW',fsr:null}];
 const branches=branchLocations(visits,[{id:'a1',latitude:0,longitude:0},{id:'a2',latitude:30,longitude:70},{id:'a3',latitude:95,longitude:70}]);
 assert.equal(branches.length,2);assert.equal(branches[0].latitude,0);assert.equal(branches[0].total,2);assert.equal(branches[0].performed,1);assert.equal(branches[0].remaining,1);assert.equal(branches[0].state,'remaining');assert.equal(branches[1].latitude,null);assert.equal(serviceSummary(visits).total.total,3);
 const actual={id:'real',engineSerial:'ACTUAL-ENGINE'};assert.deepEqual(withBranchLocation(actual),actual);
 const known={engineSerial:'DEMO-ENGINE-1',latitude:30,longitude:70};assert.deepEqual(withBranchLocation(known),known);
});
test('Polling API omits image bodies and detail/map data stays branch-scoped',async()=>{
 const {server,store}=createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const visit=store.visible(branch)[0];store.submit(tech,visit.id,fsr());
  const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:branch.id})});const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await fetch(base+'/api/visits?summary=1',{headers:{cookie}}),text=await response.text();assert.equal(response.status,200);assert.ok(!text.includes('data:image'));const list=JSON.parse(text);assert.equal(list.length,1);assert.ok(list[0].fsr.fsrNumber);
  const detail=await fetch(base+`/api/visits/${visit.id}`,{headers:{cookie}});assert.match(await detail.text(),/data:image/);
  const other=store.visible(ho).find(v=>v.branchCode!=='0005');assert.equal((await fetch(base+`/api/visits/${other.id}`,{headers:{cookie}})).status,403);
  assert.equal((await fetch(base+'/api/map-config')).status,401);assert.equal((await fetch(base+'/api/map-config',{headers:{cookie}})).status,200);
  const assets=await(await fetch(base+'/api/assets',{headers:{cookie}})).json();assert.equal(assets.length,1);assert.equal(assets[0].branchCode,'0005');assert.equal(typeof assets[0].latitude,'number');
  assert.equal((await fetch(base+'/overview.js')).status,200);assert.equal((await fetch(base+'/branch-map.geojson')).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
