begin;
alter table public.events add column ticketing_managed boolean not null default false;
alter table public.ticket_categories add column description text not null default '' check(char_length(description)<=500);
create table public.ticket_packages(
 id uuid primary key default gen_random_uuid(),category_id uuid not null references public.ticket_categories(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 80),participants integer not null check(participants between 1 and 10),
 price_idr bigint not null check(price_idr between 0 and 100000000),quota integer check(quota between 1 and 2000),
 is_active boolean not null default true,is_default boolean not null default false,created_at timestamptz not null default now(),
 unique(category_id,name),check(not is_default or participants=1)
);
create unique index package_single_default on public.ticket_packages(category_id) where is_default;
alter table public.ticket_packages enable row level security;
revoke all on public.ticket_packages from public,anon,authenticated;
grant select on public.ticket_packages to anon,authenticated;
create policy package_read on public.ticket_packages for select using(exists(select 1 from public.ticket_categories c where c.id=category_id and (public.has_event_access(c.event_id,'ORGANIZER') or (c.is_active and ticket_packages.is_active and exists(select 1 from public.events e where e.id=c.event_id and e.status='PUBLISHED' and e.cancelled_at is null)))));
alter table public.bookings add column package_id uuid references public.ticket_packages(id) on delete restrict,
 add column package_name_snapshot text,add column package_size_snapshot integer,add column package_quantity integer,
 add column package_price_snapshot bigint,add column package_request jsonb;
create index bookings_package on public.bookings(package_id);

create function public.ensure_single_package() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.ticket_packages set price_idr=new.price_idr where category_id=new.id and is_default;
 if not found then insert into public.ticket_packages(category_id,name,participants,price_idr,is_default) values(new.id,'Single',1,new.price_idr,true);end if;
 return new;
end;$$;
revoke all on function public.ensure_single_package() from public,anon,authenticated,service_role;
create trigger category_default_package after insert or update of price_idr on public.ticket_categories for each row execute function public.ensure_single_package();
insert into public.ticket_packages(category_id,name,participants,price_idr,is_default) select id,'Single',1,price_idr,true from public.ticket_categories;

create function public.package_usage(p_package uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(sum(case when b.package_id is null then (select count(*) from public.booking_items i where i.booking_id=b.id and i.allocation_status in ('RESERVED','SOLD')) else b.package_quantity end),0)::integer from public.bookings b join public.ticket_packages p on p.id=p_package where (b.package_id=p.id or (b.package_id is null and p.is_default and b.category_id=p.category_id))
 and ((b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()) or (b.status='CONFIRMED' and exists(select 1 from public.booking_items i where i.booking_id=b.id and i.allocation_status='SOLD')));
$$;
create function public.package_json(p_category uuid,p_private boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'participants',p.participants,'price',p.price_idr,'quota',p.quota,'remaining',case when p.quota is null then null else greatest(0,p.quota-public.package_usage(p.id)) end,'active',p.is_active,'isDefault',p.is_default) order by p.is_default desc,p.participants,p.created_at),'[]'::jsonb)
 from public.ticket_packages p where p.category_id=p_category and (p_private or p.is_active);
$$;
revoke all on function public.package_usage(uuid),public.package_json(uuid,boolean) from public,anon,authenticated,service_role;

create function public.ticket_options(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 return (select jsonb_build_object('version',e.seating_version,'mode',e.seating_mode,
 'sections',coalesce((select jsonb_agg(jsonb_build_object('name',name,'capacity',capacity) order by name) from (select vs.name,count(*) capacity from public.event_seats es join public.seats s on s.id=es.seat_id join public.venue_sections vs on vs.id=s.section_id where es.event_id=e.id group by vs.name) q),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'price',c.price_idr,'quota',c.quota,'salesStart',c.sales_start,'salesEnd',c.sales_end,'active',c.is_active,'sections',coalesce((select jsonb_agg(vs.name) from public.category_sections cs join public.venue_sections vs on vs.id=cs.section_id where cs.category_id=c.id),'[]'::jsonb),'packages',public.package_json(c.id,true)) order by c.created_at,c.id) from public.ticket_categories c where c.event_id=e.id),'[]'::jsonb)) from public.events e where e.id=p_event);
