import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { managedEvent, coverEvent } from '@/features/catalog/service';
import { normalizeCover } from '@/features/catalog/cover';
import { storeCover, discardUnusedCover } from '@/features/catalog/storage';
import { coverFormData } from '@/features/catalog/upload';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';

export async function POST(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const id = z.string().uuid().parse((await params).id);
    const event = await managedEvent(id);
    if (event.status === 'ARCHIVED') return NextResponse.json({ error: 'Event arsip tidak dapat diedit.' }, { status: 409 });
    const file = (await coverFormData(r)).get('cover');
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Pilih cover maksimal 5 MB.' }, { status: 400 });
    let bytes: Buffer;
    try { bytes = await normalizeCover(Buffer.from(await file.arrayBuffer()), file.type); }
    catch { return NextResponse.json({ error: 'Gunakan JPG, PNG, atau WebP minimal 400 × 250 piksel dan maksimal 5 MB.' }, { status: 400 }); }
    const filename = `${id}_${randomUUID()}.webp`;
    await storeCover(filename, bytes);
    try { return NextResponse.json(await coverEvent(id, `/api/covers/${filename}`), { headers: { 'Cache-Control': 'private, no-store' } }); }
    catch (error) { await discardUnusedCover(filename).catch(() => {}); throw error; }
  } catch (error) { return failure(error); }
}
