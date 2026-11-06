import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const persistedCheckInSchema = z.object({
  ticketId: z.string(),
  reference: z.string(),
  attendeeName: z.string(),
  seatLabel: z.string(),
  categoryName: z.string(),
  checkedInAt: z.string(),
  staffId: z.string(),
  slug: z.string(),
});

export type PersistedCheckIn = z.infer<typeof persistedCheckInSchema>;

export const dataRoot = process.env.SUMMAPASS_DATA_DIR ?? join(process.cwd(), '.data');

export function loadCheckIns(): PersistedCheckIn[] {
  const path = join(dataRoot, 'check_ins.json');
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    return z.array(persistedCheckInSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCheckIns(items: PersistedCheckIn[]) {
  mkdirSync(dataRoot, { recursive: true });
  const target = join(dataRoot, 'check_ins.json');
  const temp = join(dataRoot, 'check_ins.tmp');
  writeFileSync(temp, JSON.stringify(items, null, 2), 'utf8');
  renameSync(temp, target);
}

export const persistedAuditSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  reference: z.string(),
  slug: z.string(),
  attendeeName: z.string(),
  action: z.literal('REVERT_CHECK_IN'),
  reason: z.string(),
  performedBy: z.string(),
  performedByName: z.string().optional(),
  performedAt: z.string(),
  previousCheckedInAt: z.string().optional(),
});

export type PersistedAudit = z.infer<typeof persistedAuditSchema>;

export function loadCheckInAudits(): PersistedAudit[] {
  const path = join(dataRoot, 'check_in_audits.json');
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    return z.array(persistedAuditSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCheckInAudits(items: PersistedAudit[]) {
  mkdirSync(dataRoot, { recursive: true });
  const target = join(dataRoot, 'check_in_audits.json');
  const temp = join(dataRoot, 'check_in_audits.tmp');
  writeFileSync(temp, JSON.stringify(items, null, 2), 'utf8');
  renameSync(temp, target);
}

