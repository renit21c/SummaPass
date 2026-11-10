import { z } from 'zod';
import { managedSchema } from './core';
import { BookingError } from '../booking/types';

// Legacy records may predate editor length rules; new writes still validate input.
export const catalogRecordSchema = managedSchema.safeExtend({ isTrending:z.boolean().default(false),frontQuota:z.number().int().min(1).max(2000),regularQuota:z.number().int().min(1).max(2000),title: z.string(), description: z.string(), rules: z.string() });
export function catalogResult(data: unknown, error: unknown): unknown {
  if (error) throw new BookingError('DATABASE', 'Data event belum dapat diproses. Coba lagi.', 503);
  const failure = z.object({ error: z.string(), message: z.string().optional() }).safeParse(data);
  if (failure.success) {
    const code = failure.data.error;
    const status = code === 'AUTH' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'INPUT' ? 400 : 409;
    throw new BookingError(code, failure.data.message ?? 'Permintaan event ditolak.', status);
  }
  return data;
}
export function decodeCatalog(data: unknown) {
  const result = z.array(catalogRecordSchema).safeParse(data);
  if (!result.success) throw new BookingError('DATABASE', 'Data event belum dapat dimuat.', 503);
  return result.data;
}
export function decodeEvent(data: unknown) {
  const result = catalogRecordSchema.safeParse(data);
  if (!result.success) throw new BookingError('DATABASE', 'Data event belum dapat dimuat.', 503);
  return result.data;
}
export const coverFileSchema = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/);
export function coverObjectPath(file: string) {
  const valid = coverFileSchema.parse(file);
  return valid.slice(0, 36) + '/' + valid.slice(37);
}
