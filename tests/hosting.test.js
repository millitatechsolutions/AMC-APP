import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/server.js';
import { readHostingConfig, checkRequestHosting } from '../src/hosting.js';

const setupKey = 'Synthetic-owner-setup-key-for-tests-2026';
const publicOrigin = 'https://powervision.example.test';
const password = 'Synthetic hosted owner password 2026';
const ownerInput = extra => ({ name: 'Synthetic hosted owner', email: 'hosted-owner@example.test', employeeId: 'HOSTED-OWNER', password, setupKey, ...extra });
const hostedEnv = extra => ({ AMC_HOSTED: '1', AMC_TRUST_PROXY: '1', AMC_PUBLIC_ORIGIN: publicOrigin, AMC_SETUP_KEY: setupKey, AMC_DB_PATH: '/var/data/amc.sqlite', ...extra });

async function fixture({ directory = mkdtempSync(join(tmpdir(), 'amc-hosted-')), ...extra } = {}) {
  const dbPath = join(directory, 'amc.sqlite');
  const hosting = readHostingConfig(hostedEnv({ AMC_DB_PATH: dbPath, ...extra }));
  const app = createApp({ hosting });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const port = app.server.address().port;
  const request = (path, { input, method = input === undefined ? 'GET' : 'POST', headers = {} } = {}) => new Promise((resolve, reject) => {
    const encoded = input === undefined ? undefined : JSON.stringify(input);
    const defaults = { Host: new URL(hosting.publicOrigin).host, 'X-Forwarded-Proto': 'https', ...(encoded === undefined ? {} : { Origin: hosting.publicOrigin, 'Content-Type': 'application/json' }) };
    const requestHeaders = Object.fromEntries(Object.entries({ ...defaults, ...headers }).filter(([, value]) => value !== undefined));
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers: requestHeaders }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
      });
      res.on('error', reject);
    });
    req.on('error', reject); req.end(encoded);
  });
  const close = () => new Promise(resolve => app.server.close(resolve));
  return { ...app, directory, dbPath, hosting, request, close };
}

test('Hosted configuration is explicit, uses an exact HTTPS origin and fails before opening an unsafe database', () => {
  assert.deepEqual(readHostingConfig({}), { hosted: false, bindHost: '127.0.0.1', dbPath: undefined });
  assert.throws(() => readHostingConfig({ HOST: '0.0.0.0' }), /loopback/);
  assert.throws(() => readHostingConfig({ AMC_HOSTED: 'true' }), /AMC_HOSTED/);
  const generated = readHostingConfig(hostedEnv({ AMC_PUBLIC_ORIGIN: undefined, RENDER_EXTERNAL_HOSTNAME: 'synthetic-service.onrender.com' }));
  assert.equal(generated.publicOrigin, 'https://synthetic-service.onrender.com');
  assert.equal(generated.bindHost, '0.0.0.0');
  assert.equal(generated.trustProxy, true);
  const nonDefaultPort = readHostingConfig(hostedEnv({ AMC_PUBLIC_ORIGIN: 'https://app.example.test:8443/' }));
  assert.equal(nonDefaultPort.publicHost, 'app.example.test:8443');
  for (const origin of ['http://app.example.test', 'https://user:pass@app.example.test', 'https://app.example.test/path', 'https://app.example.test?key=x', 'https://app.example.test#key', 'https://*.example.test']) {
    assert.throws(() => readHostingConfig(hostedEnv({ AMC_PUBLIC_ORIGIN: origin })), /HTTPS origin/);
  }
  assert.throws(() => readHostingConfig(hostedEnv({ AMC_PUBLIC_ORIGIN: undefined })), /AMC_PUBLIC_ORIGIN/);
  for (const key of [undefined, '', 'short', 'x'.repeat(32) + ' ', 'x'.repeat(513)]) assert.throws(() => readHostingConfig(hostedEnv({ AMC_SETUP_KEY: key })), /AMC_SETUP_KEY/);
  for (const path of [undefined, ':memory:', 'relative/data.sqlite']) assert.throws(() => readHostingConfig(hostedEnv({ AMC_DB_PATH: path })), /AMC_DB_PATH/);
  assert.throws(() => readHostingConfig(hostedEnv({ AMC_TRUST_PROXY: 'yes' })), /AMC_TRUST_PROXY/);
  const directory = mkdtempSync(join(tmpdir(), 'amc-hosted-no-open-'));
  try {
    const dbPath = join(directory, 'must-not-exist.sqlite');
    const hosting = readHostingConfig(hostedEnv({ AMC_DB_PATH: dbPath }));
    assert.throws(() => createApp({ hosting, demoMode: true }), /demo identities/);
    assert.throws(() => createApp({ hosting, dbPath: ':memory:' }), /persistent AMC_DB_PATH/);
    assert.equal(existsSync(dbPath), false, 'Rejected configuration must not create or seed a database');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Local mode ignores spoofed proxy headers and never accepts a public Host', () => {
  const hosting = readHostingConfig({});
  const req = { method: 'POST', url: '/api/auth/bootstrap', socket: {}, headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'untrusted.example' } };
  assert.equal(checkRequestHosting(req, hosting).secure, false);
  assert.throws(() => checkRequestHosting({ ...req, headers: { ...req.headers, origin: 'https://127.0.0.1:3000' } }, hosting), error => error.status === 403);
  assert.throws(() => checkRequestHosting({ ...req, headers: { ...req.headers, host: 'untrusted.example' } }, hosting), error => error.status === 403);
});

