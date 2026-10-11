import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, users } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fields } from '../src/fields.js';

const companyName = 'PowerVision Systems Pvt Ltd';
const powerVision = users.find(user => user.id === 'ho-demo');
const technician = users.find(user => user.id === 'tech-demo');
const branch = users.find(user => user.id === 'branch-demo');
const ubl = () => users.find(user => user.id === 'ubl-ho-demo');
const management = users.find(user => user.id === 'vendor-demo');
const photograph = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

function completeFsr() {
  return Object.fromEntries(fields.filter(field => field.type !== 'auto').map(field => [
    field.key,
    Array.isArray(field.type) ? field.type[0]
      : field.type === 'number' ? (field.key === 'currentHours' ? 1200 : 10)
        : field.type === 'attachment' ? photograph
          : `${field.label}: recorded at site`
  ]));
}

function insertVisit(store, suffix, changes = {}) {
  const source = store.visible(powerVision)[0];
  const asset = { ...store.assets(powerVision).find(item => item.id === source.assetId), id: `TEST-ASSET-${suffix}`, branchCode: `TEST-${suffix}`, ...changes.asset };
  const visit = { ...source, id: `TEST-VISIT-${suffix}`, assetId: asset.id, branchCode: asset.branchCode, fsr: null, acknowledgement: null, status: 'scheduled', ...changes.visit };
  if (changes.removeClient) {
    delete asset.client;
    delete visit.client;
  }
  store.db.prepare('INSERT INTO assets(id,payload) VALUES(?,?)').run(asset.id, JSON.stringify(asset));
  store.db.prepare('INSERT INTO visits(id,asset_id,month,status,payload) VALUES(?,?,?,?,?)').run(visit.id, asset.id, visit.month, visit.status, JSON.stringify(visit));
  return { asset, visit };
}

test('UBL and PowerVision receive the complete FSR, evidence, identity and immutable revision history', () => {
  const store = createStore(':memory:');
  try {
    assert.ok(ubl(), 'UBL head office demo role must be available');
    const visit = store.visible(branch)[0];
    const start = store.start(technician, visit.id);
    const firstInput = { ...completeFsr(), issue: 'Coolant leak at hose connection', radiatorCondition: 'Bad', radiatorBad: 'Hose connection leaks under pressure', complaintLogged: 'Yes', complaintNumber: 'TEST-COMPLAINT-01' };
    const first = store.submit(technician, visit.id, firstInput);
    const companyReport = store.report(powerVision, visit.id);
    const clientReport = store.report(ubl(), visit.id);

    assert.deepEqual(clientReport, companyReport, 'Both offices must receive the same report payload');
    assert.equal(companyReport.company.name, companyName);
    assert.equal(companyReport.client.name, 'UBL');
    assert.equal(companyReport.asset.id, visit.assetId);
    assert.equal(companyReport.technician.name, technician.name);
    assert.equal(companyReport.technician.employeeId, technician.employeeId);
    assert.equal(companyReport.visit.fsr.visitStartedAt, start.startedAt);
    assert.ok(companyReport.visit.fsr.submittedAt);
    for (const field of fields) {
      assert.ok(Object.hasOwn(companyReport.visit.fsr, field.key), `${field.label} must be in the detailed report`);
      if (field.type !== 'auto') assert.deepEqual(companyReport.visit.fsr[field.key], firstInput[field.key], `${field.label} must preserve the submitted value`);
    }
    for (const key of ['fsrPhoto', 'beforePhoto', 'afterPhoto']) assert.equal(clientReport.visit.fsr[key], photograph);
    assert.equal(companyReport.history.length, 1);
    assert.deepEqual(companyReport.history[0].fsr, first.fsr);

    const rejected = store.review(branch, visit.id, 'unacknowledged', 'Provide the repaired hose details');
    assert.equal(store.report(ubl(), visit.id).visit.acknowledgement.reason, 'Provide the repaired hose details');
    assert.equal(rejected.acknowledgement.employeeId, branch.employeeId);
    const revisedInput = { ...firstInput, issue: 'Coolant leak resolved', correctiveAction: 'Replaced hose clamp and checked under load', currentHours: 1201 };
    const revised = store.submit(technician, visit.id, revisedInput);
    store.review(branch, visit.id, 'acknowledged', 'Verified at branch');
    const finalCompany = store.report(powerVision, visit.id);
    const finalClient = store.report(ubl(), visit.id);

    assert.deepEqual(finalClient, finalCompany);
    assert.equal(finalClient.history.length, 2);
    assert.deepEqual(finalClient.history[0].fsr, first.fsr, 'The first submitted FSR must remain unchanged');
    assert.deepEqual(finalClient.history[1].fsr, revised.fsr);
    assert.ok(finalClient.history[1].revision > finalClient.history[0].revision);
    assert.equal(finalClient.visit.acknowledgement.userId, branch.id);
    assert.equal(finalClient.visit.acknowledgement.employeeId, branch.employeeId);
    assert.equal(finalClient.visit.acknowledgement.decision, 'acknowledged');
    assert.equal(finalClient.visit.acknowledgement.fsrId, revised.fsr.fsrNumber);
    assert.ok(finalClient.visit.acknowledgement.at);
  } finally {
    store.close();
  }
});

