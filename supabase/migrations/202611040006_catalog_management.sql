begin;

alter table public.events
 add column organizer_name text not null default 'SummaPass',
 add column area text not null default '',
 add column theme text not null default 'sunset' check(theme in ('sunset','clay','play','night')),
 add column headline text not null default '',
 add column cover_url text not null default '';
update public.events e set area=v.name,headline=upper(e.title) from public.venues v where v.id=e.venue_id;

create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 action text not null,
 before_data jsonb,
 after_data jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index audit_logs_event_time on public.audit_logs(event_id,created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public,anon,authenticated;
grant select on public.audit_logs to authenticated;
create policy organizer_audit_read on public.audit_logs for select to authenticated using(public.has_event_access(event_id,'ORGANIZER'));

-- Internal serializer. Public callers must go through the scoped entry points.
create function public.catalog_event_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'id',e.id,'slug',e.slug,'title',e.title,'description',e.description,'category',e.category,'status',e.status,
 'startsAt',e.starts_at,'endsAt',e.ends_at,
 'date',to_char(e.starts_at at time zone 'Asia/Jakarta','YYYY-MM-DD'),
 'time',to_char(e.starts_at at time zone 'Asia/Jakarta','HH24.MI')||' WIB',
 'headline',coalesce(nullif(e.headline,''),upper(e.title)),'theme',e.theme,
 'organizer',e.organizer_name,'area',coalesce(nullif(e.area,''),(select name from public.venues where id=e.venue_id)),'coverUrl',e.cover_url,
 'rules',coalesce(nullif(e.rules,''),'Satu tiket untuk satu peserta dan satu kursi.'),
 'price',coalesce((select price_idr from public.ticket_categories where event_id=e.id and name='Regular'),0),
 'frontPrice',coalesce((select price_idr from public.ticket_categories where event_id=e.id and name='Front'),0),
 'frontQuota',coalesce((select quota from public.ticket_categories where event_id=e.id and name='Front'),24),
 'regularQuota',coalesce((select quota from public.ticket_categories where event_id=e.id and name='Regular'),24),
 'salesStart',coalesce((select min(sales_start) from public.ticket_categories where event_id=e.id),e.starts_at-interval '1 day'),
 'salesEnd',coalesce((select max(sales_end) from public.ticket_categories where event_id=e.id),e.starts_at))
 from public.events e where e.id=p_id;
$$;
revoke all on function public.catalog_event_json(uuid) from public,anon,authenticated;

create function public.public_catalog(p_slug text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(public.catalog_event_json(e.id) order by e.starts_at),'[]'::jsonb)
 from public.events e where e.status='PUBLISHED' and (p_slug is null or e.slug=p_slug);
$$;
revoke all on function public.public_catalog(text) from public;
grant execute on function public.public_catalog(text) to anon,authenticated;

