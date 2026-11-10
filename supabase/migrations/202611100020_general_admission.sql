-- General admission uses internal inventory units, never buyer-selected seats.
-- Existing allocation, payment, QR and check-in invariants remain in force.
begin;
alter table public.events add column seating_mode text not null default 'SEATED'
 check(seating_mode in ('SEATED','GENERAL_ADMISSION'));

create function public.sync_admission_inventory(p_event uuid,p_quota integer) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events;v_section uuid;
begin
 select * into e from public.events where id=p_event for update;
 if e.seating_mode<>'GENERAL_ADMISSION' or p_quota not between 1 and 2000 then
  raise exception 'Kuota tiket tidak valid.' using errcode='22023';
 end if;
 select id into v_section from public.venue_sections where event_id=e.id and name='Regular';
 if v_section is null then
  insert into public.venue_sections(venue_id,event_id,name) values(e.venue_id,e.id,'Regular') returning id into v_section;
 end if;
 -- Units are retained when quota decreases, preserving historical foreign keys.
 insert into public.seats(section_id,row_label,number,x,y)
 select v_section,'GA',n,0,0 from generate_series(1,p_quota) n on conflict(section_id,row_label,number) do nothing;
 insert into public.event_seats(event_id,seat_id)
 select e.id,id from public.seats where section_id=v_section on conflict do nothing;
 insert into public.category_sections(category_id,section_id,venue_id)
 select id,v_section,e.venue_id from public.ticket_categories where event_id=e.id and name='Regular' on conflict do nothing;
end;$$;
revoke all on function public.sync_admission_inventory(uuid,integer) from public,anon,authenticated,service_role;

alter function public.catalog_event_json(uuid) rename to catalog_event_json_v19;
create function public.catalog_event_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.catalog_event_json_v19(p_id)||jsonb_build_object('seatingMode',seating_mode) from public.events where id=p_id;
$$;
revoke all on function public.catalog_event_json_v19(uuid),public.catalog_event_json(uuid) from public,anon,authenticated,service_role;

