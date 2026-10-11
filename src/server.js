import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore, users } from './store.js';
import { fields } from './fields.js';
const root=fileURLToPath(new URL('../public/',import.meta.url));
export function createApp({dbPath=process.env.AMC_DB_PATH??fileURLToPath(new URL('../data/amc.sqlite',import.meta.url))}={}) {
 const store=createStore(dbPath),sessions=new Map();
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const body=async req=>{let text='';for await (const chunk of req) {text+=chunk;if(Buffer.byteLength(text)>12*1024*1024)throw Object.assign(new Error('Request exceeds 12 MB'),{status:413});}try{return JSON.parse(text||'{}');}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob: https://server.arcgisonline.com https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
   const url=new URL(req.url,'http://localhost');let path=url.pathname;
   const technicianRequest=path.startsWith('/api/technician/');
   if(technicianRequest)path='/api/'+path.slice('/api/technician/'.length);
   if(path.startsWith('/api/')) {
    if(!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Origin denied'});
    if(path==='/api/health' && req.method==='GET')return json(res,200,{status:'ok',mode:'synthetic-demo'});
    if(path==='/api/demo-users' && req.method==='GET')return json(res,200,users);
    if(path==='/api/session' && req.method==='POST') {
     const input=await body(req),user=users.find(u=>u.id===input.userId);if(technicianRequest&&user?.role!=='technician')return json(res,403,{error:'Choose an assigned technician account'});if(!user)return json(res,400,{error:'Unknown demo user'});
     const token=randomUUID();sessions.set(token,{user,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`${technicianRequest?'amc_technician_session':'amc_session'}=${token}; HttpOnly; SameSite=Strict; Path=${technicianRequest?'/api/technician':'/'}; Max-Age=28800`);return json(res,200,user);
    }
    const cookieName=technicianRequest?'amc_technician_session':'amc_session';
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1),session=sessions.get(token);
    if(!session || session.expires<Date.now())return json(res,401,{error:'Select a demo workspace to continue'});
    const user=session.user;
    if(technicianRequest&&user.role!=='technician')return json(res,403,{error:'Technician access required'});
    if(path==='/api/session'&&req.method==='DELETE'){sessions.delete(token);res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=${technicianRequest?'/api/technician':'/'}; Max-Age=0`);return json(res,200,{signedOut:true});}
    if(path==='/api/inventory/items'&&req.method==='POST')return json(res,201,store.createInventoryItem(user,await body(req)));
    if(path==='/api/inventory/receipts'&&req.method==='POST')return json(res,201,store.receiveInventory(user,await body(req)));
    const draftPath=path.match(/^\/api\/visits\/([^/]+)\/draft$/);
    if(draftPath&&req.method==='GET')return json(res,200,store.draft(user,decodeURIComponent(draftPath[1])));
    if(draftPath&&req.method==='POST')return json(res,200,store.saveDraft(user,decodeURIComponent(draftPath[1]),await body(req)));
    const startPath=path.match(/^\/api\/visits\/([^/]+)\/start$/);
    if(startPath&&req.method==='POST'){await body(req);return json(res,200,store.start(user,decodeURIComponent(startPath[1])));}
    if(req.method==='GET') {
     const report=path.match(/^\/api\/visits\/([^/]+)\/report$/);
     if(report)return json(res,200,store.report(user,decodeURIComponent(report[1])));
     const history=path.match(/^\/api\/visits\/([^/]+)\/history$/);
     if(history)return json(res,200,store.history(user,decodeURIComponent(history[1])));
     if(path==='/api/me')return json(res,200,user);
     if(path==='/api/fields')return json(res,200,fields);
     if(path==='/api/inventory'&&req.method==='GET')return json(res,200,store.inventory(user));
     if(path==='/api/inventory/catalogue'&&req.method==='GET')return json(res,200,store.inventoryCatalogue(user));
     if(path==='/api/map-config')return json(res,200,{googleMapsKey:process.env.GOOGLE_MAPS_BROWSER_KEY??'',mapId:process.env.GOOGLE_MAPS_MAP_ID??''});
     if(path==='/api/visits')return json(res,200,store.visible(user).map(v=>url.searchParams.get('summary')==='1'?{...v,fsr:v.fsr?{fsrNumber:v.fsr.fsrNumber,submittedAt:v.fsr.submittedAt}:null}:v));
     const visitDetail=path.match(/^\/api\/visits\/([^/]+)$/);
     if(visitDetail)return json(res,200,store.get(user,decodeURIComponent(visitDetail[1])));
     if(path==='/api/assets')return json(res,200,store.assets(user));
     if(path==='/api/audit')return json(res,200,store.audit(user));
     if(path==='/api/payments')return json(res,200,store.payments(user,url.searchParams.get('month')));
     if(path==='/api/export.csv') {
      const rows=store.payments(user,url.searchParams.get('month'));
      const keys=['visitId','fsrId','branchCode','assetId','vendor','month','warranty','status','eligible','rate','payable','acknowledgedBy','acknowledgedAt'];
      const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
      res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="amc-payment-statement.csv"','Cache-Control':'no-store'});return res.end([keys.join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n'));
     }
    }
    const match=path.match(/^\/api\/visits\/([^/]+)\/(submit|review)$/);
    if(match && req.method==='POST') {const input=await body(req),id=decodeURIComponent(match[1]);return json(res,200,match[2]==='submit'?store.submit(user,id,input):store.review(user,id,input.decision,input.reason));}
    return json(res,404,{error:'Endpoint not found'});
   }
   if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
   if(path==='/technician'){res.writeHead(308,{Location:'/technician/'});return res.end();}
   const files={'/technician/':'technician/index.html','/technician/app.js':'technician/app.js','/technician/styles.css':'technician/styles.css','/technician/manifest.webmanifest':'technician/manifest.webmanifest','/technician/icon.svg':'technician/icon.svg','/technician/icon-192.png':'technician/icon-192.png','/technician/icon-512.png':'technician/icon-512.png','/technician/sw.js':'technician/sw.js','/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/branch-map.js':'branch-map.js','/branch-map.geojson':'branch-map.geojson','/overview.js':'../shared/overview.js'};
   for(const name of ['leaflet.js','leaflet.css','leaflet.js.map','LICENSE'])files['/vendor/leaflet/'+name]='vendor/leaflet/'+name;
   for(const name of ['marker-icon.png','marker-icon-2x.png','marker-shadow.png','layers.png','layers-2x.png'])files['/vendor/leaflet/images/'+name]='vendor/leaflet/images/'+name;
   if(!files[path])return json(res,404,{error:'Not found'});
   if(path.startsWith('/technician/'))res.setHeader('Cache-Control','no-cache');
   const data=await readFile(resolve(root,files[path]));res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.map')?'application/json':path.endsWith('.geojson')?'application/geo+json':path.endsWith('.webmanifest')?'application/manifest+json':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':path.endsWith('/LICENSE')?'text/plain':'text/html'});res.end(data);
  }catch(e){json(res,e.status??500,{error:e.status?e.message:'Internal server error'});if(!e.status)console.error(e.message);}
 });
 server.on('close',()=>store.close());return {server,store};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3000);
 if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Demo authentication requires loopback binding. Implement production identity before exposing this service.');
 const {server}=createApp();server.listen(port,host,()=>console.log(`AMC synthetic demo listening on ${host}:${port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
