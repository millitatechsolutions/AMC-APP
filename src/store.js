import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fields, validateFields } from './fields.js';
export const users=[
 {id:'ho-demo',name:'HO Operations',role:'ho',employeeId:'DEMO-HO'},
 {id:'tech-demo',name:'Assigned Technician',role:'technician',employeeId:'DEMO-TECH'},
 {id:'branch-demo',name:'Branch 0001 Reviewer',role:'branch',branchCode:'0001',employeeId:'DEMO-BR-1'},
 {id:'branch-two',name:'Branch 0002 Reviewer',role:'branch',branchCode:'0002',employeeId:'DEMO-BR-2'},
 {id:'branch-five',name:'Branch 0005 Reviewer (OOW)',role:'branch',branchCode:'0005',employeeId:'DEMO-BR-5'},
 {id:'vendor-demo',name:'Vendor Management',role:'vendor',vendor:'Demo AMC Services',employeeId:'DEMO-VENDOR'}
];
export const dateAdd=(day,n)=>new Date(Date.parse(`${day}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
// Approximate city locations for synthetic records only; these are not verified UBL branch coordinates.
export function withBranchLocation(asset) {
 if(typeof asset.latitude === 'number' && typeof asset.longitude === 'number') return asset;
 const match=String(asset.engineSerial??'').match(/^DEMO-ENGINE-(\d+)$/);
 if(!match) return asset;
 const index=Number(match[1])-1;
 const cities=[{latitude:24.8138,longitude:67.0290},{latitude:31.5105,longitude:74.3440},{latitude:33.7130,longitude:73.0620},{latitude:33.5910,longitude:73.0540}];
 const location=cities[index%cities.length];
 // Offset demo pins so multiple synthetic branches in one city remain selectable.
 return {...asset,...location,latitude:location.latitude+Math.floor(index/4)*0.025,longitude:location.longitude+Math.floor(index/4)*0.03,locationSource:'Demo city location',client:'UBL'};
}
export function createStore(path) {
 if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), month TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(asset_id,month));
 CREATE TABLE IF NOT EXISTS fsr_versions (id INTEGER PRIMARY KEY, visit_id TEXT NOT NULL REFERENCES visits(id), payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL);`);
 const run=(sql,...params)=>db.prepare(sql).run(...params);
 const read=(table)=>db.prepare(`SELECT payload FROM ${table}`).all().map(r=>JSON.parse(r.payload));
 const audit=(actor,action,entity,detail={})=>run('INSERT INTO audit(actor,action,entity,at,detail) VALUES(?,?,?,?,?)',actor.id,action,entity,new Date().toISOString(),JSON.stringify(detail));
 const transaction=(fn)=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 const accessible=(user,visit)=>user.role==='ho' || user.role==='branch' && visit.branchCode===user.branchCode || user.role==='technician' && visit.technicianId===user.id || user.role==='vendor' && visit.vendor===user.vendor;
 if(!read('assets').length) transaction(()=>{
   const now=new Date().toISOString().slice(0,10),month=now.slice(0,7);
   for(let i=1;i<=12;i++) {
     const branchCode=String(i).padStart(4,'0');
     const asset={id:`GEN-${String(i).padStart(4,'0')}`,branchCode,branchName:['Clifton','Gulberg','Blue Area','Saddar'][ (i-1)%4 ]+' Demo Branch',siteAddress:'Synthetic demo site '+branchCode,region:['South','Central','North'][(i-1)%3],vendor:'Demo AMC Services',warranty:i<=4?'Warranty':'OOW',rate:i<=4?0:3500,installationYear:i<=4?2026:2023,lastVisitDate:dateAdd(now,-30),lastServiceDate:dateAdd(now,-90),lastServiceHours:1000,engineSerial:`DEMO-ENGINE-${i}`,model:'Demo 100',rating:100};
     run('INSERT INTO assets VALUES(?,?)',asset.id,JSON.stringify(asset));
     const visit={id:`VIS-${month}-${branchCode}`,assetId:asset.id,branchCode,branchName:asset.branchName,region:asset.region,vendor:asset.vendor,warranty:asset.warranty,rate:asset.rate,month,dueDate:dateAdd(now,i-5),technicianId:'tech-demo',status:'scheduled',fsr:null,acknowledgement:null};
     run('INSERT INTO visits VALUES(?,?,?,?,?)',visit.id,asset.id,month,visit.status,JSON.stringify(visit));
   }
 });
 const save=visit=>run('UPDATE visits SET status=?,payload=? WHERE id=?',visit.status,JSON.stringify(visit),visit.id);
 const visible=user=>read('visits').filter(v=>accessible(user,v));
 const get=(user,id)=>{const v=read('visits').find(v=>v.id===id);if(!v)fail('Visit not found',404);if(!accessible(user,v))fail('Access denied',403);return v;};
 const payments=(user,month)=>{if(!['ho','vendor'].includes(user.role))fail('Access denied',403);return visible(user).filter(v=>v.month===month).map(v=>({visitId:v.id,fsrId:v.fsr?.fsrNumber??'',branchCode:v.branchCode,assetId:v.assetId,vendor:v.vendor,month:v.month,warranty:v.warranty,status:v.status,eligible:v.status==='acknowledged' && v.warranty==='OOW',rate:v.rate,payable:v.status==='acknowledged' && v.warranty==='OOW'?v.rate:0,acknowledgedBy:v.acknowledgement?.userId??'',acknowledgedAt:v.acknowledgement?.at??''}));};
 return {db,visible,get,payments,assets:user=>{const assignedIds=new Set(visible(user).map(v=>v.assetId));return read('assets').filter(a=>assignedIds.has(a.id)).map(withBranchLocation);},
   submit(user,id,input) {return transaction(()=>{
    if(user.role!=='technician')fail('Only the assigned technician can submit',403);
    const v=get(user,id);if(!['scheduled','unacknowledged'].includes(v.status))fail('This visit cannot be submitted in its current state',409);
    const errors=validateFields(input);if(errors.length)fail(errors.join('; '),422);
    const a=read('assets').find(a=>a.id===v.assetId);
    if(Number(input.currentHours)<a.lastServiceHours)fail('Running hours cannot be below the last service reading',422);
    const stamp=new Date().toISOString(),day=stamp.slice(0,10);
    const sixMonthsAgo=new Date(stamp);sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth()-6);
    const fsr=Object.fromEntries(fields.filter(f=>f.type!=='auto').map(f=>[f.key,input[f.key]??'']));
    Object.assign(fsr,{branchCode:a.branchCode,siteAddress:a.siteAddress,region:a.region,vendor:a.vendor,customerId:`${a.branchCode}-${randomUUID()}`,month:v.month,visitDate:day,lastVisitDate:a.lastVisitDate,scheduleDate:v.dueDate,visitStatus:day>dateAdd(v.dueDate,5)?'Delayed':'On-Time',nextServiceDue:dateAdd(day,30),fsrNumber:v.fsr?.fsrNumber??`FSR-${randomUUID()}`,lastServiceDate:a.lastServiceDate,lastServiceHours:a.lastServiceHours,pmRequired:Number(input.currentHours)-a.lastServiceHours>=200 || new Date(a.lastServiceDate)<sixMonthsAgo?'Yes':'No',installationYear:a.installationYear,warranty:a.warranty,submittedAt:stamp,technicianId:user.id});
    run('INSERT INTO fsr_versions(visit_id,payload) VALUES(?,?)',id,JSON.stringify(fsr));
    v.fsr=fsr;v.status='submitted';v.acknowledgement=null;save(v);audit(user,'fsr.submitted',id,{fsrNumber:fsr.fsrNumber});return v;
   });},
   review(user,id,decision,reason) {return transaction(()=>{
    if(user.role!=='branch')fail('Only an authorized branch reviewer can acknowledge',403);
    const v=get(user,id);if(v.status!=='submitted')fail('Only submitted FSRs can be reviewed',409);
    if(!['acknowledged','unacknowledged'].includes(decision))fail('Invalid decision');
    if(decision==='unacknowledged' && (!reason || !String(reason).trim()))fail('A reason is required to unacknowledge',422);
    if(reason && (typeof reason!=='string'||reason.length>4000))fail('Invalid reason',422);
    v.status=decision;v.acknowledgement={userId:user.id,employeeId:user.employeeId,at:new Date().toISOString(),decision,reason:String(reason??'').trim(),fsrId:v.fsr.fsrNumber};save(v);audit(user,`fsr.${decision}`,id,v.acknowledgement);return v;
   });},
   history(user,id) {get(user,id);return db.prepare('SELECT id,payload FROM fsr_versions WHERE visit_id=? ORDER BY id').all(id).map(r=>({revision:r.id,fsr:JSON.parse(r.payload)}));},
   audit(user) {const ids=new Set(visible(user).map(v=>v.id));return db.prepare('SELECT * FROM audit ORDER BY id DESC').all().filter(a=>ids.has(a.entity)).map(a=>({...a,detail:JSON.parse(a.detail)}));},
   close(){db.close();}
 };
}