test('UBL is isolated by client while legacy demo records remain visible to the correct offices', () => {
  const store = createStore(':memory:');
  try {
    const original = store.visible(powerVision)[0];
    const foreign = insertVisit(store, 'OTHER-CLIENT', {
      asset: { client: 'Other Bank', engineSerial: 'REAL-ENGINE-OTHER' },
      visit: { client: 'Other Bank' }
    });
    const unknown = insertVisit(store, 'UNKNOWN-CLIENT', {
      asset: { engineSerial: 'REAL-ENGINE-UNKNOWN' },
      removeClient: true
    });
    const legacy = insertVisit(store, 'LEGACY-DEMO', {
      asset: { engineSerial: 'DEMO-ENGINE-99', vendor: 'Demo AMC Services' },
      visit: { vendor: 'Demo AMC Services' },
      removeClient: true
    });
    const contradictory = insertVisit(store, 'CONTRADICTORY-CLIENT', {
      asset: { client: 'Other Bank', engineSerial: 'REAL-ENGINE-CONTRADICTORY', branchCode: branch.branchCode },
      visit: { client: 'UBL' }
    });
    const opposite = insertVisit(store, 'OPPOSITE-CLIENT', {
      asset: { client: 'UBL', engineSerial: 'REAL-ENGINE-OPPOSITE' },
      visit: { client: 'Other Bank' }
    });
    const syntheticOther = insertVisit(store, 'SYNTHETIC-OTHER-CLIENT', {
      asset: { client: 'Other Bank', engineSerial: 'DEMO-ENGINE-98', latitude: undefined, longitude: undefined },
      visit: { client: 'Other Bank' }
    });
    const clientVisitIds = new Set(store.visible(ubl()).map(visit => visit.id));
    assert.ok(clientVisitIds.has(original.id));
    assert.ok(clientVisitIds.has(legacy.visit.id), 'Only recognizable synthetic legacy assets can infer UBL');
    assert.equal(clientVisitIds.has(foreign.visit.id), false);
    assert.equal(clientVisitIds.has(unknown.visit.id), false, 'An unknown real client must not be assumed to be UBL');
    assert.equal(clientVisitIds.has(contradictory.visit.id), false, 'Visit client metadata must not override another client owning the asset');
    assert.equal(clientVisitIds.has(opposite.visit.id), false, 'Asset client metadata must not override a different client on the visit');
    assert.equal(clientVisitIds.has(syntheticOther.visit.id), false, 'Explicit client ownership wins over synthetic engine inference');
    const clientAssetIds = new Set(store.assets(ubl()).map(asset => asset.id));
    assert.equal(clientAssetIds.has(foreign.asset.id), false);
    assert.equal(clientAssetIds.has(unknown.asset.id), false);
    assert.equal(clientAssetIds.has(contradictory.asset.id), false);
    assert.equal(clientAssetIds.has(opposite.asset.id), false);
    for (const restricted of [foreign.visit, unknown.visit, contradictory.visit, opposite.visit, syntheticOther.visit]) {
      assert.throws(() => store.get(ubl(), restricted.id), error => error.status === 403);
      assert.throws(() => store.report(ubl(), restricted.id), error => error.status === 403);
      assert.throws(() => store.history(ubl(), restricted.id), error => error.status === 403);
    }
    const otherReport = store.report(powerVision, syntheticOther.visit.id);
    assert.equal(otherReport.client.name, 'Other Bank');
    assert.equal(otherReport.asset.client, 'Other Bank', 'Generating demo map coordinates must preserve explicit client metadata');
    assert.throws(() => store.get(branch, contradictory.visit.id), error => error.status === 403, 'Matching branch codes must not bypass client ownership');
    assert.equal(store.report(ubl(), legacy.visit.id).client.name, 'UBL');
    assert.ok(store.visible(management).some(visit => visit.id === legacy.visit.id), 'PowerVision management must retain visibility of old synthetic vendor records');
    assert.ok(store.visible(powerVision).some(visit => visit.id === foreign.visit.id));
    assert.throws(() => store.payments(ubl(), original.month), error => error.status === 403);
    assert.throws(() => store.submit(ubl(), original.id, completeFsr()), error => error.status === 403);
    assert.throws(() => store.review(ubl(), original.id, 'acknowledged'), error => error.status === 403);
  } finally {
    store.close();
  }
});

