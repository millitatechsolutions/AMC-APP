import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, users } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fields, PAPER_FSR_TEMPLATE, validateFields } from '../src/fields.js';
import { legacyHbl as hbl, legacyHblBranch as hblBranch, legacyHblTechnician as hblTechnician, insertLegacyHblVisits } from './legacy-fixtures.js';

const company = users.find(user => user.id === 'ho-demo');
const management = users.find(user => user.id === 'vendor-demo');
const ubl = users.find(user => user.id === 'ubl-ho-demo');
const technician = users.find(user => user.id === 'tech-demo');
const branch = users.find(user => user.id === 'branch-demo');
const foreignVendor = { id: 'TEST-FOREIGN-MANAGER', name: 'Other vendor reviewer', role: 'vendor', vendor: 'Other Test Vendor' };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const extras = fields.filter(field => field.template === PAPER_FSR_TEMPLATE);

function completeFsr(changes = {}) {
  return { ...Object.fromEntries(fields.filter(field => field.type !== 'auto' && !field.optional).map(field => [
    field.key, Array.isArray(field.type) ? field.type[0] : field.type === 'number' ? (field.key === 'currentHours' ? 1200 : 10)
      : field.type === 'attachment' ? image : 'Recorded at the synthetic test site'
  ])), ...changes };
}

function paperValues() {
  return { ...Object.fromEntries(extras.map((field, index) => [field.key,
    Array.isArray(field.type) ? field.type[index % field.type.length] : field.type === 'number' ? (/PowerFactor$|^powerFactor$/.test(field.key) ? 0.85 : index / 10)
      : field.type === 'date' ? '2026-10-20' : field.type === 'time' ? '09:15'
        : field.type === 'attachment' ? image : `${field.label}: synthetic paper transcription`
  ])), paperFsrNumber: 'TEST-PVS-V02-002', paperVisitProtocol: 'AMC', paperVisitDate: '2026-10-20',
    startCount: 0, powerFactor: 0, running2PowerFactor: 0.85, running3PowerFactor: 1,
    acVoltage1: 230, acVoltage2: 231, acVoltage3: 232, dcVoltage: 24,
    pvsTimeOut1: '08:15', siteTimeIn1: '09:00', siteTimeOut1: '10:00', pvsTimeIn1: '11:00',
    paperPart1Description: 'Synthetic gasket entered on the paper FSR', paperPart1Quantity: 2,
    electricalBatteryTerminals: 'NOT OK', mechanicalHousekeeping: 'OK', safetyLowFuel: 'N/A',
    leakFuelPump: 'NOT OK', customerComments: 'Please check the fuel pump again', followUp: 'Yes' };
}

function cloneVisit(store, suffix, { client = 'UBL', vendor = 'PowerVision Systems Pvt Ltd' } = {}) {
  const source = store.visible(ubl)[0];
  const asset = { ...store.assets(company).find(item => item.id === source.assetId), id: `TEST-V02-ASSET-${suffix}`,
    engineSerial: `TEST-V02-ENGINE-${suffix}`, client, vendor, branchCode: `TEST-${suffix}` };
  const visit = { ...source, id: `TEST-V02-VISIT-${suffix}`, assetId: asset.id, client, vendor, branchCode: asset.branchCode,
    fsr: null, acknowledgement: null, status: 'scheduled' };
  store.db.prepare('INSERT INTO assets(id,payload) VALUES(?,?)').run(asset.id, JSON.stringify(asset));
  store.db.prepare('INSERT INTO visits(id,asset_id,month,status,payload) VALUES(?,?,?,?,?)').run(visit.id, asset.id, visit.month, visit.status, JSON.stringify(visit));
  return visit;
}

