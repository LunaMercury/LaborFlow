BEGIN;

ALTER TABLE public.work_schedule_assignment
    ALTER COLUMN worker_profile_uuid DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS participant_group_uuid uuid NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS participant_type varchar(16) NOT NULL DEFAULT 'REGISTERED',
    ADD COLUMN IF NOT EXISTS participant_display_name varchar(100),
    ADD COLUMN IF NOT EXISTS participant_pickup_location varchar(200),
    ADD COLUMN IF NOT EXISTS introduction_type varchar(16) NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS introduced_by_worker_profile_uuid uuid,
    ADD COLUMN IF NOT EXISTS settlement_recipient_worker_profile_uuid uuid,
    ADD COLUMN IF NOT EXISTS planned_start_time time without time zone,
    ADD COLUMN IF NOT EXISTS planned_end_time time without time zone,
    ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'PLANNED';

ALTER TABLE public.work_schedule_assignment
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_participant_type_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_participant_identity_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_display_name_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_pickup_location_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_introduction_type_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_introduction_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_planned_time_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_status_check,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_introduced_by_fkey,
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_settlement_recipient_fkey;

ALTER TABLE public.work_schedule_assignment
    DROP CONSTRAINT IF EXISTS work_schedule_assignment_worker_profile_uuid_fkey;

ALTER TABLE public.work_schedule_assignment
    ADD CONSTRAINT work_schedule_assignment_participant_type_check
        CHECK (participant_type IN ('REGISTERED', 'GUEST')),
    ADD CONSTRAINT work_schedule_assignment_participant_identity_check
        CHECK (
            (participant_type = 'REGISTERED' AND worker_profile_uuid IS NOT NULL)
            OR (participant_type = 'GUEST' AND worker_profile_uuid IS NULL)
        ),
    ADD CONSTRAINT work_schedule_assignment_display_name_check
        CHECK (participant_display_name IS NULL OR btrim(participant_display_name) <> ''),
    ADD CONSTRAINT work_schedule_assignment_pickup_location_check
        CHECK (participant_pickup_location IS NULL OR btrim(participant_pickup_location) <> ''),
    ADD CONSTRAINT work_schedule_assignment_introduction_type_check
        CHECK (introduction_type IN ('NONE', 'WORKER', 'EXTERNAL', 'UNKNOWN')),
    ADD CONSTRAINT work_schedule_assignment_introduction_check
        CHECK (
            (introduction_type = 'WORKER' AND introduced_by_worker_profile_uuid IS NOT NULL)
            OR (introduction_type <> 'WORKER' AND introduced_by_worker_profile_uuid IS NULL)
        ),
    ADD CONSTRAINT work_schedule_assignment_planned_time_check
        CHECK (
            planned_end_time IS NULL
            OR planned_start_time IS NULL
            OR planned_end_time > planned_start_time
        ),
    ADD CONSTRAINT work_schedule_assignment_status_check
        CHECK (status IN ('PLANNED', 'WORKED', 'ABSENT', 'CANCELLED', 'REPLACED')),
    ADD CONSTRAINT work_schedule_assignment_introduced_by_fkey
        FOREIGN KEY (introduced_by_worker_profile_uuid)
        REFERENCES public.labor_agency_worker_profile(uuid)
        ON DELETE RESTRICT,
    ADD CONSTRAINT work_schedule_assignment_settlement_recipient_fkey
        FOREIGN KEY (settlement_recipient_worker_profile_uuid)
        REFERENCES public.labor_agency_worker_profile(uuid)
        ON DELETE SET NULL,
    ADD CONSTRAINT work_schedule_assignment_worker_profile_uuid_fkey
        FOREIGN KEY (worker_profile_uuid)
        REFERENCES public.labor_agency_worker_profile(uuid)
        ON DELETE RESTRICT;

