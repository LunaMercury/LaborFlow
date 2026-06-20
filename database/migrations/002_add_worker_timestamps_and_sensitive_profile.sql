BEGIN;

ALTER TABLE public.worker
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worker_set_updated_at ON public.worker;

CREATE TRIGGER worker_set_updated_at
    BEFORE UPDATE ON public.worker
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.worker_sensitive_profile (
    worker_uuid uuid PRIMARY KEY REFERENCES public.worker(uuid) ON DELETE CASCADE,
    phone_encrypted text,
    phone_hash char(64),
    resident_registration_number_encrypted text,
    resident_registration_number_hash char(64),
    address_encrypted text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT worker_sensitive_phone_hash_check
        CHECK (phone_hash IS NULL OR phone_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT worker_sensitive_rrn_hash_check
        CHECK (resident_registration_number_hash IS NULL OR resident_registration_number_hash ~ '^[0-9a-f]{64}$')
);

DROP TRIGGER IF EXISTS worker_sensitive_profile_set_updated_at ON public.worker_sensitive_profile;

CREATE TRIGGER worker_sensitive_profile_set_updated_at
    BEFORE UPDATE ON public.worker_sensitive_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
