create schema if not exists labour_payments;

create table public.labour_payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity unique,
  requested_date date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  cashbook_entry_id uuid unique references cash_book.entry(id)
);
create unique index labour_payment_one_draft on public.labour_payment_requests(created_by)
  where submitted_at is null;

create table public.labour_payment_lines (
  source_type text not null check (source_type in ('App', 'Access')),
  source_id bigint not null,
  request_id uuid references public.labour_payment_requests(id),
  refer_historical boolean not null default false,
  snapshot jsonb,
  primary key (source_type, source_id),
  check ((refer_historical and request_id is null and snapshot is null)
    or (not refer_historical and request_id is not null and snapshot is not null))
);
create index labour_payment_lines_request_idx on public.labour_payment_lines(request_id);

alter table public.labour_payment_requests enable row level security;
alter table public.labour_payment_lines enable row level security;
revoke all on public.labour_payment_requests, public.labour_payment_lines from public, anon, authenticated;

-- Share the lock across both entry points, including the existing Cashbook screen.
create function labour_payments.lock_source(p_type text, p_id bigint)
returns void language sql set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('labour-payment:' || p_type || ':' || p_id, 0));
$$;

create function labour_payments.guard_cashbook_source()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active then
    perform labour_payments.lock_source(new.source_type, new.source_id::bigint);
    if exists (
      select 1 from public.labour_payment_lines l
      left join public.labour_payment_requests r on r.id = l.request_id
      where l.source_type = new.source_type and l.source_id = new.source_id::bigint
        and r.cashbook_entry_id is distinct from new.entry_id
    ) then
      raise exception 'This Labour line is reserved on a payment request or marked Refer Historical.';
    end if;
  end if;
  return new;
end;
$$;
create trigger labour_request_cashbook_guard before insert or update of active
  on cash_book.labour_payment_source for each row execute function labour_payments.guard_cashbook_source();

create function labour_payments.guard_request_source()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform labour_payments.lock_source(new.source_type, new.source_id);
  if exists (select 1 from cash_book.labour_payment_source p where p.active
    and p.source_type = new.source_type and p.source_id = new.source_id::text) then
    raise exception 'This Labour line is already reserved or paid in Cashbook.';
  end if;
  if new.refer_historical and not exists (select 1 from public.labour_v2_report_rows l
    where l.source_type = new.source_type and l.source_id = new.source_id) then
    raise exception 'No reportable Labour line matches the historical source.';
  end if;
  return new;
end;
$$;
create trigger labour_request_source_guard before insert or update
  on public.labour_payment_lines for each row execute function labour_payments.guard_request_source();

create view labour_payments.report_rows as
select l.source_type, l.source_id::text as source_id, l.labour_date, l.labour_week,
  l.tracecode_name, l.activity_name, l.labour_qty, l.kgs, l.unit_cost,
  round(l.total_cost, 2) as total_cost, l.farm_name, l.crop_name, s.season_name,
  case when l.report_farm = 'AgriOrange' then 'AO' else 'JS' end as company
from public.labour_v2_report_rows l
join public.tracecode t on t.tracecode_id = l.tracecode_id
left join public.season s on s.season_id = t.season_id;