INSERT INTO public.work_schedule_assignment (
    agency_owner_uuid,
    work_site_uuid,
    worker_profile_uuid,
    work_date,
    assignment_area,
    schedule_day_uuid,
    worker_count,
    participant_group_uuid,
    participant_type,
    participant_display_name,
    participant_pickup_location,
    introduction_type,
    introduced_by_worker_profile_uuid,
    settlement_recipient_worker_profile_uuid,
    planned_start_time,
    planned_end_time,
    status,
    created_at,
    updated_at,
    deleted_at
)
SELECT
    assignment.agency_owner_uuid,
    assignment.work_site_uuid,
    NULL,
    assignment.work_date,
    assignment.assignment_area,
    assignment.schedule_day_uuid,
    1,
    assignment.uuid,
    'GUEST',
    NULL,
    NULL,
    'WORKER',
    assignment.worker_profile_uuid,
    assignment.worker_profile_uuid,
    assignment.planned_start_time,
    assignment.planned_end_time,
    assignment.status,
    assignment.created_at,
    assignment.updated_at,
    assignment.deleted_at
FROM public.work_schedule_assignment assignment
CROSS JOIN LATERAL generate_series(2, assignment.worker_count)
WHERE assignment.participant_type = 'REGISTERED'
    AND assignment.worker_profile_uuid IS NOT NULL
    AND assignment.worker_count > 1;

UPDATE public.work_schedule_assignment
SET worker_count = 1,
    updated_at = now()
WHERE participant_type = 'REGISTERED'
    AND worker_count > 1;

DROP INDEX IF EXISTS public.work_schedule_assignment_worker_date_uidx;
DROP INDEX IF EXISTS public.work_schedule_assignment_site_worker_date_uidx;
DROP INDEX IF EXISTS public.work_schedule_assignment_day_worker_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_assignment_day_worker_uidx
    ON public.work_schedule_assignment(schedule_day_uuid, worker_profile_uuid)
    WHERE participant_type = 'REGISTERED'
        AND worker_profile_uuid IS NOT NULL
        AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS work_schedule_assignment_worker_history_idx
    ON public.work_schedule_assignment(agency_owner_uuid, worker_profile_uuid, work_date DESC)
    WHERE worker_profile_uuid IS NOT NULL
        AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS work_schedule_assignment_guest_day_idx
    ON public.work_schedule_assignment(schedule_day_uuid, created_at)
    WHERE participant_type = 'GUEST'
        AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS work_schedule_assignment_guest_group_idx
    ON public.work_schedule_assignment(agency_owner_uuid, participant_group_uuid, created_at)
    WHERE participant_type = 'GUEST'
        AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.work_schedule_assignment_pay_term (
    assignment_uuid uuid PRIMARY KEY
        REFERENCES public.work_schedule_assignment(uuid) ON DELETE CASCADE,
    rate_type varchar(16) NOT NULL,
    agreed_rate_amount numeric(14, 2) NOT NULL,
    agency_fee_amount numeric(14, 2),
    worker_pay_amount numeric(14, 2),
    currency_code char(3) NOT NULL DEFAULT 'KRW',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT work_schedule_assignment_pay_term_rate_type_check
        CHECK (rate_type IN ('HOURLY', 'DAILY', 'HALF_DAY', 'PIECE')),
    CONSTRAINT work_schedule_assignment_pay_term_amount_check
        CHECK (
            agreed_rate_amount >= 0
            AND (agency_fee_amount IS NULL OR agency_fee_amount >= 0)
            AND (worker_pay_amount IS NULL OR worker_pay_amount >= 0)
        ),
    CONSTRAINT work_schedule_assignment_pay_term_currency_check
        CHECK (currency_code ~ '^[A-Z]{3}$')
);

DROP TRIGGER IF EXISTS work_schedule_assignment_pay_term_set_updated_at
    ON public.work_schedule_assignment_pay_term;

