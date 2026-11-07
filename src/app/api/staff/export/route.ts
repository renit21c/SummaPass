import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { staffReport } from '@/features/check-in/service';
import {
  exportCheckInHistory,
  exportAuditHistory,
  filterCheckInsByPeriod,
  type CheckInPeriod,
} from '@/features/check-in/core';

export async function GET(r: NextRequest) {
  const origin = r.headers.get('origin');
  if (origin && !sameOrigin(r)) {
    return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  }

  try {
    const slug = r.nextUrl.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json({ error: 'Parameter slug diperlukan.' }, { status: 400 });
    }

    const type = r.nextUrl.searchParams.get('type') ?? 'history';
    const rawPeriod = r.nextUrl.searchParams.get('period') ?? 'ALL';
    const period: CheckInPeriod = ['ALL', '1H', '4H', 'TODAY'].includes(rawPeriod)
      ? (rawPeriod as CheckInPeriod)
      : 'ALL';
    const staffScope = r.nextUrl.searchParams.get('staff') ?? 'all';
    const query = (r.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

    const report = await staffReport(slug);

    if (type === 'audits') {
      const csv = exportAuditHistory(report.audits ?? [], report.eventTitle);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="summapass-audit-koreksi-${slug}.csv"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    let records = filterCheckInsByPeriod(report.history, period);

    if (staffScope === 'me') {
      records = records.filter(r => r.isMe);
    }

    if (query) {
      records = records.filter(
        r =>
          r.attendeeName.toLowerCase().includes(query) ||
          r.reference.toLowerCase().includes(query) ||
          r.seatLabel.toLowerCase().includes(query) ||
          r.categoryName.toLowerCase().includes(query)
      );
    }

    const csv = exportCheckInHistory(records, report.eventTitle);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="summapass-kehadiran-${slug}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}

