BEGIN;

ALTER TABLE public.labor_agency_farm_owner_profile
    ADD CONSTRAINT labor_agency_farm_owner_profile_owner_uuid_unique UNIQUE (agency_owner_uuid, uuid);

CREATE TABLE public.worker_client_assignment_caution (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    worker_profile_uuid uuid NOT NULL,
    client_profile_uuid uuid NOT NULL,
    requested_by varchar(16) NOT NULL,
    memo varchar(500),
    created_by_account_uuid uuid REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    updated_by_account_uuid uuid REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    FOREIGN KEY (agency_owner_uuid, worker_profile_uuid)
        REFERENCES public.labor_agency_worker_profile(agency_owner_uuid, uuid) ON DELETE CASCADE,
    FOREIGN KEY (agency_owner_uuid, client_profile_uuid)
        REFERENCES public.labor_agency_farm_owner_profile(agency_owner_uuid, uuid) ON DELETE CASCADE,
    CHECK (requested_by IN ('CLIENT', 'WORKER', 'BOTH')),
    CHECK (memo IS NULL OR btrim(memo) <> '')
);
CREATE UNIQUE INDEX worker_client_assignment_caution_active_pair_uidx
    ON public.worker_client_assignment_caution(agency_owner_uuid, worker_profile_uuid, client_profile_uuid)
    WHERE deleted_at IS NULL;
CREATE INDEX worker_client_assignment_caution_client_idx
    ON public.worker_client_assignment_caution(agency_owner_uuid, client_profile_uuid)
    WHERE deleted_at IS NULL;
CREATE TRIGGER worker_client_assignment_caution_set_updated_at
    BEFORE UPDATE ON public.worker_client_assignment_caution
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assignment_caution_acknowledgement (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    caution_uuid uuid NOT NULL REFERENCES public.worker_client_assignment_caution(uuid) ON DELETE RESTRICT,
    caution_updated_at timestamptz NOT NULL,
    schedule_day_uuid uuid NOT NULL REFERENCES public.work_schedule_day(uuid) ON DELETE RESTRICT,
    acknowledged_by_account_uuid uuid REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    action varchar(32) NOT NULL CHECK (action IN ('ASSIGNMENT_SAVE', 'NO_SHOW_REPLACEMENT')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignment_caution_acknowledgement_day_idx
    ON public.assignment_caution_acknowledgement(agency_owner_uuid, schedule_day_uuid, created_at DESC);
COMMIT;
