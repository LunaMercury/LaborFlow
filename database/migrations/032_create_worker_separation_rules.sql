BEGIN;

ALTER TABLE public.labor_agency_worker_profile
    ADD CONSTRAINT labor_agency_worker_profile_owner_uuid_unique
    UNIQUE (agency_owner_uuid, uuid);

CREATE TABLE public.labor_agency_worker_separation_rule (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    worker_profile_uuid_a uuid NOT NULL,
    worker_profile_uuid_b uuid NOT NULL,
    reason varchar(500),
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT labor_agency_worker_separation_rule_worker_a_fkey
        FOREIGN KEY (agency_owner_uuid, worker_profile_uuid_a)
        REFERENCES public.labor_agency_worker_profile(agency_owner_uuid, uuid)
        ON DELETE CASCADE,
    CONSTRAINT labor_agency_worker_separation_rule_worker_b_fkey
        FOREIGN KEY (agency_owner_uuid, worker_profile_uuid_b)
        REFERENCES public.labor_agency_worker_profile(agency_owner_uuid, uuid)
        ON DELETE CASCADE,
    CONSTRAINT labor_agency_worker_separation_rule_pair_order_check
        CHECK (worker_profile_uuid_a < worker_profile_uuid_b),
    CONSTRAINT labor_agency_worker_separation_rule_reason_check
        CHECK (reason IS NULL OR btrim(reason) <> ''),
    CONSTRAINT labor_agency_worker_separation_rule_status_check
        CHECK (status IN ('ACTIVE', 'ARCHIVED'))
);

CREATE UNIQUE INDEX labor_agency_worker_separation_rule_active_pair_uidx
    ON public.labor_agency_worker_separation_rule(
        agency_owner_uuid,
        worker_profile_uuid_a,
        worker_profile_uuid_b
    )
    WHERE deleted_at IS NULL;

CREATE INDEX labor_agency_worker_separation_rule_worker_a_idx
    ON public.labor_agency_worker_separation_rule(agency_owner_uuid, worker_profile_uuid_a)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE INDEX labor_agency_worker_separation_rule_worker_b_idx
    ON public.labor_agency_worker_separation_rule(agency_owner_uuid, worker_profile_uuid_b)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE TRIGGER labor_agency_worker_separation_rule_set_updated_at
    BEFORE UPDATE ON public.labor_agency_worker_separation_rule
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.worker_separation_override_audit (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    separation_rule_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_separation_rule(uuid) ON DELETE RESTRICT,
    schedule_day_uuid uuid NOT NULL
        REFERENCES public.work_schedule_day(uuid) ON DELETE RESTRICT,
    acknowledged_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    action varchar(32) NOT NULL DEFAULT 'ASSIGNMENT_SAVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT worker_separation_override_audit_action_check
        CHECK (action IN ('ASSIGNMENT_SAVE'))
);

CREATE INDEX worker_separation_override_audit_day_idx
    ON public.worker_separation_override_audit(agency_owner_uuid, schedule_day_uuid, created_at DESC);

CREATE INDEX worker_separation_override_audit_rule_idx
    ON public.worker_separation_override_audit(separation_rule_uuid, created_at DESC);

COMMIT;
