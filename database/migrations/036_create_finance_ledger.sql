BEGIN;

-- pay_term is a planned agreement; attendance_settlement_period groups attendance.
-- Neither is a cash ledger. No old monetary values are imported or repurposed.
CREATE TABLE public.finance_work (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    schedule_day_uuid uuid NOT NULL UNIQUE REFERENCES public.work_schedule_day(uuid) ON DELETE RESTRICT,
    site_uuid uuid NOT NULL REFERENCES public.farm_work_site(uuid) ON DELETE RESTRICT,
    client_uuid uuid NOT NULL REFERENCES public.farm_owner(uuid) ON DELETE RESTRICT,
    client_profile_uuid uuid REFERENCES public.labor_agency_farm_owner_profile(uuid) ON DELETE RESTRICT,
    version bigint NOT NULL CHECK (version >= 1),
    status varchar(16) NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED')),
    work_date date NOT NULL,
    snapshot jsonb NOT NULL,
    ever_confirmed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agency_owner_uuid, uuid)
);
CREATE INDEX finance_work_office_date_idx ON public.finance_work(agency_owner_uuid, work_date);

CREATE TABLE public.finance_work_revision (
    work_uuid uuid NOT NULL REFERENCES public.finance_work(uuid) ON DELETE RESTRICT,
    version bigint NOT NULL CHECK (version >= 1),
    status varchar(16) NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED')),
    reason varchar(1000),
    snapshot jsonb NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    changed_by_account_uuid uuid NOT NULL REFERENCES public.app_account(uuid) ON DELETE RESTRICT,
    PRIMARY KEY (work_uuid, version),
    CHECK (reason IS NULL OR btrim(reason) <> '')
);

CREATE TABLE public.finance_obligation (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    work_uuid uuid NOT NULL,
    kind varchar(16) NOT NULL CHECK (kind IN ('RECEIPT', 'PAYOUT', 'DIRECT')),
    party_key varchar(80) NOT NULL CHECK (btrim(party_key) <> ''),
    party_name varchar(250) NOT NULL,
    assignment_uuid uuid,
    amount numeric(18,0) NOT NULL CHECK (amount BETWEEN 0 AND 999999999999),
    original_due_date date,
    due_date date,
    UNIQUE (agency_owner_uuid, uuid),
    UNIQUE (work_uuid, kind, party_key),
    FOREIGN KEY (agency_owner_uuid, work_uuid) REFERENCES public.finance_work(agency_owner_uuid, uuid) ON DELETE RESTRICT,
    CHECK ((kind = 'RECEIPT' AND assignment_uuid IS NULL) OR (kind <> 'RECEIPT' AND assignment_uuid IS NOT NULL))
);
CREATE INDEX finance_obligation_office_kind_idx ON public.finance_obligation(agency_owner_uuid, kind, due_date);

CREATE TABLE public.finance_cash (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    kind varchar(16) NOT NULL CHECK (kind IN ('RECEIPT', 'PAYOUT', 'DIRECT')),
    party_key varchar(80) NOT NULL CHECK (btrim(party_key) <> ''),
    cash_date date NOT NULL,
    amount numeric(18,0) NOT NULL CHECK (amount BETWEEN 1 AND 999999999999),
    method varchar(16) NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'OTHER')),
    memo varchar(1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by_account_uuid uuid NOT NULL REFERENCES public.app_account(uuid) ON DELETE RESTRICT,
    replaces_cash_uuid uuid,
    UNIQUE (agency_owner_uuid, uuid),
    FOREIGN KEY (agency_owner_uuid, replaces_cash_uuid) REFERENCES public.finance_cash(agency_owner_uuid, uuid) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX finance_cash_single_replacement_idx ON public.finance_cash(replaces_cash_uuid)
    WHERE replaces_cash_uuid IS NOT NULL;
CREATE INDEX finance_cash_office_date_idx ON public.finance_cash(agency_owner_uuid, kind, cash_date);

CREATE TABLE public.finance_cash_allocation (
    agency_owner_uuid uuid NOT NULL,
    cash_uuid uuid NOT NULL,
    obligation_uuid uuid NOT NULL,
    amount numeric(18,0) NOT NULL CHECK (amount BETWEEN 1 AND 999999999999),
    PRIMARY KEY (cash_uuid, obligation_uuid),
    FOREIGN KEY (agency_owner_uuid, cash_uuid) REFERENCES public.finance_cash(agency_owner_uuid, uuid) ON DELETE RESTRICT,
    FOREIGN KEY (agency_owner_uuid, obligation_uuid) REFERENCES public.finance_obligation(agency_owner_uuid, uuid) ON DELETE RESTRICT
);
CREATE INDEX finance_allocation_obligation_idx ON public.finance_cash_allocation(obligation_uuid);

CREATE TABLE public.finance_cash_cancellation (
    cash_uuid uuid PRIMARY KEY,
    agency_owner_uuid uuid NOT NULL,
    reason varchar(1000) NOT NULL CHECK (btrim(reason) <> ''),
    cancelled_at timestamptz NOT NULL DEFAULT now(),
    cancelled_by_account_uuid uuid NOT NULL REFERENCES public.app_account(uuid) ON DELETE RESTRICT,
    FOREIGN KEY (agency_owner_uuid, cash_uuid) REFERENCES public.finance_cash(agency_owner_uuid, uuid) ON DELETE RESTRICT
);

CREATE TABLE public.finance_request (
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    request_id uuid NOT NULL,
    payload_hash char(64) NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agency_owner_uuid, request_id)
);

