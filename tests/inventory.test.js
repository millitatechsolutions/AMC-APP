import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore, users } from '../src/store.js';
import { createApp } from '../src/server.js';
import { fields } from '../src/fields.js';

const manager = users.find(user => user.id === 'ho-demo');
const management = users.find(user => user.id === 'vendor-demo');
const technician = users.find(user => user.id === 'tech-demo');
const branch = users.find(user => user.id === 'branch-demo');
const client = users.find(user => user.id === 'ubl-ho-demo');
const foreignVendor = { id: 'OTHER-VENDOR', role: 'vendor', vendor: 'Another Company' };
const picture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const milli = quantity => Math.round(quantity * 1000);

function completeFsr() {
  return Object.fromEntries(fields.filter(field => field.type !== 'auto' && !field.optional).map(field => [field.key,
    Array.isArray(field.type) ? field.type[0]
      : field.type === 'number' ? (field.key === 'currentHours' ? 1200 : 10)
        : field.type === 'attachment' ? picture : 'Recorded at site'
  ]));
}

const itemInput = (sku, openingQuantity = 0) => ({ sku, name: `Test material ${sku}`, category: 'Test consumables', unit: 'litre', openingQuantity, reorderLevel: 1 });
const balance = (store, itemId) => store.inventory(manager).items.find(item => item.id === itemId).quantity;
const movements = (store, itemId) => store.inventory(manager).movements.filter(movement => movement.itemId === itemId);
const usage = values => values.map(({ itemId, quantity }) => ({ itemId, quantity }));
function assertConservation(store, itemId) {
  assert.equal(movements(store, itemId).reduce((sum, movement) => sum + milli(movement.quantity), 0), milli(balance(store, itemId)), 'The signed movement ledger must exactly equal available stock');
}

