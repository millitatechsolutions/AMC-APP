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
    ['customerRepresentative','Customer Representative','text'],['employeeCode','Customer Employee Code','text'],['fsrPhoto','Stamped FSR Photograph','attachment'],['callStatus','Call Status',['Open','Closed']]
  ],
  'Additional visit evidence': [['beforePhoto','Before Maintenance Photograph','attachment'],['afterPhoto','After Maintenance Photograph','attachment'],['severity','Issue Severity',['None','Low','Medium','High','Critical']]]
};
export const fields = Object.entries(groups).flatMap(([group, rows]) => rows.map(([key,label,type])=>({key,label,type,group})));
export function validateFields(input, {partial=false}={}) {
  const errors=[];
  for (const f of fields) {
    if (f.type==='auto') continue;
    let required=true;
    if(f.key==='radiatorAverage') required=input.radiatorCondition==='Average';
    if(f.key==='radiatorBad') required=input.radiatorCondition==='Bad';
    if(f.key==='complaintNumber') required=input.complaintLogged==='Yes';
    const value=input[f.key];
    if(partial && (value===undefined || value===null || value===''))continue;
    if(required && (value===undefined || value===null || String(value).trim()==='')) { errors.push(`${f.label} is required`); continue; }
    if(value!==undefined && value!=='' && f.type==='number' && (!Number.isFinite(Number(value)) || Number(value)<0)) errors.push(`${f.label} must be a non-negative number`);
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
