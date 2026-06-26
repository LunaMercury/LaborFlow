BEGIN;

ALTER TABLE public.work_schedule_assignment
    ADD COLUMN IF NOT EXISTS worker_count smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.work_schedule_assignment'::regclass
            AND conname = 'work_schedule_assignment_worker_count_check'
    ) THEN
        ALTER TABLE public.work_schedule_assignment
            ADD CONSTRAINT work_schedule_assignment_worker_count_check
            CHECK (worker_count BETWEEN 1 AND 100);
    END IF;
END $$;

COMMIT;
