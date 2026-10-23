import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request as rawHttpRequest } from 'node:http';
import { createAuth } from '../src/auth.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fields } from '../src/fields.js';

const companyName = 'PowerVision Systems Pvt Ltd';
const password = 'Test-only strong password 2026';
const replacement = 'Replacement test password 2026';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const ownerInput = changes => ({ name: 'Test PowerVision owner', email: 'owner@example.test', employeeId: 'TEST-OWNER', password, ...changes });
const accountInput = (name, changes = {}) => ({ name: `Test ${name}`, email: `${name}@example.test`, employeeId: `TEST-${name}`, portal: 'technician', role: 'technician', admin: false, ...changes });
const digest = token => createHash('sha256').update(token).digest('hex');
const dbFor = () => { const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); return db; };
const rejected = error => Number.isInteger(error.status) && error.status >= 400 && error.status < 500;
const completeFsr = () => Object.fromEntries(fields.filter(field => field.type !== 'auto' && !field.optional).map(field => [field.key,
  Array.isArray(field.type) ? field.type[0] : field.type === 'number' ? (field.key === 'currentHours' ? 1200 : 10) : field.type === 'attachment' ? image : 'Synthetic inspection'
]));

async function invite(auth, actor, input) {
  const invitation = auth.createAccount(actor, input);
  const user = await auth.activate({ token: invitation.invitationToken, password });
  return { user, invitation };
}

function assertPrivateStorage(db, secrets) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'auth_%'").all();
  const serialized = JSON.stringify(tables.map(({ name }) => db.prepare(`SELECT * FROM ${name}`).all()));
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, 'Credentials and bearer tokens must never be stored in plaintext');
}

