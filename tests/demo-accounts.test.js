import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../src/store.js';
import { createAuth } from '../src/auth.js';
import { resetDemoAccounts, repairClientTechnicianAccounts } from '../src/demo-accounts.js';

test('Explicit reset replaces all users and credentials while preserving service data and audit history',async()=>{
 const store=createStore(':memory:'),db=store.db,auth=createAuth(db);
 try{
  const old=await auth.bootstrap({name:'Previous Owner',email:'old@example.test',employeeId:'OLD',password:'Previous strong password'});
  const previous=await auth.login({portal:'powervision',email:old.email,password:'Previous strong password'});
  const invite=auth.createAccount(old,{name:'Old invite',email:'old-tech@example.test',employeeId:'OLD-TECH',portal:'technician',role:'technician',admin:false});
  store.createInventoryItem(old,{sku:'PRESERVE',name:'Preserve stock',unit:'litre',category:'Test',openingQuantity:2.125,reorderLevel:1});
  const tables=['assets','visits','fsr_versions','fsr_verifications','technician_drafts','inventory_items','inventory_movements','audit'];
  const snapshot=()=>Object.fromEntries(tables.map(table=>[table,JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all())]));
  const before=snapshot(),audits=db.prepare('SELECT COUNT(*) AS count FROM auth_audit').get().count;
  const result=await resetDemoAccounts(db);
  assert.equal(result.removed,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_accounts').get().count,3);
  assert.deepEqual(snapshot(),before);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_audit').get().count,audits+1);
  assert.equal(auth.session(previous.token,'powervision'),null);
  assert.throws(()=>auth.invitation({token:invite.invitationToken}));
  await assert.rejects(auth.login({portal:'powervision',email:old.email,password:'Previous strong password'}));
  for(const account of result.accounts){
   const login=await auth.login({portal:account.portal,email:account.email,password:'pak1234'});
   assert.equal(login.user.id,account.id);
   for(const other of ['powervision','ubl','technician'].filter(p=>p!==account.portal)){
    assert.equal(auth.session(login.token,other),null);
    const otherLogin=await auth.login({portal:other,email:account.email,password:'pak1234'});
    assert.notEqual(otherLogin.user.id,account.id);
   }
  }
  const invitation=auth.createAccount((await auth.login({portal:'powervision',email:result.accounts[0].email,password:'pak1234'})).user,{name:'New invite',email:'new@example.test',employeeId:'NEW',portal:'technician',role:'technician',admin:false});
  await assert.rejects(auth.activate({token:invitation.invitationToken,password:'pak1234'}),e=>e.status===422);
 }finally{store.close();}
});

test('Reset CLI makes a recoverable backup, assigns untouched visits and persists three working logins',()=>{
 const directory=mkdtempSync(join(tmpdir(),'amc-user-reset-')),path=join(directory,'amc.sqlite');
 try{
  const initial=createStore(path);createAuth(initial.db);initial.close();
  const run=spawnSync(process.execPath,['scripts/reset-demo-users.mjs','--confirm-reset'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,AMC_HOSTED:'0',AMC_DB_PATH:path,TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:''}});
  assert.equal(run.status,0,run.stderr);
  const backups=readdirSync(join(directory,'backups'));assert.equal(backups.length,1);
  const prior=new DatabaseSync(join(directory,'backups',backups[0]),{readOnly:true});
  assert.equal(prior.prepare('SELECT COUNT(*) AS count FROM auth_accounts').get().count,0);prior.close();
  const db=new DatabaseSync(path);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_accounts').get().count,3);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM visits').get().count,12);
  const tech=db.prepare("SELECT id FROM auth_accounts WHERE portal='technician'").get();
  assert.equal(db.prepare('SELECT payload FROM visits').all().every(row=>JSON.parse(row.payload).technicianId===tech.id),true);db.close();
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Reset CLI requires an explicit reset flag and refuses hosted mode before touching a database',()=>{
 const directory=mkdtempSync(join(tmpdir(),'amc-reset-guard-')),path=join(directory,'untouched.sqlite');
 try{
  for(const [args,hosted] of [[[], '0'],[['--confirm-reset'],'1']]){
   const run=spawnSync(process.execPath,['scripts/reset-demo-users.mjs',...args],{encoding:'utf8',env:{...process.env,AMC_HOSTED:hosted,AMC_DB_PATH:path}});
   assert.notEqual(run.status,0);assert.equal(existsSync(path),false);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Two-portal repair preserves PowerVision sessions and technician assignments, revokes old credentials and creates a missing UBL account',async()=>{
 const store=createStore(':memory:'),db=store.db,auth=createAuth(db);
 try{
  const initial=await resetDemoAccounts(db);
  const pv=await auth.login({portal:'powervision',email:'admin@gmail.com',password:'pak1234'});
  const tech=await auth.login({portal:'technician',email:'admin@gmail.com',password:'pak1234'});
  const visit=store.visible(pv.user)[0];store.assignTechnician(pv.user,visit.id,{technicianId:tech.user.id});
  const before=JSON.stringify(db.prepare('SELECT * FROM visits').all());
  const pvBefore=JSON.stringify(db.prepare("SELECT * FROM auth_accounts WHERE portal='powervision'").get());
  db.prepare("DELETE FROM auth_accounts WHERE portal='ubl'").run();
  await assert.rejects(auth.login({portal:'technician',email:tech.user.email,password:'incorrect'}));
  const result=await repairClientTechnicianAccounts(db);
  assert.equal(result.created,1);assert.equal(result.updated,1);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM auth_accounts WHERE portal='powervision'").get()),pvBefore);
  assert.equal(auth.session(pv.token,'powervision').id,pv.user.id);
  assert.equal(auth.session(tech.token,'technician'),null);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM visits').all()),before);
  assert.equal(result.accounts.find(a=>a.portal==='technician').id,tech.user.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_login_limits').get().count,0);
  for(const account of result.accounts){
   const session=await auth.login({portal:account.portal,email:account.email,password:'pak1234'});
   assert.equal(session.user.id,account.id);
   assert.equal(auth.session(session.token,'powervision'),null);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_accounts').get().count,initial.accounts.length);
 }finally{store.close();}
});

test('Targeted CLI works when PowerVision has a different password and leaves it unchanged',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'amc-targeted-reset-')),path=join(directory,'amc.sqlite');
 try{
  const initial=createStore(path),auth=createAuth(initial.db);
  await auth.bootstrap({name:'Existing PV owner',email:'owner@example.test',employeeId:'KEEP',password:'Keep this existing password'});
  const owner=JSON.stringify(initial.db.prepare("SELECT * FROM auth_accounts WHERE portal='powervision'").get());initial.close();
  const run=spawnSync(process.execPath,['scripts/reset-demo-users.mjs','--confirm-reset','--ubl-technician'],{encoding:'utf8',env:{...process.env,AMC_HOSTED:'0',AMC_DB_PATH:path,TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:''}});
  assert.equal(run.status,0,run.stderr);
  const db=new DatabaseSync(path);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM auth_accounts WHERE portal='powervision'").get()),owner);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_accounts').get().count,3);db.close();
  assert.equal(readdirSync(join(directory,'backups')).length,1);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
