begin;
create table public.event_promos(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 100),type text not null check(type in ('AUTOMATIC','VOUCHER')),
 code text,discount_type text not null check(discount_type in ('PERCENT','NOMINAL')),
 discount_value bigint not null check(discount_value>0 and discount_value<=10000000),
 scope text not null check(scope in ('ALL','CATEGORY')),category_id uuid references public.ticket_categories(id) on delete restrict,
 starts_at timestamptz not null,ends_at timestamptz not null,quota integer check(quota>0),min_quantity integer check(min_quantity between 1 and 30),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),deleted_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at),
 check(discount_type<>'PERCENT' or discount_value<=100),
 check((scope='ALL' and category_id is null) or (scope='CATEGORY' and category_id is not null)),
 check((type='AUTOMATIC' and code is null) or (type='VOUCHER' and code is not null and code ~ '^[A-Z0-9_-]{1,30}$'))
);
create unique index event_promo_code on public.event_promos(event_id,upper(code)) where code is not null and deleted_at is null;
create index event_promos_event on public.event_promos(event_id,status);
alter table public.event_promos enable row level security;
revoke all on public.event_promos from public,anon,authenticated;
grant select on public.event_promos to authenticated;
grant select on public.event_promos to service_role;
create policy organizer_promos on public.event_promos for select to authenticated using(public.active_account_uid() is not null and public.has_event_access(event_id,'ORGANIZER'));

alter table public.bookings add column promo_id uuid references public.event_promos(id) on delete set null,
 add column original_total_idr bigint,add column discount_amount_idr bigint not null default 0 check(discount_amount_idr>=0),
 add column promo_name_snapshot text,add column voucher_code_snapshot text,add column promo_request jsonb;
create index booking_promo_usage on public.bookings(promo_id,status,expires_at);

create function public.promo_usage(p_id uuid) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.bookings where promo_id=p_id and (status='CONFIRMED' or (status='PENDING_PAYMENT' and expires_at>now()));
$$;
revoke all on function public.promo_usage(uuid) from public,anon,authenticated,service_role;
create function public.promo_json(p public.event_promos) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'eventId',p.event_id,'name',p.name,'type',p.type,'code',p.code,
 'discountType',p.discount_type,'discountValue',p.discount_value,'scope',p.scope,'categoryId',p.category_id,
 'categoryName',(select name from public.ticket_categories where id=p.category_id),'startDate',p.starts_at,'endDate',p.ends_at,
 'quota',p.quota,'usedCount',public.promo_usage(p.id),'minQuantity',p.min_quantity,'status',p.status,'createdAt',p.created_at);
$$;
revoke all on function public.promo_json(public.event_promos) from public,anon,authenticated,service_role;

