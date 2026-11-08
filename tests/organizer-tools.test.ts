import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { catalogDb, asUser, actors, newEvent } from "./helpers/catalog-db";
import { createTicketPack } from "../src/features/tickets/crypto";
import { renderEmail } from "../src/features/notifications/email";
import {
  csv,
  parseAttendeeCsv,
  inReportRange,
  reportRange,
  type AttendeeRow,
} from "../src/features/organizer/tools-core";
import type { Booking, Inventory } from "../src/features/booking/types";
import type { SeatingConfig } from "../src/features/seating/core";
async function rpc<T = Record<string, unknown>>(
  db: PGlite,
  name: string,
  args: unknown[] = [],
) {
  return (
    await db.query<{ r: T }>(
      "select public." +
        name +
        "(" +
        args.map((_, i) => "$" + (i + 1)).join(",") +
        ") r",
      args.map((x) =>
        x !== null && typeof x === "object" ? JSON.stringify(x) : x,
      ),
    )
  ).rows[0].r;
}
test("participant CSV handles quoted multiline values, rejects ambiguous files and protects report exports", () => {
  const announcement = renderEmail({
    from: "SummaPass <tickets@example.test>",
    to: "user@example.test",
    origin: "https://example.test",
    title: '"'.repeat(120),
    message: '"'.repeat(2000),
    link: "/my-tickets",
  });
  assert.ok(announcement.html.includes("&quot;"));
  const id = randomUUID(),
    header = ["id", "revision", "name", "email", "notes"];
  const value = csv([
    header,
    [id, 0, 'Peserta, "A"', "a@example.test", "Baris 1\nBaris 2"],
  ]);
  assert.deepEqual(parseAttendeeCsv(value), [
    {
      id,
      revision: 0,
      name: 'Peserta, "A"',
      email: "a@example.test",
      notes: "Baris 1\nBaris 2",
    },
  ]);
  for (const invalid of [
    "x,y\n1,2",
    'id,revision,name,email,notes\n"unterminated',
    csv([header, [id, 0, "A", "", ""], [id, 1, "B", "", ""]]),
  ])
    assert.throws(() => parseAttendeeCsv(invalid));
  assert.match(csv([['=HYPERLINK("bad")']]), /"'=HYPERLINK/);
  assert.ok(
    inReportRange("2030-01-01T17:00:00Z", {
      from: "2030-01-02",
      to: "2030-01-02",
    }),
  );
  assert.equal(
    inReportRange("2030-01-01T16:59:59Z", { from: "2030-01-02" }),
    false,
  );
  assert.equal(reportRange.safeParse({ from: "2030-02-30" }).success, false);
  assert.equal(
    reportRange.safeParse({ from: "2030-02-02", to: "2030-02-01" }).success,
    false,
  );
});
test("organizer tools isolate events, duplicate geometry, atomically import names, and deduplicate announcements", async () => {
  const db = await catalogDb();
  try {
    await asUser(db, actors.organizer);
    const event = await rpc<{ id: string; slug: string }>(db, "manage_event", [
      "create",
      null,
      newEvent(),
    ]);
    const original = await rpc<SeatingConfig>(db, "seating_configuration", [
      event.id,
    ]);
    const key = randomUUID(),
      start = "2031-01-01T09:00:00Z";
    const clone = await rpc<{
      id: string;
      status: string;
      customSeating: boolean;
    }>(db, "duplicate_organizer_event", [event.id, key, start]);
    assert.ok(clone.id);
    assert.notEqual(clone.id, event.id);
    assert.equal(clone.status, "DRAFT");
    assert.equal(clone.customSeating, true);
    assert.equal(
      (
        await rpc<{ id: string }>(db, "duplicate_organizer_event", [
          event.id,
          key,
          start,
        ])
      ).id,
      clone.id,
    );
    assert.equal(
      (
        await rpc(db, "duplicate_organizer_event", [
          event.id,
          key,
          "2031-02-01T09:00:00Z",
        ])
      ).error,
      "KEY_REUSED",
    );
    const copied = await rpc<SeatingConfig>(db, "seating_configuration", [
      clone.id,
    ]);
    assert.equal(copied.sections.flatMap((s) => s.seats).length, 48);
    assert.ok(
      copied.sections.every(
        (s) => !original.sections.some((x) => x.id === s.id),
      ),
    );
    assert.ok(
      copied.categories.every(
        (s) => !original.categories.some((x) => x.id === s.id),
      ),
    );
    assert.equal(
      (await rpc<AttendeeRow[]>(db, "organizer_attendees", [clone.id])).length,
      0,
    );
    await rpc(db, "manage_event", ["publish", event.id, {}]);
    await asUser(db, actors.buyer);
    const inv = await rpc<Inventory>(db, "seat_inventory", [event.slug]),
      category = inv.categories[0];
    const available = inv.seats
      .filter((s) => category.sections.includes(s.section))
      .slice(0, 2);
    const booking = await rpc<Booking>(db, "reserve_booking", [
      event.slug,
      category.id,
      available.map((s, i) => ({ seatId: s.id, name: "Peserta " + i })),
      randomUUID(),
    ]);
    await db.exec("reset role");
    await rpc(db, "process_simulated_payment", [
      actors.buyer,
      booking.id,
      "success",
      booking.items.map((i) => createTicketPack(i.seatId, randomBytes(32))),
    ]);
    await asUser(db, actors.organizer);
    let rows = await rpc<AttendeeRow[]>(db, "organizer_attendees", [event.id]);
    assert.equal(rows.length, 2);
    const period = await rpc<string[]>(db, "organizer_booking_period", [
      "2026-01-01",
      "2035-01-01",
    ]);
    assert.ok(period.includes(booking.id));
    assert.deepEqual(
      await rpc(db, "organizer_booking_period", ["2035-01-01", "2035-01-02"]),
      [],
    );
    const changes = rows.map((r) => ({
      id: r.id,
      revision: r.revision,
      name: "Nama baru",
      email: "test@example.test",
      notes: "Catatan",
    }));
    assert.equal(
      (
        await rpc(db, "update_event_attendees", [
          event.id,
          [changes[0], { ...changes[1], revision: 99 }],
          "Perbaikan nama",
        ])
      ).error,
      "VERSION_CONFLICT",
    );
    assert.ok(
      (await rpc<AttendeeRow[]>(db, "organizer_attendees", [event.id])).every(
        (r) => r.revision === 0,
      ),
    );
    assert.equal(
      (
        await rpc(db, "update_event_attendees", [
          event.id,
          changes,
          "Perbaikan nama",
        ])
      ).updated,
      2,
    );
    rows = await rpc<AttendeeRow[]>(db, "organizer_attendees", [event.id]);
    assert.ok(rows.every((r) => r.revision === 1 && r.name === "Nama baru"));
    await assert.rejects(() =>
      db.query("update public.attendees set display_name=$1 where id=$2", [
        "Bypass",
        rows[0].id,
      ]),
    );
    await db.exec("reset role");
    const items = await db.query<{ id: string; seat_id: string }>(
      "select id,seat_id from public.booking_items where booking_id=$1",
      [booking.id],
    );
    await db.query(
      "insert into public.event_access(event_id,user_id,role) values($1,$2,$3)",
      [event.id, actors.staff, "STAFF"],
    );
    await asUser(db, actors.staff);
    const ticket = await db.query<{ reference: string }>(
      "select t.reference from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.booking_id=$1",
      [booking.id],
    );
    // Ticket rows are visible to assigned staff through check-in RPC, not direct table policies.
    await db.exec("reset role");
    const ref = (
      await db.query<{ reference: string }>(
        "select t.reference from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.id=$1",
        [items.rows[0].id],
      )
    ).rows[0].reference;
    await asUser(db, actors.staff);
    await rpc(db, "validate_check_in", [event.slug, ref, null, true]);
    await asUser(db, actors.organizer);
    const checked = (
      await rpc<AttendeeRow[]>(db, "organizer_attendees", [event.id])
    ).find((r) => !!r.checkedInAt)!;
    assert.ok(checked);
    assert.equal(
      (
        await rpc(db, "update_event_attendees", [
          event.id,
          [{ ...checked, name: "Tidak boleh" }],
          "Alasan perubahan",
        ])
      ).error,
      "INPUT",
    );
    const announcement = randomUUID();
    assert.equal(
      (
        await rpc(db, "send_event_announcement", [
          event.id,
          announcement,
          "Info event",
          "Pintu masuk dipindahkan ke lobi barat.",
        ])
      ).recipients,
      1,
    );
    assert.equal(
      (
        await rpc(db, "send_event_announcement", [
          event.id,
          announcement,
          "Info event",
          "Pintu masuk dipindahkan ke lobi barat.",
        ])
      ).duplicate,
      true,
    );
    assert.equal(
      (
        await rpc(db, "send_event_announcement", [
          event.id,
          randomUUID(),
          "Info lain",
          "Pintu masuk dipindahkan ke lobi timur.",
        ])
      ).error,
      "RATE_LIMIT",
    );
    assert.equal(
      (await rpc<unknown[]>(db, "organizer_announcements", [event.id])).length,
      1,
    );
    for (const actor of [actors.buyer, actors.other, actors.staff]) {
      await asUser(db, actor);
      for (const [name, args] of [
        ["organizer_attendees", [event.id]],
        ["organizer_announcements", [event.id]],
        ["duplicate_organizer_event", [event.id, randomUUID(), start]],
        ["update_event_attendees", [event.id, changes, "Perubahan tidak sah"]],
        [
          "send_event_announcement",
          [event.id, randomUUID(), "Pengumuman", "Ini tidak boleh terkirim."],
        ],
      ] as [string, unknown[]][]) {
        assert.equal((await rpc(db, name, args)).error, "FORBIDDEN");
      }
    }
    await asUser(db);
    await assert.rejects(() => rpc(db, "organizer_attendees", [event.id]));
  } finally {
    await db.close();
  }
});
