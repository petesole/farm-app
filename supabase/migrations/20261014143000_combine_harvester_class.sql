-- Add a separate machinery class for the combine harvester.
-- Harvesting fuel is budgeted by hectares worked, not by tractor size.
INSERT INTO public.tractor_class (class_name, class_code)
SELECT 'Combine Harvester', 'COMBINE'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tractor_class
  WHERE lower(class_code) = 'combine'
     OR lower(class_name) = 'combine harvester'
);