create function public.organizer_promos(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.active_account_uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk.');end if;
 if not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Tidak memiliki akses event.');end if;
 return coalesce((select jsonb_agg(public.promo_json(p) order by p.created_at desc) from public.event_promos p where event_id=p_event and deleted_at is null),'[]'::jsonb);
end;$$;
revoke all on function public.organizer_promos(uuid) from public,anon;
grant execute on function public.organizer_promos(uuid) to authenticated;

create function public.manage_event_promo(p_event uuid,p_action text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;p public.event_promos;v_before jsonb;v_category uuid;v_id uuid;
begin
 if public.active_account_uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk.');end if;
 select * into e from public.events where id=p_event for update;
 if not found or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Tidak memiliki akses event.');end if;
 if e.status='ARCHIVED' or e.cancelled_at is not null then return jsonb_build_object('error','CLOSED','message','Event ini tidak dapat diubah.');end if;
 if p_action not in ('create','update','delete','status') then raise exception 'INPUT' using errcode='22023';end if;
 if p_action<>'create' then
  select * into p from public.event_promos where id=p_id and event_id=p_event and deleted_at is null;
  if not found then return jsonb_build_object('error','NOT_FOUND','message','Promo tidak ditemukan.');end if;
  v_before:=public.promo_json(p);
 end if;
 if p_action='delete' then update public.event_promos set deleted_at=clock_timestamp(),status='INACTIVE',updated_at=clock_timestamp() where id=p.id;v_id:=p.id;
 elsif p_action='status' then
  if coalesce(p_data->>'status','') not in ('ACTIVE','INACTIVE') then raise exception 'INPUT' using errcode='22023';end if;
  update public.event_promos set status=p_data->>'status',updated_at=clock_timestamp() where id=p.id;v_id:=p.id;
 else
  v_category:=case when p_data->>'scope'='CATEGORY' then (p_data->>'categoryId')::uuid else null end;
  if p_data->>'scope'='CATEGORY' and not exists(select 1 from public.ticket_categories where id=v_category and event_id=p_event) then raise exception 'CATEGORY' using errcode='22023';end if;
  if jsonb_typeof(p_data->'discountValue') is distinct from 'number' or (p_data->>'discountValue')!~'^[0-9]+$' then raise exception 'INPUT' using errcode='22023';end if;
  if p_data->>'quota' is not null and (jsonb_typeof(p_data->'quota')<>'number' or (p_data->>'quota')!~'^[0-9]+$') then raise exception 'INPUT' using errcode='22023';end if;
  if p_data->>'minQuantity' is not null and (jsonb_typeof(p_data->'minQuantity')<>'number' or (p_data->>'minQuantity')!~'^[0-9]+$') then raise exception 'INPUT' using errcode='22023';end if;
  if p_action='create' then
   insert into public.event_promos(event_id,name,type,code,discount_type,discount_value,scope,category_id,starts_at,ends_at,quota,min_quantity,status)
   values(p_event,trim(p_data->>'name'),p_data->>'type',case when p_data->>'type'='VOUCHER' then upper(trim(p_data->>'code')) end,p_data->>'discountType',(p_data->>'discountValue')::bigint,p_data->>'scope',v_category,(p_data->>'startDate')::timestamptz,(p_data->>'endDate')::timestamptz,(p_data->>'quota')::integer,(p_data->>'minQuantity')::integer,coalesce(p_data->>'status','ACTIVE')) returning id into v_id;
  else
   if (p_data->>'quota')::integer<public.promo_usage(p.id) then return jsonb_build_object('error','QUOTA','message','Kuota kurang dari pesanan aktif dan terkonfirmasi.');end if;
   update public.event_promos set name=trim(p_data->>'name'),type=p_data->>'type',code=case when p_data->>'type'='VOUCHER' then upper(trim(p_data->>'code')) end,discount_type=p_data->>'discountType',discount_value=(p_data->>'discountValue')::bigint,scope=p_data->>'scope',category_id=v_category,starts_at=(p_data->>'startDate')::timestamptz,ends_at=(p_data->>'endDate')::timestamptz,quota=(p_data->>'quota')::integer,min_quantity=(p_data->>'minQuantity')::integer,status=p_data->>'status',updated_at=clock_timestamp() where id=p.id;v_id:=p.id;
  end if;
 end if;
 select * into p from public.event_promos where id=v_id;
 insert into public.audit_logs(event_id,actor_id,action,before_data,after_data) values(p_event,public.active_account_uid(),'promo.'||p_action,v_before,public.promo_json(p));
 return public.promo_json(p);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation or datetime_field_overflow or invalid_datetime_format or sqlstate '22023' then
 return jsonb_build_object('error','INPUT','message','Periksa nama, kode unik, kategori, potongan, kuota, dan tanggal promo.');
end;$$;
revoke all on function public.manage_event_promo(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.manage_event_promo(uuid,text,uuid,jsonb) to authenticated;

-- Public discovery never lists voucher codes. Only the exact code supplied can be quoted.
create function public.public_event_promos(p_slug text,p_code text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(public.promo_json(p) order by p.id),'[]'::jsonb) from public.event_promos p join public.events e on e.id=p.event_id
 where e.slug=p_slug and e.status='PUBLISHED' and e.cancelled_at is null and e.starts_at>now() and p.deleted_at is null and p.status='ACTIVE' and now()>=p.starts_at and now()<p.ends_at
 and (p.quota is null or public.promo_usage(p.id)<p.quota) and (p.type='AUTOMATIC' or (nullif(trim(p_code),'') is not null and p.code=upper(trim(p_code))));
$$;
revoke all on function public.public_event_promos(text,text) from public;
grant execute on function public.public_event_promos(text,text) to anon,authenticated;

alter function public.get_booking(uuid) rename to get_booking_v23;
create function public.get_booking(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.get_booking_v23(p_id);if result ? 'error' then return result;end if;
 return result||(select jsonb_build_object('originalTotal',coalesce(original_total_idr,total_idr),'discountAmount',discount_amount_idr,'promoName',promo_name_snapshot,'voucherCode',voucher_code_snapshot) from public.bookings where id=p_id);
end;$$;
revoke all on function public.get_booking_v23(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_booking(uuid) from public,anon;
grant execute on function public.get_booking(uuid) to authenticated;

create function public.reserve_with_promo(p_slug text,p_category uuid,p_package uuid,p_quantity integer,p_items jsonb,p_key uuid,p_voucher text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;b public.bookings;p public.event_promos;best public.event_promos;result jsonb;req jsonb;v_total bigint;v_discount bigint:=0;v_saving bigint;v_count integer;v_code text;v_valid_code boolean:=false;v_id uuid;v_item record;
begin
 if public.active_account_uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk.');end if;
 select * into e from public.events where slug=p_slug for update;
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 if p_key is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then return jsonb_build_object('error','INPUT','message','Pilihan tiket tidak valid.');end if;
 v_code:=nullif(upper(trim(p_voucher)),'');
 if char_length(v_code)>30 then return jsonb_build_object('error','INPUT','message','Kode voucher maksimal 30 karakter.');end if;
 req:=jsonb_build_object('category',p_category,'package',p_package,'quantity',p_quantity,'items',p_items,'voucher',v_code);
 select * into b from public.bookings where user_id=public.active_account_uid() and idempotency_key=p_key;
 if found then
  if b.event_id<>e.id or b.promo_request is distinct from req then return jsonb_build_object('error','KEY_REUSED','message','Permintaan berubah. Gunakan permintaan baru.');end if;
  return public.get_booking(b.id);
 end if;
 v_count:=jsonb_array_length(p_items);
 if p_package is not null then select price_idr*p_quantity into v_total from public.ticket_packages where id=p_package and category_id=p_category;
 else select price_idr*v_count into v_total from public.ticket_categories where id=p_category and event_id=e.id;end if;
 if v_total is null then return jsonb_build_object('error','CATEGORY','message','Pilihan tiket tidak ditemukan.');end if;
 for p in select * from public.event_promos where event_id=e.id and deleted_at is null and status='ACTIVE' and clock_timestamp()>=starts_at and clock_timestamp()<ends_at
  and (scope='ALL' or category_id=p_category) and (min_quantity is null or min_quantity<=v_count) and (quota is null or public.promo_usage(id)<quota)
  and (type='AUTOMATIC' or code=v_code) order by type,id loop
  if p.type='VOUCHER' then v_valid_code:=true;end if;
  v_saving:=least(v_total,case when p.discount_type='PERCENT' then round(v_total::numeric*p.discount_value/100)::bigint else p.discount_value end);
  if v_saving>v_discount then best:=p;v_discount:=v_saving;end if;
 end loop;
 if v_code is not null and not v_valid_code then return jsonb_build_object('error','VOUCHER','message','Voucher tidak tersedia, habis, atau syaratnya belum terpenuhi.');end if;
 if p_package is not null then result:=public.reserve_ticket_package(p_slug,p_category,p_package,p_quantity,p_items,p_key);
 elsif e.seating_mode='GENERAL_ADMISSION' then result:=public.reserve_general_admission(p_slug,p_category,p_items,p_key);
 else result:=public.reserve_booking(p_slug,p_category,p_items,p_key);end if;
 if result ? 'error' then return result;end if;
 v_id:=(result->>'id')::uuid;
 select * into b from public.bookings where id=v_id;
 -- The base reservation always recomputes the package/category price before this snapshot.
 if b.total_idr<>v_total then raise exception 'Price changed' using errcode='40001';end if;
 update public.bookings set original_total_idr=v_total,total_idr=v_total-v_discount,discount_amount_idr=v_discount,promo_id=best.id,promo_name_snapshot=best.name,voucher_code_snapshot=case when best.type='VOUCHER' then best.code end,promo_request=req where id=v_id;
 if v_discount>0 then
  for v_item in select id,row_number() over(order by id) n from public.booking_items where booking_id=v_id loop
   update public.booking_items set price_snapshot_idr=(v_total-v_discount)/v_count+case when v_item.n<=(v_total-v_discount)%v_count then 1 else 0 end where id=v_item.id;
  end loop;
 end if;
 return public.get_booking(v_id);
end;$$;
revoke all on function public.reserve_with_promo(text,uuid,uuid,integer,jsonb,uuid,text) from public,anon;
grant execute on function public.reserve_with_promo(text,uuid,uuid,integer,jsonb,uuid,text) to authenticated;

-- Dashboard uses its own projection instead of get_booking.
alter function public.organizer_snapshot() rename to organizer_snapshot_v23;
create function public.organizer_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.organizer_snapshot_v23();if result ? 'error' then return result;end if;
 return result||jsonb_build_object('bookings',coalesce((select jsonb_agg(x||jsonb_build_object('originalTotal',coalesce(b.original_total_idr,b.total_idr),'discountAmount',b.discount_amount_idr,'promoName',b.promo_name_snapshot,'voucherCode',b.voucher_code_snapshot) order by n) from jsonb_array_elements(result->'bookings') with ordinality a(x,n) join public.bookings b on b.id=(x->>'id')::uuid),'[]'::jsonb));
end;$$;
revoke all on function public.organizer_snapshot_v23() from public,anon,authenticated,service_role;
revoke all on function public.organizer_snapshot() from public,anon;
grant execute on function public.organizer_snapshot() to authenticated;
-- One public query supplies truthful starting prices for all discovery cards.
create function public.catalog_promo_prices(p_slugs text[]) returns jsonb language sql stable security definer set search_path='' as $$
 with offers as (
  select e.slug,e.id event_id,c.id category_id,p.price_idr,p.participants
  from public.events e join public.ticket_categories c on c.event_id=e.id join public.ticket_packages p on p.category_id=c.id
  where e.slug=any(p_slugs) and e.status='PUBLISHED' and e.cancelled_at is null and e.starts_at>now() and c.is_active and p.is_active
 ),prices as (
  select o.*,o.price_idr-coalesce((select max(least(o.price_idr,case when q.discount_type='PERCENT' then round(o.price_idr::numeric*q.discount_value/100)::bigint else q.discount_value end))
   from public.event_promos q where q.event_id=o.event_id and q.type='AUTOMATIC' and q.status='ACTIVE' and q.deleted_at is null and now()>=q.starts_at and now()<q.ends_at
   and (q.scope='ALL' or q.category_id=o.category_id) and (q.min_quantity is null or q.min_quantity<=o.participants) and (q.quota is null or public.promo_usage(q.id)<q.quota)),0) final_price from offers o
 ),lowest as (select distinct on(slug) slug,price_idr,final_price from prices order by slug,final_price,price_idr)
 select coalesce(jsonb_agg(jsonb_build_object('slug',slug,'price',final_price,'originalPrice',price_idr)),'[]'::jsonb) from lowest;
$$;
revoke all on function public.catalog_promo_prices(text[]) from public;
grant execute on function public.catalog_promo_prices(text[]) to anon,authenticated;
commit;
