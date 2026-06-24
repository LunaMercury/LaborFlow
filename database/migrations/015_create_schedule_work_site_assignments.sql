BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.farm_work_site_work_type (
    work_site_uuid uuid NOT NULL
        REFERENCES public.farm_work_site(uuid) ON DELETE CASCADE,
    work_type_uuid uuid NOT NULL
        REFERENCES public.work_type(uuid) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (work_site_uuid, work_type_uuid)
);

CREATE INDEX IF NOT EXISTS farm_work_site_work_type_work_type_idx
    ON public.farm_work_site_work_type(work_type_uuid);

CREATE TABLE IF NOT EXISTS public.work_schedule_assignment (
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_owner_uuid uuid NOT NULL
        REFERENCES public.labor_agency_owner(uuid) ON DELETE CASCADE,
    work_site_uuid uuid NOT NULL
        REFERENCES public.farm_work_site(uuid) ON DELETE CASCADE,
    worker_profile_uuid uuid NOT NULL
        REFERENCES public.labor_agency_worker_profile(uuid) ON DELETE CASCADE,
    work_date date NOT NULL,
    assignment_area varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT work_schedule_assignment_area_check CHECK (assignment_area IN ('MEN', 'WOMEN'))
);

CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_assignment_worker_date_uidx
    ON public.work_schedule_assignment(agency_owner_uuid, worker_profile_uuid, work_date);

CREATE UNIQUE INDEX IF NOT EXISTS work_schedule_assignment_site_worker_date_uidx
    ON public.work_schedule_assignment(work_site_uuid, worker_profile_uuid, work_date);

CREATE INDEX IF NOT EXISTS work_schedule_assignment_site_date_idx
    ON public.work_schedule_assignment(work_site_uuid, work_date);

DROP TRIGGER IF EXISTS work_schedule_assignment_set_updated_at
    ON public.work_schedule_assignment;

CREATE TRIGGER work_schedule_assignment_set_updated_at
    BEFORE UPDATE ON public.work_schedule_assignment
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.work_type (code, name, description)
VALUES
    ('garlic_harvesting', '마늘 뽑기', '마늘을 뽑고 수확하는 작업'),
    ('garlic_branching', '마늘 삭태 자르기', '마늘 줄기와 삭태를 정리하는 작업'),
    ('garlic_tonbag', '마늘 톤백', '마늘을 톤백 단위로 옮기고 묶는 작업'),
    ('garlic_meshing', '마늘 망작업', '마늘을 망 단위로 포장하는 작업'),
    ('onion_sorting', '양파 선별', '양파를 크기와 상태별로 선별하는 작업'),
    ('onion_meshing', '양파 망작업', '양파를 망 단위로 포장하는 작업'),
    ('onion_harvesting', '양파 뽑기', '양파를 뽑고 수확하는 작업'),
    ('onion_branching', '양파 줄기 정리', '양파 줄기를 정리하는 작업'),
    ('plastic_remove', '비닐 벗기기', '밭 또는 하우스 비닐을 걷는 작업'),
    ('garlic_work', '마늘 작업', '마늘 관련 일반 작업'),
    ('onion_work', '양파 작업', '양파 관련 일반 작업'),
    ('onion_tonbag', '양파 톤백', '양파를 톤백 단위로 옮기는 작업')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = 'ACTIVE';

DO $$
DECLARE
    account_record record;
    owner_uuid_by_name uuid;
    site_uuid_by_key uuid;