alter function public.seat_inventory(text) rename to seat_inventory_v19;
create function public.seat_inventory(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;v_mode text;
begin
 result:=public.seat_inventory_v19(p_slug);
 if result ? 'error' then return result;end if;
 select seating_mode into v_mode from public.events where slug=p_slug;
 result:=result||jsonb_build_object('seatingMode',v_mode);
 if v_mode='GENERAL_ADMISSION' then
  result:=result||jsonb_build_object('seats','[]'::jsonb,'categories',coalesce((
   select jsonb_agg(c||jsonb_build_object(
    'sold',(select count(*) from public.booking_items i join public.bookings b on b.id=i.booking_id where b.category_id=(c->>'id')::uuid and i.allocation_status='SOLD'),
    'reserved',(select count(*) from public.booking_items i join public.bookings b on b.id=i.booking_id where b.category_id=(c->>'id')::uuid and i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp())
   )) from jsonb_array_elements(result->'categories') c),'[]'::jsonb));
 end if;
 return result;
end;$$;
revoke all on function public.seat_inventory_v19(text) from public,anon,authenticated,service_role;
revoke all on function public.seat_inventory(text) from public;
grant execute on function public.seat_inventory(text) to anon,authenticated;

alter function public.reserve_booking(text,uuid,jsonb,uuid) rename to reserve_booking_v19;
create function public.reserve_booking(p_slug text,p_category uuid,p_items jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.events where slug=p_slug and seating_mode='GENERAL_ADMISSION') then
  return jsonb_build_object('error','MODE','message','Event ini tanpa kursi. Pilih jumlah tiket.');
 end if;
 return public.reserve_booking_v19(p_slug,p_category,p_items,p_key);
end;$$;
revoke all on function public.reserve_booking_v19(text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_booking(text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.reserve_booking(text,uuid,jsonb,uuid) to authenticated;

create function public.reserve_general_admission(p_slug text,p_category uuid,p_attendees jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;old public.bookings;v_items jsonb;v_count integer;v_names jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk kembali.');end if;
 if p_key is null or jsonb_typeof(p_attendees) is distinct from 'array' then return jsonb_build_object('error','INPUT','message','Data peserta tidak valid.');end if;
 v_count:=jsonb_array_length(p_attendees);
 if v_count not between 1 and 6 or exists(select 1 from jsonb_array_elements(p_attendees) x where jsonb_typeof(x->'name') is distinct from 'string' or char_length(trim(x->>'name')) not between 1 and 100) then
  return jsonb_build_object('error','INPUT','message','Isi nama untuk 1 sampai 6 tiket.');
 end if;
 -- Same event lock as all existing reservation, cancellation and payment RPCs.
 select * into e from public.events where slug=p_slug for update;
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 if e.seating_mode<>'GENERAL_ADMISSION' then return jsonb_build_object('error','MODE','message','Pilih kursi untuk event ini.');end if;
 select * into old from public.bookings where user_id=auth.uid() and idempotency_key=p_key;
 if found then
  select jsonb_agg(jsonb_build_object('name',x->>'name') order by n) into v_names from jsonb_array_elements(old.request_items) with ordinality a(x,n);
  if old.event_id<>e.id or old.category_id<>p_category or v_names<>p_attendees then return jsonb_build_object('error','KEY_REUSED','message','Permintaan berubah. Silakan coba lagi.');end if;
  return public.get_booking(old.id);
 end if;
 if not exists(select 1 from public.ticket_categories where id=p_category and event_id=e.id) then return jsonb_build_object('error','CATEGORY','message','Kategori tidak sesuai event.');end if;
 select jsonb_agg(jsonb_build_object('seatId',u.id,'name',p_attendees->(u.n-1)::integer->>'name') order by u.n) into v_items
 from (
  select s.id,row_number() over(order by s.number,s.id) n from public.event_seats es
  join public.seats s on s.id=es.seat_id join public.category_sections cs on cs.section_id=s.section_id and cs.category_id=p_category
  where es.event_id=e.id and not exists(
   select 1 from public.booking_items i join public.bookings b on b.id=i.booking_id
   where i.event_id=e.id and i.seat_id=s.id and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()))
  ) order by s.number,s.id limit v_count
 ) u;
 if coalesce(jsonb_array_length(v_items),0)<>v_count then return jsonb_build_object('error','QUOTA','message','Jumlah tiket tersedia tidak mencukupi.');end if;
 return public.reserve_booking_v19(p_slug,p_category,v_items,p_key);
end;$$;
revoke all on function public.reserve_general_admission(text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.reserve_general_admission(text,uuid,jsonb,uuid) to authenticated;

-- A single label helper covers booking summaries, PDF/email tickets and check-in.
create function public.inventory_unit_label(p_seat uuid) returns text language sql stable security definer set search_path='' as $$
 select case when s.row_label='GA' and exists(select 1 from public.events e where e.id=vs.event_id and e.seating_mode='GENERAL_ADMISSION')
 then 'Tanpa nomor kursi' else vs.name||' '||s.row_label||s.number end
 from public.seats s join public.venue_sections vs on vs.id=s.section_id where s.id=p_seat;
$$;
revoke all on function public.inventory_unit_label(uuid) from public,anon,authenticated,service_role;

-- Update existing projections in place while preserving their permissions and checks.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname<>'inventory_unit_label' and p.prokind='f'
 and (position('vs.name||'' ''||s.row_label||s.number' in p.prosrc)>0 or position('vs.name || '' '' || s.row_label || s.number' in p.prosrc)>0) loop
  definition:=pg_get_functiondef(f.oid);
  execute replace(replace(definition,'vs.name||'' ''||s.row_label||s.number','public.inventory_unit_label(s.id)'), 'vs.name || '' '' || s.row_label || s.number','public.inventory_unit_label(s.id)');
 end loop;
end;$$;

-- GA inventory is managed through the event editor, not a visual seating editor.
alter function public.configure_event_layout(uuid,integer,jsonb) rename to configure_event_layout_v19;
create function public.configure_event_layout(p_event uuid,p_version integer,p_layout jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 if exists(select 1 from public.events where id=p_event and seating_mode='GENERAL_ADMISSION') then return jsonb_build_object('error','MODE','message','Event tanpa kursi tidak menggunakan denah. Atur kuota di detail event.');end if;
 return public.configure_event_layout_v19(p_event,p_version,p_layout);
end;$$;
revoke all on function public.configure_event_layout_v19(uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.configure_event_layout(uuid,integer,jsonb) from public,anon;
grant execute on function public.configure_event_layout(uuid,integer,jsonb) to authenticated;

alter function public.configure_ticket_category(uuid,uuid,integer,jsonb) rename to configure_ticket_category_v19;
create function public.configure_ticket_category(p_event uuid,p_category uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 if exists(select 1 from public.events where id=p_event and seating_mode='GENERAL_ADMISSION') then return jsonb_build_object('error','MODE','message','Atur harga dan kuota tiket di detail event.');end if;
 return public.configure_ticket_category_v19(p_event,p_category,p_version,p_data);
end;$$;
revoke all on function public.configure_ticket_category_v19(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.configure_ticket_category(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.configure_ticket_category(uuid,uuid,integer,jsonb) to authenticated;

-- Event-management implementation follows below, retaining the lifecycle wrapper.

create or replace function public.manage_event_v12(p_action text,p_id uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 e public.events;v_id uuid:=p_id;v_venue uuid;v_before jsonb;v_after jsonb;
 v_mode text;v_title text;v_description text;v_category text;v_rules text;v_area text;v_organizer text;v_theme text;
 v_start timestamptz;v_end timestamptz;v_sale_start timestamptz;v_sale_end timestamptz;
 v_regular_price bigint;v_front_price bigint;v_regular_quota integer;v_front_quota integer;
 v_field text;v_section text;v_quota integer;v_capacity integer;v_occupied integer;v_url text;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk.');end if;
 if p_action is null or p_action not in ('create','update','publish','unpublish','archive','cover') then return jsonb_build_object('error','INPUT','message','Tindakan tidak valid.');end if;
 if p_action='create' then
  select ev.venue_id into v_venue from public.events ev where public.has_event_access(ev.id,'ORGANIZER') order by ev.created_at,ev.id limit 1;
  if not found then return jsonb_build_object('error','FORBIDDEN','message','Akses organizer diperlukan.');end if;
  v_id:=gen_random_uuid();
 else
  select * into e from public.events where id=v_id for update;
  if not found or not public.has_event_access(v_id,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
  if e.status='ARCHIVED' then return jsonb_build_object('error','ARCHIVED','message','Event arsip tidak dapat diedit.');end if;
  v_venue:=e.venue_id;v_before:=public.catalog_event_json(v_id);
 end if;

 if p_action in ('create','update') then
  v_mode:=coalesce(p_data->>'seatingMode',e.seating_mode,'SEATED');
  if v_mode not in ('SEATED','GENERAL_ADMISSION') then return jsonb_build_object('error','INPUT','message','Jenis tiket tidak valid.');end if;
  if p_action='update' and v_mode<>e.seating_mode then return jsonb_build_object('error','MODE_LOCKED','message','Jenis tiket tidak dapat diubah setelah event disimpan. Buat event baru.');end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' then return jsonb_build_object('error','INPUT','message','Detail event tidak valid.');end if;
  foreach v_field in array array['title','description','category','rules','area','organizer','theme','startsAt','endsAt','salesStart','salesEnd'] loop
   if jsonb_typeof(p_data->v_field) is distinct from 'string' then return jsonb_build_object('error','INPUT','message','Lengkapi detail event.');end if;
  end loop;
  v_title:=trim(p_data->>'title');v_description:=trim(p_data->>'description');v_category:=p_data->>'category';
  v_rules:=trim(p_data->>'rules');v_area:=trim(p_data->>'area');v_organizer:=trim(p_data->>'organizer');v_theme:=p_data->>'theme';
  if char_length(v_title) not between 3 and 120 or char_length(v_description) not between 20 and 5000 or char_length(v_rules) not between 1 and 3000 or char_length(v_area) not between 1 and 200 or char_length(v_organizer) not between 1 and 120 or v_category not in ('Musik','Workshop','Keluarga') or v_theme not in ('sunset','clay','play','night') then return jsonb_build_object('error','INPUT','message','Periksa detail event.');end if;
  foreach v_field in array array['price','frontPrice','frontQuota','regularQuota'] loop
   if jsonb_typeof(p_data->v_field) is distinct from 'number' or (p_data->>v_field)!~'^[0-9]+$' then return jsonb_build_object('error','INPUT','message','Harga dan kuota harus bilangan bulat.');end if;
  end loop;
  v_regular_price:=(p_data->>'price')::bigint;v_front_price:=(p_data->>'frontPrice')::bigint;
  v_regular_quota:=(p_data->>'regularQuota')::integer;v_front_quota:=(p_data->>'frontQuota')::integer;
  if v_regular_price>100000000 or v_front_price>100000000 or v_regular_quota not between 1 and (case when v_mode='GENERAL_ADMISSION' then 2000 else 24 end) or v_front_quota not between 1 and 24 then return jsonb_build_object('error','INPUT','message','Periksa harga dan kuota tiket. Event tanpa kursi maksimal 2.000 tiket.');end if;
  foreach v_field in array array['startsAt','endsAt','salesStart','salesEnd'] loop
   if (p_data->>v_field)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then return jsonb_build_object('error','INPUT','message','Waktu harus menyertakan zona waktu.');end if;
  end loop;
  v_start:=(p_data->>'startsAt')::timestamptz;v_end:=(p_data->>'endsAt')::timestamptz;
  v_sale_start:=(p_data->>'salesStart')::timestamptz;v_sale_end:=(p_data->>'salesEnd')::timestamptz;
  if not isfinite(v_start) or not isfinite(v_end) or not isfinite(v_sale_start) or not isfinite(v_sale_end) or v_end<=v_start or v_sale_start>=v_sale_end or v_sale_end>v_start then return jsonb_build_object('error','INPUT','message','Periksa urutan jadwal dan penjualan.');end if;

  -- This editor owns only the existing two-section layout. Future arbitrary
  -- categories/venues need a separate editor and must not be silently overwritten.
  if p_action='update' and v_mode='SEATED' and not e.seating_managed and ((select count(*) from public.ticket_categories where event_id=v_id)<>2 or not exists(select 1 from public.ticket_categories where event_id=v_id and name='Front') or not exists(select 1 from public.ticket_categories where event_id=v_id and name='Regular')) then return jsonb_build_object('error','LAYOUT','message','Layout event belum didukung editor ini.');end if;
  if p_action='update' and (v_start<>e.starts_at or v_end<>e.ends_at or v_area<>e.area) and exists(select 1 from public.bookings where event_id=v_id and (status='CONFIRMED' or (status='PENDING_PAYMENT' and expires_at>clock_timestamp()))) then return jsonb_build_object('error','EVENT_LOCKED','message','Jadwal dan lokasi terkunci karena ada tiket terjual atau reservasi aktif.');end if;
  if v_mode='SEATED' and (p_action='create' or not e.seating_managed) then
  foreach v_section in array array['Front','Regular'] loop
   v_quota:=case when v_section='Front' then v_front_quota else v_regular_quota end;
   select count(*) into v_capacity from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.event_id is null and vs.venue_id=v_venue and vs.name=v_section and (p_action='create' or exists(select 1 from public.event_seats es where es.event_id=v_id and es.seat_id=s.id));
   if v_capacity<>24 or v_quota>v_capacity then return jsonb_build_object('error','LAYOUT','message','Editor membutuhkan denah Front dan Regular masing-masing 24 kursi.');end if;
   if p_action='update' then
    select count(*) into v_occupied from public.booking_items i join public.bookings b on b.id=i.booking_id join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id where i.event_id=v_id and vs.name=v_section and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()));
    if v_quota<v_occupied then return jsonb_build_object('error','QUOTA','message','Kuota tidak boleh kurang dari kursi terjual dan reservasi aktif.');end if;
   end if;
  end loop;
  end if;
  if p_action='update' and v_mode='GENERAL_ADMISSION' and v_regular_quota<(select count(*) from public.booking_items i join public.bookings b on b.id=i.booking_id where i.event_id=v_id and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()))) then return jsonb_build_object('error','QUOTA','message','Kuota tidak boleh kurang dari tiket terjual dan reservasi aktif.');end if;
  if p_action='update' and e.seating_managed and exists(select 1 from public.ticket_categories where event_id=v_id and sales_end>v_start) then return jsonb_build_object('error','INPUT','message','Perbarui periode jual kategori sebelum memajukan jadwal acara.');end if;
  if p_action='create' then
   insert into public.events(id,venue_id,slug,title,description,rules,category,starts_at,ends_at,organizer_name,area,theme,headline,seating_mode)
   values(v_id,v_venue,coalesce(nullif(trim(both '-' from left(regexp_replace(lower(v_title),'[^a-z0-9]+','-','g'),65)),''),'event')||'-'||replace(v_id::text,'-',''),v_title,v_description,v_rules,v_category,v_start,v_end,v_organizer,v_area,v_theme,upper(v_title),v_mode);
   insert into public.event_access(event_id,user_id,role) values(v_id,auth.uid(),'ORGANIZER');
   insert into public.ticket_categories(event_id,venue_id,name,price_idr,quota,sales_start,sales_end) select v_id,v_venue,'Regular',v_regular_price,v_regular_quota,v_sale_start,v_sale_end union all select v_id,v_venue,'Front',v_front_price,v_front_quota,v_sale_start,v_sale_end where v_mode='SEATED';
   insert into public.category_sections(category_id,section_id,venue_id) select c.id,vs.id,v_venue from public.ticket_categories c join public.venue_sections vs on vs.event_id is null and vs.venue_id=v_venue and vs.name=c.name where c.event_id=v_id and v_mode='SEATED';
   insert into public.event_seats(event_id,seat_id) select v_id,s.id from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.event_id is null and vs.venue_id=v_venue and vs.name in ('Front','Regular') and v_mode='SEATED';
   if v_mode='GENERAL_ADMISSION' then perform public.sync_admission_inventory(v_id,v_regular_quota);end if;
  else
   if v_mode='GENERAL_ADMISSION' then perform public.sync_admission_inventory(v_id,v_regular_quota);end if;
   update public.events set title=v_title,description=v_description,rules=v_rules,category=v_category,starts_at=v_start,ends_at=v_end,organizer_name=v_organizer,area=v_area,theme=v_theme,headline=upper(v_title),updated_at=clock_timestamp() where id=v_id;
   if not e.seating_managed then
   update public.ticket_categories set price_idr=case name when 'Front' then v_front_price else v_regular_price end,quota=case name when 'Front' then v_front_quota else v_regular_quota end,sales_start=v_sale_start,sales_end=v_sale_end,updated_at=clock_timestamp() where event_id=v_id;
   update public.events set seating_version=seating_version+1 where id=v_id;
   end if;
   update public.event_seats set revision=revision+1 where event_id=v_id;
  end if;
 elsif p_action='publish' then
  if e.starts_at<=clock_timestamp() or char_length(trim(e.title))<3 or char_length(trim(e.description))<20 or not exists(select 1 from public.ticket_categories where event_id=v_id and is_active) then return jsonb_build_object('error','INCOMPLETE','message','Lengkapi detail dan jadwal event sebelum publikasi.');end if;
  update public.events set status='PUBLISHED',updated_at=clock_timestamp() where id=v_id;
 elsif p_action='unpublish' then
  update public.events set status='UNPUBLISHED',updated_at=clock_timestamp() where id=v_id;
 elsif p_action='archive' then
  if e.ends_at>clock_timestamp() or exists(select 1 from public.bookings where event_id=v_id and status='PENDING_PAYMENT' and expires_at>clock_timestamp()) then return jsonb_build_object('error','ACTIVE','message','Arsip hanya setelah acara selesai dan tidak ada reservasi aktif.');end if;
  update public.events set status='ARCHIVED',updated_at=clock_timestamp() where id=v_id;
 elsif p_action='cover' then
  v_url:=p_data->>'coverUrl';
  if v_url is null or v_url !~ ('^/api/covers/'||v_id::text||'_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$') then return jsonb_build_object('error','INPUT','message','Cover tidak valid.');end if;
  update public.events set cover_url=v_url,updated_at=clock_timestamp() where id=v_id;
 end if;
 v_after:=public.catalog_event_json(v_id);
 insert into public.audit_logs(event_id,actor_id,action,before_data,after_data) values(v_id,auth.uid(),p_action,v_before,v_after);
 return v_after;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
 return jsonb_build_object('error','INPUT','message','Format harga, kuota, atau waktu tidak valid.');
end;$$;
revoke all on function public.manage_event_v12(text,uuid,jsonb) from public,anon,authenticated,service_role;
commit;
