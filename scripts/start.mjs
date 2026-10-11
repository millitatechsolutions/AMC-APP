import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setup, projectDirectory } from './setup.mjs';
const configuredHost = process.env.HOST;
if (configuredHost && !['127.0.0.1', 'localhost', '::1'].includes(configuredHost)) {
  console.error('This demo can run only on your own computer or the local cloud machine. Remove the HOST override before starting.');
  process.exit(1);
}
const status = setup();
if (status) process.exit(status);
async function available(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', e => e.code === 'EADDRINUSE' ? resolve(false) : reject(e));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}
let port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be a number between 1 and 65535.');
  process.exit(1);
}
if (process.env.PORT && !(await available(port))) {
  console.error(`Port ${port} is already occupied. Close the existing app or choose another PORT.`);
  process.exit(1);
}
if (!process.env.PORT) {
  while (port <= 3010 && !(await available(port))) port++;
  if (port > 3010) {
    console.error('Ports 3000–3010 are occupied. Close an old AMC terminal window and try again.');
    process.exit(1);
  }
}
const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], {
  cwd: projectDirectory, stdio: 'inherit', env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }
});
child.on('error', error => { console.error('Could not start the app:', error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 0 : (code ?? 1); });
let stopping = false;
function stop() { if (!stopping) { stopping = true; child.kill('SIGTERM'); } }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
let verified = false;
for (let attempt = 0; attempt < 40 && child.exitCode === null && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    const result = await response.json();
    if (response.ok && result.status === 'ok' && result.mode === 'synthetic-demo') { verified = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (verified) {
  console.log(`\nThe AMC demo is running on this machine at port ${port}.`);
  console.log('On your own computer: type 127.0.0.1:' + port + ' into your browser address bar.');
  console.log('In Codex cloud: this address belongs to the cloud machine, not your computer; the onboarding screen does not provide a browser preview.');
  console.log('Keep this terminal open. Press Ctrl+C to stop. Use synthetic data only.\n');
} else if (!stopping) {
  console.error('The app did not become ready. Review the error above before trying again.');
  stop();
  process.exitCode = 1;
}
