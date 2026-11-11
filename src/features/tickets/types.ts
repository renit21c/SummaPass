import type { Event } from '../events/data';
export type PaymentStatus='PENDING'|'PAID'|'FAILED'|'EXPIRED'|'CANCELLED';
export type Ticket={packageName?:string|null;packageSize?:number|null;id:string;reference:string;bookingId:string;slug:string;categoryName:string;seatId:string;seatLabel:string;attendeeName:string;attendeeEmail?:string;transferredAt?:string;previousAttendeeName?:string;price:number;issuedAt:string;status:'ACTIVE'|'REVOKED';token:string;event?:Event;checkedInAt?:string;checkedInBy?:string;cancelledAt?:string;cancellationReason?:string;refundAmount?:number;refundStatus?:'PENDING'|'REFUNDED'|'FAILED'};
export type TicketPack={seatId:string;ticketId:string;tokenHash:string;encryptedToken:string};
export type StoredTicket=Omit<Ticket,'token'>&{userId:string;tokenHash:string;encryptedToken:string};
