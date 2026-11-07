import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const args = process.argv.slice(2);
const index = args.findIndex(arg => arg === '-p' || arg === '--port');
// Some npm/PowerShell versions consume --port and forward only its numeric value.
const barePort = args.length === 1 && /^\d+$/.test(args[0]) ? args[0] : undefined;
const port = args.find(arg => arg.startsWith('--port='))?.split('=')[1] || (index >= 0 ? args[index + 1] : undefined) || barePort || process.env.npm_config_port || process.env.PORT || '3000';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('Port tidak valid.');
const forwarded = args.filter((arg, position) => !arg.startsWith('--port=') && position !== index && (index < 0 || position !== index + 1) && !barePort);
// Explicit port prevents Next falling back to a different port behind the worker.
const web = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', port, ...forwarded], { stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
let worker = null, readyOutput = '';
web.stderr.pipe(process.stderr);
web.stdout.on('data', chunk => {
  process.stdout.write(chunk); readyOutput = (readyOutput + chunk.toString()).slice(-1024);
  if (!worker && readyOutput.includes('Ready in') && process.env.SUMMAPASS_AUTH_MODE === 'supabase' && process.env.SUMMAPASS_LOCAL_WORKER_ENABLED !== 'false') {
    worker = spawn(process.execPath, ['scripts/notification-worker.mjs'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, SUMMAPASS_WORKER_URL: `http://127.0.0.1:${port}` } });
    worker.on('error', () => console.error('[worker] Gagal dimulai. Jalankan npm run notifications:worker.'));
    worker.on('exit', code => { if (!stopped && code) console.error('[worker] Berhenti. Periksa konfigurasi lalu restart development.'); });
  }
});
let stopped = false;
function stop(code = 0) {
  if (stopped) return; stopped = true;
  for (const child of [web, worker]) {
    if (!child?.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
web.on('exit', code => stop(code ?? 1));
web.on('error', () => { console.error('Server development gagal dimulai.'); stop(1); });