create function public.labour_payment_read(p_mode text, p_period text default null, p_week boolean default false, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  actor uuid := auth.uid();
  roles text[] := coalesce(public.my_farm_app_roles(), array[]::text[]);
begin
  if actor is null or not (roles && array['admin','manager','labour']) then
    raise exception 'Labour access required' using errcode = '42501';
  end if;
  if p_mode = 'admin' then
    if not ('admin' = any(roles)) then
      raise exception 'Admin access required' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'requests', coalesce((
        select jsonb_agg(to_jsonb(r) || jsonb_build_object('lines', (
          select jsonb_agg(l.snapshot order by l.snapshot->>'labour_date', l.source_id)
          from public.labour_payment_lines l where l.request_id = r.id
        )) order by r.request_number)
        from public.labour_payment_requests r left join cash_book.entry e on e.id = r.cashbook_entry_id
        where r.submitted_at is not null and (e.status is null or e.status = 'voided')
      ), '[]'::jsonb),
      'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'label', a.name || ' · ' || a.currency) order by a.name)
        from cash_book.account a where a.active and a.currency = 'USD'), '[]'::jsonb));
  end if;
  if p_mode = 'draft' then
    return (
      select to_jsonb(r) || jsonb_build_object('lines', coalesce((
        select jsonb_agg(l.snapshot order by l.snapshot->>'labour_date', l.source_id)
        from public.labour_payment_lines l where l.request_id = r.id
      ), '[]'::jsonb))
      from public.labour_payment_requests r where r.created_by = actor and r.submitted_at is null
    );
  end if;
  if p_mode is null or p_mode not in ('request', 'history') then
    raise exception 'Invalid Labour payment report.';
  end if;

  with matches as (
    select l.*, case when coalesce(pl.refer_historical, false) then 'Refer Historical' else e.reference end as payment_reference,
      e.entry_date as payment_date
    from labour_payments.report_rows l
    left join public.labour_payment_lines pl on pl.source_type = l.source_type and pl.source_id = l.source_id::bigint
    left join cash_book.labour_payment_source cp on cp.active and cp.source_type = l.source_type and cp.source_id = l.source_id
    left join cash_book.entry e on e.id = cp.entry_id and e.status = 'confirmed'
    where (
      (p_mode = 'request' and pl.source_id is null and cp.source_id is null and l.total_cost > 0 and l.unit_cost is not null)
      or (p_mode = 'history' and (pl.refer_historical or e.id is not null))
    ) and (p_period is null or case when p_week then l.labour_week = p_period else l.labour_date = p_period::date end)
    and (p_filters = '{}'::jsonb or to_jsonb(l) @> p_filters)
  )
  select case when p_period is null and p_filters = '{}'::jsonb then jsonb_build_object(
    'days', coalesce(jsonb_agg(distinct labour_date), '[]'::jsonb),
    'weeks', coalesce(jsonb_agg(distinct labour_week), '[]'::jsonb),
    'historyOptions', case when p_mode = 'history' then jsonb_build_object(
      'season_name', jsonb_agg(distinct season_name), 'farm_name', jsonb_agg(distinct farm_name),
      'crop_name', jsonb_agg(distinct crop_name), 'tracecode_name', jsonb_agg(distinct tracecode_name),
      'company', jsonb_agg(distinct company), 'activity_name', jsonb_agg(distinct activity_name)
    ) end
  ) else jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(matches)
    order by labour_date desc, tracecode_name, activity_name, source_type, source_id), '[]'::jsonb)) end
  into result from matches;
  return result;
end;
$$;

