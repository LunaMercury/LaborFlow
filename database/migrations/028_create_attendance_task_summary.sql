BEGIN;

CREATE TABLE IF NOT EXISTS public.work_schedule_day_attendance_summary (
    schedule_day_uuid uuid PRIMARY KEY
        REFERENCES public.work_schedule_day(uuid) ON DELETE CASCADE,
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    note text,
    updated_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT work_schedule_day_attendance_summary_note_check
        CHECK (note IS NULL OR btrim(note) <> '')
);

CREATE INDEX IF NOT EXISTS work_schedule_day_attendance_summary_owner_idx
    ON public.work_schedule_day_attendance_summary(agency_owner_uuid, schedule_day_uuid)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS work_schedule_day_attendance_summary_set_updated_at
    ON public.work_schedule_day_attendance_summary;

CREATE TRIGGER work_schedule_day_attendance_summary_set_updated_at
    BEFORE UPDATE ON public.work_schedule_day_attendance_summary
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.work_schedule_day_attendance_summary_revision (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_day_uuid uuid NOT NULL
        REFERENCES public.work_schedule_day(uuid) ON DELETE RESTRICT,
    changed_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    before_data jsonb,
    after_data jsonb NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_schedule_day_attendance_summary_revision_day_idx
    ON public.work_schedule_day_attendance_summary_revision(schedule_day_uuid, changed_at DESC);

CREATE OR REPLACE FUNCTION public.record_work_schedule_day_attendance_summary_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.work_schedule_day_attendance_summary_revision (
        schedule_day_uuid,
        changed_by_account_uuid,
        before_data,
        after_data
    )
    VALUES (
        NEW.schedule_day_uuid,
        NEW.updated_by_account_uuid,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_schedule_day_attendance_summary_revision_audit
    ON public.work_schedule_day_attendance_summary;

CREATE TRIGGER work_schedule_day_attendance_summary_revision_audit
    AFTER INSERT OR UPDATE ON public.work_schedule_day_attendance_summary
    FOR EACH ROW
    EXECUTE FUNCTION public.record_work_schedule_day_attendance_summary_revision();

COMMIT;