test('Initial owner registration is explicit, password-protected and atomic under competing bootstrap requests', async () => {
  const db = dbFor(), auth = createAuth(db);
  try {
    assert.deepEqual(auth.status(), { initialized: false, registration: 'invite-only' });
    await assert.rejects(auth.bootstrap(ownerInput({ password: 'too-short' })), error => error.status === 422);
    await assert.rejects(auth.bootstrap(ownerInput({ password: ' '.repeat(12) })), error => error.status === 422);
    assert.equal(auth.status().initialized, false);
    const attempts = await Promise.allSettled([
      auth.bootstrap(ownerInput({ email: ' FIRST@example.test ', portal: 'ubl', role: 'client_ho', vendor: 'Other company', admin: false })),
      auth.bootstrap(ownerInput({ email: 'second@example.test' }))
    ]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
    const owner = attempts.find(result => result.status === 'fulfilled').value;
    assert.equal(owner.portal, 'powervision');
    assert.equal(owner.role, 'ho');
    assert.equal(owner.vendor, companyName);
    assert.equal(owner.admin, true);
    assert.equal(owner.status, 'active');
    assert.equal(owner.email, owner.email.trim().toLowerCase());
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_accounts').get().count, 1);
    const record = db.prepare('SELECT * FROM auth_accounts WHERE id=?').get(owner.id);
    assert.match(record.password_hash, /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(Object.hasOwn(owner, 'password_hash'), false);
    await assert.rejects(auth.bootstrap(ownerInput({ email: 'third@example.test' })), error => error.status === 409);
    assertPrivateStorage(db, [password]);
  } finally { db.close(); }
});

test('Company and UBL administrators invite only their own teams, and accounts cannot escalate roles or sign into another portal', async () => {
  const db = dbFor(), auth = createAuth(db);
  try {
    const owner = await auth.bootstrap(ownerInput());
    assert.equal(auth.administration(owner).canInviteUblAdmin, true);
    const technicianInvitation = auth.createAccount(owner, accountInput('technician', { id: 'ATTACK-ID', status: 'active', client: 'HBL', vendor: 'Other company' }));
    assert.equal(technicianInvitation.user.status, 'invited');
    assert.equal(technicianInvitation.user.vendor, companyName);
    assert.equal(technicianInvitation.user.client, '');
    assert.notEqual(technicianInvitation.user.id, 'ATTACK-ID');
    assert.match(technicianInvitation.invitationToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(auth.invitation({ token: technicianInvitation.invitationToken }).portal, 'technician');
    const technician = await auth.activate({ token: technicianInvitation.invitationToken, password });
    const { user: companyReader } = await invite(auth, owner, accountInput('company-reader', { portal: 'powervision', role: 'ho' }));
    const ublInvitation = auth.createAccount(owner, accountInput('ubl-admin', { portal: 'ubl', role: 'client_ho', admin: true }));
    assert.equal(auth.administration(owner).canInviteUblAdmin, false);
    assert.equal(auth.administration(owner).pendingUblAdmin.id, ublInvitation.user.id);
    assert.throws(() => auth.createAccount(owner, accountInput('second-ubl-admin', { portal: 'ubl', role: 'client_ho', admin: true })), error => error.status === 403);
    const ublAdmin = await auth.activate({ token: ublInvitation.invitationToken, password });
    assert.equal(ublAdmin.client, 'UBL');
    assert.equal(ublAdmin.vendor, '');
    assert.equal(auth.administration(owner).pendingUblAdmin, null);
    const { user: ublReader } = await invite(auth, ublAdmin, accountInput('ubl-reader', { portal: 'ubl', role: 'client_ho', client: 'HBL' }));
    const { user: ublBranch } = await invite(auth, ublAdmin, accountInput('ubl-branch', { portal: 'ubl', role: 'branch', branchCode: '0001' }));
    assert.equal(ublReader.client, 'UBL', 'The client is set from the authorized portal rather than caller-supplied metadata');
    assert.ok(auth.accounts(ublAdmin).every(user => user.portal === 'ubl' && user.client === 'UBL'));
    assert.ok(auth.accounts(owner).every(user => ['powervision', 'technician'].includes(user.portal)));
    for (const actor of [technician, companyReader, ublReader, ublBranch]) {
      assert.throws(() => auth.accounts(actor), error => error.status === 403);
      assert.throws(() => auth.createAccount(actor, accountInput('unauthorized-' + actor.id)), error => error.status === 403);
    }
    assert.throws(() => auth.createAccount({ ...ublAdmin, portal: 'powervision', vendor: companyName }, accountInput('forged-actor-tech')), error => error.status === 403, 'Administrator scope must be reloaded from the account database');
    assert.throws(() => auth.createAccount(ublAdmin, accountInput('forbidden-company', { portal: 'powervision', role: 'ho', admin: true })), error => error.status === 403);
    assert.throws(() => auth.createAccount(ublAdmin, accountInput('forbidden-tech')), error => error.status === 403);
    assert.throws(() => auth.createAccount(owner, accountInput('wrong-role', { portal: 'technician', role: 'ho', admin: true })), error => error.status === 422);
    assert.throws(() => auth.createAccount(owner, accountInput('tech-admin', { admin: true })), error => error.status === 422);
    assert.throws(() => auth.createAccount(owner, accountInput('duplicate', { email: technician.email.toUpperCase() })), error => error.status === 409);
    assert.throws(() => auth.accountAction(owner, ublReader.id, { action: 'disable' }), error => error.status === 403);
    assert.throws(() => auth.accountAction(ublAdmin, technician.id, { action: 'reset' }), error => error.status === 403);
    for (const user of [owner, technician, ublAdmin]) {
      const session = await auth.login({ portal: user.portal, email: user.email.toUpperCase(), password });
      assert.equal(auth.session(session.token, user.portal).id, user.id);
      for (const portal of ['powervision', 'ubl', 'technician'].filter(portal => portal !== user.portal)) {
        assert.equal(auth.session(session.token, portal), null);
        await assert.rejects(auth.login({ portal, email: user.email, password }), error => error.status === 401);
      }
      auth.logout(session.token);
      assert.equal(auth.session(session.token, user.portal), null);
    }
    assertPrivateStorage(db, [password, technicianInvitation.invitationToken, ublInvitation.invitationToken]);
  } finally { db.close(); }
});

test('Invitation renewal, expiry and competing activation preserve one-time use and never create an automatic session', async () => {
  const db = dbFor(), auth = createAuth(db);
  try {
    const owner = await auth.bootstrap(ownerInput());
    const original = auth.createAccount(owner, accountInput('expiring-tech'));
    db.prepare('UPDATE auth_tokens SET expires_at=? WHERE account_id=?').run('2000-01-01T00:00:00.000Z', original.user.id);
    assert.throws(() => auth.invitation({ token: original.invitationToken }), rejected);
    await assert.rejects(auth.activate({ token: original.invitationToken, password }), rejected);
    const renewed = auth.accountAction(owner, original.user.id, { action: 'reinvite' });
    assert.notEqual(renewed.invitationToken, original.invitationToken);
    assert.throws(() => auth.invitation({ token: original.invitationToken }), rejected);
    await assert.rejects(auth.activate({ token: renewed.invitationToken, password: 'short' }), error => error.status === 422);
    const activations = await Promise.allSettled([
      auth.activate({ token: renewed.invitationToken, password }), auth.activate({ token: renewed.invitationToken, password })
    ]);
    assert.equal(activations.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(activations.filter(result => result.status === 'rejected' && rejected(result.reason)).length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0);
    assert.throws(() => auth.invitation({ token: renewed.invitationToken }), rejected);
    assert.throws(() => auth.accountAction(owner, original.user.id, { action: 'reinvite' }), error => error.status === 409);
    const session = await auth.login({ portal: 'technician', email: original.user.email, password });
    assert.ok(auth.session(session.token, 'technician'));
    assert.equal(db.prepare('SELECT token_hash FROM auth_sessions').get().token_hash, digest(session.token));
    db.prepare('UPDATE auth_sessions SET expires_at=? WHERE token_hash=?').run('2000-01-01T00:00:00.000Z', digest(session.token));
    assert.equal(auth.session(session.token, 'technician'), null);
    assertPrivateStorage(db, [password, original.invitationToken, renewed.invitationToken, session.token]);
  } finally { db.close(); }
});

test('Only the original company inviter can renew the initial UBL invitation, and activation ends that company access', async () => {
  const db = dbFor(), auth = createAuth(db);
  try {
    const owner = await auth.bootstrap(ownerInput());
    const { user: secondCompanyAdmin } = await invite(auth, owner, accountInput('second-company-admin', { portal: 'powervision', role: 'ho', admin: true }));
    const initial = auth.createAccount(owner, accountInput('initial-ubl-admin', { portal: 'ubl', role: 'client_ho', admin: true }));
    db.prepare('UPDATE auth_tokens SET expires_at=? WHERE account_id=?').run('2000-01-01T00:00:00.000Z', initial.user.id);
    assert.equal(auth.administration(owner).pendingUblAdmin.id, initial.user.id);
    assert.equal(auth.administration(secondCompanyAdmin).pendingUblAdmin, null);
    assert.throws(() => auth.accountAction(secondCompanyAdmin, initial.user.id, { action: 'reinvite' }), error => error.status === 403);
    const renewed = auth.accountAction(owner, initial.user.id, { action: 'reinvite' });
    await assert.rejects(auth.activate({ token: initial.invitationToken, password }), rejected);
    const ublAdmin = await auth.activate({ token: renewed.invitationToken, password });
    assert.equal(auth.administration(owner).pendingUblAdmin, null);
    assert.equal(auth.administration(owner).canInviteUblAdmin, false);
    for (const action of ['reinvite', 'reset', 'disable']) assert.throws(() => auth.accountAction(owner, ublAdmin.id, { action }), error => error.status === 403);
    const { user: secondUblAdmin } = await invite(auth, ublAdmin, accountInput('second-ubl-admin', { portal: 'ubl', role: 'client_ho', admin: true }));
    const reset = auth.accountAction(secondUblAdmin, ublAdmin.id, { action: 'reset' });
    assert.equal(reset.user.status, 'invited');
    assert.equal(auth.administration(owner).pendingUblAdmin, null, 'A later UBL password reset must not reopen the original company handoff');
    assert.throws(() => auth.accountAction(owner, ublAdmin.id, { action: 'reinvite' }), error => error.status === 403);
    assert.ok(auth.accounts(secondUblAdmin).every(user => user.portal === 'ubl'));
  } finally { db.close(); }
});

test('Sessions survive restart while disable, reset and password changes revoke all existing sessions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-auth-')), path = join(dir, 'auth.sqlite');
  let db = new DatabaseSync(path), auth = createAuth(db);
  try {
    const owner = await auth.bootstrap(ownerInput());
    const { user: technician } = await invite(auth, owner, accountInput('persistent-tech'));
    const first = await auth.login({ portal: 'technician', email: technician.email, password });
    const second = await auth.login({ portal: 'technician', email: technician.email, password });
    db.close(); db = new DatabaseSync(path); auth = createAuth(db);
    assert.equal(auth.session(first.token, 'technician').id, technician.id);
    assert.equal(auth.session(second.token, 'technician').id, technician.id);
    assert.throws(() => auth.accountAction(owner, owner.id, { action: 'disable' }), error => error.status === 403);
    assert.throws(() => auth.accountAction(owner, owner.id, { action: 'reset' }), error => error.status === 403);
    auth.accountAction(owner, technician.id, { action: 'disable' });
    assert.equal(auth.session(first.token, 'technician'), null);
    assert.equal(auth.session(second.token, 'technician'), null);
    await assert.rejects(auth.login({ portal: 'technician', email: technician.email, password }), error => error.status === 401);
    assert.equal(auth.accountAction(owner, technician.id, { action: 'enable' }).user.status, 'active');
    const enabled = await auth.login({ portal: 'technician', email: technician.email, password });
    const reset = auth.accountAction(owner, technician.id, { action: 'reset' });
    assert.equal(auth.session(enabled.token, 'technician'), null);
    assert.equal(auth.invitation({ token: reset.invitationToken }).purpose, 'reset');
    await assert.rejects(auth.login({ portal: 'technician', email: technician.email, password }), error => error.status === 401);
    const resetUser = await auth.activate({ token: reset.invitationToken, password: replacement });
    await assert.rejects(auth.activate({ token: reset.invitationToken, password }), rejected);
    const afterReset = await auth.login({ portal: 'technician', email: technician.email, password: replacement });
    await assert.rejects(auth.changePassword(resetUser, { currentPassword: password, newPassword: 'Third test password 2026' }), error => error.status === 401);
    assert.ok(auth.session(afterReset.token, 'technician'), 'An incorrect current password must not revoke the valid session');
    await auth.changePassword(resetUser, { currentPassword: replacement, newPassword: 'Third test password 2026' });
    assert.equal(auth.session(afterReset.token, 'technician'), null);
    await assert.rejects(auth.login({ portal: 'technician', email: technician.email, password: replacement }), error => error.status === 401);
    assert.ok((await auth.login({ portal: 'technician', email: technician.email, password: 'Third test password 2026' })).token);
    assertPrivateStorage(db, [password, replacement, 'Third test password 2026', reset.invitationToken, first.token, second.token]);
    assert.throws(() => db.exec('UPDATE auth_audit SET payload=payload'), /immutable/i);
    assert.throws(() => db.exec('DELETE FROM auth_audit'), /immutable/i);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('Login attempts are rate limited before password work and the limit expires without resetting account access', async () => {
  const db = dbFor(), auth = createAuth(db);
  try {
    const owner = await auth.bootstrap(ownerInput());
    for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(auth.login({ portal: 'powervision', email: owner.email, password: 'Incorrect test password' }, { ip: '192.0.2.10' }), error => error.status === 401);
    await assert.rejects(auth.login({ portal: 'powervision', email: owner.email, password }, { ip: '192.0.2.10' }), error => error.status === 429);
    assert.equal(db.prepare('SELECT attempts FROM auth_login_limits').get().attempts, 5);
    assert.ok((await auth.login({ portal: 'powervision', email: owner.email, password }, { ip: '192.0.2.11' })).token);
    db.prepare('UPDATE auth_login_limits SET window_started_at=?').run(Date.now() - 16 * 60 * 1000);
    assert.ok((await auth.login({ portal: 'powervision', email: owner.email, password }, { ip: '192.0.2.10' })).token);
    assert.equal(auth.accounts(owner).find(user => user.id === owner.id).status, 'active');
  } finally { db.close(); }
});

test('Registered company administrators assign only active company technicians to untouched visits and technicians see only assigned work', async () => {
  const store = createStore(':memory:'), auth = createAuth(store.db);
  try {
    const owner = await auth.bootstrap(ownerInput());
    const { user: technician } = await invite(auth, owner, accountInput('assigned-tech'));
    const { user: otherTechnician } = await invite(auth, owner, accountInput('other-tech'));
    const pending = auth.createAccount(owner, accountInput('pending-tech'));
    const { user: companyReader } = await invite(auth, owner, accountInput('assignment-reader', { portal: 'powervision', role: 'ho' }));
    const { user: ublAdmin } = await invite(auth, owner, accountInput('assignment-ubl', { portal: 'ubl', role: 'client_ho', admin: true }));
    const visits = store.visible(owner);
    assert.ok(visits.length > 2 && visits.every(visit => visit.client === 'UBL'));
    assert.deepEqual(store.visible(technician), []);
    for (const actor of [companyReader, ublAdmin, technician]) assert.throws(() => store.assignTechnician(actor, visits[0].id, { technicianId: technician.id }), error => error.status === 403);
    assert.throws(() => store.assignTechnician(owner, visits[0].id, { technicianId: pending.user.id }), error => error.status === 422);
    assert.throws(() => store.assignTechnician(owner, visits[0].id, { technicianId: ublAdmin.id }), error => error.status === 422);
    const assigned = store.assignTechnician(owner, visits[0].id, { technicianId: technician.id });
    assert.equal(assigned.technicianId, technician.id);
    assert.equal(assigned.assignedBy, owner.id);
    assert.ok(assigned.assignedAt);
    assert.deepEqual(store.visible(technician).map(visit => visit.id), [assigned.id]);
    assert.deepEqual(store.visible(otherTechnician), []);
    assert.throws(() => store.get(otherTechnician, assigned.id), error => error.status === 403);
    store.start(technician, assigned.id);
    assert.throws(() => store.assignTechnician(owner, assigned.id, { technicianId: otherTechnician.id }), error => error.status === 409);
    store.submit(technician, assigned.id, completeFsr());
    const officeReport = store.report(ublAdmin, assigned.id);
    assert.deepEqual(store.report(owner, assigned.id), officeReport);
    assert.equal(officeReport.technician.id, technician.id);
    assert.equal(officeReport.technician.name, technician.name);
    assert.equal(officeReport.visit.fsr.technicianEmployeeId, technician.employeeId);
    assert.equal(officeReport.visit.fsr.fsrPhoto, image);

    const draftVisit = store.assignTechnician(owner, visits[1].id, { technicianId: technician.id });
    store.db.prepare('INSERT INTO technician_drafts(visit_id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(draftVisit.id, technician.id, '{}', 1, new Date().toISOString());
    assert.throws(() => store.assignTechnician(owner, draftVisit.id, { technicianId: otherTechnician.id }), error => error.status === 409, 'Imported drafts must prevent silent reassignment even without a start timestamp');
    auth.accountAction(owner, otherTechnician.id, { action: 'disable' });
    assert.throws(() => store.assignTechnician(owner, visits[2].id, { technicianId: otherTechnician.id }), error => error.status === 422);

    const master = store.assets(owner).find(asset => asset.id === visits[2].assetId);
    const foreignAsset = { ...master, id: 'TEST-AUTH-FOREIGN-ASSET', vendor: 'Other company' };
    const foreignVisit = { ...visits[2], id: 'TEST-AUTH-FOREIGN-VISIT', assetId: foreignAsset.id, technicianId: technician.id };
    store.db.prepare('INSERT INTO assets(id,payload) VALUES(?,?)').run(foreignAsset.id, JSON.stringify(foreignAsset));
    store.db.prepare('INSERT INTO visits(id,asset_id,month,status,payload) VALUES(?,?,?,?,?)').run(foreignVisit.id, foreignAsset.id, foreignVisit.month, foreignVisit.status, JSON.stringify(foreignVisit));
    assert.equal(store.visible(owner).some(visit => visit.id === foreignVisit.id), false, 'A company label on the visit cannot override another company owning the asset');
    assert.equal(store.visible(technician).some(visit => visit.id === foreignVisit.id), false, 'A mistaken assignment cannot expose another company\'s asset to a registered technician');
    assert.throws(() => store.get(technician, foreignVisit.id), error => error.status === 403);
    assert.throws(() => store.get(owner, foreignVisit.id), error => error.status === 403);
    assert.throws(() => store.assignTechnician(owner, foreignVisit.id, { technicianId: technician.id }), error => error.status === 403);
    assert.equal(store.assets(owner).some(asset => asset.id === foreignAsset.id), false);
    assert.throws(() => store.inventory(ublAdmin), error => error.status === 403);
  } finally { store.close(); }
});

async function httpFixture() {
  const app = createApp({ dbPath: ':memory:' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, cookie, input, headers = {}) => fetch(origin + path, {
    method: input === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { ...(cookie ? { cookie } : {}), ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: input === undefined ? undefined : JSON.stringify(input)
  });
  const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];
  const login = async user => {
    const response = await request('/api/auth/login', null, { portal: user.portal, email: user.email, password });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.user.id, user.id);
    assert.equal(Object.hasOwn(result, 'token'), false, 'The browser session is delivered only through the HttpOnly cookie');
    return cookieFrom(response);
  };
  const bootstrap = async () => {
    const response = await request('/api/auth/bootstrap', null, ownerInput());
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.redirectTo, '/powervision/app');
    return { user: result.user, cookie: cookieFrom(response), header: response.headers.get('set-cookie') };
  };
  const close = () => new Promise(resolve => app.server.close(resolve));
  return { ...app, origin, request, cookieFrom, login, bootstrap, close };
}

test('Normal server has no demo login bypass and guards each private page and API before and after owner registration', async () => {
  const fixture = await httpFixture();
  const { request, bootstrap, close, origin } = fixture;
  try {
    assert.equal((await (await request('/api/health')).json()).authentication, 'accounts');
    assert.equal((await (await request('/api/auth/status')).json()).initialized, false);
    for (const path of ['/api/demo-users', '/api/visits']) assert.equal((await request(path)).status, 404);
    assert.equal((await request('/api/session', null, { userId: 'ho-demo' })).status, 404);
    assert.equal((await request('/api/technician/demo-users')).status, 404);
    assert.equal((await request('/api/technician/session', null, { userId: 'tech-demo' })).status, 404);
    assert.equal((await request('/api/auth/register', null, ownerInput())).status, 404);
    for (const portal of ['powervision', 'ubl', 'technician']) {
      assert.equal((await request(`/api/${portal}/me`)).status, 401);
      const page = await request(portal === 'technician' ? '/technician/' : `/${portal}/app`);
      assert.equal(page.status, 303);
      assert.equal(page.headers.get('location'), portal === 'technician' ? '/technician/login' : `/${portal}`);
    }
    assert.equal((await request('/api/auth/bootstrap', null, ownerInput(), { Origin: 'https://untrusted.example' })).status, 403);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      // Fetch controls its Host header, so use a raw HTTP request for this check.
      const req = rawHttpRequest(new URL('/api/auth/bootstrap', origin), { method: 'POST', headers: { Host: 'untrusted.example', 'Content-Type': 'application/json' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject); req.end(JSON.stringify(ownerInput()));
    });
    assert.equal(foreignHostStatus, 403);
    assert.equal((await request('/api/auth/bootstrap', null, ownerInput({ password: 'short' }))).status, 422);
    const owner = await bootstrap();
    assert.match(owner.header, /^amc_powervision_session=[A-Za-z0-9_-]{43};/);
    assert.match(owner.header, /HttpOnly/);
    assert.match(owner.header, /SameSite=Strict/);
    assert.match(owner.header, /Path=\//);
    assert.match(owner.header, /Max-Age=28800/);
    assert.equal((await (await request('/api/auth/status')).json()).initialized, true);
    assert.equal((await request('/api/auth/bootstrap', null, ownerInput({ email: 'other-owner@example.test' }))).status, 409);
    assert.equal((await (await request('/api/powervision/me', owner.cookie)).json()).id, owner.user.id);
    for (const portal of ['ubl', 'technician']) {
      assert.equal((await request(`/api/${portal}/me`, owner.cookie)).status, 403);
      const page = await request(portal === 'technician' ? '/technician/' : `/${portal}/app`, owner.cookie);
      assert.equal(page.status, 403);
      assert.doesNotMatch(await page.text(), /id="app"|id="tech-app"/, 'A wrong-portal cookie must not receive the private application shell');
    }
    assert.equal((await request('/api/visits', owner.cookie)).status, 404);
    assert.equal((await request('/api/session', owner.cookie, { userId: 'ho-demo' })).status, 404);
    assert.equal((await request('/api/auth/login', null, { portal: 'powervision', userId: 'ho-demo' })).status, 401);
  } finally { await close(); }
});

test('Registered portal APIs preserve separate cookies, scoped team administration and assigned technician reports', async () => {
  const fixture = await httpFixture();
  const { request, bootstrap, login, cookieFrom, close, store } = fixture;
  try {
    const owner = await bootstrap();
    const createAccount = async (cookie, portal, input) => {
      const response = await request(`/api/${portal}/accounts`, cookie, input);
      assert.equal(response.status, 201);
      const invitation = await response.json();
      const details = await request('/api/auth/invitation', null, { token: invitation.invitationToken });
      assert.equal(details.status, 200);
      assert.equal((await details.json()).email, input.email);
      const activation = await request('/api/auth/activate', null, { token: invitation.invitationToken, password });
      assert.equal(activation.status, 200);
      assert.equal(activation.headers.get('set-cookie'), null, 'Activation must require a separate sign-in');
      const activated = await activation.json();
      assert.equal((await request('/api/auth/activate', null, { token: invitation.invitationToken, password })).status, 400);
      return activated.user;
    };
    const technician = await createAccount(owner.cookie, 'powervision', accountInput('http-tech'));
    const secondTechnician = await createAccount(owner.cookie, 'powervision', accountInput('http-tech-two'));
    const ublAdmin = await createAccount(owner.cookie, 'powervision', accountInput('http-ubl-admin', { portal: 'ubl', role: 'client_ho', admin: true }));
    const clientCookie = await login(ublAdmin), technicianCookie = await login(technician), secondTechCookie = await login(secondTechnician);
    const branch = await createAccount(clientCookie, 'ubl', accountInput('http-branch', { portal: 'ubl', role: 'branch', branchCode: '0001' }));
    const reader = await createAccount(clientCookie, 'ubl', accountInput('http-reader', { portal: 'ubl', role: 'client_ho' }));
    const readerCookie = await login(reader), branchCookie = await login(branch);
    const allCookies = [owner.cookie, clientCookie, technicianCookie].join('; ');
    assert.equal((await request('/api/technician/demo-users', technicianCookie)).status, 404);
    assert.equal((await request('/api/technician/session', technicianCookie, { userId: 'tech-demo' })).status, 404);
    for (const user of [owner.user, ublAdmin, technician]) {
      const me = await request(`/api/${user.portal}/me`, allCookies);
      assert.equal(me.status, 200);
      assert.equal((await me.json()).id, user.id, 'Each API namespace must select its matching portal session');
      const page = await request(user.portal === 'technician' ? '/technician/' : `/${user.portal}/app`, allCookies);
      assert.equal(page.status, 200);
      assert.equal(page.headers.get('cache-control'), 'no-store');
    }
    assert.equal((await request('/api/powervision/me', clientCookie)).status, 403);
    assert.equal((await request('/api/ubl/me', technicianCookie)).status, 403);
    const ublTeam = await (await request('/api/ubl/accounts', clientCookie)).json();
    assert.ok(ublTeam.accounts.every(account => account.portal === 'ubl' && account.client === 'UBL'));
    const companyTeam = await (await request('/api/powervision/accounts', owner.cookie)).json();
    assert.ok(companyTeam.accounts.every(account => ['powervision', 'technician'].includes(account.portal)));
    assert.equal(companyTeam.canInviteUblAdmin, false);
    assert.equal((await request('/api/ubl/accounts', readerCookie)).status, 403);
    assert.equal((await request('/api/technician/accounts', technicianCookie)).status, 403);
    assert.equal((await request('/api/ubl/accounts', clientCookie, accountInput('illegal-http-tech'))).status, 403);
    assert.equal((await request('/api/powervision/accounts', owner.cookie, accountInput('illegal-second-http-ubl', { portal: 'ubl', role: 'client_ho', admin: true }))).status, 403);
    assert.equal((await request(`/api/ubl/accounts/${technician.id}/action`, clientCookie, { action: 'disable' })).status, 403);
    assert.equal((await request(`/api/ubl/accounts/${reader.id}/action`, readerCookie, { action: 'reset' })).status, 403);
    for (const cookie of [clientCookie, readerCookie, branchCookie]) assert.equal((await request('/api/ubl/inventory', cookie)).status, 403);
    const technicians = await (await request('/api/powervision/technicians', owner.cookie)).json();
    assert.deepEqual(new Set(technicians.technicians.map(user => user.id)), new Set([technician.id, secondTechnician.id]));
    assert.deepEqual(await (await request('/api/technician/visits', technicianCookie)).json(), []);
    const visits = await (await request('/api/powervision/visits', owner.cookie)).json();
    assert.ok(visits.every(visit => visit.client === 'UBL'));
    const visit = visits.find(row => row.branchCode === '0001');
    const assign = await request(`/api/powervision/visits/${visit.id}/assign`, owner.cookie, { technicianId: technician.id });
    assert.equal(assign.status, 200);
    assert.equal((await assign.json()).technicianId, technician.id);
    assert.equal((await request(`/api/ubl/visits/${visit.id}/assign`, clientCookie, { technicianId: secondTechnician.id })).status, 403);
    assert.deepEqual((await (await request('/api/technician/visits', technicianCookie)).json()).map(row => row.id), [visit.id]);
    assert.equal((await request(`/api/technician/visits/${visit.id}`, secondTechCookie)).status, 403);
    assert.equal((await request(`/api/technician/visits/${visit.id}/start`, technicianCookie, {})).status, 200);
    assert.equal((await request(`/api/powervision/visits/${visit.id}/assign`, owner.cookie, { technicianId: secondTechnician.id })).status, 409);
    assert.equal((await request(`/api/technician/visits/${visit.id}/submit`, technicianCookie, { ...completeFsr(), paperFsrNumber: 'TEST-AUTH-PAPER-FSR' })).status, 200);
    const companyReport = await (await request(`/api/powervision/visits/${visit.id}/report`, owner.cookie)).json();
    assert.deepEqual(await (await request(`/api/ubl/visits/${visit.id}/report`, clientCookie)).json(), companyReport);
    assert.equal(companyReport.visit.fsr.technicianId, technician.id);
    assert.equal(companyReport.visit.fsr.fsrPhoto, image);
    assert.equal(companyReport.visit.fsr.paperFsrNumber, 'TEST-AUTH-PAPER-FSR');
    assert.equal((await request(`/api/ubl/visits/${visit.id}/review`, branchCookie, { decision: 'acknowledged' })).status, 200);
    assert.equal((await (await request(`/api/technician/visits/${visit.id}/report`, technicianCookie)).json()).visit.status, 'acknowledged');
    assert.equal((await request('/api/powervision/amc-report?client=HBL', owner.cookie)).status, 403);
    assert.equal((await request('/api/ubl/amc-report?client=HBL', clientCookie)).status, 403);
    const disabled = await request(`/api/powervision/accounts/${secondTechnician.id}/action`, owner.cookie, { action: 'disable' });
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json()).user.status, 'disabled');
    assert.equal((await request('/api/technician/me', secondTechCookie)).status, 401);
    assert.equal((await request(`/api/powervision/accounts/${secondTechnician.id}/action`, owner.cookie, { action: 'enable' })).status, 200);
    assert.equal((await request('/api/technician/me', secondTechCookie)).status, 401, 'Enabling an account must not resurrect its old sessions');
    const secondTechNewCookie = await login(secondTechnician);
    const reset = await request(`/api/powervision/accounts/${secondTechnician.id}/action`, owner.cookie, { action: 'reset' });
    assert.equal(reset.status, 200);
    const resetData = await reset.json();
    assert.equal((await request('/api/technician/me', secondTechNewCookie)).status, 401);
    const resetDetails = await request('/api/auth/invitation', null, { token: resetData.invitationToken });
    assert.equal((await resetDetails.json()).purpose, 'reset');
    assert.equal((await request('/api/auth/activate', null, { token: resetData.invitationToken, password: replacement })).status, 200);
    assert.equal((await request('/api/auth/login', null, { portal: 'technician', email: secondTechnician.email, password })).status, 401);
    assert.equal((await request('/api/auth/login', null, { portal: 'technician', email: secondTechnician.email, password: replacement })).status, 200);
    const logout = await request('/api/auth/logout', allCookies, { portal: 'ubl' });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /^amc_ubl_session=;.*Max-Age=0/);
    assert.equal((await request('/api/powervision/me', allCookies)).status, 200);
    assert.equal((await request('/api/technician/me', allCookies)).status, 200);
    assert.equal((await request('/api/ubl/me', clientCookie)).status, 401);
    const changed = await request('/api/auth/password', technicianCookie, { portal: 'technician', currentPassword: password, newPassword: replacement });
    assert.equal(changed.status, 200);
    assert.match(changed.headers.get('set-cookie'), /^amc_technician_session=;.*Max-Age=0/);
    assert.equal((await request('/api/technician/me', technicianCookie)).status, 401);
    assert.equal((await request('/api/powervision/me', owner.cookie)).status, 200);
    const relogin = await request('/api/auth/login', null, { portal: 'technician', email: technician.email, password: replacement });
    assert.equal(relogin.status, 200);
    assert.match(cookieFrom(relogin), /^amc_technician_session=/);
    assertPrivateStorage(store.db, [password, replacement]);
  } finally { await close(); }
});