create function public.organizer_event(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_id,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 return public.catalog_event_json(p_id);
end;$$;
revoke all on function public.organizer_event(uuid) from public,anon;
grant execute on function public.organizer_event(uuid) to authenticated;

create function public.manage_event(p_action text,p_id uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 e public.events;v_id uuid:=p_id;v_venue uuid;v_before jsonb;v_after jsonb;
 v_title text;v_description text;v_category text;v_rules text;v_area text;v_organizer text;v_theme text;
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
  if v_regular_price>100000000 or v_front_price>100000000 or v_regular_quota not between 1 and 24 or v_front_quota not between 1 and 24 then return jsonb_build_object('error','INPUT','message','Harga maksimal Rp100.000.000 dan kuota 1 sampai 24 kursi per kategori.');end if;
  foreach v_field in array array['startsAt','endsAt','salesStart','salesEnd'] loop
   if (p_data->>v_field)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then return jsonb_build_object('error','INPUT','message','Waktu harus menyertakan zona waktu.');end if;
  end loop;
  v_start:=(p_data->>'startsAt')::timestamptz;v_end:=(p_data->>'endsAt')::timestamptz;
  v_sale_start:=(p_data->>'salesStart')::timestamptz;v_sale_end:=(p_data->>'salesEnd')::timestamptz;
  if not isfinite(v_start) or not isfinite(v_end) or not isfinite(v_sale_start) or not isfinite(v_sale_end) or v_end<=v_start or v_sale_start>=v_sale_end or v_sale_end>v_start then return jsonb_build_object('error','INPUT','message','Periksa urutan jadwal dan penjualan.');end if;

  -- This editor owns only the existing two-section layout. Future arbitrary
  -- categories/venues need a separate editor and must not be silently overwritten.
  if p_action='update' and ((select count(*) from public.ticket_categories where event_id=v_id)<>2 or not exists(select 1 from public.ticket_categories where event_id=v_id and name='Front') or not exists(select 1 from public.ticket_categories where event_id=v_id and name='Regular')) then return jsonb_build_object('error','LAYOUT','message','Layout event belum didukung editor ini.');end if;
  if p_action='update' and (v_start<>e.starts_at or v_end<>e.ends_at or v_area<>e.area) and exists(select 1 from public.bookings where event_id=v_id and (status='CONFIRMED' or (status='PENDING_PAYMENT' and expires_at>clock_timestamp()))) then return jsonb_build_object('error','EVENT_LOCKED','message','Jadwal dan lokasi terkunci karena ada tiket terjual atau reservasi aktif.');end if;
  foreach v_section in array array['Front','Regular'] loop
   v_quota:=case when v_section='Front' then v_front_quota else v_regular_quota end;
   select count(*) into v_capacity from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.venue_id=v_venue and vs.name=v_section and (p_action='create' or exists(select 1 from public.event_seats es where es.event_id=v_id and es.seat_id=s.id));
   if v_capacity<>24 or v_quota>v_capacity then return jsonb_build_object('error','LAYOUT','message','Editor membutuhkan denah Front dan Regular masing-masing 24 kursi.');end if;
   if p_action='update' then
    select count(*) into v_occupied from public.booking_items i join public.bookings b on b.id=i.booking_id join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id where i.event_id=v_id and vs.name=v_section and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()));
    if v_quota<v_occupied then return jsonb_build_object('error','QUOTA','message','Kuota tidak boleh kurang dari kursi terjual dan reservasi aktif.');end if;
   end if;
  end loop;
  if p_action='create' then
   insert into public.events(id,venue_id,slug,title,description,rules,category,starts_at,ends_at,organizer_name,area,theme,headline)
   values(v_id,v_venue,coalesce(nullif(trim(both '-' from left(regexp_replace(lower(v_title),'[^a-z0-9]+','-','g'),65)),''),'event')||'-'||replace(v_id::text,'-',''),v_title,v_description,v_rules,v_category,v_start,v_end,v_organizer,v_area,v_theme,upper(v_title));
   insert into public.event_access(event_id,user_id,role) values(v_id,auth.uid(),'ORGANIZER');
   insert into public.ticket_categories(event_id,venue_id,name,price_idr,quota,sales_start,sales_end) values(v_id,v_venue,'Regular',v_regular_price,v_regular_quota,v_sale_start,v_sale_end),(v_id,v_venue,'Front',v_front_price,v_front_quota,v_sale_start,v_sale_end);
   insert into public.category_sections(category_id,section_id,venue_id) select c.id,vs.id,v_venue from public.ticket_categories c join public.venue_sections vs on vs.venue_id=v_venue and vs.name=c.name where c.event_id=v_id;
   insert into public.event_seats(event_id,seat_id) select v_id,s.id from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.venue_id=v_venue and vs.name in ('Front','Regular');
  else
   update public.events set title=v_title,description=v_description,rules=v_rules,category=v_category,starts_at=v_start,ends_at=v_end,organizer_name=v_organizer,area=v_area,theme=v_theme,headline=upper(v_title),updated_at=clock_timestamp() where id=v_id;
   update public.ticket_categories set price_idr=case name when 'Front' then v_front_price else v_regular_price end,quota=case name when 'Front' then v_front_quota else v_regular_quota end,sales_start=v_sale_start,sales_end=v_sale_end,updated_at=clock_timestamp() where event_id=v_id;
   update public.event_seats set revision=revision+1 where event_id=v_id;
  end if;
 elsif p_action='publish' then
  if e.starts_at<=clock_timestamp() or char_length(trim(e.title))<3 or char_length(trim(e.description))<20 or not exists(select 1 from public.ticket_categories where event_id=v_id) then return jsonb_build_object('error','INCOMPLETE','message','Lengkapi detail dan jadwal event sebelum publikasi.');end if;
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
revoke all on function public.manage_event(text,uuid,jsonb) from public,anon;
grant execute on function public.manage_event(text,uuid,jsonb) to authenticated;

