import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { ticket } from '@/features/booking/service';
import { publicEvent } from '@/features/catalog/service';
import { generateTicketPdf } from '@/features/tickets/pdf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID tiket tidak valid.' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
  }

  try {
    const ticketData = await ticket(session.id, id);
    const event = ticketData.event ?? await publicEvent(ticketData.slug);
    if (!event) {
      return NextResponse.json({ error: 'Data acara tidak ditemukan.' }, { status: 404 });
    }

    const pdfBuffer = await generateTicketPdf(ticketData, event);
    const uint8 = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="SummaPass-Ticket-${ticketData.reference}.pdf"`,
        'Content-Length': String(uint8.byteLength),
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    return NextResponse.json({ error: 'Tiket tidak ditemukan atau Anda tidak memiliki akses.' }, { status: 404 });
  }
}