end;$$;
revoke all on function public.ticket_options(uuid) from public,anon;
grant execute on function public.ticket_options(uuid) to authenticated;

create function public.sync_category_admission(p_category uuid,p_quota integer) returns void language plpgsql security definer set search_path='' as $$
declare c public.ticket_categories;v_section uuid;
begin
 select * into c from public.ticket_categories where id=p_category;
 select section_id into v_section from public.category_sections where category_id=c.id limit 1;
 if v_section is null then
  insert into public.venue_sections(event_id,venue_id,name) values(c.event_id,c.venue_id,'GA-'||c.id::text) returning id into v_section;
  insert into public.category_sections(category_id,section_id,venue_id) values(c.id,v_section,c.venue_id);
 end if;
 insert into public.seats(section_id,row_label,number,x,y) select v_section,'GA',n,0,0 from generate_series(1,p_quota) n on conflict do nothing;
 insert into public.event_seats(event_id,seat_id) select c.event_id,id from public.seats where section_id=v_section on conflict do nothing;
end;$$;
revoke all on function public.sync_category_admission(uuid,integer) from public,anon,authenticated,service_role;

create function public.manage_ticket_option(p_event uuid,p_kind text,p_id uuid,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;c public.ticket_categories;p public.ticket_packages;v_id uuid:=p_id;v_result jsonb;v_before jsonb;v_count integer;v_price bigint;v_quota integer;v_size integer;v_name text;v_active boolean;v_start timestamptz;v_end timestamptz;
begin
 select * into e from public.events where id=p_event for update;
 if auth.uid() is null or not found or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 if e.status='ARCHIVED' or e.cancelled_at is not null then return jsonb_build_object('error','ARCHIVED','message','Event ini tidak dapat diubah.');end if;
 if p_version is distinct from e.seating_version then return jsonb_build_object('error','VERSION_CONFLICT','message','Data berubah. Muat ulang dahulu.');end if;
 if p_kind not in ('category','package') or p_kind is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Isian tidak valid.' using errcode='22023';end if;
 if jsonb_typeof(p_data->'name') is distinct from 'string' or char_length(trim(p_data->>'name')) not between 1 and 80 or jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'Nama dan status wajib diisi.' using errcode='22023';end if;
 if jsonb_typeof(p_data->'price') is distinct from 'number' or (p_data->>'price')!~'^[0-9]+$' then raise exception 'Harga harus bilangan bulat.' using errcode='22023';end if;
 v_price:=(p_data->>'price')::bigint;v_name:=trim(p_data->>'name');v_active:=(p_data->>'active')::boolean;
 if v_price not between 0 and 100000000 then raise exception 'Harga di luar batas.' using errcode='22023';end if;
 v_before:=public.ticket_options(p_event);
 if p_kind='category' then
  if p_id is not null and not exists(select 1 from public.ticket_categories where id=p_id and event_id=p_event) then return jsonb_build_object('error','NOT_FOUND','message','Kategori tidak ditemukan.');end if;
  if p_id is not null and v_active and e.status='PUBLISHED' and not exists(select 1 from public.ticket_packages where category_id=p_id and is_active) then return jsonb_build_object('error','LAST_PACKAGE','message','Aktifkan minimal satu paket pada kategori ini.');end if;
  if coalesce(char_length(p_data->>'description'),0)>500 then raise exception 'Deskripsi maksimal 500 karakter.' using errcode='22023';end if;
  if e.seating_mode='SEATED' then
   v_result:=public.configure_ticket_category_v19(p_event,p_id,p_version,p_data);
   if v_result ? 'error' then return v_result;end if;
   select id into v_id from public.ticket_categories where event_id=p_event and name=v_name;
  else
   if jsonb_typeof(p_data->'quota') is distinct from 'number' or (p_data->>'quota')!~'^[0-9]+$' then raise exception 'Kuota harus bilangan bulat.' using errcode='22023';end if;
   v_quota:=(p_data->>'quota')::integer;
   if v_quota not between 1 and 2000 or v_quota+(select coalesce(sum(quota),0) from public.ticket_categories where event_id=p_event and id is distinct from p_id)>2000 then raise exception 'Total kuota event maksimal 2.000 peserta.' using errcode='22023';end if;
   if p_id is null and (select count(*) from public.ticket_categories where event_id=p_event)>=30 then raise exception 'Maksimal 30 kategori.' using errcode='22023';end if;
   v_start:=(p_data->>'salesStart')::timestamptz;v_end:=(p_data->>'salesEnd')::timestamptz;
   if v_start is null or v_end is null or not isfinite(v_start) or not isfinite(v_end) or v_start>=v_end or v_end>e.starts_at then raise exception 'Periksa periode penjualan.' using errcode='22023';end if;
   select count(*) into v_count from public.booking_items i join public.bookings b on b.id=i.booking_id where b.category_id=p_id and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()));
   if v_quota<v_count then return jsonb_build_object('error','QUOTA','message','Kuota kurang dari tiket terjual dan reservasi aktif.');end if;
   if e.status='PUBLISHED' and not v_active and not exists(select 1 from public.ticket_categories where event_id=p_event and id is distinct from p_id and is_active) then return jsonb_build_object('error','LAST_CATEGORY','message','Sembunyikan event sebelum menonaktifkan kategori terakhir.');end if;
   if p_id is null then
    insert into public.ticket_categories(event_id,venue_id,name,price_idr,quota,sales_start,sales_end,is_active) values(p_event,e.venue_id,v_name,v_price,v_quota,v_start,v_end,v_active) returning id into v_id;
   else update public.ticket_categories set name=v_name,price_idr=v_price,quota=v_quota,sales_start=v_start,sales_end=v_end,is_active=v_active where id=p_id;end if;
   perform public.sync_category_admission(v_id,v_quota);
   update public.events set seating_version=seating_version+1 where id=p_event;
  end if;
  update public.ticket_categories set description=coalesce(p_data->>'description','') where id=v_id;
 else
  select * into c from public.ticket_categories where id=(p_data->>'categoryId')::uuid and event_id=p_event;
  if not found then return jsonb_build_object('error','NOT_FOUND','message','Kategori tidak ditemukan.');end if;
  if p_id is not null then select * into p from public.ticket_packages where id=p_id and category_id=c.id;if not found then return jsonb_build_object('error','NOT_FOUND','message','Paket tidak ditemukan.');end if;end if;
  if jsonb_typeof(p_data->'participants') is distinct from 'number' or (p_data->>'participants')!~'^[0-9]+$' then raise exception 'Jumlah peserta harus bilangan bulat.' using errcode='22023';end if;
  v_size:=(p_data->>'participants')::integer;
  if v_size not between 1 and 10 or (p.is_default and v_size<>1) then raise exception 'Paket berisi 1 sampai 10 peserta. Paket Single bawaan tetap 1 peserta.' using errcode='22023';end if;
  if p_data->>'quota' is not null then
   if jsonb_typeof(p_data->'quota')<>'number' or (p_data->>'quota')!~'^[0-9]+$' then raise exception 'Kuota paket tidak valid.' using errcode='22023';end if;
   v_quota:=(p_data->>'quota')::integer;if v_quota not between 1 and 2000 then raise exception 'Kuota paket maksimal 2.000.' using errcode='22023';end if;
  end if;
  if p_id is not null and p.participants<>v_size and exists(select 1 from public.bookings where package_id=p_id) then return jsonb_build_object('error','PACKAGE_LOCKED','message','Jumlah peserta paket terkunci karena sudah ada pesanan. Buat paket baru.');end if;
  if v_quota is not null and v_quota<public.package_usage(p_id) then return jsonb_build_object('error','QUOTA','message','Kuota paket kurang dari paket terjual dan reservasi aktif.');end if;
  if e.status='PUBLISHED' and c.is_active and not v_active and not exists(select 1 from public.ticket_packages where category_id=c.id and id is distinct from p_id and is_active) then return jsonb_build_object('error','LAST_PACKAGE','message','Kategori aktif harus memiliki minimal satu paket aktif.');end if;
  if p_id is null and (select count(*) from public.ticket_packages where category_id=c.id)>=20 then raise exception 'Maksimal 20 paket per kategori.' using errcode='22023';end if;
  if p_id is null then insert into public.ticket_packages(category_id,name,participants,price_idr,quota,is_active) values(c.id,v_name,v_size,v_price,v_quota,v_active) returning id into v_id;
  else update public.ticket_packages set name=v_name,participants=v_size,price_idr=v_price,quota=v_quota,is_active=v_active where id=p_id;end if;
  if p.is_default then update public.ticket_categories set price_idr=v_price where id=c.id;end if;
  update public.events set seating_version=seating_version+1 where id=p_event;
 end if;
 update public.events set ticketing_managed=true,updated_at=clock_timestamp() where id=p_event;
 insert into public.audit_logs(event_id,actor_id,action,before_data,after_data) values(p_event,auth.uid(),'ticket-option.'||p_kind,v_before,public.ticket_options(p_event));
 return public.ticket_options(p_event);
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or sqlstate '22023' or unique_violation then
 return jsonb_build_object('error','INPUT','message','Periksa nama unik, harga, kuota, jumlah peserta, section, dan periode penjualan.');
