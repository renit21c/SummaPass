-- Server-only counters shared by all application instances. No raw IP/email.
create table public.request_limit_buckets (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  hits integer not null check (hits > 0),
  reset_at timestamptz not null
);
create index request_limit_expiry on public.request_limit_buckets(reset_at);
alter table public.request_limit_buckets enable row level security;
revoke all on public.request_limit_buckets from public, anon, authenticated, service_role;
grant select on public.request_limit_buckets to service_role;

create function public.consume_request_limit(p_key text, p_limit integer, p_window integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare limit_now timestamptz := clock_timestamp(); bucket public.request_limit_buckets;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 10000
    or p_window is null or p_window not between 1 and 86400 then
    raise exception 'Invalid rate limit configuration' using errcode = '22023';
  end if;
  -- Bounded housekeeping, indexed by expiry. Retain expired counters for one hour.
  delete from public.request_limit_buckets where key_hash in (
    select key_hash from public.request_limit_buckets where reset_at < limit_now - interval '1 hour'
    order by reset_at limit 100
  );
  insert into public.request_limit_buckets as existing(key_hash, hits, reset_at)
  values(p_key, 1, limit_now + make_interval(secs => p_window))
  on conflict(key_hash) do update set
    hits = case when existing.reset_at <= limit_now then 1 else least(existing.hits + 1, p_limit + 1) end,
    reset_at = case when existing.reset_at <= limit_now then limit_now + make_interval(secs => p_window) else existing.reset_at end
  returning * into bucket;
  return jsonb_build_object('allowed', bucket.hits <= p_limit,
    'remaining', greatest(0, p_limit - bucket.hits),
    'retryAfter', case when bucket.hits <= p_limit then 0 else greatest(1, ceil(extract(epoch from bucket.reset_at - limit_now))::integer) end);
end;
$$;
revoke all on function public.consume_request_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request_limit(text, integer, integer) to service_role;
