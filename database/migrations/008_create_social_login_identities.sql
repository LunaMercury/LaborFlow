BEGIN;

ALTER TABLE public.app_account
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.app_account
    DROP CONSTRAINT IF EXISTS app_account_password_hash_not_blank_check,
    DROP CONSTRAINT IF EXISTS app_account_password_hash_bcrypt_check,
    DROP CONSTRAINT IF EXISTS app_account_primary_auth_method_check;

ALTER TABLE public.app_account
    ADD COLUMN IF NOT EXISTS primary_auth_method varchar(24) NOT NULL DEFAULT 'PASSWORD',
    ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

ALTER TABLE public.app_account
    ADD CONSTRAINT app_account_password_hash_not_blank_check
        CHECK (password_hash IS NULL OR btrim(password_hash) <> ''),
    ADD CONSTRAINT app_account_password_hash_bcrypt_check
        CHECK (password_hash IS NULL OR password_hash ~ E'^\\$2[aby]\\$'),
    ADD CONSTRAINT app_account_primary_auth_method_check
        CHECK (primary_auth_method IN ('PASSWORD', 'GOOGLE', 'NAVER', 'KAKAO'));

CREATE TABLE IF NOT EXISTS public.app_identity_provider (
    code varchar(24) PRIMARY KEY,
    name varchar(80) NOT NULL,
    provider_type varchar(24) NOT NULL DEFAULT 'OIDC',
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_identity_provider_code_not_blank_check CHECK (btrim(code) <> ''),
    CONSTRAINT app_identity_provider_name_not_blank_check CHECK (btrim(name) <> ''),
    CONSTRAINT app_identity_provider_type_check CHECK (provider_type IN ('OIDC', 'OAUTH2'))
);

DROP TRIGGER IF EXISTS app_identity_provider_set_updated_at
    ON public.app_identity_provider;

CREATE TRIGGER app_identity_provider_set_updated_at
    BEFORE UPDATE ON public.app_identity_provider
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.app_account_social_identity (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_uuid uuid NOT NULL REFERENCES public.app_account(uuid) ON DELETE CASCADE,
    provider_code varchar(24) NOT NULL REFERENCES public.app_identity_provider(code) ON DELETE RESTRICT,
    provider_subject_hash char(64) NOT NULL,
    provider_subject_encrypted text,
    email_encrypted text,
    email_hash char(64),
    display_name_encrypted text,
    profile_image_url_encrypted text,
    linked_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_account_social_identity_subject_hash_check
        CHECK (provider_subject_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT app_account_social_identity_email_hash_check
        CHECK (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS app_account_social_identity_provider_subject_uidx
    ON public.app_account_social_identity(provider_code, provider_subject_hash);

CREATE UNIQUE INDEX IF NOT EXISTS app_account_social_identity_account_provider_uidx
    ON public.app_account_social_identity(account_uuid, provider_code);

CREATE INDEX IF NOT EXISTS app_account_social_identity_account_uuid_idx
    ON public.app_account_social_identity(account_uuid);

DROP TRIGGER IF EXISTS app_account_social_identity_set_updated_at
    ON public.app_account_social_identity;

CREATE TRIGGER app_account_social_identity_set_updated_at
    BEFORE UPDATE ON public.app_account_social_identity
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_identity_provider (code, name, provider_type, enabled)
VALUES
    ('GOOGLE', 'Google', 'OIDC', true),
    ('NAVER', 'Naver', 'OAUTH2', true),
    ('KAKAO', 'KakaoTalk', 'OAUTH2', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    provider_type = EXCLUDED.provider_type,
    enabled = EXCLUDED.enabled;

COMMIT;
