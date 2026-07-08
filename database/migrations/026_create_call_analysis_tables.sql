BEGIN;

CREATE TABLE IF NOT EXISTS public.call_analysis_job (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    source_type varchar(32) NOT NULL,
    source_file_key text,
    original_file_name text,
    source_phone_hash char(64),
    target_type varchar(32) NOT NULL,
    matched_entity_uuid uuid,
    status varchar(24) NOT NULL DEFAULT 'PENDING',
    confidence_score numeric(5, 4),
    error_code varchar(80),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT call_analysis_job_source_type_check
        CHECK (source_type IN ('AUDIO_FILE', 'MOBILE_CALL_RECORD')),
    CONSTRAINT call_analysis_job_target_type_check
        CHECK (target_type IN ('FARM_OWNER', 'WORKER', 'WORK_SCHEDULE')),
    CONSTRAINT call_analysis_job_status_check
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'APPLIED', 'DISCARDED', 'EXPIRED')),
    CONSTRAINT call_analysis_job_phone_hash_check
        CHECK (source_phone_hash IS NULL OR source_phone_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT call_analysis_job_confidence_score_check
        CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS call_analysis_job_agency_status_idx
    ON public.call_analysis_job(agency_owner_uuid, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS call_analysis_job_expiry_idx
    ON public.call_analysis_job(expires_at)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS call_analysis_job_set_updated_at ON public.call_analysis_job;

CREATE TRIGGER call_analysis_job_set_updated_at
    BEFORE UPDATE ON public.call_analysis_job
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.call_analysis_result (
    job_uuid uuid PRIMARY KEY REFERENCES public.call_analysis_job(uuid) ON DELETE CASCADE,
    transcript_encrypted text,
    summary_encrypted text,
    extracted_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    model_name varchar(120),
    analyzed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

DROP TRIGGER IF EXISTS call_analysis_result_set_updated_at ON public.call_analysis_result;

CREATE TRIGGER call_analysis_result_set_updated_at
    BEFORE UPDATE ON public.call_analysis_result
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
