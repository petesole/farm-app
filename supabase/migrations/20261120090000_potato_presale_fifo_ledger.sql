-- Potato graded-stock allocation. Do not apply before end-to-end integration tests.
-- WB computer remains unchanged: dispatch allocation happens in the Potato module.
create table if not exists public.potato_presale (
  presale_id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  contract_date date not null,
  customer_id bigint not null references public.wb_customer(customer_id),
  tracecode_id bigint not null references public.tracecode(tracecode_id),
  season_id bigint not null references public.season(season_id),
  status text not null default 'active' check(status in ('active','closed','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.potato_presale_line (
  presale_id uuid not null references public.potato_presale(presale_id),
  size_code text not null references public.wb_potato_size(size_code),
  contracted_pockets integer not null check(contracted_pockets>0),
  price_per_pocket numeric(14,2) not null check(price_per_pocket>0),
  primary key(presale_id,size_code)
);
-- Append-only allocation ledger. Grades are authoritative supply; transactions below
-- classify that supply without editing historic grading or weighbridge records.
create table if not exists public.potato_stock_allocation (
  allocation_id bigint generated always as identity primary key,
  grading_id uuid not null references public.wb_potato_grading_batch(grading_id),
  size_code text not null references public.wb_potato_size(size_code),
  kind text not null check(kind in ('reserve','divert','normal_dispatch','presale_dispatch')),
  pockets integer not null check(pockets>0),
  presale_id uuid references public.potato_presale(presale_id),
  dispatch_id uuid references public.wb_potato_dispatch(dispatch_id),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (
    (kind='reserve' and presale_id is not null and dispatch_id is null) or
    (kind='divert' and presale_id is not null and dispatch_id is not null and nullif(btrim(reason),'') is not null) or
    (kind='presale_dispatch' and presale_id is not null and dispatch_id is not null) or
    (kind='normal_dispatch' and presale_id is null and dispatch_id is not null)
  )
);
alter table public.potato_presale enable row level security;
alter table public.potato_presale_line enable row level security;
alter table public.potato_stock_allocation enable row level security;
revoke all on public.potato_presale,public.potato_presale_line,public.potato_stock_allocation from anon,authenticated;
create index if not exists potato_stock_allocation_grading_idx
  on public.potato_stock_allocation(grading_id,size_code);
create index if not exists potato_stock_allocation_contract_idx
  on public.potato_stock_allocation(presale_id,size_code);
create index if not exists potato_stock_allocation_dispatch_idx
  on public.potato_stock_allocation(dispatch_id);
create unique index if not exists potato_presale_reference_key
  on public.potato_presale(lower(btrim(reference)));

-- Each pocket belongs to exactly one pool. Sold presales are counted at contract
-- price when reserved. Collections do not create another sale.
create or replace view public.potato_grade_pool_v with (security_invoker=true) as
select b.grading_id,b.grading_date,b.season_id,b.tracecode_id,
 l.size_code,l.pockets as graded_pockets,
 l.pockets
  - coalesce(sum(case when a.kind='reserve' then a.pockets when a.kind='divert' then -a.pockets
                      when a.kind='normal_dispatch' then a.pockets else 0 end),0) as normal_available,
 coalesce(sum(case when a.kind='reserve' then a.pockets when a.kind='divert' then -a.pockets
                   when a.kind='presale_dispatch' then -a.pockets else 0 end),0) as reserved_available
from public.wb_potato_grading_batch b
join public.wb_potato_grading_line l using(grading_id)
left join public.potato_stock_allocation a
 on a.grading_id=l.grading_id and a.size_code=l.size_code
where b.status='posted'
group by b.grading_id,b.grading_date,b.season_id,b.tracecode_id,l.size_code,l.pockets;

create or replace view public.potato_presale_position_v with (security_invoker=true) as
select c.presale_id,c.reference,c.contract_date,c.customer_id,c.tracecode_id,c.season_id,
 l.size_code,l.contracted_pockets,l.price_per_pocket,
 coalesce(sum(case when a.kind='reserve' then a.pockets when a.kind='divert' then -a.pockets else 0 end),0) as allocated_to_contract,
 coalesce(sum(case when a.kind='presale_dispatch' then a.pockets else 0 end),0) as collected_pockets,
 l.contracted_pockets - coalesce(sum(case when a.kind='reserve' then a.pockets when a.kind='divert' then -a.pockets else 0 end),0) as awaiting_grading,
 (coalesce(sum(case when a.kind='reserve' then a.pockets when a.kind='divert' then -a.pockets else 0 end),0)
  - coalesce(sum(case when a.kind='presale_dispatch' then a.pockets else 0 end),0)) as reserved_in_storage,
 (coalesce(sum(case when a.kind='reserve' then a.pockets when a.kind='divert' then -a.pockets else 0 end),0)*l.price_per_pocket) as sales_value
from public.potato_presale c
join public.potato_presale_line l using(presale_id)
left join public.potato_stock_allocation a
 on a.presale_id=c.presale_id and a.size_code=l.size_code
group by c.presale_id,c.reference,c.contract_date,c.customer_id,c.tracecode_id,
 c.season_id,l.size_code,l.contracted_pockets,l.price_per_pocket;

create or replace function public.potato_reserve_newly_available(p_presale_id uuid)
returns void language plpgsql security definer set search_path=''
as $fn$
declare c public.potato_presale; ln record; g record; needed integer; take_qty integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(742219,1);
  -- Never reserve stock while an issued D-Note remains physically dispatched but
  -- not yet attributed. Allocate pending dispatches first to prevent double issue.
  if exists(
    select 1 from public.wb_potato_dispatch d
     where d.status='issued'
       and not exists(select 1 from public.potato_stock_allocation a where a.dispatch_id=d.dispatch_id)
  ) then return; end if;
  select * into c from public.potato_presale where presale_id=p_presale_id and status='active' for update;
  if not found then raise exception 'Active pre-sale not found'; end if;
  for ln in select * from public.potato_presale_position_v where presale_id=p_presale_id loop
    needed:=ln.awaiting_grading;
    for g in select * from public.potato_grade_pool_v
      where tracecode_id=c.tracecode_id and season_id=c.season_id
        and size_code=ln.size_code and normal_available>0
      order by grading_date,grading_id
    loop
      exit when needed<=0;
      take_qty:=least(needed,g.normal_available);
      insert into public.potato_stock_allocation(grading_id,size_code,kind,pockets,presale_id)
        values(g.grading_id,ln.size_code,'reserve',take_qty,p_presale_id);
      needed:=needed-take_qty;
    end loop;
  end loop;
end $fn$;

-- A grading-line insert supplies stock to pre-sales from that specific field first.
-- Database-level transaction locks keep simultaneous grades/reservations serialized.
create or replace function public.potato_grading_reservation_trigger()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare c record; needed integer; available integer; take_qty integer;
begin
  -- An already-dispatched D-Note must be classified before stock can be reserved.
  if exists(
    select 1 from public.wb_potato_dispatch d where d.status='issued'
    and not exists(select 1 from public.potato_stock_allocation a where a.dispatch_id=d.dispatch_id)
  ) then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(742219,1);
  -- Reserve ONLY the incoming grading batch. Do not silently relabel old normal
  -- stock as pre-sale stock when replenishing a diverted contract requirement.
  for c in select s.presale_id,s.contract_date,s.created_at
    from public.potato_presale s
    join public.potato_presale_line l using(presale_id)
    join public.wb_potato_grading_batch b on b.grading_id=new.grading_id
    where s.tracecode_id=b.tracecode_id and s.season_id=b.season_id
      and b.status='posted' and s.status='active' and l.size_code=new.size_code
    order by s.contract_date,s.created_at,s.presale_id
  loop
    select greatest(awaiting_grading,0) into needed
     from public.potato_presale_position_v
     where presale_id=c.presale_id and size_code=new.size_code;
    select greatest(normal_available,0) into available
     from public.potato_grade_pool_v
     where grading_id=new.grading_id and size_code=new.size_code;
    take_qty:=least(coalesce(needed,0),coalesce(available,0));
    if take_qty>0 then
      insert into public.potato_stock_allocation(grading_id,size_code,kind,pockets,presale_id)
      values(new.grading_id,new.size_code,'reserve',take_qty,c.presale_id);
    end if;
  end loop;
  return new;
end $fn$;
drop trigger if exists potato_grading_reserve on public.wb_potato_grading_line;
create trigger potato_grading_reserve after insert on public.wb_potato_grading_line
for each row execute function public.potato_grading_reservation_trigger();

create or replace function public.potato_allocate_outgoing(
 p_dispatch_id uuid,p_source text,p_presale_id uuid default null,p_diversion_reason text default null)
returns void language plpgsql security definer set search_path=''
as $fn$
declare d public.wb_potato_dispatch; line record; grade record;
        remaining_qty integer; take_qty integer; available_qty integer; contract_line record;
begin
  if not potato_market_private.is_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(742219,1);
  select * into d from public.wb_potato_dispatch
   where dispatch_id=p_dispatch_id and status='issued' for update;
  if not found then raise exception 'Issued D-Note not found'; end if;
  if p_source not in ('normal','presale','divert') then raise exception 'Choose normal stock, pre-sale collection or authorised diversion'; end if;
  if exists(select 1 from public.potato_stock_allocation where dispatch_id=p_dispatch_id)
  then raise exception 'D-Note already allocated; use an audited correction'; end if;
  -- Chronological allocation preserves FIFO. Newer D-Notes cannot consume stock
  -- while an earlier physical dispatch is still awaiting classification.
  if exists (
    select 1 from public.wb_potato_dispatch older
    join public.wb_scale_transaction ow on ow.transaction_id=older.wb_transaction_id
    join public.wb_scale_transaction cw on cw.transaction_id=d.wb_transaction_id
    where older.status='issued' and older.season_id=d.season_id
      and older.dispatch_id<>d.dispatch_id
      and not exists(select 1 from public.potato_stock_allocation oa
                     where oa.dispatch_id=older.dispatch_id)
      and (coalesce(ow.first_at,ow.local_created_at),older.created_at,older.dispatch_id)
          < (coalesce(cw.first_at,cw.local_created_at),d.created_at,d.dispatch_id)
  ) then raise exception 'Allocate the earlier unclassified D-Note first'; end if;
  if p_source in ('presale','divert') and
    not exists(select 1 from public.potato_presale s
     where s.presale_id=p_presale_id and s.season_id=d.season_id and s.status='active')
  then raise exception 'Active pre-sale required'; end if;
  for line in select size_code,pockets from public.wb_potato_dispatch_line
               where dispatch_id=p_dispatch_id and pockets>0 loop
    remaining_qty:=line.pockets;
    if p_source='normal' then
      for grade in select * from public.potato_grade_pool_v where season_id=d.season_id
        and size_code=line.size_code and normal_available>0 order by grading_date,grading_id loop
        exit when remaining_qty=0;
        take_qty:=least(grade.normal_available,remaining_qty);
        insert into public.potato_stock_allocation(grading_id,size_code,kind,pockets,dispatch_id)
        values(grade.grading_id,line.size_code,'normal_dispatch',take_qty,p_dispatch_id);
        remaining_qty:=remaining_qty-take_qty;
      end loop;
    else
      select * into contract_line from public.potato_presale_line
       where presale_id=p_presale_id and size_code=line.size_code;
      if not found then raise exception 'Size % is not in the selected pre-sale',line.size_code; end if;
      for grade in select g.*,coalesce(sum(case when a.kind='reserve' and a.presale_id=p_presale_id then a.pockets
        when a.kind in ('divert','presale_dispatch') and a.presale_id=p_presale_id then -a.pockets else 0 end),0) as contract_available
        from public.potato_grade_pool_v g
        left join public.potato_stock_allocation a on a.grading_id=g.grading_id and a.size_code=g.size_code
        where g.season_id=d.season_id and g.tracecode_id=(select tracecode_id from public.potato_presale where presale_id=p_presale_id)
         and g.size_code=line.size_code
        group by g.grading_id,g.grading_date,g.season_id,g.tracecode_id,g.size_code,g.graded_pockets,g.normal_available,g.reserved_available
        having coalesce(sum(case when a.kind='reserve' and a.presale_id=p_presale_id then a.pockets
          when a.kind in ('divert','presale_dispatch') and a.presale_id=p_presale_id then -a.pockets else 0 end),0)>0
        order by g.grading_date,g.grading_id loop
        exit when remaining_qty=0;
        take_qty:=least(grade.contract_available,remaining_qty);
        if p_source='presale' then
          insert into public.potato_stock_allocation(grading_id,size_code,kind,pockets,presale_id,dispatch_id)
          values(grade.grading_id,line.size_code,'presale_dispatch',take_qty,p_presale_id,p_dispatch_id);
        else
          if nullif(btrim(coalesce(p_diversion_reason,'')),'') is null then raise exception 'Diversion reason required'; end if;
          insert into public.potato_stock_allocation(grading_id,size_code,kind,pockets,presale_id,dispatch_id,reason)
          values(grade.grading_id,line.size_code,'divert',take_qty,p_presale_id,p_dispatch_id,p_diversion_reason);
          insert into public.potato_stock_allocation(grading_id,size_code,kind,pockets,dispatch_id)
          values(grade.grading_id,line.size_code,'normal_dispatch',take_qty,p_dispatch_id);
        end if;
        remaining_qty:=remaining_qty-take_qty;
      end loop;
    end if;
    if remaining_qty>0 then raise exception 'Insufficient % stock: short by % pockets',line.size_code,remaining_qty; end if;
  end loop;
end $fn$;

-- Restrict callable operations to application admins. Helper can run from the trigger.
revoke all on function public.potato_reserve_newly_available(uuid) from public,anon,authenticated;
revoke all on function public.potato_grading_reservation_trigger() from public,anon,authenticated;
revoke all on function public.potato_allocate_outgoing(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.potato_allocate_outgoing(uuid,text,uuid,text) to authenticated;
