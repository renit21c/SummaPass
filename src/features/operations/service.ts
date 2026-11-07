import 'server-only';
import { getSession } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { BookingError } from '@/features/booking/types';

const messages: Record<string, string> = {
  AUTH: 'Silakan masuk.', FORBIDDEN: 'Akses ditolak.', NOT_FOUND: 'Data tidak ditemukan. Gunakan email penerima yang terverifikasi.',
  RATE_LIMIT: 'Batas permintaan tercapai. Coba lagi nanti.', EXPIRED: 'Undangan sudah berakhir.',
  REVOKED: 'Akses sudah dicabut.', ALREADY_INVITED: 'Email ini sudah memiliki undangan aktif.',
  IDEMPOTENCY_CONFLICT: 'Permintaan tidak cocok dengan permintaan sebelumnya.',
  EVENT_CANCELLED: 'Acara sudah dibatalkan.', ALREADY_CANCELLED: 'Acara sudah dibatalkan.',
  INVITER_ACCESS_REVOKED: 'Pengirim undangan sudah tidak memiliki akses organizer.',
  UNSAFE_REPLAY: 'Job ini tidak dapat diputar ulang dengan aman. Periksa status di provider.',
  NOT_PENDING: 'Undangan sudah tidak aktif.', INPUT: 'Periksa data yang diisi.'
};

export async function operationRpc(name: string, args: Record<string, unknown>) {
  const user = await getSession();
  if (!user) throw new BookingError('AUTH', messages.AUTH, 401);
  if (user.mode !== 'supabase') throw new BookingError('SUPABASE_REQUIRED', 'Fitur ini memerlukan mode Supabase.', 409);
  // Every RPC independently checks auth.uid() and the relevant event assignment.
  const { data, error } = await (await supabaseServer()).rpc(name, args);
  if (error) throw new BookingError('DATABASE', 'Data belum dapat diproses. Periksa koneksi dan migrasi 013 sampai 015.', 503);
  if (data?.error) {
    const code = String(data.error);
    const status = code === 'AUTH' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'RATE_LIMIT' ? 429 : code === 'INPUT' ? 400 : 409;
    throw new BookingError(code, messages[code] ?? 'Permintaan tidak dapat diproses.', status);
  }
  return data as unknown;
}
