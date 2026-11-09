CREATE TABLE public.rainfall_correction_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 rainfall_id bigint NOT NULL,
 old_mm numeric,
 new_mm numeric NOT NULL,
 reason text NOT NULL,
 corrected_by uuid NOT NULL,
 corrected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rainfall_correction_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rainfall_correction_audit FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.correct_rainfall_reading(
 p_date date, p_gauge bigint, p_previous numeric, p_mm numeric, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
 actor uuid := auth.uid();
 reading public.rainfall%ROWTYPE;
BEGIN
 IF actor IS NULL OR NOT ('admin' = ANY (public.my_farm_app_roles())) THEN
  RAISE EXCEPTION 'Only Admin can correct rainfall' USING ERRCODE = '42501';
 END IF;
 IF p_mm IS NULL OR p_mm < 0 OR p_mm::text IN ('NaN','Infinity','-Infinity') OR NULLIF(btrim(p_reason),'') IS NULL THEN
  RAISE EXCEPTION 'Enter valid millimetres and a reason';
 END IF;
 SELECT * INTO reading FROM public.rainfall WHERE rainfall_date = p_date AND rain_gauge_id = p_gauge FOR UPDATE;
 IF NOT FOUND OR reading.rainfall_received IS DISTINCT FROM p_previous THEN
  RAISE EXCEPTION 'The reading changed. Reload before correcting it.';
 END IF;
 UPDATE public.rainfall SET rainfall_received = p_mm, updated_at = now(), updated_by = actor WHERE rainfall_id = reading.rainfall_id;
 INSERT INTO public.rainfall_correction_audit(rainfall_id,old_mm,new_mm,reason,corrected_by)
 VALUES (reading.rainfall_id,reading.rainfall_received,p_mm,btrim(p_reason),actor);
END;
$fn$;
REVOKE ALL ON FUNCTION public.correct_rainfall_reading(date,bigint,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_rainfall_reading(date,bigint,numeric,numeric,text) TO authenticated;
