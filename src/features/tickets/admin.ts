import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { BookingError } from '@/features/booking/types';
export function paymentConfiguration(){const key=process.env.SUMMAPASS_TICKET_KEY_V1;const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;const url=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!key||!/^[a-fA-F0-9]{64}$/.test(key)||!serviceKey||!url)throw new BookingError('PAYMENT_UNAVAILABLE','Pembayaran simulasi belum dikonfigurasi. Silakan hubungi penyelenggara.',503);return {key:Buffer.from(key,'hex'),client:createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})};}
