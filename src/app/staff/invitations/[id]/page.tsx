import { z } from 'zod';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { operationRpc } from '@/features/operations/service';
import { InvitationAccept } from '@/features/operations/invitation-accept';
import { BookingError } from '@/features/booking/types';
export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = z.string().uuid().safeParse((await params).id);
  if (!parsedId.success) notFound();
  const id = parsedId.data;
  await requireSession(`/staff/invitations/${id}`);
  try {
    const invitation = z.object({ id: z.string(), eventTitle: z.string(), status: z.string(), expiresAt: z.string() }).parse(await operationRpc('staff_invitation', { p_id: id }));
    return <main id="main" className="container section"><InvitationAccept {...invitation} /></main>;
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    return <main id="main" className="container section"><h1>Undangan tidak tersedia</h1><p>{e.message}</p><Link className="button" href="/account">Buka akun</Link></main>;
  }
}