end;$$;
revoke all on function public.manage_ticket_option(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.manage_ticket_option(uuid,text,uuid,integer,jsonb) to authenticated;

alter function public.catalog_event_json(uuid) rename to catalog_event_json_v21;
create function public.catalog_event_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.catalog_event_json_v21(p_id)||jsonb_build_object('customTicketing',ticketing_managed,'price',coalesce((select min(p.price_idr) from public.ticket_packages p join public.ticket_categories c on c.id=p.category_id where c.event_id=p_id and c.is_active and p.is_active),0)) from public.events where id=p_id;
$$;
revoke all on function public.catalog_event_json_v21(uuid),public.catalog_event_json(uuid) from public,anon,authenticated,service_role;
alter function public.seat_inventory(text) rename to seat_inventory_v21;
create function public.seat_inventory(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.seat_inventory_v21(p_slug);if result ? 'error' then return result;end if;
 return result||jsonb_build_object('categories',coalesce((select jsonb_agg(c||jsonb_build_object('description',tc.description,'packages',public.package_json(tc.id)) order by n) from jsonb_array_elements(result->'categories') with ordinality a(c,n) join public.ticket_categories tc on tc.id=(c->>'id')::uuid where exists(select 1 from public.ticket_packages p where p.category_id=tc.id and p.is_active)),'[]'::jsonb));
end;$$;
revoke all on function public.seat_inventory_v21(text) from public,anon,authenticated,service_role;
revoke all on function public.seat_inventory(text) from public;
grant execute on function public.seat_inventory(text) to anon,authenticated;

alter function public.get_booking(uuid) rename to get_booking_v21;
create function public.get_booking(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.get_booking_v21(p_id);if result ? 'error' then return result;end if;
 return result||(select jsonb_build_object('packageName',package_name_snapshot,'packageSize',package_size_snapshot,'packageQuantity',package_quantity,'packagePrice',package_price_snapshot) from public.bookings where id=p_id);
end;$$;
revoke all on function public.get_booking_v21(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_booking(uuid) from public,anon;
grant execute on function public.get_booking(uuid) to authenticated;

create function public.reserve_ticket_package(p_slug text,p_category uuid,p_package uuid,p_quantity integer,p_items jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;c public.ticket_categories;p public.ticket_packages;b public.bookings;result jsonb;v_items jsonb;v_request jsonb;v_count integer;v_id uuid;v_item record;v_index integer:=0;v_price bigint;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk.');end if;
 select * into e from public.events where slug=p_slug for update;
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 if p_key is null or p_quantity is null or p_quantity not between 1 and 6 or jsonb_typeof(p_items) is distinct from 'array' then return jsonb_build_object('error','INPUT','message','Pilihan paket tidak valid.');end if;
 v_request:=jsonb_build_object('packageId',p_package,'quantity',p_quantity,'items',p_items);
 select * into b from public.bookings where user_id=auth.uid() and idempotency_key=p_key;
 if found then
  if b.event_id<>e.id or b.category_id<>p_category or b.package_request is distinct from v_request then return jsonb_build_object('error','KEY_REUSED','message','Permintaan berubah. Gunakan permintaan baru.');end if;
  return public.get_booking(b.id);
 end if;
 select * into c from public.ticket_categories where id=p_category and event_id=e.id;
 if not found then return jsonb_build_object('error','CATEGORY','message','Kategori tidak sesuai event.');end if;
 select * into p from public.ticket_packages where id=p_package and category_id=c.id;
 if not found or not p.is_active then return jsonb_build_object('error','PACKAGE','message','Paket tidak tersedia untuk kategori ini.');end if;
 v_count:=p.participants*p_quantity;
 if v_count>30 or jsonb_array_length(p_items)<>v_count or exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x->'name') is distinct from 'string' or coalesce(char_length(trim(x->>'name')),0) not between 1 and 100) then return jsonb_build_object('error','INPUT','message','Jumlah peserta harus sesuai paket, maksimal 30 peserta per pesanan.');end if;
 if p.quota is not null and public.package_usage(p.id)+p_quantity>p.quota then return jsonb_build_object('error','QUOTA','message','Kuota paket tidak mencukupi.');end if;
 if e.seating_mode='GENERAL_ADMISSION' then
  select jsonb_agg((p_items->(u.n-1)::integer)||jsonb_build_object('seatId',u.id) order by u.n) into v_items from (
   select s.id,row_number() over(order by s.number,s.id) n from public.event_seats es join public.seats s on s.id=es.seat_id join public.category_sections cs on cs.section_id=s.section_id and cs.category_id=c.id
   where es.event_id=e.id and not exists(select 1 from public.booking_items i join public.bookings bk on bk.id=i.booking_id where i.event_id=e.id and i.seat_id=s.id and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and bk.status='PENDING_PAYMENT' and bk.expires_at>clock_timestamp()))) order by s.number,s.id limit v_count
  ) u;
  if coalesce(jsonb_array_length(v_items),0)<>v_count then return jsonb_build_object('error','QUOTA','message','Kuota peserta tidak mencukupi.');end if;
 else v_items:=p_items;end if;
 result:=public.reserve_booking_package_base(p_slug,c.id,v_items,p_key);
 if result ? 'error' then return result;end if;
 v_id:=(result->>'id')::uuid;
 update public.bookings set total_idr=p.price_idr*p_quantity,package_id=p.id,package_name_snapshot=p.name,package_size_snapshot=p.participants,package_quantity=p_quantity,package_price_snapshot=p.price_idr,package_request=v_request where id=v_id;
 for v_item in select i.id,a.n from jsonb_array_elements(v_items) with ordinality a(item,n) join public.booking_items i on i.booking_id=v_id and i.seat_id=(a.item->>'seatId')::uuid order by a.n loop
  v_price:=p.price_idr/p.participants+case when (v_item.n-1)%p.participants<p.price_idr%p.participants then 1 else 0 end;
  update public.booking_items set price_snapshot_idr=v_price where id=v_item.id;
 end loop;
 return public.get_booking(v_id);
end;$$;
revoke all on function public.reserve_ticket_package(text,uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.reserve_ticket_package(text,uuid,uuid,integer,jsonb,uuid) to authenticated;

-- Compatibility and event-editor guards are installed below.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.prepare_notification_email(uuid,uuid,jsonb)'::regprocedure);
 execute replace(definition,$s$jsonb_array_length(p_payload->'ticketIds')>6$s$,$s$jsonb_array_length(p_payload->'ticketIds')>30$s$);
end;$$;
create or replace function public.notification_pdf_configuration() returns jsonb language sql stable security definer set search_path='' as $$
 select '{"version":2,"maxTickets":30,"maxPdfBytes":1048576}'::jsonb;
$$;
alter function public.issued_tickets_for_owner(uuid,uuid) rename to issued_tickets_for_owner_v21;
create function public.issued_tickets_for_owner(p_user uuid,p_ticket uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(t||jsonb_build_object('packageName',b.package_name_snapshot,'packageSize',b.package_size_snapshot) order by n),'[]'::jsonb)
 from jsonb_array_elements(public.issued_tickets_for_owner_v21(p_user,p_ticket)) with ordinality a(t,n)
 join public.bookings b on b.id=(t->>'bookingId')::uuid;
$$;
revoke all on function public.issued_tickets_for_owner_v21(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.issued_tickets_for_owner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.issued_tickets_for_owner(uuid,uuid) to service_role;

create or replace function public.reserve_booking_package_base(p_slug text,p_category uuid,p_items jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;c public.ticket_categories; old public.bookings;v_count int;v_seat uuid;v_item jsonb;v_id uuid:=gen_random_uuid();v_item_id uuid;v_now timestamptz;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk kembali.');end if;
 if p_key is null or p_items is null or jsonb_typeof(p_items)<>'array' then return jsonb_build_object('error','INPUT','message','Pilihan kursi tidak valid.');end if;
 v_count:=jsonb_array_length(p_items);
 if v_count<1 or v_count>30 or (select count(distinct x->>'seatId') from jsonb_array_elements(p_items) x)<>v_count then return jsonb_build_object('error','INPUT','message','Pilih maksimal 30 kursi unik sesuai paket.');end if;
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
 if not c.is_active or e.status<>'PUBLISHED' or v_now<c.sales_start or v_now>=c.sales_end or v_now>=e.starts_at then return jsonb_build_object('error','SALES_CLOSED','message','Penjualan tidak sedang dibuka.');end if;
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
revoke all on function public.reserve_booking_package_base(text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

do $$declare definition text;begin
 definition:=pg_get_functiondef('public.manage_event(text,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,$s$return public.manage_event_v12(p_action,p_id,p_data);$s$,$s$if p_action='publish' and not exists(select 1 from public.ticket_categories c join public.ticket_packages p on p.category_id=c.id where c.event_id=p_id and c.is_active and p.is_active) then return jsonb_build_object('error','INCOMPLETE','message','Aktifkan minimal satu kategori dan paket sebelum publikasi.');end if; return public.manage_event_v12(p_action,p_id,p_data);$s$);
 execute definition;
 definition:=pg_get_functiondef('public.manage_event_v12(text,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'not e.seating_managed','not e.seating_managed and not e.ticketing_managed');
 definition:=replace(definition,$s$if p_action='update' and v_mode='GENERAL_ADMISSION' and v_regular_quota<$s$, $s$if p_action='update' and not e.ticketing_managed and v_mode='GENERAL_ADMISSION' and v_regular_quota<$s$);
 definition:=replace(definition,$s$if v_mode='GENERAL_ADMISSION' then perform public.sync_admission_inventory$s$, $s$if v_mode='GENERAL_ADMISSION' and not coalesce(e.ticketing_managed,false) then perform public.sync_admission_inventory$s$);
 definition:=replace(definition,$s$if p_action='update' and e.seating_managed and exists$s$, $s$if p_action='update' and (e.seating_managed or e.ticketing_managed) and exists$s$);
 execute definition;
end;$$;

alter function public.reserve_booking(text,uuid,jsonb,uuid) rename to reserve_booking_v21;
create function public.reserve_booking(p_slug text,p_category uuid,p_items jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.events where slug=p_slug and ticketing_managed) then return jsonb_build_object('error','PACKAGE_REQUIRED','message','Pilih jenis paket tiket.');end if;
 return public.reserve_booking_v21(p_slug,p_category,p_items,p_key);
end;$$;
revoke all on function public.reserve_booking_v21(text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_booking(text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.reserve_booking(text,uuid,jsonb,uuid) to authenticated;
alter function public.reserve_general_admission(text,uuid,jsonb,uuid) rename to reserve_general_admission_v21;
create function public.reserve_general_admission(p_slug text,p_category uuid,p_attendees jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.events where slug=p_slug and ticketing_managed) then return jsonb_build_object('error','PACKAGE_REQUIRED','message','Pilih jenis paket tiket.');end if;
 return public.reserve_general_admission_v21(p_slug,p_category,p_attendees,p_key);
end;$$;
revoke all on function public.reserve_general_admission_v21(text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_general_admission(text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.reserve_general_admission(text,uuid,jsonb,uuid) to authenticated;
commit;
