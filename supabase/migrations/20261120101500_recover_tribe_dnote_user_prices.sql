-- Restore user-supplied historical pricing for TRIBE's D-Notes 06/18 and 06/19.
-- User explicitly supplied prices on 20 November 2026. Both originals were
-- rejected by the old zero-size validator; do not misstate this as the original
-- prices having been recovered from the rejected save.
-- The D-Notes, quantities, dates and customer remain unchanged.
-- Only the existing NORMAL stock pool is used (no pre-sales existed).
-- Guard all expected quantities, dates and values. Failure rolls back everything.

alter table public.potato_market_sale alter column created_by drop not null;
-- A null actor means SYSTEM DATA RECOVERY, not a human admin save.
create table if not exists public.potato_market_price_recovery_audit(
 recovery_id bigint generated always as identity primary key,
 sale_id uuid not null unique references public.potato_market_sale(sale_id),
 dnote_number text not null,
 source text not null,
 supplied_on date not null,
 prices_by_size jsonb not null,
 expected_value numeric(14,2) not null,
 recorded_at timestamptz not null default now()
);
alter table public.potato_market_price_recovery_audit enable row level security;
revoke all on public.potato_market_price_recovery_audit from anon,authenticated;

do $restore$
declare
  ticket record;
  size_line record;
  batch record;
  remaining integer;
  take_qty integer;
  sale_key uuid;
  unit_price numeric;
  actual_value numeric;
  expected_value numeric;
begin
 perform pg_catalog.pg_advisory_xact_lock(742219,1);
 if exists(select 1 from public.potato_presale) then
   raise exception 'Historical recovery requires confirming presale classification before proceeding';
 end if;
 if (select count(*) from public.wb_potato_dispatch where status='issued'
   and dnote_number in ('06/18','06/19'))<>2 then
   raise exception 'Expected two issued D-Notes 06/18 and 06/19';
 end if;
 if exists(select 1 from public.potato_market_sale s
   join public.wb_potato_dispatch d using(dispatch_id)
   where d.dnote_number in ('06/18','06/19'))
 or exists(select 1 from public.potato_stock_allocation a
   join public.wb_potato_dispatch d using(dispatch_id)
   where d.dnote_number in ('06/18','06/19'))
 then raise exception 'D-Notes have already been priced/allocated. No duplicate recovery.'; end if;
 for ticket in
  select d.dispatch_id,d.dnote_number,d.season_id,w.customer_id,
   (coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date sale_date
  from public.wb_potato_dispatch d
  join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id
  where d.dnote_number in ('06/18','06/19') and d.status='issued'
  order by coalesce(w.first_at,w.local_created_at),d.dispatch_id
 loop
  if ticket.customer_id<>12 or ticket.season_id<>17 then
    raise exception 'D-Note % no longer matches TRIBE / potato season 17',ticket.dnote_number;
  end if;
  expected_value:=case ticket.dnote_number when '06/18' then 2645.00 when '06/19' then 3150.00 end;
  if (select coalesce(sum(pockets),0) from public.wb_potato_dispatch_line
      where dispatch_id=ticket.dispatch_id)<>1200 then
    raise exception 'D-Note % pockets no longer match 1200',ticket.dnote_number;
  end if;
  insert into public.potato_market_sale(dispatch_id,sale_date,created_by)
    values(ticket.dispatch_id,ticket.sale_date,null) returning sale_id into sale_key;
  for size_line in select size_code,pockets
    from public.wb_potato_dispatch_line
    where dispatch_id=ticket.dispatch_id and pockets>0
    order by size_code
  loop
   unit_price:=case size_line.size_code
    when 'LARGE' then 4.00 when 'MEDIUM' then 3.50
    when 'SMEDIUM' then 2.50 when 'SMALL' then 2.00
    when 'CHATS' then 1.00 else null end;
   if unit_price is null then raise exception 'Missing supplied price for %',size_line.size_code; end if;
   remaining:=size_line.pockets;
   for batch in select g.grading_id,g.tracecode_id,g.normal_available
     from public.potato_grade_pool_v g
     where g.season_id=ticket.season_id
      and g.size_code=size_line.size_code
      and g.grading_date<=ticket.sale_date and g.normal_available>0
     order by g.grading_date,g.grading_id
   loop
     exit when remaining=0;
     take_qty:=least(remaining,batch.normal_available);
     insert into public.potato_stock_allocation(grading_id,size_code,kind,pockets,dispatch_id,reason)
      values(batch.grading_id,size_line.size_code,'normal_dispatch',take_qty,ticket.dispatch_id,
       'Historical TRIBE D-Note: user-provided pricing recovery 20/11/2026');
     remaining:=remaining-take_qty;
   end loop;
   if remaining<>0 then raise exception 'Insufficient historical % graded stock for D-Note %, short by %',
      size_line.size_code,ticket.dnote_number,remaining; end if;
   insert into public.potato_market_sale_line(sale_id,size_code,pockets,price_per_pocket)
    values(sale_key,size_line.size_code,size_line.pockets,unit_price);
  end loop;
  insert into public.potato_market_field_allocation(sale_id,tracecode_id,size_code,pockets)
    select sale_key,g.tracecode_id,a.size_code,sum(a.pockets)::int
    from public.potato_stock_allocation a
    join public.wb_potato_grading_batch g on g.grading_id=a.grading_id
    where a.dispatch_id=ticket.dispatch_id and a.kind='normal_dispatch'
    group by g.tracecode_id,a.size_code;
  select sum(l.pockets*l.price_per_pocket) into actual_value
   from public.potato_market_sale_line l where l.sale_id=sale_key;
  if actual_value is distinct from expected_value then
   raise exception 'D-Note % expected %, recorded %',ticket.dnote_number,expected_value,actual_value;
  end if;
  insert into public.potato_market_price_recovery_audit
   (sale_id,dnote_number,source,supplied_on,prices_by_size,expected_value)
  values(sale_key,ticket.dnote_number,
   'Prices supplied by the user in ChatGPT on 20/11/2026; original app save failed. System backfill, not an original saved sale.',
   '2026-11-20','{"LARGE":4,"MEDIUM":3.5,"SMEDIUM":2.5,"SMALL":2,"CHATS":1}'::jsonb,
    expected_value);
 end loop;
 if exists(select 1 from public.potato_grade_pool_v where normal_available<0 or reserved_available<0) then
  raise exception 'Backfill would create negative stock pool';
 end if;
 if (select count(*) from public.potato_market_price_recovery_audit
     where dnote_number in ('06/18','06/19'))<>2 then
  raise exception 'Missing audit provenance for historical sales';
 end if;
end $restore$;
