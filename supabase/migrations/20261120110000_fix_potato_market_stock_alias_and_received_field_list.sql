-- Keep Potato field choices limited to live fields with received potato stock,
-- and use the stock view's size_code when joining available stock.
do $migration$
declare
  function_sql text;
  old_stock_join text := $old$from public.wb_potato_stock_v v
    join public.season se using(season_id)
    join public.wb_potato_size sz on sz.size_code=a.size_code$old$;
  new_stock_join text := $new$from public.wb_potato_stock_v v
    join public.season se using(season_id)
    join public.wb_potato_size sz on sz.size_code=v.size_code$new$;
  old_trace_source text := $old$from public.v_active_tracecodes t
    where lower(btrim(t.crop_name))='potatoes'$old$;
  new_trace_source text := $new$from public.v_active_tracecodes t
    where lower(btrim(t.crop_name))='potatoes'
      and exists (
        select 1
        from public.wb_scale_field_allocation fa
        join public.wb_scale_transaction w on w.transaction_id=fa.transaction_id
        where fa.tracecode_id=t.tracecode_id
          and fa.allocated_kg>0
          and w.status='completed'
          and w.owner_type='own'
          and w.movement_kind='HARVEST_IN'
      )$new$;
begin
  function_sql := pg_get_functiondef('public.potato_market_context_customer_legacy()'::regprocedure);
  if position(old_stock_join in function_sql)>0 then
    function_sql := replace(function_sql,old_stock_join,new_stock_join);
  elsif position(new_stock_join in function_sql)=0 then
    raise exception 'Expected Potato stock join was not found; migration stopped';
  end if;
  if position(new_trace_source in function_sql)=0 and position(old_trace_source in function_sql)>0 then
    function_sql := replace(function_sql,old_trace_source,new_trace_source);
  elsif position(new_trace_source in function_sql)=0 then
    raise exception 'Expected live potato field source was not found; migration stopped';
  end if;
  execute function_sql;
end
$migration$;
