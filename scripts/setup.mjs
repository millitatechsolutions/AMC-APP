import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
export function setup() {
  if (Number(process.versions.node.split('.')[0]) < 24) {
    console.error('Please install Node.js 24 LTS or newer from nodejs.org, close this terminal, and try again.');
    return 1;
  }
  console.log('\nPreparing Genset AMC. Your saved demo records will be preserved.\n');
  for (const args of [['ci', '--ignore-scripts'], ['run', 'check'], ['test']]) {
    console.log(`Running: npm ${args.join(' ')}`);
    const result = process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], { cwd: projectDirectory, stdio: 'inherit' })
      : spawnSync('npm', args, { cwd: projectDirectory, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      console.error('Setup could not complete. Keep the error above and share it with your programming assistant.');
      if (result.error) console.error(result.error.message);
      return result.status || 1;
    }
  }
  console.log('\nSetup checks passed.\n');
  return 0;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = setup();
