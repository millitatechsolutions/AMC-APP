import { createHash, timingSafeEqual } from 'node:crypto';
import { isAbsolute } from 'node:path';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
const denied = message => { throw Object.assign(new Error(message), { status: 403 }); };

// Hosted access is deliberately opt-in. Public-origin and bootstrap requirements
// are validated before opening SQLite or binding a listening socket.
export function readHostingConfig(env = process.env) {
  if (env.AMC_HOSTED !== undefined && !['', '0', '1'].includes(env.AMC_HOSTED)) throw new Error('AMC_HOSTED must be 0 or 1');
  const hosted = env.AMC_HOSTED === '1';
  const bindHost = env.HOST || (hosted ? '0.0.0.0' : '127.0.0.1');
  if (!hosted) {
    if (!['127.0.0.1', 'localhost', '::1'].includes(bindHost)) throw new Error('This local workspace requires loopback binding. Configure reviewed HTTPS hosting before shared deployment.');
    return Object.freeze({ hosted: false, bindHost, dbPath: env.AMC_DB_PATH });
  }
  if (!['0.0.0.0', '127.0.0.1', 'localhost', '::1'].includes(bindHost)) throw new Error('Hosted HOST must be 0.0.0.0 or a loopback address');
  if (env.AMC_TRUST_PROXY !== undefined && !['', '0', '1'].includes(env.AMC_TRUST_PROXY)) throw new Error('AMC_TRUST_PROXY must be 0 or 1');
  const candidate = env.AMC_PUBLIC_ORIGIN || (env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : '');
  let origin;
  try { origin = new URL(candidate); } catch { throw new Error('Hosted mode requires AMC_PUBLIC_ORIGIN or RENDER_EXTERNAL_HOSTNAME'); }
  if (origin.protocol !== 'https:' || !origin.hostname || origin.hostname.includes('*') || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('AMC_PUBLIC_ORIGIN must be a single HTTPS origin without credentials, a path, query or fragment');
  if (typeof env.AMC_SETUP_KEY !== 'string' || !/^\S{32,512}$/.test(env.AMC_SETUP_KEY)) throw new Error('Hosted mode requires an AMC_SETUP_KEY of 32–512 non-whitespace characters');
  if (typeof env.AMC_DB_PATH !== 'string' || !isAbsolute(env.AMC_DB_PATH)) throw new Error('Hosted mode requires an absolute AMC_DB_PATH on persistent storage');
  return Object.freeze({ hosted: true, bindHost, publicOrigin: origin.origin, publicHost: origin.host, trustProxy: env.AMC_TRUST_PROXY === '1', setupKey: env.AMC_SETUP_KEY, dbPath: env.AMC_DB_PATH });
}

export function checkRequestHosting(req, config) {
  const authority = req.headers.host;
  if (typeof authority !== 'string' || !authority || /[\s/@\\?#,]/.test(authority)) denied('Host denied');
  let requestOrigin;
  try { requestOrigin = new URL(`${config.hosted ? 'https' : req.socket.encrypted ? 'https' : 'http'}://${authority}`); } catch { denied('Host denied'); }
  let url;
  try { url = new URL(req.url, requestOrigin); } catch { denied('Request URL denied'); }
  if (url.origin !== requestOrigin.origin) denied('Request URL denied');
  const secure = Boolean(req.socket.encrypted) || Boolean(config.hosted && config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  if (!config.hosted) {
    if (!loopbackHosts.has(requestOrigin.hostname)) denied('This local workspace accepts only localhost requests');
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== requestOrigin.origin) denied('Origin denied');
    return { url, secure };
  }
  // Render probes may use plain internal HTTP. Only this public, read-only
  // health response accepts a literal loopback Host or an omitted proxy header.
  const health = req.method === 'GET' && url.pathname === '/api/health';
  if (requestOrigin.host !== config.publicHost && !(health && loopbackHosts.has(requestOrigin.hostname))) denied('Host denied');
  if (!health && !secure) denied('HTTPS is required');
  if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== config.publicOrigin) denied('Origin denied');
  return { url, secure };
}

export function validOwnerSetupKey(value, config) {
  if (!config.hosted) return true;
  if (typeof value !== 'string') return false;
  // Fixed-length digests keep comparison constant-time even for incorrect
  // lengths. Neither the key nor these digests are returned or logged.
  const digest = text => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(value), digest(config.setupKey));
}
