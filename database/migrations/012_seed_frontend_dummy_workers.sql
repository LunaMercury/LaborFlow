BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    test_owner_uuid uuid;
    worker_uuid_by_phone uuid;
BEGIN
    SELECT labor_agency_owner_uuid
    INTO test_owner_uuid
    FROM public.app_account
    WHERE login_id = 'test';

    IF test_owner_uuid IS NULL THEN
        RAISE EXCEPTION 'test account must have labor_agency_owner_uuid before seeding workers';
    END IF;

    worker_uuid_by_phone := NULL;

    INSERT INTO public.worker (
        canonical_name,
        canonical_nickname,
        gender
    )
    SELECT
        '홍길순',
        '앞산 아줌마',
        'UNKNOWN'
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.worker_sensitive_profile
        WHERE phone_hash = encode(digest('01012345678', 'sha256'), 'hex')
    )
    RETURNING uuid INTO worker_uuid_by_phone;

    IF worker_uuid_by_phone IS NULL THEN
        SELECT worker_uuid
        INTO worker_uuid_by_phone
        FROM public.worker_sensitive_profile
        WHERE phone_hash = encode(digest('01012345678', 'sha256'), 'hex');
    END IF;

    INSERT INTO public.worker_sensitive_profile (
        worker_uuid,
        phone_encrypted,
        phone_hash
    )
    VALUES (
        worker_uuid_by_phone,
        '010-1234-5678',
        encode(digest('01012345678', 'sha256'), 'hex')
    )
    ON CONFLICT (worker_uuid) DO UPDATE
    SET phone_encrypted = EXCLUDED.phone_encrypted,
        phone_hash = EXCLUDED.phone_hash;

    INSERT INTO public.labor_agency_worker_profile (
        agency_owner_uuid,
        worker_uuid,
        local_name,
        local_nickname,
        local_phone_encrypted,
        local_phone_hash,
        pickup_location
    )
    VALUES (
        test_owner_uuid,
        worker_uuid_by_phone,
        '홍길순',
        '앞산 아줌마',
        '010-1234-5678',
        encode(digest('01012345678', 'sha256'), 'hex'),
        '남부 정류장'
    )
    ON CONFLICT (agency_owner_uuid, worker_uuid) DO UPDATE
    SET local_name = EXCLUDED.local_name,
        local_nickname = EXCLUDED.local_nickname,
        local_phone_encrypted = EXCLUDED.local_phone_encrypted,
        local_phone_hash = EXCLUDED.local_phone_hash,
        pickup_location = EXCLUDED.pickup_location;

    worker_uuid_by_phone := NULL;

    INSERT INTO public.worker (
        canonical_name,
        gender
    )
    SELECT
        '김철수',
        'UNKNOWN'
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.worker_sensitive_profile
        WHERE phone_hash = encode(digest('01098765432', 'sha256'), 'hex')
    )
    RETURNING uuid INTO worker_uuid_by_phone;

    IF worker_uuid_by_phone IS NULL THEN
        SELECT worker_uuid
        INTO worker_uuid_by_phone
        FROM public.worker_sensitive_profile
        WHERE phone_hash = encode(digest('01098765432', 'sha256'), 'hex');
    END IF;

    INSERT INTO public.worker_sensitive_profile (
        worker_uuid,
        phone_encrypted,
        phone_hash
    )
    VALUES (
        worker_uuid_by_phone,
        '010-9876-5432',
        encode(digest('01098765432', 'sha256'), 'hex')
    )
    ON CONFLICT (worker_uuid) DO UPDATE
    SET phone_encrypted = EXCLUDED.phone_encrypted,
        phone_hash = EXCLUDED.phone_hash;

    INSERT INTO public.labor_agency_worker_profile (
        agency_owner_uuid,
        worker_uuid,
        local_name,
        local_phone_encrypted,
        local_phone_hash,
        pickup_location
    )
    VALUES (
        test_owner_uuid,
        worker_uuid_by_phone,
        '김철수',
        '010-9876-5432',
        encode(digest('01098765432', 'sha256'), 'hex'),
        '동문 주차장'
    )
    ON CONFLICT (agency_owner_uuid, worker_uuid) DO UPDATE
    SET local_name = EXCLUDED.local_name,
        local_phone_encrypted = EXCLUDED.local_phone_encrypted,
        local_phone_hash = EXCLUDED.local_phone_hash,
        pickup_location = EXCLUDED.pickup_location;

    worker_uuid_by_phone := NULL;

    INSERT INTO public.worker (
        canonical_name,
        gender
    )
    SELECT
        '박영희',
        'UNKNOWN'
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.worker_sensitive_profile
        WHERE phone_hash = encode(digest('01024681357', 'sha256'), 'hex')
    )
    RETURNING uuid INTO worker_uuid_by_phone;

    IF worker_uuid_by_phone IS NULL THEN
        SELECT worker_uuid
        INTO worker_uuid_by_phone
        FROM public.worker_sensitive_profile
        WHERE phone_hash = encode(digest('01024681357', 'sha256'), 'hex');
    END IF;

    INSERT INTO public.worker_sensitive_profile (
        worker_uuid,
        phone_encrypted,
        phone_hash
    )
    VALUES (
        worker_uuid_by_phone,
        '010-2468-1357',
        encode(digest('01024681357', 'sha256'), 'hex')
    )
    ON CONFLICT (worker_uuid) DO UPDATE
    SET phone_encrypted = EXCLUDED.phone_encrypted,
        phone_hash = EXCLUDED.phone_hash;

    INSERT INTO public.labor_agency_worker_profile (
        agency_owner_uuid,
        worker_uuid,
        local_name,
        local_phone_encrypted,
        local_phone_hash,
        pickup_location
    )
    VALUES (
        test_owner_uuid,
        worker_uuid_by_phone,
        '박영희',
        '010-2468-1357',
        encode(digest('01024681357', 'sha256'), 'hex'),
        '중앙시장'
    )
    ON CONFLICT (agency_owner_uuid, worker_uuid) DO UPDATE
    SET local_name = EXCLUDED.local_name,
        local_phone_encrypted = EXCLUDED.local_phone_encrypted,
        local_phone_hash = EXCLUDED.local_phone_hash,
        pickup_location = EXCLUDED.pickup_location;
END $$;

COMMIT;
