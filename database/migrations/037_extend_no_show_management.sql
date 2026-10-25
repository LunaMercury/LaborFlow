BEGIN;

ALTER TABLE public.worker_no_show_incident
    ALTER COLUMN worker_profile_uuid DROP NOT NULL;

ALTER TABLE public.worker_no_show_incident_revision
    ADD COLUMN note varchar(1000);

ALTER TABLE public.worker_no_show_incident_revision
    DROP CONSTRAINT worker_no_show_incident_revision_action_check,
    ADD CONSTRAINT worker_no_show_incident_revision_action_check
        CHECK (action IN ('CREATED', 'REPLACEMENT_CHANGED', 'CANCELLED', 'NOTE_UPDATED'));

COMMIT;
