import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const staffAssignmentSchema = z.object({
  eventId: z.string(),
  slug: z.string().optional(),
  userId: z.string(),
  name: z.string(),
  email: z.string().optional(),
  role: z.literal('STAFF'),
  assignedAt: z.string(),
});

export type StaffAssignment = z.infer<typeof staffAssignmentSchema>;

const dataRoot = process.env.SUMMAPASS_DATA_DIR ?? join(process.cwd(), '.data');

export function loadStaffAssignments(): StaffAssignment[] {
  const path = join(dataRoot, 'staff_assignments.json');
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    return z.array(staffAssignmentSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveStaffAssignments(items: StaffAssignment[]) {
  mkdirSync(dataRoot, { recursive: true });
  const target = join(dataRoot, 'staff_assignments.json');
  const temp = join(dataRoot, 'staff_assignments.tmp');
  writeFileSync(temp, JSON.stringify(items, null, 2), 'utf8');
  renameSync(temp, target);
}

