// Historical other-client records are inserted explicitly in tests. A new UBL
// installation must not create HBL accounts or visits as demonstration defaults.
export const legacyHbl = { id: 'TEST-LEGACY-HBL-OFFICE', name: 'Historical HBL office fixture', role: 'client_ho', client: 'HBL', employeeId: 'TEST-HBL-OFFICE' };
export const legacyHblBranch = { id: 'TEST-LEGACY-HBL-BRANCH', name: 'Historical HBL branch fixture', role: 'branch', client: 'HBL', branchCode: '0001', employeeId: 'TEST-HBL-BRANCH' };
export const legacyHblTechnician = { id: 'TEST-LEGACY-HBL-TECH', name: 'Historical assigned technician fixture', role: 'technician', employeeId: 'TEST-HBL-TECH' };

export function insertLegacyHblVisits(store, company, count = 3) {
  const source = store.visible(company).find(visit => visit.client === 'UBL');
  const master = store.assets(company).find(asset => asset.id === source.assetId);
  const visits = [];
  for (let number = 1; number <= count; number++) {
    const branchCode = String(number).padStart(4, '0');
    const asset = { ...master, id: `TEST-HISTORICAL-HBL-ASSET-${number}`, client: 'HBL', branchCode,
      branchName: `Historical HBL fixture ${number}`, engineSerial: `TEST-HISTORICAL-HBL-ENGINE-${number}` };
    const visit = { ...source, id: `TEST-HISTORICAL-HBL-VISIT-${number}`, assetId: asset.id, client: 'HBL', branchCode,
      branchName: asset.branchName, technicianId: legacyHblTechnician.id, fsr: null, acknowledgement: null, status: 'scheduled' };
    delete visit.startedAt;
    delete visit.startedBy;
    store.db.prepare('INSERT INTO assets(id,payload) VALUES(?,?)').run(asset.id, JSON.stringify(asset));
    store.db.prepare('INSERT INTO visits(id,asset_id,month,status,payload) VALUES(?,?,?,?,?)').run(visit.id, asset.id, visit.month, visit.status, JSON.stringify(visit));
    visits.push(visit);
  }
  return visits;
}
