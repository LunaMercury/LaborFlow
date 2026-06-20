BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.worker (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    gender varchar(16) NOT NULL DEFAULT 'UNKNOWN',
    age smallint NOT NULL
);

ALTER TABLE public.worker
    ALTER COLUMN uuid TYPE uuid USING uuid::uuid,
    ALTER COLUMN uuid SET DEFAULT gen_random_uuid(),
    ALTER COLUMN name TYPE varchar(100),
    ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.worker
    ADD COLUMN IF NOT EXISTS gender varchar(16);

UPDATE public.worker
SET gender = 'UNKNOWN'
WHERE gender IS NULL;

ALTER TABLE public.worker
    ALTER COLUMN gender SET DEFAULT 'UNKNOWN',
    ALTER COLUMN gender SET NOT NULL;

ALTER TABLE public.worker
    ADD COLUMN IF NOT EXISTS age smallint;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.worker WHERE age IS NULL) THEN
        RAISE EXCEPTION 'worker.age must be backfilled before setting NOT NULL';
    END IF;
END $$;

ALTER TABLE public.worker
    ALTER COLUMN age SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.worker'::regclass AND conname = 'worker_pk'
    ) THEN
        ALTER TABLE public.worker
            ADD CONSTRAINT worker_pk PRIMARY KEY (uuid);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.worker'::regclass AND conname = 'worker_name_not_blank_check'
    ) THEN
        ALTER TABLE public.worker
            ADD CONSTRAINT worker_name_not_blank_check CHECK (btrim(name) <> '');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.worker'::regclass AND conname = 'worker_gender_check'
    ) THEN
        ALTER TABLE public.worker
            ADD CONSTRAINT worker_gender_check CHECK (gender IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.worker'::regclass AND conname = 'worker_age_check'
    ) THEN
        ALTER TABLE public.worker
            ADD CONSTRAINT worker_age_check CHECK (age BETWEEN 0 AND 150);
    END IF;
END $$;

COMMIT;
