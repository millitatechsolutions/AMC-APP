# AMC Excel report: template and data sources

The export follows row 1 of the supplied **Report Format AMC.xlsx**: 69 columns, in the original A:BQ order, with the original header wording. It reports authorized application records; it does not import the sample UBL branch, vendors, employees, dates or measurements as live data. Registered portals export only their authorized UBL records.

## What the supplied workbook contains

- One visible worksheet, `Sheet1`, covering A1:BQ20, with 276 populated cells and 84 merged ranges.
- Row 1 is the flat report header. Row 2 is a near-complete UBL sample. Rows 3–10 contain sparse alternative examples and choices. Rows 12–20 contain merged explanatory notes.
- The original headers use Calibri 11, bold, with a light-blue fill. Column widths vary from about 6 to 44 characters. Sample dates mix text and Excel date values.
- There are no formulas, embedded photographs, hyperlinks, Excel tables, dropdown validations or conditional-formatting rules. The merged guidance block is not a set of report records.

## Export behavior

The first worksheet, **AMC Report**, has the 69 original headers and one row per supplied authorized visit, including scheduled visits. It freezes the header, provides filters, retains comparable column widths, and writes valid recorded dates as Excel dates in `dd/mm/yyyy` format. Recorded numeric measurements remain numbers, including real zero readings. Identifiers remain text so leading zeros and long reference numbers are preserved. Entered text is written as string cells, never as executable Excel formulas.

Unsubmitted readings are blank. Starting a visit does not invent a visit date, FSR number, job result or measurements. A scheduled visit with a start timestamp is shown as **In progress**. For submitted records, Visit Status is the saved On-Time/Delayed schedule result; branch acknowledgment is a different workflow state and remains available in the portal.

The second worksheet, **Data sources**, includes the selected client and month, row count, source rules and the complete column mapping. The supplied template spelling is intentional: `GensetModel`, `Compliant Lock`, and the leading space before ` Visit Date` are retained for compatibility.

## Source precedence and gaps

- Submitted FSR values take precedence. When an identification or asset-master value is absent, the documented visit/asset fallback may supply that value. Readings and technician observations have no master-data fallback.
- Export does not recalculate historical PM decisions, dates, warranty or schedule results, and does not generate new customer IDs or FSR references.
- **Visit Date** uses the date explicitly entered from the paper FSR (`paperVisitDate`) when available. Otherwise it uses the existing digital FSR date (`visitDate`, recorded at submission). This export preference does not change submission timestamps or stored workflow dates.
- **Next Visit Due** maps to the existing `nextServiceDue` property, which currently stores the next monthly visit date. It is not a new calculated PM service appointment.
- **Warranty Status** retains recorded `Warranty` or `OOW`. The reference workbook uses `SLA` in one example; the exporter does not silently relabel an existing contractual status or infer mixed coverage.
- **Lube Oil Pressure** combines the saved pressure and its saved unit. If the unit was never recorded, the value is displayed without an invented unit.
- **Load per Phase 1/2/3 (Amp)** combines the three independently recorded phase readings. A missing phase is labelled `Not recorded`; if all three are absent, the cell stays blank.
- **FSR** contains the digital FSR reference followed by `Image available in portal` only when a stamped image is recorded. Images, image paths, base64 content and local server URLs are not embedded or exposed in the spreadsheet. Authorized users view the original evidence in the detailed portal report.
- Radiator cap, coolant level, canopy and safety option wording in the sample differs from some current application options. Export retains actual saved observations; it does not turn Good into Installed or invent a changed coolant level. The sample says both Closed and Resolved for complaint closure; export retains the actual `callStatus`.
- Technician identity, start/submission timestamps, customer/branch decisions, before/after evidence, severity, stock usage and immutable revisions remain in the full portal report because the template has no separate columns for them.
- Additional optional `PVS-FSR-V02` paper-form fields, including the separately entered paper FSR number, remain in the detailed FSR. The documented Visit Date preference is the only paper-form override of the original core mappings in this 69-column format.
- The reference workbook is UBL-labelled and includes sample personal/vendor details. It supplies a format only; a UBL export must use actual UBL records from the application. A missing actual master record must remain missing instead of being filled with a sample.

## Column mapping

