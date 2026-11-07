import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localWorkerUrl, runLocalWorker } from '../scripts/notification-worker.mjs';
test('local worker targets loopback only and invokes one awaited authenticated batch', async () => {
  assert.equal(localWorkerUrl('http://127.0.0.1:3001'), 'http://127.0.0.1:3001/api/internal/notifications/run');
  for (const url of ['https://external.test', 'http://user:secret@localhost', 'http://localhost/path', 'http://localhost?secret=x']) assert.throws(() => localWorkerUrl(url));
  let calls = 0;
  const env = { SUMMAPASS_AUTH_MODE: 'supabase', SUMMAPASS_CRON_SECRET: 'test-only-'.repeat(4), SUMMAPASS_WORKER_URL: 'http://localhost:3002' };
  await runLocalWorker({ once: true, env, transport: async (url, options) => { calls++; assert.equal(url, 'http://localhost:3002/api/internal/notifications/run'); assert.equal(options.headers.Authorization, 'Bearer ' + env.SUMMAPASS_CRON_SECRET); return new Response(JSON.stringify({ scheduled: 1, sent: 0 })); } });
  assert.equal(calls, 1);
  await runLocalWorker({ once: true, env: { SUMMAPASS_AUTH_MODE: 'demo' }, transport: async () => { throw Error('must not call'); } });
});
