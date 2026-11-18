create schema if not exists potato_market_private;
revoke all on schema potato_market_private from public,anon,authenticated;
create table if not exists public.potato_market_sale (
 sale_id uuid primary key default gen_random_uuid(),
 dispatch_id uuid not null unique references public.wb_potato_dispatch(dispatch_id),
 sale_date date not null,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.potato_market_sale_line (
 sale_id uuid not null references public.potato_market_sale(sale_id),
 size_code text not null references public.wb_potato_size(size_code),
 pockets integer not null check(pockets>0),
 price_per_pocket numeric(14,2) not null check(price_per_pocket>0),
 primary key(sale_id,size_code)
);
create table if not exists public.potato_market_field_allocation (
 sale_id uuid not null references public.potato_market_sale(sale_id),
 tracecode_id bigint not null references public.tracecode(tracecode_id),
 size_code text not null references public.wb_potato_size(size_code),
 pockets integer not null check(pockets>0),
 primary key(sale_id,tracecode_id,size_code)
);
create table if not exists public.potato_market_payment (
 payment_id uuid primary key default gen_random_uuid(),
 sale_id uuid not null references public.potato_market_sale(sale_id),
 payment_date date not null,
 amount numeric(14,2) not null check(amount>0),
 market_reference text,
 note text,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.potato_market_audit (
 audit_id bigint generated always as identity primary key,
 record_type text not null check(record_type in ('sale','payment')),
 record_id uuid not null,
 before_data jsonb not null,
 change_reason text not null,
 changed_by uuid not null default auth.uid(),
 changed_at timestamptz not null default now()
);
alter table public.potato_market_sale enable row level security;
alter table public.potato_market_sale_line enable row level security;
alter table public.potato_market_field_allocation enable row level security;
alter table public.potato_market_payment enable row level security;
alter table public.potato_market_audit enable row level security;
revoke all on public.potato_market_sale,public.potato_market_sale_line,public.potato_market_field_allocation,public.potato_market_payment,public.potato_market_audit from anon,authenticated;

create or replace function potato_market_private.is_admin()
returns boolean language sql stable security definer set search_path=''
as $ select auth.uid() is not null and 'admin'=any(public.my_farm_app_roles()) $;
revoke all on function potato_market_private.is_admin() from public,anon,authenticated;

create or replace function public.potato_market_context()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'dispatches',coalesce((select jsonb_agg(jsonb_build_object('dispatch_id',d.dispatch_id,'dnote_number',d.dnote_number,
    'counts',(select jsonb_object_agg(l.size_code,l.pockets) from public.wb_potato_dispatch_line l where l.dispatch_id=d.dispatch_id))
    order by d.dnote_number) from public.wb_potato_dispatch d
    where d.status='issued' and not exists(select 1 from public.potato_market_sale s where s.dispatch_id=d.dispatch_id)),'[]'::jsonb),
  'traces',coalesce((select jsonb_agg(jsonb_build_object('id',t.tracecode_id,'name',t.tracecode_name) order by t.tracecode_name)
    from public.tracecode t join public.crop c using(crop_id)
    where lower(btrim(c.crop_name))='potatoes' and t.end_date is null),'[]'::jsonb),
  'sales',coalesce((select jsonb_agg(jsonb_build_object('sale_id',s.sale_id,'dispatch_id',s.dispatch_id,'dnote_number',d.dnote_number,
    'sale_date',s.sale_date,'lines',(select coalesce(jsonb_object_agg(l.size_code,jsonb_build_object('pockets',l.pockets,'price',l.price_per_pocket)),'{}'::jsonb)
      from public.potato_market_sale_line l where l.sale_id=s.sale_id),
    'allocations',(select coalesce(jsonb_agg(jsonb_build_object('tracecode_id',a.tracecode_id,'size_code',a.size_code,'pockets',a.pockets)),'[]'::jsonb)
      from public.potato_market_field_allocation a where a.sale_id=s.sale_id),
    'total',coalesce((select sum(l.pockets*l.price_per_pocket) from public.potato_market_sale_line l where l.sale_id=s.sale_id),0),
    'paid',coalesce((select sum(p.amount) from public.potato_market_payment p where p.sale_id=s.sale_id),0))
    order by s.sale_date desc,s.created_at desc) from public.potato_market_sale s join public.wb_potato_dispatch d using(dispatch_id)),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('payment_id',p.payment_id,'sale_id',p.sale_id,'dnote_number',d.dnote_number,
    'payment_date',p.payment_date,'amount',p.amount,'note',p.note,'market_reference',p.market_reference)
    order by p.payment_date desc,p.created_at desc)
    from public.potato_market_payment p join public.potato_market_sale s using(sale_id) join public.wb_potato_dispatch d using(dispatch_id)),'[]'::jsonb),
  'report',coalesce((select jsonb_agg(x order by (x->>'date') desc) from (
    select jsonb_build_object('type','Sale','date',s.sale_date,'dnote',d.dnote_number,
      'amount',(select coalesce(sum(l.pockets*l.price_per_pocket),0) from public.potato_market_sale_line l where l.sale_id=s.sale_id),
      'note','') x from public.potato_market_sale s join public.wb_potato_dispatch d using(dispatch_id)
    union all
    select jsonb_build_object('type','Payment','date',p.payment_date,'dnote',d.dnote_number,'amount',p.amount,'note',coalesce(p.note,'')) x
      from public.potato_market_payment p join public.potato_market_sale s using(sale_id) join public.wb_potato_dispatch d using(dispatch_id)
  ) q),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.potato_market_save_sale(p_sale_id uuid,p_dispatch_id uuid,p_sale_date date,p_lines jsonb,p_allocations jsonb,p_reason text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare sid uuid:=coalesce(p_sale_id,gen_random_uuid()); d public.wb_potato_dispatch; k text; expected integer; got integer; trace_id bigint; size text; qty integer; before_doc jsonb;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_sale_date is null or jsonb_typeof(p_lines)<>'object' or jsonb_typeof(p_allocations)<>'array' then raise exception 'Sale date, prices and field allocations are required'; end if;
 select * into d from public.wb_potato_dispatch where dispatch_id=p_dispatch_id and status='issued' for update;
 if not found then raise exception 'Choose an issued potato D-Note'; end if;
 if p_sale_id is null and exists(select 1 from public.potato_market_sale where dispatch_id=p_dispatch_id) then raise exception 'This D-Note already has a sale'; end if;
 if p_sale_id is not null then
  select jsonb_build_object('sale',to_jsonb(s),'lines',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from public.potato_market_sale_line l where l.sale_id=s.sale_id),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.potato_market_field_allocation a where a.sale_id=s.sale_id))
    into before_doc from public.potato_market_sale s where s.sale_id=p_sale_id and s.dispatch_id=p_dispatch_id for update;
  if before_doc is null then raise exception 'Sale not found'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason for this change'; end if;
 end if;
 for k in select size_code from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id loop
   expected:=(select pockets from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id and size_code=k);
   if coalesce(p_lines->k->>'price','') !~ '^([0-9]+)(\.[0-9]{1,2})?$' or coalesce((p_lines->k->>'pockets')::integer,-1)<>expected then
    raise exception 'Enter a price and matching pocket quantity for every D-Note size';
   end if;
   select coalesce(sum((a->>'pockets')::integer),0) into got from jsonb_array_elements(p_allocations) a where a->>'size_code'=k;
   if got<>expected then raise exception 'Field allocations must total the D-Note quantity for every size'; end if;
 end loop;
 if (select count(*) from jsonb_object_keys(p_lines))<>(select count(*) from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id) then raise exception 'Prices must match all D-Note sizes'; end if;
 if p_sale_id is null then insert into public.potato_market_sale(sale_id,dispatch_id,sale_date) values(sid,p_dispatch_id,p_sale_date);
 else
  insert into public.potato_market_audit(record_type,record_id,before_data,change_reason) values('sale',sid,before_doc,btrim(p_reason));
  update public.potato_market_sale set sale_date=p_sale_date,updated_at=now() where sale_id=sid;
  delete from public.potato_market_sale_line where sale_id=sid; delete from public.potato_market_field_allocation where sale_id=sid;
 end if;
 for k in select jsonb_object_keys(p_lines) loop
  insert into public.potato_market_sale_line values(sid,k,(p_lines->k->>'pockets')::integer,(p_lines->k->>'price')::numeric);
 end loop;
 for size,trace_id,qty in select a->>'size_code',(a->>'tracecode_id')::bigint,(a->>'pockets')::integer from jsonb_array_elements(p_allocations) a loop
  if qty<=0 or not exists(select 1 from public.tracecode t join public.crop c using(crop_id) where t.tracecode_id=trace_id and t.end_date is null and lower(btrim(c.crop_name))='potatoes') then raise exception 'Choose live potato fields only'; end if;
  insert into public.potato_market_field_allocation values(sid,trace_id,size,qty);
 end loop;
 return sid;
