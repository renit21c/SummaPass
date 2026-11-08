import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailRedirectOrigin } from '../src/lib/auth/request';

const request = { headers: new Headers({ origin: 'http://127.0.0.1:3000' }) } as never;

test('email callbacks prefer a valid configured application origin', () => {
 assert.equal(emailRedirectOrigin(request, 'https://summapass.vercel.app'), 'https://summapass.vercel.app');
 assert.equal(emailRedirectOrigin(request, 'summapass.vercel.app'), 'http://127.0.0.1:3000');
 assert.equal(emailRedirectOrigin(request, 'https://summapass.vercel.app/extra'), 'http://127.0.0.1:3000');
});
