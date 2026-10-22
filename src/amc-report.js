import ExcelJS from 'exceljs';

const snapshotSource = key => `visit.fsr.${key} (submitted FSR snapshot; blank until recorded)`;
const identificationSource = key => `visit.fsr.${key}, otherwise visit.${key} or asset.${key}`;

// Labels and order match row 1, A:BQ, of the supplied Report Format AMC.xlsx.
// Template spelling and the leading space in G1 are intentional.
export const REPORT_COLUMNS = Object.freeze([
  ['branchCode', 'Branch Code', identificationSource('branchCode')],
  ['siteAddress', 'Site Address', identificationSource('siteAddress')],
  ['region', 'Region', identificationSource('region')],
  ['vendor', 'AMC Vendor', identificationSource('vendor')],
  ['customerId', 'Customer ID', 'visit.fsr.customerId, otherwise asset.customerId if explicitly recorded; never generated during export'],
  ['month', 'Month', 'visit.fsr.month, otherwise visit.month (stored reporting period, including year)'],
  ['visitDate', ' Visit Date', 'visit.fsr.paperVisitDate (date entered from the paper FSR), otherwise visit.fsr.visitDate (digital submission-date fallback); blank until recorded'],
  ['lastVisitDate', 'Last Visit Date', 'visit.fsr.lastVisitDate, otherwise asset.lastVisitDate'],
  ['scheduleDate', 'Visit Schedule Date', 'visit.fsr.scheduleDate, otherwise visit.dueDate'],
  ['visitStatus', 'Visit Status', 'visit.fsr.visitStatus for submitted FSRs; otherwise the current visit status, with started scheduled visits shown as In progress'],
  ['visitPurpose', 'Visit Purpose', snapshotSource('visitPurpose')],
  ['nextServiceDue', 'Next Visit Due', 'visit.fsr.nextServiceDue (the existing field stores the next monthly visit date)'],
  ['fsrNumber', 'FSR Number', snapshotSource('fsrNumber')],
  ['placement', 'Genset Placement', 'visit.fsr.placement, otherwise asset.placement if recorded'],
  ['supplier', 'Genset Supplier', 'visit.fsr.supplier, otherwise asset.supplier if recorded'],
  ['model', 'GensetModel', 'visit.fsr.model, otherwise asset.model'],
  ['rating', 'Genset Rating (kVA)', 'visit.fsr.rating, otherwise asset.rating'],
  ['engineSerial', 'Engine Serial Number', 'visit.fsr.engineSerial, otherwise asset.engineSerial; exported as text to preserve identifiers'],
  ['engineType', 'Engine Name & Type', 'visit.fsr.engineType, otherwise asset.engineType if recorded'],
  ['oilFilter', 'Oil Filter Number', 'visit.fsr.oilFilter, otherwise asset.oilFilter if recorded'],
  ['fuelFilter', 'Fuel Filter Number', 'visit.fsr.fuelFilter, otherwise asset.fuelFilter if recorded'],
  ['waterFilter', 'Water Filter Number', 'visit.fsr.waterFilter, otherwise asset.waterFilter if recorded'],
  ['airFilter', 'Air Filter Number', 'visit.fsr.airFilter, otherwise asset.airFilter if recorded'],
  ['alternator', 'Alternator Model & Condition', 'visit.fsr.alternator, otherwise asset.alternator if recorded'],
  ['avr', 'AVR Model', 'visit.fsr.avr, otherwise asset.avr if recorded'],
  ['controlModule', 'Control Module Brand', 'visit.fsr.controlModule, otherwise asset.controlModule if recorded'],
  ['lastServiceDate', 'Last Service Date (PM)', 'visit.fsr.lastServiceDate, otherwise asset.lastServiceDate'],
  ['lastServiceHours', 'Last Service Running Hour', 'visit.fsr.lastServiceHours, otherwise asset.lastServiceHours'],
  ['currentHours', 'Current Running Hour', snapshotSource('currentHours')],
  ['pmRequired', 'Service Required (PM)', 'visit.fsr.pmRequired (the stored submission-time result; not recalculated during export)'],
  ['installationYear', 'Installation Year', 'visit.fsr.installationYear, otherwise asset.installationYear'],
  ['warranty', 'Warranty Status', 'visit.fsr.warranty, otherwise visit.warranty or asset.warranty; the recorded Warranty/OOW value is retained'],
  ['oilPressure', 'Lube Oil Pressure (Bar / PSI)', 'visit.fsr.oilPressure combined with visit.fsr.oilPressureUnit; a missing pressure remains blank'],
  ['oilSafety', 'Oil pressure Safety (Connected & Working)', snapshotSource('oilSafety')],
  ['oilLevel', 'Lube Oil Level', snapshotSource('oilLevel')],
  ['coolantTemp', 'Coolant Temperature (Centigrade)', snapshotSource('coolantTemp')],
  ['coolantLevel', 'Coolant Level', snapshotSource('coolantLevel')],
  ['coolantSafety', 'Coolant Temperature safety (Connected & Working)', snapshotSource('coolantSafety')],
  ['radiatorCap', 'Radiator Cap', snapshotSource('radiatorCap')],
  ['radiatorCondition', 'Radiator & hose pipe condition', snapshotSource('radiatorCondition')],
  ['radiatorAverage', 'If Average', snapshotSource('radiatorAverage')],
  ['radiatorBad', 'If Bad', snapshotSource('radiatorBad')],
  ['beltCondition', 'Fan & Dynamo Belt Condition', snapshotSource('beltCondition')],
  ['rpm', 'RPM', snapshotSource('rpm')],
  ['frequency', 'Frequency', snapshotSource('frequency')],
  ['loadCheck', 'Load Check', snapshotSource('loadCheck')],
  ['loadBalance', 'Load', snapshotSource('loadBalance')],
  ['totalLoad', 'Total Load (kW)', snapshotSource('totalLoad')],
  ['phaseLoad', 'Load per Phase 1/2/3 (Amp)', 'visit.fsr.phase1 / visit.fsr.phase2 / visit.fsr.phase3, in phase order; a missing phase is shown as Not recorded'],
  ['batteryModel', 'Battery Model', snapshotSource('batteryModel')],
  ['batteryVoltage', 'Battery Voltage', snapshotSource('batteryVoltage')],
  ['batteryStatus', 'Battery Status (If Dry Battery (Mention Color Code)', snapshotSource('batteryStatus')],
  ['charger', 'Trickle Electrical Charger', snapshotSource('charger')],
  ['ats', 'ATS Panel Operational', snapshotSource('ats')],
  ['canopy', 'Canopy Condition', snapshotSource('canopy')],
  ['issue', 'Issue', snapshotSource('issue')],
  ['complaintLogged', 'Compliant Lock', snapshotSource('complaintLogged')],
  ['complaintNumber', 'Complain Number (Here4you)', snapshotSource('complaintNumber')],
  ['cause', 'Cause', snapshotSource('cause')],
  ['correctiveAction', 'Corrective Action', snapshotSource('correctiveAction')],
  ['jobSummary', 'Job Summary', snapshotSource('jobSummary')],
  ['parts', 'Parts Replaced Details (if any)', snapshotSource('parts')],
  ['partsHandedOver', 'Parts Handed Over to Customer', snapshotSource('partsHandedOver')],
  ['repair', 'Repair', snapshotSource('repair')],
  ['healthRemarks', 'Genset Health Remarks', snapshotSource('healthRemarks')],
  ['customerRepresentative', 'Customer Representative', snapshotSource('customerRepresentative')],
  ['employeeCode', 'Customer Employee Code', `${snapshotSource('employeeCode')}; this is the customer representative's code, not the technician's employee ID`],
  ['fsrEvidence', 'FSR', 'visit.fsr.fsrNumber plus Image available in portal when visit.fsr.fsrPhoto exists; the attachment remains in the authorized visit report'],
  ['callStatus', 'Call Status', 'visit.fsr.callStatus (recorded Open/Closed complaint status; separate from branch acknowledgment)']
].map(([key, label, source]) => Object.freeze({ key, label, source })));

