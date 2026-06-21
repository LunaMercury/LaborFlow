BEGIN;

ALTER TABLE public.labor_agency_worker_profile
    ADD COLUMN IF NOT EXISTS pickup_location varchar(200);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.labor_agency_worker_profile'::regclass
            AND conname = 'labor_agency_worker_profile_pickup_location_not_blank_check'
    ) THEN
        ALTER TABLE public.labor_agency_worker_profile
            ADD CONSTRAINT labor_agency_worker_profile_pickup_location_not_blank_check
            CHECK (pickup_location IS NULL OR btrim(pickup_location) <> '');
    END IF;
END $$;

COMMIT;
