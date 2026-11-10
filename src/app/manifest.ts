import type { MetadataRoute } from 'next';

export default function manifest():MetadataRoute.Manifest{
 return {
  id:'/',name:'SummaPass',short_name:'SummaPass',lang:'id',
  description:'Cari event, pesan kursi, dan kelola e-ticket di SummaPass.',
  start_url:'/',scope:'/',display:'standalone',
  background_color:'#fff9f2',theme_color:'#ff681c',
  icons:[
   {src:'/pwa/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
   {src:'/pwa/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
   {src:'/pwa/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
  ],
  shortcuts:[
   {name:'Cari event',url:'/events'},
   {name:'Tiket saya',url:'/my-tickets'},
   {name:'Pesanan saya',url:'/bookings'}
  ]
 };
}
