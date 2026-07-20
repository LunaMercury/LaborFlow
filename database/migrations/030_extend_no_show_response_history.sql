BEGIN;

ALTER TABLE public.worker_no_show_incident
    ADD COLUMN IF NOT EXISTS previous_assignment_status varchar(16),
    ADD COLUMN IF NOT EXISTS previous_attendance_data jsonb,
    ADD COLUMN IF NOT EXISTS replacement_assignment_created boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS resolved_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.worker_no_show_incident
SET previous_assignment_status = 'PLANNED'
WHERE previous_assignment_status IS NULL;

ALTER TABLE public.worker_no_show_incident
    ALTER COLUMN previous_assignment_status SET NOT NULL,
    ADD CONSTRAINT worker_no_show_previous_assignment_status_check
        CHECK (previous_assignment_status IN ('PLANNED', 'WORKED', 'ABSENT', 'CANCELLED'));

CREATE TABLE IF NOT EXISTS public.worker_no_show_incident_revision (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_uuid uuid NOT NULL
        REFERENCES public.worker_no_show_incident(uuid) ON DELETE RESTRICT,
    action varchar(24) NOT NULL,
    previous_replacement_worker_profile_uuid uuid
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE SET NULL,
    new_replacement_worker_profile_uuid uuid
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE SET NULL,
    previous_replacement_assignment_uuid uuid
        REFERENCES public.work_schedule_assignment(uuid) ON DELETE SET NULL,
    new_replacement_assignment_uuid uuid
        REFERENCES public.work_schedule_assignment(uuid) ON DELETE SET NULL,
    performed_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT worker_no_show_incident_revision_action_check
        CHECK (action IN ('CREATED', 'REPLACEMENT_CHANGED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS worker_no_show_incident_revision_incident_idx
    ON public.worker_no_show_incident_revision(incident_uuid, created_at DESC);

COMMIT;
