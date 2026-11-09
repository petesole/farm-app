CREATE OR REPLACE FUNCTION public.labour_v2_admin_save_line(
 p_source text, p_id bigint, p_date date, p_trace bigint, p_activity bigint,
 p_qty numeric, p_kgs numeric, p_rate numeric, p_reason text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE
 actor uuid := auth.uid();
 old_line public.labour_v2_transaction%ROWTYPE;
 new_line public.labour_v2_transaction%ROWTYPE;
 original jsonb;
 measure text;
 crop bigint;
BEGIN
 IF actor IS NULL OR NOT ('admin'=ANY(public.my_farm_app_roles())) THEN
  RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501';
 END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))<8 THEN RAISE EXCEPTION 'Enter a correction reason of at least eight characters'; END IF;
 IF p_source IS NULL OR p_source NOT IN ('App','Access','New') OR p_date IS NULL THEN RAISE EXCEPTION 'Invalid Labour reference'; END IF;
 IF p_source='Access' THEN
  SELECT to_jsonb(h) INTO original FROM public.labour_v2_access_history h WHERE h.access_labour_id=p_id AND h.labour_date=p_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Historical line not found on this date'; END IF;
  SELECT * INTO old_line FROM public.labour_v2_transaction WHERE access_labour_id=p_id FOR UPDATE;
 ELSIF p_source='App' THEN
  SELECT * INTO old_line FROM public.labour_v2_transaction WHERE id=p_id AND labour_date=p_date AND access_labour_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saved app line not found on this date'; END IF;
 ELSIF NOT EXISTS (SELECT FROM public.labour_v2_day WHERE labour_date=p_date)
   AND NOT EXISTS (SELECT FROM public.labour_v2_access_history WHERE labour_date=p_date) THEN
  RAISE EXCEPTION 'Date must already have saved Labour';
 END IF;
 SELECT crop_id INTO crop FROM public.tracecode WHERE tracecode_id=p_trace AND start_date IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select a valid trace'; END IF;
 SELECT labour_measure INTO measure FROM public.labour_v2_activity WHERE activity_id=p_activity;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select a valid activity'; END IF;
 IF p_rate IS NULL OR p_rate<0 OR p_rate::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid unit cost'; END IF;
 IF measure='Kgs' THEN
  IF p_kgs IS NULL OR p_kgs<=0 OR p_kgs::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter positive Kgs'; END IF;
  p_qty:=COALESCE(old_line.labour_qty,(original->>'labour_qty')::numeric,0);
 ELSE
  IF p_qty IS NULL OR p_qty<=0 OR p_qty::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a positive Qty'; END IF;
  p_kgs:=NULL;
 END IF;
 IF old_line.id IS NULL THEN
  INSERT INTO public.labour_v2_transaction(labour_date,tracecode_id,activity_id,labour_qty,kgs,unit_cost,crop_id,created_by,access_labour_id)
  VALUES(p_date,p_trace,p_activity,p_qty,p_kgs,p_rate,crop,actor,CASE WHEN p_source='Access' THEN p_id END)
  RETURNING * INTO new_line;
 ELSE
  UPDATE public.labour_v2_transaction SET tracecode_id=p_trace,activity_id=p_activity,labour_qty=p_qty,kgs=p_kgs,unit_cost=p_rate,crop_id=crop,updated_at=now()
  WHERE id=old_line.id RETURNING * INTO new_line;
 END IF;
 INSERT INTO public.labour_v2_correction_audit(changed_by,action,reason,labour_date,transaction_id,old_data,new_data)
 VALUES(actor,CASE WHEN p_source='New' THEN 'INSERT' ELSE 'UPDATE' END,btrim(p_reason),p_date,new_line.id,
 CASE WHEN old_line.id IS NOT NULL THEN to_jsonb(old_line) ELSE original END,to_jsonb(new_line));
 RETURN new_line.id;