BEGIN
    FOR account_record IN
        SELECT login_id, labor_agency_owner_uuid AS agency_owner_uuid
        FROM public.app_account
        WHERE login_id IN ('test', 'test1')
            AND labor_agency_owner_uuid IS NOT NULL
    LOOP
        INSERT INTO public.farm_owner (canonical_name, canonical_business_name)
        SELECT '김농주', '김농주 농장'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.farm_owner WHERE canonical_name = '김농주'
        )
        RETURNING uuid INTO owner_uuid_by_name;

        IF owner_uuid_by_name IS NULL THEN
            SELECT uuid INTO owner_uuid_by_name
            FROM public.farm_owner
            WHERE canonical_name = '김농주'
            ORDER BY created_at
            LIMIT 1;
        END IF;

        INSERT INTO public.labor_agency_farm_owner_profile (
            agency_owner_uuid,
            farm_owner_uuid,
            local_name,
            local_business_name
        )
        VALUES (
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '김농주',
            '김농주 농장'
        )
        ON CONFLICT (agency_owner_uuid, farm_owner_uuid) DO UPDATE
        SET local_name = EXCLUDED.local_name,
            local_business_name = EXCLUDED.local_business_name;

        INSERT INTO public.farm_work_site (
            agency_owner_uuid,
            owner_uuid,
            site_name,
            farm_address,
            male_required_count,
            female_required_count,
            work_description,
            work_start_date,
            work_end_date,
            daily_start_time,
            daily_end_time,
            memo,
            status
        )
        SELECT
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '동문 제1농장',
            '동문리 128',
            5,
            6,
            '마늘 뽑기',
            DATE '2026-06-24',
            DATE '2026-06-24',
            TIME '06:30',
            TIME '15:00',
            '집결 후 밭 입구에서 장갑과 수확망 배부',
            'ACTIVE'
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '마늘 뽑기'
                AND farm_address = '동문리 128'
                AND work_start_date = DATE '2026-06-24'
        )
        RETURNING uuid INTO site_uuid_by_key;

        IF site_uuid_by_key IS NULL THEN
            SELECT uuid INTO site_uuid_by_key
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '마늘 뽑기'
                AND farm_address = '동문리 128'
                AND work_start_date = DATE '2026-06-24'
            LIMIT 1;
        END IF;

        INSERT INTO public.farm_work_site_work_type (work_site_uuid, work_type_uuid)
        SELECT site_uuid_by_key, uuid
        FROM public.work_type
        WHERE code IN ('garlic_harvesting', 'garlic_branching')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.farm_owner (canonical_name, canonical_business_name)
        SELECT '박농주', '박농주 농장'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.farm_owner WHERE canonical_name = '박농주'
        )
        RETURNING uuid INTO owner_uuid_by_name;

        IF owner_uuid_by_name IS NULL THEN
            SELECT uuid INTO owner_uuid_by_name
            FROM public.farm_owner
            WHERE canonical_name = '박농주'
            ORDER BY created_at
            LIMIT 1;
        END IF;

        INSERT INTO public.labor_agency_farm_owner_profile (
            agency_owner_uuid,
            farm_owner_uuid,
            local_name,
            local_business_name
        )
        VALUES (
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '박농주',
            '박농주 농장'
        )
        ON CONFLICT (agency_owner_uuid, farm_owner_uuid) DO UPDATE
        SET local_name = EXCLUDED.local_name,
            local_business_name = EXCLUDED.local_business_name;

        INSERT INTO public.farm_work_site (
            agency_owner_uuid,
            owner_uuid,
            site_name,
            farm_address,
            male_required_count,
            female_required_count,
            work_description,
            work_start_date,
            work_end_date,
            daily_start_time,
            daily_end_time,
            memo,
            status
        )
        SELECT
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '남부 창고',
            '남부로 42',
            4,
            2,
            '마늘 톤백',
            DATE '2026-06-24',
            DATE '2026-06-24',
            TIME '07:00',
            TIME '16:00',
            '지게차 동선 확보, 톤백 묶음 경험자 우선',
            'ACTIVE'
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '마늘 톤백'
                AND farm_address = '남부로 42'
                AND work_start_date = DATE '2026-06-24'
        )
        RETURNING uuid INTO site_uuid_by_key;

        IF site_uuid_by_key IS NULL THEN
            SELECT uuid INTO site_uuid_by_key
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '마늘 톤백'
                AND farm_address = '남부로 42'
                AND work_start_date = DATE '2026-06-24'
            LIMIT 1;
        END IF;

        INSERT INTO public.farm_work_site_work_type (work_site_uuid, work_type_uuid)
        SELECT site_uuid_by_key, uuid
        FROM public.work_type
        WHERE code IN ('garlic_tonbag', 'garlic_meshing')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.farm_owner (canonical_name, canonical_business_name)
        SELECT '이농주', '이농주 농장'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.farm_owner WHERE canonical_name = '이농주'
        )
        RETURNING uuid INTO owner_uuid_by_name;

        IF owner_uuid_by_name IS NULL THEN
            SELECT uuid INTO owner_uuid_by_name
            FROM public.farm_owner
            WHERE canonical_name = '이농주'
            ORDER BY created_at
            LIMIT 1;
        END IF;

        INSERT INTO public.labor_agency_farm_owner_profile (
            agency_owner_uuid,
            farm_owner_uuid,
            local_name,
            local_business_name
        )
        VALUES (
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '이농주',
            '이농주 농장'
        )
        ON CONFLICT (agency_owner_uuid, farm_owner_uuid) DO UPDATE
        SET local_name = EXCLUDED.local_name,
            local_business_name = EXCLUDED.local_business_name;

        INSERT INTO public.farm_work_site (
            agency_owner_uuid,
            owner_uuid,
            site_name,
            farm_address,
            male_required_count,
            female_required_count,
            work_description,
            work_start_date,
            work_end_date,
            daily_start_time,
            daily_end_time,
            memo,
            status
        )
        SELECT
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '중앙 선별장',
            '시장길 9',
            2,
            7,
            '양파 선별',
            DATE '2026-06-24',
            DATE '2026-06-24',
            TIME '08:00',
            TIME '17:00',
            '선별대 2개 운영, 점심 현장 제공',
            'ACTIVE'
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '양파 선별'
                AND farm_address = '시장길 9'
                AND work_start_date = DATE '2026-06-24'
        )
        RETURNING uuid INTO site_uuid_by_key;

        IF site_uuid_by_key IS NULL THEN
            SELECT uuid INTO site_uuid_by_key
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '양파 선별'
                AND farm_address = '시장길 9'
                AND work_start_date = DATE '2026-06-24'
            LIMIT 1;
        END IF;

        INSERT INTO public.farm_work_site_work_type (work_site_uuid, work_type_uuid)
        SELECT site_uuid_by_key, uuid
        FROM public.work_type
        WHERE code IN ('onion_sorting', 'onion_meshing')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.farm_owner (canonical_name, canonical_business_name)
        SELECT '최농주', '최농주 농장'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.farm_owner WHERE canonical_name = '최농주'
        )
        RETURNING uuid INTO owner_uuid_by_name;

        IF owner_uuid_by_name IS NULL THEN
            SELECT uuid INTO owner_uuid_by_name
            FROM public.farm_owner
            WHERE canonical_name = '최농주'
            ORDER BY created_at
            LIMIT 1;
        END IF;

        INSERT INTO public.labor_agency_farm_owner_profile (
            agency_owner_uuid,
            farm_owner_uuid,
            local_name,
            local_business_name
        )
        VALUES (
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '최농주',
            '최농주 농장'
        )
        ON CONFLICT (agency_owner_uuid, farm_owner_uuid) DO UPDATE
        SET local_name = EXCLUDED.local_name,
            local_business_name = EXCLUDED.local_business_name;

        INSERT INTO public.farm_work_site (
            agency_owner_uuid,
            owner_uuid,
            site_name,
            farm_address,
            male_required_count,
            female_required_count,
            work_description,
            work_start_date,
            work_end_date,
            daily_start_time,
            daily_end_time,
            memo,
            status
        )
        SELECT
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '서문 밭',
            '서문리 77',
            6,
            4,
            '양파 뽑기',
            DATE '2026-06-25',
            DATE '2026-06-25',
            TIME '06:00',
            TIME '14:30',
            '오전 작업량 집중, 물통 개인 지참',
            'ACTIVE'
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '양파 뽑기'
                AND farm_address = '서문리 77'
                AND work_start_date = DATE '2026-06-25'
        )
        RETURNING uuid INTO site_uuid_by_key;

        IF site_uuid_by_key IS NULL THEN
            SELECT uuid INTO site_uuid_by_key
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '양파 뽑기'
                AND farm_address = '서문리 77'
                AND work_start_date = DATE '2026-06-25'
            LIMIT 1;
        END IF;

        INSERT INTO public.farm_work_site_work_type (work_site_uuid, work_type_uuid)
        SELECT site_uuid_by_key, uuid
        FROM public.work_type
        WHERE code IN ('onion_harvesting', 'onion_branching')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.farm_owner (canonical_name, canonical_business_name)
        SELECT '정농주', '정농주 농장'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.farm_owner WHERE canonical_name = '정농주'
        )
        RETURNING uuid INTO owner_uuid_by_name;

        IF owner_uuid_by_name IS NULL THEN
            SELECT uuid INTO owner_uuid_by_name
            FROM public.farm_owner
            WHERE canonical_name = '정농주'
            ORDER BY created_at
            LIMIT 1;
        END IF;

        INSERT INTO public.labor_agency_farm_owner_profile (
            agency_owner_uuid,
            farm_owner_uuid,
            local_name,
            local_business_name
        )
        VALUES (
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '정농주',
            '정농주 농장'
        )
        ON CONFLICT (agency_owner_uuid, farm_owner_uuid) DO UPDATE
        SET local_name = EXCLUDED.local_name,
            local_business_name = EXCLUDED.local_business_name;

        INSERT INTO public.farm_work_site (
            agency_owner_uuid,
            owner_uuid,
            site_name,
            farm_address,
            male_required_count,
            female_required_count,
            work_description,
            work_start_date,
            work_end_date,
            daily_start_time,
            daily_end_time,
            memo,
            status
        )
        SELECT
            account_record.agency_owner_uuid,
            owner_uuid_by_name,
            '북문 하우스',
            '북문로 63',
            3,
            3,
            '비닐 벗기기',
            DATE '2026-06-25',
            DATE '2026-06-25',
            TIME '07:30',
            TIME '13:00',
            '작업 후 폐비닐 묶음까지 정리',
            'ACTIVE'
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '비닐 벗기기'
                AND farm_address = '북문로 63'
                AND work_start_date = DATE '2026-06-25'
        )
        RETURNING uuid INTO site_uuid_by_key;

        IF site_uuid_by_key IS NULL THEN
            SELECT uuid INTO site_uuid_by_key
            FROM public.farm_work_site
            WHERE agency_owner_uuid = account_record.agency_owner_uuid
                AND work_description = '비닐 벗기기'
                AND farm_address = '북문로 63'
                AND work_start_date = DATE '2026-06-25'
            LIMIT 1;
        END IF;

        INSERT INTO public.farm_work_site_work_type (work_site_uuid, work_type_uuid)
        SELECT site_uuid_by_key, uuid
        FROM public.work_type
        WHERE code IN ('plastic_remove')
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

COMMIT;