end $$;

create or replace function public.potato_market_save_payment(p_payment_id uuid,p_sale_id uuid,p_payment_date date,p_amount numeric,p_note text,p_market_reference text,p_reason text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare pid uuid:=coalesce(p_payment_id,gen_random_uuid()); old jsonb;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from public.potato_market_sale where sale_id=p_sale_id) or p_payment_date is null or p_amount is null or p_amount<=0 then raise exception 'Choose a sale and enter a valid payment'; end if;
 if p_payment_id is null then
  insert into public.potato_market_payment(payment_id,sale_id,payment_date,amount,note,market_reference)
  values(pid,p_sale_id,p_payment_date,p_amount,nullif(btrim(p_note),''),nullif(btrim(p_market_reference),'')); 
 else
  select to_jsonb(p) into old from public.potato_market_payment p where p.payment_id=p_payment_id for update;
  if old is null then raise exception 'Payment not found'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason for this change'; end if;
  insert into public.potato_market_audit(record_type,record_id,before_data,change_reason) values('payment',pid,old,btrim(p_reason));
  update public.potato_market_payment set sale_id=p_sale_id,payment_date=p_payment_date,amount=p_amount,note=nullif(btrim(p_note),''),market_reference=nullif(btrim(p_market_reference),''),updated_at=now() where payment_id=pid;
 end if;
 return pid;
end $$;
revoke all on function public.potato_market_context(),public.potato_market_save_sale(uuid,uuid,date,jsonb,jsonb,text),public.potato_market_save_payment(uuid,uuid,date,numeric,text,text,text) from public,anon;
grant execute on function public.potato_market_context(),public.potato_market_save_sale(uuid,uuid,date,jsonb,jsonb,text),public.potato_market_save_payment(uuid,uuid,date,numeric,text,text,text) to authenticated;
