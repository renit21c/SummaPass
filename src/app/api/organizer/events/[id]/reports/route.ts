import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventAttendees } from "@/features/organizer/tools-service";
import {
  csv,
  editableAttendeesCsv,
  inReportRange,
  reportRange,
} from "@/features/organizer/tools-core";
import { seatingFailure } from "@/features/seating/http";
export async function GET(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const range = reportRange.parse({
      from: r.nextUrl.searchParams.get("from") || undefined,
      to: r.nextUrl.searchParams.get("to") || undefined,
    });
    const type = z
      .enum(["attendance", "attendees", "import"])
      .parse(r.nextUrl.searchParams.get("type") ?? "attendees");
    const rows = (await eventAttendees(id)).filter((x) =>
      inReportRange(x.createdAt, range),
    );
    const body =
      type === "import"
        ? editableAttendeesCsv(
            rows.filter(
              (x) =>
                x.status === "CONFIRMED" &&
                x.paymentStatus === "PAID" &&
                !x.checkedInAt,
            ),
          )
        : csv([
            [
              "Referensi",
              "Peserta",
              "Email peserta",
              "Kategori",
              "Kursi",
              "Status pesanan",
              "Pembayaran",
              "Kehadiran",
              "Waktu check-in",
              "Waktu pemesanan",
            ],
            ...rows
              .filter(
                (x) =>
                  type !== "attendance" ||
                  (x.status === "CONFIRMED" && x.paymentStatus === "PAID"),
              )
              .map((x) => [
                x.reference,
                x.name,
                x.email,
                x.category,
                x.seat,
                x.status,
                x.paymentStatus,
                x.checkedInAt ? "Hadir" : "Belum hadir",
                x.checkedInAt ?? "",
                x.createdAt,
              ]),
          ]);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="summapass-' + type + '.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return seatingFailure(e);
  }
}
