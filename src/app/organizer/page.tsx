import Link from "next/link";
import { requireSession, canAccessRole } from "@/lib/auth/session";
import { organizerReportSnapshot } from "@/features/organizer/service";
import { OrganizerDashboard } from "@/features/organizer/dashboard";
import { reportRange } from "@/features/organizer/tools-core";
import { ReportPeriod } from "@/features/organizer/report-period";
export const metadata = {
  title: "Dashboard organizer",
  robots: { index: false, follow: false },
};
export default async function Organizer({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession("/organizer");
  if (!(await canAccessRole(user, "ORGANIZER")))
    return (
      <main id="main" className="container section empty-state">
        <h1>Akses terbatas.</h1>
        <p>Akun ini belum ditugaskan sebagai organizer.</p>
        <Link className="button" href="/account">
          Kembali ke akun
        </Link>
      </main>
    );
  const params = await searchParams;
  const range = reportRange.safeParse({
    from: params.from || undefined,
    to: params.to || undefined,
  });
  if (!range.success)
    return (
      <main id="main" className="container section">
        <h1>Rentang tanggal tidak valid.</h1>
        <Link href="/organizer">Reset filter</Link>
      </main>
    );
  try {
    const data = await organizerReportSnapshot(range.data);
    return (
      <main id="main" className="organizer-page">
        <ReportPeriod range={range.data} />
        <div className="organizer-container"><OrganizerDashboard data={data} range={range.data} /></div>
      </main>
    );
  } catch {
    return (
      <main id="main" className="container section empty-state">
        <h1>Dashboard belum dapat dimuat.</h1>
        <p>Coba muat ulang halaman.</p>
        <Link className="button" href="/organizer">
          Coba lagi
        </Link>
      </main>
    );
  }
}