test('Paper FSR V02 data survives draft/submission and both portals receive every recorded field and the original paper image', () => {
  const store = createStore(':memory:');
  try {
    assert.equal(PAPER_FSR_TEMPLATE, 'PVS-FSR-V02');
    for (const key of ['paperFsrNumber', 'paperVisitDate', 'customerName', 'contactNumber', 'pvsTimeOut1', 'siteTimeIn2',
      'acVoltage3', 'running3OilPressure', 'electricalBatteryTerminals', 'safetyEmergencyStop', 'mechanicalEngineVibration',
      'fluidEngineOilCheck', 'leakFuelNozzles', 'fuelFilterSecondaryQuantity', 'paperLastPmHours', 'paperPart10Description',
      'paperActionTaken', 'customerComments', 'customerSignature', 'technicianSignature', 'followUp']) {
      assert.ok(extras.some(field => field.key === key), `${key} from the supplied blank paper FSR must be represented`);
    }
    assert.ok(extras.every(field => field.optional), 'Earlier clients may omit fields added from the paper template');
    const visit = store.visible(branch)[0];
    const input = completeFsr(paperValues());
    assert.deepEqual(validateFields(input), []);
    store.start(technician, visit.id);
    const draft = store.saveDraft(technician, visit.id, { revision: 0, values: input });
    assert.deepEqual(draft.values, input);
    const submitted = store.submit(technician, visit.id, draft.values);
    assert.equal(store.draft(technician, visit.id), null);
    const companyReport = store.report(company, visit.id), clientReport = store.report(ubl, visit.id);
    assert.deepEqual(clientReport, companyReport);
    for (const field of extras) assert.deepEqual(clientReport.visit.fsr[field.key], input[field.key], `${field.label} must retain the exact technician value`);
    for (const key of ['fsrPhoto', 'beforePhoto', 'afterPhoto', 'customerSignature', 'technicianSignature']) {
      assert.equal(clientReport.visit.fsr[key], image);
    }
    assert.equal(clientReport.visit.fsr.powerFactor, 0);
    assert.equal(clientReport.visit.fsr.startCount, 0);
    assert.equal(clientReport.visit.fsr.electricalBatteryTerminals, 'NOT OK');
    assert.equal(clientReport.history[0].fsr.paperFsrNumber, input.paperFsrNumber);
    assert.deepEqual(clientReport.history[0].fsr, submitted.fsr);
    assert.deepEqual(submitted.fsr.inventoryUsage, [], 'Transcribing a paper spare-part row does not issue tracked inventory');

    const legacyVisit = store.visible(ubl).find(row => row.id !== visit.id);
    store.submit(technician, legacyVisit.id, completeFsr());
    const legacy = store.report(ubl, legacyVisit.id);
    for (const field of extras) assert.equal(legacy.visit.fsr[field.key], '', 'Omitted paper fields must remain unrecorded');
    assert.equal(legacy.visit.fsr.electricalBatteryTerminals, '', 'An omitted checklist item must never become an assumed OK');
  } finally {
    store.close();
  }
});

test('Optional paper fields validate actual dates, times, checklist choices and power-factor limits before changing a draft or FSR', () => {
  const store = createStore(':memory:');
  try {
    const visit = store.visible(branch)[0];
    store.start(technician, visit.id);
    const draft = store.saveDraft(technician, visit.id, { revision: 0, values: { paperFsrNumber: 'TEST-DRAFT', paperVisitDate: '2024-02-29', pvsTimeOut1: '23:59', powerFactor: 0 } });
    const invalid = [
      { paperVisitDate: '2026-02-30' }, { paperLastPmDate: '2025-02-29' }, { paperVisitDate: '22/10/2026' },
      { pvsTimeOut1: '24:00' }, { siteTimeIn1: '12:60' }, { pvsTimeIn2: '9:05' },
      { electricalBatteryTerminals: 'Working' }, { safetyLowFuel: 'Unknown' },
      { powerFactor: 1.01 }, { running2PowerFactor: -0.01 }, { running3PowerFactor: 1.1 },
      { totalKilometres1: -1 }, { paperPart1Quantity: -1 }, { powerFactor: '   ' },
      { customerName: { unexpected: 'nested value' } }, { customerComments: ['not a scalar'] },
      { customerSignature: 'data:image/png;base64,SGVsbG8=' },
      { fsrPhoto: 0 }, { beforePhoto: 0 }, { afterPhoto: 0 }, { customerSignature: 0 }, { technicianSignature: 0 }
    ];
    for (const values of invalid) {
      assert.throws(() => store.saveDraft(technician, visit.id, { revision: draft.revision, values }), error => error.status === 422, JSON.stringify(values));
      assert.throws(() => store.submit(technician, visit.id, completeFsr(values)), error => error.status === 422, JSON.stringify(values));
      assert.deepEqual(store.draft(technician, visit.id), draft, 'Invalid values must not replace the saved draft');
      assert.equal(store.get(company, visit.id).status, 'scheduled');
      assert.equal(store.get(company, visit.id).fsr, null);
      assert.deepEqual(store.history(company, visit.id), []);
    }
    assert.throws(() => store.submit(technician, visit.id, completeFsr({ fsrPhoto: '' })), error => error.status === 422, 'A completed paper FSR image is still required');
    assert.deepEqual(validateFields(completeFsr({ paperVisitDate: '2024-02-29', pvsTimeOut1: '00:00', powerFactor: 1, running2PowerFactor: 0 })), []);
  } finally {
    store.close();
  }
});