create function public.labour_payment_change(
  p_action text, p_date date default null, p_sources jsonb default '[]',
  p_request uuid default null, p_account uuid default null, p_payee text default null, p_reference text default null
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  roles text[] := coalesce(public.my_farm_app_roles(), array[]::text[]);
  request public.labour_payment_requests%rowtype;
  source record;
  source_snapshot jsonb;
  entry_id uuid;
  total numeric;
  last_work_date date;
begin
  if actor is null or not (roles && array['admin','manager','labour']) then
    raise exception 'Labour access required' using errcode = '42501';
  end if;
  if p_action = 'cashbook' then
    if not ('admin' = any(roles)) then
      raise exception 'Admin access required' using errcode = '42501';
    end if;
    select * into request from public.labour_payment_requests r
      where r.id = p_request and r.submitted_at is not null for update;
    if not found then raise exception 'The request is unavailable.'; end if;
    if request.cashbook_entry_id is not null and exists (
      select 1 from cash_book.entry e where e.id = request.cashbook_entry_id and e.status <> 'voided'
    ) then return request.request_number; end if;
    select sum((snapshot->>'total_cost')::numeric), max((snapshot->>'labour_date')::date)
      into total, last_work_date from public.labour_payment_lines where request_id = request.id;
    if p_date is null or p_date < last_work_date or length(btrim(coalesce(p_reference,''))) not between 1 and 120
       or length(btrim(coalesce(p_payee,''))) not between 1 and 120 then
      raise exception 'Enter a payment date on or after the last work day, a reference and a payee.';
    end if;
    entry_id := gen_random_uuid();
    insert into cash_book.entry(id, kind, currency, account_id, amount, entry_date, value_date, reference, narrative, counterparty, created_by)
      select entry_id, 'payment', a.currency, a.id, total, p_date, p_date, btrim(p_reference),
        'Labour payment request ' || request.request_number, btrim(p_payee), actor
      from cash_book.account a where a.id = p_account and a.active and a.currency = 'USD' and a.opening_date <= p_date;
    if not found then raise exception 'Choose an active USD Cashbook account.'; end if;
    update public.labour_payment_requests set cashbook_entry_id = entry_id where id = request.id;
    insert into cash_book.labour_payment_source(entry_id, source_type, source_id, amount)
      select entry_id, l.source_type, l.source_id::text, (l.snapshot->>'total_cost')::numeric
      from public.labour_payment_lines l where l.request_id = request.id order by l.source_type, l.source_id;
    return request.request_number;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('labour-draft:' || actor, 0));
  select * into request from public.labour_payment_requests r
    where r.created_by = actor and r.submitted_at is null for update;
  if p_action = 'add' then
    if p_date is null or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) = 0 then
      raise exception 'Enter a requested payment date and select Labour lines.';
    end if;
    if request.id is null then
      insert into public.labour_payment_requests(requested_date, created_by) values (p_date, actor) returning * into request;
    end if;
    for source in select distinct s.source_type, s.source_id
      from jsonb_to_recordset(p_sources) as s(source_type text, source_id bigint)
      order by s.source_type, s.source_id
    loop
      if exists (select 1 from public.labour_payment_lines l where l.source_type = source.source_type
        and l.source_id = source.source_id and l.request_id = request.id) then continue; end if;
      select to_jsonb(l) into strict source_snapshot from labour_payments.report_rows l
        where l.source_type = source.source_type and l.source_id::bigint = source.source_id
          and l.total_cost > 0 and l.unit_cost is not null;
      insert into public.labour_payment_lines(source_type, source_id, request_id, snapshot)
        values (source.source_type, source.source_id, request.id, source_snapshot);
    end loop;
    update public.labour_payment_requests set requested_date = p_date where id = request.id;
  elsif p_action = 'remove' then
    if request.id is distinct from p_request or request.id is null then raise exception 'The draft is unavailable.'; end if;
    delete from public.labour_payment_lines l using jsonb_to_recordset(p_sources) s(source_type text, source_id bigint)
    where l.request_id = request.id and l.source_type = s.source_type and l.source_id = s.source_id;
  elsif p_action = 'submit' then
    if request.id is distinct from p_request or request.id is null or p_date is null or not exists (
      select 1 from public.labour_payment_lines where request_id = request.id
    ) then raise exception 'Enter a payment date and add Labour lines before sending.'; end if;
    if exists (select 1 from public.labour_payment_lines l
      left join labour_payments.report_rows r on r.source_type = l.source_type and r.source_id = l.source_id::text
      where l.request_id = request.id and (to_jsonb(r) is distinct from l.snapshot or r.labour_date > p_date)
    ) then raise exception 'A Labour line changed or the payment date precedes the work. Review the draft before sending.'; end if;
    update public.labour_payment_requests set requested_date = p_date, submitted_at = now() where id = request.id;
  else
    raise exception 'Invalid Labour payment action.';
  end if;
  return request.request_number;
exception
  when unique_violation then raise exception 'A Labour line or payment reference is already in use. Refresh and review.';
  when no_data_found or too_many_rows then raise exception 'A selected Labour line changed or is unavailable. Refresh and review.';
end;
$$;

revoke all on schema labour_payments from public, anon, authenticated;
revoke all on function public.labour_payment_read(text, text, boolean, jsonb) from public, anon;
revoke all on function public.labour_payment_change(text, date, jsonb, uuid, uuid, text, text) from public, anon;
grant execute on function public.labour_payment_read(text, text, boolean, jsonb) to authenticated;
grant execute on function public.labour_payment_change(text, date, jsonb, uuid, uuid, text, text) to authenticated;
