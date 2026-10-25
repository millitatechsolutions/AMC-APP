import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/store.js';
import { createAuth } from '../src/auth.js';
import { resetDemoAccounts } from '../src/demo-accounts.js';

if (!process.argv.includes('--confirm-reset')) throw new Error('Use --confirm-reset only when replacing all local users. Stop the app first.');
if (process.env.AMC_HOSTED==='1' || process.env.TURSO_DATABASE_URL || process.env.TURSO_AUTH_TOKEN) throw new Error('Simple demo passwords are local only. Hosted reset is disabled.');
if (/^[a-z]+:\/\//i.test(process.env.AMC_DB_PATH||'')) throw new Error('Only a local SQLite file can be reset.');
const root = fileURLToPath(new URL('../',import.meta.url));
const dbPath = resolve(root,process.env.AMC_DB_PATH || 'data/amc.sqlite');
mkdirSync(dirname(dbPath),{recursive:true});
if (existsSync(dbPath)) {
  const backupDirectory = join(dirname(dbPath),'backups');
  mkdirSync(backupDirectory,{recursive:true});
  const backupPath = join(backupDirectory,`before-users-reset-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
  const source = new DatabaseSync(dbPath,{readOnly:true});
  try { await backup(source,backupPath); chmodSync(backupPath,0o600); } finally { source.close(); }
  console.log('Saved database backup:',backupPath);
}
const store = createStore(dbPath);
try {
  const result = await resetDemoAccounts(store.db);
  const auth = createAuth(store.db);
  const session = await auth.login({portal:'powervision',email:result.accounts[0].email,password:'12345'});
  const technician = result.accounts.find(account=>account.portal==='technician');
  let assigned=0;
  for (const visit of store.visible(session.user)) {
    if(visit.status!=='scheduled'||visit.startedAt||visit.fsr) continue;
    try { store.assignTechnician(session.user,visit.id,{technicianId:technician.id}); assigned++; }
    catch(error) { if(error.status!==409) throw error; }
  }
  for (const account of result.accounts) {
    const check = await auth.login({portal:account.portal,email:account.email,password:'12345'});
    auth.logout(check.token);
  }
  store.db.exec('DELETE FROM auth_sessions;');
  console.log(`Removed ${result.removed} accounts; created 3 active accounts; assigned ${assigned} untouched visits.`);
  for(const account of result.accounts)console.log(`${account.portal}: ${account.email}`);
  console.log('Requested local demo password: 12345');
  console.log('Saved reports, photos, inventory and audit history were preserved. Start the app again.');
} finally { store.close(); }
