begin;

create function public.delete_draft_event(p_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype;
begin
  select * into e from public.events where id = p_event for update;
  if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.'); end if;
  if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then
    return jsonb_build_object('error','FORBIDDEN','message','Akses organizer diperlukan.');
  end if;
  if e.status <> 'DRAFT' or exists(select 1 from public.bookings where event_id = p_event)
    or exists(select 1 from public.staff_invitations where event_id = p_event) then
    return jsonb_build_object('error','HAS_HISTORY','message','Hanya draf tanpa pesanan dan undangan petugas yang dapat dihapus.');
  end if;

  delete from public.category_sections where category_id in (select id from public.ticket_categories where event_id = p_event);
  delete from public.ticket_categories where event_id = p_event;
  delete from public.event_seats where event_id = p_event;
  delete from public.seats where section_id in (select id from public.venue_sections where event_id = p_event);
  delete from public.venue_sections where event_id = p_event;
  delete from public.audit_logs where event_id = p_event;
  delete from public.event_access where event_id = p_event;
  delete from public.events where id = p_event;
  return jsonb_build_object('deleted',true,'id',p_event);
end; $$;

revoke all on function public.delete_draft_event(uuid) from public, anon;
grant execute on function public.delete_draft_event(uuid) to authenticated;

commit;