test('Explicit historical HBL records stay isolated from UBL even when branch codes match', () => {
  const store = createStore(':memory:');
  try {
    assert.ok(store.visible(company).every(visit => visit.client === 'UBL'), 'Fresh installations must contain UBL examples only');
    insertLegacyHblVisits(store, company);
    const hblVisits = store.visible(hbl), ublVisits = store.visible(ubl);
    assert.ok(hblVisits.length > 0 && ublVisits.length > 0);
    assert.ok(hblVisits.every(visit => visit.client === 'HBL'));
    assert.ok(ublVisits.every(visit => visit.client === 'UBL'));
    assert.deepEqual(store.visible(hblTechnician).map(visit => visit.id), hblVisits.map(visit => visit.id));
    assert.ok(store.visible(technician).every(visit => visit.client === 'UBL'));
    const companyIds = new Set(store.visible(company).map(visit => visit.id));
    for (const visit of [...hblVisits, ...ublVisits]) assert.ok(companyIds.has(visit.id));
    const hblVisit = store.visible(hblBranch)[0], ublVisit = store.visible(branch)[0];
    assert.equal(hblVisit.branchCode, ublVisit.branchCode, 'The fixture intentionally uses identical branch codes across clients');
    for (const [denied, visit] of [[ubl, hblVisit], [branch, hblVisit], [technician, hblVisit], [hbl, ublVisit], [hblBranch, ublVisit], [hblTechnician, ublVisit]]) {
      assert.throws(() => store.get(denied, visit.id), error => error.status === 403);
      assert.throws(() => store.report(denied, visit.id), error => error.status === 403);
      assert.throws(() => store.history(denied, visit.id), error => error.status === 403);
    }
    store.submit(hblTechnician, hblVisit.id, completeFsr({ paperFsrNumber: 'TEST-HBL-PAPER', customerName: 'Synthetic HBL client' }));
    assert.deepEqual(store.report(hbl, hblVisit.id), store.report(company, hblVisit.id));
    assert.equal(store.report(hbl, hblVisit.id).client.name, 'HBL');
    assert.equal(store.report(hbl, hblVisit.id).technician.id, hblTechnician.id);
    assert.ok(store.assets(hbl).every(asset => asset.client === 'HBL'));
    assert.ok(store.assets(ubl).every(asset => asset.client === 'UBL'));
    assert.throws(() => store.review(branch, hblVisit.id, 'acknowledged'), error => error.status === 403);
    store.review(hblBranch, hblVisit.id, 'acknowledged', 'HBL branch checked the visit');
    assert.equal(store.get(hbl, hblVisit.id).acknowledgement.client ?? store.get(hbl, hblVisit.id).client, 'HBL');
  } finally {
    store.close();
  }
});

