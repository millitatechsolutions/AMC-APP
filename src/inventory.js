import { randomUUID } from 'node:crypto';

const MAX_MILLI = 1_000_000_000_000;
const UNITS = new Set(['pcs', 'litre', 'metre', 'kg', 'set']);
const fail = (message, status = 422) => {
  throw Object.assign(new Error(message), { status });
};

// Decimal strings are converted without floating-point multiplication. Balances
// are held as integer thousandths so a correction can restore the exact amount.
function milliUnits(value, label, { positive = false } = {}) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
    fail(`${label} must be a finite quantity`);
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match || match[1].length > 10) fail(`${label} must be non-negative with at most 3 decimal places`);
  const milli = Number(match[1]) * 1000 + Number((match[2] || '').padEnd(3, '0'));
  if (!Number.isSafeInteger(milli) || milli > MAX_MILLI) fail(`${label} is too large`);
  if (positive && milli === 0) fail(`${label} must be greater than zero`);
  return milli;
}

function textValue(value, label, maximum, { optional = false, fallback = '' } = {}) {
  if (value === undefined && optional) return fallback;
  if (typeof value !== 'string') fail(`${label} must be text`);
  const result = value.trim();
  if ((!optional && !result) || result.length > maximum) fail(`${label} is required and must be at most ${maximum} characters`);
  return result || fallback;
}

const identity = user => ({
  id: String(user?.id || 'unknown'),
  name: String(user?.name || 'Unknown user'),
  employeeId: String(user?.employeeId || '')
});

