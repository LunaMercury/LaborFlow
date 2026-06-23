BEGIN;

ALTER TABLE public.worker
    DROP CONSTRAINT IF EXISTS worker_canonical_nickname_not_blank_check;

ALTER TABLE public.worker
    DROP COLUMN IF EXISTS canonical_nickname;

COMMIT;
