-- Calendar parent columns used only in the disposable integration database.
ALTER TABLE public.farm_work_site
    ADD COLUMN male_required_count smallint DEFAULT 0,
    ADD COLUMN female_required_count smallint DEFAULT 0,
    ADD COLUMN work_start_date date,
    ADD COLUMN work_end_date date,
    ADD COLUMN memo text;
ALTER TABLE public.work_schedule_day
    ADD COLUMN memo text,
    ALTER COLUMN uuid SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX test_schedule_day_active ON public.work_schedule_day(work_site_uuid, work_date) WHERE deleted_at IS NULL;
