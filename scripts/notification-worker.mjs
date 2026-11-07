import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function localWorkerUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('LOCAL_URL_REQUIRED');
  return new URL('/api/internal/notifications/run', url).href;
}

export async function runLocalWorker({ signal, once = false, transport = fetch, env = process.env } = {}) {
  if (env.SUMMAPASS_AUTH_MODE !== 'supabase' || env.SUMMAPASS_LOCAL_WORKER_ENABLED === 'false') {
    console.log('[worker] Nonaktif. Gunakan mode Supabase untuk pengingat otomatis.'); return;
  }
  const secret = env.SUMMAPASS_CRON_SECRET;
  if (!secret || secret.length < 32) throw Error('CRON_SECRET_REQUIRED');
  const url = localWorkerUrl(env.SUMMAPASS_WORKER_URL || `http://127.0.0.1:${env.PORT || 3000}`);
  console.log('[worker] Aktif setiap 60 detik. Tidak menumpuk pemanggilan yang masih berjalan.');
  while (!signal?.aborted) {
    const started = Date.now();
    try {
      const response = await transport(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000) });
      const data = await response.json();
      if (!response.ok) console.log(`[worker] HTTP ${response.status}${data.code === 'MIGRATION_REQUIRED' ? ': terapkan migrasi 013 sampai 015.' : ': periksa server dan konfigurasi.'}`);
      else {
        // Emit counters only, never response contents, recipient, provider body or credentials.
        const count = name => Number.isSafeInteger(data[name]) ? data[name] : 0;
        console.log(`[worker] scheduled=${count('scheduled')} sent=${count('sent')} retry=${count('retry')} failed=${count('failed')} skipped=${count('skipped')}`);
      }
    } catch { if (!signal?.aborted) console.log('[worker] Server belum dapat dihubungi. Mencoba lagi pada putaran berikutnya.'); }
    if (once || signal?.aborted) break;
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, Math.max(1000, 60000 - (Date.now() - started)));
      signal?.addEventListener('abort', finish, { once: true });
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort()); process.on('SIGTERM', () => controller.abort());
  runLocalWorker({ signal: controller.signal, once: process.argv.includes('--once') }).catch(() => { console.error('[worker] Konfigurasi lokal belum lengkap. Periksa mode, URL localhost dan cron secret.'); process.exitCode = 1; });
}
