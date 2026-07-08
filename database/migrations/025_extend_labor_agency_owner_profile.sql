BEGIN;

ALTER TABLE public.labor_agency_owner_sensitive_profile
    ADD COLUMN IF NOT EXISTS office_phone_encrypted text,
    ADD COLUMN IF NOT EXISTS office_phone_hash char(64),
    ADD COLUMN IF NOT EXISTS office_address_encrypted text,
    ADD COLUMN IF NOT EXISTS bank_name varchar(80),
    ADD COLUMN IF NOT EXISTS bank_account_holder_name varchar(100);

ALTER TABLE public.app_account
    ADD COLUMN IF NOT EXISTS login_notification_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS schedule_notification_enabled boolean NOT NULL DEFAULT true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'labor_agency_owner_sensitive_office_phone_hash_check'
    ) THEN
        ALTER TABLE public.labor_agency_owner_sensitive_profile
            ADD CONSTRAINT labor_agency_owner_sensitive_office_phone_hash_check
            CHECK (office_phone_hash IS NULL OR office_phone_hash ~ '^[0-9a-f]{64}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'labor_agency_owner_sensitive_bank_name_not_blank_check'
    ) THEN
        ALTER TABLE public.labor_agency_owner_sensitive_profile
            ADD CONSTRAINT labor_agency_owner_sensitive_bank_name_not_blank_check
            CHECK (bank_name IS NULL OR btrim(bank_name) <> '');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'labor_agency_owner_sensitive_bank_holder_not_blank_check'
    ) THEN
        ALTER TABLE public.labor_agency_owner_sensitive_profile
            ADD CONSTRAINT labor_agency_owner_sensitive_bank_holder_not_blank_check
            CHECK (bank_account_holder_name IS NULL OR btrim(bank_account_holder_name) <> '');
    END IF;
END $$;

COMMIT;
