begin;
create table public.payments(id uuid primary key default gen_random_uuid(),booking_id uuid not null unique references public.bookings(id) on delete restrict,status text not null default 'PENDING' check(status in ('PENDING','PAID','FAILED','EXPIRED','CANCELLED')),amount_idr bigint not null check(amount_idr>=0),confirmed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.tickets(id uuid primary key default gen_random_uuid(),reference text not null unique,booking_item_id uuid not null unique references public.booking_items(id) on delete restrict,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),status text not null default 'ACTIVE' check(status in ('ACTIVE','REVOKED')),issued_at timestamptz not null default now());
create table public.ticket_secrets(ticket_id uuid primary key references public.tickets(id) on delete restrict,encrypted_token text not null,key_version text not null default 'v1' check(key_version='v1'),created_at timestamptz not null default now());
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_secrets enable row level security;
revoke all on public.payments,public.tickets,public.ticket_secrets from public,anon,authenticated;
grant select on public.payments,public.tickets to authenticated;
create policy owner_payment on public.payments for select to authenticated using(exists(select 1 from public.bookings b where b.id=booking_id));
create policy owner_ticket on public.tickets for select to authenticated using(exists(select 1 from public.booking_items i where i.id=booking_item_id));
-- Ciphertext has no browser policy/grant. It is read only through the server RPC.
create index tickets_item on public.tickets(booking_item_id);
create index payments_state on public.payments(status,created_at);
insert into public.payments(booking_id,status,amount_idr,confirmed_at)
select id,case status when 'CONFIRMED' then 'PAID' when 'FAILED' then 'FAILED' when 'EXPIRED' then 'EXPIRED' when 'CANCELLED' then 'CANCELLED' else 'PENDING' end,total_idr,case when status='CONFIRMED' then now() else null end from public.bookings;
create function public.sync_pending_payment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.payments(booking_id,amount_idr) values(new.id,new.total_idr);
 elsif new.status in ('FAILED','EXPIRED','CANCELLED') then
  update public.payments set status=new.status,updated_at=clock_timestamp() where booking_id=new.id and status='PENDING';
 end if;
 return new;
end;$$;
revoke all on function public.sync_pending_payment() from public,anon,authenticated;
create trigger booking_payment_sync after insert or update of status on public.bookings for each row execute function public.sync_pending_payment();
create function public.require_paid_ticket() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.booking_items i join public.bookings b on b.id=i.booking_id join public.payments p on p.booking_id=b.id where i.id=new.booking_item_id and i.allocation_status='SOLD' and b.status='CONFIRMED' and p.status='PAID' and p.amount_idr=b.total_idr) then raise exception 'Ticket requires a paid, confirmed allocation' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function public.require_paid_ticket() from public,anon,authenticated;
create trigger ticket_requires_payment before insert or update of booking_item_id on public.tickets for each row execute function public.require_paid_ticket();

