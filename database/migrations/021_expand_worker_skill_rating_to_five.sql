BEGIN;

ALTER TABLE public.labor_agency_worker_work_skill
    DROP CONSTRAINT IF EXISTS labor_agency_worker_work_skill_rating_check;

ALTER TABLE public.labor_agency_worker_work_skill
    ADD CONSTRAINT labor_agency_worker_work_skill_rating_check
    CHECK (rating BETWEEN 0 AND 5);

COMMIT;
