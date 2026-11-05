import 'server-only';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { authMode } from '@/lib/auth/config';
import { supabaseServer } from '@/lib/supabase/server';
import { BookingError } from '../booking/types';
import { catalogRoot } from './persistence';
import { coverObjectPath } from './contract';
const bucket = 'event-covers';
export async function storeCover(file: string, bytes: Buffer) {
  const path = coverObjectPath(file);
  if (authMode() === 'demo') {
    const root = join(catalogRoot, 'covers'); await mkdir(root, { recursive: true });
    await writeFile(join(root, file), bytes, { flag: 'wx' }); return;
  }
  const { error } = await (await supabaseServer()).storage.from(bucket).upload(path, bytes, { contentType: 'image/webp', upsert: false });
  if (error) throw new BookingError('STORAGE', 'Cover belum dapat disimpan. Coba lagi.', 503);
}
export async function discardUnusedCover(file: string) {
  const path = coverObjectPath(file);
  if (authMode() === 'demo') { await unlink(join(catalogRoot, 'covers', file)).catch(() => {}); return; }
  await (await supabaseServer()).storage.from(bucket).remove([path]);
}
export async function readCover(file: string) {
  const path = coverObjectPath(file);
  if (authMode() === 'demo') return new Uint8Array(await readFile(join(catalogRoot, 'covers', file)));
  // Caller session only: never bypass draft privacy with the service-role key.
  const { data, error } = await (await supabaseServer()).storage.from(bucket).download(path);
  if (error || !data) throw new BookingError('NOT_FOUND', 'Cover tidak ditemukan.', 404);
  return new Uint8Array(await data.arrayBuffer());
}