test('Hosted HTTP accepts only its configured host, trusted HTTPS and same-origin mutations', async () => {
  const app = await fixture();
  try {
    assert.equal((await app.request('/')).status, 200);
    for (const host of ['untrusted.example', '127.0.0.1', 'powervision.example.test:8443', 'powervision.example.test@untrusted.example']) {
      assert.equal((await app.request('/api/auth/status', { headers: { Host: host, 'X-Forwarded-Host': 'powervision.example.test' } })).status, 403);
    }
    for (const proto of [undefined, 'http', 'https,http', 'https, http', 'HTTPS']) assert.equal((await app.request('/api/auth/status', { headers: { 'X-Forwarded-Proto': proto } })).status, 403);
    for (const origin of [undefined, 'null', 'https://untrusted.example', publicOrigin + '/']) {
      assert.equal((await app.request('/api/auth/bootstrap', { input: ownerInput(), headers: { Origin: origin } })).status, 403);
    }
    assert.equal((await app.request('https://untrusted.example/api/auth/status')).status, 403);
    assert.equal((await app.request('/api/auth/status')).json.initialized, false);
    const oversized = await app.request('/api/auth/bootstrap', { input: ownerInput({ name: 'x'.repeat(65 * 1024) }) });
    assert.equal(oversized.status, 413, 'Hosted bootstrap retains the smaller auth request-body limit');
    assert.equal(app.auth.status().initialized, false);
  } finally { await app.close(); rmSync(app.directory, { recursive: true, force: true }); }
});

test('Internal health checks are read-only and cannot bypass hosted authentication or HTTPS guards', async () => {
  const app = await fixture();
  try {
    for (const host of ['powervision.example.test', '127.0.0.1:10000', 'localhost:10000', '[::1]:10000']) {
      const response = await app.request('/api/health', { headers: { Host: host, 'X-Forwarded-Proto': undefined } });
      assert.equal(response.status, 200);
      assert.deepEqual(response.json, { status: 'ok', mode: 'synthetic-demo', authentication: 'accounts', client: 'UBL' });
      assert.equal(response.text.includes(setupKey), false);
    }
    assert.equal((await app.request('/api/health', { headers: { Host: 'untrusted.example', 'X-Forwarded-Proto': undefined } })).status, 403);
    for (const path of ['/', '/setup', '/api/auth/status', '/api/powervision/me', '/api/health/']) {
      assert.equal((await app.request(path, { headers: { 'X-Forwarded-Proto': undefined } })).status, 403);
      assert.equal((await app.request(path, { headers: { Host: 'localhost:10000' } })).status, 403);
    }
    assert.equal((await app.request('/api/health', { input: {}, headers: { 'X-Forwarded-Proto': undefined } })).status, 403);
    assert.equal(app.auth.status().initialized, false);
  } finally { await app.close(); rmSync(app.directory, { recursive: true, force: true }); }
});

test('Forwarded TLS is ignored unless trusted proxy mode is explicitly enabled', async () => {
  const app = await fixture({ AMC_TRUST_PROXY: '0' });
  try {
    assert.equal((await app.request('/')).status, 403);
    assert.equal((await app.request('/api/auth/bootstrap', { input: ownerInput() })).status, 403);
    assert.equal((await app.request('/api/health')).status, 200);
    const directTls = { method: 'POST', url: '/api/auth/bootstrap', socket: { encrypted: true }, headers: { host: 'powervision.example.test', origin: publicOrigin } };
    assert.equal(checkRequestHosting(directTls, app.hosting).secure, true);
  } finally { await app.close(); rmSync(app.directory, { recursive: true, force: true }); }
});

