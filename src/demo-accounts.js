import { randomUUID } from 'node:crypto';
import { createAuth, passwordHash } from './auth.js';

export const DEMO_ACCOUNTS = [
  { name:'PowerVision Admin', email:'admin@powervision.test', employeeId:'PV-ADMIN', portal:'powervision', role:'ho', vendor:'PowerVision Systems Pvt Ltd', client:'', admin:1 },
  { name:'UBL Admin', email:'admin@ubl.test', employeeId:'UBL-ADMIN', portal:'ubl', role:'client_ho', vendor:'', client:'UBL', admin:1 },
  { name:'PowerVision Technician', email:'admin@technician.test', employeeId:'PV-TECH', portal:'technician', role:'technician', vendor:'PowerVision Systems Pvt Ltd', client:'', admin:0 }
];

// Repair only the two published logins, preserving IDs and other accounts.
export async function repairClientTechnicianAccounts(db) {
  createAuth(db);
  const targets=DEMO_ACCOUNTS.filter(account=>account.portal!=='powervision');
  const hashes=await Promise.all(targets.map(()=>passwordHash('12345')));
  const at=new Date().toISOString();
  let created=0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const accounts=targets.map((account,index)=>{
      const existing=db.prepare('SELECT id,portal FROM auth_accounts WHERE email=? COLLATE NOCASE').get(account.email);
      if(existing&&existing.portal!==account.portal)throw new Error('This login email belongs to another portal; no accounts were changed.');
      const id=existing?.id||`AUTH-${randomUUID()}`;
      if(existing){
        db.prepare('DELETE FROM auth_sessions WHERE account_id=?').run(id);
        db.prepare('DELETE FROM auth_tokens WHERE account_id=?').run(id);
        db.prepare("UPDATE auth_accounts SET password_hash=?,status='active',role=?,vendor=?,client=?,branch_code='',admin=?,activated_at=? WHERE id=?")
          .run(hashes[index],account.role,account.vendor,account.client,account.admin,at,id);
      }else{
        db.prepare(`INSERT INTO auth_accounts
          (id,email,name,employee_id,portal,role,vendor,client,branch_code,admin,status,password_hash,created_at,created_by,activated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id,account.email,account.name,account.employeeId,account.portal,account.role,account.vendor,account.client,'',account.admin,'active',hashes[index],at,id,at);
        created++;
      }
      db.prepare('INSERT INTO auth_audit(actor_id,action,account_id,at,payload) VALUES(?,?,?,?,?)')
        .run(id,'account.local_login_repaired',id,at,JSON.stringify({portal:account.portal,created:!existing}));
      return {...account,id};
    });
    db.exec('DELETE FROM auth_login_limits;');
    db.exec('COMMIT');
    return {accounts,created,updated:accounts.length-created};
  }catch(error){db.exec('ROLLBACK');throw error;}
}

// Explicit local operator action only; never called by startup or HTTP.
export async function resetDemoAccounts(db) {
  createAuth(db);
  const passwords = await Promise.all(DEMO_ACCOUNTS.map(() => passwordHash('12345')));
  const at = new Date().toISOString();
  const accounts = DEMO_ACCOUNTS.map(account => ({ ...account, id:`AUTH-${randomUUID()}` }));
  db.exec('BEGIN IMMEDIATE');
  try {
    const removed = db.prepare('SELECT COUNT(*) AS count FROM auth_accounts').get().count;
    db.exec('DELETE FROM auth_sessions; DELETE FROM auth_tokens; DELETE FROM auth_login_limits; DELETE FROM auth_accounts;');
    const insert = db.prepare(`INSERT INTO auth_accounts
      (id,email,name,employee_id,portal,role,vendor,client,branch_code,admin,status,password_hash,created_at,created_by,activated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    accounts.forEach((account,index) => insert.run(account.id,account.email,account.name,account.employeeId,account.portal,account.role,account.vendor,account.client,'',account.admin,'active',passwords[index],at,accounts[0].id,at));
    db.prepare('INSERT INTO auth_audit(actor_id,action,account_id,at,payload) VALUES(?,?,?,?,?)')
      .run(accounts[0].id,'accounts.demo_reset',accounts[0].id,at,JSON.stringify({removed,created:accounts.map(({id,email,portal})=>({id,email,portal}))}));
    db.exec('COMMIT');
    return { removed, accounts };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
