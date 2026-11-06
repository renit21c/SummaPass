import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { BookingError } from '@/features/booking/types';
export function notificationAdmin(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new BookingError('CONFIGURATION','Koneksi notifikasi belum dikonfigurasi.',503);return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
