-- Report-only extension: unallocated D-Notes are stock out but not yet priced.
-- Keep them visible against their actual WB customer without inventing a sale value.
create or replace function public.potato_market_statement_context()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare ctx jsonb;
begin
 if not potato_market_private.is_admin() then
   raise exception 'Admin access required' using errcode='42501';
 end if;
 ctx := public.potato_market_extended_context();
 return jsonb_set(ctx,'{pending_market_dnotes}',coalesce((
   select jsonb_agg(jsonb_build_object(
     'dispatch_id',d.dispatch_id,
     'customer_id',w.customer_id,
     'market_name',c.customer_name,
     'dnote_number',d.dnote_number,
     'dnote_date',(coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date,
     'pockets',(select coalesce(sum(l.pockets),0)
       from public.wb_potato_dispatch_line l where l.dispatch_id=d.dispatch_id))
     order by coalesce(w.first_at,w.local_created_at),d.dnote_number)
   from public.wb_potato_dispatch d
   join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id
   join public.wb_customer c on c.customer_id=w.customer_id
   where d.status='issued' and w.customer_id is not null
     and not exists(select 1 from public.potato_stock_allocation a
                    where a.dispatch_id=d.dispatch_id)
 ),'[]'::jsonb),true);
end $fn$;
revoke all on function public.potato_market_statement_context() from public,anon,authenticated;
grant execute on function public.potato_market_statement_context() to authenticated;