const widths = [11.33, 12.55, 11.78, 14.66, 17.78, 9.78, 10.55, 12.55, 16.55, 22.66, 16.66, 14.89, 10.89, 24.44, 36.44, 11.89, 17, 18.44, 18, 14.89, 16, 17.89, 14.89, 25.55, 10, 19.22, 19.33, 22.22, 18.66, 20.89, 14.33, 23.66, 23.66, 36.11, 22.55, 29.22, 12.11, 44.11, 11.55, 26.55, 14.55, 13, 25.22, 6.33, 9.33, 25.66, 22.22, 14, 24.78, 12.66, 13.78, 43.22, 21.33, 19.22, 16.55, 11.22, 21.33, 25.55, 19.55, 28.66, 36.78, 28.55, 27.11, 41.66, 30.89, 21.89, 22.33, 31.55, 18.11];
const numericKeys = new Set(['rating', 'lastServiceHours', 'currentHours', 'installationYear', 'coolantTemp', 'rpm', 'frequency', 'totalLoad', 'batteryVoltage']);
const dateKeys = new Set(['visitDate', 'lastVisitDate', 'scheduleDate', 'nextServiceDue', 'lastServiceDate']);
const identifierKeys = new Set(['branchCode', 'customerId', 'fsrNumber', 'engineSerial', 'complaintNumber', 'employeeCode']);
const blank = value => value === undefined || value === null || value === '';
const text = value => blank(value) ? '' : String(value);

