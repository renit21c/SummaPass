begin;
create table public.event_seats(event_id uuid not null references public.events(id) on delete restrict,seat_id uuid not null references public.seats(id) on delete restrict,revision bigint not null default 0,primary key(event_id,seat_id));
create table public.bookings(id uuid primary key default gen_random_uuid(),reference text not null unique,user_id uuid not null references public.profiles(id) on delete restrict,event_id uuid not null references public.events(id) on delete restrict,category_id uuid not null references public.ticket_categories(id) on delete restrict,status text not null default 'PENDING_PAYMENT' check(status in ('PENDING_PAYMENT','CONFIRMED','EXPIRED','CANCELLED','FAILED')),expires_at timestamptz not null,total_idr bigint not null check(total_idr>=0),idempotency_key uuid not null,request_items jsonb not null,created_at timestamptz not null default now(),unique(user_id,idempotency_key),unique(id,event_id));
create table public.booking_items(id uuid primary key default gen_random_uuid(),booking_id uuid not null,event_id uuid not null,seat_id uuid not null,price_snapshot_idr bigint not null check(price_snapshot_idr>=0),allocation_status text not null check(allocation_status in ('RESERVED','SOLD','RELEASED')),unique(booking_id,seat_id),foreign key(booking_id,event_id) references public.bookings(id,event_id) on delete restrict,foreign key(event_id,seat_id) references public.event_seats(event_id,seat_id) on delete restrict);
create unique index one_active_seat on public.booking_items(event_id,seat_id) where allocation_status in ('RESERVED','SOLD');
create table public.attendees(id uuid primary key default gen_random_uuid(),booking_item_id uuid not null unique references public.booking_items(id) on delete restrict,display_name text not null check(char_length(trim(display_name)) between 1 and 100));
create index bookings_owner on public.bookings(user_id,created_at desc);
create index bookings_event_expiry on public.bookings(event_id,status,expires_at);
create index items_booking on public.booking_items(booking_id);
create index event_seats_seat on public.event_seats(seat_id);
create index items_event_seat on public.booking_items(event_id,seat_id);
alter table public.event_seats enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.attendees enable row level security;
revoke all on public.event_seats,public.bookings,public.booking_items,public.attendees from anon,authenticated;
grant select on public.event_seats to anon,authenticated;
grant select on public.bookings,public.booking_items,public.attendees to authenticated;
create policy public_event_seats on public.event_seats for select using(public.event_is_visible(event_id));
create policy own_bookings on public.bookings for select to authenticated using(user_id=(select auth.uid()) or public.has_event_access(event_id,'ORGANIZER'));
create policy own_items on public.booking_items for select to authenticated using(exists(select 1 from public.bookings b where b.id=booking_id));
create policy own_attendees on public.attendees for select to authenticated using(exists(select 1 from public.booking_items i where i.id=booking_item_id));

create function public.seat_inventory(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
 select * into e from public.events where slug=p_slug and status='PUBLISHED';
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 select jsonb_build_object('eventId',e.id,'slug',e.slug,'mode','supabase','serverNow',clock_timestamp(),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price_idr,'quota',c.quota,'sections',coalesce((select jsonb_agg(s.name) from public.category_sections cs join public.venue_sections s on s.id=cs.section_id where cs.category_id=c.id),'[]'::jsonb)) order by c.price_idr desc) from public.ticket_categories c where c.event_id=e.id),'[]'::jsonb),
 'seats',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'section',vs.name,'row',s.row_label,'number',s.number,'x',s.x,'y',s.y+case when vs.name='Regular' then 235 else 0 end,'status',case when exists(select 1 from public.booking_items i where i.event_id=e.id and i.seat_id=s.id and i.allocation_status='SOLD') then 'SOLD' when exists(select 1 from public.booking_items i join public.bookings b on b.id=i.booking_id where i.event_id=e.id and i.seat_id=s.id and i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()) then 'RESERVED' else 'AVAILABLE' end) order by vs.name,s.row_label,s.number) from public.event_seats es join public.seats s on s.id=es.seat_id join public.venue_sections vs on vs.id=s.section_id where es.event_id=e.id),'[]'::jsonb)) into result;
 return result;