test('Public owner setup requires the private key and returns only secure portal-bound sessions', async () => {
  const app = await fixture();
  try {
    const status = await app.request('/api/auth/status');
    assert.deepEqual(status.json, { initialized: false, registration: 'invite-only', setupKeyRequired: true });
    assert.match(status.headers['strict-transport-security'], /max-age=31536000/);
    for (const key of [undefined, '', 'incorrect', 'x'.repeat(setupKey.length)]) {
      const response = await app.request('/api/auth/bootstrap', { input: ownerInput({ setupKey: key }) });
      assert.equal(response.status, 403);
      assert.deepEqual(response.json, { error: 'Owner setup key is incorrect' });
      assert.equal(app.auth.status().initialized, false);
      assert.equal(response.headers['set-cookie'], undefined);
    }
    assert.equal((await app.request('/setup')).text.includes(setupKey), false);
    const owner = await app.request('/api/auth/bootstrap', { input: ownerInput() });
    assert.equal(owner.status, 201);
    assert.equal(owner.json.redirectTo, '/powervision/app');
    assert.equal(owner.text.includes(setupKey), false);
    assert.match(owner.headers['set-cookie'][0], /; Secure/);
    assert.match(owner.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\//);
    assert.equal((await app.request('/api/auth/status')).json.setupKeyRequired, false);
    assert.equal((await app.request('/api/auth/bootstrap', { input: ownerInput({ email: 'takeover@example.test' }) })).status, 409);
    const headers = { Cookie: owner.cookie };
    assert.equal((await app.request('/api/powervision/me', { headers })).json.id, owner.json.user.id);
    assert.equal((await app.request('/api/ubl/me', { headers })).status, 403);
    assert.equal((await app.request('/api/technician/me', { headers })).status, 403);
    for (const path of ['/api/session', '/api/demo-users', '/api/technician/demo-users']) assert.equal((await app.request(path, { headers })).status, 404);
    const logout = await app.request('/api/auth/logout', { input: { portal: 'powervision' }, headers });
    assert.equal(logout.status, 200);
    assert.match(logout.headers['set-cookie'][0], /Max-Age=0; Secure/);
    assert.equal((await app.request('/api/powervision/me', { headers })).status, 401);
    const authTables = app.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'auth_%'").all();
    const persisted = JSON.stringify(authTables.map(({ name }) => app.store.db.prepare(`SELECT * FROM ${name}`).all()));
    assert.equal(persisted.includes(setupKey), false, 'Owner setup key must not be stored in account, audit, invitation or session records');
    assert.equal(persisted.includes(password), false, 'Account passwords must remain hashed');
  } finally { await app.close(); rmSync(app.directory, { recursive: true, force: true }); }
});

test('Hosted restart keeps owner, sessions and stock on the configured database without reseeding', async () => {
  let app = await fixture();
  const directory = app.directory;
  try {
    const owner = await app.request('/api/auth/bootstrap', { input: ownerInput() });
    assert.equal(owner.status, 201);
    const headers = { Cookie: owner.cookie };
    const item = await app.request('/api/powervision/inventory/items', { headers, input: { sku: 'HOSTED-TEST', name: 'Synthetic persistent material', category: 'Test', unit: 'litre', openingQuantity: 0.125, reorderLevel: 1 } });
    assert.equal(item.status, 201);
    const receipt = await app.request('/api/powervision/inventory/receipts', { headers, input: { itemId: item.json.id, quantity: 0.333, reference: 'HOSTED-TEST-RECEIPT' } });
    assert.equal(receipt.status, 201);
    assert.equal(receipt.json.item.quantity, 0.458);
    const before = await app.request('/api/powervision/inventory', { headers });
    await app.close();
    app = await fixture({ directory });
    assert.equal((await app.request('/api/auth/status')).json.initialized, true);
    assert.equal((await app.request('/api/auth/status')).json.setupKeyRequired, false);
    assert.equal((await app.request('/api/powervision/me', { headers })).json.id, owner.json.user.id);
    assert.deepEqual((await app.request('/api/powervision/inventory', { headers })).json, before.json);
    assert.equal((await app.request('/api/auth/bootstrap', { input: ownerInput({ email: 'second@example.test' }) })).status, 409);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