-- Only service_role can invoke this privileged operation. The HTTP server first
-- validates the Supabase session and passes the verified user ID, never client ID.
-- Token bundles are generated with node:crypto and encrypted on that server.
create function public.process_simulated_payment(p_user uuid,p_booking uuid,p_outcome text,p_tickets jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;v_event uuid;v_now timestamptz;v_pack jsonb;v_seat uuid;v_ticket uuid;v_count int;
begin
 if p_user is null or p_outcome is null or p_outcome not in ('success','failure') then return jsonb_build_object('error','INPUT','message','Permintaan tidak valid.');end if;
 select event_id into v_event from public.bookings where id=p_booking and user_id=p_user;
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Reservasi tidak ditemukan.');end if;
 perform 1 from public.events where id=v_event for update;
 select * into b from public.bookings where id=p_booking and user_id=p_user for update;
 v_now:=clock_timestamp();
 if b.status='CONFIRMED' and exists(select 1 from public.payments where booking_id=b.id and status='PAID') then return jsonb_build_object('status','CONFIRMED','paymentStatus','PAID','bookingId',b.id);end if;
 if b.status='PENDING_PAYMENT' and b.expires_at<=v_now then
  update public.bookings set status='EXPIRED' where id=b.id;
  update public.booking_items set allocation_status='RELEASED' where booking_id=b.id and allocation_status='RESERVED';
  update public.event_seats set revision=revision+1 where event_id=v_event and seat_id in(select seat_id from public.booking_items where booking_id=b.id);
  return jsonb_build_object('error','RESERVATION_EXPIRED','message','Waktu reservasi sudah habis. Silakan pilih kursi lagi.');
 end if;
 if b.status<>'PENDING_PAYMENT' then return jsonb_build_object('error','NOT_PAYABLE','message','Reservasi ini tidak dapat dibayar.');end if;
 v_count:=(select count(*) from public.booking_items where booking_id=b.id);
 if v_count<1 or exists(select 1 from public.booking_items where booking_id=b.id and allocation_status<>'RESERVED') then return jsonb_build_object('error','ALLOCATION','message','Kursi reservasi tidak lagi valid.');end if;
 if p_outcome='failure' then
  update public.bookings set status='FAILED' where id=b.id;
  update public.booking_items set allocation_status='RELEASED' where booking_id=b.id and allocation_status='RESERVED';
  update public.event_seats set revision=revision+1 where event_id=v_event and seat_id in(select seat_id from public.booking_items where booking_id=b.id);
  return jsonb_build_object('status','FAILED','paymentStatus','FAILED','bookingId',b.id);
 end if;
 if p_tickets is null or jsonb_typeof(p_tickets)<>'array' then return jsonb_build_object('error','INPUT','message','Data tiket tidak valid.');end if;
 if jsonb_array_length(p_tickets)<>v_count or (select count(distinct x->>'seatId') from jsonb_array_elements(p_tickets) x)<>v_count or (select count(distinct x->>'ticketId') from jsonb_array_elements(p_tickets) x)<>v_count then return jsonb_build_object('error','INPUT','message','Jumlah tiket tidak sesuai reservasi.');end if;
 for v_pack in select value from jsonb_array_elements(p_tickets) loop
  begin v_seat:=(v_pack->>'seatId')::uuid;v_ticket:=(v_pack->>'ticketId')::uuid;exception when invalid_text_representation then return jsonb_build_object('error','INPUT','message','Data tiket tidak valid.');end;
  if v_ticket is null or not exists(select 1 from public.booking_items where booking_id=b.id and seat_id=v_seat) or coalesce(v_pack->>'tokenHash','')!~'^[a-f0-9]{64}$' or coalesce(v_pack->>'encryptedToken','')!~'^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{86}$' then return jsonb_build_object('error','INPUT','message','Data tiket tidak valid.');end if;
 end loop;
 update public.payments set status='PAID',amount_idr=b.total_idr,confirmed_at=v_now,updated_at=v_now where booking_id=b.id and status='PENDING';
 if not found then return jsonb_build_object('error','PAYMENT_STATE','message','Status pembayaran tidak valid.');end if;
 update public.bookings set status='CONFIRMED' where id=b.id;
 update public.booking_items set allocation_status='SOLD' where booking_id=b.id;
 for v_pack in select value from jsonb_array_elements(p_tickets) loop
  v_ticket:=(v_pack->>'ticketId')::uuid;
  insert into public.tickets(id,reference,booking_item_id,token_hash) select v_ticket,'SPT-'||upper(replace(v_ticket::text,'-','')),i.id,v_pack->>'tokenHash' from public.booking_items i where i.booking_id=b.id and i.seat_id=(v_pack->>'seatId')::uuid;
  insert into public.ticket_secrets(ticket_id,encrypted_token) values(v_ticket,v_pack->>'encryptedToken');
 end loop;
 update public.event_seats set revision=revision+1 where event_id=v_event and seat_id in(select seat_id from public.booking_items where booking_id=b.id);
 return jsonb_build_object('status','CONFIRMED','paymentStatus','PAID','bookingId',b.id);
end;$$;
create function public.issued_tickets_for_owner(p_user uuid,p_ticket uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'reference',t.reference,'bookingId',b.id,'userId',b.user_id,'slug',e.slug,'categoryName',c.name,'seatId',i.seat_id,'seatLabel',vs.name||' '||s.row_label||s.number,'attendeeName',a.display_name,'price',i.price_snapshot_idr,'issuedAt',t.issued_at,'status',t.status,'tokenHash',t.token_hash,'encryptedToken',ts.encrypted_token) order by t.issued_at desc,t.id),'[]'::jsonb)
 from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings b on b.id=i.booking_id join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id join public.attendees a on a.booking_item_id=i.id join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.ticket_secrets ts on ts.ticket_id=t.id
 where b.user_id=p_user and (p_ticket is null or t.id=p_ticket);
$$;
revoke all on function public.process_simulated_payment(uuid,uuid,text,jsonb),public.issued_tickets_for_owner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.process_simulated_payment(uuid,uuid,text,jsonb),public.issued_tickets_for_owner(uuid,uuid) to service_role;
create or replace function public.get_booking(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('id',b.id,'reference',b.reference,'slug',e.slug,'userId',b.user_id,'categoryId',b.category_id,'categoryName',c.name,'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,'expiresAt',b.expires_at,'total',b.total_idr,'paymentStatus',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else (select p.status from public.payments p where p.booking_id=b.id) end,'items',(select jsonb_agg(jsonb_build_object('seatId',i.seat_id,'label',vs.name||' '||s.row_label||s.number,'name',a.display_name,'price',i.price_snapshot_idr) order by s.row_label,s.number) from public.booking_items i join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.attendees a on a.booking_item_id=i.id where i.booking_id=b.id)) into result
 from public.bookings b join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id where b.id=p_id and b.user_id=(select auth.uid());
 return coalesce(result,jsonb_build_object('error','NOT_FOUND','message','Reservasi tidak ditemukan.'));
end;$$;

commit;
