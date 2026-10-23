import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore, users } from './store.js';
import { createAuth } from './auth.js';
import { fields } from './fields.js';
import { createAmcWorkbook } from './amc-report.js';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const portals=['powervision','ubl','technician'];
const cookieName=portal=>`amc_${portal}_session`;
const loginPage=portal=>portal==='technician'?'/technician/login':`/${portal}`;
const appPage=portal=>portal==='technician'?'/technician/':`/${portal}/app`;
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const cookie=(req,name)=>req.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1);

// demoMode is an explicit test-fixture option. The executable never enables it.
export function createApp({dbPath=process.env.AMC_DB_PATH??fileURLToPath(new URL('../data/amc.sqlite',import.meta.url)),demoMode=false}={}) {
 const store=createStore(dbPath),auth=createAuth(store.db),demoSessions=new Map();
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const body=async(req,maximum=18*1024*1024)=>{
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>maximum)fail(`Request exceeds ${Math.floor(maximum/1024)} KB`,413);chunks.push(chunk);}
  let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{fail('Invalid JSON',400);}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('Send a JSON object',400);
  return parsed;
 };
 const setSessionCookie=(req,res,portal,token)=>res.setHeader('Set-Cookie',`${cookieName(portal)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.socket.encrypted?'; Secure':''}`);
 const clearSessionCookie=(req,res,portal)=>res.setHeader('Set-Cookie',`${cookieName(portal)}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${req.socket.encrypted?'; Secure':''}`);
 const portalUser=(req,portal)=>auth.session(cookie(req,cookieName(portal)),portal);
 const anyPortalUser=req=>portals.map(portal=>portalUser(req,portal)).find(Boolean);
 const requirePortalUser=(req,portal)=>{
  const user=portalUser(req,portal);
  if(!user)fail(anyPortalUser(req)?'Your account cannot access this portal':'Sign in to your portal to continue',anyPortalUser(req)?403:401);
  return user;
 };
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob: https://server.arcgisonline.com https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
   const host=new URL(`http://${req.headers.host||'localhost'}`).hostname;
   if(!['127.0.0.1','localhost','[::1]'].includes(host))return json(res,403,{error:'This local workspace accepts only localhost requests'});
   const url=new URL(req.url,`http://${req.headers.host}`);let path=url.pathname;
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${req.socket.encrypted?'https':'http'}://${req.headers.host}`)return json(res,403,{error:'Origin denied'});
   if(path==='/api/health'&&req.method==='GET')return json(res,200,{status:'ok',mode:'synthetic-demo',authentication:demoMode?'test-fixtures':'accounts',client:'UBL'});
   if(path.startsWith('/api/auth/')){
    if(path==='/api/auth/status'&&req.method==='GET')return json(res,200,auth.status());
    if(req.method!=='POST')return json(res,404,{error:'Endpoint not found'});
    const input=await body(req,64*1024);
    if(path==='/api/auth/bootstrap'){
     const user=await auth.bootstrap(input);
     const session=await auth.login({portal:'powervision',email:user.email,password:input.password},{ip:req.socket.remoteAddress});
     setSessionCookie(req,res,'powervision',session.token);
     return json(res,201,{user,redirectTo:appPage('powervision')});
    }
    if(path==='/api/auth/login'){
     const session=await auth.login(input,{ip:req.socket.remoteAddress});
     setSessionCookie(req,res,session.user.portal,session.token);
     return json(res,200,{user:session.user,redirectTo:appPage(session.user.portal)});
    }
    if(path==='/api/auth/invitation')return json(res,200,auth.invitation(input));
    if(path==='/api/auth/activate'){
     const user=await auth.activate(input);
     return json(res,200,{user,redirectTo:loginPage(user.portal)});
    }
    if(path==='/api/auth/logout'){
     if(!portals.includes(input.portal))fail('Choose a valid portal');
     auth.logout(cookie(req,cookieName(input.portal)));clearSessionCookie(req,res,input.portal);
     return json(res,200,{signedOut:true});
    }
    if(path==='/api/auth/password'){
     if(!portals.includes(input.portal))fail('Choose a valid portal');
     const user=requirePortalUser(req,input.portal);
     await auth.changePassword(user,input);clearSessionCookie(req,res,input.portal);
     return json(res,200,{passwordChanged:true,redirectTo:loginPage(input.portal)});
    }
    return json(res,404,{error:'Endpoint not found'});
   }
   if(path.startsWith('/api/')){
    let portal=null,user;
    const namespace=path.match(/^\/api\/(powervision|ubl|technician)\/(.*)$/);
    if(namespace){portal=namespace[1];path='/api/'+namespace[2];}
    const legacy=demoMode&&(!namespace||portal==='technician');
    if(!demoMode&&['/api/demo-users','/api/session'].includes(path))return json(res,404,{error:'Endpoint not found'});
    if(legacy&&path==='/api/demo-users'&&req.method==='GET')return json(res,200,users);
    if(legacy&&path==='/api/session'&&req.method==='POST'){
     const input=await body(req,64*1024),selected=users.find(account=>account.id===input.userId);
     if(portal==='technician'&&selected?.role!=='technician')return json(res,403,{error:'Choose an assigned technician account'});
     if(!selected)return json(res,400,{error:'Unknown demo user'});
     const token=randomUUID();demoSessions.set(token,{user:selected,expires:Date.now()+8*3600000});
     res.setHeader('Set-Cookie',`${portal==='technician'?'amc_technician_session':'amc_session'}=${token}; HttpOnly; SameSite=Strict; Path=${portal==='technician'?'/api/technician':'/'}; Max-Age=28800`);
     return json(res,200,selected);
    }
    if(!namespace&&!legacy)return json(res,404,{error:'Endpoint not found'});
    if(portal)user=portalUser(req,portal);
    if(!user&&legacy){
     const token=cookie(req,portal==='technician'?'amc_technician_session':'amc_session'),session=demoSessions.get(token);
     if(session?.expires>Date.now())user=session.user;
     if(user&&portal==='technician'&&user.role!=='technician')fail('Technician access required',403);
     if(path==='/api/session'&&req.method==='DELETE'&&user){demoSessions.delete(token);res.setHeader('Set-Cookie',`${portal==='technician'?'amc_technician_session':'amc_session'}=; HttpOnly; SameSite=Strict; Path=${portal==='technician'?'/api/technician':'/'}; Max-Age=0`);return json(res,200,{signedOut:true});}
    }
    if(!user){if(portal)user=requirePortalUser(req,portal);else fail('Select a demo workspace to continue',401);}
    if(path==='/api/accounts'&&req.method==='GET')return json(res,200,auth.administration(user));
    if(path==='/api/accounts'&&req.method==='POST')return json(res,201,auth.createAccount(user,await body(req,64*1024)));
    const accountAction=path.match(/^\/api\/accounts\/([^/]+)\/action$/);
    if(accountAction&&req.method==='POST')return json(res,200,auth.accountAction(user,decodeURIComponent(accountAction[1]),await body(req,64*1024)));
    if(path==='/api/technicians'&&req.method==='GET'){
     if(user.portal!=='powervision'||!user.admin)fail('PowerVision administrator access required',403);
     return json(res,200,{technicians:auth.accounts(user).filter(account=>account.portal==='technician'&&account.status==='active')});
    }
    const assignment=path.match(/^\/api\/visits\/([^/]+)\/assign$/);
    if(assignment&&req.method==='POST')return json(res,200,store.assignTechnician(user,decodeURIComponent(assignment[1]),await body(req,64*1024)));
    if(path==='/api/inventory/items'&&req.method==='POST')return json(res,201,store.createInventoryItem(user,await body(req,64*1024)));
    if(path==='/api/inventory/receipts'&&req.method==='POST')return json(res,201,store.receiveInventory(user,await body(req,64*1024)));
    const draftPath=path.match(/^\/api\/visits\/([^/]+)\/draft$/);
    if(draftPath&&req.method==='GET')return json(res,200,store.draft(user,decodeURIComponent(draftPath[1])));
    if(draftPath&&req.method==='POST')return json(res,200,store.saveDraft(user,decodeURIComponent(draftPath[1]),await body(req)));
    const startPath=path.match(/^\/api\/visits\/([^/]+)\/start$/);
    if(startPath&&req.method==='POST'){await body(req,64*1024);return json(res,200,store.start(user,decodeURIComponent(startPath[1])));}
    const verificationPath=path.match(/^\/api\/visits\/([^/]+)\/verify$/);
    if(verificationPath&&req.method==='POST')return json(res,201,store.verify(user,decodeURIComponent(verificationPath[1]),await body(req,64*1024)));
    if(req.method==='GET'){
     if(path==='/api/amc-report'||path==='/api/amc-report.xlsx'){
      const options={};if(url.searchParams.has('month'))options.month=url.searchParams.get('month');if(url.searchParams.has('client'))options.client=url.searchParams.get('client');
      const report=store.amcReport(user,options);
      if(path==='/api/amc-report')return json(res,200,report);
      const workbook=await createAmcWorkbook(report.rows,{month:report.month,client:report.client});
      res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="amc-report-${report.month}-${report.client}.xlsx"`,'Cache-Control':'no-store'});return res.end(workbook);
     }
     const report=path.match(/^\/api\/visits\/([^/]+)\/report$/);if(report)return json(res,200,store.report(user,decodeURIComponent(report[1])));
     const history=path.match(/^\/api\/visits\/([^/]+)\/history$/);if(history)return json(res,200,store.history(user,decodeURIComponent(history[1])));
     if(path==='/api/me')return json(res,200,user);
     if(path==='/api/fields')return json(res,200,fields);
     if(path==='/api/inventory')return json(res,200,store.inventory(user));
     if(path==='/api/inventory/catalogue')return json(res,200,store.inventoryCatalogue(user));
     if(path==='/api/map-config')return json(res,200,{googleMapsKey:process.env.GOOGLE_MAPS_BROWSER_KEY??'',mapId:process.env.GOOGLE_MAPS_MAP_ID??''});
     if(path==='/api/visits')return json(res,200,store.visible(user).map(visit=>url.searchParams.get('summary')==='1'?{...visit,fsr:visit.fsr?{fsrNumber:visit.fsr.fsrNumber,submittedAt:visit.fsr.submittedAt}:null}:visit));
     const detail=path.match(/^\/api\/visits\/([^/]+)$/);if(detail)return json(res,200,store.get(user,decodeURIComponent(detail[1])));
     if(path==='/api/assets')return json(res,200,store.assets(user));
     if(path==='/api/audit')return json(res,200,store.audit(user));
     if(path==='/api/payments')return json(res,200,store.payments(user,url.searchParams.get('month')));
     if(path==='/api/export.csv'){
      const rows=store.payments(user,url.searchParams.get('month')),keys=['visitId','fsrId','branchCode','assetId','vendor','month','warranty','status','eligible','rate','payable','acknowledgedBy','acknowledgedAt'];
      const cell=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
      res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="amc-payment-statement.csv"','Cache-Control':'no-store'});return res.end([keys.join(','),...rows.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n'));
     }
    }
    const action=path.match(/^\/api\/visits\/([^/]+)\/(submit|review)$/);
    if(action&&req.method==='POST'){const input=await body(req),id=decodeURIComponent(action[1]);return json(res,200,action[2]==='submit'?store.submit(user,id,input):store.review(user,id,input.decision,input.reason));}
    return json(res,404,{error:'Endpoint not found'});
   }
   if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
   const publicPages=['/','/powervision','/powervision/','/ubl','/ubl/','/technician/login','/technician/login/','/setup','/setup/','/activate','/activate/'];
   let file;
   if(publicPages.includes(path))file='access/index.html';
   const privatePortal=path==='/powervision/app'?'powervision':path==='/ubl/app'?'ubl':['/technician','/technician/'].includes(path)?'technician':null;
   if(privatePortal){
    if(!portalUser(req,privatePortal)){
     if(anyPortalUser(req)){res.writeHead(403,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portal access restricted</title><body><main><h1>This portal is restricted</h1><p>Your account has access to its assigned portal. Sign in with an authorized account to continue.</p><p><a href="'+loginPage(privatePortal)+'">Open portal sign-in</a> · <a href="/">Choose your portal</a></p></main></body></html>');}
     res.writeHead(303,{Location:loginPage(privatePortal),'Cache-Control':'no-store'});return res.end();
    }
    if(path==='/technician'){res.writeHead(308,{Location:'/technician/','Cache-Control':'no-store'});return res.end();}
    file=privatePortal==='technician'?'technician/index.html':'index.html';
   }
   const files={'/app.js':'app.js','/styles.css':'styles.css','/branch-map.js':'branch-map.js','/branch-map.geojson':'branch-map.geojson','/overview.js':'../shared/overview.js','/access/app.js':'access/app.js','/access/styles.css':'access/styles.css','/brand/powervision-logo.png':'brand/powervision-logo.png','/brand/ubl-logo.svg':'brand/ubl-logo.svg'};
   for(const name of ['app.js','styles.css','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','sw.js'])files['/technician/'+name]='technician/'+name;
   for(const name of ['leaflet.js','leaflet.css','leaflet.js.map','LICENSE'])files['/vendor/leaflet/'+name]='vendor/leaflet/'+name;
   for(const name of ['marker-icon.png','marker-icon-2x.png','marker-shadow.png','layers.png','layers-2x.png'])files['/vendor/leaflet/images/'+name]='vendor/leaflet/images/'+name;
   if(!file)file=files[path];if(!file)return json(res,404,{error:'Not found'});
   res.setHeader('Cache-Control',privatePortal?'no-store':'no-cache');
   const data=await readFile(resolve(root,file));
   res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.map')?'application/json':file.endsWith('.geojson')?'application/geo+json':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('/LICENSE')?'text/plain':'text/html; charset=utf-8'});res.end(data);
  }catch(error){json(res,error.status??500,{error:error.status?error.message:'Internal server error'});if(!error.status)console.error(error.message);}
 });
 server.on('close',()=>store.close());return {server,store,auth};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3000);
 if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('This local workspace requires loopback binding. Configure reviewed HTTPS hosting before shared deployment.');
 const {server}=createApp();server.listen(port,host,()=>console.log(`PowerVision / UBL AMC workspace listening on ${host}:${port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