function numeric(value) {
  if (blank(value) || typeof value === 'string' && !value.trim()) return '';
  const result = Number(value);
  return Number.isFinite(result) ? result : text(value);
}

function day(value) {
  if (blank(value)) return '';
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  return text(value);
}

function workflowLabel(visit) {
  if (visit.status === 'scheduled') return visit.startedAt ? 'In progress' : 'Scheduled';
  return text(visit.status).replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
}

/**
 * Input: authorized store.report() objects. Output: JSON-safe flat rows containing
 * the 69 report keys and visitId/assetId/client/status metadata for the portal.
 * This projection performs no authorization or filtering; the caller must scope
 * reports before passing them here.
 */
export function buildAmcRows(reports) {
  return reports.map(report => {
    const visit = report.visit ?? {}, asset = report.asset ?? {}, fsr = visit.fsr ?? {};
    const recorded = key => !blank(fsr[key]) ? fsr[key] : '';
    const identity = key => !blank(fsr[key]) ? fsr[key] : !blank(visit[key]) ? visit[key] : asset[key] ?? '';
    const master = key => !blank(fsr[key]) ? fsr[key] : asset[key] ?? '';
    const values = Object.fromEntries(REPORT_COLUMNS.map(column => [column.key, recorded(column.key)]));
    for (const key of ['branchCode', 'siteAddress', 'region', 'vendor', 'warranty']) values[key] = identity(key);
    for (const key of ['placement', 'supplier', 'model', 'rating', 'engineSerial', 'engineType', 'oilFilter', 'fuelFilter', 'waterFilter', 'airFilter', 'alternator', 'avr', 'controlModule', 'lastVisitDate', 'lastServiceDate', 'lastServiceHours', 'installationYear']) values[key] = master(key);
    values.customerId = !blank(fsr.customerId) ? fsr.customerId : asset.customerId ?? '';
    values.month = !blank(fsr.month) ? fsr.month : visit.month ?? '';
    values.visitDate = !blank(fsr.paperVisitDate) ? fsr.paperVisitDate : recorded('visitDate');
    values.scheduleDate = !blank(fsr.scheduleDate) ? fsr.scheduleDate : visit.dueDate ?? '';
    values.visitStatus = !blank(fsr.visitStatus) ? fsr.visitStatus : workflowLabel(visit);
    const pressure = recorded('oilPressure'), unit = recorded('oilPressureUnit');
    values.oilPressure = blank(pressure) ? '' : `${text(pressure)}${blank(unit) ? '' : ` ${text(unit)}`}`;
    const phases = ['phase1', 'phase2', 'phase3'].map(recorded);
    values.phaseLoad = phases.every(blank) ? '' : phases.map(value => blank(value) ? 'Not recorded' : text(value)).join('/');
    values.fsrEvidence = fsr.fsrPhoto ? [text(fsr.fsrNumber), 'Image available in portal'].filter(Boolean).join(' - ') : '';
    for (const column of REPORT_COLUMNS) {
      values[column.key] = numericKeys.has(column.key) ? numeric(values[column.key]) : dateKeys.has(column.key) ? day(values[column.key]) : text(values[column.key]);
    }
    return { ...values, visitId: text(visit.id), assetId: text(visit.assetId ?? asset.id), client: text(visit.client ?? fsr.client ?? asset.client ?? report.client?.name), status: text(visit.status) };
  });
}

