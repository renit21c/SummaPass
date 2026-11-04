begin;
create table public.check_ins(
 ticket_id uuid primary key references public.tickets(id) on delete restrict,
 event_id uuid not null references public.events(id) on delete restrict,
 staff_id uuid not null references public.profiles(id) on delete restrict,
 checked_in_at timestamptz not null default clock_timestamp()
);
create index check_ins_event_time on public.check_ins(event_id,checked_in_at);
alter table public.check_ins enable row level security;
revoke all on public.check_ins from public,anon,authenticated;
grant select on public.check_ins to authenticated;
create policy check_in_scope on public.check_ins for select to authenticated using(public.has_event_access(event_id,'STAFF') or public.has_event_access(event_id,'ORGANIZER') or exists(select 1 from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings b on b.id=i.booking_id where t.id=ticket_id and b.user_id=(select auth.uid())));
create function public.staff_events() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('slug',e.slug,'title',e.title) order by e.starts_at),'[]'::jsonb) from public.events e where public.has_event_access(e.id,'STAFF');
$$;
create function public.validate_check_in(p_slug text,p_reference text,p_hash text,p_confirm boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event uuid;t public.tickets;i public.booking_items;b public.bookings;v_checked timestamptz;v_view jsonb;
begin
 select id into v_event from public.events where slug=p_slug;
 if auth.uid() is null or v_event is null or not public.has_event_access(v_event,'STAFF') then return jsonb_build_object('error','FORBIDDEN');end if;
 if (p_reference is null)=(p_hash is null) or (p_reference is not null and p_reference !~ '^SPT-[A-F0-9]{32}$') or (p_hash is not null and p_hash !~ '^[a-f0-9]{64}$') then return jsonb_build_object('status','INVALID');end if;
 -- Same lock ordering as reservation/payment mutations: event before ticket.
 if p_confirm then perform 1 from public.events where id=v_event for update;end if;
 select * into t from public.tickets where (p_reference is not null and reference=p_reference) or (p_hash is not null and token_hash=p_hash);
 if not found then return jsonb_build_object('status','INVALID');end if;
 select * into i from public.booking_items where id=t.booking_item_id;
 if i.event_id<>v_event then return jsonb_build_object('status','WRONG_EVENT');end if;
 select * into t from public.tickets where id=t.id for update;
 if t.status<>'ACTIVE' then return jsonb_build_object('status','CANCELLED_OR_REFUNDED');end if;
 select * into b from public.bookings where id=i.booking_id;
 if b.status<>'CONFIRMED' or i.allocation_status<>'SOLD' or not exists(select 1 from public.payments where booking_id=b.id and status='PAID' and amount_idr=b.total_idr) then return jsonb_build_object('status','UNPAID');end if;
 select checked_in_at into v_checked from public.check_ins where ticket_id=t.id;
 select jsonb_build_object('id',t.id,'reference',t.reference,'attendeeName',a.display_name,'seatLabel',vs.name||' '||s.row_label||s.number,'categoryName',c.name) into v_view from public.attendees a join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.ticket_categories c on c.id=b.category_id where a.booking_item_id=i.id;
 if v_checked is not null then return jsonb_build_object('status','ALREADY_USED','ticket',v_view||jsonb_build_object('checkedInAt',v_checked));end if;
 if p_confirm then
  insert into public.check_ins(ticket_id,event_id,staff_id) values(t.id,v_event,auth.uid()) on conflict(ticket_id) do nothing returning checked_in_at into v_checked;
  if v_checked is null then select checked_in_at into v_checked from public.check_ins where ticket_id=t.id;return jsonb_build_object('status','ALREADY_USED','ticket',v_view||jsonb_build_object('checkedInAt',v_checked));end if;
  return jsonb_build_object('status','CHECKED_IN','ticket',v_view||jsonb_build_object('checkedInAt',v_checked));
 end if;
 return jsonb_build_object('status','VALID','ticket',v_view);
end;$$;
revoke all on function public.staff_events(),public.validate_check_in(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.staff_events(),public.validate_check_in(text,text,text,boolean) to authenticated;
create or replace function public.issued_tickets_for_owner(p_user uuid,p_ticket uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'reference',t.reference,'bookingId',b.id,'userId',b.user_id,'slug',e.slug,'categoryName',c.name,'seatId',i.seat_id,'seatLabel',vs.name||' '||s.row_label||s.number,'attendeeName',a.display_name,'price',i.price_snapshot_idr,'issuedAt',t.issued_at,'status',t.status,'checkedInAt',(select checked_in_at from public.check_ins ci where ci.ticket_id=t.id),'tokenHash',t.token_hash,'encryptedToken',ts.encrypted_token) order by t.issued_at desc,t.id),'[]'::jsonb)
 from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings b on b.id=i.booking_id join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id join public.attendees a on a.booking_item_id=i.id join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.ticket_secrets ts on ts.ticket_id=t.id
 where b.user_id=p_user and (p_ticket is null or t.id=p_ticket);
$$;
commit;
