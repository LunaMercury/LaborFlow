BEGIN;

CREATE TABLE IF NOT EXISTS public.labor_agency_farm_owner_site (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_owner_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_farm_owner_profile(uuid) ON DELETE CASCADE,
    site_name varchar(150) NOT NULL,
    farm_address text,
    memo text,
    display_order integer NOT NULL DEFAULT 0,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT labor_agency_farm_owner_site_name_not_blank_check
        CHECK (btrim(site_name) <> ''),
    CONSTRAINT labor_agency_farm_owner_site_address_not_blank_check
        CHECK (farm_address IS NULL OR btrim(farm_address) <> ''),
    CONSTRAINT labor_agency_farm_owner_site_display_order_check
        CHECK (display_order >= 0),
    CONSTRAINT labor_agency_farm_owner_site_status_check
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS labor_agency_farm_owner_site_active_profile_idx
    ON public.labor_agency_farm_owner_site(farm_owner_profile_uuid, display_order, created_at)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_farm_owner_site_active_identity_uidx
    ON public.labor_agency_farm_owner_site(
        farm_owner_profile_uuid,
        lower(site_name),
        lower(COALESCE(farm_address, ''))
    )
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS labor_agency_farm_owner_site_set_updated_at
    ON public.labor_agency_farm_owner_site;

CREATE TRIGGER labor_agency_farm_owner_site_set_updated_at
    BEFORE UPDATE ON public.labor_agency_farm_owner_site
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.labor_agency_farm_owner_site (
    farm_owner_profile_uuid,
    site_name,
    farm_address,
    display_order
)
SELECT DISTINCT ON (
    profile.uuid,
    lower(btrim(site.site_name)),
    lower(btrim(site.farm_address))
)
    profile.uuid,
    btrim(site.site_name),
    btrim(site.farm_address),
    row_number() OVER (
        PARTITION BY profile.uuid
        ORDER BY site.updated_at DESC, site.created_at DESC
    ) - 1
FROM public.farm_work_site site
JOIN public.labor_agency_farm_owner_profile profile
    ON profile.agency_owner_uuid = site.agency_owner_uuid
    AND profile.farm_owner_uuid = site.owner_uuid
    AND profile.status = 'ACTIVE'
    AND profile.deleted_at IS NULL
WHERE site.status = 'ACTIVE'
    AND site.deleted_at IS NULL
    AND site.site_name IS NOT NULL
    AND btrim(site.site_name) <> ''
    AND NOT EXISTS (
        SELECT 1
        FROM public.labor_agency_farm_owner_site existing
        WHERE existing.farm_owner_profile_uuid = profile.uuid
            AND lower(existing.site_name) = lower(btrim(site.site_name))
            AND lower(COALESCE(existing.farm_address, '')) = lower(btrim(site.farm_address))
            AND existing.deleted_at IS NULL
    )
ORDER BY
    profile.uuid,
    lower(btrim(site.site_name)),
    lower(btrim(site.farm_address)),
    site.updated_at DESC,
    site.created_at DESC;

INSERT INTO public.labor_agency_farm_owner_site (
    farm_owner_profile_uuid,
    site_name,
    farm_address,
    display_order
)
SELECT
    profile.uuid,
    btrim(profile.local_business_name),
    recent_site.farm_address,
    COALESCE((
        SELECT max(existing.display_order) + 1
        FROM public.labor_agency_farm_owner_site existing
        WHERE existing.farm_owner_profile_uuid = profile.uuid
            AND existing.deleted_at IS NULL
    ), 0)
FROM public.labor_agency_farm_owner_profile profile
LEFT JOIN LATERAL (
    SELECT btrim(site.farm_address) AS farm_address
    FROM public.farm_work_site site
    WHERE site.agency_owner_uuid = profile.agency_owner_uuid
        AND site.owner_uuid = profile.farm_owner_uuid
        AND site.status = 'ACTIVE'
        AND site.deleted_at IS NULL
    ORDER BY site.updated_at DESC, site.created_at DESC
    LIMIT 1
) recent_site ON true
WHERE profile.status = 'ACTIVE'
    AND profile.deleted_at IS NULL
    AND profile.local_business_name IS NOT NULL
    AND btrim(profile.local_business_name) <> ''
    AND NOT EXISTS (
        SELECT 1
        FROM public.labor_agency_farm_owner_site existing
        WHERE existing.farm_owner_profile_uuid = profile.uuid
            AND lower(existing.site_name) = lower(btrim(profile.local_business_name))
            AND existing.deleted_at IS NULL
    );

ALTER TABLE public.farm_work_site
    ADD COLUMN IF NOT EXISTS client_work_site_uuid uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.farm_work_site'::regclass
            AND conname = 'farm_work_site_client_work_site_uuid_fkey'
    ) THEN
        ALTER TABLE public.farm_work_site
            ADD CONSTRAINT farm_work_site_client_work_site_uuid_fkey
            FOREIGN KEY (client_work_site_uuid)
            REFERENCES public.labor_agency_farm_owner_site(uuid)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS farm_work_site_client_work_site_uuid_idx
    ON public.farm_work_site(client_work_site_uuid)
    WHERE client_work_site_uuid IS NOT NULL;

UPDATE public.farm_work_site schedule_site
SET client_work_site_uuid = client_site.uuid
FROM public.labor_agency_farm_owner_profile profile,
     public.labor_agency_farm_owner_site client_site
WHERE schedule_site.client_work_site_uuid IS NULL
    AND schedule_site.agency_owner_uuid = profile.agency_owner_uuid
    AND schedule_site.owner_uuid = profile.farm_owner_uuid
    AND profile.uuid = client_site.farm_owner_profile_uuid
    AND profile.deleted_at IS NULL
    AND client_site.deleted_at IS NULL
    AND schedule_site.site_name IS NOT NULL
    AND lower(btrim(schedule_site.site_name)) = lower(client_site.site_name)
    AND lower(btrim(schedule_site.farm_address)) = lower(COALESCE(client_site.farm_address, ''));

COMMIT;