test('Inventory receipts preserve precision, enforce manager access and survive restart without reseeding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-inventory-persist-'));
  const path = join(dir, 'db.sqlite');
  let store = createStore(path);
  try {
    const initial = store.inventory(manager);
    assert.equal(initial.items.length, 5, 'A fresh synthetic demo includes five clearly identified stock items');
    assert.equal(initial.movements.length, 5);
    assert.ok(initial.movements.every(movement => movement.type === 'opening' && movement.quantity > 0));
    assert.deepEqual(store.inventory(management), initial);
    assert.ok(Array.isArray(store.inventoryCatalogue(technician)));
    for (const denied of [technician, branch, client, foreignVendor]) {
      assert.throws(() => store.inventory(denied), error => error.status === 403);
      assert.throws(() => store.createInventoryItem(denied, itemInput('DENIED')), error => error.status === 403);
      assert.throws(() => store.receiveInventory(denied, { itemId: initial.items[0].id, quantity: 1, reference: 'DENIED' }), error => error.status === 403);
    }
    for (const denied of [branch, client, foreignVendor]) assert.throws(() => store.inventoryCatalogue(denied), error => error.status === 403);
    const legacyManager = { id: 'LEGACY-MANAGER', name: 'Legacy PowerVision manager', role: 'vendor', vendor: 'Demo AMC Services' };
    assert.equal(store.inventory(legacyManager).items.length, 5);

    const item = store.createInventoryItem(management, itemInput(' test-oil ', 0.125));
    assert.equal(item.sku, 'TEST-OIL');
    assert.equal(item.quantity, 0.125);
    assert.throws(() => store.createInventoryItem(manager, itemInput('test-oil', 1)), error => error.status === 409);
    assert.throws(() => store.createInventoryItem(manager, { ...itemInput('INVALID-UNIT'), unit: 'invalid' }), error => error.status === 422);
    assert.throws(() => store.createInventoryItem(manager, itemInput('NEGATIVE-OPENING', -1)), error => error.status === 422);
    const receipt = store.receiveInventory(manager, { itemId: item.id, quantity: 0.333, reference: 'TEST-GRN-001', note: 'Sealed oil received' });
    assert.equal(receipt.item.quantity, 0.458);
    assert.equal(receipt.movement.type, 'receipt');
    assert.equal(receipt.movement.quantity, 0.333);
    assert.equal(receipt.movement.reference, 'TEST-GRN-001');
    assert.equal(receipt.movement.actor.id, manager.id);
    assert.ok(receipt.movement.at);
    for (const quantity of [0, -1, 0.0001, 1000000001]) {
      assert.throws(() => store.receiveInventory(manager, { itemId: item.id, quantity, reference: 'INVALID' }), error => error.status === 422);
    }
    assert.throws(() => store.receiveInventory(manager, { itemId: 'MISSING-ITEM', quantity: 1, reference: 'INVALID' }), error => error.status === 404);
    assert.equal(balance(store, item.id), 0.458);
    assertConservation(store, item.id);
    for (const companyUser of [manager, management]) {
      const itemAudit = store.audit(companyUser).filter(entry => entry.entity === item.id);
      assert.ok(itemAudit.some(entry => entry.action === 'inventory.item_created'));
      assert.ok(itemAudit.some(entry => entry.action === 'inventory.received'));
    }
    for (const restrictedUser of [client, branch, technician, foreignVendor]) {
      assert.equal(store.audit(restrictedUser).some(entry => entry.action.startsWith('inventory.')), false, 'Company inventory audit records must remain private to PowerVision management');
    }
    assert.throws(() => store.db.prepare('UPDATE inventory_movements SET payload=payload WHERE item_id=?').run(item.id), /immutable/i);
    assert.throws(() => store.db.prepare('DELETE FROM inventory_movements WHERE item_id=?').run(item.id), /immutable/i);

    const visit = store.visible(branch)[0];
    const seedUsage = initial.items.map(seed => ({ itemId: seed.id, quantity: seed.quantity }));
    store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: seedUsage });
    for (const seed of initial.items) {
      assert.equal(balance(store, seed.id), 0);
      assertConservation(store, seed.id);
    }
    const draftVisit = store.visible(technician).find(candidate => candidate.id !== visit.id);
    store.start(technician, draftVisit.id);
    const pendingDraft = store.saveDraft(technician, draftVisit.id, { values: { visitPurpose: 'AMC', inventoryUsage: [{ itemId: item.id, quantity: 0.125 }] }, revision: 0 });
    const beforeRestart = store.inventory(manager);
    store.close();
    store = createStore(path);
    assert.deepEqual(store.inventory(manager), beforeRestart, 'Reopening an exhausted demo stock database must not create more stock or opening movements');
    assert.equal(store.report(client, visit.id).visit.fsr.inventoryUsage.length, 5);
    assert.deepEqual(store.draft(technician, draftVisit.id), pendingDraft, 'Inventory usage in a saved draft must survive a database restart without stock deduction');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Real asset databases receive empty inventory tables instead of invented demo stock', () => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-inventory-real-'));
  const path = join(dir, 'db.sqlite');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE assets(id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  db.prepare('INSERT INTO assets(id,payload) VALUES(?,?)').run('REAL-ASSET-1', JSON.stringify({ id: 'REAL-ASSET-1', client: 'UBL', vendor: 'PowerVision Systems Pvt Ltd', engineSerial: 'REAL-ENGINE-1' }));
  db.close();
  const store = createStore(path);
  try {
    assert.deepEqual(store.inventory(manager), { items: [], movements: [] });
    assert.deepEqual(store.inventoryCatalogue(technician), []);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Only FSR submission changes stock; corrections apply net differences while preserving report history', () => {
  const store = createStore(':memory:');
  try {
    const item = store.createInventoryItem(manager, itemInput('CORRECTION-OIL', 10));
    const visit = store.visible(branch)[0];
    const firstUsage = [{ itemId: item.id, quantity: 2.125 }];
    const originalLedger = movements(store, item.id);
    store.start(technician, visit.id);
    const draft = store.saveDraft(technician, visit.id, { values: { visitPurpose: 'AMC', inventoryUsage: firstUsage }, revision: 0 });
    assert.deepEqual(usage(draft.values.inventoryUsage), firstUsage);
    assert.deepEqual(usage(store.draft(technician, visit.id).values.inventoryUsage), firstUsage);
    assert.equal(balance(store, item.id), 10);
    assert.deepEqual(movements(store, item.id), originalLedger, 'Starting and saving a draft must not deduct or reserve stock');

    const first = store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: firstUsage });
    assert.equal(balance(store, item.id), 7.875);
    assert.deepEqual(first.fsr.inventoryUsage, [{ itemId: item.id, sku: item.sku, name: item.name, unit: item.unit, quantity: 2.125 }]);
    assert.equal(store.draft(technician, visit.id), null);
    const issued = movements(store, item.id).find(movement => movement.type === 'fsr_usage');
    assert.equal(issued.quantity, -2.125);
    assert.equal(issued.visitId, visit.id);
    assert.equal(issued.fsrNumber, first.fsr.fsrNumber);
    assert.equal(issued.actor.id, technician.id);
    assert.equal(issued.branchCode, visit.branchCode);
    assert.throws(() => store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: firstUsage }), error => error.status === 409);
    const ledgerAfterSubmission = movements(store, item.id);
    store.review(branch, visit.id, 'unacknowledged', 'Correct the service narrative');
    assert.equal(balance(store, item.id), 7.875);
    assert.deepEqual(movements(store, item.id), ledgerAfterSubmission, 'A branch rejection must not automatically return consumed materials');

    const omitted = store.submit(technician, visit.id, completeFsr());
    assert.deepEqual(omitted.fsr.inventoryUsage, first.fsr.inventoryUsage, 'Older clients omitting inventoryUsage must preserve previously submitted usage');
    assert.equal(balance(store, item.id), 7.875);
    assert.deepEqual(movements(store, item.id), ledgerAfterSubmission, 'An unchanged resubmission must not issue stock twice');
    store.review(branch, visit.id, 'unacknowledged', 'Correct material quantity');
    store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: [{ itemId: item.id, quantity: 3.375 }] });
    assert.equal(balance(store, item.id), 6.625);
    assert.equal(movements(store, item.id).find(movement => movement.type === 'fsr_correction' && movement.quantity < 0).quantity, -1.25);
    store.review(branch, visit.id, 'unacknowledged', 'Correct material quantity again');
    store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: [{ itemId: item.id, quantity: 1.125 }] });
    assert.equal(balance(store, item.id), 8.875);
    assert.ok(movements(store, item.id).some(movement => movement.type === 'fsr_correction' && movement.quantity === 2.25));
    store.review(branch, visit.id, 'unacknowledged', 'Remove the mistakenly included material');
    const cleared = store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: [] });
    assert.deepEqual(cleared.fsr.inventoryUsage, []);
    assert.equal(balance(store, item.id), 10);
    const beforeAcknowledgment = movements(store, item.id);
    store.review(branch, visit.id, 'acknowledged', 'Verified final correction');
    assert.deepEqual(movements(store, item.id), beforeAcknowledgment, 'Acknowledgment must not alter the stock ledger');
    assertConservation(store, item.id);

    const report = store.report(client, visit.id);
    assert.equal(report.history.length, 5);
    assert.deepEqual(report.history[0].fsr.inventoryUsage, first.fsr.inventoryUsage);
    assert.deepEqual(report.history.map(revision => revision.fsr.inventoryUsage[0]?.quantity ?? 0), [2.125, 2.125, 3.375, 1.125, 0]);
    assert.deepEqual(store.report(branch, visit.id).history, report.history);
    assert.deepEqual(store.report(manager, visit.id).history, report.history);
    assert.throws(() => store.inventory(client), error => error.status === 403);
    assert.throws(() => store.inventory(branch), error => error.status === 403);
  } finally {
    store.close();
  }
});

