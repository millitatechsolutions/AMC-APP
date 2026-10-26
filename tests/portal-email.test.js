import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createAuth, passwordHash } from '../src/auth.js';

test('Legacy email migration preserves IDs, passwords, sessions and invitations while allowing portal-specific email reuse',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('./fixtures/legacy-auth-schema.sql',import.meta.url),'utf8'));
  const encoded=await passwordHash('Previous owner password');
  db.prepare(`INSERT INTO auth_accounts(id,email,name,employee_id,portal,role,vendor,admin,status,password_hash,created_at,created_by,activated_at)
    VALUES('owner','admin@gmail.com','Old Owner','PV','powervision','ho','PowerVision Systems Pvt Ltd',1,'active',?,'2026-01-01','owner','2026-01-01')`).run(encoded);
  db.exec("INSERT INTO auth_accounts(id,email,name,employee_id,portal,role,status,created_at,created_by) VALUES('invited','invite@example.test','Invited','TECH','technician','technician','invited','2026-01-01','owner')");
  const token='s'.repeat(43),invitation='i'.repeat(43),digest=value=>createHash('sha256').update(value).digest('hex');
  const expiry=new Date(Date.now()+3600000).toISOString();
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?)').run(digest(token),'owner','powervision',expiry);
  db.prepare('INSERT INTO auth_tokens VALUES(?,?,?,?,?)').run(digest(invitation),'invited','activate',expiry,null);
  const auth=createAuth(db);
  assert.equal(db.prepare('SELECT password_hash FROM auth_accounts WHERE id=?').get('owner').password_hash,encoded);
  assert.equal(auth.session(token,'powervision').id,'owner');
  assert.equal(auth.invitation({token:invitation}).email,'invite@example.test');
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const owner=(await auth.login({portal:'powervision',email:'ADMIN@gmail.com',password:'Previous owner password'})).user;
  const invited=auth.createAccount(owner,{name:'Same email technician',email:'ADMIN@GMAIL.COM',employeeId:'TECH2',portal:'technician',role:'technician',admin:false});
  await auth.activate({token:invited.invitationToken,password:'Different technician password'});
  const tech=await auth.login({portal:'technician',email:'admin@gmail.com',password:'Different technician password'});
  assert.notEqual(tech.user.id,owner.id);
  assert.equal(auth.session(tech.token,'powervision'),null);
  await assert.rejects(auth.login({portal:'powervision',email:'admin@gmail.com',password:'Different technician password'}),e=>e.status===401);
  assert.throws(()=>auth.createAccount(owner,{name:'Duplicate',email:'admin@gmail.com',employeeId:'DUP',portal:'technician',role:'technician',admin:false}),e=>e.status===409);
  createAuth(db);
  assert.equal(auth.session(token,'powervision').id,'owner');
 }finally{db.close();}
});

test('Invalid legacy references roll migration back and restore foreign-key enforcement',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(readFileSync(new URL('./fixtures/legacy-auth-schema.sql',import.meta.url),'utf8'));
  db.exec("PRAGMA foreign_keys=OFF; INSERT INTO auth_sessions VALUES('broken','missing','ubl','2099-01-01'); PRAGMA foreign_keys=ON;");
  assert.throws(()=>createAuth(db),/invalid references/);
  assert.equal(db.isTransaction,false);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='auth_accounts_scoped'").get(),undefined);
  assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name='auth_accounts'").get().sql,/email TEXT NOT NULL UNIQUE/);
 }finally{db.close();}
});