CREATE TABLE public.finance_settings (
    agency_owner_uuid uuid PRIMARY KEY REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    version bigint NOT NULL CHECK (version >= 1),
    settings jsonb NOT NULL
);
CREATE TABLE public.finance_settings_revision (
    agency_owner_uuid uuid NOT NULL REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    version bigint NOT NULL CHECK (version >= 1),
    settings jsonb NOT NULL,
    reason varchar(1000) NOT NULL CHECK (btrim(reason) <> ''),
    changed_by_account_uuid uuid NOT NULL REFERENCES public.app_account(uuid) ON DELETE RESTRICT,
    changed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agency_owner_uuid, version)
);

CREATE FUNCTION public.finance_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Finance history is immutable; use a reasoned revision or cash cancellation' USING ERRCODE = '23514';
END;
$$;
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['finance_work_revision','finance_cash','finance_cash_allocation',
        'finance_cash_cancellation','finance_request','finance_settings_revision'] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.finance_reject_mutation()', t || '_immutable', t);
    END LOOP;
END;
$$;

-- Acquire the same transaction lock as the service, including direct SQL allocations.
CREATE FUNCTION public.finance_validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c public.finance_cash%ROWTYPE; o public.finance_obligation%ROWTYPE; paid numeric; allocated numeric;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('finance:' || NEW.agency_owner_uuid::text, 0));
    SELECT * INTO c FROM public.finance_cash WHERE uuid = NEW.cash_uuid AND agency_owner_uuid = NEW.agency_owner_uuid;
    SELECT * INTO o FROM public.finance_obligation WHERE uuid = NEW.obligation_uuid AND agency_owner_uuid = NEW.agency_owner_uuid FOR UPDATE;
    IF c.uuid IS NULL OR o.uuid IS NULL OR c.kind <> o.kind OR c.party_key <> o.party_key
        OR EXISTS (SELECT 1 FROM public.finance_cash_cancellation WHERE cash_uuid = c.uuid) THEN
        RAISE EXCEPTION 'Finance allocation target mismatch' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(a.amount), 0) INTO paid FROM public.finance_cash_allocation a
    WHERE a.obligation_uuid = o.uuid AND NOT EXISTS (
        SELECT 1 FROM public.finance_cash_cancellation x WHERE x.cash_uuid = a.cash_uuid);
    IF NEW.amount > o.amount - paid THEN
        RAISE EXCEPTION 'Finance allocation exceeds outstanding amount' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(amount), 0) INTO allocated FROM public.finance_cash_allocation WHERE cash_uuid = c.uuid;
    IF NEW.amount > c.amount - allocated THEN
        RAISE EXCEPTION 'Finance allocations exceed cash amount' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER finance_allocation_validate BEFORE INSERT ON public.finance_cash_allocation
    FOR EACH ROW EXECUTE FUNCTION public.finance_validate_allocation();

CREATE FUNCTION public.finance_cash_fully_allocated() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated numeric;
BEGIN
    SELECT COALESCE(sum(amount),0) INTO allocated FROM public.finance_cash_allocation WHERE cash_uuid = NEW.uuid;
    IF allocated <> NEW.amount THEN
        RAISE EXCEPTION 'Finance cash must be fully allocated' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER finance_cash_allocation_total AFTER INSERT ON public.finance_cash
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finance_cash_fully_allocated();

-- Protect both soft and hard deletion/cancellation. Assignment removal is deliberately
-- not blocked: the stable source comparison requests review without erasing money.
CREATE FUNCTION public.finance_protect_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE protected boolean; office uuid;
BEGIN
    IF TG_TABLE_NAME = 'work_schedule_day' THEN
        SELECT agency_owner_uuid INTO office FROM public.farm_work_site WHERE uuid = OLD.work_site_uuid;
        PERFORM pg_advisory_xact_lock(hashtextextended('finance:' || office::text, 0));
        SELECT EXISTS (SELECT 1 FROM public.finance_work WHERE schedule_day_uuid = OLD.uuid AND ever_confirmed) INTO protected;
    ELSE
        office := OLD.agency_owner_uuid;
        PERFORM pg_advisory_xact_lock(hashtextextended('finance:' || office::text, 0));
        SELECT EXISTS (SELECT 1 FROM public.finance_work WHERE site_uuid = OLD.uuid AND ever_confirmed) INTO protected;
    END IF;
    IF protected THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Confirmed finance source cannot be deleted' USING ERRCODE = '23514';
        END IF;
        IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'Confirmed finance source cannot be cancelled; retain its ledger' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER finance_protect_day BEFORE UPDATE OR DELETE ON public.work_schedule_day
    FOR EACH ROW EXECUTE FUNCTION public.finance_protect_source();
CREATE TRIGGER finance_protect_site BEFORE UPDATE OR DELETE ON public.farm_work_site
    FOR EACH ROW EXECUTE FUNCTION public.finance_protect_source();

COMMIT;
