-- Record potato payments against the dedicated Market master, not the
-- Weighbridge customer list.
alter table public.potato_market_payment
  add column if not exists market_id bigint references public.market(market_id);

create unique index if not exists market_market_name_casefold_uidx
  on public.market (upper(btrim(market_name)));

alter function public.potato_market_context()
  rename to potato_market_context_customer_legacy;

create or replace function public.potato_market_context()
returns jsonb language plpgsql security definer set search_path=''
as $func$
declare
  result jsonb;
  payment_rows jsonb;
begin
 if not potato_market_private.is_admin() then
   raise exception 'Admin access required' using errcode='42501';
 end if;
 result := public.potato_market_context_customer_legacy();
 select coalesce(jsonb_agg(jsonb_build_object('id',m.market_id,'name',m.market_name) order by m.market_name),'[]'::jsonb)
   into payment_rows from public.market m where m.market_active is true;
 result := jsonb_set(result,'{markets}',payment_rows,true);

 select coalesce(jsonb_agg(jsonb_build_object(
     'payment_id',p.payment_id,'market_id',p.market_id,
     'market_name',coalesce(m.market_name,c.customer_name,'Unassigned market'),
     'customer_id',p.customer_id,'customer_name',coalesce(c.customer_name,m.market_name,'Unassigned market'),
     'payment_date',p.payment_date,'amount',p.amount,'note',p.note,'market_reference',p.market_reference)
   order by p.payment_date desc,p.created_at desc),'[]'::jsonb)
   into payment_rows
   from public.potato_market_payment p
   left join public.market m on m.market_id=p.market_id
   left join public.wb_customer c on c.customer_id=p.customer_id;
 result := jsonb_set(result,'{payments}',payment_rows,true);

 select coalesce(jsonb_agg(q.entry order by q.sort_date desc),'[]'::jsonb)
   into payment_rows
   from (
     select jsonb_build_object('type','Sale','date',s->>'dnote_date','reference',s->>'dnote_number',
       'amount',coalesce((s->>'total')::numeric,0),'note','') as entry,
       (s->>'dnote_date')::date as sort_date
     from jsonb_array_elements(coalesce(result->'sales','[]'::jsonb)) s
     union all
     select jsonb_build_object('type','Payment','date',p->>'payment_date','reference',p->>'market_name',
       'amount',(p->>'amount')::numeric,
       'note',concat_ws('; ',nullif(p->>'market_reference',''),nullif(p->>'note',''))) as entry,
       (p->>'payment_date')::date as sort_date
     from jsonb_array_elements(payment_rows) p
   ) q;
 result := jsonb_set(result,'{transactions}',payment_rows,true);
 return result;
end
$func$;

create or replace function public.potato_market_save_market_payment(
  p_payment_id uuid,p_market_id bigint,p_payment_date date,p_amount numeric,
  p_note text,p_market_reference text,p_reason text default null)
returns uuid language plpgsql security definer set search_path=''
as $func$
declare pid uuid:=coalesce(p_payment_id,gen_random_uuid()); old jsonb;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from public.market where market_id=p_market_id and market_active is true)
    or p_payment_date is null or p_amount is null or p_amount<=0 then
   raise exception 'Choose an active market and enter a valid date and amount';
 end if;
 if p_payment_id is null then
   insert into public.potato_market_payment(payment_id,sale_id,market_id,customer_id,payment_date,amount,note,market_reference)
   values(pid,null,p_market_id,null,p_payment_date,p_amount,nullif(btrim(p_note),''),nullif(btrim(p_market_reference),''));
 else
   select to_jsonb(p) into old from public.potato_market_payment p where p.payment_id=p_payment_id for update;
   if old is null then raise exception 'Payment not found'; end if;
   if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason for this change'; end if;
   insert into public.potato_market_audit(record_type,record_id,before_data,change_reason)
     values('payment',pid,old,btrim(p_reason));
   update public.potato_market_payment set sale_id=null,market_id=p_market_id,customer_id=null,
     payment_date=p_payment_date,amount=p_amount,note=nullif(btrim(p_note),''),
     market_reference=nullif(btrim(p_market_reference),''),updated_at=now()
     where payment_id=pid;
 end if;
 return pid;
end
$func$;

create or replace function public.potato_market_add_market_master(p_market_name text)
returns bigint language plpgsql security definer set search_path=''
as $func$
declare v_market_name text:=regexp_replace(btrim(coalesce(p_market_name,'')),'\s+',' ','g');
  existing_id bigint;
  created_id bigint;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if v_market_name='' then raise exception 'Enter the market name'; end if;
 select m.market_id into existing_id from public.market m where upper(btrim(m.market_name))=upper(v_market_name);
 if found then
   update public.market set market_active=true where market_id=existing_id;
   return existing_id;
 end if;
 insert into public.market(market_name,market_active) values(v_market_name,true)
   returning market_id into created_id;
 return created_id;
end
$func$;

revoke all on function public.potato_market_context_customer_legacy() from public,anon,authenticated;
revoke all on function public.potato_market_save_market_payment(uuid,bigint,date,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.potato_market_add_market_master(text) from public,anon,authenticated;
grant execute on function public.potato_market_context(),
  public.potato_market_save_market_payment(uuid,bigint,date,numeric,text,text,text),
  public.potato_market_add_market_master(text) to authenticated;