-- Preserve the complete event at issuance, including for unpublished archives.
alter table public.tickets add column event_snapshot jsonb;
update public.tickets t set event_snapshot=public.catalog_event_json(i.event_id) from public.booking_items i where i.id=t.booking_item_id;
create function public.snapshot_ticket_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select public.catalog_event_json(event_id) into new.event_snapshot from public.booking_items where id=new.booking_item_id;
 return new;
end;$$;
revoke all on function public.snapshot_ticket_event() from public,anon,authenticated;
create trigger ticket_event_snapshot before insert on public.tickets for each row execute function public.snapshot_ticket_event();

create or replace function public.organizer_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.event_access where user_id=auth.uid() and role='ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 select jsonb_build_object('mode','supabase',
 'events',coalesce((select jsonb_agg(public.catalog_event_json(e.id) order by e.starts_at) from public.events e where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb),
 'inventory',coalesce((select jsonb_agg(public.seat_inventory(e.slug)) from public.events e where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'reference',b.reference,'slug',e.slug,'userId',b.user_id,'categoryId',b.category_id,'categoryName',c.name,'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,'expiresAt',b.expires_at,'total',b.total_idr,'paymentStatus',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else p.status end,'items',coalesce((select jsonb_agg(jsonb_build_object('seatId',i.seat_id,'label',vs.name||' '||s.row_label||s.number,'name',a.display_name,'price',i.price_snapshot_idr)) from public.booking_items i join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.attendees a on a.booking_item_id=i.id where i.booking_id=b.id),'[]'::jsonb)) order by b.created_at desc) from public.bookings b join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id left join public.payments p on p.booking_id=b.id where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb)) into result;
 return result;
end;$$;
create or replace function public.issued_tickets_for_owner(p_user uuid,p_ticket uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'reference',t.reference,'bookingId',b.id,'userId',b.user_id,'slug',e.slug,'categoryName',c.name,'seatId',i.seat_id,'seatLabel',vs.name||' '||s.row_label||s.number,'attendeeName',a.display_name,'price',i.price_snapshot_idr,'issuedAt',t.issued_at,'status',t.status,'event',t.event_snapshot,'checkedInAt',(select checked_in_at from public.check_ins ci where ci.ticket_id=t.id),'tokenHash',t.token_hash,'encryptedToken',ts.encrypted_token) order by t.issued_at desc,t.id),'[]'::jsonb)
 from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings b on b.id=i.booking_id join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id join public.attendees a on a.booking_item_id=i.id join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.ticket_secrets ts on ts.ticket_id=t.id
 where b.user_id=p_user and (p_ticket is null or t.id=p_ticket);
$$;
create or replace function public.get_booking(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('id',b.id,'reference',b.reference,'slug',e.slug,'eventTitle',e.title,'userId',b.user_id,'categoryId',b.category_id,'categoryName',c.name,'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,'expiresAt',b.expires_at,'total',b.total_idr,'paymentStatus',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else (select p.status from public.payments p where p.booking_id=b.id) end,'items',(select jsonb_agg(jsonb_build_object('seatId',i.seat_id,'label',vs.name||' '||s.row_label||s.number,'name',a.display_name,'price',i.price_snapshot_idr) order by s.row_label,s.number) from public.booking_items i join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.attendees a on a.booking_item_id=i.id where i.booking_id=b.id)) into result
 from public.bookings b join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id where b.id=p_id and b.user_id=(select auth.uid());
 return coalesce(result,jsonb_build_object('error','NOT_FOUND','message','Reservasi tidak ditemukan.'));
end;$$;
-- Supabase creates this publication. Local SQL-only test databases do not.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='event_seats') then
  alter publication supabase_realtime add table public.event_seats;
 end if;
end;$$;
commit;