test('Manual paper checks are independent append-only company/client decisions and reset for a corrected FSR without changing stock', () => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-v02-verification-')), path = join(dir, 'data.sqlite');
  let store = createStore(path);
  try {
    const visit = store.visible(branch)[0];
    const item = store.createInventoryItem(company, { sku: 'TEST-V02-STOCK', name: 'Synthetic service material', category: 'Test consumable', unit: 'pcs', openingQuantity: 10, reorderLevel: 0 });
    const input = completeFsr({ paperFsrNumber: 'TEST-PAPER-REVISION-1', electricalBatteryTerminals: 'NOT OK',
      inventoryUsage: [{ itemId: item.id, quantity: 2 }] });
    const first = store.submit(technician, visit.id, input);
    const revision = store.report(company, visit.id).verification.revision;
    const stockAfterSubmit = store.inventory(company);
    const companyEntry = store.verify(company, visit.id, { revision, decision: 'matched', fields: ['paperFsrNumber', 'electricalBatteryTerminals', 'inventoryUsage'] });
    assert.equal(companyEntry.scope, 'company');
    assert.equal(companyEntry.reviewer.id, company.id);
    assert.equal(companyEntry.reviewer.employeeId, company.employeeId);
    assert.equal(companyEntry.revision, revision);
    assert.ok(companyEntry.at && companyEntry.id);
    assert.equal(store.report(ubl, visit.id).verification.client, null, 'A company check does not imply a client check');
    const clientEntry = store.verify(ubl, visit.id, { revision, decision: 'mismatch', fields: ['paperFsrNumber'], reason: 'Paper reference does not match the entered number' });
    assert.equal(clientEntry.scope, 'client');
    assert.equal(clientEntry.client, 'UBL');
    const checked = store.report(company, visit.id);
    assert.equal(checked.verification.company.id, companyEntry.id);
    assert.equal(checked.verification.client.id, clientEntry.id);
    assert.deepEqual(checked, store.report(ubl, visit.id));
    assert.deepEqual(store.inventory(company), stockAfterSubmit, 'Manual paper checking must not consume, return or reserve stock');
    assert.equal(checked.visit.status, 'submitted', 'Manual matching remains distinct from branch acknowledgment');
    assert.deepEqual(checked.history[0].fsr, first.fsr, 'Review flags must not rewrite the original submitted FSR');

    const correctedCheck = store.verify(management, visit.id, { revision, decision: 'mismatch', fields: ['electricalBatteryTerminals'], reason: 'A second company check identified a different paper mark' });
    const historyBeforeCorrection = store.report(company, visit.id).verification.history;
    assert.equal(historyBeforeCorrection.length, 3);
    assert.equal(store.report(company, visit.id).verification.company.id, correctedCheck.id);
    assert.ok(historyBeforeCorrection.some(entry => entry.id === companyEntry.id));
    assert.throws(() => store.db.prepare('UPDATE fsr_verifications SET payload=payload WHERE id=?').run(companyEntry.id), /immutable/i);
    assert.throws(() => store.db.prepare('DELETE FROM fsr_verifications WHERE id=?').run(clientEntry.id), /immutable/i);
    store.review(branch, visit.id, 'unacknowledged', 'Correct the paper transcription');
    const next = store.submit(technician, visit.id, { ...input, paperFsrNumber: 'TEST-PAPER-REVISION-2', inventoryUsage: [{ itemId: item.id, quantity: 3 }] });
    const nextReport = store.report(ubl, visit.id);
    assert.ok(nextReport.verification.revision > revision);
    assert.equal(nextReport.verification.company, null);
    assert.equal(nextReport.verification.client, null);
    assert.deepEqual(nextReport.verification.history, historyBeforeCorrection);
    assert.equal(nextReport.history[0].fsr.paperFsrNumber, 'TEST-PAPER-REVISION-1');
    assert.equal(nextReport.history[1].fsr.paperFsrNumber, 'TEST-PAPER-REVISION-2');
    assert.equal(next.fsr.fsrNumber, first.fsr.fsrNumber);
    assert.equal(store.inventory(company).items.find(row => row.id === item.id).quantity, 7, 'A corrected FSR must book only the net additional material');
    const beforeStale = store.report(company, visit.id);
    assert.throws(() => store.verify(company, visit.id, { revision, decision: 'matched' }), error => error.status === 409);
    assert.deepEqual(store.report(company, visit.id), beforeStale, 'A stale reviewer must not append decisions or audit events');
    store.review(branch, visit.id, 'acknowledged', 'Confirmed correction');
    store.verify(branch, visit.id, { revision: nextReport.verification.revision, decision: 'matched', fields: ['paperFsrNumber'] });
    const beforeRestart = store.report(company, visit.id), inventoryBeforeRestart = store.inventory(company);
    store.close();
    store = createStore(path);
    assert.deepEqual(store.report(company, visit.id), beforeRestart, 'Revision-specific checks and original evidence must survive restart');
    assert.deepEqual(store.inventory(company), inventoryBeforeRestart);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Manual verification rejects wrong roles, foreign ownership, invalid field selections and missing paper evidence without partial writes', () => {
  const store = createStore(':memory:');
  try {
    const visit = store.visible(branch)[0];
    store.submit(technician, visit.id, completeFsr());
    const revision = store.report(company, visit.id).verification.revision;
    const input = { revision, decision: 'matched', fields: ['currentHours'] };
    const before = store.report(company, visit.id);
    for (const user of [technician, hbl, hblBranch, foreignVendor]) assert.throws(() => store.verify(user, visit.id, input), error => error.status === 403);
    for (const invalid of [
      { ...input, decision: 'approved' }, { ...input, decision: 'mismatch', reason: '  ' },
      { ...input, revision: String(revision) }, { ...input, revision: 0 }, { ...input, revision: 1.5 },
      { ...input, fields: ['unknownField'] }, { ...input, fields: ['currentHours', 'currentHours'] },
      { ...input, fields: 'currentHours' }, { ...input, reason: {} }, { ...input, reason: 'x'.repeat(4001) }
    ]) assert.throws(() => store.verify(company, visit.id, invalid), error => error.status === 422);
    assert.deepEqual(store.report(company, visit.id), before);

    const other = cloneVisit(store, 'FOREIGN-VENDOR', { vendor: foreignVendor.vendor });
    store.submit(technician, other.id, completeFsr());
    const otherRevision = store.report(company, other.id).verification.revision;
    assert.throws(() => store.verify(company, other.id, { ...input, revision: otherRevision }), error => error.status === 403, 'PowerVision head office cannot mark another vendor\'s paper FSR as verified');
    assert.throws(() => store.verify(management, other.id, { ...input, revision: otherRevision }), error => error.status === 403);
    assert.throws(() => store.verify(company, visit.id, { ...input, revision: otherRevision }), error => error.status === 409, 'A global revision from another visit must not be accepted');
    const legacy = cloneVisit(store, 'WITHOUT-PAPER');
    const snapshot = { ...before.visit.fsr, fsrNumber: 'TEST-LEGACY-NO-PAPER', fsrPhoto: '' };
    const inserted = store.db.prepare('INSERT INTO fsr_versions(visit_id,payload) VALUES(?,?)').run(legacy.id, JSON.stringify(snapshot));
    const oldVisit = { ...legacy, status: 'submitted', fsr: snapshot };
    store.db.prepare('UPDATE visits SET status=?,payload=? WHERE id=?').run(oldVisit.status, JSON.stringify(oldVisit), oldVisit.id);
    assert.throws(() => store.verify(company, legacy.id, { revision: Number(inserted.lastInsertRowid), decision: 'matched' }), error => error.status === 422 && /paper FSR image/i.test(error.message));
    assert.deepEqual(store.report(company, legacy.id).verification.history, []);
  } finally {
    store.close();
  }
});

