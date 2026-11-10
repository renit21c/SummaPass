import Link from "next/link";
export function ReportPeriod({
  range,
}: {
  range: { from?: string; to?: string };
}) {
  return (
    <section className="organizer-period-bar" aria-label="Filter periode laporan">
      <form action="/organizer" className="organizer-period-form">
        <strong>Periode laporan</strong>
        <label>
          Dari
          <input type="date" name="from" defaultValue={range.from} />
        </label>
        <label>
          Sampai
          <input type="date" name="to" defaultValue={range.to} />
        </label>
        <button className="button button-small" type="submit">Terapkan</button>
        <Link className="text-link" href="/organizer">
          Semua tanggal
        </Link>
      </form>
      <p>Tanggal pemesanan dalam WIB. Kursi tersedia dan kehadiran ringkasan tetap mengikuti kondisi terkini.</p>
    </section>
  );
}
