import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { managedEvent } from "@/features/catalog/service";
import { BookingError } from "@/features/booking/types";
import { EventWorkspace } from "@/features/organizer/event-workspace";
export const metadata = {
  title: "Kelola event",
  robots: { index: false, follow: false },
};
export default async function ManageEvent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSession("/organizer");
  try {
    return (
      <EventWorkspace
        event={await managedEvent((await params).id)}
        mode={user.mode}
      />
    );
  } catch (e) {
    if (e instanceof BookingError && (e.status === 403 || e.status === 404))
      notFound();
    throw e;
  }
}
