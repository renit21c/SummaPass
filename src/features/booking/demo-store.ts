import type { CheckInResult,StaffReport,CheckInAuditRecord } from '../check-in/core';
import type { PersistedCheckIn } from '../check-in/persistence';
import type { StaffAssignment } from '../organizer/staff-persistence';
import { seedManaged,eventInput,dateParts,duplicateEventInput,type ManagedEvent,type EventInput } from '../catalog/core';
import { demoOrganizerEvents,type OrganizerSnapshot } from '../organizer/core';
import { createTicketPack,decryptToken,tokenHash } from '../tickets/crypto';
import type { Ticket,StoredTicket } from '../tickets/types';
import { randomUUID,randomBytes } from 'node:crypto';
import { events } from '../events/data';
import { topSellingSlugs } from '../events/trending';
import { optionMutationSchema,participantPrices,type TicketOptions,type TicketCategory,type OptionMutation,type TicketPackage } from '../ticket-options/core';
import type { BookingRequest } from './types';
import { BookingError,reserveSchema,generalAdmissionSchema,type GeneralAdmissionInput,type Booking,type Inventory,type ReserveInput } from './types';
export class DemoBookingStore {
 private packageRequests=new Map<string,{request:string;bookingId:string}>();
 private eventOptions(event:ManagedEvent):TicketOptions{
  if(event.ticketOptions)return event.ticketOptions;
  const general=event.seatingMode==='GENERAL_ADMISSION';
  return event.ticketOptions={version:0,mode:general?'GENERAL_ADMISSION':'SEATED',sections:general?[]:[{name:'Front',capacity:24},{name:'Regular',capacity:24}],categories:(general?['Regular']:['Front','Regular']).map(name=>({id:name.toLowerCase(),name,description:'',price:name==='Front'?event.frontPrice:event.price,quota:name==='Front'?event.frontQuota:event.regularQuota,salesStart:event.salesStart,salesEnd:event.salesEnd,active:true,sections:general?[]:[name],packages:[{id:randomUUID(),name:'Single',participants:1,price:name==='Front'?event.frontPrice:event.price,quota:null,active:true,isDefault:true}]}))};
 }
 ticketOptions(userId:string,eventId:string){const event=this.assignedEvent(userId,eventId);return structuredClone(this.eventOptions(this.catalog.get(event.slug)!));}
 private packageUsage(id:string){
  this.expire();let legacy:{slug:string;categoryId:string}|undefined;
  for(const event of this.catalog.values()){const c=this.eventOptions(event).categories.find(c=>c.packages.some(p=>p.id===id&&p.isDefault));if(c){legacy={slug:event.slug,categoryId:c.id};break;}}
  return [...this.bookings.values()].filter(b=>(b.packageId===id||(!b.packageId&&legacy?.slug===b.slug&&legacy.categoryId===b.categoryId))&&(b.status==='PENDING_PAYMENT'||(b.status==='CONFIRMED'&&[...this.issued.values()].some(t=>t.bookingId===b.id&&t.status==='ACTIVE')))).reduce((n,b)=>n+(b.packageId?(b.packageQuantity??0):b.items.filter(i=>![...this.issued.values()].some(t=>t.bookingId===b.id&&t.seatId===i.seatId&&t.status==='REVOKED')).length),0);
 }
 saveTicketOption(userId:string,eventId:string,raw:OptionMutation){
  const input=optionMutationSchema.parse(raw),assigned=this.assignedEvent(userId,eventId),event=this.catalog.get(assigned.slug)!,options=structuredClone(this.eventOptions(event));
  if(event.status==='ARCHIVED'||event.cancelledAt)throw new BookingError('ARCHIVED','Event ini tidak dapat diubah.');
  if(input.expectedVersion!==options.version)throw new BookingError('VERSION_CONFLICT','Data berubah. Muat ulang dahulu.');
  if(input.kind==='category'){
   const old=options.categories.find(c=>c.id===input.id),data=input.data;
   if(input.id&&!old)throw new BookingError('NOT_FOUND','Kategori tidak ditemukan.',404);
   if(options.categories.some(c=>c.id!==input.id&&c.name===data.name))throw new BookingError('INPUT','Nama kategori harus unik.',400);
   if(!old&&options.categories.length>=30)throw new BookingError('INPUT','Maksimal 30 kategori.',400);
   if(Date.parse(data.salesEnd)>Date.parse(event.startsAt))throw new BookingError('INPUT','Penjualan berakhir paling lambat saat acara mulai.',400);
   if(options.mode==='SEATED'&&(!data.sections.length||data.sections.some(s=>!options.sections.some(x=>x.name===s))||data.quota>options.sections.filter(s=>data.sections.includes(s.name)).reduce((n,s)=>n+s.capacity,0)))throw new BookingError('INPUT','Pilih section dan kuota sesuai kapasitas.',400);
   if(options.mode==='GENERAL_ADMISSION'&&options.categories.filter(c=>c.id!==input.id).reduce((n,c)=>n+c.quota,0)+data.quota>2000)throw new BookingError('INPUT','Total kuota maksimal 2.000 peserta.',400);
   this.expire();const occupied=[...this.bookings.values()].filter(b=>b.slug===event.slug&&b.categoryId===input.id&&(b.status==='PENDING_PAYMENT'||b.status==='CONFIRMED')).reduce((n,b)=>n+b.items.filter(i=>![...this.issued.values()].some(t=>t.bookingId===b.id&&t.seatId===i.seatId&&t.status==='REVOKED')).length,0);
   if(data.quota<occupied)throw new BookingError('QUOTA','Kuota kurang dari tiket terjual dan reservasi aktif.');
   if(occupied&&old&&JSON.stringify(old.sections)!==JSON.stringify(data.sections))throw new BookingError('CATEGORY_LOCKED','Section terkunci karena ada pesanan.');
   if(event.status==='PUBLISHED'&&!data.active&&!options.categories.some(c=>c.id!==input.id&&c.active))throw new BookingError('LAST_CATEGORY','Kategori aktif terakhir tidak dapat dinonaktifkan.');
   const category:TicketCategory={...data,id:old?.id??randomUUID(),sections:options.mode==='GENERAL_ADMISSION'?[]:data.sections,packages:old?old.packages.map(p=>p.isDefault?{...p,price:data.price}:p):[{id:randomUUID(),name:'Single',participants:1,price:data.price,quota:null,active:true,isDefault:true}]};
   options.categories=old?options.categories.map(c=>c.id===old.id?category:c):[...options.categories,category];
  }else{
   const data=input.data,category=options.categories.find(c=>c.id===data.categoryId);if(!category)throw new BookingError('NOT_FOUND','Kategori tidak ditemukan.',404);
   const old=category.packages.find(p=>p.id===input.id);if(input.id&&!old)throw new BookingError('NOT_FOUND','Paket tidak ditemukan.',404);
   if(category.packages.some(p=>p.id!==input.id&&p.name===data.name))throw new BookingError('INPUT','Nama paket harus unik.',400);
   if(!old&&category.packages.length>=20)throw new BookingError('INPUT','Maksimal 20 paket per kategori.',400);
   if(old?.isDefault&&data.participants!==1)throw new BookingError('PACKAGE_LOCKED','Paket Single bawaan tetap 1 peserta.');
   if(old&&data.participants!==old.participants&&[...this.bookings.values()].some(b=>b.packageId===old.id))throw new BookingError('PACKAGE_LOCKED','Jumlah peserta terkunci. Buat paket baru.');
   if(data.quota!==null&&data.quota<this.packageUsage(old?.id??''))throw new BookingError('QUOTA','Kuota paket kurang dari pesanan aktif.');
   if(event.status==='PUBLISHED'&&category.active&&!data.active&&!category.packages.some(p=>p.id!==input.id&&p.active))throw new BookingError('LAST_PACKAGE','Minimal satu paket harus aktif.');
   const pack:TicketPackage={id:old?.id??randomUUID(),name:data.name,participants:data.participants,price:data.price,quota:data.quota,active:data.active,isDefault:old?.isDefault??false};
   category.packages=old?category.packages.map(p=>p.id===old.id?pack:p):[...category.packages,pack];if(pack.isDefault)category.price=pack.price;
  }
  options.version++;event.ticketOptions=options;event.customTicketing=true;return structuredClone(options);
 }
 reservePackage(userId:string,input:BookingRequest):Booking{
  const key=`${userId}:${input.key}`,request=JSON.stringify(input),previous=this.packageRequests.get(key);
  if(previous){if(previous.request!==request)throw new BookingError('KEY_REUSED','Permintaan berubah.');return this.get(userId,previous.bookingId);}
  if(this.keys.has(key))throw new BookingError('KEY_REUSED','Permintaan berubah.');
  const inventory=this.inventory(input.slug,true),event=this.catalog.get(input.slug)!,category=inventory.categories.find(c=>c.id===input.categoryId),pack=category?.packages?.find(p=>p.id===input.packageId),quantity=input.packageQuantity??1;
  if(!pack||!pack.active)throw new BookingError('PACKAGE','Paket tidak tersedia.');
  const items='attendees' in input?input.attendees:input.seats;
  if(items.length!==pack.participants*quantity||items.length>30)throw new BookingError('INPUT','Jumlah peserta harus sesuai paket, maksimal 30.',400);
  if(pack.quota!==null&&this.packageUsage(pack.id)+quantity>pack.quota)throw new BookingError('QUOTA','Kuota paket tidak mencukupi.');
  const general=event.seatingMode==='GENERAL_ADMISSION';
  if(general&&(!('attendees' in input)||(inventory.categories.find(c=>c.id===input.categoryId)?.remaining??0)<items.length))throw new BookingError('QUOTA','Kuota peserta tidak mencukupi.');
  if(!general&&!('seats' in input))throw new BookingError('MODE','Pilih kursi untuk setiap peserta.');
  const units=inventory.seats.filter(s=>s.status==='AVAILABLE'&&category!.sections.includes(s.section)).slice(0,items.length);
  const seats=general?items.map((item,i)=>({seatId:units[i]?.id??'',name:item.name})):('seats' in input?input.seats:[]);
  const booking=this.reserve(userId,{slug:input.slug,categoryId:input.categoryId,seats,key:input.key,packageId:pack.id,packageQuantity:quantity},general,{pack,quantity});
  this.packageRequests.set(key,{request,bookingId:booking.id});return booking;
 }
 private admissionRequests=new Map<string,{request:string;bookingId:string}>();
 private catalog:Map<string,ManagedEvent>; private issued=new Map<string,StoredTicket>(); private encryptionKey=randomBytes(32); private bookings=new Map<string,Booking>(); private keys=new Map<string,string>(); private checkIns:PersistedCheckIn[]=[]; private staffAssignments:StaffAssignment[]=[]; private checkInAudits:CheckInAuditRecord[]=[];
 constructor(private clock=()=>Date.now(),catalog?:ManagedEvent[],initialCheckIns?:PersistedCheckIn[],initialStaff?:StaffAssignment[],initialAudits?:CheckInAuditRecord[]){
  this.catalog=new Map((catalog??events.map(seedManaged)).map(e=>[e.slug,structuredClone(e)]));
  if(initialCheckIns)this.checkIns=[...initialCheckIns];
  if(initialAudits)this.checkInAudits=[...initialAudits];
  if(initialStaff&&initialStaff.length){
   this.staffAssignments=[...initialStaff];
  } else {
   for(const e of this.catalog.values()){
    if(demoOrganizerEvents.includes(e.slug)){
     this.staffAssignments.push({eventId:e.id,slug:e.slug,userId:'staff-demo',name:'Petugas Check-in Demo',email:'petugas@summapass.id',role:'STAFF',assignedAt:'2026-11-03T00:00:00.000Z'});
    }
   }
  }
 }
 private expire(){for(const b of this.bookings.values())if(b.status==='PENDING_PAYMENT'&&Date.parse(b.expiresAt)<=this.clock()){b.status='EXPIRED';b.paymentStatus='EXPIRED';}}
 inventory(slug:string,privateRead=false):Inventory{
  const event=this.catalog.get(slug);if(!event||(!privateRead&&event.status!=='PUBLISHED'))throw new BookingError('NOT_FOUND','Event tidak ditemukan.',404);this.expire();
  const options=this.eventOptions(event);
  const packages=(category:TicketCategory)=>category.packages.filter(p=>p.active).map(p=>({...p,remaining:p.quota===null?null:Math.max(0,p.quota-this.packageUsage(p.id))}));
  if(event.seatingMode==='GENERAL_ADMISSION'){
   const occupied=[...this.bookings.values()].filter(b=>b.slug===slug&&(b.status==='CONFIRMED'||b.status==='PENDING_PAYMENT')).map(b=>({...b,items:b.items.filter(i=>![...this.issued.values()].some(t=>t.bookingId===b.id&&t.seatId===i.seatId&&t.status==='REVOKED'))}));
   const seats:Inventory['seats']=options.categories.flatMap(c=>{
    const bookings=occupied.filter(b=>b.categoryId===c.id);
    const capacity=Math.max(c.quota,...bookings.flatMap(b=>b.items.map(i=>Number(i.seatId.split('-').at(-1))||0)));
    return Array.from({length:capacity},(_,index)=>{const id=c.id==='regular'?`GA-${index+1}`:`${c.id}-GA-${index+1}`,booking=bookings.find(b=>b.items.some(i=>i.seatId===id));return {id,section:c.id,row:'GA',number:index+1,x:0,y:0,status:booking?.status==='CONFIRMED'?'SOLD' as const:booking?'RESERVED' as const:'AVAILABLE' as const};});
   });
   return {eventId:event.id,slug,seatingMode:'GENERAL_ADMISSION',categories:options.categories.filter(c=>c.active).map(c=>{const units=seats.filter(s=>s.section===c.id);return {...c,packages:packages(c),sections:privateRead?[c.id]:[],remaining:Math.max(0,c.quota-units.filter(s=>s.status!=='AVAILABLE').length),sold:units.filter(s=>s.status==='SOLD').length,reserved:units.filter(s=>s.status==='RESERVED').length};}),seats:privateRead?seats:[],serverNow:new Date(this.clock()).toISOString(),mode:'demo'};
  }
  const seats:Inventory['seats']=[];
  for(const [sectionIndex,section] of ['Front','Regular'].entries())for(const [rowIndex,row] of ['A','B','C'].entries())for(let number=1;number<=8;number++){
   const id=`${section}-${row}${number}`;
   const activeIssued=[...this.issued.values()].filter(t=>t.slug===slug&&t.seatId===id);
   const hasActiveTicket=activeIssued.length>0?activeIssued.some(t=>t.status==='ACTIVE'):false;
   const hasUnrefundedBooking=[...this.bookings.values()].some(b=>b.slug===slug&&b.status==='CONFIRMED'&&b.items.some(i=>i.seatId===id)&&!activeIssued.some(t=>t.status==='REVOKED'));
   const sold=(events.some(e=>e.slug===slug)&&section==='Front'&&row==='A'&&number<=2)||hasActiveTicket||(activeIssued.length===0&&hasUnrefundedBooking);
   const held=[...this.bookings.values()].some(b=>b.slug===slug&&b.status==='PENDING_PAYMENT'&&b.items.some(i=>i.seatId===id));
   seats.push({id,section,row,number,x:80+(number-1)*50,y:140+sectionIndex*235+rowIndex*54,status:sold?'SOLD':held?'RESERVED':'AVAILABLE'});
  }
  return {eventId:slug,slug,categories:options.categories.filter(c=>c.active).map(c=>({...c,packages:packages(c),remaining:Math.max(0,c.quota-seats.filter(s=>c.sections.includes(s.section)&&s.status!=='AVAILABLE').length)})),seats,serverNow:new Date(this.clock()).toISOString(),mode:'demo'};
 }
 reserveAdmission(userId:string,raw:GeneralAdmissionInput):Booking{
  const input=generalAdmissionSchema.parse(raw),key=`${userId}:${input.key}`,request=JSON.stringify(input),previous=this.admissionRequests.get(key);
  if(previous){if(previous.request!==request)throw new BookingError('KEY_REUSED','Permintaan berubah. Silakan coba lagi.');return this.get(userId,previous.bookingId);}
  const inventory=this.inventory(input.slug,true),event=this.catalog.get(input.slug)!;
  if(event.status!=='PUBLISHED')throw new BookingError('SALES_CLOSED','Penjualan tidak sedang dibuka.');
  if(event.seatingMode!=='GENERAL_ADMISSION')throw new BookingError('MODE','Pilih kursi untuk event ini.');
  if(!inventory.categories.some(c=>c.id===input.categoryId))throw new BookingError('CATEGORY','Kategori tidak sesuai event.');
  if((inventory.categories.find(c=>c.id===input.categoryId)?.remaining??0)<input.attendees.length)throw new BookingError('QUOTA','Jumlah tiket tersedia tidak mencukupi.');
  if(event.customTicketing)throw new BookingError('PACKAGE_REQUIRED','Pilih jenis paket tiket.');
  const category=inventory.categories.find(c=>c.id===input.categoryId)!;
  const units=inventory.seats.filter(s=>s.status==='AVAILABLE'&&category.sections.includes(s.section)).slice(0,input.attendees.length);
  const booking=this.reserve(userId,{slug:input.slug,categoryId:input.categoryId,key:input.key,seats:units.map((unit,i)=>({seatId:unit.id,name:input.attendees[i].name}))},true);
  this.admissionRequests.set(key,{request,bookingId:booking.id});return booking;
 }
 reserve(userId:string,raw:ReserveInput,admission=false,packageInfo?:{pack:TicketPackage;quantity:number}):Booking{
  const input=reserveSchema.parse(raw);this.expire();const key=`${userId}:${input.key}`;const existing=this.keys.get(key);
  if(existing){const previous=this.bookings.get(existing)!;if(previous.slug!==input.slug||previous.categoryId!==input.categoryId||JSON.stringify(previous.items.map(i=>({seatId:i.seatId,name:i.name})))!==JSON.stringify(input.seats))throw new BookingError('KEY_REUSED','Permintaan berubah. Muat ulang dan coba lagi.');return structuredClone(previous);}
  const inventory=this.inventory(input.slug,admission),event=this.catalog.get(input.slug)!;
  if(!packageInfo&&(input.packageId||event.customTicketing))throw new BookingError('PACKAGE_REQUIRED','Pilih jenis paket tiket.');
  if(event.seatingMode==='GENERAL_ADMISSION'&&!admission)throw new BookingError('MODE','Pilih jumlah tiket untuk event ini.');
  const start=Date.parse(`${event.date}T${event.time.replace(' WIB','').replace('.',':')}:00+07:00`);
  if((!event.customTicketing&&(this.clock()<Date.parse(event.salesStart)||this.clock()>=Date.parse(event.salesEnd)))||this.clock()>=start)throw new BookingError('SALES_CLOSED','Penjualan sudah ditutup atau belum dimulai.');
  const category=inventory.categories.find(c=>c.id===input.categoryId);if(!category)throw new BookingError('CATEGORY','Kategori tidak ditemukan.',400);
  if(this.clock()<Date.parse(category.salesStart??event.salesStart)||this.clock()>=Date.parse(category.salesEnd??event.salesEnd))throw new BookingError('SALES_CLOSED','Penjualan kategori tidak sedang dibuka.');
  const prices=packageInfo?participantPrices(packageInfo.pack.price,packageInfo.pack.participants,packageInfo.quantity):[];
  const chosen=input.seats.map((item,index)=>{const seat=inventory.seats.find(s=>s.id===item.seatId);if(!seat||!category.sections.includes(seat.section))throw new BookingError('CATEGORY','Kursi tidak sesuai kategori.',400);if(seat.status!=='AVAILABLE')throw new BookingError('SEAT_UNAVAILABLE','Pilihan sudah tidak tersedia.');return {...item,label:admission?'Tanpa nomor kursi':`${seat.section} ${seat.row}${seat.number}`,price:prices[index]??category.price};});
  const occupied=inventory.seats.filter(s=>category.sections.includes(s.section)&&s.status!=='AVAILABLE').length;
  if(occupied+chosen.length>category.quota)throw new BookingError('QUOTA','Kuota kategori tidak mencukupi.');
  // No await inside this critical section: one local Node process serializes writes.
  const id=randomUUID();const booking:Booking={id,reference:`SP-${id.slice(0,8).toUpperCase()}`,slug:input.slug,userId,categoryId:category.id,categoryName:category.name,eventTitle:event.title,status:'PENDING_PAYMENT',paymentStatus:'PENDING',expiresAt:new Date(this.clock()+600000).toISOString(),total:chosen.reduce((n,i)=>n+i.price,0),...(packageInfo?{packageId:packageInfo.pack.id,packageName:packageInfo.pack.name,packageSize:packageInfo.pack.participants,packageQuantity:packageInfo.quantity,packagePrice:packageInfo.pack.price}:{}),items:chosen};
  this.bookings.set(id,booking);this.keys.set(key,id);return structuredClone(booking);
 }
 get(userId:string,id:string){this.expire();const b=this.bookings.get(id);if(!b||b.userId!==userId)throw new BookingError('NOT_FOUND','Reservasi tidak ditemukan.',404);return structuredClone(b);}
 findByReference(ref:string){this.expire();const b=[...this.bookings.values()].find(x=>x.reference===ref);return b?structuredClone(b):undefined;}
 list(userId:string){this.expire();return [...this.bookings.values()].filter(b=>b.userId===userId).reverse().map(b=>structuredClone(b));}
 cancel(userId:string,id:string){const b=this.get(userId,id);if(b.status==='PENDING_PAYMENT'){this.bookings.get(id)!.status='CANCELLED';this.bookings.get(id)!.paymentStatus='CANCELLED';}return this.get(userId,id);}
 payment(userId:string,id:string,outcome:'success'|'failure'){
  const snapshot=this.get(userId,id);const b=this.bookings.get(id)!;
  if(snapshot.status==='CONFIRMED')return this.get(userId,id);
  if(snapshot.status!=='PENDING_PAYMENT')throw new BookingError(snapshot.status==='EXPIRED'?'RESERVATION_EXPIRED':'NOT_PAYABLE',snapshot.status==='EXPIRED'?'Waktu reservasi sudah habis. Silakan pilih kursi lagi.':'Reservasi ini tidak dapat dibayar.');
  if(outcome==='failure'){b.status='FAILED';b.paymentStatus='FAILED';return this.get(userId,id);}
  const issued=b.items.map(item=>{const pack=createTicketPack(item.seatId,this.encryptionKey);return {id:pack.ticketId,reference:`SPT-${pack.ticketId.replaceAll('-','').toUpperCase()}`,bookingId:b.id,userId:b.userId,slug:b.slug,categoryName:b.categoryName,packageName:b.packageName,packageSize:b.packageSize,seatId:item.seatId,seatLabel:item.label,attendeeName:item.name,price:item.price,issuedAt:new Date(this.clock()).toISOString(),status:'ACTIVE' as const,event:structuredClone(this.catalog.get(b.slug)!),tokenHash:pack.tokenHash,encryptedToken:pack.encryptedToken};});
  // All tickets are prepared before the atomic single-process state change.
  for(const ticket of issued)this.issued.set(ticket.id,ticket);
  b.status='CONFIRMED';b.paymentStatus='PAID';return this.get(userId,id);
 }
 ticketsFor(userId:string,bookingId?:string):Ticket[]{return [...this.issued.values()].filter(t=>t.userId===userId&&(!bookingId||t.bookingId===bookingId)).map(({userId:owner,tokenHash:hash,encryptedToken,...ticket})=>({...ticket,token:decryptToken(encryptedToken,this.encryptionKey)}));}
 ticket(userId:string,id:string):Ticket{const ticket=this.issued.get(id);if(!ticket||ticket.userId!==userId)throw new BookingError('NOT_FOUND','Tiket tidak ditemukan.',404);return this.ticketsFor(userId,ticket.bookingId).find(t=>t.id===id)!;}
 refundTicket(userId:string,id:string,reason:string){
  const ticket=this.issued.get(id);
  if(!ticket||ticket.userId!==userId)throw new BookingError('NOT_FOUND','Tiket tidak ditemukan.',404);
  if(ticket.status!=='ACTIVE')throw new BookingError('ALREADY_REVOKED','Tiket sudah tidak aktif atau sudah dibatalkan.',409);
  if(ticket.checkedInAt)throw new BookingError('ALREADY_CHECKED_IN','Tiket yang sudah digunakan check-in tidak dapat dibatalkan.',409);
  const event=this.catalog.get(ticket.slug);
  if(event){
   const start=Date.parse(`${event.date}T${event.time.replace(' WIB','').replace('.',':')}:00+07:00`);
   if(this.clock()>=start)throw new BookingError('EVENT_STARTED','Pembatalan hanya dapat dilakukan sebelum acara dimulai.',409);
  }
  const cleanReason=reason?.trim()||'Pengunjung berhalangan hadir';
  ticket.status='REVOKED';
  ticket.cancellationReason=cleanReason;
  ticket.cancelledAt=new Date(this.clock()).toISOString();
  ticket.refundAmount=ticket.price;
  ticket.refundStatus='REFUNDED';
  const booking=this.bookings.get(ticket.bookingId);
  if(booking){
   const remainingActive=[...this.issued.values()].filter(t=>t.bookingId===booking.id&&t.status==='ACTIVE');
   if(!remainingActive.length){
    booking.status='CANCELLED';
    booking.paymentStatus='CANCELLED';
   }
  }
  return {
   ticket:this.ticket(userId,ticket.id),
   refundAmount:ticket.price,
   refundedAt:ticket.cancelledAt,
   reason:cleanReason
  };
 }
 transferTicket(userId:string,id:string,newAttendeeName:string,newAttendeeEmail?:string,reason?:string){
  const ticket=this.issued.get(id);
  if(!ticket||ticket.userId!==userId)throw new BookingError('NOT_FOUND','Tiket tidak ditemukan.',404);
  if(ticket.status!=='ACTIVE')throw new BookingError('ALREADY_REVOKED','Hanya tiket aktif yang dapat dialihkan atau diubah nama pesertanya.',409);
  if(ticket.checkedInAt)throw new BookingError('ALREADY_CHECKED_IN','Tiket yang sudah digunakan check-in tidak dapat dialihkan.',409);
  const event=this.catalog.get(ticket.slug);
  if(event){
   const start=Date.parse(`${event.date}T${event.time.replace(' WIB','').replace('.',':')}:00+07:00`);
   if(this.clock()>=start)throw new BookingError('EVENT_STARTED','Pengalihan tiket hanya dapat dilakukan sebelum acara dimulai.',409);
  }
  const cleanName=newAttendeeName?.trim();
  if(!cleanName||cleanName.length<2)throw new BookingError('INVALID_NAME','Nama peserta baru minimal 2 karakter.',400);

  const prevName=ticket.attendeeName;
  const pack=createTicketPack(ticket.seatId,this.encryptionKey);
  ticket.previousAttendeeName=prevName;
  ticket.attendeeName=cleanName;
  if(newAttendeeEmail)ticket.attendeeEmail=newAttendeeEmail.trim().toLowerCase();
  ticket.transferredAt=new Date(this.clock()).toISOString();
  ticket.tokenHash=pack.tokenHash;
  ticket.encryptedToken=pack.encryptedToken;

  const booking=this.bookings.get(ticket.bookingId);
  if(booking){
   const item=booking.items.find(i=>i.seatId===ticket.seatId);
   if(item)item.name=cleanName;
  }

  return {
   ticket:this.ticket(userId,ticket.id),
   previousAttendeeName:prevName,
   newAttendeeName:cleanName,
   transferredAt:ticket.transferredAt
  };
 }
 organizerSnapshot(userId?:string):OrganizerSnapshot{this.expire();const assigned=[...this.catalog.values()].filter(e=>demoOrganizerEvents.includes(e.slug)||(!!userId&&e.ownerId===userId));return {events:assigned.map(e=>structuredClone(e)),bookings:[...this.bookings.values()].filter(b=>assigned.some(e=>e.slug===b.slug)).reverse().map(b=>structuredClone(b)),inventory:assigned.map(e=>this.inventory(e.slug,true)),attendance:assigned.map(e=>({slug:e.slug,checkedIn:[...this.issued.values()].filter(t=>t.slug===e.slug&&t.checkedInAt).length})),mode:'demo'};}
 publicEvents(){
  const catalog=[...this.catalog.values()].filter(e=>e.status==='PUBLISHED');
  const leaders=topSellingSlugs(catalog.filter(e=>!e.cancelledAt&&Date.parse(e.endsAt)>this.clock()).map(e=>({slug:e.slug,sold:[...this.issued.values()].filter(t=>{const b=this.bookings.get(t.bookingId);return t.slug===e.slug&&t.status==='ACTIVE'&&b?.status==='CONFIRMED'&&b.paymentStatus==='PAID';}).length})));
  return catalog.map(e=>{const prices=e.customTicketing?(e.ticketOptions?.categories.filter(c=>c.active).flatMap(c=>c.packages.filter(p=>p.active).map(p=>p.price))??[]):[e.price];return {...structuredClone(e),price:prices.length?Math.min(...prices):0,ticketOptions:undefined,isTrending:leaders.has(e.slug)};});
 }
 restoreCatalog(items:ManagedEvent[]){this.catalog=new Map(items.map(e=>[e.slug,structuredClone(e)]));}
 catalogItems(){return [...this.catalog.values()].map(e=>structuredClone(e));}
 publicEvent(slug:string){return this.publicEvents().find(e=>e.slug===slug)??null;}
 assignedEvent(userId:string,id:string){const e=[...this.catalog.values()].find(e=>e.id===id);if(!e||(!demoOrganizerEvents.includes(e.slug)&&e.ownerId!==userId))throw new BookingError('FORBIDDEN','Event tidak ditugaskan.',403);return structuredClone(e);}
 createEvent(userId:string,raw:EventInput){const input=eventInput.parse(raw),id=randomUUID(),slug=input.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)+'-'+id.slice(0,8);const e:ManagedEvent={...input,...dateParts(input.startsAt),ownerId:userId,id,slug,status:'DRAFT',headline:input.title.toUpperCase(),coverUrl:''};this.catalog.set(slug,e);return structuredClone(e);}
 duplicateEvent(userId:string,id:string){const source=this.assignedEvent(userId,id);const input=duplicateEventInput(source,this.clock());return this.createEvent(userId,input);}
 updateEvent(userId:string,id:string,raw:EventInput){const old=this.assignedEvent(userId,id),input=eventInput.parse(raw);if((old.seatingMode??'SEATED')!==input.seatingMode)throw new BookingError('MODE_LOCKED','Jenis tiket terkunci setelah event disimpan. Buat event baru.');if(old.status==='ARCHIVED')throw new BookingError('ARCHIVED','Event arsip tidak dapat diedit.');this.expire();const live=[...this.bookings.values()].filter(b=>b.slug===old.slug&&(b.status==='CONFIRMED'||b.status==='PENDING_PAYMENT'));if(live.length&&(Date.parse(input.startsAt)!==Date.parse(old.startsAt)||Date.parse(input.endsAt)!==Date.parse(old.endsAt)||input.area!==old.area))throw new BookingError('EVENT_LOCKED','Jadwal dan lokasi tidak dapat diubah saat ada tiket terjual atau hold aktif.');const inv=this.inventory(old.slug,true);for(const [section,quota] of [['Front',input.frontQuota],['Regular',input.regularQuota]] as const)if(!old.customTicketing&&quota<inv.seats.filter(s=>(s.section===section||(old.seatingMode==='GENERAL_ADMISSION'&&section==='Regular'))&&s.status!=='AVAILABLE').length)throw new BookingError('QUOTA','Kuota tidak boleh di bawah jumlah kursi terjual dan hold aktif.');const e:ManagedEvent={...old,...input,...dateParts(input.startsAt),headline:input.title.toUpperCase(),...(!old.customTicketing?{ticketOptions:undefined}:{})};this.catalog.set(e.slug,e);return structuredClone(e);}
 eventStatus(userId:string,id:string,action:'publish'|'unpublish'|'archive'){const e=this.assignedEvent(userId,id);this.expire();if(e.status==='ARCHIVED')throw new BookingError('ARCHIVED','Event sudah diarsipkan.');if(action==='publish'&&Date.parse(e.startsAt)<=this.clock())throw new BookingError('DATE','Acara yang sudah dimulai tidak dapat dipublikasikan.');if(action==='publish'&&!this.eventOptions(e).categories.some(c=>c.active&&c.packages.some(p=>p.active)))throw new BookingError('INCOMPLETE','Aktifkan minimal satu kategori dan paket sebelum publikasi.');if(action==='archive'&&(Date.parse(e.endsAt)>this.clock()||[...this.bookings.values()].some(b=>b.slug===e.slug&&b.status==='PENDING_PAYMENT')))throw new BookingError('ACTIVE','Arsip hanya setelah acara selesai dan tidak ada hold aktif.');e.status=action==='publish'?'PUBLISHED':action==='unpublish'?'UNPUBLISHED':'ARCHIVED';this.catalog.set(e.slug,e);return structuredClone(e);}
 deleteEvent(userId:string,id:string,confirmation:string){
  const e=this.assignedEvent(userId,id);
  if(confirmation!==e.title)throw new BookingError('INPUT','Ketik nama event persis untuk mengonfirmasi penghapusan.',400);
  const bookingIds=new Set([...this.bookings.values()].filter(b=>b.slug===e.slug).map(b=>b.id));
  const ticketIds=new Set([...this.issued.values()].filter(t=>t.slug===e.slug).map(t=>t.id));
  const removed={bookings:bookingIds.size,tickets:ticketIds.size,checkIns:this.checkIns.filter(c=>c.slug===e.slug).length};
  for(const [key,booking] of this.bookings)if(booking.slug===e.slug)this.bookings.delete(key);
  for(const [key,ticket] of this.issued)if(ticket.slug===e.slug)this.issued.delete(key);
  for(const [key,bookingId] of this.keys)if(bookingIds.has(bookingId))this.keys.delete(key);
  this.checkIns=this.checkIns.filter(c=>c.slug!==e.slug&&!ticketIds.has(c.ticketId));
  this.checkInAudits=this.checkInAudits.filter(a=>a.slug!==e.slug&&!ticketIds.has(a.ticketId));
  this.staffAssignments=this.staffAssignments.filter(s=>s.eventId!==id&&s.slug!==e.slug);
  this.catalog.delete(e.slug);
  return {deleted:true,id,slug:e.slug,title:e.title,coverUrl:e.coverUrl,removed};
 }
 eventCover(userId:string,id:string,url:string){const e=this.assignedEvent(userId,id);if(e.status==='ARCHIVED')throw new BookingError('ARCHIVED','Event arsip tidak dapat diedit.');if(!url.startsWith(`/api/covers/${id}_`)||!/^\/api\/covers\/[a-f0-9-]{36}_[a-f0-9-]{36}\.webp$/.test(url))throw new BookingError('COVER','Cover tidak valid.',400);e.coverUrl=url;this.catalog.set(e.slug,e);return structuredClone(e);}
 getStaffAssignments(){return structuredClone(this.staffAssignments);}
 eventStaff(userId:string,eventId:string):StaffAssignment[]{
  const e=this.assignedEvent(userId,eventId);
  return this.staffAssignments.filter(s=>s.eventId===e.id||s.slug===e.slug);
 }
 assignStaff(userId:string,eventId:string,name:string,targetUserId?:string):StaffAssignment{
  const e=this.assignedEvent(userId,eventId);
  const uid=targetUserId||`staff-${randomUUID().slice(0,8)}`;
  const existing=this.staffAssignments.find(s=>(s.eventId===e.id||s.slug===e.slug)&&(s.userId===uid||s.name.toLowerCase()===name.trim().toLowerCase()));
  if(existing)return structuredClone(existing);
  const item:StaffAssignment={
   eventId:e.id,
   slug:e.slug,
   userId:uid,
   name:name.trim(),
   email:`${name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'.')}@summapass.id`,
   role:'STAFF',
   assignedAt:new Date(this.clock()).toISOString()
  };
  this.staffAssignments.push(item);
  return structuredClone(item);
 }
 unassignStaff(userId:string,eventId:string,targetUserId:string){
  const e=this.assignedEvent(userId,eventId);
  this.staffAssignments=this.staffAssignments.filter(s=>!((s.eventId===e.id||s.slug===e.slug)&&s.userId===targetUserId));
 }
 isStaffAssigned(staffId:string,slug:string):boolean{
  const e=this.catalog.get(slug)??[...this.catalog.values()].find(x=>x.slug===slug||x.id===slug);
  if(!e)return false;
  if(demoOrganizerEvents.includes(e.slug)){
   return true;
  }
  return this.staffAssignments.some(s=>(s.eventId===e.id||s.slug===e.slug)&&(s.userId===staffId||(!staffId&&s.role==='STAFF')));
 }
 staffEvents(staffId?:string){
  return [...this.catalog.values()].filter(e=>this.isStaffAssigned(staffId??'staff-demo',e.slug)&&['PUBLISHED','UNPUBLISHED'].includes(e.status)&&!e.cancelledAt).map(e=>({slug:e.slug,title:e.title}));
 }
 checkIn(staffId:string,slug:string,credential:string,confirm:boolean):CheckInResult{
  if(!this.isStaffAssigned(staffId,slug))throw new BookingError('FORBIDDEN','Event tidak ditugaskan kepada petugas.',403);
  const ticket=[...this.issued.values()].find(t=>/^SPT-[A-F0-9]{32}$/i.test(credential)?t.reference===credential.toUpperCase():t.tokenHash===tokenHash(credential));
  if(!ticket)return {status:'INVALID'};
  if(ticket.slug!==slug)return {status:'WRONG_EVENT'};
  if(ticket.status!=='ACTIVE')return {status:'CANCELLED_OR_REFUNDED'};
  const booking=this.bookings.get(ticket.bookingId);if(!booking||booking.status!=='CONFIRMED'||booking.paymentStatus!=='PAID')return {status:'UNPAID'};
  const view=()=>({id:ticket.id,reference:ticket.reference,attendeeName:ticket.attendeeName,seatLabel:ticket.seatLabel,categoryName:ticket.categoryName,...(ticket.checkedInAt?{checkedInAt:ticket.checkedInAt}:{})});
  if(ticket.checkedInAt)return {status:'ALREADY_USED',ticket:view()};
  if(confirm){
   const now=new Date(this.clock()).toISOString();
   ticket.checkedInAt=now;
   ticket.checkedInBy=staffId;
   this.checkIns.push({
    ticketId:ticket.id,
    reference:ticket.reference,
    attendeeName:ticket.attendeeName,
    seatLabel:ticket.seatLabel,
    categoryName:ticket.categoryName,
    checkedInAt:now,
    staffId,
    slug
   });
   return {status:'CHECKED_IN',ticket:view()};
  }
  return {status:'VALID',ticket:view()};
 }
 getCheckIns(){return structuredClone(this.checkIns);}
 staffReport(staffId:string,slug:string):StaffReport{
  if(!this.isStaffAssigned(staffId,slug))throw new BookingError('FORBIDDEN','Event tidak ditugaskan kepada petugas.',403);
  const event=this.catalog.get(slug);
  const eventCheckIns=this.checkIns.filter(c=>c.slug===slug);
  const totalCheckedInByMe=eventCheckIns.filter(c=>c.staffId===staffId).length;
  const totalEventCheckedIn=eventCheckIns.length;
  const totalSold=this.inventory(slug,true).seats.filter(s=>s.status==='SOLD').length;
  const attendanceRate=totalSold>0?Math.min(100,Math.round((totalEventCheckedIn/totalSold)*100)):0;
  const last=eventCheckIns.filter(c=>c.staffId===staffId).sort((a,b)=>Date.parse(b.checkedInAt)-Date.parse(a.checkedInAt))[0];
  const history=eventCheckIns.map(c=>({
   ticketId:c.ticketId,
   reference:c.reference,
   attendeeName:c.attendeeName,
   seatLabel:c.seatLabel,
   categoryName:c.categoryName,
   checkedInAt:c.checkedInAt,
   staffId:c.staffId,
   isMe:c.staffId===staffId
  })).sort((a,b)=>Date.parse(b.checkedInAt)-Date.parse(a.checkedInAt));
  return {
   slug,
   eventTitle:event?.title??slug,
   totalCheckedInByMe,
   totalEventCheckedIn,
   totalSold,
   attendanceRate,
   lastCheckedInAt:last?.checkedInAt,
   history,
   audits:this.checkInAudits.filter(a=>a.slug===slug).sort((a,b)=>Date.parse(b.performedAt)-Date.parse(a.performedAt))
  };
 }
 revertCheckIn(staffId:string,slug:string,ticketId:string,reason:string):{status:'REVERTED';ticket:CheckInResult['ticket'];audit:CheckInAuditRecord}{
  if(!this.isStaffAssigned(staffId,slug))throw new BookingError('FORBIDDEN','Event tidak ditugaskan kepada petugas.',403);
  if(!reason||reason.trim().length<3)throw new BookingError('INVALID_REASON','Alasan koreksi wajib diisi minimal 3 karakter.',400);
  const ticket=this.issued.get(ticketId)??[...this.issued.values()].find(t=>t.id===ticketId);
  if(!ticket)throw new BookingError('NOT_FOUND','Tiket tidak ditemukan.',404);
  if(ticket.slug!==slug)throw new BookingError('WRONG_EVENT','Tiket ini untuk event lain.',400);
  if(!ticket.checkedInAt)throw new BookingError('NOT_CHECKED_IN','Tiket ini belum pernah di-check-in.',400);
  const previousCheckedInAt=ticket.checkedInAt;
  ticket.checkedInAt=undefined;
  ticket.checkedInBy=undefined;
  this.checkIns=this.checkIns.filter(c=>c.ticketId!==ticket.id);
  const staff=this.staffAssignments.find(s=>s.userId===staffId&&s.slug===slug);
  const now=new Date(this.clock()).toISOString();
  const audit:CheckInAuditRecord={
   id:randomUUID(),
   ticketId:ticket.id,
   reference:ticket.reference,
   slug,
   attendeeName:ticket.attendeeName,
   action:'REVERT_CHECK_IN',
   reason:reason.trim(),
   performedBy:staffId,
   performedByName:staff?.name??'Petugas Check-in',
   performedAt:now,
   previousCheckedInAt
  };
  this.checkInAudits.unshift(audit);
  const view={id:ticket.id,reference:ticket.reference,attendeeName:ticket.attendeeName,seatLabel:ticket.seatLabel,categoryName:ticket.categoryName};
  return {status:'REVERTED',ticket:view,audit};
 }
 getCheckInAudits(staffId:string,slug:string):CheckInAuditRecord[]{
  if(!this.isStaffAssigned(staffId,slug))throw new BookingError('FORBIDDEN','Event tidak ditugaskan kepada petugas.',403);
  return this.checkInAudits.filter(a=>a.slug===slug).sort((a,b)=>Date.parse(b.performedAt)-Date.parse(a.performedAt));
 }
 getAllCheckInAudits():CheckInAuditRecord[]{
  return structuredClone(this.checkInAudits);
 }
}
