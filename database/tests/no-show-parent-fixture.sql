-- Additional parent surfaces used by the no-show JDBC regression tests only.
ALTER TABLE public.work_schedule_assignment ALTER COLUMN uuid SET DEFAULT gen_random_uuid();
CREATE TABLE public.work_schedule_day_attendance_summary (
    agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    schedule_day_uuid uuid NOT NULL REFERENCES work_schedule_day,
    note text, deleted_at timestamptz,
    PRIMARY KEY(agency_owner_uuid,schedule_day_uuid)
);
CREATE TABLE public.worker_activity_summary (
    agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    worker_profile_uuid uuid NOT NULL REFERENCES labor_agency_worker_profile,
    last_assigned_date date,last_worked_date date,total_work_days integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(agency_owner_uuid,worker_profile_uuid)
);
