import type { Ticket } from './types';
import type { Event } from '../events/data';
import { dateLabel, rupiah } from '../events/data';

function escapePdfText(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function generateTicketPdf(ticket: Ticket, event: Event): Buffer {
  const width = 595; // A4 width in points
  const height = 842; // A4 height in points

  // Clean strings
  const eventTitle = escapePdfText(event.title);
  const categoryName = escapePdfText(ticket.categoryName);
  const attendeeName = escapePdfText(ticket.attendeeName);
  const seatLabel = escapePdfText(ticket.seatLabel);
  const reference = escapePdfText(ticket.reference);
  const eventDate = escapePdfText(dateLabel(event.date));
  const eventTime = escapePdfText(event.time);
  const venue = escapePdfText(event.area ?? 'Summarecon Mall Bandung');
  const price = escapePdfText(rupiah(ticket.price));
  const issuedAt = escapePdfText(new Date(ticket.issuedAt).toLocaleDateString('id-ID'));

  // PDF stream operations
  let stream = '';

  // Background page tint (soft cream)
  stream += '0.99 0.98 0.96 rg 0 0 595 842 re f\n';

  // Outer Ticket Card Box
  // x: 45, y: 320, w: 505, h: 460
  stream += '0.14 0.13 0.12 RG 2 w 45 320 505 460 re S\n';

  // Ticket Header Banner (Orange / Vibrant brand color)
  stream += '1 0.41 0.11 rg 45 700 505 80 re f\n';
  stream += '0.14 0.13 0.12 RG 1.5 w 45 700 505 80 re S\n';

  // Header Text
  stream += 'BT /F2 26 Tf 1 1 1 rg 65 742 Td (SummaPass) Tj ET\n';
  stream += 'BT /F2 13 Tf 0.95 0.9 0.2 rg 210 742 Td (OFFICIAL E-TICKET) Tj ET\n';
  stream += 'BT /F1 10 Tf 1 1 1 rg 65 718 Td (Summarecon Mall Bandung - Prototipe Tiket Independen) Tj ET\n';

  // Event Title & Category
  stream += 'BT /F2 22 Tf 0.14 0.13 0.12 rg 65 658 Td (' + eventTitle + ') Tj ET\n';
  stream += 'BT /F2 11 Tf 0.4 0.2 0.8 rg 65 640 Td (Kategori: ' + categoryName + ') Tj ET\n';

  // Event Details Box
  stream += '0.95 0.92 0.86 rg 65 540 465 80 re f\n';
  stream += '0.14 0.13 0.12 RG 1 w 65 540 465 80 re S\n';

  stream += 'BT /F1 10 Tf 0.38 0.34 0.3 rg 80 596 Td (WAKTU & TANGGAL) Tj ET\n';
  stream += 'BT /F2 12 Tf 0.14 0.13 0.12 rg 80 580 Td (' + eventDate + ' - ' + eventTime + ') Tj ET\n';

  stream += 'BT /F1 10 Tf 0.38 0.34 0.3 rg 80 562 Td (LOKASI VENUE) Tj ET\n';
  stream += 'BT /F2 11 Tf 0.14 0.13 0.12 rg 80 548 Td (' + venue + ') Tj ET\n';

  // Attendee & Seat Info (Split Box)
  stream += '0.92 0.88 0.98 rg 65 440 225 80 re f\n';
  stream += '0.14 0.13 0.12 RG 1 w 65 440 225 80 re S\n';
  stream += 'BT /F1 10 Tf 0.38 0.34 0.3 rg 80 498 Td (NAMA PESERTA / PEMEGANG TIKET) Tj ET\n';
  stream += 'BT /F2 14 Tf 0.14 0.13 0.12 rg 80 476 Td (' + attendeeName + ') Tj ET\n';
  stream += 'BT /F1 9 Tf 0.4 0.2 0.8 rg 80 454 Td (Status: LUNAS SIMULASI) Tj ET\n';

  stream += '1 0.88 0.27 rg 305 440 225 80 re f\n';
  stream += '0.14 0.13 0.12 RG 1 w 305 440 225 80 re S\n';
  stream += 'BT /F1 10 Tf 0.38 0.34 0.3 rg 320 498 Td (NOMOR KURSI / SECTION) Tj ET\n';
  stream += 'BT /F2 18 Tf 0.14 0.13 0.12 rg 320 472 Td (' + seatLabel + ') Tj ET\n';
  stream += 'BT /F1 9 Tf 0.14 0.13 0.12 rg 320 454 Td (Harga: ' + price + ') Tj ET\n';

  // Dashed Cut Line
  stream += '[4 4] 0 d 0.14 0.13 0.12 RG 1 w 45 420 m 550 420 l S\n';
  stream += '[] 0 d\n'; // reset dash

  // QR & Validation Section
  stream += 'BT /F1 9 Tf 0.38 0.34 0.3 rg 65 398 Td (KODE REFERENSI TIKET: ' + reference + ') Tj ET\n';
  stream += 'BT /F1 8 Tf 0.38 0.34 0.3 rg 65 382 Td (Diterbitkan pada: ' + issuedAt + ' - Tunjukkan dokumen PDF atau QR ini kepada petugas pintu masuk.) Tj ET\n';
  stream += 'BT /F1 8 Tf 0.5 0.5 0.5 rg 65 366 Td (Tiket demo SummaPass. Berlaku untuk verifikasi simulasi di Summarecon Mall Bandung.) Tj ET\n';

  // Simulated QR Code Frame & Markers in Vector
  // Outer QR white container
  stream += '1 1 1 rg 420 335 110 75 re f\n';
  stream += '0.14 0.13 0.12 RG 1 w 420 335 110 75 re S\n';
  // QR pattern blocks
  stream += '0.14 0.13 0.12 rg\n';
  // Top-left square
  stream += '430 380 25 25 re f\n';
  stream += '1 1 1 rg 435 385 15 15 re f\n';
  stream += '0.14 0.13 0.12 rg 439 389 7 7 re f\n';
  // Top-right square
  stream += '495 380 25 25 re f\n';
  stream += '1 1 1 rg 500 385 15 15 re f\n';
  stream += '0.14 0.13 0.12 rg 504 389 7 7 re f\n';
  // Bottom-left square
  stream += '430 342 25 25 re f\n';
  stream += '1 1 1 rg 435 347 15 15 re f\n';
  stream += '0.14 0.13 0.12 rg 439 351 7 7 re f\n';
  // Center data matrix dots
  stream += '465 350 8 8 re f 480 350 8 8 re f 465 365 8 8 re f 480 375 8 8 re f 495 355 8 8 re f\n';

  // Footer Branding note
  stream += 'BT /F1 9 Tf 0.4 0.4 0.4 rg 45 285 Td (SummaPass. Dilindungi hak cipta 2026. Dicetak secara digital melalui sistem tiket SummaPass.) Tj ET\n';

  const streamLength = Buffer.byteLength(stream, 'utf8');

  const objects: string[] = [];
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  objects[3] = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + width + ' ' + height + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n';
  objects[4] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects[5] = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';
  objects[6] = '6 0 obj\n<< /Length ' + streamLength + ' >>\nstream\n' + stream + 'endstream\nendobj\n';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 1; i <= 6; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += objects[i];
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n0 7\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }

  pdf += 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';

  return Buffer.from(pdf, 'utf8');
}

