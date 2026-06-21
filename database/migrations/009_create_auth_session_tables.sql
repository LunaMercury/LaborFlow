BEGIN;

CREATE TABLE IF NOT EXISTS public.app_auth_session (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_uuid uuid NOT NULL REFERENCES public.app_account(uuid) ON DELETE CASCADE,
    refresh_token_family_uuid uuid NOT NULL,
    refresh_token_hash char(64) NOT NULL UNIQUE,
    previous_refresh_token_hash char(64),
    replaced_by_session_uuid uuid,
    remember_login boolean NOT NULL DEFAULT false,
    issued_at timestamptz NOT NULL DEFAULT now(),
    access_expires_at timestamptz NOT NULL,
    refresh_expires_at timestamptz NOT NULL,
    rotated_at timestamptz,
    revoked_at timestamptz,
    revoke_reason varchar(80),
    ip_address_hash char(64),
    user_agent_hash char(64),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_auth_session_refresh_token_hash_check
        CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT app_auth_session_previous_refresh_token_hash_check
        CHECK (previous_refresh_token_hash IS NULL OR previous_refresh_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT app_auth_session_ip_address_hash_check
        CHECK (ip_address_hash IS NULL OR ip_address_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT app_auth_session_user_agent_hash_check
        CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT app_auth_session_access_expiry_check
        CHECK (access_expires_at > issued_at AND access_expires_at <= issued_at + interval '12 hours'),
    CONSTRAINT app_auth_session_refresh_expiry_check
        CHECK (
            refresh_expires_at > issued_at
            AND (
                (remember_login = true AND refresh_expires_at <= issued_at + interval '30 days')
                OR (remember_login = false AND refresh_expires_at <= issued_at + interval '12 hours')
            )
        ),
    CONSTRAINT app_auth_session_rotation_check
        CHECK (rotated_at IS NULL OR rotated_at >= issued_at),
    CONSTRAINT app_auth_session_revocation_check
        CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
    CONSTRAINT app_auth_session_revoke_reason_check
        CHECK (revoke_reason IS NULL OR btrim(revoke_reason) <> '')
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.app_auth_session'::regclass
            AND conname = 'app_auth_session_replaced_by_session_fkey'
    ) THEN
        ALTER TABLE public.app_auth_session
            ADD CONSTRAINT app_auth_session_replaced_by_session_fkey
            FOREIGN KEY (replaced_by_session_uuid)
            REFERENCES public.app_auth_session(uuid)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_auth_session_account_uuid_idx
    ON public.app_auth_session(account_uuid);

CREATE INDEX IF NOT EXISTS app_auth_session_active_account_idx
    ON public.app_auth_session(account_uuid, refresh_expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS app_auth_session_family_uuid_idx
    ON public.app_auth_session(refresh_token_family_uuid);

DROP TRIGGER IF EXISTS app_auth_session_set_updated_at
    ON public.app_auth_session;

CREATE TRIGGER app_auth_session_set_updated_at
    BEFORE UPDATE ON public.app_auth_session
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMIT;
