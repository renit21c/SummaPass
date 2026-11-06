import { mkdir,writeFile } from 'node:fs/promises';
import { generateTicketsPdf } from '../src/features/tickets/pdf';
import { events } from '../src/features/events/data';
import type { Ticket } from '../src/features/tickets/types';
const ticket:Ticket={id:'33333333-3333-4333-8333-333333333333',reference:'SPT-33333333333343338333333333333333',bookingId:'22222222-2222-4222-8222-222222222222',slug:events[0].slug,categoryName:'Front',seatId:'Front-A1',seatLabel:'Front A1',attendeeName:'Nadia Prameswari',price:175000,issuedAt:'2026-11-06T07:00:00Z',status:'ACTIVE',token:'0123456789abcdef'.repeat(4)};
const long={...ticket,id:'44444444-4444-4444-8444-444444444444',reference:'SPT-44444444444444448444444444444444',attendeeName:'Élodie Putri Rahmawati Kusumawardhani - Peserta Workshop Keluarga dan Komunitas Kreatif Bandung',categoryName:'Early Bird Premium untuk Area Ballroom dan Balkon',seatLabel:'Balkon Utama Sebelah Panggung - AA128',token:'fedcba9876543210'.repeat(4)};
const longEvent={...events[0],title:'Festival Musik dan Karya Kreatif Bersama Komunitas Bandung untuk Akhir Pekan yang Penuh Aktivitas',area:'Gedung Kegiatan Komunitas, Lantai 2, Area Timur dekat pintu masuk utama dan meja registrasi peserta, Bandung, Jawa Barat'};
async function main(){await mkdir('output/pdf',{recursive:true});await writeFile('output/pdf/summapass-e-ticket-preview.pdf',await generateTicketsPdf([{ticket,event:events[0]},{ticket:long,event:longEvent}]));console.log('Created fictional two-page ticket preview.');

}
main().catch(error=>{console.error(error);process.exitCode=1;});