test('Detailed report HTTP endpoints share technician submissions with both offices and enforce client access', async () => {
  const { server, store } = createApp({ dbPath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, cookie, input) => fetch(base + path, {
    method: input === undefined ? 'GET' : 'POST',
    headers: { ...(cookie ? { cookie } : {}), ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: input === undefined ? undefined : JSON.stringify(input)
  });
  const login = async (user, namespace = '') => {
    const response = await request(`/api/${namespace}session`, null, { userId: user.id });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  try {
    const visit = store.visible(branch)[0];
    const foreign = insertVisit(store, 'HTTP-OTHER-CLIENT', {
      asset: { client: 'Other Bank', engineSerial: 'REAL-ENGINE-HTTP' },
      visit: { client: 'Other Bank' }
    });
    const route = `/api/visits/${visit.id}/report`;
    assert.equal((await request(route)).status, 401);
    const technicianCookie = await login(technician, 'technician/');
    const companyCookie = await login(powerVision);
    const clientCookie = await login(ubl());
    assert.equal((await request(`/api/technician/visits/${visit.id}/start`, technicianCookie, {})).status, 200);
    assert.equal((await request(`/api/technician/visits/${visit.id}/submit`, technicianCookie, completeFsr())).status, 200);
    const companyResponse = await request(route, companyCookie);
    const clientResponse = await request(route, clientCookie);
    const technicianResponse = await request(`/api/technician/visits/${visit.id}/report`, technicianCookie);
    assert.equal(companyResponse.status, 200);
    assert.equal(clientResponse.status, 200);
    assert.equal(technicianResponse.status, 200);
    assert.equal(clientResponse.headers.get('cache-control'), 'no-store');
    const companyReport = await companyResponse.json();
    assert.deepEqual(await clientResponse.json(), companyReport);
    assert.deepEqual(await technicianResponse.json(), companyReport);
    assert.equal(companyReport.history.length, 1);
    for (const key of ['fsrPhoto', 'beforePhoto', 'afterPhoto']) assert.equal(companyReport.visit.fsr[key], photograph);
    for (const suffix of ['', '/report', '/history']) {
      assert.equal((await request(`/api/visits/${foreign.visit.id}${suffix}`, clientCookie)).status, 403);
    }
    assert.equal((await request(`/api/payments?month=${visit.month}`, clientCookie)).status, 403);
    assert.equal((await request(`/api/visits/${visit.id}/submit`, clientCookie, completeFsr())).status, 403);
    assert.equal((await request(`/api/visits/${visit.id}/review`, clientCookie, { decision: 'acknowledged' })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
