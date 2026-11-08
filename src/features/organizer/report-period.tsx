import Link from "next/link";
export function ReportPeriod({
  range,
}: {
  range: { from?: string; to?: string };
}) {
  return (
    <section className="manage-card" style={{ margin: "24px" }}>
      <form action="/organizer" className="manage-actions">
        <label>
          Dari tanggal pemesanan (WIB)
          <input type="date" name="from" defaultValue={range.from} />
        </label>
        <label>
          Sampai tanggal (WIB)
          <input type="date" name="to" defaultValue={range.to} />
        </label>
        <button className="button">Terapkan periode</button>
        <Link className="text-link" href="/organizer">
          Semua tanggal
        </Link>
      </form>
      <p className="manage-hint">
        Periode memfilter pemesanan, pendapatan, dan tiket terjual. Ketersediaan
        kursi dan kehadiran di ringkasan tetap menampilkan kondisi terkini.
        Laporan kehadiran per periode tersedia di pengelolaan event.
      </p>
    </section>
  );
}
