import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createStore, users } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fields } from '../src/fields.js';
import { REPORT_COLUMNS, buildAmcRows, createAmcWorkbook } from '../src/amc-report.js';

// Independent copy of row 1 in the supplied Report Format AMC.xlsx, including its wording.
const headers = [
  'Branch Code', 'Site Address', 'Region', 'AMC Vendor', 'Customer ID', 'Month', ' Visit Date', 'Last Visit Date',
  'Visit Schedule Date', 'Visit Status', 'Visit Purpose', 'Next Visit Due', 'FSR Number', 'Genset Placement',
  'Genset Supplier', 'GensetModel', 'Genset Rating (kVA)', 'Engine Serial Number', 'Engine Name & Type',
  'Oil Filter Number', 'Fuel Filter Number', 'Water Filter Number', 'Air Filter Number', 'Alternator Model & Condition',
  'AVR Model', 'Control Module Brand', 'Last Service Date (PM)', 'Last Service Running Hour', 'Current Running Hour',
  'Service Required (PM)', 'Installation Year', 'Warranty Status', 'Lube Oil Pressure (Bar / PSI)',
  'Oil pressure Safety (Connected & Working)', 'Lube Oil Level', 'Coolant Temperature (Centigrade)', 'Coolant Level',
  'Coolant Temperature safety (Connected & Working)', 'Radiator Cap', 'Radiator & hose pipe condition', 'If Average',
  'If Bad', 'Fan & Dynamo Belt Condition', 'RPM', 'Frequency', 'Load Check', 'Load', 'Total Load (kW)',
  'Load per Phase 1/2/3 (Amp)', 'Battery Model', 'Battery Voltage', 'Battery Status (If Dry Battery (Mention Color Code)',
  'Trickle Electrical Charger', 'ATS Panel Operational', 'Canopy Condition', 'Issue', 'Compliant Lock',
  'Complain Number (Here4you)', 'Cause', 'Corrective Action', 'Job Summary', 'Parts Replaced Details (if any)',
  'Parts Handed Over to Customer', 'Repair', 'Genset Health Remarks', 'Customer Representative', 'Customer Employee Code',
  'FSR', 'Call Status'
];
const company = users.find(user => user.id === 'ho-demo');
const ubl = users.find(user => user.id === 'ubl-ho-demo');
const hbl = users.find(user => user.id === 'hbl-ho-demo');
const technician = users.find(user => user.id === 'tech-demo');
const hblTechnician = users.find(user => user.id === 'hbl-tech-demo');
const branch = users.find(user => user.id === 'branch-demo');
const management = users.find(user => user.id === 'vendor-demo');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

function completeFsr(changes = {}) {
  return { ...Object.fromEntries(fields.filter(field => field.type !== 'auto' && !field.optional).map(field => [
    field.key, Array.isArray(field.type) ? field.type[0] : field.type === 'number' ? (field.key === 'currentHours' ? 1200 : 10)
      : field.type === 'attachment' ? image : 'Recorded at the synthetic test site'
  ])), ...changes };
}