export function createInventory(db, { companyName = 'PowerVision Systems Pvt Ltd' } = {}) {
  const initialized = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_items'").get());
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL CHECK(unit IN ('pcs','litre','metre','kg','set')),
      quantity_milli INTEGER NOT NULL CHECK(typeof(quantity_milli)='integer' AND quantity_milli BETWEEN 0 AND ${MAX_MILLI}),
      reorder_milli INTEGER NOT NULL CHECK(typeof(reorder_milli)='integer' AND reorder_milli BETWEEN 0 AND ${MAX_MILLI}),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES inventory_items(id),
      quantity_milli INTEGER NOT NULL CHECK(typeof(quantity_milli)='integer' AND quantity_milli != 0 AND quantity_milli BETWEEN -${MAX_MILLI} AND ${MAX_MILLI}),
      type TEXT NOT NULL CHECK(type IN ('opening','receipt','fsr_usage','fsr_correction')),
      at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS inventory_movements_item ON inventory_movements(item_id,id);
    CREATE TRIGGER IF NOT EXISTS inventory_movements_no_update
      BEFORE UPDATE ON inventory_movements BEGIN SELECT RAISE(ABORT,'Inventory movements are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS inventory_movements_no_delete
      BEFORE DELETE ON inventory_movements BEGIN SELECT RAISE(ABORT,'Inventory movements are immutable'); END;
  `);

  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const hasAudit = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit'").get());
  const audit = (user, action, entity, at, detail) => {
    if (hasAudit) run('INSERT INTO audit(actor,action,entity,at,detail) VALUES(?,?,?,?,?)', user.id, action, entity, at, JSON.stringify(detail));
  };
  const isManager = user => user?.role === 'ho' || user?.role === 'vendor' && [companyName, 'Demo AMC Services'].includes(user.vendor);
  const manager = user => {
    if (!isManager(user)) fail('Only PowerVision management can manage inventory', 403);
  };
  const reader = user => {
    if (!isManager(user) && user?.role !== 'technician') fail('Inventory catalogue access denied', 403);
  };
  const itemRow = id => {
    if (typeof id !== 'string' || !id) fail('An inventory item is required');
    const row = db.prepare('SELECT * FROM inventory_items WHERE id=?').get(id);
    if (!row) fail('Inventory item not found', 404);
    return row;
  };
  const present = row => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    quantity: row.quantity_milli / 1000,
    reorderLevel: row.reorder_milli / 1000,
    active: Boolean(row.active)
  });
  const appendMovement = (row, delta, type, user, detail, at = new Date().toISOString()) => {
    const payload = {
      itemId: row.id,
      sku: row.sku,
      itemName: row.name,
      unit: row.unit,
      quantity: delta / 1000,
      type,
      at,
      actor: identity(user),
      ...detail
    };
    const inserted = run('INSERT INTO inventory_movements(item_id,quantity_milli,type,at,payload) VALUES(?,?,?,?,?)', row.id, delta, type, at, JSON.stringify(payload));
    return { id: Number(inserted.lastInsertRowid), ...payload };
  };

  if (!initialized && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'").get()) {
    const hasDemoAssets = db.prepare('SELECT payload FROM assets').all().some(row => /^DEMO-ENGINE-\d+$/.test(String(JSON.parse(row.payload).engineSerial || '')));
    if (hasDemoAssets) transaction(() => {
      // A second setup process may have initialized the same database while
      // this process waited for the write lock.
      if (db.prepare('SELECT 1 FROM inventory_items LIMIT 1').get()) return;
      const actor = { id: 'inventory-demo-setup', name: 'Synthetic demo setup', employeeId: 'DEMO-SETUP' };
      const samples = [
        ['DEMO-OIL-FILTER', 'Demo oil filter', 'Filters', 'pcs', 20, 5],
        ['DEMO-FUEL-FILTER', 'Demo fuel filter', 'Filters', 'pcs', 20, 5],
        ['DEMO-AIR-FILTER', 'Demo air filter', 'Filters', 'pcs', 12, 3],
        ['DEMO-ENGINE-OIL', 'Demo engine oil', 'Lubricants', 'litre', 120, 30],
        ['DEMO-COOLANT', 'Demo coolant', 'Fluids', 'litre', 60, 15]
      ];
      const at = new Date().toISOString();
      for (const [sku, name, category, unit, quantity, reorder] of samples) {
        const id = `INV-${randomUUID()}`;
        run('INSERT INTO inventory_items(id,sku,name,category,unit,quantity_milli,reorder_milli) VALUES(?,?,?,?,?,?,?)', id, sku, name, category, unit, quantity * 1000, reorder * 1000);
        appendMovement(itemRow(id), quantity * 1000, 'opening', actor, { reference: 'Synthetic opening stock', note: 'Demo stock only; replace with verified physical stock before operational use.' }, at);
      }
    });
  }

  function normalizeUsage(lines = []) {
    if (!Array.isArray(lines) || lines.length > 50) fail('Inventory usage must be an array of at most 50 items');
    const seen = new Set();
    return lines.map(line => {
      if (!line || typeof line !== 'object' || Array.isArray(line)) fail('Invalid inventory usage item');
      const row = itemRow(line.itemId);
      if (!row.active) fail(`${row.sku} is inactive`, 409);
      if (seen.has(row.id)) fail('Each inventory item can appear only once in an FSR');
      seen.add(row.id);
      const quantity = milliUnits(line.quantity, 'Usage quantity', { positive: true }) / 1000;
      return { itemId: row.id, sku: row.sku, name: row.name, unit: row.unit, quantity };
    });
  }

  return {
    inventory(user) {
      manager(user);
      return {
        items: db.prepare('SELECT * FROM inventory_items ORDER BY name,sku').all().map(present),
        movements: db.prepare('SELECT id,payload FROM inventory_movements ORDER BY id DESC').all().map(row => ({ id: row.id, ...JSON.parse(row.payload) }))
      };
    },
    catalogue(user) {
      reader(user);
      return db.prepare('SELECT * FROM inventory_items WHERE active=1 ORDER BY name,sku').all().map(present);
    },
    createItem(user, input) {
      manager(user);
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid inventory item');
      const sku = textValue(input.sku, 'SKU', 64).toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(sku)) fail('SKU must contain letters, numbers, dots, underscores, slashes or hyphens');
      const name = textValue(input.name, 'Item name', 160);
      const category = textValue(input.category, 'Category', 80, { optional: true, fallback: 'General' });
      if (!UNITS.has(input.unit)) fail('Choose a valid inventory unit');
      const opening = milliUnits(input.openingQuantity === undefined ? 0 : input.openingQuantity, 'Opening quantity');
      const reorder = milliUnits(input.reorderLevel === undefined ? 0 : input.reorderLevel, 'Reorder level');
      return transaction(() => {
        if (db.prepare('SELECT id FROM inventory_items WHERE sku=? COLLATE NOCASE').get(sku)) fail('An item with this SKU already exists', 409);
        const id = `INV-${randomUUID()}`, at = new Date().toISOString();
        run('INSERT INTO inventory_items(id,sku,name,category,unit,quantity_milli,reorder_milli) VALUES(?,?,?,?,?,?,?)', id, sku, name, category, input.unit, opening, reorder);
        const row = itemRow(id);
        const movement = opening ? appendMovement(row, opening, 'opening', user, { reference: 'Opening stock', note: 'Opening quantity recorded when the item was created.' }, at) : null;
        audit(user, 'inventory.item_created', id, at, { sku, openingQuantity: opening / 1000, movementId: movement?.id ?? null });
        return present(row);
      });
    },
    receive(user, input) {
      manager(user);
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid stock receipt');
      const amount = milliUnits(input.quantity, 'Receipt quantity', { positive: true });
      const reference = textValue(input.reference, 'Receipt reference', 160);
      const note = textValue(input.note, 'Receipt note', 4000, { optional: true });
      return transaction(() => {
        const row = itemRow(input.itemId);
        if (!row.active) fail('Cannot receive stock for an inactive item', 409);
        const balance = row.quantity_milli + amount;
        if (!Number.isSafeInteger(balance) || balance > MAX_MILLI) fail('Receipt would exceed the maximum inventory balance');
        const at = new Date().toISOString();
        run('UPDATE inventory_items SET quantity_milli=? WHERE id=?', balance, row.id);
        const movement = appendMovement(row, amount, 'receipt', user, { reference, note }, at);
        audit(user, 'inventory.received', row.id, at, { movementId: movement.id, quantity: amount / 1000, reference });
        return { item: present(itemRow(row.id)), movement };
      });
    },
    normalizeUsage,
    // The caller must already hold BEGIN IMMEDIATE for the FSR, its immutable
    // revision, these movements and the stock balance to commit together.
    applyUsage(user, { visit, fsrNumber, revision, previousUsage = [], usage = [] }) {
      if (user?.role !== 'technician' || visit?.technicianId !== user.id) fail('Only the assigned technician can record FSR inventory usage', 403);
      if (!db.isTransaction) fail('FSR inventory usage requires an active transaction', 409);
      const current = normalizeUsage(usage);
      if (!Array.isArray(previousUsage) || previousUsage.length > 50) fail('Invalid prior FSR inventory usage');
      if ((current.length || previousUsage.length) && ![companyName, 'Demo AMC Services'].includes(visit.vendor)) {
        fail('PowerVision inventory can only be used on PowerVision service visits', 403);
      }
      const previous = new Map();
      for (const line of previousUsage) {
        if (!line || typeof line !== 'object' || Array.isArray(line)) fail('Invalid prior FSR inventory usage');
        const row = itemRow(line.itemId);
        if (previous.has(row.id)) fail('Duplicate prior FSR inventory usage item');
        previous.set(row.id, milliUnits(line.quantity, 'Prior usage quantity', { positive: true }));
      }
      const requested = new Map(current.map(line => [line.itemId, milliUnits(line.quantity, 'Usage quantity', { positive: true })]));
      const changes = [];
      for (const id of new Set([...previous.keys(), ...requested.keys()])) {
        const row = itemRow(id);
        const delta = (previous.get(id) || 0) - (requested.get(id) || 0);
        if (!delta) continue;
        const balance = row.quantity_milli + delta;
        if (balance < 0) fail(`Insufficient stock for ${row.sku}. Available: ${row.quantity_milli / 1000} ${row.unit}; additional required: ${-delta / 1000} ${row.unit}.`, 409);
        if (!Number.isSafeInteger(balance) || balance > MAX_MILLI) fail(`Corrected usage would exceed the maximum balance for ${row.sku}`);
        changes.push({ row, delta, balance });
      }
      const at = new Date().toISOString();
      const reference = textValue(fsrNumber, 'FSR number', 160);
      const correction = Boolean(visit.fsr);
      const movements = [];
      for (const { row, delta, balance } of changes) {
        run('UPDATE inventory_items SET quantity_milli=? WHERE id=?', balance, row.id);
        movements.push(appendMovement(row, delta, correction ? 'fsr_correction' : 'fsr_usage', user, {
          reference,
          note: correction ? 'Stock adjusted by the quantity difference in the corrected FSR.' : 'Inventory consumed in the submitted FSR.',
          visitId: visit.id,
          fsrNumber: reference,
          branchCode: visit.branchCode,
          branchName: visit.branchName,
          client: visit.client || '',
          ...(revision !== undefined ? { revision } : {})
        }, at));
      }
      return { usage: current, movements };
    }
  };
}