function excelValue(key, value) {
  if (blank(value)) return null;
  if (dateKeys.has(key) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return date;
  }
  // Plain strings, including strings beginning with '=', remain string cells.
  // No formula or hyperlink objects are constructed from entered FSR values.
  return typeof value === 'number' ? value : text(value);
}

function styleHeader(row) {
  row.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF17324D' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
  row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
}

export async function createAmcWorkbook(rows, { month = '', client = '' } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PowerVision Systems Pvt Ltd';
  workbook.title = 'AMC visit report';
  workbook.subject = `${client || 'Authorized clients'} / ${month || 'Provided reporting period'}`;
  const sheet = workbook.addWorksheet('AMC Report', { views: [{ state: 'frozen', ySplit: 1 }], properties: { defaultRowHeight: 18 } });
  sheet.columns = REPORT_COLUMNS.map((column, index) => ({ key: column.key, header: column.label, width: widths[index] }));
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).height = 60;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: REPORT_COLUMNS.length } };
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
  for (const source of rows) {
    const row = sheet.addRow(Object.fromEntries(REPORT_COLUMNS.map(column => [column.key, excelValue(column.key, source[column.key])])));
    row.font = { name: 'Calibri', size: 11 };
    row.alignment = { vertical: 'top', wrapText: true };
    for (const [index, column] of REPORT_COLUMNS.entries()) {
      const cell = row.getCell(index + 1);
      if (dateKeys.has(column.key) && cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy';
      else if (identifierKeys.has(column.key)) cell.numFmt = '@';
    }
  }

  const sources = workbook.addWorksheet('Data sources', { views: [{ state: 'frozen', ySplit: 11 }] });
  sources.columns = [{ width: 16 }, { width: 48 }, { width: 120 }];
  sources.addRow(['PowerVision Systems Pvt Ltd - AMC report data sources']);
  sources.addRow(['Client', text(client) || 'All provided authorized clients']);
  sources.addRow(['Reporting month', text(month) || 'All provided reporting periods']);
  sources.addRow(['Report rows', rows.length]);
  sources.addRow(['Source rule', 'Submitted values come from stored FSR snapshots. Visit Date uses the entered paper FSR date when recorded, otherwise the digital submission date. Branch and asset details use recorded master data where a snapshot value is absent.']);
  sources.addRow(['Blank cells', 'Blank means not recorded or not yet submitted. A blank reading never means zero.']);
  sources.addRow(['Visit status', 'On-Time/Delayed is the recorded schedule result. Scheduled/In progress identifies an unfinished visit. The full branch acknowledgment state is available in the portal.']);
  sources.addRow(['FSR evidence', 'The FSR column confirms that the stamped FSR image is available in the authorized visit report. Images are not embedded in this workbook.']);
  sources.addRow(['Template terminology', 'The uploaded sample uses SLA; this application retains recorded OOW/Warranty values. Next Visit Due maps to the existing nextServiceDue field.']);
  sources.addRow([]);
  sources.addRow(['Excel column', 'Header', 'Source']);
  styleHeader(sources.getRow(11));
  for (const [index, column] of REPORT_COLUMNS.entries()) sources.addRow([sheet.getColumn(index + 1).letter, column.label, column.source]);
  sources.addRow([]);
  sources.addRow(['Additional FSR details', 'Technician identity, start/submission time, branch decisions, before/after photographs, severity, inventory usage and revision history remain available in the detailed portal report. The template has no separate columns for these details.']);
  sources.eachRow((row, index) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (index !== 11) row.font = { name: 'Calibri', size: 11, bold: index === 1 };
  });
  sources.autoFilter = { from: { row: 11, column: 1 }, to: { row: 11 + REPORT_COLUMNS.length, column: 3 } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
