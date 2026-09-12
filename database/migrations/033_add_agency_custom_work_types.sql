ALTER TABLE public.work_type
    ADD COLUMN agency_owner_uuid uuid,
    ADD COLUMN created_by_account_uuid uuid;

ALTER TABLE public.work_type
    ADD CONSTRAINT work_type_agency_owner_fk
        FOREIGN KEY (agency_owner_uuid)
        REFERENCES public.labor_agency_owner(uuid)
        ON DELETE RESTRICT,
    ADD CONSTRAINT work_type_created_by_account_fk
        FOREIGN KEY (created_by_account_uuid)
        REFERENCES public.app_account(uuid)
        ON DELETE SET NULL;

CREATE UNIQUE INDEX work_type_active_agency_name_unique
    ON public.work_type (agency_owner_uuid, lower(btrim(name)))
    WHERE agency_owner_uuid IS NOT NULL
        AND status = 'ACTIVE';

CREATE INDEX work_type_agency_status_name_idx
    ON public.work_type (agency_owner_uuid, status, name);

COMMENT ON COLUMN public.work_type.agency_owner_uuid IS
    'NULL이면 시스템 기본 작업, 값이 있으면 해당 인력사무소가 만든 사용자 정의 작업';
COMMENT ON COLUMN public.work_type.created_by_account_uuid IS
    '사용자 정의 작업을 최초 생성한 계정';