CREATE TRIGGER work_schedule_assignment_pay_term_set_updated_at
    BEFORE UPDATE ON public.work_schedule_assignment_pay_term
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.attendance_settlement_period (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'OPEN',
    confirmed_at timestamptz,
    confirmed_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    paid_at timestamptz,
    locked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT attendance_settlement_period_range_check CHECK (period_end >= period_start),
    CONSTRAINT attendance_settlement_period_status_check
        CHECK (status IN ('OPEN', 'CONFIRMED', 'PAID', 'LOCKED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_settlement_period_owner_range_uidx
    ON public.attendance_settlement_period(agency_owner_uuid, period_start, period_end)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS attendance_settlement_period_set_updated_at
    ON public.attendance_settlement_period;

CREATE TRIGGER attendance_settlement_period_set_updated_at
    BEFORE UPDATE ON public.attendance_settlement_period
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.worker_attendance_record (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    assignment_uuid uuid NOT NULL
        REFERENCES public.work_schedule_assignment(uuid) ON DELETE RESTRICT,
    schedule_day_uuid uuid NOT NULL
        REFERENCES public.work_schedule_day(uuid) ON DELETE RESTRICT,
    worker_profile_uuid uuid
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE SET NULL,
    work_date date NOT NULL,
    actual_start_at timestamptz,
    actual_end_at timestamptz,
    break_minutes integer NOT NULL DEFAULT 0,
    status varchar(16) NOT NULL DEFAULT 'DRAFT',
    time_entry_type varchar(16) NOT NULL DEFAULT 'UNKNOWN',
    confirmed_at timestamptz,
    confirmed_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    settlement_period_uuid uuid
        REFERENCES public.attendance_settlement_period(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT worker_attendance_record_time_check
        CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at > actual_start_at),
    CONSTRAINT worker_attendance_record_break_check CHECK (break_minutes BETWEEN 0 AND 1440),
    CONSTRAINT worker_attendance_record_status_check
        CHECK (status IN ('DRAFT', 'WORKED', 'ABSENT', 'CANCELLED')),
    CONSTRAINT worker_attendance_record_time_entry_type_check
        CHECK (time_entry_type IN ('PLANNED', 'EXACT', 'ESTIMATED', 'UNKNOWN'))
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_attendance_record_assignment_uidx
    ON public.worker_attendance_record(assignment_uuid)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS worker_attendance_record_owner_date_idx
    ON public.worker_attendance_record(agency_owner_uuid, work_date DESC, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS worker_attendance_record_worker_date_idx
    ON public.worker_attendance_record(agency_owner_uuid, worker_profile_uuid, work_date DESC)
    WHERE worker_profile_uuid IS NOT NULL
        AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS worker_attendance_record_set_updated_at
    ON public.worker_attendance_record;

CREATE TRIGGER worker_attendance_record_set_updated_at
    BEFORE UPDATE ON public.worker_attendance_record
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.worker_attendance_revision (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_uuid uuid NOT NULL
        REFERENCES public.worker_attendance_record(uuid) ON DELETE RESTRICT,
    changed_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    change_type varchar(24) NOT NULL,
    before_data jsonb,
    after_data jsonb NOT NULL,
    change_reason text,
    changed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT worker_attendance_revision_change_type_check
        CHECK (change_type IN ('CREATE', 'UPDATE', 'CONFIRM_PLANNED', 'CORRECTION', 'STATUS_CHANGE')),
    CONSTRAINT worker_attendance_revision_reason_check
        CHECK (change_reason IS NULL OR btrim(change_reason) <> '')
);

CREATE INDEX IF NOT EXISTS worker_attendance_revision_attendance_idx
    ON public.worker_attendance_revision(attendance_uuid, changed_at DESC);

CREATE OR REPLACE FUNCTION public.record_worker_attendance_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.worker_attendance_revision (
        attendance_uuid,
        changed_by_account_uuid,
        change_type,
        before_data,
        after_data
    )
    VALUES (
        NEW.uuid,
        NEW.confirmed_by_account_uuid,
        CASE
            WHEN NEW.time_entry_type = 'PLANNED' AND NEW.status = 'WORKED'
                THEN 'CONFIRM_PLANNED'
            WHEN TG_OP = 'INSERT' THEN 'CREATE'
            ELSE 'UPDATE'
        END,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worker_attendance_record_revision_audit
    ON public.worker_attendance_record;

CREATE TRIGGER worker_attendance_record_revision_audit
    AFTER INSERT OR UPDATE ON public.worker_attendance_record
    FOR EACH ROW
    EXECUTE FUNCTION public.record_worker_attendance_revision();

CREATE TABLE IF NOT EXISTS public.worker_activity_summary (
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    worker_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE CASCADE,
    last_assigned_date date,
    last_worked_date date,
    total_work_days integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agency_owner_uuid, worker_profile_uuid),
    CONSTRAINT worker_activity_summary_total_work_days_check CHECK (total_work_days >= 0)
);

CREATE INDEX IF NOT EXISTS worker_activity_summary_recent_work_idx
    ON public.worker_activity_summary(agency_owner_uuid, last_worked_date DESC, worker_profile_uuid);

COMMIT;
