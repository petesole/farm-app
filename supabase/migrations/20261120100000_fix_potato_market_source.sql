-- Use the already agreed Weighbridge customer master for Market choices and
-- remove the ambiguous size_code USING join that breaks the field report.
do $migration$
declare
  function_sql text;
  old_market_query text := $old$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.market_id,'name',m.market_name) order by m.market_name),'[]'::jsonb)
   into payment_rows from public.market m where m.market_active is true;
$old$;
  new_market_query text := $new$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.customer_id,'name',c.customer_name) order by c.customer_name),'[]'::jsonb)
   into payment_rows from public.wb_customer c where c.active is true;
$new$;
begin
  function_sql := pg_get_functiondef('public.potato_market_context_customer_legacy()'::regprocedure);
  if position('join public.wb_potato_size sz using(size_code)' in function_sql) > 0 then
    function_sql := replace(
      function_sql,
      'join public.wb_potato_size sz using(size_code)',
      'join public.wb_potato_size sz on sz.size_code=a.size_code'
    );
  elsif position('join public.wb_potato_size sz on sz.size_code=a.size_code' in function_sql) = 0 then
    raise exception 'Expected potato field report size join was not found; migration stopped';
  end if;
  execute function_sql;

  function_sql := pg_get_functiondef('public.potato_market_context()'::regprocedure);
  if position(old_market_query in function_sql) > 0 then
    function_sql := replace(function_sql, old_market_query, new_market_query);
  elsif position(new_market_query in function_sql) = 0 then
    raise exception 'Expected Potato Market dropdown query was not found; migration stopped';
  end if;
  execute function_sql;
end
$migration$;
