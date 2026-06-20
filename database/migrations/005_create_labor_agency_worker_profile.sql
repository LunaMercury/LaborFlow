BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'worker'
            AND column_name = 'name'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND table_name = 'worker'
            AND column_name = 'canonical_name'
    ) THEN
        ALTER TABLE public.worker
            RENAME COLUMN name TO canonical_name;
    END IF;
END $$;

ALTER TABLE public.worker
    ADD COLUMN IF NOT EXISTS canonical_name varchar(100),
    ADD COLUMN IF NOT EXISTS canonical_nickname varchar(100);

ALTER TABLE public.worker
    ALTER COLUMN canonical_name DROP NOT NULL,
    ALTER COLUMN age DROP NOT NULL;

ALTER TABLE public.worker
    DROP CONSTRAINT IF EXISTS worker_name_not_blank_check;

ALTER TABLE public.worker
    ADD CONSTRAINT worker_canonical_name_not_blank_check
        CHECK (canonical_name IS NULL OR btrim(canonical_name) <> ''),
    ADD CONSTRAINT worker_canonical_nickname_not_blank_check
        CHECK (canonical_nickname IS NULL OR btrim(canonical_nickname) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS worker_sensitive_profile_phone_hash_uidx
    ON public.worker_sensitive_profile(phone_hash)
    WHERE phone_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.labor_agency_worker_profile (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    worker_uuid uuid NOT NULL REFERENCES public.worker(uuid) ON DELETE RESTRICT,
    local_name varchar(100),
    local_nickname varchar(100),
    local_phone_encrypted text,
    local_phone_hash char(64),
    private_memo text,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT labor_agency_worker_profile_local_name_not_blank_check
        CHECK (local_name IS NULL OR btrim(local_name) <> ''),
    CONSTRAINT labor_agency_worker_profile_local_nickname_not_blank_check
        CHECK (local_nickname IS NULL OR btrim(local_nickname) <> ''),
    CONSTRAINT labor_agency_worker_profile_local_phone_hash_check
        CHECK (local_phone_hash IS NULL OR local_phone_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT labor_agency_worker_profile_status_check
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    CONSTRAINT labor_agency_worker_profile_has_visible_label_check
        CHECK (
            local_name IS NOT NULL
            OR local_nickname IS NOT NULL
            OR local_phone_hash IS NOT NULL
            OR private_memo IS NOT NULL
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_profile_owner_worker_uidx
    ON public.labor_agency_worker_profile(agency_owner_uuid, worker_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_profile_owner_phone_uidx
    ON public.labor_agency_worker_profile(agency_owner_uuid, local_phone_hash)
    WHERE local_phone_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS labor_agency_worker_profile_worker_uuid_idx
    ON public.labor_agency_worker_profile(worker_uuid);

DROP TRIGGER IF EXISTS labor_agency_worker_profile_set_updated_at
    ON public.labor_agency_worker_profile;

CREATE TRIGGER labor_agency_worker_profile_set_updated_at
    BEFORE UPDATE ON public.labor_agency_worker_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
