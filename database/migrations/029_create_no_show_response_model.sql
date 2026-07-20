BEGIN;

CREATE TABLE IF NOT EXISTS public.worker_risk_flag (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    worker_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE RESTRICT,
    risk_type varchar(24) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    source varchar(16) NOT NULL DEFAULT 'MANUAL',
    reason text,
    created_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    cleared_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    cleared_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT worker_risk_flag_type_check
        CHECK (risk_type IN ('NO_SHOW')),
    CONSTRAINT worker_risk_flag_status_check
        CHECK (status IN ('ACTIVE', 'CLEARED')),
    CONSTRAINT worker_risk_flag_source_check
        CHECK (source IN ('MANUAL', 'AUTOMATED')),
    CONSTRAINT worker_risk_flag_reason_check
        CHECK (reason IS NULL OR btrim(reason) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_risk_flag_active_uidx
    ON public.worker_risk_flag(agency_owner_uuid, worker_profile_uuid, risk_type)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS worker_risk_flag_worker_history_idx
    ON public.worker_risk_flag(agency_owner_uuid, worker_profile_uuid, created_at DESC);

DROP TRIGGER IF EXISTS worker_risk_flag_set_updated_at
    ON public.worker_risk_flag;

CREATE TRIGGER worker_risk_flag_set_updated_at
    BEFORE UPDATE ON public.worker_risk_flag
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.worker_no_show_incident (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    worker_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE RESTRICT,
    original_assignment_uuid uuid NOT NULL
        REFERENCES public.work_schedule_assignment(uuid) ON DELETE RESTRICT,
    replacement_worker_profile_uuid uuid
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE SET NULL,
    replacement_assignment_uuid uuid
        REFERENCES public.work_schedule_assignment(uuid) ON DELETE SET NULL,
    occurred_on date NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'OPEN',
    note text,
    reported_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT worker_no_show_incident_status_check
        CHECK (status IN ('OPEN', 'REPLACED', 'CANCELLED')),
    CONSTRAINT worker_no_show_incident_note_check
        CHECK (note IS NULL OR btrim(note) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_no_show_incident_assignment_uidx
    ON public.worker_no_show_incident(original_assignment_uuid)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS worker_no_show_incident_worker_history_idx
    ON public.worker_no_show_incident(agency_owner_uuid, worker_profile_uuid, occurred_on DESC)
    WHERE deleted_at IS NULL AND status <> 'CANCELLED';

DROP TRIGGER IF EXISTS worker_no_show_incident_set_updated_at
    ON public.worker_no_show_incident;

CREATE TRIGGER worker_no_show_incident_set_updated_at
    BEFORE UPDATE ON public.worker_no_show_incident
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
