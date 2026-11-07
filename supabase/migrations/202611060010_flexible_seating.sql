begin;
alter table public.events add column seating_managed boolean not null default false,add column seating_version integer not null default 0,add column seating_width integer not null default 520 check(seating_width between 320 and 10000),add column seating_height integer not null default 570 check(seating_height between 240 and 10000);
alter table public.venue_sections add column event_id uuid,add foreign key(event_id,venue_id) references public.events(id,venue_id) on delete restrict;
alter table public.venue_sections drop constraint venue_sections_venue_id_name_key;
create unique index shared_section_name on public.venue_sections(venue_id,name) where event_id is null;
create unique index event_section_name on public.venue_sections(event_id,name) where event_id is not null;
alter table public.ticket_categories add column is_active boolean not null default true;
drop policy section_catalog on public.venue_sections;
create policy section_catalog on public.venue_sections for select using((event_id is null and public.venue_is_visible(venue_id)) or (event_id is not null and public.event_is_visible(event_id)));

create function public.guard_event_section() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_event uuid;category_event uuid;
begin
 if tg_table_name='event_seats' then
  select vs.event_id into owner_event from public.seats s join public.venue_sections vs on vs.id=s.section_id where s.id=new.seat_id;
  category_event:=new.event_id;
 else
  select event_id into owner_event from public.venue_sections where id=new.section_id;
  select event_id into category_event from public.ticket_categories where id=new.category_id;
 end if;
 if owner_event is not null and owner_event<>category_event then raise exception 'Section belongs to another event' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function public.guard_event_section() from public,anon,authenticated;
create trigger scope_event_seat before insert or update on public.event_seats for each row execute function public.guard_event_section();
create trigger scope_category_section before insert or update on public.category_sections for each row execute function public.guard_event_section();

alter table public.bookings add column category_name_snapshot text;
update public.bookings b set category_name_snapshot=c.name from public.ticket_categories c where c.id=b.category_id;
alter table public.bookings alter column category_name_snapshot set not null;
create function public.snapshot_booking_category() returns trigger language plpgsql security definer set search_path='' as $$
begin select name into new.category_name_snapshot from public.ticket_categories where id=new.category_id;return new;end;$$;
revoke all on function public.snapshot_booking_category() from public,anon,authenticated;
create trigger booking_category_snapshot before insert on public.bookings for each row execute function public.snapshot_booking_category();

create function public.seating_config_json(p_event uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',e.seating_version,'width',e.seating_width,'height',e.seating_height,
 'sections',coalesce((select jsonb_agg(jsonb_build_object('id',vs.id,'name',vs.name,'seats',(select jsonb_agg(jsonb_build_object('id',s.id,'row',s.row_label,'number',s.number,'x',s.x,'y',s.y+case when vs.event_id is null and vs.name='Regular' then 235 else 0 end) order by s.row_label,s.number) from public.seats s join public.event_seats es on es.seat_id=s.id and es.event_id=e.id where s.section_id=vs.id)) order by vs.name) from public.venue_sections vs where exists(select 1 from public.event_seats es join public.seats s on s.id=es.seat_id where es.event_id=e.id and s.section_id=vs.id)),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price_idr,'quota',c.quota,'salesStart',c.sales_start,'salesEnd',c.sales_end,'active',c.is_active,'sections',(select jsonb_agg(vs.name order by vs.name) from public.category_sections cs join public.venue_sections vs on vs.id=cs.section_id where cs.category_id=c.id)) order by c.name) from public.ticket_categories c where c.event_id=e.id),'[]'::jsonb)) from public.events e where e.id=p_event;
