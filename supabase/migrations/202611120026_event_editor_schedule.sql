begin;

-- Extend the existing atomic editor RPC, preserving its ownership checks,
-- cancellation guards, inventory locks, audit log and event-change trigger.
do $$
declare definition text; previous text;
begin
 definition:=pg_get_functiondef('public.manage_event_v12(text,uuid,jsonb)'::regprocedure);
 if position('v_sales_changed boolean' in definition)>0 then return;end if;
 previous:=definition;
 definition:=replace(definition,
  'v_field text;v_section text;',
  'v_sales_changed boolean:=false;v_field text;v_section text;');
 definition:=replace(definition,
  'v_sale_start:=(p_data->>''salesStart'')::timestamptz;v_sale_end:=(p_data->>''salesEnd'')::timestamptz;',
  $patch$v_sale_start:=(p_data->>'salesStart')::timestamptz;v_sale_end:=(p_data->>'salesEnd')::timestamptz;
  if p_action='update' then
   select v_sale_start is distinct from min(sales_start) or v_sale_end is distinct from max(sales_end)
   into v_sales_changed from public.ticket_categories where event_id=v_id;
  end if;$patch$);
 -- Existing bookings keep their seats, prices and ticket snapshots. Location
 -- changes remain locked, while a schedule change uses the notification trigger.
 definition:=replace(definition,
  '(v_start<>e.starts_at or v_end<>e.ends_at or v_area<>e.area)',
  '(v_area<>e.area)');
 definition:=replace(definition,
  'Jadwal dan lokasi terkunci karena ada tiket terjual atau reservasi aktif.',
  'Lokasi terkunci karena ada tiket terjual atau reservasi aktif.');
 definition:=replace(definition,
  'if p_action=''update'' and (e.seating_managed or e.ticketing_managed) and exists',
  'if p_action=''update'' and not v_sales_changed and (e.seating_managed or e.ticketing_managed) and exists');
 definition:=replace(definition,
  'if not e.seating_managed and not e.ticketing_managed then',
  $patch$if (e.seating_managed or e.ticketing_managed) and v_sales_changed then
    update public.ticket_categories set sales_start=v_sale_start,sales_end=v_sale_end,updated_at=clock_timestamp() where event_id=v_id;
    update public.events set seating_version=seating_version+1 where id=v_id;
   end if;
   if not e.seating_managed and not e.ticketing_managed then$patch$);
 if definition=previous or position('v_sales_changed boolean' in definition)=0
   or position('(v_start<>e.starts_at or v_end<>e.ends_at or v_area<>e.area)' in definition)>0
   or position('and not v_sales_changed and' in definition)=0
   or position('and v_sales_changed then' in definition)=0 then
  raise exception 'Unexpected manage_event_v12 definition. Apply migrations 001-025 first.';
 end if;
 execute definition;
end;$$;

revoke all on function public.manage_event_v12(text,uuid,jsonb) from public,anon,authenticated,service_role;
commit;
