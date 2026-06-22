BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    test2_account_uuid uuid;
    test2_owner_uuid uuid;
    shared_worker_uuid uuid;
BEGIN
    SELECT labor_agency_owner_uuid
    INTO test2_owner_uuid
    FROM public.app_account
    WHERE login_id = 'test2';

    IF test2_owner_uuid IS NULL THEN
        INSERT INTO public.labor_agency_owner (
            name,
            agency_name
        )
        VALUES (
            'test2',
            'test2 인력사무소'
        )
        RETURNING uuid INTO test2_owner_uuid;
    END IF;

    INSERT INTO public.app_account (
        login_id,
        password_hash,
        display_name,
        labor_agency_owner_uuid,
        must_change_password
    )
    VALUES (
        'test2',
        crypt('test2', gen_salt('bf', 12)),
        'test2',
        test2_owner_uuid,
        true
    )
    ON CONFLICT (login_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        display_name = EXCLUDED.display_name,
        labor_agency_owner_uuid = EXCLUDED.labor_agency_owner_uuid;

    SELECT uuid
    INTO test2_account_uuid
    FROM public.app_account
    WHERE login_id = 'test2';

    INSERT INTO public.app_account_role (
        account_uuid,
        role_code
    )
    VALUES (
        test2_account_uuid,
        'LABOR_AGENCY_OWNER'
    )
    ON CONFLICT DO NOTHING;

    SELECT worker_uuid
    INTO shared_worker_uuid
    FROM public.worker_sensitive_profile
    WHERE phone_hash = encode(digest('01012345678', 'sha256'), 'hex');

    IF shared_worker_uuid IS NULL THEN
        INSERT INTO public.worker (
            canonical_name,
            gender
        )
        VALUES (
            '홍길순',
            'UNKNOWN'
        )
        RETURNING uuid INTO shared_worker_uuid;

        INSERT INTO public.worker_sensitive_profile (
            worker_uuid,
            phone_encrypted,
            phone_hash
        )
        VALUES (
            shared_worker_uuid,
            '010-1234-5678',
            encode(digest('01012345678', 'sha256'), 'hex')
        );
    END IF;

    INSERT INTO public.labor_agency_worker_profile (
        agency_owner_uuid,
        worker_uuid,
        local_name,
        local_phone_encrypted,
        local_phone_hash
    )
    VALUES (
        test2_owner_uuid,
        shared_worker_uuid,
        '홍길순',
        '010-1234-5678',
        encode(digest('01012345678', 'sha256'), 'hex')
    )
    ON CONFLICT (agency_owner_uuid, worker_uuid) DO UPDATE
    SET local_name = EXCLUDED.local_name,
        local_phone_encrypted = EXCLUDED.local_phone_encrypted,
        local_phone_hash = EXCLUDED.local_phone_hash;
END $$;

COMMIT;
