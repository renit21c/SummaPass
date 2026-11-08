import { eventInput } from './core';
export type EditorValues = Record<string, string>;
export function editorValidation(values: EditorValues, customSeating = false) {
 const body: Record<string, unknown> = { ...values };
 for (const name of ['price', 'frontPrice', 'frontQuota', 'regularQuota']) body[name] = customSeating ? (name.endsWith('Quota') ? 24 : 0) : values[name]?.trim() ? Number(values[name]) : NaN;
 for (const name of ['startsAt', 'endsAt', 'salesStart', 'salesEnd']) {
  const raw = values[name] ?? '';
  const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? new Date(raw + ':00+07:00') : null;
  body[name] = date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
 }
 const result = eventInput.safeParse(body);
 const errors: Record<string, string> = {};
 if (!result.success) for (const issue of result.error.issues) errors[String(issue.path[0])] ??= issue.message;
 return { result, errors };
}
export function coverFileError(file: Pick<File, 'size' | 'type'>): string | undefined {
 if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Gunakan file JPG, PNG, atau WebP.';
 if (file.size > 5 * 1024 * 1024) return 'Ukuran cover maksimal 5 MB.';
 if (!file.size) return 'File cover kosong. Pilih gambar lain.';
}
export function coverDimensionsError(width: number, height: number): string | undefined {
 if (width < 400 || height < 250) return 'Cover minimal 400 × 250 piksel.';
 if (width * height > 24_000_000) return 'Resolusi cover maksimal 24 megapiksel.';
}