end;$$;
create function public.get_booking(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('id',b.id,'reference',b.reference,'slug',e.slug,'userId',b.user_id,'categoryId',b.category_id,'categoryName',c.name,'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,'expiresAt',b.expires_at,'total',b.total_idr,'items',(select jsonb_agg(jsonb_build_object('seatId',i.seat_id,'label',vs.name||' '||s.row_label||s.number,'name',a.display_name,'price',i.price_snapshot_idr) order by s.row_label,s.number) from public.booking_items i join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.attendees a on a.booking_item_id=i.id where i.booking_id=b.id)) into result
 from public.bookings b join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id where b.id=p_id and b.user_id=(select auth.uid());
 return coalesce(result,jsonb_build_object('error','NOT_FOUND','message','Reservasi tidak ditemukan.'));
end;$$;
create function public.my_bookings() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(public.get_booking(id) order by created_at desc),'[]'::jsonb) from public.bookings where user_id=(select auth.uid());
$$;

create function public.reserve_booking(p_slug text,p_category uuid,p_items jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;c public.ticket_categories; old public.bookings;v_count int;v_seat uuid;v_item jsonb;v_id uuid:=gen_random_uuid();v_item_id uuid;v_now timestamptz;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk kembali.');end if;
 if p_key is null or p_items is null or jsonb_typeof(p_items)<>'array' then return jsonb_build_object('error','INPUT','message','Pilihan kursi tidak valid.');end if;
 v_count:=jsonb_array_length(p_items);
 if v_count<1 or v_count>6 or (select count(distinct x->>'seatId') from jsonb_array_elements(p_items) x)<>v_count then return jsonb_build_object('error','INPUT','message','Pilih 1 hingga 6 kursi unik.');end if;
 -- Every reservation/cancellation and future payment RPC locks this event row first.
 select * into e from public.events where slug=p_slug for update;
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 v_now:=clock_timestamp();
 select * into old from public.bookings where user_id=auth.uid() and idempotency_key=p_key;
 if found then
  if old.event_id<>e.id or old.category_id<>p_category or old.request_items<>p_items then return jsonb_build_object('error','KEY_REUSED','message','Permintaan berubah. Silakan coba lagi.');end if;
  return public.get_booking(old.id);
 end if;
 select * into c from public.ticket_categories where id=p_category and event_id=e.id;
 if not found then return jsonb_build_object('error','CATEGORY','message','Kategori tidak sesuai event.');end if;
 if e.status<>'PUBLISHED' or v_now<c.sales_start or v_now>=c.sales_end or v_now>=e.starts_at then return jsonb_build_object('error','SALES_CLOSED','message','Penjualan tidak sedang dibuka.');end if;
 -- Delayed cleanup never blocks seats: reclaim expired allocations under the same lock.
 update public.booking_items i set allocation_status='RELEASED' from public.bookings b where i.booking_id=b.id and b.event_id=e.id and b.status='PENDING_PAYMENT' and b.expires_at<=v_now and i.allocation_status='RESERVED';
 update public.bookings set status='EXPIRED' where event_id=e.id and status='PENDING_PAYMENT' and expires_at<=v_now;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if coalesce(char_length(trim(v_item->>'name')),0) not between 1 and 100 then return jsonb_build_object('error','INPUT','message','Nama peserta wajib diisi.');end if;
  begin v_seat:=(v_item->>'seatId')::uuid;exception when invalid_text_representation then return jsonb_build_object('error','INPUT','message','Kursi tidak valid.');end;
  if v_seat is null or not exists(select 1 from public.event_seats es join public.seats s on s.id=es.seat_id join public.category_sections cs on cs.section_id=s.section_id where es.event_id=e.id and es.seat_id=v_seat and cs.category_id=c.id) then return jsonb_build_object('error','CATEGORY','message','Kursi tidak sesuai kategori.');end if;
  if exists(select 1 from public.booking_items where event_id=e.id and seat_id=v_seat and allocation_status in ('RESERVED','SOLD')) then return jsonb_build_object('error','SEAT_UNAVAILABLE','message','Sebagian kursi sudah tidak tersedia. Pilih kembali.');end if;
 end loop;
 if (select count(*) from public.booking_items i join public.bookings b on b.id=i.booking_id where b.category_id=c.id and i.allocation_status in ('RESERVED','SOLD'))+v_count>c.quota then return jsonb_build_object('error','QUOTA','message','Kuota kategori tidak mencukupi.');end if;
 insert into public.bookings(id,reference,user_id,event_id,category_id,expires_at,total_idr,idempotency_key,request_items) values(v_id,'SP-'||upper(replace(v_id::text,'-','')),auth.uid(),e.id,c.id,v_now+interval '10 minutes',c.price_idr*v_count,p_key,p_items);
 for v_item in select value from jsonb_array_elements(p_items) loop
  insert into public.booking_items(booking_id,event_id,seat_id,price_snapshot_idr,allocation_status) values(v_id,e.id,(v_item->>'seatId')::uuid,c.price_idr,'RESERVED') returning id into v_item_id;
  insert into public.attendees(booking_item_id,display_name) values(v_item_id,trim(v_item->>'name'));
 end loop;
 update public.event_seats set revision=revision+1 where event_id=e.id and seat_id in(select (x->>'seatId')::uuid from jsonb_array_elements(p_items) x);
 return public.get_booking(v_id);
end;$$;
create function public.cancel_booking(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;v_event uuid;
begin
 select event_id into v_event from public.bookings where id=p_id and user_id=auth.uid();
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Reservasi tidak ditemukan.');end if;
 perform 1 from public.events where id=v_event for update;
 select * into b from public.bookings where id=p_id and user_id=auth.uid() for update;
 if b.status='PENDING_PAYMENT' then
  update public.booking_items set allocation_status='RELEASED' where booking_id=b.id and allocation_status='RESERVED';
  update public.bookings set status=case when expires_at<=clock_timestamp() then 'EXPIRED' else 'CANCELLED' end where id=b.id;
  update public.event_seats set revision=revision+1 where event_id=v_event and seat_id in(select seat_id from public.booking_items where booking_id=b.id);
 end if;
 return public.get_booking(p_id);
end;$$;
revoke all on function public.seat_inventory(text),public.get_booking(uuid),public.my_bookings(),public.reserve_booking(text,uuid,jsonb,uuid),public.cancel_booking(uuid) from public;
grant execute on function public.seat_inventory(text) to anon,authenticated;
grant execute on function public.get_booking(uuid),public.my_bookings(),public.reserve_booking(text,uuid,jsonb,uuid),public.cancel_booking(uuid) to authenticated;
-- Realtime messages contain geometry IDs/revisions only. Polling remains a fallback.
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.event_seats;end if;end$$;
commit;
