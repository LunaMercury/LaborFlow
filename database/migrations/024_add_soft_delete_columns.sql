BEGIN;

ALTER TABLE public.labor_agency_worker_profile
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.labor_agency_worker_payment_profile
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.labor_agency_worker_work_skill
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.labor_agency_worker_team
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.labor_agency_worker_team_member
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.farm_owner
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.labor_agency_farm_owner_profile
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.farm_work_site
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.farm_work_site_work_type
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.work_schedule_day
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.work_schedule_assignment
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DROP INDEX IF EXISTS public.labor_agency_worker_profile_owner_worker_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_profile_owner_worker_uidx
    ON public.labor_agency_worker_profile(agency_owner_uuid, worker_uuid)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.labor_agency_worker_profile_owner_phone_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_profile_owner_phone_uidx
    ON public.labor_agency_worker_profile(agency_owner_uuid, local_phone_hash)
    WHERE local_phone_hash IS NOT NULL
        AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS labor_agency_worker_profile_active_owner_idx
    ON public.labor_agency_worker_profile(agency_owner_uuid, status, created_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS worker_payment_profile_active_worker_idx
    ON public.labor_agency_worker_payment_profile(worker_profile_uuid)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS worker_work_skill_active_profile_idx
    ON public.labor_agency_worker_work_skill(worker_profile_uuid, work_type_uuid)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.labor_agency_worker_team_owner_name_active_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_team_owner_name_active_uidx
    ON public.labor_agency_worker_team(agency_owner_uuid, lower(name))
    WHERE status = 'ACTIVE'
        AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS labor_agency_worker_team_active_owner_idx
    ON public.labor_agency_worker_team(agency_owner_uuid, status, sort_order)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.labor_agency_worker_team_member_one_active_team_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_worker_team_member_one_active_team_uidx
    ON public.labor_agency_worker_team_member(worker_profile_uuid)
    WHERE status = 'ACTIVE'
        AND active_to IS NULL
        AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS labor_agency_worker_team_member_active_team_idx
    ON public.labor_agency_worker_team_member(team_uuid, status, display_order)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.labor_agency_farm_owner_profile_owner_farm_owner_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_farm_owner_profile_owner_farm_owner_uidx
    ON public.labor_agency_farm_owner_profile(agency_owner_uuid, farm_owner_uuid)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.labor_agency_farm_owner_profile_owner_phone_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS labor_agency_farm_owner_profile_owner_phone_uidx
    ON public.labor_agency_farm_owner_profile(agency_owner_uuid, local_phone_hash)
    WHERE local_phone_hash IS NOT NULL
        AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS labor_agency_farm_owner_profile_active_owner_idx
    ON public.labor_agency_farm_owner_profile(agency_owner_uuid, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS farm_work_site_active_agency_idx
    ON public.farm_work_site(agency_owner_uuid, status, work_start_date)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS farm_work_site_work_type_active_site_idx
    ON public.farm_work_site_work_type(work_site_uuid, work_type_uuid)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.work_schedule_day_site_date_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_day_site_date_active_uidx
    ON public.work_schedule_day(work_site_uuid, work_date)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS work_schedule_day_date_active_idx
    ON public.work_schedule_day(work_date, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS work_schedule_day_site_active_idx
    ON public.work_schedule_day(work_site_uuid, status)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.work_schedule_assignment_worker_date_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_assignment_worker_date_uidx
    ON public.work_schedule_assignment(agency_owner_uuid, worker_profile_uuid, work_date)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.work_schedule_assignment_site_worker_date_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_assignment_site_worker_date_uidx
    ON public.work_schedule_assignment(work_site_uuid, worker_profile_uuid, work_date)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.work_schedule_assignment_day_worker_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_assignment_day_worker_uidx
    ON public.work_schedule_assignment(schedule_day_uuid, worker_profile_uuid)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS work_schedule_assignment_active_day_idx
    ON public.work_schedule_assignment(schedule_day_uuid)
    WHERE deleted_at IS NULL;

COMMIT;
