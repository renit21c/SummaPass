import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/auth/request";
import { seatingBody, seatingFailure } from "@/features/seating/http";
import {
  eventAttendees,
  organizerToolsRpc,
  mutateOrganizerTools,
} from "@/features/organizer/tools-service";
import { runNotifications } from "@/features/notifications/worker";
import { toolsMutation } from "@/features/organizer/tools-core";
type Context = { params: Promise<{ id: string }> };
export const maxDuration = 60;
export async function GET(_: NextRequest, { params }: Context) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const [attendees, announcements] = await Promise.all([
      eventAttendees(id),
      organizerToolsRpc("organizer_announcements", { p_event: id }),
    ]);
    return NextResponse.json(
      { attendees, announcements },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return seatingFailure(e);
  }
}
export async function POST(r: NextRequest, { params }: Context) {
  if (!sameOrigin(r))
    return NextResponse.json(
      { error: "Permintaan tidak diizinkan." },
      { status: 403 },
    );
  try {
    const id = z
        .string()
        .uuid()
        .parse((await params).id),
      input = toolsMutation.parse(await seatingBody(r));
    const result = await mutateOrganizerTools(id, input);
    if (input.action === "announce")
      after(async () => {
        try {
          await runNotifications();
        } catch {
          console.error("announcement worker failed; schedule will retry");
        }
      });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return seatingFailure(e);
  }
}
