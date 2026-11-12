import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { BookingError, type Booking, type Inventory, type ReserveInput } from './types';
import { simulationSalesState } from './simulation-availability';

export const concurrencySimulationSchema = z.object({
  slug: z.string().min(1).max(100),
  categoryId: z.string().min(1).max(100),
  packageId: z.string().uuid().optional(),
  seatId: z.string().min(1).max(100),
  seatLabel: z.string().max(180).optional(),
  autoRelease: z.boolean().default(true),
});
export type ConcurrencySimulationInput = z.input<typeof concurrencySimulationSchema>;
export interface BuyerResult {
  buyerName: string;
  status: 'WINNER' | 'REJECTED' | 'ERROR';
  httpStatus: number;
  message: string;
  bookingReference?: string;
  expiresAt?: string;
  error?: string;
  timestampOffsetMs: number;
  durationMs: number;
}
export interface ConcurrencySimulationResult {
  seatId: string;
  seatLabel: string;
  slug: string;
  testedAt: string;
  totalDurationMs: number;
  winnerCount: number;
  rejectedCount: number;
  autoReleased: boolean;
  cleanupError?: string;
  outcome: 'PASSED' | 'INCONCLUSIVE' | 'DOUBLE_BOOKING';
  participantCount: number;
  buyerA: BuyerResult;
  buyerB: BuyerResult;
  technicalAudit: { doubleBookingDetected: boolean; activeAllocations: number };
}
export interface ConcurrencyDependencies {
  inventory: (slug: string) => Promise<Inventory>;
  reserve: (userId: string, input: ReserveInput) => Promise<Booking>;
  cancel: (userId: string, id: string) => Promise<Booking>;
}
async function defaultDependencies(): Promise<ConcurrencyDependencies> {
  const service = await import('./service');
  return { inventory: service.inventory, reserve: service.reserve, cancel: service.cancel };
}
export async function runConcurrencySimulation(userId: string, rawInput: unknown, deps?: ConcurrencyDependencies): Promise<ConcurrencySimulationResult> {
  const input = concurrencySimulationSchema.parse(rawInput);
  const runtime = deps ?? await defaultDependencies();
  const inv = await runtime.inventory(input.slug);
  if (inv.seatingMode === 'GENERAL_ADMISSION') throw new BookingError('MODE', 'Simulasi ini memerlukan event dengan kursi.', 400);
  const category = inv.categories.find(c => c.id === input.categoryId);
  if (!category) throw new BookingError('CATEGORY', 'Kategori tidak ditemukan.', 400);
  const sales = simulationSalesState(category, inv.serverNow);
  if (sales !== 'OPEN') throw new BookingError('SALES_CLOSED', sales === 'UPCOMING' ? 'Penjualan kategori ini belum dibuka. Pilih kategori lain.' : 'Penjualan kategori ini sudah ditutup. Pilih kategori lain.', 409);
  const target = inv.seats.find(s => s.id === input.seatId);
  if (!target) throw new BookingError('NOT_FOUND', 'Kursi tidak ditemukan.', 404);
  if (!category.sections.includes(target.section)) throw new BookingError('CATEGORY', 'Kursi tidak sesuai kategori.', 400);
  if (target.status !== 'AVAILABLE') throw new BookingError('SEAT_NOT_AVAILABLE_FOR_TEST', 'Kursi sudah terisi. Pilih kursi lain.', 409);

  // Resolve the package from this category, never from a previous category.
  const packages = category.packages ?? [];
  const pack = input.packageId ? packages.find(p => p.id === input.packageId && p.active)
    : packages.find(p => p.active && p.participants === 1 && p.remaining !== 0)
      ?? packages.find(p => p.active && p.remaining !== 0);
  if ((input.packageId || packages.length) && !pack) throw new BookingError('PACKAGE', 'Tidak ada paket aktif untuk kategori ini.', 400);
  if (pack?.remaining === 0) throw new BookingError('QUOTA', 'Kuota paket sudah habis. Pilih kategori lain.', 409);
  const participantCount = pack?.participants ?? 1;
  const chosen = [target, ...inv.seats.filter(s => s.id !== target.id && s.status === 'AVAILABLE' && category.sections.includes(s.section))].slice(0, participantCount);
  if (chosen.length < participantCount || (category.remaining ?? category.quota) < participantCount) {
    throw new BookingError('QUOTA', 'Kursi tersedia tidak cukup untuk satu paket. Pilih kategori lain.', 409);
  }
  const started = performance.now();
  const testedAt = new Date().toISOString();
  async function attempt(name: string) {
    const timestampOffsetMs = Math.round(performance.now() - started);
    const attemptStart = performance.now();
    try {
      const booking = await runtime.reserve(userId, {
        slug: input.slug, categoryId: input.categoryId, key: randomUUID(),
        ...(pack ? { packageId: pack.id, packageQuantity: 1 } : {}),
        seats: chosen.map((seat, i) => ({ seatId: seat.id, name: `${name} - Peserta ${i + 1}` })),
      });
      return { booking, result: { buyerName: name, status: 'WINNER', httpStatus: 201,
        message: 'Berhasil memesan.', bookingReference: booking.reference, expiresAt: booking.expiresAt,
        timestampOffsetMs, durationMs: Math.round(performance.now() - attemptStart) } satisfies BuyerResult };
    } catch (error) {
      const conflict = error instanceof BookingError && ['SEAT_UNAVAILABLE', 'QUOTA'].includes(error.code);
      return { booking: null, result: { buyerName: name, status: conflict ? 'REJECTED' : 'ERROR',
        httpStatus: error instanceof BookingError ? error.status : 503,
        error: error instanceof BookingError ? error.code : 'SYSTEM',
        message: error instanceof BookingError && error.code === 'SEAT_UNAVAILABLE' ? 'Kursi sudah dipesan pembeli lain.' : error instanceof BookingError ? error.message : 'Permintaan gagal. Coba lagi.',
        timestampOffsetMs, durationMs: Math.round(performance.now() - attemptStart) } satisfies BuyerResult };
    }
  }
  // Both attempts share the same seats and have different idempotency keys.
  const attempts = await Promise.all([attempt('Pembeli A'), attempt('Pembeli B')]);
  const totalDurationMs = Math.max(1, Math.round(performance.now() - started));
  const successful = attempts.flatMap(a => a.booking ? [a.booking] : []);
  const uniqueBookings = [...new Map(successful.map(b => [b.id, b])).values()];
  const winnerCount = successful.length;
  const rejectedCount = attempts.filter(a => a.result.status === 'REJECTED').length;
  // Release every successful attempt, even if a regression allowed two winners.
  const released = input.autoRelease ? await Promise.all(uniqueBookings.map(async b => {
    try { return (await runtime.cancel(userId, b.id)).status === 'CANCELLED'; } catch { return false; }
  })) : [];
  const autoReleased = uniqueBookings.length > 0 && released.length === uniqueBookings.length && released.every(Boolean);
  const cleanupError = input.autoRelease && uniqueBookings.length && !autoReleased
    ? 'Sebagian reservasi belum dilepas. Batalkan di Pesanan saya sebelum mengulang.' : undefined;
  return {
    seatId: target.id, seatLabel: `${target.section} ${target.row}${target.number}`, slug: input.slug,
    testedAt, totalDurationMs, winnerCount, rejectedCount, autoReleased, cleanupError, participantCount,
    outcome: uniqueBookings.length > 1 ? 'DOUBLE_BOOKING' : winnerCount === 1 && rejectedCount === 1 ? 'PASSED' : 'INCONCLUSIVE',
    buyerA: attempts[0].result, buyerB: attempts[1].result,
    technicalAudit: { doubleBookingDetected: uniqueBookings.length > 1, activeAllocations: uniqueBookings.length - released.filter(Boolean).length },
  };
}
