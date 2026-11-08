begin;
alter table public.attendees add column email text not null default '',
 add column notes text not null default '', add column revision integer not null default 0;

create function public.organizer_attendees(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then
  return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',a.id,'revision',a.revision,'name',a.display_name,'email',a.email,'notes',a.notes,
  'bookingId',b.id,'reference',b.reference,'createdAt',b.created_at,
  'category',b.category_name_snapshot,'seat',vs.name||' '||s.row_label||s.number,
  'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,
  'paymentStatus',p.status,'checkedInAt',ci.checked_in_at,'ticketReference',t.reference)
  order by b.created_at desc,a.id)
 from public.attendees a join public.booking_items i on i.id=a.booking_item_id
 join public.bookings b on b.id=i.booking_id join public.payments p on p.booking_id=b.id
 join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id
 left join public.tickets t on t.booking_item_id=i.id left join public.check_ins ci on ci.ticket_id=t.id
 where b.event_id=p_event),'[]'::jsonb);
end;$$;

create function public.update_event_attendees(p_event uuid,p_rows jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;r jsonb;old public.attendees;bk public.bookings;v_ids uuid[]:='{}';v_changes jsonb:='[]';
begin
 select * into e from public.events where id=p_event for update;
 if auth.uid() is null or not found or not public.has_event_access(p_event,'ORGANIZER') then
  return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');
 end if;
 if e.status='ARCHIVED' or e.cancelled_at is not null then return jsonb_build_object('error','EVENT_LOCKED','message','Event arsip atau dibatalkan tidak dapat diubah.');end if;
 if p_reason is null or length(trim(p_reason)) not between 5 and 500 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Isi alasan 5 sampai 500 karakter dan data peserta.' using errcode='22023';end if;
 if jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Pilih 1 sampai 500 peserta.' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p_rows) order by value->>'id' loop
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'name') is distinct from 'string'
   or jsonb_typeof(r->'email') is distinct from 'string' or jsonb_typeof(r->'notes') is distinct from 'string'
   or jsonb_typeof(r->'revision') is distinct from 'number' or (r->>'revision')!~'^[0-9]+$'
   or coalesce(length(trim(r->>'name')),0) not between 1 and 100 or length(r->>'email')>254
   or ((r->>'email')<>'' and (r->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
   or length(r->>'notes')>500 then raise exception 'Data peserta tidak valid.' using errcode='22023';end if;
  select a.* into old from public.attendees a join public.booking_items i on i.id=a.booking_item_id
   where a.id=(r->>'id')::uuid and i.event_id=p_event for update of a;
  if not found or old.id=any(v_ids) then raise exception 'Peserta tidak ditemukan atau duplikat.' using errcode='22023';end if;
  if old.revision<>(r->>'revision')::integer then raise exception 'Data peserta berubah. Muat ulang sebelum menyimpan.' using errcode='40001';end if;
  select b.* into bk from public.bookings b join public.booking_items i on i.booking_id=b.id where i.id=old.booking_item_id;
  if bk.status<>'CONFIRMED' or not exists(select 1 from public.payments where booking_id=bk.id and status='PAID')
   or exists(select 1 from public.tickets t join public.check_ins ci on ci.ticket_id=t.id where t.booking_item_id=old.booking_item_id)
   then raise exception 'Hanya peserta lunas yang belum check-in dapat diubah.' using errcode='22023';end if;
  v_ids:=array_append(v_ids,old.id);
  update public.attendees set display_name=trim(r->>'name'),email=trim(r->>'email'),notes=trim(r->>'notes'),revision=revision+1 where id=old.id;
  v_changes:=v_changes||jsonb_build_array(jsonb_build_object('id',old.id,'beforeRevision',old.revision,'afterRevision',old.revision+1));
 end loop;
 insert into public.audit_logs(event_id,actor_id,action,after_data)
 values(p_event,auth.uid(),'attendees.update',jsonb_build_object('reason',trim(p_reason),'changes',v_changes));
 return jsonb_build_object('updated',cardinality(v_ids));
exception when sqlstate '40001' then return jsonb_build_object('error','VERSION_CONFLICT','message',sqlerrm);
 when sqlstate '22023' or invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','INPUT','message','Periksa ID, versi, data peserta, dan status check-in. Seluruh impor dibatalkan jika ada baris tidak valid.');
end;$$;

create function public.duplicate_organizer_event(p_event uuid,p_key uuid,p_start timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;v_id uuid;v_layout jsonb;v_result jsonb;v_delta interval;v_old jsonb;
begin
 select * into e from public.events where id=p_event for update;
 if auth.uid() is null or not found or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 if p_key is null or p_start is null or not isfinite(p_start) or p_start<=clock_timestamp() then return jsonb_build_object('error','INPUT','message','Pilih jadwal salinan di masa depan.');end if;
 select after_data into v_old from public.audit_logs where event_id=p_event and action='event.duplicate' and after_data->>'key'=p_key::text;
 if found then
  if v_old->>'startsAt'<>p_start::text then return jsonb_build_object('error','KEY_REUSED','message','Permintaan duplikasi berubah.');end if;
  return public.catalog_event_json((v_old->>'eventId')::uuid);
 end if;
 v_id:=gen_random_uuid();v_delta:=p_start-e.starts_at;
 insert into public.events(id,venue_id,slug,title,description,rules,category,starts_at,ends_at,organizer_name,area,theme,headline)
 values(v_id,e.venue_id,'event-'||replace(v_id::text,'-',''),left(e.title,110)||' (salinan)',e.description,e.rules,e.category,p_start,e.ends_at+v_delta,e.organizer_name,e.area,e.theme,e.headline);
 insert into public.event_access(event_id,user_id,role) values(v_id,auth.uid(),'ORGANIZER');
 v_layout:=public.seating_config_json(p_event);
 select jsonb_set(v_layout,'{categories}',coalesce(jsonb_agg(c||jsonb_build_object(
  'salesStart',((c->>'salesStart')::timestamptz+v_delta),
  'salesEnd',((c->>'salesEnd')::timestamptz+v_delta))),'[]')) into v_layout
 from jsonb_array_elements(v_layout->'categories') c;
 v_result:=public.configure_event_layout(v_id,0,v_layout);
 if v_result?'error' then raise exception 'Konfigurasi sumber tidak dapat disalin.' using errcode='22023';end if;
 insert into public.audit_logs(event_id,actor_id,action,after_data)
 values(p_event,auth.uid(),'event.duplicate',jsonb_build_object('key',p_key,'eventId',v_id,'startsAt',p_start::text));
 return public.catalog_event_json(v_id);
exception when sqlstate '22023' or invalid_text_representation or datetime_field_overflow then
 return jsonb_build_object('error','INPUT','message','Duplikasi gagal. Periksa jadwal dan konfigurasi sumber.');
end;$$;

create function public.organizer_announcements(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 return coalesce((select jsonb_agg(x) from (
  select id,after_data->>'title' as title,after_data->>'message' as message,
   (after_data->>'recipients')::integer as recipients,created_at as "createdAt"
  from public.audit_logs where event_id=p_event and action='announcement.send' order by created_at desc limit 50
 ) x),'[]');
end;$$;

create function public.send_event_announcement(p_event uuid,p_key uuid,p_title text,p_message text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;v_old jsonb;r record;v_count integer:=0;
begin
 select * into e from public.events where id=p_event for update;
 if auth.uid() is null or not found or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Event tidak ditugaskan.');end if;
 if p_key is null or p_title is null or p_message is null or length(trim(p_title)) not between 3 and 120 or length(trim(p_message)) not between 10 and 2000 then return jsonb_build_object('error','INPUT','message','Judul 3–120 dan isi 10–2000 karakter.');end if;
 select after_data into v_old from public.audit_logs where event_id=p_event and action='announcement.send' and after_data->>'key'=p_key::text;
 if found then
  if v_old->>'title'<>trim(p_title) or v_old->>'message'<>trim(p_message) then return jsonb_build_object('error','KEY_REUSED','message','Permintaan berubah.');end if;
  return jsonb_build_object('recipients',v_old->'recipients','duplicate',true);
 end if;
 if e.cancelled_at is not null or e.status='ARCHIVED' then return jsonb_build_object('error','EVENT_LOCKED','message','Acara dibatalkan atau diarsipkan.');end if;
 if exists(select 1 from public.audit_logs where event_id=p_event and action='announcement.send' and created_at>clock_timestamp()-interval '1 minute')
  or (select count(*) from public.audit_logs where event_id=p_event and action='announcement.send' and created_at>clock_timestamp()-interval '1 day')>=10
 then return jsonb_build_object('error','RATE_LIMIT','message','Tunggu satu menit. Maksimal 10 pengumuman per acara per hari.');end if;
 for r in select distinct on(b.user_id) b.id,b.user_id from public.bookings b join public.payments p on p.booking_id=b.id
  where b.event_id=p_event and b.status='CONFIRMED' and p.status='PAID'
  and exists(select 1 from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.booking_id=b.id and t.status='ACTIVE')
  order by b.user_id,b.created_at,b.id loop
  perform public.enqueue_notification(r.user_id,p_event,r.id,'EVENT_CHANGED','announcement/'||p_key||'/'||r.user_id,
   trim(p_title),trim(p_message),'/my-tickets',true);
  v_count:=v_count+1;
 end loop;
 insert into public.audit_logs(event_id,actor_id,action,after_data)
 values(p_event,auth.uid(),'announcement.send',jsonb_build_object('key',p_key,'title',trim(p_title),'message',trim(p_message),'recipients',v_count));
 return jsonb_build_object('recipients',v_count,'duplicate',false);
end;$$;

create function public.organizer_booking_period(p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.event_access where user_id=auth.uid() and role='ORGANIZER')
 then return jsonb_build_object('error','FORBIDDEN','message','Akses organizer diperlukan.');end if;
 if p_from>p_to then return jsonb_build_object('error','INPUT','message','Rentang tanggal tidak valid.');end if;
 return coalesce((select jsonb_agg(b.id) from public.bookings b where public.has_event_access(b.event_id,'ORGANIZER')
  and (p_from is null or (b.created_at at time zone 'Asia/Jakarta')::date>=p_from)
  and (p_to is null or (b.created_at at time zone 'Asia/Jakarta')::date<=p_to)),'[]');
end;$$;

revoke all on function public.organizer_booking_period(date,date) from public,anon;
grant execute on function public.organizer_booking_period(date,date) to authenticated;
revoke all on function public.organizer_attendees(uuid),public.update_event_attendees(uuid,jsonb,text),
 public.duplicate_organizer_event(uuid,uuid,timestamptz),public.organizer_announcements(uuid),
 public.send_event_announcement(uuid,uuid,text,text) from public,anon;
grant execute on function public.organizer_attendees(uuid),public.update_event_attendees(uuid,jsonb,text),
 public.duplicate_organizer_event(uuid,uuid,timestamptz),public.organizer_announcements(uuid),
 public.send_event_announcement(uuid,uuid,text,text) to authenticated;
commit;
