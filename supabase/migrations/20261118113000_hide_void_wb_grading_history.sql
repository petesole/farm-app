CREATE OR REPLACE FUNCTION wb_potato_private.context()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not wb_potato_private.allowed() then raise exception 'WB potato access is not assigned' using errcode='42501'; end if;
 return jsonb_build_object(
  'seasons',coalesce((select jsonb_agg(jsonb_build_object('id',season_id,'name',season_name) order by season_name)
   from public.season where not coalesce(season_complete,false)),'[]'::jsonb),
  'recent_grading',coalesce((
   select jsonb_agg(to_jsonb(g) || jsonb_build_object('counts',coalesce((
     select jsonb_object_agg(l.size_code,l.pockets)
     from public.wb_potato_grading_line l where l.grading_id=g.grading_id
   ),'{}'::jsonb)) order by g.grading_date desc,g.grading_id desc)
   from (
     select s.grading_id,s.grading_date,s.batch_reference,s.status,s.total_pockets
     from public.wb_potato_grading_summary_v s
     where s.status <> 'void'
     order by s.grading_date desc,s.grading_id desc limit 100
   ) g
  ),'[]'::jsonb),
  'stock',coalesce((select jsonb_agg(to_jsonb(s)) from public.wb_potato_stock_v s),'[]'::jsonb));
end $function$;