| Excel | Original header | Application source |
| --- | --- | --- |
| A | Branch Code | visit.fsr.branchCode, otherwise visit.branchCode or asset.branchCode |
| B | Site Address | visit.fsr.siteAddress, otherwise visit.siteAddress or asset.siteAddress |
| C | Region | visit.fsr.region, otherwise visit.region or asset.region |
| D | AMC Vendor | visit.fsr.vendor, otherwise visit.vendor or asset.vendor |
| E | Customer ID | visit.fsr.customerId, otherwise asset.customerId if explicitly recorded; never generated during export |
| F | Month | visit.fsr.month, otherwise visit.month (stored reporting period, including year) |
| G |  Visit Date | visit.fsr.paperVisitDate (date entered from the paper FSR), otherwise visit.fsr.visitDate (digital submission-date fallback); blank until recorded |
| H | Last Visit Date | visit.fsr.lastVisitDate, otherwise asset.lastVisitDate |
| I | Visit Schedule Date | visit.fsr.scheduleDate, otherwise visit.dueDate |
| J | Visit Status | visit.fsr.visitStatus for submitted FSRs; otherwise the current visit status, with started scheduled visits shown as In progress |
| K | Visit Purpose | visit.fsr.visitPurpose (submitted FSR snapshot; blank until recorded) |
| L | Next Visit Due | visit.fsr.nextServiceDue (the existing field stores the next monthly visit date) |
| M | FSR Number | visit.fsr.fsrNumber (submitted FSR snapshot; blank until recorded) |
| N | Genset Placement | visit.fsr.placement, otherwise asset.placement if recorded |
| O | Genset Supplier | visit.fsr.supplier, otherwise asset.supplier if recorded |
| P | GensetModel | visit.fsr.model, otherwise asset.model |
| Q | Genset Rating (kVA) | visit.fsr.rating, otherwise asset.rating |
| R | Engine Serial Number | visit.fsr.engineSerial, otherwise asset.engineSerial; exported as text to preserve identifiers |
| S | Engine Name & Type | visit.fsr.engineType, otherwise asset.engineType if recorded |
| T | Oil Filter Number | visit.fsr.oilFilter, otherwise asset.oilFilter if recorded |
| U | Fuel Filter Number | visit.fsr.fuelFilter, otherwise asset.fuelFilter if recorded |
| V | Water Filter Number | visit.fsr.waterFilter, otherwise asset.waterFilter if recorded |
| W | Air Filter Number | visit.fsr.airFilter, otherwise asset.airFilter if recorded |
| X | Alternator Model & Condition | visit.fsr.alternator, otherwise asset.alternator if recorded |
| Y | AVR Model | visit.fsr.avr, otherwise asset.avr if recorded |
| Z | Control Module Brand | visit.fsr.controlModule, otherwise asset.controlModule if recorded |
| AA | Last Service Date (PM) | visit.fsr.lastServiceDate, otherwise asset.lastServiceDate |
| AB | Last Service Running Hour | visit.fsr.lastServiceHours, otherwise asset.lastServiceHours |
| AC | Current Running Hour | visit.fsr.currentHours (submitted FSR snapshot; blank until recorded) |
| AD | Service Required (PM) | visit.fsr.pmRequired (the stored submission-time result; not recalculated during export) |
| AE | Installation Year | visit.fsr.installationYear, otherwise asset.installationYear |
| AF | Warranty Status | visit.fsr.warranty, otherwise visit.warranty or asset.warranty; the recorded Warranty/OOW value is retained |
| AG | Lube Oil Pressure (Bar / PSI) | visit.fsr.oilPressure combined with visit.fsr.oilPressureUnit; a missing pressure remains blank |
| AH | Oil pressure Safety (Connected & Working) | visit.fsr.oilSafety (submitted FSR snapshot; blank until recorded) |
| AI | Lube Oil Level | visit.fsr.oilLevel (submitted FSR snapshot; blank until recorded) |
| AJ | Coolant Temperature (Centigrade) | visit.fsr.coolantTemp (submitted FSR snapshot; blank until recorded) |
| AK | Coolant Level | visit.fsr.coolantLevel (submitted FSR snapshot; blank until recorded) |
| AL | Coolant Temperature safety (Connected & Working) | visit.fsr.coolantSafety (submitted FSR snapshot; blank until recorded) |
| AM | Radiator Cap | visit.fsr.radiatorCap (submitted FSR snapshot; blank until recorded) |
| AN | Radiator & hose pipe condition | visit.fsr.radiatorCondition (submitted FSR snapshot; blank until recorded) |
| AO | If Average | visit.fsr.radiatorAverage (submitted FSR snapshot; blank until recorded) |
| AP | If Bad | visit.fsr.radiatorBad (submitted FSR snapshot; blank until recorded) |
| AQ | Fan & Dynamo Belt Condition | visit.fsr.beltCondition (submitted FSR snapshot; blank until recorded) |
| AR | RPM | visit.fsr.rpm (submitted FSR snapshot; blank until recorded) |
| AS | Frequency | visit.fsr.frequency (submitted FSR snapshot; blank until recorded) |
| AT | Load Check | visit.fsr.loadCheck (submitted FSR snapshot; blank until recorded) |
| AU | Load | visit.fsr.loadBalance (submitted FSR snapshot; blank until recorded) |
| AV | Total Load (kW) | visit.fsr.totalLoad (submitted FSR snapshot; blank until recorded) |
| AW | Load per Phase 1/2/3 (Amp) | visit.fsr.phase1 / visit.fsr.phase2 / visit.fsr.phase3, in phase order; a missing phase is shown as Not recorded |
| AX | Battery Model | visit.fsr.batteryModel (submitted FSR snapshot; blank until recorded) |
| AY | Battery Voltage | visit.fsr.batteryVoltage (submitted FSR snapshot; blank until recorded) |
| AZ | Battery Status (If Dry Battery (Mention Color Code) | visit.fsr.batteryStatus (submitted FSR snapshot; blank until recorded) |
| BA | Trickle Electrical Charger | visit.fsr.charger (submitted FSR snapshot; blank until recorded) |
| BB | ATS Panel Operational | visit.fsr.ats (submitted FSR snapshot; blank until recorded) |
| BC | Canopy Condition | visit.fsr.canopy (submitted FSR snapshot; blank until recorded) |
| BD | Issue | visit.fsr.issue (submitted FSR snapshot; blank until recorded) |
| BE | Compliant Lock | visit.fsr.complaintLogged (submitted FSR snapshot; blank until recorded) |
| BF | Complain Number (Here4you) | visit.fsr.complaintNumber (submitted FSR snapshot; blank until recorded) |
| BG | Cause | visit.fsr.cause (submitted FSR snapshot; blank until recorded) |
| BH | Corrective Action | visit.fsr.correctiveAction (submitted FSR snapshot; blank until recorded) |
| BI | Job Summary | visit.fsr.jobSummary (submitted FSR snapshot; blank until recorded) |
| BJ | Parts Replaced Details (if any) | visit.fsr.parts (submitted FSR snapshot; blank until recorded) |
| BK | Parts Handed Over to Customer | visit.fsr.partsHandedOver (submitted FSR snapshot; blank until recorded) |
| BL | Repair | visit.fsr.repair (submitted FSR snapshot; blank until recorded) |
| BM | Genset Health Remarks | visit.fsr.healthRemarks (submitted FSR snapshot; blank until recorded) |
| BN | Customer Representative | visit.fsr.customerRepresentative (submitted FSR snapshot; blank until recorded) |
| BO | Customer Employee Code | visit.fsr.employeeCode (submitted FSR snapshot; blank until recorded); this is the customer representative's code, not the technician's employee ID |
| BP | FSR | visit.fsr.fsrNumber plus Image available in portal when visit.fsr.fsrPhoto exists; the attachment remains in the authorized visit report |
| BQ | Call Status | visit.fsr.callStatus (recorded Open/Closed complaint status; separate from branch acknowledgment) |

## JavaScript interface

`REPORT_COLUMNS` exports 69 `{ key, label, source }` objects. `buildAmcRows(reports)` accepts authorized `store.report()` objects containing `visit`, `asset`, and optional client metadata. It returns flat JSON-safe rows with all report keys and the additional `visitId`, `assetId`, `client`, and `status` metadata. Dates remain ISO date strings in the JSON response.

`createAmcWorkbook(rows, { month, client })` returns a Promise of an XLSX `Buffer`. Authorization and visit/client/month filtering belong to the caller and occur before projection; the workbook writer never reads or broadens store access.

The main column keys match the existing FSR keys except `phaseLoad` for the combined three phases and `fsrEvidence` for the stamped-image reference. `oilPressure` is combined with its unit for this report only. Extra row metadata does not create extra Excel columns.
