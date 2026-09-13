CREATE TABLE public.sales_journal (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    activity_at timestamptz NOT NULL,
    content text NOT NULL,
    created_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    updated_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT sales_journal_content_not_blank_check CHECK (btrim(content) <> '')
);

CREATE INDEX sales_journal_owner_activity_idx
    ON public.sales_journal (agency_owner_uuid, activity_at DESC, uuid)
    WHERE deleted_at IS NULL;

CREATE TRIGGER sales_journal_set_updated_at
    BEFORE UPDATE ON public.sales_journal
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.work_journal (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    schedule_day_uuid uuid NOT NULL
        REFERENCES public.work_schedule_day(uuid) ON DELETE RESTRICT,
    memo text,
    created_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    updated_by_account_uuid uuid
        REFERENCES public.app_account(uuid) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT work_journal_memo_not_blank_check CHECK (memo IS NULL OR btrim(memo) <> '')
);

CREATE UNIQUE INDEX work_journal_schedule_day_active_uidx
    ON public.work_journal (schedule_day_uuid)
    WHERE deleted_at IS NULL;

CREATE INDEX work_journal_owner_updated_idx
    ON public.work_journal (agency_owner_uuid, updated_at DESC, schedule_day_uuid)
    WHERE deleted_at IS NULL;

CREATE TRIGGER work_journal_set_updated_at
    BEFORE UPDATE ON public.work_journal
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.sales_journal IS
    '여러 지역과 거래처를 함께 기록할 수 있는 사무소별 자유 형식 영업 현장 기록';
COMMENT ON TABLE public.work_journal IS
    '날짜별 작업 일정의 현재 원본 정보를 참조하고 작업 메모만 저장하는 운영 기록';
