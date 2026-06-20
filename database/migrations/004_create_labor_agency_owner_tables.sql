BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.labor_agency_owner (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    agency_name varchar(150),
    business_registration_number_hash char(64),
    memo text,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT labor_agency_owner_name_not_blank_check CHECK (btrim(name) <> ''),
    CONSTRAINT labor_agency_owner_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    CONSTRAINT labor_agency_owner_business_registration_hash_check
        CHECK (business_registration_number_hash IS NULL OR business_registration_number_hash ~ '^[0-9a-f]{64}$')
);

DROP TRIGGER IF EXISTS labor_agency_owner_set_updated_at ON public.labor_agency_owner;

CREATE TRIGGER labor_agency_owner_set_updated_at
    BEFORE UPDATE ON public.labor_agency_owner
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.labor_agency_owner_sensitive_profile (
    owner_uuid uuid PRIMARY KEY REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    phone_encrypted text,
    phone_hash char(64),
    bank_account_encrypted text,
    bank_account_hash char(64),
    email_encrypted text,
    email_hash char(64),
    business_registration_number_encrypted text,
    extra_sensitive_information_encrypted text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT labor_agency_owner_sensitive_phone_hash_check
        CHECK (phone_hash IS NULL OR phone_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT labor_agency_owner_sensitive_bank_account_hash_check
        CHECK (bank_account_hash IS NULL OR bank_account_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT labor_agency_owner_sensitive_email_hash_check
        CHECK (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$')
);

DROP TRIGGER IF EXISTS labor_agency_owner_sensitive_profile_set_updated_at
    ON public.labor_agency_owner_sensitive_profile;

CREATE TRIGGER labor_agency_owner_sensitive_profile_set_updated_at
    BEFORE UPDATE ON public.labor_agency_owner_sensitive_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