test('Technician demo regression exposes paper evidence and independent checks to UBL and PowerVision only', async () => {
  const { server, store } = createApp({ dbPath: ':memory:', demoMode: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, cookie, input) => fetch(origin + path, {
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
    const foreign = cloneVisit(store, 'HTTP-OTHER-CLIENT', { client: 'Other Bank' });
    const technicianCookie = await login(technician, 'technician/'), companyCookie = await login(company);
    const clientCookie = await login(ubl), branchCookie = await login(branch);
    const path = `/api/visits/${visit.id}`;
    assert.equal((await request(path + '/verify', null, {})).status, 401);
    const submit = await request(`/api/technician/visits/${visit.id}/submit`, technicianCookie, completeFsr(paperValues()));
    assert.equal(submit.status, 200);
    const reportResponse = await request(path + '/report', clientCookie);
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json(), revision = report.verification.revision;
    const matched = { revision, decision: 'matched', fields: ['paperFsrNumber', 'acVoltage3', 'leakFuelPump'] };
    assert.equal((await request(`/api/technician/visits/${visit.id}/verify`, technicianCookie, matched)).status, 403);
    assert.equal((await request(`/api/visits/${foreign.id}/verify`, clientCookie, matched)).status, 403);
    assert.equal((await request(`/api/visits/${foreign.id}/report`, clientCookie)).status, 403);
    const companyCheck = await request(path + '/verify', companyCookie, matched);
    assert.equal(companyCheck.status, 201);
    assert.equal((await companyCheck.json()).scope, 'company');
    assert.equal((await request(path + '/verify', clientCookie, { ...matched, decision: 'mismatch', reason: '' })).status, 422);
    const clientCheck = await request(path + '/verify', branchCookie, { ...matched, decision: 'mismatch', reason: 'Please recheck the voltage written on the paper sheet' });
    assert.equal(clientCheck.status, 201);
    const companyReport = await (await request(path + '/report', companyCookie)).json();
    assert.deepEqual(await (await request(path + '/report', clientCookie)).json(), companyReport);
    assert.deepEqual(await (await request(`/api/technician/visits/${visit.id}/report`, technicianCookie)).json(), companyReport);
    assert.equal(companyReport.visit.fsr.fsrPhoto, image);
    assert.equal(companyReport.visit.fsr.paperFsrNumber, 'TEST-PVS-V02-002');
    assert.equal(companyReport.verification.company.decision, 'matched');
    assert.equal(companyReport.verification.client.decision, 'mismatch');
    assert.equal(companyReport.verification.client.reviewer.id, branch.id);
    assert.equal(companyReport.verification.history.length, 2);
    assert.equal(companyReport.visit.status, 'submitted');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
