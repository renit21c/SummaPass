import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import type { Ticket } from './types';
import { dateLabel,rupiah,type Event } from '../events/data';

const colors={ink:'#252525',muted:'#625c56',cream:'#fff9f2',orange:'#ff681c',purple:'#6632cf',pink:'#ff7ac3',mint:'#51e3ab',yellow:'#ffe044',purpleLight:'#eee4ff',white:'#ffffff'};
let fonts:{regular:Buffer;bold:Buffer}|undefined;
function brandFonts(){return fonts??={regular:readFileSync(join(process.cwd(),'node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff')),bold:readFileSync(join(process.cwd(),'node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff'))};}
export type TicketPdfPage={ticket:Ticket;event:Event};
export const TICKET_QR_BOX={x:362,y:568,size:152};

// Vector QR with a four-module quiet zone. The data is the existing opaque ticket token.
function drawQr(doc:PDFKit.PDFDocument,token:string){
 const qr=QRCode.create(token,{errorCorrectionLevel:'M'}),modules=qr.modules;
 const {x,y,size}=TICKET_QR_BOX;
 doc.rect(x,y,size,size).fill(colors.white);
 doc.save().translate(x,y).scale(size/(modules.size+8));
 for(let row=0;row<modules.size;row++)for(let col=0;col<modules.size;col++)if(modules.get(row,col))doc.rect(col+4,row+4,1,1);
 doc.fill('#000000').restore();
}
function panel(doc:PDFKit.PDFDocument,x:number,y:number,w:number,h:number,fill:string){doc.roundedRect(x,y,w,h,12).fillAndStroke(fill,colors.ink);}
function text(doc:PDFKit.PDFDocument,value:string,x:number,y:number,w:number,size=12,bold=false,color=colors.ink){doc.font(bold?'BrandBold':'Brand').fontSize(size).fillColor(color).text(value,x,y,{width:w,lineGap:3});}
function fitted(doc:PDFKit.PDFDocument,value:string,x:number,y:number,w:number,h:number,size:number,bold=true){doc.font(bold?'BrandBold':'Brand');while(size>8){doc.fontSize(size);if(doc.heightOfString(value,{width:w,lineGap:3})<=h)break;size--;}text(doc,value,x,y,w,size,bold);}
function drawPage(doc:PDFKit.PDFDocument,{ticket,event}:TicketPdfPage,index:number,total:number){
 const active=ticket.status==='ACTIVE';
 doc.lineWidth(1.5);
 panel(doc,45,45,510,718,colors.ink);panel(doc,40,40,510,718,colors.cream);
 doc.save().roundedRect(40,40,510,718,12).clip().rect(40,40,510,82).fill(colors.orange).restore();
 doc.moveTo(40,122).lineTo(550,122).stroke(colors.ink);
 // Ticket outline mark, matching the site's icon-based identity.
 doc.save().translate(61,66).rotate(-12,{origin:[14,11]}).roundedRect(0,0,28,22,4).stroke(colors.ink).dash(2,{space:2}).moveTo(19,2).lineTo(19,20).stroke().undash().restore();
 text(doc,'SummaPass',103,61,270,29,true);
 panel(doc,439,66,89,30,active?colors.yellow:colors.pink);text(doc,active?'E-ticket':'DICABUT',450,73,72,11,true);
 fitted(doc,event.title,62,145,466,82,28);
 fitted(doc,`Kategori: ${ticket.categoryName}`,62,237,466,24,11,false);
 panel(doc,62,276,466,126,colors.white);
 text(doc,'Tanggal',78,291,245,10,false,colors.muted);text(doc,'Waktu',365,291,145,10,false,colors.muted);
 fitted(doc,dateLabel(event.date),78,308,260,24,14);fitted(doc,event.time,365,308,145,24,14);
 text(doc,'Lokasi',78,340,430,10,false,colors.muted);
 fitted(doc,event.area||'Summarecon Mall Bandung',78,357,434,35,12,false);
 panel(doc,62,420,280,120,colors.pink);panel(doc,358,420,170,120,colors.mint);
 text(doc,'Nama peserta',78,436,248,10,false,colors.ink);
 fitted(doc,ticket.attendeeName,78,457,248,67,18);
 text(doc,'Kursi',374,436,138,10,false,colors.ink);
 fitted(doc,ticket.seatLabel,374,457,138,67,18);
 doc.dash(4,{space:4}).moveTo(40,556).lineTo(550,556).stroke(colors.ink).undash();
 doc.circle(40,556,8).fillAndStroke(colors.white,colors.ink);doc.circle(550,556,8).fillAndStroke(colors.white,colors.ink);
 text(doc,'Referensi tiket',62,579,275,10,false,colors.muted);
 fitted(doc,ticket.reference,62,598,275,26,10);
 text(doc,rupiah(ticket.price),62,638,275,21,true,colors.purple);
 text(doc,active?'Tunjukkan QR saat check-in.':'Tiket ini sudah dicabut.',62,679,275,11,true);
 text(doc,'Satu tiket untuk satu peserta.',62,698,275,10,false,colors.muted);
 text(doc,'Cetak A4 pada skala 100%.',62,718,275,10,false,colors.muted);
 if(active){drawQr(doc,ticket.token);text(doc,'Pindai saat masuk',362,727,152,9,false,colors.muted);}else{panel(doc,362,578,152,136,colors.purpleLight);text(doc,'Tidak berlaku',382,629,116,13,true);}
 const issued=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(ticket.issuedAt));
 text(doc,`Diterbitkan ${issued}`,40,785,340,9,false,colors.muted);
 text(doc,'Pembayaran simulasi. Tidak ada tagihan nyata.',40,802,440,9,false,colors.muted);
 text(doc,`${index+1} / ${total}`,499,785,50,9,true);
}
export async function generateTicketsPdf(pages:TicketPdfPage[]):Promise<Buffer>{
 if(pages.length<1||pages.length>6)throw Error('PDF_TICKET_LIMIT');
 const doc=new PDFDocument({size:'A4',margin:0,autoFirstPage:false,pdfVersion:'1.4',info:{Title:'SummaPass E-ticket',Author:'SummaPass',Creator:'SummaPass',CreationDate:new Date(pages[0].ticket.issuedAt),ModDate:new Date(pages[0].ticket.issuedAt)}});
 const chunks:Buffer[]=[];const finished=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 try{const font=brandFonts();doc.registerFont('Brand',font.regular);doc.registerFont('BrandBold',font.bold);pages.forEach((page,index)=>{doc.addPage();drawPage(doc,page,index,pages.length);});doc.end();}catch(error){doc.destroy();throw error;}
 return finished;
}
export function generateTicketPdf(ticket:Ticket,event:Event){return generateTicketsPdf([{ticket,event}]);}