END;
$body$;
REVOKE ALL ON FUNCTION public.labour_v2_admin_save_line(text,bigint,date,bigint,bigint,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.labour_v2_admin_save_line(text,bigint,date,bigint,bigint,numeric,numeric,numeric,text) TO authenticated;
CREATE OR REPLACE VIEW public.labour_v2_report_rows WITH (security_invoker=true) AS
 WITH unioned AS (
         SELECT 'Access'::text AS source_type,
            h.access_labour_id AS source_id,
            h.labour_date,
            h.tracecode_id,
            h.access_tracecode_id,
            h.access_activity_id AS activity_id,
            h.activity_name,
            h.labour_measure,
            h.labour_qty,
            h.kgs,
            h.unit_cost,
            h.total_cost,
            h.not_ao,
            h.is_agri_orange AS trace_is_ao
           FROM labour_v2_history_mapped h
          WHERE h.trace_mapping_status = 'mapped'::text AND h.activity_name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.labour_v2_transaction x WHERE x.access_labour_id=h.access_labour_id)
        UNION ALL
         SELECT CASE WHEN n.access_labour_id IS NULL THEN 'App'::text ELSE 'Access'::text END,
            COALESCE(n.access_labour_id,n.id),
            n.labour_date,
            n.tracecode_id,
            t.access_tc_id,
            n.activity_id,
            n.activity_name,
            n.labour_measure,
            n.labour_qty,
            n.kgs,
            n.unit_cost,
            n.total_cost,
            a.not_ao,
            m.access_ao
           FROM labour_v2_costs n
             JOIN tracecode t ON t.tracecode_id = n.tracecode_id
             JOIN labour_v2_activity a ON a.activity_id = n.activity_id
             LEFT JOIN labour_v2_trace_map m ON m.supabase_tracecode_id = n.tracecode_id
        ), enriched AS (
         SELECT u.source_type,
            u.source_id,
            u.labour_date,
            u.tracecode_id,
            u.access_tracecode_id,
            u.activity_id,
            u.activity_name,
            u.labour_measure,
            u.labour_qty,
            u.kgs,
            u.unit_cost,
            u.total_cost,
            u.not_ao,
            u.trace_is_ao,
            t.tracecode_name,
            t.tracecode_size AS field_size,
            COALESCE(c.crop_name, m.access_crop_name, 'Access crop not mapped'::text) AS crop_name,
            farm.farm_name,
            u.labour_date + 1 AS week_ref_date,
                CASE
                    WHEN u.labour_measure = 'Kgs'::text AND u.labour_qty > 0::numeric THEN u.kgs / u.labour_qty
                    ELSE NULL::numeric
                END AS kgs_per_person,
                CASE
                    WHEN t.tracecode_size > 0::numeric THEN u.total_cost / t.tracecode_size
                    ELSE NULL::numeric
                END AS cost_per_ha
           FROM unioned u
             JOIN tracecode t ON t.tracecode_id = u.tracecode_id AND t.start_date IS NOT NULL
             LEFT JOIN crop c ON c.crop_id = t.crop_id
             LEFT JOIN labour_v2_trace_map m ON m.supabase_tracecode_id = t.tracecode_id
             JOIN field f ON f.field_id = t.field_id
             JOIN farm farm ON farm.farm_id = f.farm_id
        ), wk AS (
         SELECT e.source_type,
            e.source_id,
            e.labour_date,
            e.tracecode_id,
            e.access_tracecode_id,
            e.activity_id,
            e.activity_name,
            e.labour_measure,
            e.labour_qty,
            e.kgs,
            e.unit_cost,
            e.total_cost,
            e.not_ao,
            e.trace_is_ao,
            e.tracecode_name,
            e.field_size,
            e.crop_name,
            e.farm_name,
            e.week_ref_date,
            e.kgs_per_person,
            e.cost_per_ha,
            (lpad((EXTRACT(year FROM e.week_ref_date)::integer % 100)::text, 2, '0'::text) || '/'::text) || lpad((1::numeric + floor(((e.week_ref_date - make_date(EXTRACT(year FROM e.week_ref_date)::integer, 1, 1))::numeric + EXTRACT(dow FROM make_date(EXTRACT(year FROM e.week_ref_date)::integer, 1, 1))) / 7::numeric))::integer::text, 2, '0'::text) AS raw_week
           FROM enriched e
        )
 SELECT source_type,
    source_id,
    labour_date,
        CASE
            WHEN raw_week = '24/53'::text THEN '25/01'::text
            ELSE raw_week
        END AS labour_week,
    tracecode_id,
    access_tracecode_id,
    tracecode_name,
    crop_name,
    activity_id,
    activity_name,
    labour_qty,
    kgs,
    unit_cost,
    total_cost,
    kgs_per_person,
    cost_per_ha,
    field_size,
    not_ao,
    trace_is_ao,
    farm_name,
        CASE
            WHEN trace_is_ao IS TRUE AND not_ao IS NULL THEN 'AgriOrange'::text
            WHEN farm_name = 'Florinova'::text THEN 'Florinova'::text
            ELSE 'Heyshott'::text
        END AS report_farm
   FROM wk;
