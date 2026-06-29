BEGIN;

ALTER TABLE public.labor_agency_worker_profile
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS available_days_mask smallint NOT NULL DEFAULT 127,
    ADD COLUMN IF NOT EXISTS availability_memo text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.labor_agency_worker_profile'::regclass
            AND conname = 'labor_agency_worker_profile_available_days_mask_check'
    ) THEN
        ALTER TABLE public.labor_agency_worker_profile
            ADD CONSTRAINT labor_agency_worker_profile_available_days_mask_check
            CHECK (available_days_mask BETWEEN 0 AND 127);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.labor_agency_worker_profile'::regclass
            AND conname = 'labor_agency_worker_profile_availability_memo_not_blank_check'
    ) THEN
        ALTER TABLE public.labor_agency_worker_profile
            ADD CONSTRAINT labor_agency_worker_profile_availability_memo_not_blank_check
            CHECK (availability_memo IS NULL OR btrim(availability_memo) <> '');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS labor_agency_worker_profile_availability_idx
    ON public.labor_agency_worker_profile(agency_owner_uuid, is_active, available_days_mask)
    WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.labor_agency_worker_availability_exception (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE CASCADE,
    exception_type varchar(24) NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    reason text,
    created_by_account_uuid uuid REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT labor_agency_worker_availability_exception_type_check
        CHECK (exception_type IN ('AVAILABLE', 'UNAVAILABLE', 'RESTING')),
    CONSTRAINT labor_agency_worker_availability_exception_date_range_check
        CHECK (ends_on >= starts_on),
    CONSTRAINT worker_availability_exception_reason_not_blank_check
        CHECK (reason IS NULL OR btrim(reason) <> '')
);

CREATE INDEX IF NOT EXISTS labor_agency_worker_availability_exception_worker_date_idx
    ON public.labor_agency_worker_availability_exception(worker_profile_uuid, starts_on, ends_on);

CREATE INDEX IF NOT EXISTS labor_agency_worker_availability_exception_type_date_idx
    ON public.labor_agency_worker_availability_exception(exception_type, starts_on, ends_on);

DROP TRIGGER IF EXISTS labor_agency_worker_availability_exception_set_updated_at
    ON public.labor_agency_worker_availability_exception;

CREATE TRIGGER labor_agency_worker_availability_exception_set_updated_at
    BEFORE UPDATE ON public.labor_agency_worker_availability_exception
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
