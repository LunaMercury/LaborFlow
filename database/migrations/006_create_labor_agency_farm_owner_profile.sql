BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'farm_owner'
            AND column_name = 'name'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'farm_owner'
            AND column_name = 'canonical_name'
    ) THEN
        ALTER TABLE public.farm_owner
            RENAME COLUMN name TO canonical_name;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'farm_owner'
            AND column_name = 'business_name'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'farm_owner'
            AND column_name = 'canonical_business_name'
    ) THEN
        ALTER TABLE public.farm_owner
            RENAME COLUMN business_name TO canonical_business_name;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'farm_owner'
            AND column_name = 'memo'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'farm_owner'
            AND column_name = 'internal_memo'
    ) THEN
        ALTER TABLE public.farm_owner
            RENAME COLUMN memo TO internal_memo;
    END IF;
END $$;

ALTER TABLE public.farm_owner
    ADD COLUMN IF NOT EXISTS canonical_name varchar(100),
    ADD COLUMN IF NOT EXISTS canonical_nickname varchar(100),
    ADD COLUMN IF NOT EXISTS canonical_business_name varchar(150),
    ADD COLUMN IF NOT EXISTS internal_memo text;

ALTER TABLE public.farm_owner
    ALTER COLUMN canonical_name DROP NOT NULL;

ALTER TABLE public.farm_owner
    DROP CONSTRAINT IF EXISTS farm_owner_name_not_blank_check;

ALTER TABLE public.farm_owner
    ADD CONSTRAINT farm_owner_canonical_name_not_blank_check
        CHECK (canonical_name IS NULL OR btrim(canonical_name) <> ''),
    ADD CONSTRAINT farm_owner_canonical_nickname_not_blank_check
        CHECK (canonical_nickname IS NULL OR btrim(canonical_nickname) <> ''),
    ADD CONSTRAINT farm_owner_canonical_business_name_not_blank_check
        CHECK (canonical_business_name IS NULL OR btrim(canonical_business_name) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS farm_owner_sensitive_profile_phone_hash_uidx
    ON public.farm_owner_sensitive_profile(phone_hash)
    WHERE phone_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.labor_agency_farm_owner_profile (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    farm_owner_uuid uuid NOT NULL REFERENCES public.farm_owner(uuid) ON DELETE RESTRICT,
    local_name varchar(100),
    local_nickname varchar(100),
    local_business_name varchar(150),
    local_phone_encrypted text,
    local_phone_hash char(64),
    local_bank_account_encrypted text,
    local_bank_account_hash char(64),
    private_memo text,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT labor_agency_farm_owner_profile_local_name_not_blank_check
        CHECK (local_name IS NULL OR btrim(local_name) <> ''),
    CONSTRAINT labor_agency_farm_owner_profile_local_nickname_not_blank_check
        CHECK (local_nickname IS NULL OR btrim(local_nickname) <> ''),
    CONSTRAINT la_farm_owner_profile_business_name_not_blank_check
        CHECK (local_business_name IS NULL OR btrim(local_business_name) <> ''),
    CONSTRAINT labor_agency_farm_owner_profile_local_phone_hash_check
        CHECK (local_phone_hash IS NULL OR local_phone_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT labor_agency_farm_owner_profile_local_bank_account_hash_check
        CHECK (local_bank_account_hash IS NULL OR local_bank_account_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT labor_agency_farm_owner_profile_status_check
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    CONSTRAINT labor_agency_farm_owner_profile_has_visible_label_check
        CHECK (
            local_name IS NOT NULL
            OR local_nickname IS NOT NULL
            OR local_business_name IS NOT NULL
            OR local_phone_hash IS NOT NULL
            OR private_memo IS NOT NULL
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_farm_owner_profile_owner_farm_owner_uidx
    ON public.labor_agency_farm_owner_profile(agency_owner_uuid, farm_owner_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_farm_owner_profile_owner_phone_uidx
    ON public.labor_agency_farm_owner_profile(agency_owner_uuid, local_phone_hash)
    WHERE local_phone_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS labor_agency_farm_owner_profile_farm_owner_uuid_idx
    ON public.labor_agency_farm_owner_profile(farm_owner_uuid);

DROP TRIGGER IF EXISTS labor_agency_farm_owner_profile_set_updated_at
    ON public.labor_agency_farm_owner_profile;

CREATE TRIGGER labor_agency_farm_owner_profile_set_updated_at
    BEFORE UPDATE ON public.labor_agency_farm_owner_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.farm_work_site
    ADD COLUMN IF NOT EXISTS agency_owner_uuid uuid;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.farm_work_site
        WHERE agency_owner_uuid IS NULL
    ) THEN
        RAISE EXCEPTION 'farm_work_site.agency_owner_uuid must be backfilled before setting NOT NULL';
    END IF;
END $$;

ALTER TABLE public.farm_work_site
    ALTER COLUMN agency_owner_uuid SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.farm_work_site'::regclass
            AND conname = 'farm_work_site_agency_owner_uuid_fkey'
    ) THEN
        ALTER TABLE public.farm_work_site
            ADD CONSTRAINT farm_work_site_agency_owner_uuid_fkey
            FOREIGN KEY (agency_owner_uuid)
            REFERENCES public.labor_agency_owner(uuid)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS farm_work_site_agency_owner_uuid_idx
    ON public.farm_work_site(agency_owner_uuid);

CREATE INDEX IF NOT EXISTS farm_work_site_agency_owner_owner_uuid_idx
    ON public.farm_work_site(agency_owner_uuid, owner_uuid);

COMMIT;
