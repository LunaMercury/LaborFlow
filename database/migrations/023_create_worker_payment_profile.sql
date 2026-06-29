BEGIN;

CREATE TABLE IF NOT EXISTS public.labor_agency_worker_payment_profile (
    worker_profile_uuid uuid PRIMARY KEY
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE CASCADE,
    bank_code varchar(16),
    bank_name varchar(50),
    account_number_encrypted text,
    account_number_hash char(64),
    account_holder_name varchar(100),
    verification_status varchar(24) NOT NULL DEFAULT 'NOT_VERIFIED',
    verification_provider varchar(50),
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT worker_payment_profile_bank_code_not_blank_check
        CHECK (bank_code IS NULL OR btrim(bank_code) <> ''),
    CONSTRAINT worker_payment_profile_bank_name_not_blank_check
        CHECK (bank_name IS NULL OR btrim(bank_name) <> ''),
    CONSTRAINT worker_payment_profile_account_number_hash_check
        CHECK (account_number_hash IS NULL OR account_number_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT worker_payment_profile_account_holder_not_blank_check
        CHECK (account_holder_name IS NULL OR btrim(account_holder_name) <> ''),
    CONSTRAINT worker_payment_profile_verification_status_check
        CHECK (verification_status IN ('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS worker_payment_profile_bank_idx
    ON public.labor_agency_worker_payment_profile(bank_code);

CREATE INDEX IF NOT EXISTS worker_payment_profile_account_hash_idx
    ON public.labor_agency_worker_payment_profile(account_number_hash)
    WHERE account_number_hash IS NOT NULL;

DROP TRIGGER IF EXISTS labor_agency_worker_payment_profile_set_updated_at
    ON public.labor_agency_worker_payment_profile;

CREATE TRIGGER labor_agency_worker_payment_profile_set_updated_at
    BEFORE UPDATE ON public.labor_agency_worker_payment_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