$$;
revoke all on function public.seating_config_json(uuid) from public,anon,authenticated;
create function public.seating_configuration(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 return public.seating_config_json(p_event);
end;$$;
revoke all on function public.seating_configuration(uuid) from public,anon;
grant execute on function public.seating_configuration(uuid) to authenticated;

create function public.assert_category_input(p_event uuid,p_data jsonb,p_category uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare field text;capacity integer;occupied integer;v_start timestamptz;v_end timestamptz;event_start timestamptz;names text[];old_names text[];
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Kategori tidak valid.' using errcode='22023';end if;
 foreach field in array array['name','salesStart','salesEnd'] loop
  if jsonb_typeof(p_data->field) is distinct from 'string' then raise exception 'Lengkapi kategori dan periode jual.' using errcode='22023';end if;
 end loop;
 if char_length(trim(p_data->>'name')) not between 1 and 80 then raise exception 'Nama kategori maksimal 80 karakter.' using errcode='22023';end if;
 foreach field in array array['price','quota'] loop
  if jsonb_typeof(p_data->field) is distinct from 'number' or (p_data->>field)!~'^[0-9]+$' then raise exception 'Harga dan kuota harus bilangan bulat.' using errcode='22023';end if;
 end loop;
 if (p_data->>'price')::bigint>100000000 or (p_data->>'quota')::integer not between 1 and 2000 then raise exception 'Harga atau kuota di luar batas.' using errcode='22023';end if;
 if jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'Status kategori tidak valid.' using errcode='22023';end if;
 foreach field in array array['salesStart','salesEnd'] loop
  if (p_data->>field)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Waktu harus menyertakan zona waktu.' using errcode='22023';end if;
 end loop;
 v_start:=(p_data->>'salesStart')::timestamptz;v_end:=(p_data->>'salesEnd')::timestamptz;
 select starts_at into event_start from public.events where id=p_event;
 if not isfinite(v_start) or not isfinite(v_end) or v_start>=v_end or v_end>event_start then raise exception 'Periode jual harus berurutan dan berakhir paling lambat saat acara mulai.' using errcode='22023';end if;
 if jsonb_typeof(p_data->'sections') is distinct from 'array' then raise exception 'Pilih section kategori.' using errcode='22023';end if;
 if jsonb_array_length(p_data->'sections') not between 1 and 20 or exists(select 1 from jsonb_array_elements(p_data->'sections') x where jsonb_typeof(x)<>'string') then raise exception 'Section kategori tidak valid.' using errcode='22023';end if;
 select array_agg(value order by value) into names from jsonb_array_elements_text(p_data->'sections');
 if cardinality(names)<>(select count(distinct n) from unnest(names) n) or cardinality(names)<>(select count(distinct vs.name) from public.venue_sections vs join public.seats s on s.section_id=vs.id join public.event_seats es on es.seat_id=s.id where es.event_id=p_event and vs.name=any(names)) then raise exception 'Section tidak ditemukan atau duplikat.' using errcode='22023';end if;
 select count(*) into capacity from public.event_seats es join public.seats s on s.id=es.seat_id join public.venue_sections vs on vs.id=s.section_id where es.event_id=p_event and vs.name=any(names);
 if (p_data->>'quota')::integer>capacity then raise exception 'Kuota melebihi kapasitas section.' using errcode='22023';end if;
 select count(*) into occupied from public.booking_items i join public.bookings b on b.id=i.booking_id where b.category_id=p_category and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()));
 if (p_data->>'quota')::integer<occupied then raise exception 'Kuota kurang dari kursi terjual dan reservasi aktif.' using errcode='P0001',detail='QUOTA';end if;
 if occupied>0 then
  select array_agg(vs.name order by vs.name) into old_names from public.category_sections cs join public.venue_sections vs on vs.id=cs.section_id where cs.category_id=p_category;
  if names is distinct from old_names then raise exception 'Section kategori terkunci karena kursi sudah dipesan.' using errcode='P0001',detail='CATEGORY_LOCKED';end if;
 end if;
end;$$;
revoke all on function public.assert_category_input(uuid,jsonb,uuid) from public,anon,authenticated;

