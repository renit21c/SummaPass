import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { safeReturnPath, authMode } from '../src/lib/auth/config';

test('return paths reject external and auth-loop destinations', () => {
 for (const path of ['https://evil.test','//evil.test','/\\evil.test','/login','/api/auth/login','/account\n']) assert.equal(safeReturnPath(path),'/account');
 assert.equal(safeReturnPath('/staff'),'/staff');
 assert.equal(safeReturnPath('/events/little-weekend/seats'),'/events/little-weekend/seats');
});
test('Supabase mode never silently falls back when credentials are missing',()=>{
 const original = process.env.SUMMAPASS_AUTH_MODE; const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 try {process.env.SUMMAPASS_AUTH_MODE='supabase';delete process.env.NEXT_PUBLIC_SUPABASE_URL;assert.throws(()=>authMode());}
 finally {if(original===undefined)delete process.env.SUMMAPASS_AUTH_MODE;else process.env.SUMMAPASS_AUTH_MODE=original;if(url!==undefined)process.env.NEXT_PUBLIC_SUPABASE_URL=url;}
});
test('PostgreSQL migration, seed and role boundaries',async()=>{
 const db = new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile('supabase/migrations/202611030001_foundation.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202611030002_reservations.sql','utf8'));
 await db.exec(await readFile('supabase/seed.sql','utf8'));
 await db.exec(await readFile('supabase/seed.sql','utf8')); // seed is repeatable
 const attendee='a0000000-0000-4000-8000-000000000001', organizer='a0000000-0000-4000-8000-000000000002', staff='a0000000-0000-4000-8000-000000000003';
 await db.exec(`insert into auth.users(id) values('${attendee}'),('${organizer}'),('${staff}');
 insert into public.events(id,venue_id,slug,title,category,starts_at,ends_at,status) values('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','private-test','Private','Musik','2026-12-21','2026-12-22','DRAFT');
 insert into public.event_access(event_id,user_id,role) values('20000000-0000-4000-8000-000000000099','${organizer}','ORGANIZER'),('20000000-0000-4000-8000-000000000001','${staff}','STAFF');`);
 const count = async(table:string)=>Number((await db.query<{count:string}>(`select count(*) as count from public.${table}`)).rows[0].count);
 await db.exec('set role anon'); assert.equal(await count('events'),4);assert.equal(await count('seats'),48);
 await assert.rejects(()=>db.query('select * from public.profiles'));
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','${attendee}',false);set role authenticated;`);
 assert.equal(await count('profiles'),1);assert.equal(await count('events'),4);assert.equal(await count('event_access'),0);
 assert.equal((await db.query(`update public.profiles set display_name='Changed' where id='${organizer}' returning id`)).rows.length,0);
 await assert.rejects(()=>db.exec(`insert into public.event_access(event_id,user_id,role) values('20000000-0000-4000-8000-000000000001','${attendee}','ORGANIZER')`));
 await assert.rejects(()=>db.exec(`update public.events set title='Hacked'`));
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','${organizer}',false);set role authenticated;`);
 assert.equal(await count('events'),5);assert.equal(await count('profiles'),1);assert.equal(await count('event_access'),1);
 assert.equal((await db.query<{allowed:boolean}>(`select public.has_event_access('20000000-0000-4000-8000-000000000001','ORGANIZER') as allowed`)).rows[0].allowed,false);
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','${staff}',false);set role authenticated;`);
 assert.equal(await count('events'),4);assert.equal(await count('profiles'),1);assert.equal(await count('event_access'),1);
 assert.equal((await db.query<{allowed:boolean}>(`select public.has_event_access('20000000-0000-4000-8000-000000000001','ORGANIZER') as allowed`)).rows[0].allowed,false);
 } finally {await db.close();}
});
