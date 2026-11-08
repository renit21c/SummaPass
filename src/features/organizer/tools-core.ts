import { z } from "zod";
export const attendeeChange = z.object({
  id: z.string().uuid(),
  revision: z.number().int().min(0),
  name: z.string().trim().min(1).max(100),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  notes: z.string().trim().max(500),
});
export const attendeeRow = attendeeChange.extend({
  bookingId: z.string().uuid(),
  reference: z.string(),
  createdAt: z.string(),
  category: z.string(),
  seat: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  checkedInAt: z.string().nullable(),
  ticketReference: z.string().nullable(),
});
export type AttendeeRow = z.infer<typeof attendeeRow>;
export const toolsMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("attendees"),
      reason: z.string().trim().min(5).max(500),
      rows: z.array(attendeeChange).min(1).max(500),
    })
    .refine((v) => new Set(v.rows.map((r) => r.id)).size === v.rows.length, {
      message: "ID peserta duplikat.",
    }),
  z.object({
    action: z.literal("duplicate"),
    key: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    action: z.literal("announce"),
    key: z.string().uuid(),
    title: z.string().trim().min(3).max(120),
    message: z.string().trim().min(10).max(2000),
  }),
]);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const reportRange = z
  .object({ from: day.optional(), to: day.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Tanggal akhir harus setelah tanggal awal.",
  });
export function inReportRange(
  value: string,
  range: { from?: string; to?: string },
) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return !range.from && !range.to;
  const date = new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}
function csvCell(value: unknown) {
  const s = String(value ?? "");
  return '"' + (/^\s*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
}
export function csv(rows: unknown[][]) {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export const attendeeHeaders = [
  "id",
  "revision",
  "name",
  "email",
  "notes",
] as const;
export function editableAttendeesCsv(rows: AttendeeRow[]) {
  return csv([
    [...attendeeHeaders],
    ...rows.map((r) => attendeeHeaders.map((k) => r[k])),
  ]);
}
// RFC 4180: quotes, escaped quotes, commas, CRLF, and newlines inside a field.
export function parseAttendeeCsv(input: string) {
  if (input.length > 1024 * 1024) throw Error("CSV maksimal 1 MB.");
  const source = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw Error("Tanda kutip CSV tidak valid.");
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && source[i + 1] === "\n") i++;
        rows.push(row);
        row = [];
      }
      continue;
    }
    if (closed) throw Error("Karakter setelah tanda kutip CSV tidak valid.");
    cell += c;
  }
  if (quoted) throw Error("Tanda kutip CSV belum ditutup.");
  if (cell || closed || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (rows[0]?.join(",") !== attendeeHeaders.join(","))
    throw Error("Header CSV harus id,revision,name,email,notes.");
  const body = rows.slice(1).filter((r) => r.some(Boolean));
  if (body.length < 1 || body.length > 500)
    throw Error("CSV harus berisi 1–500 peserta.");
  const result = body.map((r, i) => {
    if (r.length !== 5 || !/^\d+$/.test(r[1]))
      throw Error("Periksa kolom CSV pada baris " + (i + 2) + ".");
    const parsed = attendeeChange.safeParse({
      id: r[0],
      revision: Number(r[1]),
      name: r[2],
      email: r[3],
      notes: r[4],
    });
    if (!parsed.success)
      throw Error("Data peserta tidak valid pada baris " + (i + 2) + ".");
    return parsed.data;
  });
  if (new Set(result.map((r) => r.id)).size !== result.length)
    throw Error("ID peserta tidak boleh duplikat.");
  return result;
}
