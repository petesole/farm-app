CREATE OR REPLACE FUNCTION public.labour_v2_submit_day(p_date date, p_lines jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_user uuid;
 v_roles text[];
 v_line jsonb;
 v_activity record;
 v_trace record;
 v_trace_id bigint;
 v_activity_id bigint;
 v_qty numeric;
 v_kgs numeric;
 v_cost numeric;
 v_count integer;
BEGIN
 v_user := auth.uid();
 IF v_user IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='28000'; END IF;
 v_roles := public.my_farm_app_roles();
 IF NOT (v_roles && ARRAY['admin','manager','labour']::text[]) THEN
  RAISE EXCEPTION 'No labour entry permission' USING ERRCODE='42501';
 END IF;
 IF p_date IS NULL THEN RAISE EXCEPTION 'Labour date is required'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Labour lines must be an array';
 END IF;
 v_count := jsonb_array_length(p_lines);
 IF v_count<1 OR v_count>250 THEN
  RAISE EXCEPTION 'Enter between 1 and 250 labour lines';
 END IF;
 -- A single atomic submission reserves the date and then writes its lines.
 -- A second submission for the same date fails on the primary key.
 IF EXISTS (SELECT 1 FROM public.labour_v2_access_history WHERE labour_date=p_date) THEN
  RAISE EXCEPTION 'Date already exists in Access history and is locked' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.labour_v2_day(labour_date,submitted_by,line_count)
 VALUES (p_date,v_user,v_count);
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(v_line) <> 'object' THEN RAISE EXCEPTION 'Invalid labour line'; END IF;
  v_trace_id := NULLIF(v_line->>'tracecode_id','')::bigint;
  v_activity_id := NULLIF(v_line->>'activity_id','')::bigint;
  v_qty := NULLIF(v_line->>'labour_qty','')::numeric;
  v_kgs := NULLIF(v_line->>'kgs','')::numeric;
  v_cost := NULLIF(v_line->>'unit_cost','')::numeric;
  IF v_trace_id IS NULL THEN RAISE EXCEPTION 'Trace Code required'; END IF;
  IF v_activity_id IS NULL THEN RAISE EXCEPTION 'Labour Activity required'; END IF;
  IF v_cost IS NULL OR v_cost<0 THEN RAISE EXCEPTION 'Unit Cost must be zero or more'; END IF;
  SELECT activity_id,labour_measure,active INTO v_activity
  FROM public.labour_v2_activity WHERE activity_id=v_activity_id;
  IF NOT FOUND OR v_activity.active IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Invalid or inactive Activity ID %',v_activity_id;
  END IF;
  IF v_activity.labour_measure='Kgs' THEN
   IF v_kgs IS NULL OR v_kgs<=0 OR v_kgs='NaN'::numeric THEN RAISE EXCEPTION 'Kgs must exceed zero'; END IF;
   v_qty:=COALESCE(v_qty,0);
  ELSIF v_qty IS NULL OR v_qty<=0 OR v_qty='NaN'::numeric THEN
   RAISE EXCEPTION 'Labour Qty must exceed zero';
  END IF;
  SELECT tracecode_id,crop_id,start_date,end_date INTO v_trace
  FROM public.tracecode WHERE tracecode_id=v_trace_id;
  IF NOT FOUND OR v_trace.start_date IS NULL OR v_trace.end_date IS NOT NULL THEN
   RAISE EXCEPTION 'Trace % is not active',v_trace_id;
  END IF;
  INSERT INTO public.labour_v2_transaction
   (labour_date,tracecode_id,activity_id,labour_qty,kgs,unit_cost,crop_id,created_by)
  VALUES
   (p_date,v_trace_id,v_activity_id,v_qty,
     CASE WHEN v_activity.labour_measure='Kgs' THEN v_kgs ELSE NULL END,
     v_cost,v_trace.crop_id,v_user);
 END LOOP;
 RETURN v_count;
END; $function$;
