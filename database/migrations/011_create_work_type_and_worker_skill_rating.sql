BEGIN;

CREATE TABLE IF NOT EXISTS public.work_type (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(80) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT work_type_code_not_blank_check CHECK (btrim(code) <> ''),
    CONSTRAINT work_type_name_not_blank_check CHECK (btrim(name) <> ''),
    CONSTRAINT work_type_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS work_type_code_lower_uidx
    ON public.work_type(lower(code));

CREATE INDEX IF NOT EXISTS work_type_name_idx
    ON public.work_type(name);

DROP TRIGGER IF EXISTS work_type_set_updated_at
    ON public.work_type;

CREATE TRIGGER work_type_set_updated_at
    BEFORE UPDATE ON public.work_type
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.labor_agency_worker_work_skill (
    worker_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE CASCADE,
    work_type_uuid uuid NOT NULL
        REFERENCES public.work_type(uuid) ON DELETE RESTRICT,
    rating smallint NOT NULL DEFAULT 0,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (worker_profile_uuid, work_type_uuid),
    CONSTRAINT labor_agency_worker_work_skill_rating_check CHECK (rating BETWEEN 0 AND 3)
);

CREATE INDEX IF NOT EXISTS labor_agency_worker_work_skill_work_type_idx
    ON public.labor_agency_worker_work_skill(work_type_uuid);

DROP TRIGGER IF EXISTS labor_agency_worker_work_skill_set_updated_at
    ON public.labor_agency_worker_work_skill;

CREATE TRIGGER labor_agency_worker_work_skill_set_updated_at
    BEFORE UPDATE ON public.labor_agency_worker_work_skill
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.work_type (code, name, description)
VALUES
    ('garlic_harvest', '마늘 수확', '마늘을 뽑고 수확하는 작업'),
    ('garlic_sorting', '마늘 선별', '수확한 마늘을 품질과 상태별로 선별하는 작업')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = 'ACTIVE';

COMMIT;
