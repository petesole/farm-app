-- FarmingMain's Potatoes crop is crop_id 30.
ALTER TABLE public.wb_manual_entries
  ALTER COLUMN dnote_number DROP NOT NULL,
  DROP CONSTRAINT wb_manual_entries_destination_type_check,
  DROP CONSTRAINT wb_manual_entries_movement_kind_check,
  ADD CONSTRAINT wb_manual_entries_destination_type_check
    CHECK (destination_type IN ('farm_stock', 'customer', 'third_party', 'waste')),
  ADD CONSTRAINT wb_manual_entries_movement_kind_check
    CHECK (movement_kind IN ('HARVEST_IN', 'MARKET_OUT', 'CUSTOMER_RETURN', 'OTHER', 'WASTE_OUT')),
  ADD CONSTRAINT wb_manual_entries_dnote_required
    CHECK (dnote_number IS NOT NULL OR (crop_id IS NOT DISTINCT FROM 30 AND origin_type = 'STOCK')),
  ADD CONSTRAINT wb_manual_entries_waste_route
    CHECK (
      (destination_type <> 'waste' AND movement_kind <> 'WASTE_OUT')
      OR (
        destination_type = 'waste' AND movement_kind = 'WASTE_OUT'
        AND crop_id IS NOT DISTINCT FROM 30 AND origin_type = 'STOCK'
        AND customer_id IS NULL AND delivery_point_id IS NULL
      )
    );

CREATE OR REPLACE FUNCTION public.wb_manual_validate_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  allocated numeric;
  bad_crop boolean;
BEGIN
  IF NEW.status = 'completed' THEN
    SELECT coalesce(sum(a.allocated_kg), 0),
           coalesce(bool_or(t.crop_id IS DISTINCT FROM NEW.crop_id), false)
      INTO allocated, bad_crop
      FROM public.wb_manual_allocations a
      JOIN public.tracecode t ON t.tracecode_id = a.tracecode_id
     WHERE a.manual_entry_id = NEW.manual_entry_id;

    IF NEW.crop_id IS NULL OR bad_crop
       OR (NEW.movement_kind = 'WASTE_OUT' AND allocated > 0)
       OR ((NEW.movement_kind = 'HARVEST_IN' OR allocated > 0) AND allocated <> NEW.net_kg) THEN
      RAISE EXCEPTION 'Manual slip allocation / crop mismatch';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END
$function$;
