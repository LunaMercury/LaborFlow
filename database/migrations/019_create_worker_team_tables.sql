BEGIN;

CREATE TABLE IF NOT EXISTS public.labor_agency_worker_team (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    leader_worker_profile_uuid uuid
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE SET NULL,
    description text,
    sort_order integer NOT NULL DEFAULT 0,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT labor_agency_worker_team_name_not_blank_check CHECK (btrim(name) <> ''),
    CONSTRAINT labor_agency_worker_team_sort_order_check CHECK (sort_order >= 0),
    CONSTRAINT labor_agency_worker_team_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_team_owner_name_active_uidx
    ON public.labor_agency_worker_team(agency_owner_uuid, lower(name))
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS labor_agency_worker_team_owner_status_idx
    ON public.labor_agency_worker_team(agency_owner_uuid, status, sort_order);

CREATE INDEX IF NOT EXISTS labor_agency_worker_team_leader_idx
    ON public.labor_agency_worker_team(leader_worker_profile_uuid);

DROP TRIGGER IF EXISTS labor_agency_worker_team_set_updated_at
    ON public.labor_agency_worker_team;

CREATE TRIGGER labor_agency_worker_team_set_updated_at
    BEFORE UPDATE ON public.labor_agency_worker_team
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.labor_agency_worker_team_member (
    team_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_team(uuid) ON DELETE CASCADE,
    worker_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE CASCADE,
    role varchar(16) NOT NULL DEFAULT 'MEMBER',
    display_order integer NOT NULL DEFAULT 0,
    active_from date,
    active_to date,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_uuid, worker_profile_uuid),
    CONSTRAINT labor_agency_worker_team_member_role_check CHECK (role IN ('LEADER', 'MEMBER', 'MANAGER')),
    CONSTRAINT labor_agency_worker_team_member_display_order_check CHECK (display_order >= 0),
    CONSTRAINT labor_agency_worker_team_member_date_range_check CHECK (active_to IS NULL OR active_from IS NULL OR active_to >= active_from),
    CONSTRAINT labor_agency_worker_team_member_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_team_member_one_active_team_uidx
    ON public.labor_agency_worker_team_member(worker_profile_uuid)
    WHERE status = 'ACTIVE' AND active_to IS NULL;

CREATE INDEX IF NOT EXISTS labor_agency_worker_team_member_team_status_idx
    ON public.labor_agency_worker_team_member(team_uuid, status, display_order);

CREATE INDEX IF NOT EXISTS labor_agency_worker_team_member_worker_idx
    ON public.labor_agency_worker_team_member(worker_profile_uuid);

DROP TRIGGER IF EXISTS labor_agency_worker_team_member_set_updated_at
    ON public.labor_agency_worker_team_member;

CREATE TRIGGER labor_agency_worker_team_member_set_updated_at
    BEFORE UPDATE ON public.labor_agency_worker_team_member
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DO $$
DECLARE
    test_agency_owner_uuid uuid;
    kim_team_uuid uuid;
    kim_worker_profile_uuid uuid;
    kwon_worker_profile_uuid uuid;
    kim_chulsoo_worker_profile_uuid uuid;
BEGIN
    SELECT labor_agency_owner_uuid
    INTO test_agency_owner_uuid
    FROM public.app_account
    WHERE login_id = 'test'
        AND labor_agency_owner_uuid IS NOT NULL
    LIMIT 1;

    IF test_agency_owner_uuid IS NULL THEN
        RETURN;
    END IF;

    SELECT p.uuid
    INTO kim_worker_profile_uuid
    FROM public.labor_agency_worker_profile p
    LEFT JOIN public.worker w ON w.uuid = p.worker_uuid
    WHERE p.agency_owner_uuid = test_agency_owner_uuid
        AND COALESCE(NULLIF(p.local_name, ''), NULLIF(p.local_nickname, ''), w.canonical_name, '') = '김씨'
    ORDER BY p.created_at
    LIMIT 1;

    SELECT p.uuid
    INTO kwon_worker_profile_uuid
    FROM public.labor_agency_worker_profile p
    LEFT JOIN public.worker w ON w.uuid = p.worker_uuid
    WHERE p.agency_owner_uuid = test_agency_owner_uuid
        AND COALESCE(NULLIF(p.local_name, ''), NULLIF(p.local_nickname, ''), w.canonical_name, '') = '권하늘'
    ORDER BY p.created_at
    LIMIT 1;

    SELECT p.uuid
    INTO kim_chulsoo_worker_profile_uuid
    FROM public.labor_agency_worker_profile p
    LEFT JOIN public.worker w ON w.uuid = p.worker_uuid
    WHERE p.agency_owner_uuid = test_agency_owner_uuid
        AND COALESCE(NULLIF(p.local_name, ''), NULLIF(p.local_nickname, ''), w.canonical_name, '') = '김철수'
    ORDER BY p.created_at
    LIMIT 1;

    IF kim_worker_profile_uuid IS NULL
        OR kwon_worker_profile_uuid IS NULL
        OR kim_chulsoo_worker_profile_uuid IS NULL THEN
        RETURN;
    END IF;

    SELECT uuid
    INTO kim_team_uuid
    FROM public.labor_agency_worker_team
    WHERE agency_owner_uuid = test_agency_owner_uuid
        AND lower(name) = lower('김철수 팀')
        AND status = 'ACTIVE'
    LIMIT 1;

    IF kim_team_uuid IS NULL THEN
        INSERT INTO public.labor_agency_worker_team (
            agency_owner_uuid,
            name,
            leader_worker_profile_uuid,
            description,
            sort_order
        )
        VALUES (
            test_agency_owner_uuid,
            '김철수 팀',
            kim_chulsoo_worker_profile_uuid,
            '항상 함께 이동하는 기본 작업자 팀',
            10
        )
        RETURNING uuid INTO kim_team_uuid;
    ELSE
        UPDATE public.labor_agency_worker_team
        SET leader_worker_profile_uuid = kim_chulsoo_worker_profile_uuid,
            description = '항상 함께 이동하는 기본 작업자 팀'
        WHERE uuid = kim_team_uuid;
    END IF;

    INSERT INTO public.labor_agency_worker_team_member (
        team_uuid,
        worker_profile_uuid,
        role,
        display_order
    )
    VALUES
        (kim_team_uuid, kim_chulsoo_worker_profile_uuid, 'LEADER', 1),
        (kim_team_uuid, kim_worker_profile_uuid, 'MEMBER', 2),
        (kim_team_uuid, kwon_worker_profile_uuid, 'MEMBER', 3)
    ON CONFLICT (team_uuid, worker_profile_uuid) DO UPDATE
    SET role = EXCLUDED.role,
        display_order = EXCLUDED.display_order,
        status = 'ACTIVE',
        active_to = NULL;
END $$;

COMMIT;
