import type { BuyerResult } from './concurrency';

export function compareSimulationTiming(a: BuyerResult, b: BuyerResult) {
  const startGapMs = Number(Math.abs(a.timestampOffsetMs - b.timestampOffsetMs).toFixed(1));
  const finishGapMs = Number(Math.abs(a.completedOffsetMs - b.completedOffsetMs).toFixed(1));
  const overlapMs = Number(Math.max(0, Math.min(a.completedOffsetMs, b.completedOffsetMs)
    - Math.max(a.timestampOffsetMs, b.timestampOffsetMs)).toFixed(1));
  return { startGapMs, finishGapMs, overlapMs, scaleMs: Math.max(1, a.completedOffsetMs, b.completedOffsetMs) };
}

export function formatSimulationMs(value: number) {
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value)} ms`;
}
