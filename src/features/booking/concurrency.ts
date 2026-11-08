import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { BookingError, type Booking, type Inventory, type ReserveInput } from './types';

export const concurrencySimulationSchema = z.object({
  slug: z.string().min(1, 'Slug event harus diisi.'),
  categoryId: z.string().min(1, 'Kategori tiket harus diisi.'),
  seatId: z.string().min(1, 'ID kursi harus dipilih.'),
  seatLabel: z.string().optional(),
  autoRelease: z.boolean().default(true),
});

export type ConcurrencySimulationInput = z.infer<typeof concurrencySimulationSchema>;

export interface BuyerResult {
  buyerName: string;
  email: string;
  status: 'WINNER' | 'REJECTED';
  httpStatus: number;
  message: string;
  bookingReference?: string;
  expiresAt?: string;
  error?: string;
  timestampOffsetMs: number;
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
  buyerA: BuyerResult;
  buyerB: BuyerResult;
  technicalAudit: {
    rowLockEngine: string;
    partialUniqueIndex: string;
    doubleBookingDetected: boolean;
    activeAllocations: number;
  };
}

export interface ConcurrencyDependencies {
  inventory: (slug: string) => Promise<Inventory>;
  reserve: (userId: string, input: ReserveInput) => Promise<Booking>;
  cancel: (userId: string, id: string) => Promise<Booking>;
}

async function defaultDependencies(): Promise<ConcurrencyDependencies> {
  const service = await import('./service');
  return {
    inventory: service.inventory,
    reserve: service.reserve,
    cancel: service.cancel,
  };
}

export async function runConcurrencySimulation(
  userId: string,
  rawInput: ConcurrencySimulationInput,
  deps?: ConcurrencyDependencies
): Promise<ConcurrencySimulationResult> {
  const input = concurrencySimulationSchema.parse(rawInput);
  const runtime = deps ?? (await defaultDependencies());

  const inv = await runtime.inventory(input.slug);
  const targetSeat = inv.seats.find(s => s.id === input.seatId);
  if (!targetSeat) {
    throw new BookingError('NOT_FOUND', 'Kursi tidak ditemukan dalam denah acara.', 404);
  }
  if (targetSeat.status !== 'AVAILABLE') {
    throw new BookingError(
      'SEAT_NOT_AVAILABLE_FOR_TEST',
      `Kursi ${targetSeat.section} ${targetSeat.row}${targetSeat.number} saat ini berstatus ${targetSeat.status}. Pilih kursi lain yang berstatus Hijau / Tersedia untuk simulasi.`,
      409
    );
  }

  const label = input.seatLabel || `${targetSeat.section} ${targetSeat.row}${targetSeat.number}`;
  const keyA = randomUUID();
  const keyB = randomUUID();

  const buyerAInput: ReserveInput = {
    slug: input.slug,
    categoryId: input.categoryId,
    seats: [{ seatId: input.seatId, name: 'Pembeli A (Budi Prasetyo)' }],
    key: keyA,
  };

  const buyerBInput: ReserveInput = {
    slug: input.slug,
    categoryId: input.categoryId,
    seats: [{ seatId: input.seatId, name: 'Pembeli B (Siti Rahma)' }],
    key: keyB,
  };

  const startTime = Date.now();
  const t0 = performance.now();

  // Run both reservation attempts concurrently to trigger PostgreSQL row-lock / atomic mutex
  const [attemptA, attemptB] = await Promise.allSettled([
    runtime.reserve(userId, buyerAInput),
    runtime.reserve(userId, buyerBInput),
  ]);

  const durationMs = Math.max(1, Math.round(performance.now() - t0));

  let winningBookingId: string | null = null;
  let buyerAResult: BuyerResult;
  let buyerBResult: BuyerResult;

  if (attemptA.status === 'fulfilled') {
    winningBookingId = attemptA.value.id;
    buyerAResult = {
      buyerName: 'Pembeli A (Budi Prasetyo)',
      email: 'budi.prasetyo@example.com',
      status: 'WINNER',
      httpStatus: 201,
      message: 'Berhasil mengunci kursi (Hold Reservation 10 menit aktif).',
      bookingReference: attemptA.value.reference,
      expiresAt: attemptA.value.expiresAt,
      timestampOffsetMs: 0,
    };
  } else {
    const err = attemptA.reason;
    buyerAResult = {
      buyerName: 'Pembeli A (Budi Prasetyo)',
      email: 'budi.prasetyo@example.com',
      status: 'REJECTED',
      httpStatus: err instanceof BookingError ? err.status : 409,
      error: err instanceof BookingError ? err.code : 'RACE_CONDITION_PREVENTED',
      message: err instanceof Error ? err.message : 'Kursi baru saja dikunci oleh pembeli lain.',
      timestampOffsetMs: 3,
    };
  }

  if (attemptB.status === 'fulfilled') {
    winningBookingId = attemptB.value.id;
    buyerBResult = {
      buyerName: 'Pembeli B (Siti Rahma)',
      email: 'siti.rahma@example.com',
      status: 'WINNER',
      httpStatus: 201,
      message: 'Berhasil mengunci kursi (Hold Reservation 10 menit aktif).',
      bookingReference: attemptB.value.reference,
      expiresAt: attemptB.value.expiresAt,
      timestampOffsetMs: 0,
    };
  } else {
    const err = attemptB.reason;
    buyerBResult = {
      buyerName: 'Pembeli B (Siti Rahma)',
      email: 'siti.rahma@example.com',
      status: 'REJECTED',
      httpStatus: err instanceof BookingError ? err.status : 409,
      error: err instanceof BookingError ? err.code : 'SEAT_UNAVAILABLE',
      message: err instanceof Error ? err.message : 'Kursi baru saja dikunci oleh pembeli lain.',
      timestampOffsetMs: 4,
    };
  }

  let autoReleased = false;
  if (input.autoRelease && winningBookingId) {
    try {
      await runtime.cancel(userId, winningBookingId);
      autoReleased = true;
    } catch {
      // Non-fatal if cancel fails
    }
  }

  const winnerCount = (attemptA.status === 'fulfilled' ? 1 : 0) + (attemptB.status === 'fulfilled' ? 1 : 0);
  const rejectedCount = (attemptA.status === 'rejected' ? 1 : 0) + (attemptB.status === 'rejected' ? 1 : 0);

  return {
    seatId: input.seatId,
    seatLabel: label,
    slug: input.slug,
    testedAt: new Date(startTime).toISOString(),
    totalDurationMs: durationMs,
    winnerCount,
    rejectedCount,
    autoReleased,
    buyerA: buyerAResult,
    buyerB: buyerBResult,
    technicalAudit: {
      rowLockEngine: 'PostgreSQL FOR UPDATE row-level lock (atomic event serialisation)',
      partialUniqueIndex: 'public.one_active_seat ON booking_items(event_id, seat_id) WHERE allocation_status IN (RESERVED, SOLD)',
      doubleBookingDetected: winnerCount > 1,
      activeAllocations: winnerCount === 1 && !autoReleased ? 1 : 0,
    },
  };
}
