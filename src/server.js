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
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(path.startsWith('/api/')) {
    if(!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Origin denied'});
    if(path==='/api/health' && req.method==='GET')return json(res,200,{status:'ok',mode:'synthetic-demo'});
    if(path==='/api/demo-users' && req.method==='GET')return json(res,200,users);
    if(path==='/api/session' && req.method==='POST') {
     const input=await body(req),user=users.find(u=>u.id===input.userId);if(!user)return json(res,400,{error:'Unknown demo user'});
     const token=randomUUID();sessions.set(token,{user,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`amc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return json(res,200,user);
    }
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('amc_session='))?.slice(12),session=sessions.get(token);
    if(!session || session.expires<Date.now())return json(res,401,{error:'Select a demo workspace to continue'});
    const user=session.user;
    if(req.method==='GET') {
     const history=path.match(/^\/api\/visits\/([^/]+)\/history$/);
     if(history)return json(res,200,store.history(user,decodeURIComponent(history[1])));
     if(path==='/api/me')return json(res,200,user);
     if(path==='/api/fields')return json(res,200,fields);
     if(path==='/api/visits')return json(res,200,store.visible(user));
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
   const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
   if(!files[path])return json(res,404,{error:'Not found'});
   const data=await readFile(resolve(root,files[path]));res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});res.end(data);
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
