import { ValidatedForm, FieldLabel } from '@/components/form-fields';
import Link from "next/link";
export function ReportPeriod({
  range,
}: {
  range: { from?: string; to?: string };
}) {
  return (
    <section className="organizer-period-bar" aria-label="Filter periode laporan">
      <ValidatedForm action="/organizer" className="organizer-period-form">
        <strong>Periode laporan</strong>
        <FieldLabel>
          Dari
          <input type="date" name="from" defaultValue={range.from} />
        </FieldLabel>
        <FieldLabel>
          Sampai
          <input type="date" name="to" defaultValue={range.to} />
        </FieldLabel>
        <button className="button button-small" type="submit">Terapkan</button>
        <Link className="text-link" href="/organizer">
          Semua tanggal
        </Link>
      </ValidatedForm>
      <p>Tanggal pemesanan dalam WIB. Kursi tersedia dan kehadiran ringkasan tetap mengikuti kondisi terkini.</p>
    </section>
  );
}
