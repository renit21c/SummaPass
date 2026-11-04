import { BookingError } from '../booking/types';

// Also bounds chunked uploads; Content-Length alone is not authoritative.
export async function coverFormData(request: Request, maximum = 6 * 1024 * 1024) {
  if (Number(request.headers.get('content-length')) > maximum) throw new BookingError('UPLOAD_SIZE', 'File terlalu besar.', 413);
  if (!request.body) throw new BookingError('INPUT', 'Pilih file cover.', 400);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new BookingError('UPLOAD_SIZE', 'File terlalu besar.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData(); }
  catch { throw new BookingError('INPUT', 'Format upload tidak valid.', 400); }
}
