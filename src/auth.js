import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const COMPANY = 'PowerVision Systems Pvt Ltd';
const PORTALS = new Set(['powervision', 'ubl', 'technician']);
const SESSION_MS = 8 * 60 * 60 * 1000;
const INVITATION_MS = 48 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const HASH_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY_HASH = `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
const digest = value => createHash('sha256').update(value).digest('hex');
const timestamp = () => new Date().toISOString();

function requiredText(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) fail(`${label} is required and must be at most ${maximum} characters`);
  return value.trim();
}

function emailAddress(value) {
  const email = requiredText(value, 'Email address', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address');
  return email;
}

function passwordValue(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || !value.trim()) fail('Use a password between 12 and 128 characters');
  return value;
}

export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, Buffer.from(salt, 'hex'), 64, HASH_OPTIONS);
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}

async function passwordMatches(password, stored) {
  const match = String(stored || DUMMY_HASH).match(/^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  const encoded = match || DUMMY_HASH.match(/^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  const input = typeof password === 'string' && password.length <= 128 ? password : 'Invalid credentials';
  const key = await deriveKey(input, Buffer.from(encoded[1], 'hex'), 64, HASH_OPTIONS);
  return Boolean(match && stored) && timingSafeEqual(key, Buffer.from(encoded[2], 'hex'));
}

function publicUser(row) {
  return {
    id: row.id, name: row.name, email: row.email, employeeId: row.employee_id,
    portal: row.portal, role: row.role, vendor: row.vendor || '', client: row.client || '',
    branchCode: row.branch_code || '', admin: Boolean(row.admin), status: row.status
  };
}

export function createAuth(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      portal TEXT NOT NULL CHECK(portal IN ('powervision','ubl','technician')),
      role TEXT NOT NULL CHECK(role IN ('ho','vendor','technician','client_ho','branch')),
      vendor TEXT NOT NULL DEFAULT '',
      client TEXT NOT NULL DEFAULT '',
      branch_code TEXT NOT NULL DEFAULT '',
      admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0,1)),
      status TEXT NOT NULL CHECK(status IN ('invited','active','disabled')),
      password_hash TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      activated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES auth_accounts(id),
      portal TEXT NOT NULL CHECK(portal IN ('powervision','ubl','technician')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions(account_id);
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES auth_accounts(id),
      purpose TEXT NOT NULL CHECK(purpose IN ('activate','reset')),
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS auth_tokens_account ON auth_tokens(account_id);
    CREATE TABLE IF NOT EXISTS auth_login_limits (
      bucket TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 5),
      window_started_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_audit (
      id INTEGER PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      account_id TEXT NOT NULL,
      at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS auth_audit_no_update BEFORE UPDATE ON auth_audit BEGIN SELECT RAISE(ABORT,'Account audit history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS auth_audit_no_delete BEFORE DELETE ON auth_audit BEGIN SELECT RAISE(ABORT,'Account audit history is immutable'); END;
  `);
  // This column distinguishes an initial invitation from a later password reset.
  if (!db.prepare('PRAGMA table_info(auth_accounts)').all().some(column => column.name === 'activated_at')) db.exec('ALTER TABLE auth_accounts ADD COLUMN activated_at TEXT');

  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const account = id => typeof id === 'string' ? db.prepare('SELECT * FROM auth_accounts WHERE id=?').get(id) : undefined;
  const atomic = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const audit = (actorId, action, accountId, detail = {}) => run('INSERT INTO auth_audit(actor_id,action,account_id,at,payload) VALUES(?,?,?,?,?)', actorId, action, accountId, timestamp(), JSON.stringify(detail));
  const activeActor = actor => {
    const row = account(actor?.id);
    if (!row || row.status !== 'active') fail('Sign in again to continue', 401);
    return row;
  };
  const administrator = actor => {
    const row = activeActor(actor);
    if (!row.admin || !['powervision', 'ubl'].includes(row.portal)) fail('Administrator access required', 403);
    return row;
  };
  const activeUblAdmin = () => db.prepare("SELECT id FROM auth_accounts WHERE portal='ubl' AND admin=1 AND status='active' LIMIT 1").get();
  const anyUblAdmin = () => db.prepare("SELECT id FROM auth_accounts WHERE portal='ubl' AND admin=1 LIMIT 1").get();
  const pendingUbl = actor => {
    if (actor.portal !== 'powervision' || activeUblAdmin()) return null;
    return db.prepare("SELECT * FROM auth_accounts WHERE portal='ubl' AND admin=1 AND activated_at IS NULL AND password_hash IS NULL AND created_by=? AND status IN ('invited','disabled') ORDER BY created_at LIMIT 1").get(actor.id) || null;
  };
  const manageable = (actor, target, action) => {
    if (actor.portal === 'ubl') return target.portal === 'ubl';
    if (actor.portal !== 'powervision') return false;
    if (['powervision', 'technician'].includes(target.portal)) return true;
    return action === 'reinvite' && pendingUbl(actor)?.id === target.id;
  };
  const scopedAccounts = actor => db.prepare(actor.portal === 'ubl' ? "SELECT * FROM auth_accounts WHERE portal='ubl' ORDER BY name,email" : "SELECT * FROM auth_accounts WHERE portal IN ('powervision','technician') ORDER BY name,email").all().map(publicUser);
  const revoke = id => {
    run('DELETE FROM auth_sessions WHERE account_id=?', id);
    run('DELETE FROM auth_tokens WHERE account_id=?', id);
  };
  const issueInvitation = (id, purpose) => {
    const invitationToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_MS).toISOString();
    run('INSERT INTO auth_tokens(token_hash,account_id,purpose,expires_at) VALUES(?,?,?,?)', digest(invitationToken), id, purpose, expiresAt);
    return { invitationToken, expiresAt };
  };
  const tokenRow = token => {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail('This invitation link is invalid or expired', 400);
    const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash=?').get(digest(token));
    const user = row && account(row.account_id);
    if (!row || row.used_at || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now() || !user || user.status !== 'invited') fail('This invitation link is invalid or expired', 400);
    return { row, user };
  };
  const reserveLoginAttempt = (portal, email, ip) => atomic(() => {
    const now = Date.now();
    const bucket = digest(JSON.stringify([portal, email, typeof ip === 'string' ? ip.slice(0, 128) : '']));
    run('DELETE FROM auth_login_limits WHERE window_started_at<=?', now - LOGIN_WINDOW_MS);
    const prior = db.prepare('SELECT * FROM auth_login_limits WHERE bucket=?').get(bucket);
    if (prior?.attempts >= 5) fail('Too many sign-in attempts. Try again in 15 minutes.', 429);
    if (prior) run('UPDATE auth_login_limits SET attempts=attempts+1 WHERE bucket=?', bucket);
    else run('INSERT INTO auth_login_limits(bucket,attempts,window_started_at) VALUES(?,1,?)', bucket, now);
    return bucket;
  });

  return {
    status() { return { initialized: Boolean(db.prepare('SELECT id FROM auth_accounts LIMIT 1').get()), registration: 'invite-only' }; },
    async bootstrap(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid initial owner details');
      const name = requiredText(input.name, 'Name', 120), email = emailAddress(input.email);
      const employeeId = requiredText(input.employeeId, 'Employee ID', 64);
      const password = passwordValue(input.password);
      if (db.prepare('SELECT id FROM auth_accounts LIMIT 1').get()) fail('The initial owner is already registered', 409);
      const encoded = await passwordHash(password);
      return atomic(() => {
        if (db.prepare('SELECT id FROM auth_accounts LIMIT 1').get()) fail('The initial owner is already registered', 409);
        const id = `AUTH-${randomUUID()}`, at = timestamp();
        run('INSERT INTO auth_accounts(id,email,name,employee_id,portal,role,vendor,admin,status,password_hash,created_at,created_by,activated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', id, email, name, employeeId, 'powervision', 'ho', COMPANY, 1, 'active', encoded, at, id, at);
        audit(id, 'owner.registered', id, { portal: 'powervision', role: 'ho' });
        return publicUser(account(id));
      });
    },
    async login(input, { ip = '' } = {}) {
      const portal = typeof input?.portal === 'string' ? input.portal : '';
      const providedEmail = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
      const email = providedEmail.slice(0, 254);
      const validInput = PORTALS.has(portal) && providedEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providedEmail) && typeof input?.password === 'string' && input.password.length >= 1 && input.password.length <= 128;
      const bucket = reserveLoginAttempt(portal.slice(0, 32), email, ip);
      const user = validInput ? db.prepare('SELECT * FROM auth_accounts WHERE email=? COLLATE NOCASE').get(email) : undefined;
      const matches = await passwordMatches(input?.password, user?.password_hash);
      if (!validInput || !user || user.status !== 'active' || user.portal !== portal || !matches) fail('Email or password is incorrect for this portal', 401);
      return atomic(() => {
        // Password reset, disable and password changes may occur while scrypt runs.
        const current = account(user.id);
        if (!current || current.status !== 'active' || current.portal !== portal || current.password_hash !== user.password_hash) fail('Email or password is incorrect for this portal', 401);
        const token = randomBytes(32).toString('base64url'), expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
        run('DELETE FROM auth_sessions WHERE expires_at<=?', timestamp());
        run('INSERT INTO auth_sessions(token_hash,account_id,portal,expires_at) VALUES(?,?,?,?)', digest(token), current.id, portal, expiresAt);
        run('DELETE FROM auth_login_limits WHERE bucket=?', bucket);
        audit(current.id, 'session.started', current.id, { portal, expiresAt });
        return { user: publicUser(current), token, expiresAt };
      });
    },
    session(token, portal) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !PORTALS.has(portal)) return null;
      const row = db.prepare('SELECT account_id,portal,expires_at FROM auth_sessions WHERE token_hash=?').get(digest(token));
      if (!row || row.portal !== portal || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) return null;
      const user = account(row.account_id);
      return user && user.status === 'active' && user.portal === portal ? publicUser(user) : null;
    },
    logout(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { signedOut: true };
      return atomic(() => {
        const row = db.prepare('SELECT account_id,portal FROM auth_sessions WHERE token_hash=?').get(digest(token));
        run('DELETE FROM auth_sessions WHERE token_hash=?', digest(token));
        if (row) audit(row.account_id, 'session.ended', row.account_id, { portal: row.portal });
        return { signedOut: true };
      });
    },
    invitation(input = {}) {
      const { row, user } = tokenRow(input?.token);
      return { name: user.name, email: user.email, portal: user.portal, role: user.role, expiresAt: row.expires_at, purpose: row.purpose };
    },
    async activate(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid invitation details');
      const password = passwordValue(input.password);
      tokenRow(input.token);
      const encoded = await passwordHash(password);
      return atomic(() => {
        const { row, user } = tokenRow(input.token);
        const at = timestamp();
        run("UPDATE auth_accounts SET status='active',password_hash=?,activated_at=COALESCE(activated_at,?) WHERE id=?", encoded, at, user.id);
        run('UPDATE auth_tokens SET used_at=? WHERE token_hash=?', at, row.token_hash);
        run('UPDATE auth_tokens SET used_at=? WHERE account_id=? AND used_at IS NULL', at, user.id);
        run('DELETE FROM auth_sessions WHERE account_id=?', user.id);
        audit(user.id, row.purpose === 'reset' ? 'password.reset' : 'account.activated', user.id, { portal: user.portal });
        return publicUser(account(user.id));
      });
    },
    accounts(actor) { return scopedAccounts(administrator(actor)); },
    administration(actor) {
      const admin = administrator(actor), pending = pendingUbl(admin);
      const latest = pending && db.prepare('SELECT expires_at FROM auth_tokens WHERE account_id=? AND used_at IS NULL ORDER BY expires_at DESC LIMIT 1').get(pending.id);
      return {
        accounts: scopedAccounts(admin),
        canInviteUblAdmin: admin.portal === 'powervision' && !anyUblAdmin(),
        pendingUblAdmin: pending ? { id: pending.id, name: pending.name, email: pending.email, status: pending.status, ...(latest ? { expiresAt: latest.expires_at } : {}) } : null
      };
    },
    createAccount(actor, input) {
      administrator(actor);
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid account details');
      const name = requiredText(input.name, 'Name', 120), email = emailAddress(input.email);
      const employeeId = requiredText(input.employeeId, 'Employee ID', 64);
      if (!PORTALS.has(input.portal)) fail('Choose a valid account portal');
      const roles = { powervision: ['ho', 'vendor'], ubl: ['client_ho', 'branch'], technician: ['technician'] };
      if (!roles[input.portal].includes(input.role)) fail('This role is not available in the selected portal');
      if (input.admin !== undefined && typeof input.admin !== 'boolean') fail('Administrator selection must be true or false');
      const admin = input.admin === true;
      if (admin && !['ho', 'vendor', 'client_ho'].includes(input.role)) fail('This role cannot be an administrator');
      const branchCode = input.role === 'branch' ? requiredText(input.branchCode, 'Branch code', 40) : '';
      return atomic(() => {
        const manager = administrator(actor);
        if (manager.portal === 'ubl' && input.portal !== 'ubl') fail('UBL administrators can only manage UBL accounts', 403);
        if (manager.portal === 'powervision' && input.portal === 'ubl' && (input.role !== 'client_ho' || !admin || anyUblAdmin())) fail('Only the first UBL administrator may be invited from PowerVision', 403);
        if (db.prepare('SELECT id FROM auth_accounts WHERE email=? COLLATE NOCASE').get(email)) fail('An account with this email address already exists', 409);
        const id = `AUTH-${randomUUID()}`;
        run('INSERT INTO auth_accounts(id,email,name,employee_id,portal,role,vendor,client,branch_code,admin,status,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', id, email, name, employeeId, input.portal, input.role, input.portal === 'ubl' ? '' : COMPANY, input.portal === 'ubl' ? 'UBL' : '', branchCode, admin ? 1 : 0, 'invited', timestamp(), manager.id);
        const invitation = issueInvitation(id, 'activate');
        audit(manager.id, 'account.invited', id, { portal: input.portal, role: input.role, admin });
        return { user: publicUser(account(id)), ...invitation };
      });
    },
    accountAction(actor, id, input) {
      administrator(actor);
      if (!input || typeof input !== 'object' || Array.isArray(input) || !['disable', 'enable', 'reset', 'reinvite'].includes(input.action)) fail('Choose a valid account action');
      return atomic(() => {
        const manager = administrator(actor), target = account(id);
        if (!target) fail('Account not found', 404);
        if (!manageable(manager, target, input.action)) fail('This account is outside your administration scope', 403);
        if (target.id === manager.id && ['disable', 'reset'].includes(input.action)) fail('Use Change password for your own account; you cannot disable or reset yourself', 403);
        if (input.action === 'disable' && target.admin && target.status === 'active') {
          const count = db.prepare("SELECT COUNT(*) AS count FROM auth_accounts WHERE portal=? AND admin=1 AND status='active'").get(target.portal).count;
          if (count <= 1) fail('The last active administrator cannot be disabled', 409);
        }
        let invitation = {};
        if (input.action === 'disable') {
          if (target.status === 'disabled') fail('This account is already disabled', 409);
          run("UPDATE auth_accounts SET status='disabled' WHERE id=?", target.id);
          revoke(target.id);
        } else if (input.action === 'enable') {
          if (target.status !== 'disabled') fail('Only disabled accounts can be enabled', 409);
          revoke(target.id);
          run('UPDATE auth_accounts SET status=? WHERE id=?', target.password_hash ? 'active' : 'invited', target.id);
          if (!target.password_hash) invitation = issueInvitation(target.id, target.activated_at ? 'reset' : 'activate');
        } else if (input.action === 'reset') {
          if (target.status === 'disabled') fail('Enable this account before issuing a password reset', 409);
          if (target.admin && target.status === 'active') {
            const count = db.prepare("SELECT COUNT(*) AS count FROM auth_accounts WHERE portal=? AND admin=1 AND status='active'").get(target.portal).count;
            if (count <= 1) fail('The last active administrator cannot lose access', 409);
          }
          revoke(target.id);
          run("UPDATE auth_accounts SET status='invited',password_hash=NULL WHERE id=?", target.id);
          invitation = issueInvitation(target.id, 'reset');
        } else {
          const initialUbl = pendingUbl(manager)?.id === target.id;
          if (target.status !== 'invited' && !(initialUbl && target.status === 'disabled')) fail('Only pending invitations can be renewed', 409);
          if (target.password_hash) fail('This account has already been activated', 409);
          revoke(target.id);
          run("UPDATE auth_accounts SET status='invited' WHERE id=?", target.id);
          invitation = issueInvitation(target.id, target.activated_at ? 'reset' : 'activate');
        }
        audit(manager.id, `account.${input.action}`, target.id, { portal: target.portal, role: target.role });
        return { user: publicUser(account(target.id)), ...invitation };
      });
    },
    async changePassword(actor, input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid password change');
      const user = activeActor(actor), password = passwordValue(input.newPassword);
      if (!(await passwordMatches(input.currentPassword, user.password_hash))) fail('Your current password is incorrect', 401);
      const encoded = await passwordHash(password);
      return atomic(() => {
        const current = activeActor(actor);
        if (current.password_hash !== user.password_hash) fail('Your credentials changed. Sign in again before changing your password.', 401);
        run('UPDATE auth_accounts SET password_hash=? WHERE id=?', encoded, user.id);
        revoke(user.id);
        audit(user.id, 'password.changed', user.id, { portal: user.portal });
        return publicUser(account(user.id));
      });
    }
  };
}