test('Invalid or insufficient FSR usage rolls back all stock, snapshots, drafts and ledger writes', () => {
  const store = createStore(':memory:');
  try {
    const firstItem = store.createInventoryItem(manager, itemInput('ATOMIC-OIL', 5));
    const secondItem = store.createInventoryItem(manager, { ...itemInput('ATOMIC-FILTER', 1), unit: 'pcs' });
    const visit = store.visible(branch)[0];
    store.start(technician, visit.id);
    const draftValues = { visitPurpose: 'AMC', inventoryUsage: [{ itemId: firstItem.id, quantity: 0.5 }] };
    const draft = store.saveDraft(technician, visit.id, { values: draftValues, revision: 0 });
    const before = store.inventory(manager);
    const beforeAudit = store.audit(manager);
    const assertUnchanged = () => {
      assert.deepEqual(store.inventory(manager), before);
      assert.equal(store.get(manager, visit.id).fsr, null);
      assert.equal(store.get(manager, visit.id).status, 'scheduled');
      assert.deepEqual(store.history(manager, visit.id), []);
      assert.deepEqual(store.draft(technician, visit.id), draft);
      assert.deepEqual(store.audit(manager), beforeAudit);
    };
    const invalid = [
      { rows: [{ itemId: firstItem.id, quantity: 1 }, { itemId: secondItem.id, quantity: 2 }], status: 409 },
      { rows: [{ itemId: firstItem.id, quantity: 0 }], status: 422 },
      { rows: [{ itemId: firstItem.id, quantity: -1 }], status: 422 },
      { rows: [{ itemId: firstItem.id, quantity: 0.0001 }], status: 422 },
      { rows: [{ itemId: firstItem.id, quantity: 1 }, { itemId: firstItem.id, quantity: 1 }], status: 422 },
      { rows: [{ itemId: 'UNKNOWN-INVENTORY-ITEM', quantity: 1 }], status: 404 }
    ];
    for (const { rows, status } of invalid) {
      assert.throws(() => store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: rows }), error => error.status === status);
      assertUnchanged();
    }
    store.db.exec("CREATE TRIGGER test_inventory_visit_failure BEFORE UPDATE ON visits BEGIN SELECT RAISE(ABORT, 'Test final visit write failure'); END");
    assert.throws(() => store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: [{ itemId: firstItem.id, quantity: 1 }] }), /Test final visit write failure/);
    assertUnchanged();
    store.db.exec('DROP TRIGGER test_inventory_visit_failure');
    store.submit(technician, visit.id, { ...completeFsr(), inventoryUsage: [{ itemId: firstItem.id, quantity: 1 }, { itemId: secondItem.id, quantity: 1 }] });
    assert.equal(balance(store, firstItem.id), 4);
    assert.equal(balance(store, secondItem.id), 0);
    assert.equal(store.draft(technician, visit.id), null);
    assertConservation(store, firstItem.id);
    assertConservation(store, secondItem.id);

    const sourceVisit = store.visible(technician).find(candidate => !candidate.fsr);
    const sourceAsset = store.assets(manager).find(asset => asset.id === sourceVisit.assetId);
    const foreignAsset = { ...sourceAsset, id: 'TEST-FOREIGN-VENDOR-ASSET', branchCode: 'STOCK-FOREIGN', vendor: foreignVendor.vendor };
    const foreignVisit = { ...sourceVisit, id: 'TEST-FOREIGN-VENDOR-VISIT', assetId: foreignAsset.id, branchCode: foreignAsset.branchCode, vendor: foreignVendor.vendor, fsr: null, acknowledgement: null, status: 'scheduled' };
    store.db.prepare('INSERT INTO assets(id,payload) VALUES(?,?)').run(foreignAsset.id, JSON.stringify(foreignAsset));
    store.db.prepare('INSERT INTO visits(id,asset_id,month,status,payload) VALUES(?,?,?,?,?)').run(foreignVisit.id, foreignAsset.id, foreignVisit.month, foreignVisit.status, JSON.stringify(foreignVisit));
    const beforeForeignAttempt = store.inventory(manager);
    const auditBeforeForeignAttempt = store.audit(manager);
    assert.throws(() => store.submit(technician, foreignVisit.id, { ...completeFsr(), inventoryUsage: [{ itemId: firstItem.id, quantity: 1 }] }), error => error.status === 403, 'An assigned technician cannot consume PowerVision stock for another vendor');
    assert.deepEqual(store.inventory(manager), beforeForeignAttempt);
    assert.deepEqual(store.history(manager, foreignVisit.id), []);
    assert.equal(store.get(manager, foreignVisit.id).fsr, null);
    assert.equal(store.get(manager, foreignVisit.id).status, 'scheduled');
    assert.deepEqual(store.audit(manager), auditBeforeForeignAttempt);
    const noMaterialFsr = store.submit(technician, foreignVisit.id, completeFsr());
    assert.equal(noMaterialFsr.status, 'submitted', 'Legacy visits for another vendor remain valid when they do not use PowerVision stock');
    assert.deepEqual(noMaterialFsr.fsr.inventoryUsage, []);
    assert.deepEqual(store.inventory(manager), beforeForeignAttempt);
  } finally {
    store.close();
  }
});