create function public.configure_event_layout(p_event uuid,p_version integer,p_layout jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;section jsonb;seat jsonb;category jsonb;field text;v_section_id uuid;cat_id uuid;width integer;height integer;total integer:=0;v_before jsonb;v_detail text;
begin
 select * into e from public.events where id=p_event for update;
 if auth.uid() is null or not found or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 if p_version is distinct from e.seating_version then return jsonb_build_object('error','VERSION_CONFLICT','message','Konfigurasi berubah. Muat ulang sebelum menyimpan.');end if;
 if e.status not in ('DRAFT','UNPUBLISHED') or exists(select 1 from public.bookings where event_id=p_event) then return jsonb_build_object('error','LAYOUT_LOCKED','message','Denah hanya dapat diganti pada draf atau event tersembunyi yang belum pernah memiliki booking.');end if;
 if jsonb_typeof(p_layout) is distinct from 'object' then raise exception 'Denah tidak valid.' using errcode='22023';end if;
 foreach field in array array['width','height'] loop
  if jsonb_typeof(p_layout->field) is distinct from 'number' or (p_layout->>field)!~'^[0-9]+$' then raise exception 'Ukuran denah harus bilangan bulat.' using errcode='22023';end if;
 end loop;
 width:=(p_layout->>'width')::integer;height:=(p_layout->>'height')::integer;
 if width not between 320 and 10000 or height not between 240 and 10000 then raise exception 'Ukuran denah tidak valid.' using errcode='22023';end if;
 if jsonb_typeof(p_layout->'sections') is distinct from 'array' or jsonb_typeof(p_layout->'categories') is distinct from 'array' then raise exception 'Lengkapi section dan kategori.' using errcode='22023';end if;
 if jsonb_array_length(p_layout->'sections') not between 1 and 20 or jsonb_array_length(p_layout->'categories') not between 1 and 30 then raise exception 'Maksimal 20 section dan 30 kategori.' using errcode='22023';end if;
 v_before:=public.seating_config_json(p_event);
 -- Any error below rolls the entire function back, including deletions.
 delete from public.category_sections where category_id in(select id from public.ticket_categories where event_id=p_event);
 delete from public.ticket_categories where event_id=p_event;
 delete from public.event_seats where event_id=p_event;
 delete from public.seats where section_id in(select id from public.venue_sections where event_id=p_event);
 delete from public.venue_sections where event_id=p_event;
 for section in select value from jsonb_array_elements(p_layout->'sections') loop
  if jsonb_typeof(section->'name') is distinct from 'string' or char_length(trim(section->>'name')) not between 1 and 80 or jsonb_typeof(section->'seats') is distinct from 'array' then raise exception 'Section tidak valid.' using errcode='22023';end if;
  if jsonb_array_length(section->'seats') not between 1 and 2000 then raise exception 'Section membutuhkan kursi.' using errcode='22023';end if;
  insert into public.venue_sections(venue_id,event_id,name) values(e.venue_id,p_event,trim(section->>'name')) returning id into v_section_id;
  for seat in select value from jsonb_array_elements(section->'seats') loop
   total:=total+1;if total>2000 then raise exception 'Maksimal 2000 kursi per event.' using errcode='22023';end if;
   if jsonb_typeof(seat->'row') is distinct from 'string' or char_length(trim(seat->>'row')) not between 1 and 12 then raise exception 'Label baris tidak valid.' using errcode='22023';end if;
   foreach field in array array['number','x','y'] loop
    if jsonb_typeof(seat->field) is distinct from 'number' or (seat->>field)!~'^[0-9]+$' then raise exception 'Nomor dan posisi kursi harus bilangan bulat.' using errcode='22023';end if;
   end loop;
   if (seat->>'number')::integer not between 1 and 9999 or (seat->>'x')::integer not between 44 and width-44 or (seat->>'y')::integer not between 110 and height-44 then raise exception 'Posisi atau nomor kursi di luar batas.' using errcode='22023';end if;
   insert into public.seats(section_id,row_label,number,x,y) values(v_section_id,trim(seat->>'row'),(seat->>'number')::integer,(seat->>'x')::integer,(seat->>'y')::integer) returning id into cat_id;
   insert into public.event_seats(event_id,seat_id) values(p_event,cat_id);
  end loop;
 end loop;
 if exists(select 1 from public.event_seats a join public.seats x on x.id=a.seat_id join public.event_seats b on b.event_id=a.event_id and b.seat_id>a.seat_id join public.seats y on y.id=b.seat_id where a.event_id=p_event and abs(x.x-y.x)<44 and abs(x.y-y.y)<44) then raise exception 'Posisi kursi saling bertumpuk.' using errcode='22023';end if;
 for category in select value from jsonb_array_elements(p_layout->'categories') loop
  perform public.assert_category_input(p_event,category);
  insert into public.ticket_categories(event_id,venue_id,name,price_idr,quota,sales_start,sales_end,is_active) values(p_event,e.venue_id,trim(category->>'name'),(category->>'price')::bigint,(category->>'quota')::integer,(category->>'salesStart')::timestamptz,(category->>'salesEnd')::timestamptz,(category->>'active')::boolean) returning id into cat_id;
  insert into public.category_sections(category_id,section_id,venue_id) select cat_id,vs.id,e.venue_id from public.venue_sections vs where vs.event_id=p_event and vs.name in(select jsonb_array_elements_text(category->'sections'));
 end loop;
 if not exists(select 1 from public.ticket_categories where event_id=p_event and is_active) then raise exception 'Sediakan kategori aktif.' using errcode='22023';end if;
 update public.events set seating_managed=true,seating_width=width,seating_height=height,seating_version=seating_version+1,updated_at=clock_timestamp() where id=p_event;
 insert into public.audit_logs(event_id,actor_id,action,before_data,after_data) values(p_event,auth.uid(),'layout.replace',v_before,public.seating_config_json(p_event));
 return public.seating_config_json(p_event);
exception when sqlstate '22023' or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or unique_violation then return jsonb_build_object('error','INPUT','message','Denah tidak valid. Periksa section, nomor kursi, posisi, kuota dan periode jual.');
end;$$;
revoke all on function public.configure_event_layout(uuid,integer,jsonb) from public,anon;
grant execute on function public.configure_event_layout(uuid,integer,jsonb) to authenticated;

create function public.configure_ticket_category(p_event uuid,p_category uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;v_category uuid:=p_category;v_before jsonb;v_detail text;
begin
 select * into e from public.events where id=p_event for update;
 if auth.uid() is null or not found or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 if e.status='ARCHIVED' then return jsonb_build_object('error','ARCHIVED','message','Event arsip tidak dapat diedit.');end if;
 if p_version is distinct from e.seating_version then return jsonb_build_object('error','VERSION_CONFLICT','message','Konfigurasi berubah. Muat ulang sebelum menyimpan.');end if;
 if p_category is not null and not exists(select 1 from public.ticket_categories where id=p_category and event_id=p_event) then return jsonb_build_object('error','NOT_FOUND','message','Kategori tidak ditemukan.');end if;
 if p_category is null and (select count(*) from public.ticket_categories where event_id=p_event)>=30 then return jsonb_build_object('error','INPUT','message','Maksimal 30 kategori per event.');end if;
 perform public.assert_category_input(p_event,p_data,p_category);
 if e.status='PUBLISHED' and not (p_data->>'active')::boolean and not exists(select 1 from public.ticket_categories where event_id=p_event and id is distinct from p_category and is_active) then return jsonb_build_object('error','LAST_CATEGORY','message','Sembunyikan event sebelum menonaktifkan kategori terakhir.');end if;
 v_before:=public.seating_config_json(p_event);
 if p_category is null then
  insert into public.ticket_categories(event_id,venue_id,name,price_idr,quota,sales_start,sales_end,is_active) values(p_event,e.venue_id,trim(p_data->>'name'),(p_data->>'price')::bigint,(p_data->>'quota')::integer,(p_data->>'salesStart')::timestamptz,(p_data->>'salesEnd')::timestamptz,(p_data->>'active')::boolean) returning id into v_category;
 else
  update public.ticket_categories set name=trim(p_data->>'name'),price_idr=(p_data->>'price')::bigint,quota=(p_data->>'quota')::integer,sales_start=(p_data->>'salesStart')::timestamptz,sales_end=(p_data->>'salesEnd')::timestamptz,is_active=(p_data->>'active')::boolean,updated_at=clock_timestamp() where id=p_category;
  delete from public.category_sections where category_id=p_category;
 end if;
 insert into public.category_sections(category_id,section_id,venue_id) select v_category,vs.id,e.venue_id from public.venue_sections vs where vs.venue_id=e.venue_id and vs.name in(select jsonb_array_elements_text(p_data->'sections')) and exists(select 1 from public.seats s join public.event_seats es on es.seat_id=s.id where s.section_id=vs.id and es.event_id=p_event);
 update public.events set seating_managed=true,seating_version=seating_version+1,updated_at=clock_timestamp() where id=p_event;
 update public.event_seats set revision=revision+1 where event_id=p_event;
 insert into public.audit_logs(event_id,actor_id,action,before_data,after_data) values(p_event,auth.uid(),'category.save',v_before,public.seating_config_json(p_event));
 return public.seating_config_json(p_event);
exception when sqlstate 'P0001' then get stacked diagnostics v_detail=pg_exception_detail;return jsonb_build_object('error',coalesce(nullif(v_detail,''),'CATEGORY_LOCKED'),'message',sqlerrm);
 when sqlstate '22023' or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or unique_violation then return jsonb_build_object('error','INPUT','message','Kategori tidak valid. Periksa nama, section, kuota dan periode jual.');
end;$$;
revoke all on function public.configure_ticket_category(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.configure_ticket_category(uuid,uuid,integer,jsonb) to authenticated;

create or replace function public.seat_inventory(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
 select * into e from public.events where slug=p_slug and (status='PUBLISHED' or public.has_event_access(id,'ORGANIZER'));
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 select jsonb_build_object('eventId',e.id,'slug',e.slug,'mode','supabase','serverNow',clock_timestamp(),'width',e.seating_width,'height',e.seating_height,'version',e.seating_version,
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price_idr,'quota',c.quota,'salesStart',c.sales_start,'salesEnd',c.sales_end,'remaining',greatest(0,c.quota-(select count(*) from public.booking_items i join public.bookings b on b.id=i.booking_id where b.category_id=c.id and (i.allocation_status='SOLD' or (i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp())))),'sections',coalesce((select jsonb_agg(s.name) from public.category_sections cs join public.venue_sections s on s.id=cs.section_id where cs.category_id=c.id),'[]'::jsonb)) order by c.price_idr desc) from public.ticket_categories c where c.event_id=e.id and c.is_active),'[]'::jsonb),
 'seats',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'section',vs.name,'row',s.row_label,'number',s.number,'x',s.x,'y',s.y+case when vs.event_id is null and vs.name='Regular' then 235 else 0 end,'status',case when exists(select 1 from public.booking_items i where i.event_id=e.id and i.seat_id=s.id and i.allocation_status='SOLD') then 'SOLD' when exists(select 1 from public.booking_items i join public.bookings b on b.id=i.booking_id where i.event_id=e.id and i.seat_id=s.id and i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()) then 'RESERVED' else 'AVAILABLE' end) order by vs.name,s.row_label,s.number) from public.event_seats es join public.seats s on s.id=es.seat_id join public.venue_sections vs on vs.id=s.section_id where es.event_id=e.id),'[]'::jsonb)) into result;
 return result;
