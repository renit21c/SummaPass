import "server-only";
import { randomUUID } from "node:crypto";
import {
  organizer,
  managedEvent,
  coverEvent,
} from "@/features/catalog/service";
import { catalogResult } from "@/features/catalog/contract";
import {
  readCover,
  storeCover,
  discardUnusedCover,
} from "@/features/catalog/storage";
import { supabaseServer } from "@/lib/supabase/server";
import { BookingError } from "@/features/booking/types";
import { attendeeRow, toolsMutation } from "./tools-core";
export async function organizerToolsRpc(
  name: string,
  args: Record<string, unknown>,
) {
  const user = await organizer();
  if (user.mode !== "supabase")
    throw new BookingError(
      "SUPABASE_REQUIRED",
      "Fitur ini memerlukan Supabase.",
      409,
    );
  const { data, error } = await (await supabaseServer()).rpc(name, args);
  if (error)
    throw new BookingError(
      "DATABASE",
      "Periksa koneksi dan jalankan migrasi 017 untuk fitur organizer.",
      503,
    );
  return catalogResult(data, null);
}
export async function eventAttendees(id: string) {
  return attendeeRow
    .array()
    .parse(await organizerToolsRpc("organizer_attendees", { p_event: id }));
}
export async function mutateOrganizerTools(id: string, raw: unknown) {
  const input = toolsMutation.parse(raw);
  if (input.action === "attendees")
    return organizerToolsRpc("update_event_attendees", {
      p_event: id,
      p_rows: input.rows,
      p_reason: input.reason,
    });
  if (input.action === "announce")
    return organizerToolsRpc("send_event_announcement", {
      p_event: id,
      p_key: input.key,
      p_title: input.title,
      p_message: input.message,
    });
  const source = await managedEvent(id);
  const result = (await organizerToolsRpc("duplicate_organizer_event", {
    p_event: id,
    p_key: input.key,
    p_start: input.startsAt,
  })) as { id: string; coverUrl?: string };
  let warning: string | undefined;
  if (source.coverUrl && !result.coverUrl) {
    const file = result.id + "_" + randomUUID() + ".webp";
    try {
      const bytes = await readCover(
        source.coverUrl.slice("/api/covers/".length),
      );
      await storeCover(file, Buffer.from(bytes));
      await coverEvent(result.id, "/api/covers/" + file);
    } catch {
      await discardUnusedCover(file).catch(() => {});
      warning =
        "Draf dan denah tersalin, tetapi cover gagal disalin. Unggah cover di editor.";
    }
  }
  return { id: result.id, warning };
}
