ALTER TABLE public.wb_potato_grading_batch ALTER COLUMN bulk_input_kg DROP NOT NULL;

CREATE OR REPLACE FUNCTION wb_potato_private.submit(p_request_id uuid, p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_receipt wb_potato_private.receipt; season_key bigint; code text; n integer;
 total bigint:=0; bulk numeric; waste numeric; ticket public.wb_scale_transaction;
 pocket_only boolean; grading_day date; batch_ref text; matching_seasons integer;
begin
 if not wb_potato_private.allowed() then raise exception 'WB potato access is not assigned' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(731104,15);
 select * into old_receipt from wb_potato_private.receipt where request_id=p_request_id;
 if found then
  if old_receipt.user_id is distinct from auth.uid() or old_receipt.kind is distinct from p_kind or old_receipt.payload is distinct from p_payload then
   raise exception 'Request ID already belongs to a different request';
  end if;
  -- Never replay writes. Backend corrections/voids remain authoritative.
  return jsonb_build_object('document_id',old_receipt.document_id,'already_received',true);
 end if;
 if p_request_id is null or p_kind is null or p_kind not in ('grading','dispatch') or jsonb_typeof(p_payload) is distinct from 'object' then
  raise exception 'Invalid potato request';
 end if;
 pocket_only := p_kind='grading' AND (p_payload - 'date' - 'counts')='{}'::jsonb;
 IF pocket_only THEN
  grading_day := (p_payload->>'date')::date;
  IF grading_day IS NULL THEN RAISE EXCEPTION 'Grading date required'; END IF;
  SELECT min(s.season_id),count(*) INTO season_key,matching_seasons
  FROM public.season s
  WHERE NOT coalesce(s.season_complete,false)
    AND s.plan_year=extract(year FROM grading_day)
    AND EXISTS (
      SELECT 1 FROM public.tracecode t JOIN public.crop c USING(crop_id)
      WHERE t.season_id=s.season_id AND lower(btrim(c.crop_name))='potatoes'
        AND t.start_date<=grading_day
    );
  IF matching_seasons<>1 THEN
   RAISE EXCEPTION 'The grading date must match one open potato season in FarmingMain';
  END IF;
 ELSE
  season_key:=(p_payload->>'season_id')::bigint;
 END IF;
 if season_key is null or not exists(select 1 from public.season where season_id=season_key and not coalesce(season_complete,false)) then
  raise exception 'Select an open season';
 end if;
 if jsonb_typeof(p_payload->'counts') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_payload->'counts'))<>8 then
  raise exception 'All eight pocket counts are required';
 end if;
 for code in select unnest(array['LARGE','MEDIUM','SMEDIUM','SMALL','CHATS','CUTS','GREENS','BULLETS']) loop
  if coalesce(p_payload->'counts'->>code,'') !~ '^[0-9]+$' then raise exception 'Pockets must be nonnegative integers'; end if;
  n:=(p_payload->'counts'->>code)::integer;
  if n>1000000 then raise exception 'Pocket count too large'; end if;
  if not exists(select 1 from public.wb_potato_size where size_code=code and active and pocket_weight_kg=15) then
   raise exception 'Potato size configuration is invalid';
  end if;
  total:=total+n;
 end loop;
 if total<=0 then raise exception 'At least one pocket is required'; end if;
 if p_kind='grading' then
  IF pocket_only THEN
   batch_ref:='PG-'||p_request_id::text;
  ELSE
  bulk:=(p_payload->>'bulk_input_kg')::numeric; waste:=(p_payload->>'waste_kg')::numeric;
  if bulk is null or waste is null or not(bulk between .001 and 100000000 and waste between 0 and 100000000)
    or bulk<>round(bulk,3) or waste<>round(waste,3) or total*15+waste>bulk then
   raise exception 'Grading kilograms invalid or outputs exceed bulk input';
  end if;
  if length(btrim(coalesce(p_payload->>'reference',''))) not between 1 and 80 then raise exception 'Grading reference required (max 80 characters)'; end if;
  if p_payload->>'date' is null then raise exception 'Grading date required'; end if;
   grading_day := (p_payload->>'date')::date;
   batch_ref := btrim(p_payload->>'reference');
  END IF;
  insert into public.wb_potato_grading_batch(grading_id,grading_date,season_id,batch_reference,bulk_input_kg,status)
   values(p_request_id,grading_day,season_key,batch_ref,bulk,'posted');
  insert into public.wb_potato_grading_line(grading_id,size_code,pockets)
   select p_request_id,key,value::text::integer from jsonb_each(p_payload->'counts');
  if waste>0 then
   if length(btrim(coalesce(p_payload->>'waste_reason','')))=0 then raise exception 'Waste reason required'; end if;
   insert into public.wb_potato_grading_waste(grading_id,waste_kg,reason) values(p_request_id,waste,p_payload->>'waste_reason');
  end if;
 else
  select * into ticket from public.wb_scale_transaction where transaction_id=(p_payload->>'ticket_id')::uuid for update;
  if not found then raise exception 'Sync the completed WB ticket first'; end if;
  if not exists(select 1 from wb_potato_private.operator_installation where user_id=auth.uid() and installation_id=ticket.installation_id) then
   raise exception 'WB installation access denied' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_payload->>'dnote_number',''))) not between 1 and 32 then raise exception 'D-Note number required (max 32 characters)'; end if;
  insert into public.wb_potato_dispatch(dispatch_id,wb_transaction_id,season_id,dnote_number,status)
   values(p_request_id,ticket.transaction_id,season_key,btrim(p_payload->>'dnote_number'),'issued');
  insert into public.wb_potato_dispatch_line(dispatch_id,size_code,pockets)
   select p_request_id,key,value::text::integer from jsonb_each(p_payload->'counts');
 end if;
 -- Immediate validation before returning, with deferred triggers also protecting SQL corrections.
 if exists(select 1 from public.wb_potato_stock_v where available_pockets<0) then raise exception 'Insufficient posted potato stock'; end if;
 insert into wb_potato_private.receipt values(p_request_id,auth.uid(),p_kind,p_payload,p_request_id);
 return jsonb_build_object('document_id',p_request_id,'already_received',false);
end $function$;
