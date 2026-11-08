import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUMMAPASS_TICKET_KEY_V1'];
const missing = names.filter(name => !process.env[name]);
if (missing.length) { console.error('Konfigurasi belum lengkap: ' + missing.join(', ')); process.exit(1); }
if (!/^[a-fA-F0-9]{64}$/.test(process.env.SUMMAPASS_TICKET_KEY_V1)) { console.error('SUMMAPASS_TICKET_KEY_V1 harus 64 karakter hex.'); process.exit(1); }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function requireResult(label, operation) {
  const result = await operation;
  if (result.error) throw new Error(label + ' gagal. Periksa koneksi, key, dan migrasi.');
  console.log('OK: ' + label); return result.data;
}
try {
  const events = await requireResult('Katalog publik', anonymous.rpc('public_catalog', { p_slug: null }));
  if (!Array.isArray(events)) throw new Error('Kontrak katalog tidak sesuai.');
  await requireResult('Kolom katalog', admin.from('events').select('id,theme,area,organizer_name,cover_url').limit(1));
  await requireResult('Snapshot tiket', admin.from('tickets').select('id,event_snapshot').limit(1));
  await requireResult('Audit dan check-in', admin.from('audit_logs').select('id').limit(1));
  await requireResult('Catatan kehadiran', admin.from('check_ins').select('ticket_id').limit(1));
  const bucket = await requireResult('Bucket cover', admin.storage.getBucket('event-covers'));
  if (bucket.public || bucket.file_size_limit !== 5242880 || !bucket.allowed_mime_types?.includes('image/webp')) throw new Error('Bucket cover harus privat dan dibatasi WebP 5 MB.');
  const denied = await anonymous.rpc('manage_event', { p_action: 'create', p_id: null, p_data: {} });
  if (!denied.error || denied.error.code !== '42501') throw new Error('RPC pengelolaan harus menolak akses anonim atau migrasi belum lengkap.');
  if(process.argv.includes('--rate-limits')) {
    await requireResult('Penghitung pembatasan request', admin.from('request_limit_buckets').select('reset_at').limit(1));
    const denied=await anonymous.rpc('consume_request_limit',{p_key:'0'.repeat(64),p_limit:1,p_window:60});
    if(denied.error?.code!=='42501')throw new Error('RPC rate limit harus menolak akses anonim. Periksa migrasi 016.');
    console.log('OK: RPC rate limit menolak akses anonim');
  }
  if(process.argv.includes('--seating')) {
    await requireResult('Versi dan ukuran denah', admin.from('events').select('id,seating_version,seating_managed,seating_width,seating_height').limit(1));
    await requireResult('Section per event', admin.from('venue_sections').select('id,event_id').limit(1));
    await requireResult('Status kategori', admin.from('ticket_categories').select('id,is_active').limit(1));
    await requireResult('Snapshot nama kategori', admin.from('bookings').select('id,category_name_snapshot').limit(1));
    for(const [name,args] of [
      ['seating_configuration',{p_event:'00000000-0000-4000-8000-000000000000'}],
      ['configure_event_layout',{p_event:'00000000-0000-4000-8000-000000000000',p_version:0,p_layout:{}}],
      ['configure_ticket_category',{p_event:'00000000-0000-4000-8000-000000000000',p_category:null,p_version:0,p_data:{}}]
    ]){const denied=await anonymous.rpc(name,args);if(denied.error?.code!=='42501')throw new Error('Akses anonim konfigurasi denah harus ditolak. Periksa migrasi 010.');}
    console.log('OK: RPC denah menolak akses anonim');
  }
  if(process.argv.includes('--notifications')) {
    await requireResult('Notifikasi per akun', admin.from('notifications').select('id,user_id,kind,read_at,dismissed_at').limit(1));
    await requireResult('Preferensi pengingat', admin.from('notification_preferences').select('user_id,booking_reminders,event_reminders,email_reminders').limit(1));
    await requireResult('Antrean email', admin.from('notification_outbox').select('id,status,attempts,lease_until').limit(1));
    for(const [name,args] of [
      ['list_notifications',{p_cursor:null,p_limit:1}],
      ['request_ticket_email',{p_ticket:'00000000-0000-4000-8000-000000000000',p_key:'00000000-0000-4000-8000-000000000000'}],
      ['claim_notification_emails',{p_limit:0}]
    ]){const denied=await anonymous.rpc(name,args);if(denied.error?.code!=='42501')throw new Error('Akses anonim notifikasi harus ditolak. Periksa migrasi 011.');}
    console.log('OK: RPC notifikasi menolak akses anonim');
    const pdf = await requireResult('Lampiran PDF email', admin.rpc('notification_pdf_configuration'));
    if(pdf?.version!==2)throw new Error('Terapkan migrasi 012 untuk email dengan PDF.');
  }
  if(process.argv.includes('--operations')) {
    const configuration=await requireResult('Operasional notifikasi versi 3',admin.rpc('notification_operations_configuration'));
    if(configuration?.version!==3)throw new Error('Terapkan migrasi 013 sampai 015.');
    await requireResult('Undangan petugas',admin.from('staff_invitations').select('id,status,expires_at').limit(1));
    await requireResult('Pembatalan event',admin.from('events').select('id,cancelled_at').limit(1));
    await requireResult('Receipt pengiriman',admin.from('notification_receipts').select('webhook_id,event_type').limit(1));
    const id='00000000-0000-4000-8000-000000000000';
    for(const [name,args] of [
      ['invite_event_staff',{p_event:id,p_email:'metadata@example.test',p_key:id}],
      ['accept_staff_invitation',{p_id:id}],
      ['cancel_event',{p_event:id,p_reason:'Metadata check only',p_key:id}],
      ['notification_operations',{p_event:id}],
      ['record_notification_receipt',{p_webhook:null,p_provider:null,p_type:'email.delivered',p_at:null}]
    ]){const denied=await anonymous.rpc(name,args);if(denied.error?.code!=='42501')throw new Error('RPC operasional harus menolak akses anonim: '+name);}
    console.log('OK: RPC operasional menolak akses anonim');
  }
  console.log('Selesai. Pemeriksaan ini hanya membaca konfigurasi dan metadata; bukan bukti pengujian transaksi atau Storage RLS lengkap.');
} catch (error) { console.error(error instanceof Error ? error.message : 'Pemeriksaan Supabase gagal.'); process.exitCode = 1; }
