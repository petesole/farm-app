-- HSCP4a potato waste field assignment (historical 8 completed slips).
-- Preserve WB transactions and manual slips as issued. Map provenance separately.
CREATE TABLE IF NOT EXISTS public.potato_waste_field_assignment (
 source_type text NOT NULL CHECK (source_type IN ('manual','scale')),
 source_id uuid NOT NULL,
 tracecode_id bigint NOT NULL REFERENCES public.tracecode(tracecode_id),
 assigned_reason text NOT NULL CHECK (length(btrim(assigned_reason))>0),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 assigned_by uuid DEFAULT auth.uid(),
 PRIMARY KEY (source_type,source_id)
);
ALTER TABLE public.potato_waste_field_assignment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.potato_waste_field_assignment FROM public,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.potato_waste_field_assignment_audit(
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_type text NOT NULL,
 source_id uuid NOT NULL,
 prior_tracecode_id bigint,
 new_tracecode_id bigint NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason))>0),
 changed_at timestamptz NOT NULL DEFAULT now(),
 changed_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.potato_waste_field_assignment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.potato_waste_field_assignment_audit FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.potato_waste_assign(
 p_source_type text,p_source_id uuid,p_tracecode_id bigint,p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE old_field bigint; src_crop bigint; src_status text; src_movement text;
DECLARE src_season bigint; target_season bigint;
BEGIN
 IF NOT potato_market_private.is_admin() THEN
  RAISE EXCEPTION 'Admin access required' USING errcode='42501';
 END IF;
 IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
  RAISE EXCEPTION 'Field assignment reason required';
 END IF;
 IF p_source_type='manual' THEN
  SELECT crop_id,status,movement_kind,season_id
   INTO src_crop,src_status,src_movement,src_season
   FROM public.wb_manual_entries WHERE manual_entry_id=p_source_id;
 ELSIF p_source_type='scale' THEN
  SELECT crop_id,status,movement_kind INTO src_crop,src_status,src_movement
   FROM public.wb_scale_transaction WHERE transaction_id=p_source_id;
 ELSE RAISE EXCEPTION 'Invalid waste source';
 END IF;
 IF src_crop IS NULL OR src_status IS DISTINCT FROM 'completed'
  OR src_movement IS DISTINCT FROM 'WASTE_OUT'
  OR NOT EXISTS (SELECT 1 FROM public.crop c WHERE c.crop_id=src_crop
      AND lower(btrim(c.crop_name))='potatoes') THEN
  RAISE EXCEPTION 'Source must be a completed potato waste slip';
 END IF;
 SELECT t.season_id INTO target_season FROM public.tracecode t
  WHERE t.tracecode_id=p_tracecode_id AND t.crop_id=src_crop;
 IF target_season IS NULL OR (src_season IS NOT NULL AND target_season<>src_season) THEN
  RAISE EXCEPTION 'Choose a potato field in the correct season';
 END IF;
 SELECT tracecode_id INTO old_field FROM public.potato_waste_field_assignment
  WHERE source_type=p_source_type AND source_id=p_source_id FOR UPDATE;
 IF old_field IS NOT DISTINCT FROM p_tracecode_id THEN RETURN; END IF;
 INSERT INTO public.potato_waste_field_assignment(source_type,source_id,tracecode_id,assigned_reason)
 VALUES(p_source_type,p_source_id,p_tracecode_id,btrim(p_reason))
 ON CONFLICT(source_type,source_id) DO UPDATE SET
  tracecode_id=excluded.tracecode_id,assigned_reason=excluded.assigned_reason,
  assigned_at=now(),assigned_by=auth.uid();
 INSERT INTO public.potato_waste_field_assignment_audit
  (source_type,source_id,prior_tracecode_id,new_tracecode_id,reason)
 VALUES(p_source_type,p_source_id,old_field,p_tracecode_id,btrim(p_reason));
END $fn$;
REVOKE ALL ON FUNCTION public.potato_waste_assign(text,uuid,bigint,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.potato_waste_assign(text,uuid,bigint,text)
 TO authenticated;

DO $do$
DECLARE found_slips integer; total_kg numeric;
BEGIN
 SELECT count(*),sum(kg) INTO found_slips,total_kg FROM (
  SELECT w.net_kg kg FROM public.wb_scale_transaction w
   WHERE w.crop_id=30 AND w.movement_kind='WASTE_OUT'
     AND w.status='completed' AND w.official_slip_number IN (128,134,138,139,145)
  UNION ALL
  SELECT m.net_kg FROM public.wb_manual_entries m
   WHERE m.crop_id=30 AND m.movement_kind='WASTE_OUT'
     AND m.status='completed' AND m.manual_slip_number IN ('M24','M25','M26')
 ) s;
 IF found_slips<>8 OR total_kg<>20380 THEN
  RAISE EXCEPTION 'Historical waste validation failed (%, % kg)',found_slips,total_kg;
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.potato_waste_field_assignment a
  JOIN public.wb_scale_transaction w ON w.transaction_id=a.source_id
  WHERE a.source_type='scale' AND w.official_slip_number IN (128,134,138,139,145)
    AND a.tracecode_id<>550
 ) OR EXISTS (
  SELECT 1 FROM public.potato_waste_field_assignment a
  JOIN public.wb_manual_entries m ON m.manual_entry_id=a.source_id
  WHERE a.source_type='manual' AND m.manual_slip_number IN ('M24','M25','M26')
    AND a.tracecode_id<>550
 ) THEN RAISE EXCEPTION 'Existing waste assignment conflicts with HSCP4a'; END IF;
END $do$;

INSERT INTO public.potato_waste_field_assignment(source_type,source_id,tracecode_id,assigned_reason)
SELECT 'manual',m.manual_entry_id,550,
 'Historical waste source confirmed HSCP4a by farm operator on 21/11/2026'
 FROM public.wb_manual_entries m
 WHERE m.crop_id=30 AND m.movement_kind='WASTE_OUT' AND m.status='completed'
 AND m.manual_slip_number IN ('M24','M25','M26')
ON CONFLICT(source_type,source_id) DO NOTHING;
INSERT INTO public.potato_waste_field_assignment(source_type,source_id,tracecode_id,assigned_reason)
SELECT 'scale',w.transaction_id,550,
 'Historical waste source confirmed HSCP4a by farm operator on 21/11/2026'
 FROM public.wb_scale_transaction w
 WHERE w.crop_id=30 AND w.movement_kind='WASTE_OUT' AND w.status='completed'
 AND w.official_slip_number IN (128,134,138,139,145)
ON CONFLICT(source_type,source_id) DO NOTHING;

CREATE OR REPLACE VIEW public.potato_field_report_v2 AS
 WITH incoming AS (
         SELECT a.tracecode_id,
            sum(a.allocated_kg) AS raw_kg
           FROM wb_scale_field_allocation a
             JOIN wb_scale_transaction w_1 USING (transaction_id)
          WHERE w_1.status = 'completed'::text AND w_1.owner_type = 'own'::text AND w_1.movement_kind = 'HARVEST_IN'::text
          GROUP BY a.tracecode_id
        ), processed AS (
         SELECT b.tracecode_id,
            l.size_code,
            sum(l.pockets) AS pockets
           FROM wb_potato_grading_batch b
             JOIN wb_potato_grading_line l USING (grading_id)
          WHERE b.status = 'posted'::text
          GROUP BY b.tracecode_id, l.size_code
        ), waste AS (
 SELECT x.tracecode_id, sum(x.waste_kg) AS waste_kg
 FROM (
  SELECT a.tracecode_id,w.net_kg AS waste_kg
  FROM public.potato_waste_field_assignment a
  JOIN public.wb_scale_transaction w ON w.transaction_id=a.source_id
  JOIN public.crop c ON c.crop_id=w.crop_id
  WHERE a.source_type='scale' AND w.status='completed'
    AND w.movement_kind='WASTE_OUT' AND lower(btrim(c.crop_name))='potatoes'
  UNION ALL
  SELECT a.tracecode_id,m.net_kg AS waste_kg
  FROM public.potato_waste_field_assignment a
  JOIN public.wb_manual_entries m ON m.manual_entry_id=a.source_id
  JOIN public.crop c ON c.crop_id=m.crop_id
  WHERE a.source_type='manual' AND m.status='completed'
    AND m.movement_kind='WASTE_OUT' AND lower(btrim(c.crop_name))='potatoes'
 ) x
 GROUP BY x.tracecode_id
), stock AS (
         SELECT potato_grade_pool_v.tracecode_id,
            potato_grade_pool_v.size_code,
            sum(potato_grade_pool_v.normal_available + potato_grade_pool_v.reserved_available)::bigint AS pockets
           FROM potato_grade_pool_v
          GROUP BY potato_grade_pool_v.tracecode_id, potato_grade_pool_v.size_code
        ), sold_normal AS (
         SELECT a.tracecode_id,
            a.size_code,
            sum(a.pockets) AS pockets,
            sum(a.pockets::numeric * l.price_per_pocket) AS value
           FROM potato_market_field_allocation a
             JOIN potato_market_sale_line l ON l.sale_id = a.sale_id AND l.size_code = a.size_code
          GROUP BY a.tracecode_id, a.size_code
        ), sold_presale AS (
         SELECT potato_presale_position_v.tracecode_id,
            potato_presale_position_v.size_code,
            sum(potato_presale_position_v.allocated_to_contract)::bigint AS pockets,
            sum(potato_presale_position_v.sales_value) AS value
           FROM potato_presale_position_v
          GROUP BY potato_presale_position_v.tracecode_id, potato_presale_position_v.size_code
        )
 SELECT t.tracecode_id,
    t.tracecode_name,
    t.season_id,
    t.tracecode_size AS hectares,
    COALESCE(i.raw_kg, 0::numeric) AS raw_kg,
    COALESCE(w.waste_kg, 0::numeric) AS waste_kg,
    sz.size_code,
    sz.display_name AS size_name,
    sz.sort_order,
    COALESCE(p.pockets, 0::bigint) AS processed_pockets,
    COALESCE(p.pockets, 0::bigint)::numeric * sz.pocket_weight_kg AS processed_kg,
    COALESCE(st.pockets, 0::bigint) AS stock_pockets,
    COALESCE(st.pockets, 0::bigint)::numeric * sz.pocket_weight_kg AS stock_kg,
    COALESCE(sn.pockets, 0::bigint) + COALESCE(sp.pockets, 0::bigint) AS sold_pockets,
    (COALESCE(sn.pockets, 0::bigint) + COALESCE(sp.pockets, 0::bigint))::numeric * sz.pocket_weight_kg AS sold_kg,
    COALESCE(sn.value, 0::numeric) + COALESCE(sp.value, 0::numeric) AS sold_value,
    COALESCE(sp.pockets, 0::bigint) AS presale_sold_pockets,
    COALESCE(sp.value, 0::numeric) AS presale_sold_value
   FROM tracecode t
     JOIN crop c USING (crop_id)
     CROSS JOIN wb_potato_size sz
     LEFT JOIN incoming i ON i.tracecode_id = t.tracecode_id
     LEFT JOIN waste w ON w.tracecode_id = t.tracecode_id
     LEFT JOIN processed p ON p.tracecode_id = t.tracecode_id AND p.size_code = sz.size_code
     LEFT JOIN stock st ON st.tracecode_id = t.tracecode_id AND st.size_code = sz.size_code
     LEFT JOIN sold_normal sn ON sn.tracecode_id = t.tracecode_id AND sn.size_code = sz.size_code
     LEFT JOIN sold_presale sp ON sp.tracecode_id = t.tracecode_id AND sp.size_code = sz.size_code
  WHERE lower(btrim(c.crop_name)) = 'potatoes'::text;;
