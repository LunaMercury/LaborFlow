BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_role (
    code varchar(40) PRIMARY KEY,
    name varchar(100) NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_role_code_not_blank_check CHECK (btrim(code) <> ''),
    CONSTRAINT app_role_name_not_blank_check CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS public.app_account (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    login_id varchar(80) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    display_name varchar(100),
    labor_agency_owner_uuid uuid REFERENCES public.labor_agency_owner(uuid) ON DELETE RESTRICT,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE',
    must_change_password boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_account_login_id_not_blank_check CHECK (btrim(login_id) <> ''),
    CONSTRAINT app_account_password_hash_not_blank_check CHECK (btrim(password_hash) <> ''),
    CONSTRAINT app_account_password_hash_bcrypt_check CHECK (password_hash ~ E'^\\$2[aby]\\$'),
    CONSTRAINT app_account_display_name_not_blank_check CHECK (display_name IS NULL OR btrim(display_name) <> ''),
    CONSTRAINT app_account_status_check CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED', 'ARCHIVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_account_login_id_lower_uidx
    ON public.app_account(lower(login_id));

CREATE INDEX IF NOT EXISTS app_account_labor_agency_owner_uuid_idx
    ON public.app_account(labor_agency_owner_uuid)
    WHERE labor_agency_owner_uuid IS NOT NULL;

DROP TRIGGER IF EXISTS app_account_set_updated_at ON public.app_account;

CREATE TRIGGER app_account_set_updated_at
    BEFORE UPDATE ON public.app_account
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.app_account_role (
    account_uuid uuid NOT NULL REFERENCES public.app_account(uuid) ON DELETE CASCADE,
    role_code varchar(40) NOT NULL REFERENCES public.app_role(code) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_uuid, role_code)
);

INSERT INTO public.app_role (code, name, description)
VALUES
    ('ADMIN', 'Administrator', 'Full administrative access.'),
    ('LABOR_AGENCY_OWNER', 'Labor agency owner', 'Labor agency owner access.')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

DO $$
DECLARE
    admin_account_uuid uuid;
    test_account_uuid uuid;
    test_owner_uuid uuid;
BEGIN
    INSERT INTO public.app_account (
        login_id,
        password_hash,
        display_name,
        must_change_password
    )
    VALUES (
        'admin',
        crypt('admin', gen_salt('bf', 12)),
        'Admin',
        true
    )
    ON CONFLICT (login_id) DO NOTHING;

    SELECT uuid
    INTO admin_account_uuid
    FROM public.app_account
    WHERE login_id = 'admin';

    INSERT INTO public.app_account_role (account_uuid, role_code)
    VALUES (admin_account_uuid, 'ADMIN')
    ON CONFLICT DO NOTHING;

    SELECT labor_agency_owner_uuid
    INTO test_owner_uuid
    FROM public.app_account
    WHERE login_id = 'test';

    IF test_owner_uuid IS NULL THEN
        INSERT INTO public.labor_agency_owner (
            name,
            agency_name
        )
        VALUES (
            'test',
            '테스트 인력사무소'
        )
        RETURNING uuid INTO test_owner_uuid;
    END IF;

    INSERT INTO public.app_account (
        login_id,
        password_hash,
        display_name,
        labor_agency_owner_uuid,
        must_change_password
    )
    VALUES (
        'test',
        crypt('test', gen_salt('bf', 12)),
        'test',
        test_owner_uuid,
        true
    )
    ON CONFLICT (login_id) DO NOTHING;

    SELECT uuid
    INTO test_account_uuid
    FROM public.app_account
    WHERE login_id = 'test';

    INSERT INTO public.app_account_role (account_uuid, role_code)
    VALUES (test_account_uuid, 'LABOR_AGENCY_OWNER')
    ON CONFLICT DO NOTHING;
END $$;

COMMIT;