end;$$;
create or replace function public.reserve_booking(p_slug text,p_category uuid,p_items jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
create or replace function public.get_booking(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('id',b.id,'reference',b.reference,'slug',e.slug,'eventTitle',e.title,'userId',b.user_id,'categoryId',b.category_id,'categoryName',b.category_name_snapshot,'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,'expiresAt',b.expires_at,'total',b.total_idr,'paymentStatus',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else (select p.status from public.payments p where p.booking_id=b.id) end,'items',(select jsonb_agg(jsonb_build_object('seatId',i.seat_id,'label',vs.name||' '||s.row_label||s.number,'name',a.display_name,'price',i.price_snapshot_idr) order by s.row_label,s.number) from public.booking_items i join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.attendees a on a.booking_item_id=i.id where i.booking_id=b.id)) into result
 from public.bookings b join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id where b.id=p_id and b.user_id=(select auth.uid());
 return coalesce(result,jsonb_build_object('error','NOT_FOUND','message','Reservasi tidak ditemukan.'));
end;$$;
create or replace function public.organizer_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.event_access where user_id=auth.uid() and role='ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 select jsonb_build_object('mode','supabase',
 'events',coalesce((select jsonb_agg(public.catalog_event_json(e.id) order by e.starts_at) from public.events e where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb),
 'inventory',coalesce((select jsonb_agg(public.seat_inventory(e.slug)) from public.events e where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'reference',b.reference,'slug',e.slug,'userId',b.user_id,'categoryId',b.category_id,'categoryName',b.category_name_snapshot,'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,'expiresAt',b.expires_at,'total',b.total_idr,'paymentStatus',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else p.status end,'items',coalesce((select jsonb_agg(jsonb_build_object('seatId',i.seat_id,'label',vs.name||' '||s.row_label||s.number,'name',a.display_name,'price',i.price_snapshot_idr)) from public.booking_items i join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.attendees a on a.booking_item_id=i.id where i.booking_id=b.id),'[]'::jsonb)) order by b.created_at desc) from public.bookings b join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id left join public.payments p on p.booking_id=b.id where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb)) into result;
 return result;
end;$$;
create or replace function public.issued_tickets_for_owner(p_user uuid,p_ticket uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'reference',t.reference,'bookingId',b.id,'userId',b.user_id,'slug',e.slug,'categoryName',b.category_name_snapshot,'seatId',i.seat_id,'seatLabel',vs.name||' '||s.row_label||s.number,'attendeeName',a.display_name,'price',i.price_snapshot_idr,'issuedAt',t.issued_at,'status',t.status,'event',t.event_snapshot,'checkedInAt',(select checked_in_at from public.check_ins ci where ci.ticket_id=t.id),'tokenHash',t.token_hash,'encryptedToken',ts.encrypted_token) order by t.issued_at desc,t.id),'[]'::jsonb)
 from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings b on b.id=i.booking_id join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id join public.attendees a on a.booking_item_id=i.id join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.ticket_secrets ts on ts.ticket_id=t.id
 where b.user_id=p_user and (p_ticket is null or t.id=p_ticket);
$$;

create or replace function public.catalog_event_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'id',e.id,'seatingVersion',e.seating_version,'customSeating',e.seating_managed,'slug',e.slug,'title',e.title,'description',e.description,'category',e.category,'status',e.status,
 'startsAt',e.starts_at,'endsAt',e.ends_at,
 'date',to_char(e.starts_at at time zone 'Asia/Jakarta','YYYY-MM-DD'),
 'time',to_char(e.starts_at at time zone 'Asia/Jakarta','HH24.MI')||' WIB',
 'headline',coalesce(nullif(e.headline,''),upper(e.title)),'theme',e.theme,
 'organizer',e.organizer_name,'area',coalesce(nullif(e.area,''),(select name from public.venues where id=e.venue_id)),'coverUrl',e.cover_url,
 'rules',coalesce(nullif(e.rules,''),'Satu tiket untuk satu peserta dan satu kursi.'),
 'price',coalesce((select min(price_idr) from public.ticket_categories where event_id=e.id and is_active),0),
 'frontPrice',coalesce((select price_idr from public.ticket_categories where event_id=e.id and name='Front'),0),
 'frontQuota',coalesce((select quota from public.ticket_categories where event_id=e.id and name='Front'),24),
 'regularQuota',coalesce((select quota from public.ticket_categories where event_id=e.id and name='Regular'),24),
 'salesStart',coalesce((select min(sales_start) from public.ticket_categories where event_id=e.id),e.starts_at-interval '1 day'),
 'salesEnd',coalesce((select max(sales_end) from public.ticket_categories where event_id=e.id),e.starts_at))
 from public.events e where e.id=p_id;
$$;
revoke all on function public.catalog_event_json(uuid) from public,anon,authenticated;




create or replace function public.manage_event(p_action text,p_id uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if p_action='update' and not e.seating_managed and ((select count(*) from public.ticket_categories where event_id=v_id)<>2 or not exists(select 1 from public.ticket_categories where event_id=v_id and name='Front') or not exists(select 1 from public.ticket_categories where event_id=v_id and name='Regular')) then return jsonb_build_object('error','LAYOUT','message','Layout event belum didukung editor ini.');end if;
  if p_action='update' and (v_start<>e.starts_at or v_end<>e.ends_at or v_area<>e.area) and exists(select 1 from public.bookings where event_id=v_id and (status='CONFIRMED' or (status='PENDING_PAYMENT' and expires_at>clock_timestamp()))) then return jsonb_build_object('error','EVENT_LOCKED','message','Jadwal dan lokasi terkunci karena ada tiket terjual atau reservasi aktif.');end if;
  if p_action='create' or not e.seating_managed then
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
  if p_action='update' and e.seating_managed and exists(select 1 from public.ticket_categories where event_id=v_id and sales_end>v_start) then return jsonb_build_object('error','INPUT','message','Perbarui periode jual kategori sebelum memajukan jadwal acara.');end if;
  if p_action='create' then
   insert into public.events(id,venue_id,slug,title,description,rules,category,starts_at,ends_at,organizer_name,area,theme,headline)
   values(v_id,v_venue,coalesce(nullif(trim(both '-' from left(regexp_replace(lower(v_title),'[^a-z0-9]+','-','g'),65)),''),'event')||'-'||replace(v_id::text,'-',''),v_title,v_description,v_rules,v_category,v_start,v_end,v_organizer,v_area,v_theme,upper(v_title));
   insert into public.event_access(event_id,user_id,role) values(v_id,auth.uid(),'ORGANIZER');
   insert into public.ticket_categories(event_id,venue_id,name,price_idr,quota,sales_start,sales_end) values(v_id,v_venue,'Regular',v_regular_price,v_regular_quota,v_sale_start,v_sale_end),(v_id,v_venue,'Front',v_front_price,v_front_quota,v_sale_start,v_sale_end);
   insert into public.category_sections(category_id,section_id,venue_id) select c.id,vs.id,v_venue from public.ticket_categories c join public.venue_sections vs on vs.event_id is null and vs.venue_id=v_venue and vs.name=c.name where c.event_id=v_id;
   insert into public.event_seats(event_id,seat_id) select v_id,s.id from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.event_id is null and vs.venue_id=v_venue and vs.name in ('Front','Regular');
  else
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
commit;