async function workbookFor(rows, options = {}) {
  const buffer = await createAmcWorkbook(rows, options);
  assert.ok(Buffer.isBuffer(buffer), 'The download must be a real XLSX buffer');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function cell(sheet, row, key) {
  const index = REPORT_COLUMNS.findIndex(column => column.key === key);
  assert.ok(index >= 0, `Missing report column ${key}`);
  return sheet.getCell(row, index + 1);
}

test('AMC workbook follows the supplied 69-column order and preserves submitted readings, zero and literal text', async () => {
  const store = createStore(':memory:');
  try {
    const visit = store.visible(ubl)[0];
    const input = completeFsr({ model: 'TEST-GEN-150', engineSerial: 'TEST-ENGINE-FSR', currentHours: 1750, rating: 150,
      oilPressure: 0, oilPressureUnit: 'PSI', phase1: 0, phase2: 14, phase3: 17, totalLoad: 0,
      batteryVoltage: 0, rpm: 1500, frequency: 50, issue: '=HYPERLINK("https://example.invalid/","test")',
      complaintLogged: 'Yes', complaintNumber: 'TEST-COMPLAINT-321', customerRepresentative: '+TEST-REPRESENTATIVE',
      parts: 'One synthetic relay', jobSummary: 'Checked load and captured paper FSR', callStatus: 'Open', paperVisitDate: '2024-11-17' });
    store.submit(technician, visit.id, input);
    const report = store.report(ubl, visit.id);
    const [row] = buildAmcRows([report]);
    assert.equal(REPORT_COLUMNS.length, 69);
    assert.deepEqual(REPORT_COLUMNS.map(column => column.label), headers);
    assert.equal(new Set(REPORT_COLUMNS.map(column => column.key)).size, 69);
    assert.equal(row.visitId, visit.id);
    assert.equal(row.assetId, visit.assetId);
    assert.equal(row.client, 'UBL');
    assert.equal(row.status, 'submitted');
    assert.equal(row.visitDate, '2024-11-17', 'The AMC visit date comes from the paper visit when it was explicitly transcribed');
    assert.equal(report.visit.fsr.visitDate, new Date().toISOString().slice(0, 10), 'The digital submission date remains a separate immutable server record');
    assert.notEqual(report.visit.fsr.submittedAt.slice(0, 10), input.paperVisitDate);
    assert.equal(row.currentHours, 1750);
    assert.equal(row.engineSerial, input.engineSerial, 'The submitted report snapshot wins over current master-data serials');
    assert.equal(row.totalLoad, 0);
    assert.equal(row.batteryVoltage, 0);
    assert.equal(row.phaseLoad, '0/14/17');
    assert.equal(row.oilPressure, '0 PSI');
    assert.match(row.fsrEvidence, /Image available in portal/i);
    assert.ok(row.fsrEvidence.includes(report.visit.fsr.fsrNumber));
    assert.doesNotMatch(JSON.stringify(row), /data:image|base64,/i, 'Workbook rows contain an evidence reference, never the image payload');

    const workbook = await workbookFor([row], { month: visit.month, client: 'UBL' });
    const sheet = workbook.getWorksheet('AMC Report');
    assert.ok(sheet);
    assert.equal(sheet.columnCount, 69);
    assert.deepEqual(sheet.getRow(1).values.slice(1), headers);
    assert.equal(sheet.actualRowCount, 2);
    for (const key of ['rating', 'currentHours', 'totalLoad', 'batteryVoltage', 'rpm', 'frequency']) {
      assert.equal(cell(sheet, 2, key).value, Number(input[key]), `${key} must retain its numeric Excel type`);
    }
    for (const key of ['model', 'engineSerial', 'complaintNumber', 'jobSummary', 'parts', 'callStatus']) {
      assert.equal(cell(sheet, 2, key).value, input[key]);
    }
    assert.equal(cell(sheet, 2, 'phaseLoad').value, '0/14/17');
    assert.equal(cell(sheet, 2, 'oilPressure').value, '0 PSI');
    for (const key of ['issue', 'customerRepresentative']) {
      const value = cell(sheet, 2, key);
      assert.equal(value.type, ExcelJS.ValueType.String, 'Formula-like technician input must remain literal Excel text');
      assert.equal(value.value, input[key]);
      assert.equal(value.formula, undefined);
    }
    const visitDate = cell(sheet, 2, 'visitDate').value;
    assert.ok(visitDate instanceof Date, 'Actual service dates must become Excel date cells');
    assert.equal(visitDate.toISOString().slice(0, 10), input.paperVisitDate);
    assert.ok(workbook.getWorksheet('Data sources'), 'The exported workbook identifies source data and evidence limitations');
  } finally {
    store.close();
  }
});

test('Scheduled AMC rows leave missing technician measurements blank and legacy FSR snapshots map without invented V02 values', async () => {
  const store = createStore(':memory:');
  try {
    const scheduled = store.visible(ubl)[0];
    const [pending] = buildAmcRows([store.report(ubl, scheduled.id)]);
    for (const key of ['currentHours', 'oilPressure', 'phaseLoad', 'batteryVoltage', 'frequency', 'totalLoad', 'issue', 'fsrEvidence']) {
      assert.equal(pending[key], '', `${key} is not a measured zero before submission`);
    }
    assert.equal(pending.branchCode, scheduled.branchCode);
    const workbook = await workbookFor([pending], { month: scheduled.month, client: 'UBL' });
    for (const key of ['currentHours', 'batteryVoltage', 'frequency', 'totalLoad']) {
      assert.ok([null, ''].includes(cell(workbook.getWorksheet('AMC Report'), 2, key).value));
    }

    const legacy = store.visible(ubl)[1];
    const fsr = store.submit(technician, legacy.id, completeFsr({ currentHours: 1600, phase1: 16, phase2: 14, phase3: 17,
      oilPressure: 5.1, oilPressureUnit: 'Bar', batteryModel: 'TEST-BATTERY', batteryStatus: 'Green',
      correctiveAction: 'Replaced synthetic relay', partsHandedOver: 'Yes' })).fsr;
    const [row] = buildAmcRows([store.report(ubl, legacy.id)]);
    assert.equal(row.phaseLoad, '16/14/17');
    assert.equal(row.oilPressure, '5.1 Bar');
    assert.equal(row.batteryModel, 'TEST-BATTERY');
    assert.equal(row.correctiveAction, fsr.correctiveAction);
    assert.equal(row.partsHandedOver, 'Yes');
    assert.equal(row.warranty, fsr.warranty);
    assert.equal(row.nextServiceDue, fsr.nextServiceDue);
    assert.equal(row.lastServiceHours, fsr.lastServiceHours);
  } finally {
    store.close();
  }
});

test('AMC report APIs enforce client and role filters and export the same authorized rows as the JSON preview', async () => {
  assert.ok(hbl && hblTechnician, 'The HBL demo client and its assigned technician must be available');
  const { server, store } = createApp({ dbPath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, cookie, input) => fetch(origin + path, {
    method: input === undefined ? 'GET' : 'POST',
    headers: { ...(cookie ? { cookie } : {}), ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: input === undefined ? undefined : JSON.stringify(input)
  });
  const login = async user => {
    const response = await request('/api/session', null, { userId: user.id });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  try {
    const visit = store.visible(hbl)[0];
    store.submit(hblTechnician, visit.id, completeFsr({ currentHours: 1654, jobSummary: 'HBL synthetic AMC export check' }));
    const prior = { ...store.visible(hbl)[1], id: 'TEST-AMC-PRIOR-MONTH', month: '2025-01', fsr: null, status: 'scheduled' };
    store.db.prepare('INSERT INTO visits(id,asset_id,month,status,payload) VALUES(?,?,?,?,?)').run(prior.id, prior.assetId, prior.month, prior.status, JSON.stringify(prior));
    const companyCookie = await login(company), clientCookie = await login(hbl), ublCookie = await login(ubl);
    const managementCookie = await login(management), technicianCookie = await login(technician), branchCookie = await login(branch);
    assert.equal((await request('/api/amc-report')).status, 401);
    assert.equal((await request('/api/amc-report.xlsx')).status, 401);
    for (const cookie of [technicianCookie, branchCookie]) {
      for (const suffix of ['', '.xlsx']) assert.equal((await request('/api/amc-report' + suffix, cookie)).status, 403);
    }
    for (const cookie of [companyCookie, clientCookie, managementCookie]) {
      const previewResponse = await request(`/api/amc-report?month=${visit.month}&client=HBL`, cookie);
      assert.equal(previewResponse.status, 200);
      assert.equal(previewResponse.headers.get('cache-control'), 'no-store');
      const preview = await previewResponse.json();
      assert.equal(preview.client, 'HBL');
      assert.equal(preview.month, visit.month);
      assert.equal(preview.rows.length, store.visible(hbl).filter(row => row.month === visit.month).length);
      assert.ok(preview.rows.every(row => row.client === 'HBL' && row.month === visit.month));
      assert.equal(preview.rows.some(row => row.visitId === prior.id), false);
      assert.equal(preview.rows.find(row => row.visitId === visit.id).currentHours, 1654);
      const download = await request(`/api/amc-report.xlsx?month=${visit.month}&client=HBL`, cookie);
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-type'), /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
      assert.match(download.headers.get('content-disposition'), /attachment;.*\.xlsx/);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await download.arrayBuffer()));
      const sheet = workbook.getWorksheet('AMC Report');
      assert.deepEqual(sheet.getRow(1).values.slice(1), headers);
      assert.equal(sheet.actualRowCount, preview.rows.length + 1);
      const rows = Array.from({ length: sheet.actualRowCount - 1 }, (_, index) => index + 2);
      const exported = rows.find(index => cell(sheet, index, 'fsrNumber').value === store.get(company, visit.id).fsr.fsrNumber);
      assert.ok(exported, 'The workbook must contain the same submitted HBL FSR as the preview');
      assert.equal(cell(sheet, exported, 'currentHours').value, 1654);
      assert.equal(cell(sheet, exported, 'jobSummary').value, 'HBL synthetic AMC export check');
    }
    for (const suffix of ['', '.xlsx']) {
      assert.equal((await request(`/api/amc-report${suffix}?month=${visit.month}&client=HBL`, ublCookie)).status, 403);
      assert.equal((await request(`/api/amc-report${suffix}?month=${visit.month}&client=UBL`, clientCookie)).status, 403);
      assert.equal((await request(`/api/amc-report${suffix}?month=2026-99&client=HBL`, companyCookie)).status, 422);
    }
    const priorResponse = await request('/api/amc-report?month=2025-01&client=HBL', clientCookie);
    assert.equal(priorResponse.status, 200);
    assert.deepEqual((await priorResponse.json()).rows.map(row => row.visitId), [prior.id]);
    const defaultCompany = await (await request('/api/amc-report', companyCookie)).json();
    assert.equal(defaultCompany.client, 'HBL');
    assert.equal(defaultCompany.month, new Date().toISOString().slice(0, 7));
    const defaultUbl = await (await request('/api/amc-report', ublCookie)).json();
    assert.equal(defaultUbl.client, 'UBL');
    assert.ok(defaultUbl.rows.every(row => row.client === 'UBL'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
