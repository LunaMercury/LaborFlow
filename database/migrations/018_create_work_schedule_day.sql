BEGIN;

CREATE TABLE IF NOT EXISTS public.work_schedule_day (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_site_uuid uuid NOT NULL
        REFERENCES public.farm_work_site(uuid) ON DELETE CASCADE,
    work_date date NOT NULL,
    daily_start_time time without time zone,
    daily_end_time time without time zone,
    male_required_count smallint NOT NULL DEFAULT 0,
    female_required_count smallint NOT NULL DEFAULT 0,
    memo text,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT work_schedule_day_date_check CHECK (work_date IS NOT NULL),
    CONSTRAINT work_schedule_day_male_required_count_check CHECK (male_required_count BETWEEN 0 AND 10000),
    CONSTRAINT work_schedule_day_female_required_count_check CHECK (female_required_count BETWEEN 0 AND 10000),
    CONSTRAINT work_schedule_day_time_range_check CHECK (daily_end_time IS NULL OR daily_start_time IS NULL OR daily_end_time > daily_start_time),
    CONSTRAINT work_schedule_day_status_check CHECK (status IN ('ACTIVE', 'CANCELLED', 'INACTIVE', 'ARCHIVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_day_site_date_uidx
    ON public.work_schedule_day(work_site_uuid, work_date);

CREATE INDEX IF NOT EXISTS work_schedule_day_date_status_idx
    ON public.work_schedule_day(work_date, status);

CREATE INDEX IF NOT EXISTS work_schedule_day_site_status_idx
    ON public.work_schedule_day(work_site_uuid, status);

DROP TRIGGER IF EXISTS work_schedule_day_set_updated_at
    ON public.work_schedule_day;

CREATE TRIGGER work_schedule_day_set_updated_at
    BEFORE UPDATE ON public.work_schedule_day
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.work_schedule_day (
    work_site_uuid,
    work_date,
    daily_start_time,
    daily_end_time,
    male_required_count,
    female_required_count,
    memo,
    status
)
SELECT
    site.uuid,
    generated_day::date,
    site.daily_start_time,
    site.daily_end_time,
    site.male_required_count,
    site.female_required_count,
    site.memo,
    CASE
        WHEN site.status = 'ACTIVE' THEN 'ACTIVE'
        ELSE 'INACTIVE'
    END
FROM public.farm_work_site site
JOIN LATERAL generate_series(
    site.work_start_date,
    COALESCE(site.work_end_date, site.work_start_date),
    INTERVAL '1 day'
) AS generated_day ON site.work_start_date IS NOT NULL
ON CONFLICT (work_site_uuid, work_date) DO UPDATE
SET daily_start_time = EXCLUDED.daily_start_time,
    daily_end_time = EXCLUDED.daily_end_time,
    male_required_count = EXCLUDED.male_required_count,
    female_required_count = EXCLUDED.female_required_count,
    memo = EXCLUDED.memo,
    status = EXCLUDED.status;

ALTER TABLE public.work_schedule_assignment
    ADD COLUMN IF NOT EXISTS schedule_day_uuid uuid;

UPDATE public.work_schedule_assignment assignment
SET schedule_day_uuid = schedule_day.uuid
FROM public.work_schedule_day schedule_day
WHERE assignment.schedule_day_uuid IS NULL
    AND assignment.work_site_uuid = schedule_day.work_site_uuid
    AND assignment.work_date = schedule_day.work_date;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.work_schedule_assignment'::regclass
            AND conname = 'work_schedule_assignment_schedule_day_uuid_fkey'
    ) THEN
        ALTER TABLE public.work_schedule_assignment
            ADD CONSTRAINT work_schedule_assignment_schedule_day_uuid_fkey
            FOREIGN KEY (schedule_day_uuid)
            REFERENCES public.work_schedule_day(uuid)
            ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.work_schedule_assignment
        WHERE schedule_day_uuid IS NULL
    ) THEN
        RAISE EXCEPTION 'work_schedule_assignment.schedule_day_uuid must be backfilled before setting NOT NULL';
    END IF;
END $$;

ALTER TABLE public.work_schedule_assignment
    ALTER COLUMN schedule_day_uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_assignment_day_worker_uidx
    ON public.work_schedule_assignment(schedule_day_uuid, worker_profile_uuid);

CREATE INDEX IF NOT EXISTS work_schedule_assignment_day_idx
    ON public.work_schedule_assignment(schedule_day_uuid);

COMMIT;
