BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.farm_owner (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    business_name varchar(150),
    business_registration_number_hash char(64),
    memo text,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT farm_owner_name_not_blank_check CHECK (btrim(name) <> ''),
    CONSTRAINT farm_owner_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    CONSTRAINT farm_owner_business_registration_hash_check
        CHECK (business_registration_number_hash IS NULL OR business_registration_number_hash ~ '^[0-9a-f]{64}$')
);

DROP TRIGGER IF EXISTS farm_owner_set_updated_at ON public.farm_owner;

CREATE TRIGGER farm_owner_set_updated_at
    BEFORE UPDATE ON public.farm_owner
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.farm_owner_sensitive_profile (
    owner_uuid uuid PRIMARY KEY REFERENCES public.farm_owner(uuid) ON DELETE CASCADE,
    phone_encrypted text,
    phone_hash char(64),
    bank_account_encrypted text,
    bank_account_hash char(64),
    business_registration_number_encrypted text,
    extra_sensitive_information_encrypted text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT farm_owner_sensitive_phone_hash_check
        CHECK (phone_hash IS NULL OR phone_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT farm_owner_sensitive_bank_account_hash_check
        CHECK (bank_account_hash IS NULL OR bank_account_hash ~ '^[0-9a-f]{64}$')
);

DROP TRIGGER IF EXISTS farm_owner_sensitive_profile_set_updated_at ON public.farm_owner_sensitive_profile;

CREATE TRIGGER farm_owner_sensitive_profile_set_updated_at
    BEFORE UPDATE ON public.farm_owner_sensitive_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.farm_work_site (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_uuid uuid NOT NULL REFERENCES public.farm_owner(uuid) ON DELETE RESTRICT,
    site_name varchar(150),
    farm_address text NOT NULL,
    male_required_count smallint NOT NULL DEFAULT 0,
    female_required_count smallint NOT NULL DEFAULT 0,
    work_description text NOT NULL,
    work_start_date date,
    work_end_date date,
    daily_start_time time,
    daily_end_time time,
    wage_memo text,
    memo text,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT farm_work_site_address_not_blank_check CHECK (btrim(farm_address) <> ''),
    CONSTRAINT farm_work_site_work_description_not_blank_check CHECK (btrim(work_description) <> ''),
    CONSTRAINT farm_work_site_male_required_count_check CHECK (male_required_count BETWEEN 0 AND 10000),
    CONSTRAINT farm_work_site_female_required_count_check CHECK (female_required_count BETWEEN 0 AND 10000),
    CONSTRAINT farm_work_site_date_range_check CHECK (work_end_date IS NULL OR work_start_date IS NULL OR work_end_date >= work_start_date),
    CONSTRAINT farm_work_site_time_range_check CHECK (daily_end_time IS NULL OR daily_start_time IS NULL OR daily_end_time > daily_start_time),
    CONSTRAINT farm_work_site_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS farm_work_site_owner_uuid_idx
    ON public.farm_work_site(owner_uuid);

DROP TRIGGER IF EXISTS farm_work_site_set_updated_at ON public.farm_work_site;

CREATE TRIGGER farm_work_site_set_updated_at
    BEFORE UPDATE ON public.farm_work_site
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
