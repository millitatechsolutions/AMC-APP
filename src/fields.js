// One structured entry per field displayed in section 12; phase readings are split.
const groups = {
  'Visit / Branch Identification': [
    ['branchCode','Branch Code','auto'],['siteAddress','Site Address','auto'],['region','Region','auto'],['vendor','AMC Vendor','auto'],['customerId','Customer ID','auto'],['month','Month','auto'],['visitDate','Visit Date','auto'],['lastVisitDate','Last Visit Date','auto'],['scheduleDate','Visit Schedule Date','auto'],['visitStatus','Visit Status','auto'],['visitPurpose','Visit Purpose',['AMC','CM','PM']],['nextServiceDue','Next Service Due','auto'],['fsrNumber','FSR Number','auto']
  ],
  'Asset / Genset Details': [
    ['placement','Genset Placement',['Ground Floor','Outside Branch','Basement','Rooftop']],['supplier','Genset Supplier','text'],['model','Genset Model','text'],['rating','Genset Rating (kVA)','number'],['engineSerial','Engine Serial Number','text'],['engineType','Engine Name & Type','text'],['oilFilter','Oil Filter Number','text'],['fuelFilter','Fuel Filter Number','text'],['waterFilter','Water Filter Number','text'],['airFilter','Air Filter Number','text'],['alternator','Alternator Model & Condition','text'],['avr','AVR Model','text'],['controlModule','Control Module Brand','text']
  ],
  'Service / Warranty Status': [
    ['lastServiceDate','Last Service Date (PM)','auto'],['lastServiceHours','Last Service Running Hour','auto'],['currentHours','Current Running Hour','number'],['pmRequired','Service Required (PM)','auto'],['installationYear','Installation Year','auto'],['warranty','Warranty Status','auto']
  ],
  'Engine & Cooling System Readings': [
    ['oilPressure','Lube Oil Pressure (Bar / PSI)','number'],['oilPressureUnit','Oil pressure unit',['Bar','PSI']],['oilSafety','Oil Pressure Safety',['Connected & Working','Not Working']],['oilLevel','Lube Oil Level',['Upto Level','Below Level']],['coolantTemp','Coolant Temperature (Centigrade)','number'],['coolantLevel','Coolant Level',['Upto Level','Below Level']],['coolantSafety','Coolant Temperature Safety',['Connected & Working','Not Working']],['radiatorCap','Radiator Cap',['Good','Average','Bad']],['radiatorCondition','Radiator & Hose Pipe Condition',['Good','Average','Bad']],['radiatorAverage','If Average','conditional'],['radiatorBad','If Bad','conditional'],['beltCondition','Fan & Dynamo Belt Condition',['Good','Average','Bad']]
  ],
  'Electrical / Load Readings': [
    ['rpm','RPM','number'],['frequency','Frequency (Hz)','number'],['loadCheck','Load Check',['Allowed','Not Allowed']],['loadBalance','Load',['Balanced','Unbalanced']],['totalLoad','Total Load (kW)','number'],['phase1','Phase 1 Load (Amp)','number'],['phase2','Phase 2 Load (Amp)','number'],['phase3','Phase 3 Load (Amp)','number']
  ],
  'Battery': [
    ['batteryModel','Battery Model','text'],['batteryVoltage','Battery Voltage','number'],['batteryStatus','Battery Status / Dry Battery Color Code','text'],['charger','Trickle Electrical Charger',['Connected & Working','Not Working']]
  ],
  'Panel / Enclosure': [['ats','ATS Panel Operational',['Yes','No']],['canopy','Canopy Condition',['Good','Average','Bad']]],
  'Issue / Job Management': [
    ['issue','Issue','text'],['complaintLogged','Complaint Lock (Logged on Here4you)',['Yes','No']],['complaintNumber','Complaint Number (Here4you)','conditional'],['cause','Cause','text'],['correctiveAction','Corrective Action','text'],['jobSummary','Job Summary','text'],['parts','Parts Replaced Details (if any)','text'],['partsHandedOver','Parts Handed Over to Customer',['Yes','No']],['repair','Repair','text'],['healthRemarks','Genset Health Remarks','text']
  ],
  'Sign-off / Closure': [
    ['customerRepresentative','Customer Representative','text'],['employeeCode','Customer Employee Code','text'],['fsrPhoto','Completed paper FSR image (signed / stamped)','attachment'],['callStatus','Call Status',['Open','Closed']]
  ],
  'Additional visit evidence': [['beforePhoto','Before Maintenance Photograph','attachment'],['afterPhoto','After Maintenance Photograph','attachment'],['severity','Issue Severity',['None','Low','Medium','High','Critical']]]
};
export const PAPER_FSR_TEMPLATE='PVS-FSR-V02';
// These additions transcribe the supplied blank paper form. Earlier reports remain readable;
// a blank optional paper field means not recorded, never an inferred successful check.
const paperFields=[];
const paper=(group,rows)=>paperFields.push(...rows.map(([key,label,type='text',help])=>({key,label,type,group,optional:true,template:PAPER_FSR_TEMPLATE,...(help?{help}:{})})));
paper('Paper FSR / Customer Details',[
 ['paperFsrNumber','Paper FSR number','text','Copy the number written on the uploaded FSR. The app also keeps its own digital FSR reference.'],
 ['paperVisitDate','Date written on paper FSR','date'],
 ['paperVisitProtocol','Paper visit protocol',['Parts Sale','FOC Service','Warranty','AMC','Other']],
 ['paperOtherProtocol','Other visit protocol details'],
 ['customerName','Customer name written on FSR'],
 ['customerAddress','Customer address written on FSR'],
 ['contactName','Contact name'],['contactNumber','Contact number'],
 ['gensetSerial','Genset serial number'],['alternatorSerial','Main alternator serial number'],
 ['engineModel','Engine model'],['startCount','Engine starts','number'],
 ['failureDiagnostics','Failure & diagnostics'],['customerComplaint','Complaint by customer']
]);
const travel=[];
for(let row=1;row<=2;row++)travel.push(
 [`serviceRepresentative${row}`,`Service representative ${row}`],
 [`pvsTimeOut${row}`,`Representative ${row} · PVS time out`,'time'],
 [`siteTimeIn${row}`,`Representative ${row} · Site time in`,'time'],
 [`siteTimeOut${row}`,`Representative ${row} · Site time out`,'time'],
 [`pvsTimeIn${row}`,`Representative ${row} · PVS time in`,'time'],
 [`vehicleNumber${row}`,`Representative ${row} · Vehicle number`],
 [`totalKilometres${row}`,`Representative ${row} · Total kilometres`,'number']
);
paper('Paper FSR / Service Travel',travel);
paper('Paper FSR / Additional Running Parameters',[
 ['running1Kva','Running row 1 · Measured kVA','number','The asset rated kVA remains recorded separately.'],
 ['acVoltage1','Running row 1 · AC voltage L1 (V)','number'],
 ['acVoltage2','Running row 1 · AC voltage L2 (V)','number'],
 ['acVoltage3','Running row 1 · AC voltage L3 (V)','number'],
 ['powerFactor','Running row 1 · Power factor','number'],
 ['dcVoltage','Running row 1 · DC voltage (V)','number']
]);
for(let row=2;row<=3;row++)paper(`Paper FSR / Running Parameters Row ${row}`,[
 [`running${row}Kva`,`Row ${row} · kVA`,'number'],[`running${row}Kw`,`Row ${row} · kW`,'number'],
 ...[1,2,3].map(phase=>[`running${row}AmpL${phase}`,`Row ${row} · AC current L${phase} (A)`,'number']),
 ...[1,2,3].map(phase=>[`running${row}VoltL${phase}`,`Row ${row} · AC voltage L${phase} (V)`,'number']),
 [`running${row}Rpm`,`Row ${row} · RPM`,'number'],[`running${row}Hz`,`Row ${row} · Frequency (Hz)`,'number'],
 [`running${row}PowerFactor`,`Row ${row} · Power factor`,'number'],[`running${row}DcVoltage`,`Row ${row} · DC voltage (V)`,'number'],
 [`running${row}OilPressure`,`Row ${row} · Oil pressure`,'number'],[`running${row}OilPressureUnit`,`Row ${row} · Oil pressure unit`,['Bar','PSI']],
 [`running${row}JwTemp`,`Row ${row} · Jacket water temperature (°C)`,'number']
]);
const checkOptions=['OK','NOT OK','N/A'];
const checks=(group,rows)=>paper(group,rows.map(([key,label])=>[key,label,checkOptions,'Copy the mark on the paper FSR. Leave blank if no result was recorded.']));
checks('Paper FSR / Electrical Checks',[
 ['electricalBatteryTerminals','Battery terminals'],['electricalBatteryElectrolyte','Battery electrolyte level'],
 ['electricalRotaryCharger','Dynamo / rotary charger output voltage'],['electricalStaticCharger','Static battery charger output voltage'],
 ['electricalBatteryCables','Battery cable size / connection'],['electricalCurrentStability','Three-phase AC current stability (balanced)'],
 ['electricalVoltageStability','Three-phase AC voltage stability (balanced)'],['electricalFrequencyStability','Frequency stability at load'],
 ['electricalNeutralEarthing','Neutral cable earthing / grounding'],['electricalSelfStarter','Self-starter engagement / connections'],
 ['electricalAlternatorBearing','Main alternator NDE bearing noise / balance'],['electricalPhaseConnections','Three-phase cable connection looseness']
]);
checks('Paper FSR / Safety Protection',[
 ['safetyJacketWater','Jacket water temperature protection'],['safetyLowOilPressure','Low oil pressure protection'],
 ['safetyLowWater','Low water level protection'],['safetyLowFuel','Low fuel level protection'],
 ['safetyBatteryCharger','Battery charger protection'],['safetyEmergencyStop','Emergency stop']
]);
checks('Paper FSR / Mechanical Checks',[
 ['mechanicalHousekeeping','Housekeeping'],['mechanicalAirVentilation','Air ventilation'],['mechanicalFanBelt','Fan belt'],
 ['mechanicalRadiatorFan','Radiator fan'],['mechanicalUpperHose','Upper hose pipe'],['mechanicalLowerHose','Lower hose pipe'],
 ['mechanicalBreatherPipe','Breather pipe'],['mechanicalRadiatorMounts','Radiator mounts'],['mechanicalEngineMounts','Engine mounts'],
 ['mechanicalAlternatorMounts','Alternator mounts'],['mechanicalEngineNoise','Engine noise'],['mechanicalEngineVibration','Engine vibration']
]);
checks('Paper FSR / Fluid Level Checks',[
 ['fluidCoolantCheck','Coolant level · paper OK / NOT OK'],['fluidEngineOilCheck','Engine oil level · paper OK / NOT OK']
]);
checks('Paper FSR / Leakage Checks',[
 ['leakTappetCover','Tappet cover gasket'],['leakFrontOilSeal','Front oil seal'],['leakRearOilSeal','Rear oil seal / main seal'],
 ['leakTurboInlet','Turbo inlet pipe'],['leakTurboOutlet','Turbo outlet pipe'],['leakOilSump','Oil sump gasket'],
 ['leakTimingPlate','Front timing plate gasket'],['leakWaterBody','Water body gasket'],['leakRadiator','Radiator leakage'],
 ['leakFuelPump','Fuel pump leakage'],['leakFuelPipe','Fuel pipe leakage'],['leakFuelNozzles','Fuel nozzle leakage']
]);
paper('Paper FSR / Filter Details',[
 ['oilFilterQuantity','Oil filter quantity','number'],
 ['fuelFilterPrimary','Fuel filter (primary) · Part number'],['fuelFilterPrimaryQuantity','Fuel filter (primary) · Quantity','number'],
 ['fuelFilterSecondary','Fuel filter (secondary) · Part number'],['fuelFilterSecondaryQuantity','Fuel filter (secondary) · Quantity','number'],
 ['waterSeparator','Water separator · Part number'],['waterSeparatorQuantity','Water separator · Quantity','number'],
 ['airFilterPrimary','Air filter (primary) · Part number'],['airFilterPrimaryQuantity','Air filter (primary) · Quantity','number'],
 ['airFilterSecondary','Air filter (secondary) · Part number'],['airFilterSecondaryQuantity','Air filter (secondary) · Quantity','number'],
 ['oilSumpCapacity','Oil sump capacity (litres)','number'],['paperLastPmDate','Last PM date written on FSR','date'],
 ['paperLastPmHours','Last PM running hours written on FSR','number']
]);
const paperParts=[];
for(let row=1;row<=10;row++)paperParts.push(
 [`paperPart${row}Description`,`Paper spare part ${row} · Description`,'text','Transcription only. Select materials in tracked inventory usage as well to record stock consumption.'],
 [`paperPart${row}Quantity`,`Paper spare part ${row} · Quantity`,'number']
);
paper('Paper FSR / Spare Parts Consumed',paperParts);
paper('Paper FSR / Service & Signatures',[
 ['paperServiceDetail','Service detail'],['paperActionTaken','Action taken written on FSR'],['customerComments','Customer comments'],
 ['customerSignatory','Customer signatory name'],['serviceTechnicianSignatory','Service technician (PVS) signatory name'],
 ['followUp','Follow-up required',['Yes','No']],
 ['customerSignature','Customer signature image (optional)','attachment','The completed paper FSR image remains the primary signed evidence.'],
 ['technicianSignature','Service technician signature image (optional)','attachment']
]);
export const fields = [...Object.entries(groups).flatMap(([group, rows]) => rows.map(([key,label,type])=>({key,label,type,group}))),...paperFields];
export function validateFields(input, {partial=false}={}) {
  const errors=[];
  for (const f of fields) {
    if (f.type==='auto') continue;
    let required=!f.optional;
    if(f.key==='radiatorAverage') required=input.radiatorCondition==='Average';
    if(f.key==='radiatorBad') required=input.radiatorCondition==='Bad';
    if(f.key==='complaintNumber') required=input.complaintLogged==='Yes';
    const value=input[f.key];
    if((partial || !required) && (value===undefined || value===null || value===''))continue;
    if(required && (value===undefined || value===null || String(value).trim()==='')) { errors.push(`${f.label} is required`); continue; }
    if(typeof value!=='string' && typeof value!=='number'){errors.push(`${f.label} must be a text or numeric value`);continue;}
    if(f.type==='attachment' && typeof value!=='string'){errors.push(`${f.label} must be a JPEG, PNG or WebP image`);continue;}
    if(value!==undefined && value!=='' && f.type==='number' && (typeof value==='string'&&!value.trim() || !Number.isFinite(Number(value)) || Number(value)<0)) errors.push(`${f.label} must be a non-negative number`);
    if(value!==undefined && value!=='' && f.type==='date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value))errors.push(`${f.label} must be a valid date (YYYY-MM-DD)`);
    if(value!==undefined && value!=='' && f.type==='time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)))errors.push(`${f.label} must be a valid time (HH:MM)`);
    if(value!==undefined && value!=='' && (f.key==='powerFactor' || /^running[23]PowerFactor$/.test(f.key)) && Number(value)>1)errors.push(`${f.label} must be between 0 and 1`);
    if(Array.isArray(f.type) && !f.type.includes(value)) errors.push(`${f.label} has an invalid selection`);
    if(f.type==='attachment' && value) {
      const match=String(value).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      const bytes=match ? Buffer.from(match[2],'base64') : Buffer.alloc(0);
      const valid=match && (match[1]==='png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || match[1]==='jpeg' && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 || match[1]==='webp' && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP');
      if(!valid)errors.push(`${f.label} must be a JPEG, PNG or WebP image`);
      if(bytes.length>2*1024*1024)errors.push(`${f.label} must be at most 2 MB`);
    }
    if(typeof value==='string' && f.type!=='attachment' && value.length>4000) errors.push(`${f.label} is too long`);
  }
  return errors;
}