test('Inventory HTTP roles and competing technician submissions prevent overselling', async () => {
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
    assert.equal((await request('/api/inventory')).status, 401);
    assert.equal((await request('/api/inventory/catalogue')).status, 401);
    const managerCookie = await login(manager);
    const managementCookie = await login(management);
    const technicianCookie = await login(technician, 'technician/');
    const branchCookie = await login(branch);
    const clientCookie = await login(client);
    const created = await request('/api/inventory/items', managementCookie, itemInput('HTTP-FINAL-LITRE', 0));
    assert.ok([200, 201].includes(created.status));
    const item = await created.json();
    const receipt = await request('/api/inventory/receipts', managerCookie, { itemId: item.id, quantity: 1, reference: 'HTTP-GRN-001', note: 'One litre available' });
    assert.ok([200, 201].includes(receipt.status));
    assert.equal((await receipt.json()).item.quantity, 1);
    assert.equal((await request('/api/technician/inventory/catalogue', technicianCookie)).status, 200);
    assert.equal((await request('/api/technician/inventory', technicianCookie)).status, 403);
    assert.equal((await request('/api/technician/inventory/receipts', technicianCookie, { itemId: item.id, quantity: 1, reference: 'DENIED' })).status, 403);
    for (const cookie of [branchCookie, clientCookie]) {
      assert.equal((await request('/api/inventory', cookie)).status, 403);
      assert.equal((await request('/api/inventory/catalogue', cookie)).status, 403);
      assert.equal((await request('/api/inventory/items', cookie, itemInput('DENIED'))).status, 403);
      assert.equal((await request('/api/inventory/receipts', cookie, { itemId: item.id, quantity: 1, reference: 'DENIED' })).status, 403);
    }
    const visits = store.visible(technician).slice(0, 2);
    const submitted = await Promise.all(visits.map(visit => request(`/api/technician/visits/${visit.id}/submit`, technicianCookie, { ...completeFsr(), inventoryUsage: [{ itemId: item.id, quantity: 1 }] })));
    assert.deepEqual(submitted.map(response => response.status).sort(), [200, 409]);
    assert.equal(balance(store, item.id), 0);
    const performed = visits.filter(visit => store.get(manager, visit.id).fsr);
    assert.equal(performed.length, 1);
    assert.equal(movements(store, item.id).filter(movement => movement.type === 'fsr_usage').length, 1);
    assertConservation(store, item.id);
    const shared = await request(`/api/visits/${performed[0].id}/report`, clientCookie);
    assert.equal(shared.status, 200);
    assert.deepEqual((await shared.json()).visit.fsr.inventoryUsage, [{ itemId: item.id, sku: item.sku, name: item.name, unit: item.unit, quantity: 1 }]);
    const inventoryResponse = await request('/api/inventory', managerCookie);
    assert.equal(inventoryResponse.status, 200);
    assert.equal(inventoryResponse.headers.get('cache-control'), 'no-store');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
